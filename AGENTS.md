# PZ AI Translation Generator Development Guide

## Product contract

This is a local Project Zomboid Build 42 translation-pack authoring tool, **not**
a tool that retranslates every active mod. It lets a player select mods whose
strings are absent from existing translation packs, then creates and installs
their own local `PZAITranslationGenerated` overlay.

- Never modify Workshop or source mods.
- Preserve a target-language string already supplied by the source mod or an
  active external translation overlay; do not send that key to an API.
- Reuse validated generated translations/translation memory before requesting
  a provider.
- Only `pending` records are API candidates.

## Architecture and ownership

| Area | Source of truth |
| --- | --- |
| Game UI/local INI bridge | `mods/PZAITranslator/common/media/lua/` |
| Scan/catalog generation | `tools/worker/scan-b42.cjs` |
| Provider batching, pacing, validation | `tools/worker/translate-b42.cjs` |
| Generated overlay writer | `tools/worker/materialize-b42.cjs` |
| Background job watcher/status bridge | `tools/watch-translation-jobs.ps1` |
| End-to-end local runner | `tools/run-translation.ps1` |
| Fixture regression test | `tests/scan-catalog.test.cjs` |

The game reads and writes `C:\Users\<user>\Zomboid\Lua\PZAITranslator_*.ini`.
The helper, Node workers, API credentials, and network requests must remain
outside the Workshop/game mod.

## Rate-limit policy

Most users will use free API keys. Treat token and request quotas as scarce.

- Keep requests split by mod, item count, and character count.
- Default to one request every **70 seconds** (`minRequestIntervalMs`) and the
  same pause between mods (`modPauseMs`); do not lower these defaults without
  an explicit provider-limit justification.
- Background operation is intentional: players should be able to continue
  playing while the helper waits and translates.
- Status must show planned/next wait times and retain the provider HTTP code
  on failure. Do not collapse a provider error into a generic failure.
- A 429 can mean a minute rate limit or an exhausted daily/account quota;
  pacing cannot bypass the latter.

## Catalog and selector contract

`scan-b42.cjs` writes `PZAITranslator_catalog.ini`. It must include every
eligible active mod, including zero-candidate mods, with candidate count,
existing/reused/pending counts, API-character estimate, and timestamp metadata.
The selector consumes this file and must preserve the user's explicit selected
mod IDs across search, sorting, and filtering.

Steam `appworkshop_108600.acf` supports installed/update timestamps, not a
reliable local subscription timestamp. Label this sort as install/update, not
subscription order.

## Verification and deployment

Before claiming a change is complete:

1. Run `node --check` for changed Node workers.
2. Run `node tests/scan-catalog.test.cjs` for scanner/catalog behavior.
3. Parse changed PowerShell with `[scriptblock]::Create(...)` and run
   `git diff --check`.
4. For a game-facing change, sync the changed Lua file(s) to
   `C:\Users\<user>\Zomboid\mods\PZAITranslator`; restart the game to reload Lua.
5. For helper changes, sync source files to the extracted Helper directory and
   restart `watch-translation-jobs.ps1`; never copy secrets from local provider
   configuration into source control or release artifacts.

Report source tests, installed-file hash checks, Helper status, and separately
whether an in-game interaction was actually tested.
