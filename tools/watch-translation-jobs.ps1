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
$lock = Join-Path $lua 'PZAITranslator_helper.lock'

function Read-Ini([string]$Path) {
    $result = @{}
    foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
        $pair = $line -split '=', 2
        if ($pair.Count -eq 2) { $result[$pair[0]] = $pair[1] }
    }
    return $result
}
function Write-Status([string]$State, [string]$Message) {
    [System.IO.File]::WriteAllLines($status, @("state=$State", "message=$Message", "updatedAt=$([DateTime]::UtcNow.ToString('o'))"), (New-Object System.Text.UTF8Encoding($false)))
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
    Write-Status 'idle' 'PZ AI Translator Helper is ready.'
    Write-Host "Watching $job (Ctrl+C to stop)."

    while ($true) {
    if (-not (Test-Path -LiteralPath $job)) { Start-Sleep -Seconds $PollSeconds; continue }
    try {
        $request = Read-Ini $job
        if ($request.action -ne 'translate' -and $request.action -ne 'test_connection') { throw 'Unsupported local job action.' }
        if (-not (Test-Path -LiteralPath $providerIni)) { throw 'Save provider settings in Mod Options before queuing a job.' }
        $settings = Read-Ini $providerIni
        if ([string]::IsNullOrWhiteSpace($settings.apiKey) -or [string]::IsNullOrWhiteSpace($settings.model)) { throw 'API key and model are required.' }
        @{ provider = $settings.provider; baseUrl = $settings.baseUrl; model = $settings.model; apiKey = $settings.apiKey } |
            ConvertTo-Json | Set-Content -LiteralPath $providerJson -Encoding utf8
        $language = $request.targetLanguage
        if ([string]::IsNullOrWhiteSpace($language)) { $language = 'KO' }
        if ($request.action -eq 'test_connection') {
            Write-Status 'running' 'Testing provider with Hello, World!'
            $testResult = Join-Path $root 'runtime\provider-test-result.json'
            $testOutput = & node (Join-Path $PSScriptRoot 'worker\test-provider.cjs') --provider $providerJson --target-language $language --output $testResult 2>&1
            if ($LASTEXITCODE -ne 0) {
                $testOutput | ForEach-Object { Write-Host $_ }
                throw ($testOutput | Out-String).Trim()
            }
            $test = (Get-Content -LiteralPath $testResult -Raw -Encoding utf8 | ConvertFrom-Json)
            Move-Item -LiteralPath $job -Destination ($job + '.done') -Force
            Write-Status 'complete' ("Connection test OK: " + $test.output)
            continue
        }
        if ($request.action -ne 'translate') { throw 'Unsupported local job action.' }
        Write-Status 'running' 'Starting local translation helper.'
        $runArgs = @{ ZomboidHome = $ZomboidHome; TargetLanguage = $language; Provider = $providerJson; StatusFile = $status; Install = $true }
        if ($request.skipModsWithTarget -eq '1') { $runArgs.SkipModsWithTarget = $true }
        if (-not [string]::IsNullOrWhiteSpace($request.includeMods)) { $runArgs.IncludeMods = $request.includeMods }
        & (Join-Path $PSScriptRoot 'run-translation.ps1') @runArgs
        if ($LASTEXITCODE -ne 0) { throw 'Translation worker failed.' }
        Move-Item -LiteralPath $job -Destination ($job + '.done') -Force
        Write-Status 'complete' 'Generated pack installed. Restart Project Zomboid.'
    } catch {
        Write-Status 'failed' $_.Exception.Message
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
