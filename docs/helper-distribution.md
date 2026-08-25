# Helper distribution

## Separate deliverables

| Deliverable | Distribution channel | Purpose | Never includes |
| --- | --- | --- | --- |
| `PZ AI Translation Generator` | Steam Workshop | In-game settings, target selection, job requests, generated-pack loading | API keys, API client code, Node worker |
| `PZ-AI-Translator-Helper-<version>.zip` | GitHub Release | Local API requests, scanning, validation, generated-pack installation, pinned Node.js LTS runtime | API keys, user translation output, Steam mods |

Build 42 Workshop Lua cannot start a process or access Java HTTP APIs. The Helper is therefore a separate, explicitly started local application and is never auto-run by the Workshop mod.

## ZIP layout

```text
PZ-AI-Translator-Helper-<version>/
  bin/node.exe
  licenses/NODEJS-LICENSE.txt
  START-TranslationHelper.vbs
  STOP-TranslationHelper.vbs
  README.md
  VERSION.txt
  NODE-RUNTIME.txt
  SHA256SUMS.txt
  config/rules.example.json
  tools/
    watch-translation-jobs.ps1
    run-translation.ps1
    worker/*.cjs
```

`package-helper.ps1` stages only these files. It downloads the pinned official Windows x64 Node.js LTS archive, verifies its SHA-256 before extraction, and records the runtime source/version. It must never package API keys, user runtime data, or generated translation packs.

## Player runtime

Players do not install Node.js. The Helper invokes the bundled `bin/node.exe`; a system Node installation is only a development fallback when running source scripts outside the packaged Helper. A future release can evaluate a single signed Node SEA executable, but the current multi-worker and PowerShell watcher design deliberately preserves the lower-risk portable-runtime layout.

## Release command

```powershell
.\tools\package-helper.ps1 -Version 0.1.0-beta.1
```

Upload `dist\PZ-AI-Translator-Helper-0.1.0-beta.1.zip` as a GitHub Release asset. The Workshop description must link to that release and state that the complete ZIP includes its runtime.
