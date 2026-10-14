# Authorized official branch-based Pages fallback; only published formal tags.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Tag)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($Tag -notmatch '^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'Invalid formal tag' }
$gh = Join-Path $root '.tools\gh\bin\gh.exe'
if (-not (Test-Path -LiteralPath $gh)) { $gh = (Get-Command gh -CommandType Application | Select-Object -First 1).Source }
$helper = '!"' + $gh.Replace('\','/') + '" auth git-credential'
function G {
  param([string]$Folder,[string[]]$Arguments)
  $previous = $ErrorActionPreference
  $temp = Join-Path $root ('test-output\pages-error-' + [guid]::NewGuid().ToString('N') + '.tmp')
  try { $ErrorActionPreference='Continue'; $output=@(& git -c ('safe.directory='+$Folder.Replace('\','/')) -c credential.https://github.com.helper= -c ('credential.https://github.com.helper='+$helper) -C $Folder @Arguments 2> $temp); $code=$LASTEXITCODE }
  finally { $ErrorActionPreference=$previous; Remove-Item -LiteralPath $temp -ErrorAction SilentlyContinue }
  if ($code -ne 0) { throw ('Git Pages operation failed: '+$Arguments[0]+'. No force/reset attempted.') }
  return ($output | ForEach-Object {$_.ToString()}) -join "`n"
}
New-Item -ItemType Directory -Path (Join-Path $root 'test-output') -Force | Out-Null
$oldEncoding=[Console]::OutputEncoding
try {
  [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
  $remote=G $root @('config','--get','remote.origin.url')
  if ($remote -notmatch '^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?$') {throw 'Unsupported origin'}
  $repo=$matches[1]+'/'+$matches[2]
  $sha=G $root @('rev-parse',($Tag+'^{commit}'))
  $localTag=G $root @('rev-parse',('refs/tags/'+$Tag))
  $remoteTag=G $root @('ls-remote','origin',('refs/tags/'+$Tag))
  if (-not $remoteTag.StartsWith($localTag+[char]9)) {throw 'Tag must already be published and match the remote'}
  $working=Join-Path $root ('test-output\pages-deploy-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $working -Force | Out-Null
  $archive=Join-Path $working 'source.zip'
  G $root @('archive','--format=zip',('--output='+$archive),$Tag) | Out-Null
  $source=Join-Path $working 'source'; Expand-Archive -LiteralPath $archive -DestinationPath $source
  $release=Get-Content (Join-Path $source 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ('v'+$release.version -ne $Tag) {throw 'Tag/manifest mismatch'}
  foreach ($test in @('check.cjs','world.cjs','ui.cjs','living-world.cjs','character.cjs')) {
    $testPath=Join-Path $source ('tests\'+$test)
    if (Test-Path -LiteralPath $testPath) { & node $testPath; if ($LASTEXITCODE -ne 0) {throw ('Tagged test failed: '+$test)} }
  }
  $artifact=Join-Path $working 'artifact'
  & node (Join-Path $root 'scripts\build-pages.cjs') --source $source --output $artifact
  if ($LASTEXITCODE -ne 0) {throw 'Pages artifact failed'}
  $branch=Join-Path $working 'branch'; New-Item -ItemType Directory -Path $branch | Out-Null
  G $branch @('init','--initial-branch=gh-pages') | Out-Null
  G $branch @('remote','add','origin',$remote) | Out-Null
  $existing=G $root @('ls-remote','--heads','origin','refs/heads/gh-pages')
  if ($existing) { G $branch @('fetch','--depth=1','origin','gh-pages') | Out-Null; G $branch @('checkout','-B','gh-pages','FETCH_HEAD') | Out-Null }
  $files=@(Get-ChildItem -LiteralPath $artifact -File -Force | Select-Object -ExpandProperty Name)
  $previousFiles=@()
  if (Test-Path -LiteralPath (Join-Path $branch 'version.json')) {
    $previousData=Get-Content (Join-Path $branch 'version.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $previousFiles=@($previousData.managedFiles)
  }
  $tracked=G $branch @('ls-files')
  foreach ($file in ($tracked -split "`n" | Where-Object {$_})) {
    if ($file -notmatch '^[A-Za-z0-9_.-]+$' -or ($file -notin $previousFiles -and $file -notin $files)) {throw 'Unmanaged Pages file: refuse overwrite'}
  }
  foreach ($file in $previousFiles) {
    if ($file -notmatch '^[A-Za-z0-9_.-]+$') {throw 'Invalid managed path'}
    if ($file -notin $files) {Remove-Item -LiteralPath (Join-Path $branch $file)}
  }
  foreach ($file in $files) {Copy-Item -LiteralPath (Join-Path $artifact $file) -Destination (Join-Path $branch $file)}
  $metadata=@{version=$release.version; sourceCommit=$sha; managedFiles=$files} | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText((Join-Path $branch 'version.json'),$metadata,(New-Object Text.UTF8Encoding($false)))
  G $branch (@('add','-A','--')+$files+$previousFiles | Select-Object -Unique) | Out-Null
  if (G $branch @('diff','--cached','--name-only')) {
    G $branch @('commit','-m',('deploy(pages): '+$Tag+' from '+$sha)) | Out-Null
    G $branch @('push','origin','gh-pages:refs/heads/gh-pages') | Out-Null
  }
  $settings=Join-Path $working 'pages-settings.json'
  [IO.File]::WriteAllText($settings,'{"build_type":"legacy","source":{"branch":"gh-pages","path":"/"}}',(New-Object Text.UTF8Encoding($false)))
  & $gh api --method PUT ('repos/'+$repo+'/pages') --input $settings --jq '{url: .html_url, build_type: .build_type, source: .source}'
  if ($LASTEXITCODE -ne 0) {throw 'Pages source setting failed'}
  & $gh api --method POST ('repos/'+$repo+'/pages/builds') --jq '.status'
  if ($LASTEXITCODE -ne 0) {throw 'Pages build request failed'}
  Write-Output ('PAGES BRANCH PUSHED: '+$Tag+' source '+$sha+'. Verify managed Pages build and HTTP before reporting online success.')
} finally { [Console]::OutputEncoding=$oldEncoding }
