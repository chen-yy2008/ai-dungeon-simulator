# Compatible with Windows PowerShell 5.1 and PowerShell 7. No global settings changed.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Summary = 'Formal release',
    [switch]$DryRun,
    [switch]$Resume
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$previousLocation = Get-Location
$previousPrompt = $env:GIT_TERMINAL_PROMPT
$previousInteractive = $env:GCM_INTERACTIVE
$previousEncoding = [Console]::OutputEncoding
$previousOutputEncoding = $OutputEncoding
$phase = 'preflight'

function Invoke-Git {
    param([string[]]$Arguments, [switch]$AllowFailure)
    $previousPreference = $ErrorActionPreference
    $errorDirectory = Join-Path $projectRoot 'test-output\git-stderr'
    New-Item -ItemType Directory -Path $errorDirectory -Force | Out-Null
    $errorFile = Join-Path $errorDirectory ([guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $ErrorActionPreference = 'Continue'
        # Keep harmless CRLF/fetch warnings separate from data returned to guards.
        $result = @(& git -c ("safe.directory=" + $projectRoot.Replace('\', '/')) -C $projectRoot @Arguments 2> $errorFile)
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
        Remove-Item -LiteralPath $errorFile -ErrorAction SilentlyContinue
    }
    if ($code -ne 0 -and -not $AllowFailure) {
        # Do not echo credentials or remote error bodies into chat/logs.
        throw "Git $($Arguments[0]) failed (exit $code) during $phase. Check authentication, network, or remote history. No force/rewrite attempted."
    }
    return ($result | ForEach-Object { $_.ToString() }) -join "`n"
}
function Run-Node {
    param([string[]]$Arguments)
    & node @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Required Node check failed: $($Arguments -join ' '). Publication stopped." }
}
function Remote-Refs {
    $result = @{}
    $raw = Invoke-Git -Arguments @('ls-remote', 'origin')
    foreach ($line in ($raw -split "`n")) {
        if ($line -match '^([a-f0-9]{40,64})\s+(.+)$') { $result[$matches[2]] = $matches[1] }
    }
    return $result
}
function File-Snapshot {
    $items = foreach ($file in $manifest.files) {
        if (Test-Path -LiteralPath $file) { $file + ':' + (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash }
        else { $file + ':DELETED' }
    }
    return $items -join "`n"
}

try {
    Set-Location -LiteralPath $projectRoot
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'Never'
    foreach ($tool in @('git', 'node')) { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Required command missing: $tool" } }
    $top = Invoke-Git -Arguments @('rev-parse', '--show-toplevel')
    if ([System.IO.Path]::GetFullPath($top).TrimEnd('\', '/') -ne $projectRoot) { throw 'This script must belong to the exact project Git root, not a parent repository.' }
    $manifest = Get-Content -LiteralPath 'release.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    $plainVersion = $Version -replace '^v', ''
    if ($plainVersion -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$' -or $plainVersion -ne $manifest.version) { throw 'Version must be X.Y.Z / vX.Y.Z and match release.json.' }
    $tag = 'v' + $plainVersion
    $branch = Invoke-Git -Arguments @('branch', '--show-current')
    if (-not $branch -or $branch -ne $manifest.branch) { throw "Publish only from the configured branch: $($manifest.branch). Detached/other branches are rejected." }
    foreach ($key in @('user.name', 'user.email')) { if (-not (Invoke-Git -Arguments @('config', '--get', $key) -AllowFailure)) { throw "Missing Git identity: $key" } }
    $remote = Invoke-Git -Arguments @('config', '--get', 'remote.origin.url')
    if ($remote -notmatch '^(https://github\.com/|git@github\.com:)([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?$') { throw 'origin must be a GitHub URL without embedded credentials.' }
    $repositoryUrl = 'https://github.com/' + $matches[2] + '/' + $matches[3]
    if (Invoke-Git -Arguments @('diff', '--name-only', '--diff-filter=U')) { throw 'Unresolved merge conflicts. Publication stopped.' }
    foreach ($operation in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply')) {
        $operationPath = Invoke-Git -Arguments @('rev-parse', '--git-path', $operation)
        if (Test-Path -LiteralPath $operationPath) { throw "Git operation in progress: $operation" }
    }
    $head = Invoke-Git -Arguments @('rev-parse', '--verify', 'HEAD') -AllowFailure
    if ($head -notmatch '^[a-f0-9]{40,64}$') { $head = '' }
    $refs = Remote-Refs
    $branchRef = 'refs/heads/' + $branch
    $tagRef = 'refs/tags/' + $tag
    if ($refs.ContainsKey($branchRef)) {
        if (-not $head) { throw 'Remote history already exists; import it before the first local commit. Do not overwrite it.' }
        Invoke-Git -Arguments @('fetch', '--no-tags', 'origin', $branch) | Out-Null
        $remoteHead = $refs[$branchRef]
        Invoke-Git -Arguments @('merge-base', '--is-ancestor', $remoteHead, 'HEAD') | Out-Null
    } elseif (-not $head -and $refs.Count -gt 0) { throw 'Remote is not empty. Inspect and import its existing history before publishing.' }
    if ($refs.ContainsKey($tagRef)) { throw "Tag $tag is already published. Use a new version; do not recreate it." }
    $localTag = Invoke-Git -Arguments @('tag', '--list', $tag)
    if ($localTag) {
        if (-not $Resume) { throw "Local tag $tag exists. For a failed push, use -Resume after fixing its cause." }
        $tagCommit = Invoke-Git -Arguments @('rev-parse', ($tag + '^{commit}'))
        if ($tagCommit -ne $head -or (Invoke-Git -Arguments @('status', '--porcelain'))) { throw 'Resume requires a clean workspace and the exact tagged HEAD.' }
    } elseif ($Resume) { throw 'No local tag exists to resume.' }

    $phase = 'safety and tests'
    $testedSnapshot = File-Snapshot
    Run-Node -Arguments @('scripts/check-release.cjs')
    foreach ($file in $manifest.files) { if ($file -match '\.(js|cjs)$' -and (Test-Path -LiteralPath $file)) { Run-Node -Arguments @('--check', $file) } }
    Run-Node -Arguments @('tests/check.cjs')
    Run-Node -Arguments @('tests/world.cjs')
    Run-Node -Arguments @('tests/browser.cjs')
    foreach ($file in $manifest.files) {
        if ($file -match '^tests/[A-Za-z0-9_.-]+\.cjs$' -and $file -notin @('tests/check.cjs', 'tests/world.cjs', 'tests/browser.cjs')) { Run-Node -Arguments @($file) }
    }
    # Reinspect after tests. Generated browser data must remain ignored.
    Run-Node -Arguments @('scripts/check-release.cjs')
    if ((File-Snapshot) -ne $testedSnapshot) { throw 'Release source files changed while tests ran. Rerun tests before publication.' }
    $checkedHead = Invoke-Git -Arguments @('rev-parse', '--verify', 'HEAD') -AllowFailure
    if ($checkedHead -notmatch '^[a-f0-9]{40,64}$') { $checkedHead = '' }
    if ($checkedHead -ne $head) { throw 'HEAD changed during tests. Stop and review concurrent changes.' }
    if ($DryRun) { Write-Output "DRY RUN PASSED: $tag -> $repositoryUrl ($branch). No stage/commit/tag/push performed."; exit 0 }

    $phase = 'local commit and tag'
    if (-not $localTag) {
        # Exact reviewed paths only, including reviewed tracked deletions.
        $arguments = @('add', '-A', '--') + @($manifest.files | ForEach-Object { [string]$_ })
        Invoke-Git -Arguments $arguments | Out-Null
        $staged = Invoke-Git -Arguments @('-c', 'core.quotePath=false', 'diff', '--cached', '--name-only')
        if (-not $staged) { throw 'No release changes are staged. Refusing an empty release commit.' }
        foreach ($file in ($staged -split "`n")) { if ($manifest.files -notcontains $file) { throw "Unexpected staged file: $file" } }
        if ((File-Snapshot) -ne $testedSnapshot) { throw 'Source files changed after tests/staging. Review the preserved index and retry.' }
        Invoke-Git -Arguments @('commit', '-m', ("chore(release): $tag - $Summary")) | Out-Null
        Invoke-Git -Arguments @('tag', '-a', $tag, '-m', ("$tag - $Summary")) | Out-Null
    }
    if ($Resume -and (Invoke-Git -Arguments @('status', '--porcelain'))) { throw 'Workspace changed during resume tests. Publication stopped.' }
    $phase = 'atomic push'
    Invoke-Git -Arguments @('push', '--atomic', '--porcelain', '--set-upstream', 'origin',
        ($branch + ':' + $branchRef), ($tagRef + ':' + $tagRef)) | Out-Null
    $phase = 'remote verification'
    $refs = Remote-Refs
    $head = Invoke-Git -Arguments @('rev-parse', 'HEAD')
    $tagObject = Invoke-Git -Arguments @('rev-parse', $tagRef)
    if (-not $refs.ContainsKey($branchRef) -or $refs[$branchRef] -ne $head -or -not $refs.ContainsKey($tagRef) -or $refs[$tagRef] -ne $tagObject) {
        throw 'Remote SHA verification failed; publication is not reported as successful. Inspect remote before retrying.'
    }
    Write-Output "PUBLISHED: $tag"
    Write-Output "Repository: $repositoryUrl"
    Write-Output "Version: $repositoryUrl/tree/$tag"
    Write-Output "Commit: $head"
} catch {
    Write-Error -Message ("STOPPED during ${phase}: " + $_.Exception.Message) -ErrorAction Continue
    Write-Output 'Local changes/commits/tags are preserved. Nothing was reset, force-pushed, or silently retried.'
    exit 1
} finally {
    $env:GIT_TERMINAL_PROMPT = $previousPrompt
    $env:GCM_INTERACTIVE = $previousInteractive
    [Console]::OutputEncoding = $previousEncoding
    $OutputEncoding = $previousOutputEncoding
    Set-Location -LiteralPath $previousLocation.Path
}
