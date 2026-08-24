const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shared = fs.readFileSync(
  path.join(__dirname, '..', 'mods', 'PZAITranslator', 'common', 'media', 'lua', 'shared', 'PZAITranslator.lua'),
  'utf8',
);
const watcher = fs.readFileSync(path.join(__dirname, '..', 'tools', 'watch-translation-jobs.ps1'), 'utf8');

assert.match(shared, /function PZAITranslator\.isJobBusy\(\)/, 'Lua bridge must expose one authoritative busy check');
assert.match(shared, /getFileReader\(fileName, false\)/, 'busy checks must not create empty job files while probing existence');
assert.match(shared, /controlFileExists\(PZAITranslator\.jobFile\)/, 'an unclaimed job file must block another request');
assert.match(shared, /controlFileExists\(PZAITranslator\.claimedJobFile\)/, 'a Helper-claimed job must remain busy until it is archived');
assert.match(shared, /if PZAITranslator\.isJobBusy\(\) then return false end/, 'every local job writer must refuse to overwrite active work');

assert.match(watcher, /PZAITranslator_job\.ini\.processing/, 'Helper must use a durable claimed-job path');
assert.match(watcher, /Move-Item -LiteralPath \$job -Destination \$claimedJob/, 'Helper must atomically claim the public job file before reading it');
assert.match(watcher, /\$pendingRequest\.requested -ne '1'/, 'Helper must wait for the game writer completion marker before claiming a job');
assert.match(watcher, /PZAITranslator_job\.ini\.incomplete/, 'stale partial jobs must be quarantined instead of retried forever');
assert.match(watcher, /Read-Ini \$activeJob/, 'Helper must process the claimed copy, not the public queue path');
assert.doesNotMatch(watcher, /Move-Item -LiteralPath \$job -Destination \(\$job \+ '\.(?:done|failed|paused)'\)/, 'job completion must never rename a newer public request');

const missingKeyIndex = watcher.indexOf("if ($text -match 'No provider API key|API key and model are required|API key is empty')");
const rejectedKeyIndex = watcher.indexOf("if ($text -match 'HTTP 401|HTTP 403|API key')");
assert.ok(missingKeyIndex >= 0 && rejectedKeyIndex > missingKeyIndex, 'missing-key errors must be classified before provider rejection');
assert.match(watcher, /conflicts/, 'Helper status must retain generated-pack conflict counts');

console.log('job safety test passed');
