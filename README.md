# PZ Auto Mode Translator

A Project Zomboid **Build 42 Stable 42.20.x and later** translation companion. It finds untranslated strings in active mods, translates them with an AI provider chosen by the user, and creates a separate local overlay mod without modifying Workshop originals.

## Current status

- Build 42.20.3 localization loading and local-file access verified.
- Scans active mods for `Translate/EN` entries and Build 42 `craftRecipe` names.
- Preserves existing target-language translations and reuses validated local translation memory.
- Generates the local `PZAITranslationGenerated` overlay pack.
- Supports Gemini, DeepL, and OpenAI-compatible providers.
- Includes an external local Helper because Workshop Lua cannot make HTTP calls or start local processes.

## Safety rules

1. Workshop source mods and Project Zomboid installation files are never modified.
2. API keys are stored only in the user's local Zomboid data directory and are not committed.
3. Only translations that pass placeholder and formatting validation are written to the generated pack.
4. Scanning is offline by default; API calls run only after a user queues a translation job.
5. Multiplayer behavior must be tested separately before any server-focused release.

## Requirements

- Project Zomboid Build 42 Stable 42.20.x or later
- Node.js 20 LTS or later for the external Helper
- A provider API key; a ChatGPT subscription is not an OpenAI API billing account

## Developer setup

```powershell
.\tools\setup.ps1 -CheckOnly
.\tools\inspect-b42.ps1
.\tools\setup.ps1 -PrintPaths
```

The known game path is `C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid`. The supported local data path is `$env:USERPROFILE\Zomboid`.

## Build the Helper release ZIP

```powershell
.\tools\package-helper.ps1 -Version 0.1.0-beta.1
```

This creates `dist\PZ-AI-Translator-Helper-0.1.0-beta.1.zip`. The ZIP contains only the helper launcher, workers, default rules, checksums, and an English user README. It never contains API keys, runtime data, or generated translation packs. See [Helper distribution](docs/helper-distribution.md).

## Manual scan and translation

```powershell
node .\tools\worker\scan-b42.cjs `
  --zomboid-home "$env:USERPROFILE\Zomboid" `
  --target-language KO `
  --output .\runtime\scan-manifest.json

.\tools\run-translation.ps1 -Install
```

`-Install` replaces only `$env:USERPROFILE\Zomboid\mods\PZAITranslationGenerated`. Enable that generated mod, return to the main menu, then enter the world again to reload translations.

## In-game flow

1. Start the separate Helper with `START-TranslationHelper.vbs` from the extracted release ZIP.
2. In Mod Options, open **자동 모드 번역기**, configure the provider, model, API key, and target language, then run **Test connection**.
3. In the character information window, open **AI Translator**, select target mods, and queue translation.
4. Wait for Translation status to show `complete`.
5. Enable `PZAITranslationGenerated`, return to the main menu, and enter the world again.
6. Stop the background Helper with `STOP-TranslationHelper.vbs` when it is no longer needed.

## Provider models

`gemini-2.5-flash-lite` is the default Gemini model. DeepL uses translation modes rather than chat-model IDs. OpenAI-compatible providers require a model ID accepted by that provider.

To fetch account-visible model IDs into the game-side model list:

```powershell
node .\tools\worker\list-provider-models.cjs
```

The worker stores that local catalog under `Zomboid\Lua\PZAITranslator_models.ini`; it does not write API keys to the repository.