# PZ Auto Mode Translator

A Project Zomboid **Build 42 Stable 42.20.x and later** translation companion. It finds untranslated strings in active mods, translates them with an AI provider chosen by the user, and creates a separate local overlay mod without modifying Workshop originals.

## Current status

- Build 42.20.3 localization loading and local-file access verified.
- Scans active mods for `Translate/EN` entries and Build 42 `craftRecipe` names.
- Preserves existing target-language translations and reuses validated local translation memory.
- Generates the local `PZAITranslationGenerated` overlay pack.
- Supports Gemini, DeepL, OpenAI, Claude, DeepSeek, Yandex Cloud Translate, and OpenAI-compatible providers.
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
- Your own provider API key and account. A ChatGPT subscription is not an OpenAI API billing account.

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

Every scan also writes `Zomboid\Lua\PZAITranslator_catalog.ini`. The in-game target selector reads this local catalog and displays, for each scanned mod, existing translations, translations supplied by another overlay, reusable generated/memory translations, and strings that still need an API request.

The selector supports text and translation-state filters plus load order, recent update, recent Steam install/update, API-character, and API-candidate sorting. Workshop timestamps come from Steam's local `appworkshop_108600.acf`; local mods use their directory modification time. Steam does not keep a reliable local subscription timestamp, so "recent Steam install/update" is intentionally not labelled as subscription order.

Existing target-language strings are always preserved and excluded from API requests. Partial translations are scanned by default, so only their missing strings are sent; the Mod Options "Skip mods that already provide the target language" setting remains available when an entire mod should be skipped deliberately.

### Safe normalization rules

`config\rules.example.json` can pre-translate repeated, mechanically safe phrases before an API request. Rules run in priority order and can be limited to a translation category such as `Recipes`. Vehicle recipe rules use a two-stage guard: a known vehicle-part pattern first adds the `vehicle-recipe-term` tag, then the `Make …` suffix rule is allowed to change that same recipe to `… 제작`. An unrelated recipe such as `Make Wooden Chair` remains an API candidate. Add feedback-driven patterns as a new category-scoped vehicle-part rule with that tag; do not broaden the guarded `Make` rule into a global substitution.

`-Install` replaces only `$env:USERPROFILE\Zomboid\mods\PZAITranslationGenerated`. Enable that generated mod, return to the main menu, then enter the world again to reload translations.

### Localization limitation: hard-coded Lua text

The generated overlay translates localization resources that a mod exposes in
`Translate/EN` JSON, legacy Lua-table TXT resources such as `IG_UI_EN.txt` and
`Recipes_EN.txt`, and supported Build 42 craft-recipe names. This includes the
vehicle names, parts, and recipe labels authored by KI5-style vehicle mods. It
does not modify Workshop/source mods. A mod can bypass those resources by
displaying a literal string from Lua, in which case that specific text cannot
be translated by this tool's overlay.

For example, **SaucedCarts** supplies the `Shopping Cart` item-name key and
the generated overlay translates it to Korean, but its cart UI also reads the
hard-coded Lua value `name = "Shopping Cart"`. Tooltips and normal translation
keys can therefore be Korean while that particular displayed name remains
English. This is a source-mod compatibility limitation, not a failed API job;
re-running translation will not change hard-coded text. A separate
compatibility patch would be required, while still leaving the Workshop source
mod untouched.

## In-game flow

1. Start the separate Helper with `START-TranslationHelper.vbs` from the extracted release ZIP.
2. In Mod Options, open **자동 모드 번역기**, configure the provider, model, API key, and target language, then run **Test connection**.
3. In the character information window, open **AI Translator**, select target mods, and queue translation.
4. Wait for Translation status to show `complete`.
5. Enable `PZAITranslationGenerated`, return to the main menu, and enter the world again.
6. Stop the background Helper with `STOP-TranslationHelper.vbs` when it is no longer needed.

### Resume after a quota error

Completed batches are saved locally in the Helper's `runtime\translation-memory.json` after every successful provider batch. If a provider returns a quota or rate-limit error, change the provider/model in Mod Options, save it, and choose **Resume interrupted translation** with the same selected mods and target language. The next scan reuses validated checkpoints and sends only still-pending strings to the newly selected model.

## Provider models

`gemini-2.5-flash-lite` is the default Gemini model. Claude uses the Messages API and defaults to `claude-haiku-4-5`; DeepSeek uses its OpenAI-compatible endpoint and defaults to `deepseek-v4-flash`. DeepL uses translation modes rather than chat-model IDs. Yandex Cloud Translate uses its v2 translation service rather than a selectable model ID. OpenAI-compatible providers require a model ID accepted by that provider.

The Helper is local middleware: it sends only unresolved strings using the API key saved in the player's local Zomboid data directory. It does not provide translations or an API account. Provider quotas, billing, and available models are controlled by the player's provider account.

### Fixed request sizing

Request size is selected by the Helper, not an in-game setting. It keeps the existing 70-second request/mod pacing and uses conservative source-text limits: Gemini 100 strings / 8,000 characters, DeepL 100 / 10,000, OpenAI and DeepSeek 100 / 8,000, Claude 50 / 6,000, Yandex 100 / 8,000, and unknown OpenAI-compatible endpoints 20 / 3,000. Batches never mix mods. These limits reduce request count without overriding an account's quota; a 429 can still mean an exhausted provider quota.

To fetch account-visible model IDs into the game-side model list:

```powershell
node .\tools\worker\list-provider-models.cjs
```

The worker stores that local catalog under `Zomboid\Lua\PZAITranslator_models.ini`; it does not write API keys to the repository.
