'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sources = [
  'js/data/course_schedule.js',
  'collector/chapter_access.js',
  'js/data/rpg_chapters.js',
  'js/engine/rpg_engine.js',
  'collector/core.js',
  'collector/submission_page.js',
  'collector/adapter.gs'
];
const sections = sources.map(relative => {
  const text = fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
  return '// Source: ' + relative + '\n' + text + '\n';
});
const generated = path.join(root, 'collector', 'generated');
fs.mkdirSync(generated, { recursive: true });
const code = '// Generated locally; no OAuth, deployment or live Sheet access.\n' + sections.join('\n');
fs.writeFileSync(path.join(generated, 'Code.gs'), code, 'utf8');
fs.copyFileSync(path.join(root, 'collector', 'appsscript.json'), path.join(generated, 'appsscript.json'));
const evidence = {
  algorithm: 'SHA256',
  sources: sources.map(relative => ({ path: relative,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex') })),
  generated: { path: 'collector/generated/Code.gs',
    sha256: crypto.createHash('sha256').update(Buffer.from(code, 'utf8')).digest('hex') }
};
fs.writeFileSync(path.join(generated, 'build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
process.stdout.write('Collector bundle created; no live deployment. SHA256 ' + evidence.generated.sha256 + '\n');
