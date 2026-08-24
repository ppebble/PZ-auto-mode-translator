# Helper distribution

## Separate deliverables

| Deliverable | Distribution channel | Purpose | Never includes |
| --- | --- | --- | --- |
| `PZ AI Translation Generator` | Steam Workshop | In-game settings, target selection, job requests, generated-pack loading | API keys, API client code, Node worker |
| `PZ-AI-Translator-Helper-<version>.zip` | GitHub Release | Local API requests, scanning, validation, generated-pack installation | API keys, user translation output, Steam mods |

Build 42 Workshop Lua cannot start a process or access Java HTTP APIs. The Helper is therefore a separate, explicitly started local application and is never auto-run by the Workshop mod.

## ZIP layout

```text
PZ-AI-Translator-Helper-<version>/
  START-TranslationHelper.vbs
  STOP-TranslationHelper.vbs
  README.md
  VERSION.txt
  SHA256SUMS.txt
  config/rules.example.json
  tools/
    watch-translation-jobs.ps1
    run-translation.ps1
    worker/*.cjs
```

`package-helper.ps1` stages only these files. It must never package API keys, runtime data, or generated translation packs.

## Beta dependency

The first beta requires Node.js 20 LTS or later. The worker uses Node's built-in `fetch` and `AbortSignal.timeout`, with no npm dependencies or administrator installation requirement.

A later release can evaluate a signed Windows executable or Node SEA bundle to remove the Node installation requirement. That is deliberately separate from beta distribution because it needs binary security, signing, and update-policy review.

## Release command

```powershell
.\tools\package-helper.ps1 -Version 0.1.0-beta.1
```

Upload `dist\PZ-AI-Translator-Helper-0.1.0-beta.1.zip` as a GitHub Release asset. The Workshop description must link to that release and state the Node.js requirement.
