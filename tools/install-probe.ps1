[CmdletBinding()]
param(
  [string]$UserZomboid = "$env:USERPROFILE\Zomboid",
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\tests\fixtures\PZAIProbe'
$target = Join-Path $UserZomboid 'mods\PZAIProbe'
$source = [IO.Path]::GetFullPath($source)
$target = [IO.Path]::GetFullPath($target)
if ($Uninstall) {
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Write-Host "Removed $target"
  exit 0
}
if (!(Test-Path -LiteralPath $source)) { throw "Probe source not found: $source" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
Write-Host "Installed probe: $target"
Write-Host 'Enable PZAIProbe in the B42 Mod Manager and launch a test world.'
Write-Host 'Select Korean to verify TRANSLATION; inspect Zomboid/console.txt for PZAIProbe lines.'
