[CmdletBinding()]
param([string]$GameRoot = 'C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid')
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $GameRoot)) { throw "Game root not found: $GameRoot" }
$translate = Join-Path $GameRoot 'media\lua\shared\Translate'
$ui = Join-Path $translate 'EN\UI.json'
$template = Join-Path $GameRoot 'Workshop\ModTemplate'
if (!(Test-Path -LiteralPath $ui)) { throw 'B42 JSON translation root not found' }
if (!(Test-Path -LiteralPath $template)) { throw 'Workshop ModTemplate not found' }
$jsonText = Get-Content -Raw -LiteralPath $ui
$categories = Get-ChildItem -LiteralPath (Join-Path $translate 'EN') -Filter '*.json' -File | Select-Object -ExpandProperty BaseName
Write-Host "[OK] B42 JSON translation root: $translate"
Write-Host "[OK] Workshop template: $template"
Write-Host "[OK] EN categories: $($categories.Count)"
$keyCount = ([regex]::Matches($jsonText, '(?m)^\s*"[^"\r\n]+"\s*:')).Count
Write-Host "[OK] UI key lines: $keyCount (case-sensitive duplicate keys require custom parser)"
Write-Host 'This is a read-only inspection; no game files were modified.'


