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
$bundledNode = Join-Path $root 'bin\node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } elseif ($null -ne $nodeCommand) { $nodeCommand.Source } else { throw 'The bundled Node.js runtime is missing. Download and extract the complete Helper ZIP again.' }
$lua = Join-Path $ZomboidHome 'Lua'
$job = Join-Path $lua 'PZAITranslator_job.ini'
$claimedJob = Join-Path $lua 'PZAITranslator_job.ini.processing'
$incompleteJob = Join-Path $lua 'PZAITranslator_job.ini.incomplete'
$providerIni = Join-Path $lua 'PZAITranslator_provider.ini'
$providerJson = Join-Path $root 'runtime\provider-from-game.json'
$status = Join-Path $lua 'PZAITranslator_status.ini'
$pause = Join-Path $lua 'PZAITranslator_pause.ini'
$lock = Join-Path $lua 'PZAITranslator_helper.lock'
$reviewCatalog = Join-Path $lua 'PZAITranslator_review.ini'
$reviewEdits = Join-Path $lua 'PZAITranslator_review_edits.ini'
$luaCandidates = Join-Path $lua 'PZAITranslator_lua_candidates.ini'
$translatedManifest = Join-Path $root 'runtime\translated-manifest.json'
$translationMemory = Join-Path $root 'runtime\translation-memory.json'
$generatedPack = Join-Path $root 'runtime\generated-pack'

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
    foreach ($key in @('phase','total','completed','reused','failed','retries','currentMod','batchIndex','batchCount','waitSeconds','estimatedWaitSeconds','errorCode','apiCharacters','requestCount','estimatedInputTokens','estimatedOutputTokens','estimatedCostUsd','conflicts')) {
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
    if ($text -match 'No provider API key|API key and model are required|API key is empty') { return 'No API key is saved. Enter and apply an API key in Mod Options before queueing translation.' }
    if ($text -match 'HTTP 401|HTTP 403|API key') { return 'The provider rejected the API key or account permission. Recheck the key, selected project, and model access.' }
    if ($text -match 'bundled Node\.js runtime is missing|node.+not recognized|node.+not found') { return 'The Helper runtime is incomplete. Download and extract the complete Helper ZIP again.' }
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
    Write-Host 'PZ AI Translation Generator Helper is already running.'
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
    $activeJob = $null
    if (Test-Path -LiteralPath $claimedJob) {
        # A previous Helper process may have stopped after claiming the request.
        # Finish that durable claim before accepting a newer public job file.
        $activeJob = $claimedJob
    } elseif (Test-Path -LiteralPath $job) {
        try {
            # requested=1 is deliberately the final line written by the game.
            # Do not rename a newly-created file while Lua is still filling it.
            $pendingRequest = Read-Ini $job
            if ($pendingRequest.requested -ne '1' -or [string]::IsNullOrWhiteSpace($pendingRequest.action)) {
                $jobAge = [DateTime]::UtcNow - (Get-Item -LiteralPath $job).LastWriteTimeUtc
                if ($jobAge.TotalSeconds -lt 5) {
                    Start-Sleep -Seconds $PollSeconds
                    continue
                }
                Move-Item -LiteralPath $job -Destination $incompleteJob -Force
                Write-Warning 'Ignored and quarantined an incomplete local job file without counting it as a failed translation request.'
                continue
            }
            Move-Item -LiteralPath $job -Destination $claimedJob -ErrorAction Stop
            $activeJob = $claimedJob
        } catch [System.IO.IOException] {
            Start-Sleep -Seconds $PollSeconds
            continue
        }
    } else {
        Start-Sleep -Seconds $PollSeconds
        continue
    }
    try {
        $request = Read-Ini $activeJob
        if ($request.action -notin @('translate','resume','test_connection','apply_review','scan_lua')) { throw 'Unsupported local job action.' }
        $language = $request.targetLanguage
        if ([string]::IsNullOrWhiteSpace($language)) { $language = 'KO' }
        if ($request.action -eq 'scan_lua') {
            if ([string]::IsNullOrWhiteSpace($request.includeMods)) { throw 'Select and save at least one mod before scanning Lua candidates.' }
            Write-Status 'running' 'Scanning selected mods for review-only hardcoded Lua UI strings.' @{ phase = 'scanning'; total = 0; completed = 0; reused = 0; failed = 0; retries = 0; currentMod = '' }
            $luaScanManifest = Join-Path $root 'runtime\lua-scan-manifest.json'
            $scanArgs = @((Join-Path $PSScriptRoot 'worker\scan-b42.cjs'), '--zomboid-home', $ZomboidHome, '--target-language', $language, '--exclude', 'PZAITranslator,PZAITranslationGenerated', '--translation-memory', $translationMemory, '--output', $luaScanManifest, '--no-catalog')
            if (-not [string]::IsNullOrWhiteSpace($request.includeMods)) { $scanArgs += @('--include-mods', $request.includeMods) }
            $scanOutput = & $nodeExe @scanArgs 2>&1
            if ($LASTEXITCODE -ne 0) { throw ($scanOutput | Out-String).Trim() }
            $candidateOutput = & $nodeExe (Join-Path $PSScriptRoot 'worker\scan-lua-hardcoded.cjs') --manifest $luaScanManifest --output $luaCandidates 2>&1
            if ($LASTEXITCODE -ne 0) { throw ($candidateOutput | Out-String).Trim() }
            $candidateCount = 0
            if (Test-Path -LiteralPath $luaCandidates) { $candidateCount = (Select-String -LiteralPath $luaCandidates -Pattern '^candidate=').Count }
            Move-Item -LiteralPath $activeJob -Destination ($job + '.done') -Force
            Write-Status 'complete' 'Lua candidates scanned. Review and explicitly select items; no source mod or translation pack was changed.' @{ phase = 'complete'; total = $candidateCount; completed = $candidateCount; reused = 0; failed = 0; retries = 0; currentMod = '' }
            continue
        }
        if ($request.action -eq 'apply_review') {
            if (-not (Test-Path -LiteralPath $translatedManifest)) { throw 'No translated manifest exists to review.' }
            if (-not (Test-Path -LiteralPath $reviewEdits)) { throw 'No saved review edits exist.' }
            Write-Status 'running' 'Applying reviewed translations and rebuilding the generated overlay.' @{ phase = 'validating'; total = 0; completed = 0; reused = 0; failed = 0; retries = 0; currentMod = '' }
            $reviewReport = Join-Path $root 'runtime\review-apply-report.json'
            $reviewOutput = & $nodeExe (Join-Path $PSScriptRoot 'worker\review-b42.cjs') --mode apply --input $translatedManifest --edits $reviewEdits --output $translatedManifest --translation-memory $translationMemory --report $reviewReport 2>&1
            if ($LASTEXITCODE -ne 0) { throw ($reviewOutput | Out-String).Trim() }
            $materializeOutput = & $nodeExe (Join-Path $PSScriptRoot 'worker\materialize-b42.cjs') --input $translatedManifest --output $generatedPack 2>&1
            if ($LASTEXITCODE -ne 0) { throw ($materializeOutput | Out-String).Trim() }
            $modsRoot = [System.IO.Path]::GetFullPath((Join-Path $ZomboidHome 'mods'))
            $destination = [System.IO.Path]::GetFullPath((Join-Path $modsRoot 'PZAITranslationGenerated'))
            if (-not $destination.StartsWith($modsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Generated pack destination escaped the Zomboid mods directory.' }
            if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
            New-Item -ItemType Directory -Force -Path $destination | Out-Null
            Copy-Item -Path (Join-Path $generatedPack '*') -Destination $destination -Recurse -Force
            $exportOutput = & $nodeExe (Join-Path $PSScriptRoot 'worker\review-b42.cjs') --mode export --input $translatedManifest --output $reviewCatalog 2>&1
            if ($LASTEXITCODE -ne 0) { throw ($exportOutput | Out-String).Trim() }
            $review = Get-Content -LiteralPath $reviewReport -Raw -Encoding utf8 | ConvertFrom-Json
            $packReport = Get-Content -LiteralPath (Join-Path $generatedPack 'pack-report.json') -Raw -Encoding utf8 | ConvertFrom-Json
            $conflictCount = @($packReport.conflicts).Count
            Move-Item -LiteralPath $activeJob -Destination ($job + '.done') -Force
            $reviewMessage = "Review applied: $($review.applied) edit(s), $($review.rejected) rejected."
            if ($conflictCount -gt 0) { $reviewMessage += " $conflictCount conflicting generated key(s) were omitted; inspect pack-report.json." }
            $reviewMessage += ' Reload the game translation data.'
            Write-Status 'complete' $reviewMessage @{ phase = 'complete'; total = ($review.applied + $review.rejected); completed = $review.applied; reused = 0; failed = $review.rejected; retries = 0; currentMod = ''; conflicts = $conflictCount }
            continue
        }
        if (-not (Test-Path -LiteralPath $providerIni)) { throw 'Save provider settings in Mod Options before queuing a job.' }
        $settings = Read-Ini $providerIni
        if ([string]::IsNullOrWhiteSpace($settings.apiKey)) { throw 'No provider API key is saved.' }
        if ([string]::IsNullOrWhiteSpace($settings.model)) { throw 'Provider model is required.' }
        $runtimeProvider = @{ provider = $settings.provider; baseUrl = $settings.baseUrl; model = $settings.model; apiKey = $settings.apiKey }
        $costEstimate = Read-CostEstimate
        if ($null -ne $costEstimate) { $runtimeProvider.costEstimate = $costEstimate }
        $runtimeProvider | ConvertTo-Json | Set-Content -LiteralPath $providerJson -Encoding utf8
        if ($request.action -eq 'test_connection') {
            Write-Status 'running' 'Testing provider with Hello, World!' @{ phase = 'testing'; total = 1; completed = 0; reused = 0; failed = 0; retries = 0; currentMod = '' }
            $testResult = Join-Path $root 'runtime\provider-test-result.json'
            $testOutput = & $nodeExe (Join-Path $PSScriptRoot 'worker\test-provider.cjs') --provider $providerJson --target-language $language --output $testResult 2>&1
            if ($LASTEXITCODE -ne 0) {
                $testOutput | ForEach-Object { Write-Host $_ }
                throw ($testOutput | Out-String).Trim()
            }
            $test = (Get-Content -LiteralPath $testResult -Raw -Encoding utf8 | ConvertFrom-Json)
            Move-Item -LiteralPath $activeJob -Destination ($job + '.done') -Force
            Write-Status 'complete' ("Connection test OK: " + $test.output) @{ phase = 'testing'; total = 1; completed = 1; reused = 0; failed = 0; retries = 0; currentMod = '' }
            continue
        }
        if ($request.action -ne 'translate' -and $request.action -ne 'resume') { throw 'Unsupported local job action.' }
        if (($request.action -eq 'translate' -or $request.action -eq 'resume') -and (Test-Path -LiteralPath $pause)) { Remove-Item -LiteralPath $pause -Force }
        $startMessage = if ($request.action -eq 'resume') { 'Resuming translation from saved checkpoints with the selected provider/model.' } else { 'Starting translation job.' }
        Write-Status 'running' $startMessage @{ phase = 'scanning'; total = 0; completed = 0; reused = 0; failed = 0; retries = 0; currentMod = '' }
        $runArgs = @{ ZomboidHome = $ZomboidHome; TargetLanguage = $language; Provider = $providerJson; StatusFile = $status; PauseFile = $pause; Install = $true }
        if (-not [string]::IsNullOrWhiteSpace($request.includeMods)) { $runArgs.IncludeMods = $request.includeMods }
        & (Join-Path $PSScriptRoot 'run-translation.ps1') @runArgs
        Move-Item -LiteralPath $activeJob -Destination ($job + '.done') -Force
        $last = Read-Ini $status
        $conflictCount = if ($last.ContainsKey('conflicts')) { [int]$last.conflicts } else { 0 }
        $completeMessage = 'Generated pack installed.'
        if ($conflictCount -gt 0) { $completeMessage += " $conflictCount conflicting generated key(s) were omitted; inspect pack-report.json." }
        $completeMessage += ' Enable PZAITranslationGenerated, return to the main menu, then enter the world again.'
        Write-Status 'complete' $completeMessage @{ phase = 'complete'; total = $last.total; completed = $last.completed; reused = $last.reused; failed = $last.failed; retries = $last.retries; currentMod = ''; conflicts = $conflictCount }
    } catch {
        $last = if (Test-Path -LiteralPath $status) { Read-Ini $status } else { @{} }
        $previousFailed = 0
        if ($last.ContainsKey('failed')) { $previousFailed = [int]$last.failed }
        if ($_.Exception.Message -match 'Translation paused by user') {
            Write-Status 'paused' 'Paused. Completed batches were saved; use Resume interrupted translation when ready.' @{ phase = 'paused'; total = $last.total; completed = $last.completed; reused = $last.reused; failed = $last.failed; retries = $last.retries; currentMod = $last.currentMod; batchIndex = $last.batchIndex; batchCount = $last.batchCount; waitSeconds = 0; estimatedWaitSeconds = $last.estimatedWaitSeconds; apiCharacters = $last.apiCharacters; requestCount = $last.requestCount; estimatedInputTokens = $last.estimatedInputTokens; estimatedOutputTokens = $last.estimatedOutputTokens; estimatedCostUsd = $last.estimatedCostUsd }
            if (Test-Path -LiteralPath $activeJob) { Move-Item -LiteralPath $activeJob -Destination ($job + '.paused') -Force }
            continue
        }
        $errorCode = Get-ErrorCode $_.Exception.Message
        Write-Status 'failed' (Friendly-Error $_.Exception.Message) @{ phase = 'failed'; total = $last.total; completed = $last.completed; reused = $last.reused; failed = ($previousFailed + 1); retries = $last.retries; currentMod = $last.currentMod; batchIndex = $last.batchIndex; batchCount = $last.batchCount; waitSeconds = 0; estimatedWaitSeconds = $last.estimatedWaitSeconds; errorCode = $errorCode }
        Write-Warning $_.Exception.Message
        # A failed request must not be retried forever: it can repeatedly spend
        # provider quota or hide the original error behind a rapid status loop.
        if (Test-Path -LiteralPath $activeJob) { Move-Item -LiteralPath $activeJob -Destination ($job + '.failed') -Force }
    }
    }
} finally {
    if ($null -ne $lockStream) { $lockStream.Dispose() }
    Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
}
