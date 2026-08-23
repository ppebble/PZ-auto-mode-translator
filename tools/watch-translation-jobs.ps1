[CmdletBinding()]
param(
    [string]$ZomboidHome = (Join-Path $env:USERPROFILE 'Zomboid'),
    [int]$PollSeconds = 2
)

$ErrorActionPreference = 'Stop'
$utf8Console = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8Console
[Console]::OutputEncoding = $utf8Console
$OutputEncoding = $utf8Console
& chcp.com 65001 | Out-Null
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$lua = Join-Path $ZomboidHome 'Lua'
$job = Join-Path $lua 'PZAITranslator_job.ini'
$providerIni = Join-Path $lua 'PZAITranslator_provider.ini'
$providerJson = Join-Path $root 'runtime\provider-from-game.json'
$status = Join-Path $lua 'PZAITranslator_status.ini'
$pause = Join-Path $lua 'PZAITranslator_pause.ini'
$lock = Join-Path $lua 'PZAITranslator_helper.lock'

function Read-Ini([string]$Path) {
    $result = @{}
    foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
        $pair = $line -split '=', 2
        if ($pair.Count -eq 2) { $result[$pair[0]] = $pair[1] }
    }
    return $result
}
function Write-Status([string]$State, [string]$Message, [hashtable]$Details = @{}) {
    $lines = @("state=$State", "message=$Message")
    foreach ($key in @('phase','total','completed','reused','failed','retries','currentMod','batchIndex','batchCount','waitSeconds','estimatedWaitSeconds','errorCode','apiCharacters','requestCount','estimatedInputTokens','estimatedOutputTokens','estimatedCostUsd')) {
        if ($Details.ContainsKey($key)) { $lines += "$key=$($Details[$key])" }
    }
    $lines += "updatedAt=$([DateTime]::UtcNow.ToString('o'))"
    [System.IO.File]::WriteAllLines($status, $lines, (New-Object System.Text.UTF8Encoding($false)))
}
function Friendly-Error([string]$Raw) {
    $text = ($Raw -replace '\s+', ' ').Trim()
    if ($text -match 'DeepL HTTP 456|DeepL quota insufficient') { return 'DeepL quota is exhausted or too small for this job. Check the DeepL account usage and billing period, then retry.' }
    if ($text -match 'Gemini HTTP 429') { return 'HTTP 429: Gemini rate limit or quota. Completed batches were saved. Change the model if needed, then use Resume interrupted translation.' }
    if ($text -match 'HTTP 429') { return 'HTTP 429: Provider rate limit or quota. Wait, check provider usage, then retry.' }
    if ($text -match 'HTTP 401|HTTP 403|API key') { return 'The provider rejected the API key or account permission. Recheck the key, selected project, and model access.' }
    if ($text -match 'No provider API key') { return 'No API key is saved. Enter and apply an API key in Mod Options before queueing translation.' }
    if ($text -match 'node.+not recognized|node.+not found') { return 'Node.js 20 LTS or later is required by the Translation Helper. Install Node.js, then restart the Helper.' }
    if ($text -match 'timed out|Timeout') { return 'The provider request timed out. Check the network and provider status, then retry.' }
    return 'Translation failed: ' + $text
}
function Read-CostEstimate {
    $localProvider = Join-Path $root 'config\provider.local.json'
    if (-not (Test-Path -LiteralPath $localProvider)) { return $null }
    try { return ((Get-Content -LiteralPath $localProvider -Raw -Encoding utf8 | ConvertFrom-Json).costEstimate) } catch { return $null }
}
function Get-ErrorCode([string]$Raw) {
    $match = [regex]::Match($Raw, '(?:HTTP|status)\s*(\d{3})', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) { return $match.Groups[1].Value }
    return ''
}

New-Item -ItemType Directory -Force -Path $lua, (Split-Path $providerJson -Parent) | Out-Null

# FileShare.None makes the helper single-instance without relying on a stale PID
# file. Windows releases the handle automatically if the helper crashes.
try {
    $lockStream = [System.IO.File]::Open($lock, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch [System.IO.IOException] {
    Write-Host 'PZ AI Translator Helper is already running.'
    exit 0
}

try {
    $lockStream.SetLength(0)
    $lockText = "pid=$PID`nstartedAt=$([DateTime]::UtcNow.ToString('o'))`n"
    $lockBytes = [System.Text.Encoding]::UTF8.GetBytes($lockText)
    $lockStream.Write($lockBytes, 0, $lockBytes.Length)
    $lockStream.Flush()
    Write-Status 'idle' 'Translation Helper is ready.' @{ phase = 'idle'; total = 0; completed = 0; reused = 0; failed = 0; retries = 0; currentMod = '' }
    Write-Host "Watching $job (Ctrl+C to stop)."

    while ($true) {
    if (-not (Test-Path -LiteralPath $job)) { Start-Sleep -Seconds $PollSeconds; continue }
    try {
        $request = Read-Ini $job
        if ($request.action -ne 'translate' -and $request.action -ne 'resume' -and $request.action -ne 'test_connection') { throw 'Unsupported local job action.' }
        if (-not (Test-Path -LiteralPath $providerIni)) { throw 'Save provider settings in Mod Options before queuing a job.' }
        $settings = Read-Ini $providerIni
        if ([string]::IsNullOrWhiteSpace($settings.apiKey) -or [string]::IsNullOrWhiteSpace($settings.model)) { throw 'API key and model are required.' }
        $runtimeProvider = @{ provider = $settings.provider; baseUrl = $settings.baseUrl; model = $settings.model; apiKey = $settings.apiKey }
        $costEstimate = Read-CostEstimate
        if ($null -ne $costEstimate) { $runtimeProvider.costEstimate = $costEstimate }
        $runtimeProvider | ConvertTo-Json | Set-Content -LiteralPath $providerJson -Encoding utf8
        $language = $request.targetLanguage
        if ([string]::IsNullOrWhiteSpace($language)) { $language = 'KO' }
        if ($request.action -eq 'test_connection') {
            Write-Status 'running' 'Testing provider with Hello, World!' @{ phase = 'testing'; total = 1; completed = 0; reused = 0; failed = 0; retries = 0; currentMod = '' }
            $testResult = Join-Path $root 'runtime\provider-test-result.json'
            $testOutput = & node (Join-Path $PSScriptRoot 'worker\test-provider.cjs') --provider $providerJson --target-language $language --output $testResult 2>&1
            if ($LASTEXITCODE -ne 0) {
                $testOutput | ForEach-Object { Write-Host $_ }
                throw ($testOutput | Out-String).Trim()
            }
            $test = (Get-Content -LiteralPath $testResult -Raw -Encoding utf8 | ConvertFrom-Json)
            Move-Item -LiteralPath $job -Destination ($job + '.done') -Force
            Write-Status 'complete' ("Connection test OK: " + $test.output) @{ phase = 'testing'; total = 1; completed = 1; reused = 0; failed = 0; retries = 0; currentMod = '' }
            continue
        }
        if ($request.action -ne 'translate' -and $request.action -ne 'resume') { throw 'Unsupported local job action.' }
        if (($request.action -eq 'translate' -or $request.action -eq 'resume') -and (Test-Path -LiteralPath $pause)) { Remove-Item -LiteralPath $pause -Force }
        $startMessage = if ($request.action -eq 'resume') { 'Resuming translation from saved checkpoints with the selected provider/model.' } else { 'Starting translation job.' }
        Write-Status 'running' $startMessage @{ phase = 'scanning'; total = 0; completed = 0; reused = 0; failed = 0; retries = 0; currentMod = '' }
        $runArgs = @{ ZomboidHome = $ZomboidHome; TargetLanguage = $language; Provider = $providerJson; StatusFile = $status; PauseFile = $pause; Install = $true }
        if ($request.skipModsWithTarget -eq '1') { $runArgs.SkipModsWithTarget = $true }
        if (-not [string]::IsNullOrWhiteSpace($request.includeMods)) { $runArgs.IncludeMods = $request.includeMods }
        & (Join-Path $PSScriptRoot 'run-translation.ps1') @runArgs
        Move-Item -LiteralPath $job -Destination ($job + '.done') -Force
        $last = Read-Ini $status
        Write-Status 'complete' 'Generated pack installed. Enable PZAITranslationGenerated, return to the main menu, then enter the world again.' @{ phase = 'complete'; total = $last.total; completed = $last.completed; reused = $last.reused; failed = $last.failed; retries = $last.retries; currentMod = '' }
    } catch {
        $last = if (Test-Path -LiteralPath $status) { Read-Ini $status } else { @{} }
        $previousFailed = 0
        if ($last.ContainsKey('failed')) { $previousFailed = [int]$last.failed }
        if ($_.Exception.Message -match 'Translation paused by user') {
            Write-Status 'paused' 'Paused. Completed batches were saved; use Resume interrupted translation when ready.' @{ phase = 'paused'; total = $last.total; completed = $last.completed; reused = $last.reused; failed = $last.failed; retries = $last.retries; currentMod = $last.currentMod; batchIndex = $last.batchIndex; batchCount = $last.batchCount; waitSeconds = 0; estimatedWaitSeconds = $last.estimatedWaitSeconds; apiCharacters = $last.apiCharacters; requestCount = $last.requestCount; estimatedInputTokens = $last.estimatedInputTokens; estimatedOutputTokens = $last.estimatedOutputTokens; estimatedCostUsd = $last.estimatedCostUsd }
            if (Test-Path -LiteralPath $job) { Move-Item -LiteralPath $job -Destination ($job + '.paused') -Force }
            continue
        }
        $errorCode = Get-ErrorCode $_.Exception.Message
        Write-Status 'failed' (Friendly-Error $_.Exception.Message) @{ phase = 'failed'; total = $last.total; completed = $last.completed; reused = $last.reused; failed = ($previousFailed + 1); retries = $last.retries; currentMod = $last.currentMod; batchIndex = $last.batchIndex; batchCount = $last.batchCount; waitSeconds = 0; estimatedWaitSeconds = $last.estimatedWaitSeconds; errorCode = $errorCode }
        Write-Warning $_.Exception.Message
        # A failed request must not be retried forever: it can repeatedly spend
        # provider quota or hide the original error behind a rapid status loop.
        if (Test-Path -LiteralPath $job) { Move-Item -LiteralPath $job -Destination ($job + '.failed') -Force }
    }
    }
} finally {
    if ($null -ne $lockStream) { $lockStream.Dispose() }
    Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
}
