[CmdletBinding()]
param(
    [string]$Version = '0.1.0-beta.1',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]*$') { throw 'Version may contain only letters, numbers, dots, and hyphens.' }

$output = [System.IO.Path]::GetFullPath($OutputDirectory)
$releaseName = "PZ-AI-Translator-Helper-$Version"
$stage = Join-Path $output "$releaseName.staging"
$release = Join-Path $output $releaseName
$archive = Join-Path $output "$releaseName.zip"

New-Item -ItemType Directory -Force -Path $output | Out-Null
Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $release -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage, (Join-Path $stage 'tools'), (Join-Path $stage 'tools\worker'), (Join-Path $stage 'config') | Out-Null

Copy-Item -LiteralPath (Join-Path $root 'helper\START-TranslationHelper.vbs') -Destination (Join-Path $stage 'START-TranslationHelper.vbs')
Copy-Item -LiteralPath (Join-Path $root 'helper\STOP-TranslationHelper.vbs') -Destination (Join-Path $stage 'STOP-TranslationHelper.vbs')
Copy-Item -LiteralPath (Join-Path $root 'helper\README.md') -Destination (Join-Path $stage 'README.md')
Copy-Item -LiteralPath (Join-Path $root 'tools\watch-translation-jobs.ps1') -Destination (Join-Path $stage 'tools\watch-translation-jobs.ps1')
Copy-Item -LiteralPath (Join-Path $root 'tools\run-translation.ps1') -Destination (Join-Path $stage 'tools\run-translation.ps1')
Copy-Item -LiteralPath (Join-Path $root 'config\rules.example.json') -Destination (Join-Path $stage 'config\rules.example.json')
Copy-Item -Path (Join-Path $root 'tools\worker\*.cjs') -Destination (Join-Path $stage 'tools\worker')

[System.IO.File]::WriteAllText((Join-Path $stage 'VERSION.txt'), "$Version`r`n", (New-Object System.Text.UTF8Encoding($false)))
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
