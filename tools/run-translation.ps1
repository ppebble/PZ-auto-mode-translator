[CmdletBinding()]
param(
    [string]$ZomboidHome = (Join-Path $env:USERPROFILE 'Zomboid'),
    [string]$TargetLanguage = 'KO',
    [string]$Provider = (Join-Path $PSScriptRoot '..\config\provider.local.json'),
    [string]$Rules = (Join-Path $PSScriptRoot '..\config\rules.example.json'),
    [string]$Exclude = 'PZAITranslator,PZAITranslationGenerated',
    [string]$IncludeMods = '',
    [switch]$SkipModsWithTarget,
    [string]$StatusFile = '',
    [string]$PauseFile = '',
    [switch]$DryRun,
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
$utf8Console = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8Console
[Console]::OutputEncoding = $utf8Console
$OutputEncoding = $utf8Console
& chcp.com 65001 | Out-Null
if ($DryRun -and $Install) { throw '-DryRun output is deliberately not installable.' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtime = Join-Path $root 'runtime'
$scan = Join-Path $runtime 'scan-manifest.json'
$translated = Join-Path $runtime 'translated-manifest.json'
$translationMemory = Join-Path $runtime 'translation-memory.json'
$pack = Join-Path $runtime 'generated-pack'

function Invoke-Worker([string[]]$WorkerArgs) {
    $workerOutput = & node @WorkerArgs 2>&1
    $workerOutput | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw ($workerOutput | Out-String).Trim() }
}
function Set-Stage([string]$Message, [hashtable]$Details = @{}) {
    if ([string]::IsNullOrWhiteSpace($StatusFile)) { return }
    $lines = @('state=running', "message=$Message")
    foreach ($key in @('phase','total','completed','reused','failed','retries','currentMod')) {
        if ($Details.ContainsKey($key)) { $lines += "$key=$($Details[$key])" }
    }
    $lines += "updatedAt=$([DateTime]::UtcNow.ToString('o'))"
    [System.IO.File]::WriteAllLines($StatusFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

Set-Stage '1/4 Scanning active B42 mods.'
$scanArgs = @((Join-Path $root 'tools\worker\scan-b42.cjs'), '--zomboid-home', $ZomboidHome, '--target-language', $TargetLanguage, '--exclude', $Exclude, '--output', $scan, '--translation-memory', $translationMemory)
if ($SkipModsWithTarget) { $scanArgs += '--skip-mods-with-target' }
if (-not [string]::IsNullOrWhiteSpace($IncludeMods)) { $scanArgs += @('--include-mods', $IncludeMods) }
Invoke-Worker -WorkerArgs $scanArgs
$manifest = Get-Content -LiteralPath $scan -Raw -Encoding utf8 | ConvertFrom-Json
$total = [int]$manifest.summary.pending + [int]$manifest.summary.reused
$reused = [int]$manifest.summary.reused
$translationArgs = @((Join-Path $root 'tools\worker\translate-b42.cjs'), '--manifest', $scan, '--rules', $Rules, '--provider', $Provider, '--output', $translated, '--translation-memory', $translationMemory)
if (-not [string]::IsNullOrWhiteSpace($StatusFile)) { $translationArgs += @('--status-file', $StatusFile) }
if (-not [string]::IsNullOrWhiteSpace($PauseFile)) { $translationArgs += @('--pause-file', $PauseFile) }
if ($DryRun) { $translationArgs += '--dry-run' }
Set-Stage '2/4 Translating missing strings with the selected provider.' @{ phase = 'translating'; total = $total; completed = $reused; reused = $reused; failed = 0; retries = 0; currentMod = '' }
Invoke-Worker -WorkerArgs $translationArgs
$packArgs = @((Join-Path $root 'tools\worker\materialize-b42.cjs'), '--input', $translated, '--output', $pack)
if ($DryRun) { $packArgs += '--allow-dry-run' }
Set-Stage '3/4 Validating placeholders and generating the translation pack.' @{ phase = 'generating'; total = $total; completed = $total; reused = $reused; failed = 0; retries = 0; currentMod = '' }
Invoke-Worker -WorkerArgs $packArgs
if ($Install) {
    Set-Stage '4/4 Installing PZAITranslationGenerated.' @{ phase = 'installing'; total = $total; completed = $total; reused = $reused; failed = 0; retries = 0; currentMod = '' }
    $modsRoot = Join-Path $ZomboidHome 'mods'
    $destination = Join-Path $modsRoot 'PZAITranslationGenerated'
    New-Item -ItemType Directory -Force -Path $modsRoot | Out-Null
    # This directory is owned by this generator. Replacing it prevents stale
    # category JSON files from surviving after a narrower subsequent scan.
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -Path (Join-Path $pack '*') -Destination $destination -Recurse -Force
    Write-Host "Installed generated pack: $destination"
}
Write-Host "Completed. Enable PZAITranslationGenerated, return to the main menu, then enter the world again to load the translation JSON."
