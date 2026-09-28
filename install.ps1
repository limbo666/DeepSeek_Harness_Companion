#Requires -Version 5.1
<#
.SYNOPSIS
  Install dsh-companion-face into a DeepSeek Harness profile.

.DESCRIPTION
  Copies this package into <DSH_HOME>/profiles/node_modules/ and appends one additive row
  to <DSH_HOME>/profiles/<Profile>/cordis.patch.yml.

  Idempotent: re-running it refreshes lib/ and will not add a second patch row.
  It backs the patch file up before writing and never restarts the harness for you.

.PARAMETER DshHome
  The DSH home directory. Defaults to $env:DSH_HOME, then $HOME\.dsh.

.PARAMETER Profile
  The profile to patch. Defaults to 'web' (the Web GUI).

.PARAMETER DryRun
  Report what would happen without writing anything.

.EXAMPLE
  pwsh -File install.ps1
.EXAMPLE
  pwsh -File install.ps1 -DshHome 'D:\other\.dsh' -Profile web -DryRun
#>
[CmdletBinding()]
param(
  [string] $DshHome,
  [string] $Profile = 'web',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  $m" -ForegroundColor Red; exit 1 }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgName = 'dsh-companion-face'

Write-Host ''
Write-Host "dsh-companion-face installer" -ForegroundColor Cyan
Write-Host ''

# --- 1. resolve the DSH home -----------------------------------------------------------------
if (-not $DshHome -or $DshHome.Trim() -eq '') {
  if ($env:DSH_HOME -and $env:DSH_HOME.Trim() -ne '') { $DshHome = $env:DSH_HOME }
  elseif ($env:USERPROFILE) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
  elseif ($env:HOME) { $DshHome = Join-Path $env:HOME '.dsh' }
  else { Die 'Could not determine DSH_HOME. Pass -DshHome <path>.' }
}
if (-not (Test-Path $DshHome)) { Die "DSH_HOME does not exist: $DshHome" }
Info "DSH_HOME      : $DshHome"

$profilesDir = Join-Path $DshHome 'profiles'
if (-not (Test-Path $profilesDir)) { Die "No profiles directory at $profilesDir - is this a DSH home?" }

$profileDir = Join-Path $profilesDir $Profile
if (-not (Test-Path $profileDir)) {
  $available = (Get-ChildItem $profilesDir -Directory | Select-Object -ExpandProperty Name) -join ', '
  Die "No '$Profile' profile in $profilesDir. Available: $available"
}
Info "profile       : $Profile"

# --- 2. verify the payload -------------------------------------------------------------------
foreach ($rel in @('package.json', 'lib\index.js', 'lib\client.js')) {
  if (-not (Test-Path (Join-Path $here $rel))) { Die "Package is incomplete: missing $rel" }
}
$bundle = Join-Path $here 'lib\client.js'
$bundleKb = [math]::Round((Get-Item $bundle).Length / 1KB)
Info "bundle        : lib/client.js ($bundleKb KB)"

# --- 3. copy into the profile's node_modules -------------------------------------------------
# profiles/node_modules is a plain drop-in directory in a stock install: there is no
# package.json, lockfile or workspace above it, so no package manager is involved.
$modulesDir = Join-Path $profilesDir 'node_modules'
$target = Join-Path $modulesDir $pkgName

if ($DryRun) {
  Info "[dry run] would copy  $here -> $target"
} else {
  if (-not (Test-Path $modulesDir)) { New-Item -ItemType Directory -Path $modulesDir -Force | Out-Null }
  foreach ($sub in @('lib')) {
    $destSub = Join-Path $target $sub
    if (-not (Test-Path $destSub)) { New-Item -ItemType Directory -Path $destSub -Force | Out-Null }
  }
  Copy-Item (Join-Path $here 'package.json') (Join-Path $target 'package.json') -Force
  Copy-Item (Join-Path $here 'lib\index.js') (Join-Path $target 'lib\index.js') -Force
  Copy-Item $bundle (Join-Path $target 'lib\client.js') -Force
  if (Test-Path (Join-Path $here 'README.md')) { Copy-Item (Join-Path $here 'README.md') (Join-Path $target 'README.md') -Force }
  # The README embeds docs/mood-sheet.png; without it the installed copy has a broken image.
  if (Test-Path (Join-Path $here 'docs')) {
    $docsTarget = Join-Path $target 'docs'
    New-Item -ItemType Directory -Force -Path $docsTarget | Out-Null
    Copy-Item (Join-Path $here 'docs\*') $docsTarget -Force
  }
  Ok "installed     : $target"
}

# --- 4. append the patch row -----------------------------------------------------------------
# cordis.patch.yml is a top-level YAML array of loader patch entries, so appending a
# sequence item as text is valid YAML. We only ever append, never rewrite.
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$backupMade = $null
$row = @(
  '',
  '- insert:',
  "    - id: companion-face",
  "      name: '$pkgName'",
  ''
) -join [Environment]::NewLine

$existing = if (Test-Path $patchPath) { Get-Content $patchPath -Raw } else { '' }

# Match the plugin NAME as a YAML value, quoted or bare, and only at the start of a mapping
# key. Two earlier forms were wrong in opposite directions: an escaped `'$pkgName'` misses
# `name: dsh-companion-face` (no quotes), which appends a SECOND row and loads the plugin
# twice; a bare substring search matches the comment banner at the top of the patch file,
# which appends NOTHING and silently "succeeds". Keep this in step with install.sh.
$nameRe = "(?m)^\s*name:\s*['`"]?$([regex]::Escape($pkgName))"

if ($existing -match $nameRe) {
  Ok 'patch row     : already present, left alone'
} else {
  if ($DryRun) {
    Info "[dry run] would append the companion-face row to $patchPath"
  } else {
    if (Test-Path $patchPath) {
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $backup = "$patchPath.bak-$stamp"
      Copy-Item $patchPath $backup -Force
      $backupMade = $backup
      Info "backup        : $backup"
    }
    # Ensure the file ends with a newline before appending, so the new item starts on its own line.
    if ($existing -ne '' -and -not $existing.EndsWith([Environment]::NewLine)) {
      Add-Content -Path $patchPath -Value '' -NoNewline
    }
    Add-Content -Path $patchPath -Value $row -NoNewline
    Ok "patch row     : appended to $patchPath"
  }
}

# --- 5. next steps ---------------------------------------------------------------------------
Write-Host ''
Write-Host 'Done.' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Restart the harness, then reload the Web GUI page.'
Write-Host '  The face appears in the canvas; the mood chip appears in the session header.'
Write-Host ''
if ($backupMade) {
  Write-Host "  Rollback: restore the backup at $backupMade,"
} else {
  Write-Host "  Rollback: remove the companion-face entry from $patchPath,"
}
Write-Host "            then delete $target, and restart."
Write-Host ''
