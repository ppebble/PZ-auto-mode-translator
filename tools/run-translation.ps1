[CmdletBinding()]
param(
    [string]$ZomboidHome = (Join-Path $env:USERPROFILE 'Zomboid'),
    [string]$TargetLanguage = 'KO',
    [string]$Provider = '',
    [string]$Rules = '',
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
$Provider = if ([string]::IsNullOrWhiteSpace($Provider)) { Join-Path $root 'config\provider.local.json' } else { $Provider }
$Rules = if ([string]::IsNullOrWhiteSpace($Rules)) { Join-Path $root 'config\rules.example.json' } else { $Rules }
$bundledNode = Join-Path $root 'bin\node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } elseif ($null -ne $nodeCommand) { $nodeCommand.Source } else { throw 'The bundled Node.js runtime is missing. Download and extract the complete Helper ZIP again.' }
$runtime = Join-Path $root 'runtime'
$scan = Join-Path $runtime 'scan-manifest.json'
$translated = Join-Path $runtime 'translated-manifest.json'
$translationMemory = Join-Path $runtime 'translation-memory.json'
$pack = Join-Path $runtime 'generated-pack'
$userRules = Join-Path $ZomboidHome 'Lua\PZAITranslator_rules.ini'
$reviewCatalog = Join-Path $ZomboidHome 'Lua\PZAITranslator_review.ini'

function Invoke-Worker([string[]]$WorkerArgs) {
    $workerOutput = & $nodeExe @WorkerArgs 2>&1
    $workerOutput | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw ($workerOutput | Out-String).Trim() }
}
function Set-Stage([string]$Message, [hashtable]$Details = @{}) {
    if ([string]::IsNullOrWhiteSpace($StatusFile)) { return }
    $lines = @('state=running', "message=$Message")
    foreach ($key in @('phase','total','completed','reused','failed','retries','currentMod','conflicts')) {
        if ($Details.ContainsKey($key)) { $lines += "$key=$($Details[$key])" }
    }
    $lines += "updatedAt=$([DateTime]::UtcNow.ToString('o'))"
    [System.IO.File]::WriteAllLines($StatusFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

Set-Stage '1/4 Scanning active B42 mods.'
$scanBaseArgs = @((Join-Path $root 'tools\worker\scan-b42.cjs'), '--zomboid-home', $ZomboidHome, '--target-language', $TargetLanguage, '--exclude', $Exclude, '--translation-memory', $translationMemory)
if ($SkipModsWithTarget) { $scanBaseArgs += '--skip-mods-with-target' }
# Always refresh the full selector catalog. A selected translation run must not
# erase statistics for the remaining active mods.
Invoke-Worker -WorkerArgs ($scanBaseArgs + @('--output', (Join-Path $runtime 'catalog-scan-manifest.json')))
$scanArgs = $scanBaseArgs + @('--output', $scan, '--no-catalog')
if (-not [string]::IsNullOrWhiteSpace($IncludeMods)) { $scanArgs += @('--include-mods', $IncludeMods) }
Invoke-Worker -WorkerArgs $scanArgs
$manifest = Get-Content -LiteralPath $scan -Raw -Encoding utf8 | ConvertFrom-Json
$total = [int]$manifest.summary.pending + [int]$manifest.summary.reused
$reused = [int]$manifest.summary.reused
$translationArgs = @((Join-Path $root 'tools\worker\translate-b42.cjs'), '--manifest', $scan, '--rules', $Rules, '--user-rules', $userRules, '--provider', $Provider, '--output', $translated, '--translation-memory', $translationMemory)
if (-not [string]::IsNullOrWhiteSpace($StatusFile)) { $translationArgs += @('--status-file', $StatusFile) }
if (-not [string]::IsNullOrWhiteSpace($PauseFile)) { $translationArgs += @('--pause-file', $PauseFile) }
if ($DryRun) { $translationArgs += '--dry-run' }
Set-Stage '2/4 Translating missing strings with the selected provider.' @{ phase = 'translating'; total = $total; completed = $reused; reused = $reused; failed = 0; retries = 0; currentMod = '' }
Invoke-Worker -WorkerArgs $translationArgs
$reviewArgs = @((Join-Path $root 'tools\worker\review-b42.cjs'), '--mode', 'export', '--input', $translated, '--output', $reviewCatalog)
Invoke-Worker -WorkerArgs $reviewArgs
$translatedManifest = Get-Content -LiteralPath $translated -Raw -Encoding utf8 | ConvertFrom-Json
$needsReview = [int]$translatedManifest.summary.needsReview
$packArgs = @((Join-Path $root 'tools\worker\materialize-b42.cjs'), '--input', $translated, '--output', $pack)
if ($DryRun) { $packArgs += '--allow-dry-run' }
Set-Stage '3/4 Validating placeholders and generating the translation pack.' @{ phase = 'generating'; total = $total; completed = ($total - $needsReview); reused = $reused; failed = $needsReview; retries = 0; currentMod = '' }
Invoke-Worker -WorkerArgs $packArgs
$packReport = Get-Content -LiteralPath (Join-Path $pack 'pack-report.json') -Raw -Encoding utf8 | ConvertFrom-Json
$conflictCount = @($packReport.conflicts).Count
if ($Install) {
    $installMessage = '4/4 Installing PZAITranslationGenerated.'
    if ($conflictCount -gt 0) { $installMessage += " $conflictCount conflicting generated key(s) will be omitted." }
    Set-Stage $installMessage @{ phase = 'installing'; total = $total; completed = ($total - $needsReview); reused = $reused; failed = $needsReview; retries = 0; currentMod = ''; conflicts = $conflictCount }
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
if ($conflictCount -gt 0) { Write-Warning "$conflictCount conflicting generated key(s) were omitted. See runtime\generated-pack\pack-report.json." }
Write-Host "Completed. Enable PZAITranslationGenerated, return to the main menu, then enter the world again to load the translation JSON."
