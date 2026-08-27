const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const watcher = read('tools/watch-translation-jobs.ps1');
const runner = read('tools/run-translation.ps1');
const packager = read('tools/package-helper.ps1');
const launcher = read('helper/START-TranslationHelper.vbs');
const helperReadme = read('helper/README.md');
const workshop = read('docs/workshop-description-en.txt');

for (const source of [watcher, runner]) {
  assert.match(source, /bin\\node\.exe/, 'Helper PowerShell must prefer the bundled Node runtime');
  assert.match(source, /& \$nodeExe/, 'workers must execute through the resolved runtime');
  assert.doesNotMatch(source, /& node(?:\s|$)/m, 'Helper runtime must not directly depend on PATH node');
}
assert.match(packager, /NodeVersion = '24\.19\.0'/, 'Helper package must pin an LTS Node version');
assert.match(packager, /57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73/, 'Node archive must have a pinned SHA-256');
assert.match(packager, /licenses\\NODEJS-LICENSE\.txt/, 'Node redistribution license must ship with the runtime');
assert.match(launcher, /\\bin\\node\.exe/, 'the launcher must detect an incomplete Helper archive');
assert.doesNotMatch(helperReadme, /Install .*Node\.js|Node\.js 20 LTS/, 'players must not be instructed to install Node.js');
assert.match(helperReadme, /no separate Node\.js installation is required/, 'Helper instructions must explain the bundled runtime');
assert.doesNotMatch(workshop, /install Node\.js/i, 'Workshop requirements must not ask players to install Node.js');
assert.match(workshop, /No separate Node\.js installation is required/, 'Workshop copy must explain that the Helper is self-contained');

console.log('helper runtime packaging test passed');
