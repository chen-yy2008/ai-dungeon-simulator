# Integration tests use disposable LOCAL bare repositories, never a public release.
# Run with Windows PowerShell 5.1; production script has no test-only bypass switches.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot = Join-Path $root ('test-output\publish-' + [guid]::NewGuid().ToString('N'))
if (-not $fixtureRoot.StartsWith((Join-Path $root 'test-output') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid fixture root' }
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$realGit = (Get-Command git -CommandType Application | Select-Object -First 1).Source
$shell = (Get-Command powershell -CommandType Application | Select-Object -First 1).Source
$manifest = Get-Content (Join-Path $root 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$releaseTag = 'v' + $manifest.version
$cases = 0

function Git-Check {
    param([string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; $result = @(& $realGit @Arguments 2>&1); $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previousPreference }
    if ($code -ne 0) { throw ('Fixture git failed: ' + ($Arguments -join ' ')) }
    return ($result | ForEach-Object { $_.ToString() }) -join "`n"
}
function Fixture {
    param([string]$Name, [switch]$NoRepository)
    $folder = Join-Path $fixtureRoot $Name
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    foreach ($file in $manifest.files) {
        $destination = Join-Path $folder $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $root $file) -Destination $destination
    }
    New-Item -ItemType Directory -Path (Join-Path $folder '.tools') -Force | Out-Null
    $driver = @'
param([string]$Version, [switch]$DryRun, [switch]$Resume, [switch]$FailPush, [switch]$FailAuth)
$realGit = (Get-Command git -CommandType Application | Select-Object -First 1).Source
function git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    if (($GitArgs -join ' ') -match 'config --get remote.origin.url$') {
        $global:LASTEXITCODE = 0
        return 'https://github.com/release-fixture/ai-dungeon-simulator.git'
    }
    if (($FailPush -and $GitArgs -contains 'push') -or ($FailAuth -and $GitArgs -contains 'ls-remote')) {
        $global:LASTEXITCODE = 1
        return 'Injected fixture transport failure'
    }
    & $realGit @GitArgs
    $global:LASTEXITCODE = $LASTEXITCODE
}
& (Join-Path $PSScriptRoot '..\scripts\publish.ps1') -Version $Version -DryRun:$DryRun -Resume:$Resume
exit $LASTEXITCODE
'@
    [IO.File]::WriteAllText((Join-Path $folder '.tools\driver.ps1'), $driver, (New-Object Text.UTF8Encoding($false)))
    if (-not $NoRepository) {
        Git-Check -Arguments @('init', '--initial-branch=main', $folder) | Out-Null
        Git-Check -Arguments @('-C', $folder, 'config', 'user.name', 'Release Fixture') | Out-Null
        Git-Check -Arguments @('-C', $folder, 'config', 'user.email', 'fixture@example.invalid') | Out-Null
        $bare = $folder + '-remote.git'
        Git-Check -Arguments @('init', '--bare', '--initial-branch=main', $bare) | Out-Null
        Git-Check -Arguments @('-C', $folder, 'remote', 'add', 'origin', $bare) | Out-Null
    }
    return $folder
}
function Publish-Check {
    param([string]$Folder, [int]$Expected = 1, [string[]]$Extra = @(), [string]$Version = $releaseTag)
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Folder '.tools\driver.ps1'), '-Version', $Version) + $Extra
    $previousPreference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; $result = @(& $shell @arguments 2>&1); $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previousPreference }
    if ($code -ne $Expected) {
        $result | ForEach-Object { Write-Output $_.ToString() }
        throw "Unexpected publication result: exit $code, expected $Expected"
    }
    $script:cases++
}
function Assert-NoCommit {
    param([string]$Folder)
    $previousPreference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; & $realGit -C $Folder rev-parse --verify HEAD 2>$null | Out-Null; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previousPreference }
    if ($code -eq 0) { throw 'Failure/dry run unexpectedly created a commit' }
    if (Git-Check -Arguments @('-C', $Folder, 'tag', '--list')) { throw 'Failure/dry run unexpectedly created a tag' }
}

$none = Fixture -Name 'not-a-repository' -NoRepository
Publish-Check -Folder $none -Extra @('-DryRun')
$badVersion = Fixture -Name 'version'
Publish-Check -Folder $badVersion -Version 'v9.9.9' -Extra @('-DryRun'); Assert-NoCommit $badVersion
$auth = Fixture -Name 'auth'
Publish-Check -Folder $auth -Extra @('-DryRun', '-FailAuth'); Assert-NoCommit $auth
$unknown = Fixture -Name 'unknown'
Set-Content -LiteralPath (Join-Path $unknown 'unreviewed.txt') -Value 'Unrelated local notes'
Publish-Check -Folder $unknown -Extra @('-DryRun'); Assert-NoCommit $unknown
$secret = Fixture -Name 'secret'
Add-Content -LiteralPath (Join-Path $secret 'world.js') -Value ('// gh' + 'p_' + ('A' * 36))
Publish-Check -Folder $secret -Extra @('-DryRun'); Assert-NoCommit $secret
$failedTest = Fixture -Name 'test-failure'
Add-Content -LiteralPath (Join-Path $failedTest 'tests\check.cjs') -Value 'process.exit(2);'
Publish-Check -Folder $failedTest -Extra @('-DryRun'); Assert-NoCommit $failedTest

$history = Fixture -Name 'history'
$cookie = Join-Path $history 'test-output\browser-profile\Default\Cookies'
New-Item -ItemType Directory -Path (Split-Path -Parent $cookie) -Force | Out-Null
Set-Content -LiteralPath $cookie -Value 'Synthetic test data, not a real credential'
Git-Check -Arguments @('-C', $history, 'add', '-f', '--', 'test-output/browser-profile/Default/Cookies') | Out-Null
Git-Check -Arguments @('-C', $history, 'commit', '-m', 'fixture: historical generated file') | Out-Null
Git-Check -Arguments @('-C', $history, 'rm', '--cached', '--', 'test-output/browser-profile/Default/Cookies') | Out-Null
Git-Check -Arguments @('-C', $history, 'commit', '-m', 'fixture: stop tracking generated file') | Out-Null
Publish-Check -Folder $history -Extra @('-DryRun')
if ((Git-Check -Arguments @('-C', $history, 'rev-list', '--count', 'HEAD')) -ne '2') { throw 'History was altered' }

$success = Fixture -Name 'success'
Publish-Check -Folder $success -Expected 0 -Extra @('-DryRun'); Assert-NoCommit $success
Publish-Check -Folder $success -Expected 0
$head = Git-Check -Arguments @('-C', $success, 'rev-parse', 'HEAD')
if ((Git-Check -Arguments @('-C', $success, 'rev-parse', ($releaseTag + '^{commit}'))) -ne $head) { throw 'Tag does not point to release commit' }
if ((Git-Check -Arguments @('--git-dir', ($success + '-remote.git'), 'rev-parse', 'main')) -ne $head) { throw 'Local bare remote did not receive release' }
Publish-Check -Folder $success
if ((Git-Check -Arguments @('-C', $success, 'rev-list', '--count', 'HEAD')) -ne '1') { throw 'Duplicate version created another commit' }

$retry = Fixture -Name 'retry'
Publish-Check -Folder $retry -Extra @('-FailPush')
$retryHead = Git-Check -Arguments @('-C', $retry, 'rev-parse', 'HEAD')
if ((Git-Check -Arguments @('-C', $retry, 'rev-parse', ($releaseTag + '^{commit}'))) -ne $retryHead) { throw 'Failed push did not preserve local tag' }
Publish-Check -Folder $retry -Expected 0 -Extra @('-Resume')
if ((Git-Check -Arguments @('-C', $retry, 'rev-list', '--count', 'HEAD')) -ne '1') { throw 'Resume created a duplicate commit' }

$other = Join-Path $fixtureRoot 'other-writer'
Git-Check -Arguments @('clone', ($success + '-remote.git'), $other) | Out-Null
Git-Check -Arguments @('-C', $other, 'config', 'user.name', 'Other Fixture') | Out-Null
Git-Check -Arguments @('-C', $other, 'config', 'user.email', 'other@example.invalid') | Out-Null
Add-Content -LiteralPath (Join-Path $other 'README.md') -Value 'Synthetic remote-ahead fixture.'
Git-Check -Arguments @('-C', $other, 'add', '--', 'README.md') | Out-Null
Git-Check -Arguments @('-C', $other, 'commit', '-m', 'fixture: remote advances') | Out-Null
Git-Check -Arguments @('-C', $other, 'push', 'origin', 'main') | Out-Null
Publish-Check -Folder $success -Extra @('-DryRun')
if ((Git-Check -Arguments @('-C', $success, 'rev-parse', 'HEAD')) -ne $head) { throw 'Remote conflict rewrote local history' }
Write-Output "Publisher checks passed: $cases cases in Windows PowerShell 5.1; only local disposable remotes used."
