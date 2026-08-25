# PZ AI Translation Generator Helper

This local helper processes translation requests made by the **PZ AI Translation Generator** Steam Workshop mod for Project Zomboid **Build 42 Stable 42.20.x and later**.

## Not included

- API keys
- Generated `PZAITranslationGenerated` translation packs
- Workshop source mods or Project Zomboid game files

API keys and translation results remain on each user's PC under `C:\Users\<user>\Zomboid`.

## Requirements

1. Subscribe to and enable **PZ AI Translation Generator** in Steam Workshop.
2. Use Windows 10/11 x64. The complete Helper ZIP already includes its verified Node.js runtime; no separate Node.js installation is required.
3. Extract this entire ZIP to a writable folder outside Steam and Program Files, for example `C:\Users\<user>\Documents\PZ-AI-Translation-Generator-Helper`.

## Use

1. Double-click `START-TranslationHelper.vbs`. After the confirmation message, the helper keeps running in the background.
2. In-game, save your provider, model, API key, and target language, then run **Test connection**.
3. Open the **AI Translation Generator** tab in the character information window, select mods, and choose **Queue translation**.
4. Wait until Translation status shows `complete`.
5. Optionally review/correct generated results, page through every repeated-phrase match, explicitly confirm the total match count before bulk saving, or scan selected mods for review-only hard-coded Lua candidates.
6. Enable `PZAITranslationGenerated`, return to the main menu, then enter the world again.

## Stop

Double-click `STOP-TranslationHelper.vbs`. It stops only this helper and never closes unrelated PowerShell windows.

## Troubleshooting

- `The bundled runtime is missing`: download the Helper ZIP again and extract the entire archive. Do not run the VBS files from inside the ZIP.
- Stuck at `queued`: start the helper. If it says it is already running, it is ready for requests.
- Translation, resume, and connection-test buttons stay disabled while a request is queued or running. The Helper claims each job before reading it so a later request cannot overwrite the active request.
- `429` or `456`: the API provider has rejected the request because of a quota or rate limit. Check that provider's dashboard for the selected project and model.
- No translation appears: enable the generated pack, return to the main menu, and enter the world again.
- Some text can still remain English when a source mod displays a literal Lua string rather than a `Translate/EN` localization key. The Helper never edits Workshop source mods, so retrying translation cannot change that case. SaucedCarts' hard-coded `Shopping Cart` cart name is one known example; its normal tooltips and localization keys can still translate.
- Review corrections rebuild the generated overlay and update local translation memory without another provider request. Empty or placeholder-breaking edits are rejected.
- If generated mods disagree on one global translation key, that key is omitted rather than chosen arbitrarily. The in-game status shows the conflict count; details remain in `PZAITranslationGenerated\pack-report.json`.
- The hard-coded Lua scanner only reports likely UI literals and saves the user's explicit selection. It does not send those strings to a provider or patch a Workshop mod.
