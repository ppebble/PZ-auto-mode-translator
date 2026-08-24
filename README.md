# PZ AI Translation Generator

A Project Zomboid **Build 42 Stable 42.20.x and later** translation companion. It finds untranslated strings in active mods, translates them with an AI provider chosen by the user, and creates a separate local overlay mod without modifying Workshop originals.

## Current status

- Build 42.20.3 localization loading and local-file access verified.
- Scans active mods for `Translate/EN` entries and Build 42 `craftRecipe` names.
- Preserves existing target-language translations and reuses validated local translation memory.
- Provides local review, direct edits, and previewed bulk correction of repeated translation mistakes without another provider call.
- Detects likely hard-coded Lua UI literals for explicit review without modifying source mods.
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

Existing target-language strings are always preserved and excluded from API requests. Partial translations are scanned by default, so only their missing strings are sent. Users explicitly choose the mods to inspect; one existing translated key never hides the remaining missing keys in that selected mod.

### Safe normalization rules

`config\rules.example.json` can pre-translate repeated, mechanically safe phrases before an API request. Rules run in priority order and can be limited to a translation category such as `Recipes`. Vehicle recipe rules use a two-stage guard: a known vehicle-part pattern first adds the `vehicle-recipe-term` tag, then the `Make …` suffix rule is allowed to change that same recipe to `… 제작`. An unrelated recipe such as `Make Wooden Chair` remains an API candidate. Add feedback-driven patterns as a new category-scoped vehicle-part rule with that tag; do not broaden the guarded `Make` rule into a global substitution.

Regex and glossary normalization remains an internal, shipped Helper rule set rather than a user-facing editor. Players use **Bulk correct translations** to preview a literal phrase replacement across generated translations, optionally limited to a mod ID and/or category. Saving creates ordinary review edits; applying them rebuilds the generated overlay without another provider request.

`-Install` replaces only `$env:USERPROFILE\Zomboid\mods\PZAITranslationGenerated`. Enable that generated mod, return to the main menu, then enter the world again to reload translations.

### Localization limitation: hard-coded Lua text

The generated overlay translates localization resources that a mod exposes in
`Translate/EN` JSON, legacy Lua-table TXT resources such as `IG_UI_EN.txt` and
`Recipes_EN.txt`, and supported Build 42 craft-recipe names. This includes the
vehicle names, parts, and recipe labels authored by KI5-style vehicle mods. It
does not modify Workshop/source mods. A mod can bypass those resources by
displaying a literal string from Lua, in which case that specific text cannot
be replaced by this tool's translation overlay. **Review hardcoded Lua
strings** scans selected mods only for known UI calls and display-field assignments, then lets
the user explicitly select candidates. Detection and selection never send the
literal to a provider and never patch the source mod.

For example, **SaucedCarts** supplies the `Shopping Cart` item-name key and
the generated overlay translates it to Korean, but its cart UI also reads the
hard-coded Lua value `name = "Shopping Cart"`. Tooltips and normal translation
keys can therefore be Korean while that particular displayed name remains
English. This is a source-mod compatibility limitation, not a failed API job;
re-running translation will not change hard-coded text. A separate
compatibility patch would be required, while still leaving the Workshop source
mod untouched.

### Translation review and local correction

After every completed translation, the Helper exports validated and
`needs_review` records to `Zomboid\Lua\PZAITranslator_review.ini`. The in-game
review panel can filter provider results, failed validation, and locally edited
records. **Apply saved edits** validates placeholders, updates translation
memory, rebuilds the generated overlay, and installs it without calling a
provider. Invalid or empty edits are rejected and remain visible.

**Bulk correct translations** performs literal text replacement, not regular
expression editing. Enter the mistranslated phrase and its correction, add an
optional exact mod ID/category scope, and choose **Preview**. Only after the
matching current/updated translations have been reviewed should **Save
corrections** be used. The saved results are normal review edits and are
installed by **Apply saved edits**.

## In-game flow

1. Start the separate Helper with `START-TranslationHelper.vbs` from the extracted release ZIP.
2. In Mod Options, open **PZ AI 번역팩 생성기**, configure the provider, model, API key, and target language, then run **Test connection**.
3. In the character information window, open **AI Translation Generator**, select target mods, and queue translation.
4. Wait for Translation status to show `complete`.
5. Optionally review generated translations, bulk-correct a repeated mistranslation, or scan selected mods for hard-coded Lua candidates.
6. Enable `PZAITranslationGenerated`, return to the main menu, and enter the world again.
7. Stop the background Helper with `STOP-TranslationHelper.vbs` when it is no longer needed.

### Resume after a quota error

Completed batches are saved locally in the Helper's `runtime\translation-memory.json` after every successful provider batch. If a provider returns a quota or rate-limit error, change the provider/model in Mod Options, save it, and choose **Resume interrupted translation** with the same selected mods and target language. The next scan reuses validated checkpoints and sends only still-pending strings to the newly selected model.

Generated or memory text that is identical to a human-readable English source is not considered translated. A later Resume scan returns those records to `pending` and sends only that reduced list again. Script identifiers whose source is the key itself and vehicle model-name identities are exempt, while vehicle parts, recipes, settings, and descriptions must actually change. Placeholder mismatches and untranslated provider responses remain visible in the failed count and are omitted from the generated pack.

## Provider models

`gemini-2.5-flash-lite` is the default Gemini model. Claude uses the Messages API and defaults to `claude-haiku-4-5`; DeepSeek uses its OpenAI-compatible endpoint and defaults to `deepseek-v4-flash`. DeepL uses translation modes rather than chat-model IDs. Yandex Cloud Translate uses its v2 translation service rather than a selectable model ID. OpenAI-compatible providers require a model ID accepted by that provider.

The Helper is local middleware: it sends only unresolved strings using the API key saved in the player's local Zomboid data directory. It does not provide translations or an API account. Provider quotas, billing, and available models are controlled by the player's provider account.

### Fixed request sizing

Request size is selected by the Helper, not an in-game setting. It keeps the existing 70-second request pacing. Gemini, OpenAI, DeepSeek, Claude, and DeepL use up to 1,600 strings / 64,000 source characters; Yandex uses up to 1,600 / 10,000 because its translation API caps the combined source strings at 10,000 characters. Unknown OpenAI-compatible endpoints use a conservative 400 / 16,000 fallback because their context and output limits cannot be inferred safely. Every provider combines queued mods until its item or character limit is reached. Record IDs still preserve each mod's checkpoint and output destination, so a mixed request does not merge generated files or translation-memory identities. Claude allows up to 32,768 output tokens for these larger structured responses. These limits reduce request count without overriding an account's quota; a 429 can still mean an exhausted provider quota, and an incomplete large response remains resumable from the last completed batch.

To fetch account-visible model IDs into the game-side model list:

```powershell
node .\tools\worker\list-provider-models.cjs
```

The worker stores that local catalog under `Zomboid\Lua\PZAITranslator_models.ini`; it does not write API keys to the repository.
