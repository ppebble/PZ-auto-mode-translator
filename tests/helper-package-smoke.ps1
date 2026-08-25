[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleasePath
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release = (Resolve-Path -LiteralPath $ReleasePath).Path
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'runtime\helper-package-smoke'))
$releaseRuntime = [System.IO.Path]::GetFullPath((Join-Path $release 'runtime'))

foreach ($path in @($testRoot, $releaseRuntime)) {
    if (-not $path.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Smoke-test path escaped the repository: $path"
    }
}

Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $releaseRuntime -Recurse -Force -ErrorAction SilentlyContinue

try {
    $zomboidHome = Join-Path $testRoot 'Zomboid'
    $mod = Join-Path $zomboidHome 'mods\RuntimeProbe\common'
    $translate = Join-Path $mod 'media\lua\shared\Translate\EN'
    New-Item -ItemType Directory -Force -Path $translate, (Join-Path $zomboidHome 'Lua') | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $mod 'mod.info'), "name=Runtime Probe`nid=RuntimeProbe`n", (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText((Join-Path $translate 'UI.json'), '{"UI_RuntimeProbe":"Hello survivor"}', (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText((Join-Path $zomboidHome 'mods\default.txt'), "mod=RuntimeProbe`n", (New-Object System.Text.UTF8Encoding($false)))

    $oldPath = $env:PATH
    $powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    try {
        $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
        if ($null -ne (Get-Command node -ErrorAction SilentlyContinue)) { throw 'System Node unexpectedly remained on the stripped PATH.' }
        & $powerShellExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $release 'tools\run-translation.ps1') -ZomboidHome $zomboidHome -TargetLanguage KO -DryRun
        if ($LASTEXITCODE -ne 0) { throw "Packaged dry-run failed with exit code $LASTEXITCODE." }
    } finally {
        $env:PATH = $oldPath
    }

    $manifest = Get-Content -LiteralPath (Join-Path $releaseRuntime 'translated-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
    if ($manifest.records.Count -ne 1 -or $manifest.records[0].target -ne '[DRY-RUN KO] Hello survivor') {
        throw 'Packaged Helper produced unexpected dry-run output.'
    }
    Write-Output 'Bundled-runtime smoke test passed without system Node on PATH.'
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $releaseRuntime -Recurse -Force -ErrorAction SilentlyContinue
}
