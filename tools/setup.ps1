[CmdletBinding()]
param(
  [switch]$CheckOnly,
  [switch]$PrintPaths,
  [string]$GameRoot = "C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid",
  [string]$ZomboidHome = "$env:USERPROFILE\Zomboid"
)
$ErrorActionPreference = 'Stop'
Write-Host "PZ AI Translation Generator setup"
$checks = @('git','java','node','npm')
foreach ($name in $checks) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { Write-Host "[OK] $name -> $($cmd.Source)" } else { Write-Warning "[MISSING] $name" }
}
if ($PrintPaths) {
  Write-Host "Zomboid home: $ZomboidHome"
  if ($GameRoot) { Write-Host "Game root:    $GameRoot" }
  else { Write-Host "Game root:    not supplied (use -GameRoot)" }
  Write-Host "Workshop:     $env:ProgramFiles(x86)\Steam\steamapps\workshop\content\108600"
  Write-Host "Local mods:   $ZomboidHome\mods"
}
if (-not $CheckOnly -and -not $PrintPaths) {
  Write-Host "No files installed. Supply paths after confirming the game build."
}

