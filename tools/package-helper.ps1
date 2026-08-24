[CmdletBinding()]
param(
    [string]$Version = '0.1.0-beta.1',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$NodeVersion = '24.19.0'
$NodeArchiveSha256 = '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
if ($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]*$') { throw 'Version may contain only letters, numbers, dots, and hyphens.' }

$output = [System.IO.Path]::GetFullPath($OutputDirectory)
$releaseName = "PZ-AI-Translator-Helper-$Version"
$stage = Join-Path $output "$releaseName.staging"
$release = Join-Path $output $releaseName
$archive = Join-Path $output "$releaseName.zip"
$nodeArchiveName = "node-v$NodeVersion-win-x64.zip"
$nodeCache = Join-Path $root 'runtime\package-cache'
$nodeArchive = Join-Path $nodeCache $nodeArchiveName
$nodeDownload = "https://nodejs.org/dist/v$NodeVersion/$nodeArchiveName"

function Test-NodeArchive {
    if (-not (Test-Path -LiteralPath $nodeArchive)) { return $false }
    $actual = (Get-FileHash -LiteralPath $nodeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    return $actual -eq $NodeArchiveSha256.ToLowerInvariant()
}

New-Item -ItemType Directory -Force -Path $nodeCache | Out-Null
if (-not (Test-NodeArchive)) {
    Remove-Item -LiteralPath $nodeArchive -Force -ErrorAction SilentlyContinue
    Write-Output "Downloading bundled Node.js $NodeVersion LTS runtime..."
    Invoke-WebRequest -UseBasicParsing -Uri $nodeDownload -OutFile $nodeArchive
}
if (-not (Test-NodeArchive)) { throw "Bundled Node.js archive failed SHA-256 verification: $nodeArchiveName" }

New-Item -ItemType Directory -Force -Path $output | Out-Null
Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $release -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage, (Join-Path $stage 'bin'), (Join-Path $stage 'licenses'), (Join-Path $stage 'tools'), (Join-Path $stage 'tools\worker'), (Join-Path $stage 'config') | Out-Null

$nodeExtract = Join-Path $stage '.node-extract'
Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExtract -Force
$nodeSource = Join-Path $nodeExtract "node-v$NodeVersion-win-x64"
Copy-Item -LiteralPath (Join-Path $nodeSource 'node.exe') -Destination (Join-Path $stage 'bin\node.exe')
Copy-Item -LiteralPath (Join-Path $nodeSource 'LICENSE') -Destination (Join-Path $stage 'licenses\NODEJS-LICENSE.txt')
Remove-Item -LiteralPath $nodeExtract -Recurse -Force

Copy-Item -LiteralPath (Join-Path $root 'helper\START-TranslationHelper.vbs') -Destination (Join-Path $stage 'START-TranslationHelper.vbs')
Copy-Item -LiteralPath (Join-Path $root 'helper\STOP-TranslationHelper.vbs') -Destination (Join-Path $stage 'STOP-TranslationHelper.vbs')
Copy-Item -LiteralPath (Join-Path $root 'helper\README.md') -Destination (Join-Path $stage 'README.md')
Copy-Item -LiteralPath (Join-Path $root 'tools\watch-translation-jobs.ps1') -Destination (Join-Path $stage 'tools\watch-translation-jobs.ps1')
Copy-Item -LiteralPath (Join-Path $root 'tools\run-translation.ps1') -Destination (Join-Path $stage 'tools\run-translation.ps1')
Copy-Item -LiteralPath (Join-Path $root 'config\rules.example.json') -Destination (Join-Path $stage 'config\rules.example.json')
Copy-Item -Path (Join-Path $root 'tools\worker\*.cjs') -Destination (Join-Path $stage 'tools\worker')

[System.IO.File]::WriteAllText((Join-Path $stage 'VERSION.txt'), "$Version`r`n", (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $stage 'NODE-RUNTIME.txt'), "Node.js v$NodeVersion LTS win-x64`r`nSource: $nodeDownload`r`nArchive-SHA256: $($NodeArchiveSha256.ToLowerInvariant())`r`n", (New-Object System.Text.UTF8Encoding($false)))
$hashLines = Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($stage.Length + 1).Replace('\', '/')
    "$( (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant() )  $relative"
}
[System.IO.File]::WriteAllLines((Join-Path $stage 'SHA256SUMS.txt'), $hashLines, (New-Object System.Text.UTF8Encoding($false)))

New-Item -ItemType Directory -Force -Path $release | Out-Null
Copy-Item -Path (Join-Path $stage '*') -Destination $release -Recurse
Compress-Archive -LiteralPath $release -DestinationPath $archive -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Output "Release folder: $release"
Write-Output "Release archive: $archive"
Write-Output "Files: $((Get-ChildItem -LiteralPath $release -Recurse -File).Count)"
