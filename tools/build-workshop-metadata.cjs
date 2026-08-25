'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const descriptionPath = path.join(repoRoot, 'docs', 'workshop-description-ko.txt');
const workshopRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.env.USERPROFILE || '', 'Zomboid', 'Workshop', 'PZAITranslationGenerator');
const workshopPath = path.join(workshopRoot, 'workshop.txt');

const description = fs.readFileSync(descriptionPath, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
const descriptionLines = description.split('\n').map((line) => `description=${line}`);
const metadata = [
  'version=1',
  'title=PZ AI Translation Generator',
  ...descriptionLines,
  'tags=Build 42',
  'visibility=public',
  '',
].join('\r\n');

fs.mkdirSync(workshopRoot, { recursive: true });
fs.writeFileSync(workshopPath, metadata, 'utf8');
console.log(workshopPath);
