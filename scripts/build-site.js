'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'site');
if (path.dirname(output) !== root || path.basename(output) !== 'site') throw new Error('Unsafe build directory');
const PUBLIC_FILES = [
  'index.html','preview/u03/index.html','privacy.html','favicon.svg','css/rpg.css','css/receipt.css','css/adventure.css','css/bonus.css','assets/rpg/training-base.webp','assets/rpg/portrait-cadet.webp','assets/rpg/portrait-liaison.webp','assets/rpg/portrait-logistics.webp','assets/rpg/portrait-doctor.webp','assets/audio/morning-base.mp3','assets/audio/menu.mp3','assets/audio/confirm.mp3','assets/audio/clue.mp3','js/rpg_app.js','js/rpg_bonus_ui.js','js/data/rpg_maps.js','js/data/rpg_bonus_content.js','js/engine/rpg_bonus.js',
  'js/classroom_config.js','js/receipt_client.js','js/data/rpg_chapters.js',
  'js/engine/rpg_engine.js','js/engine/rpg_store.js','js/engine/rpg_world.js','js/engine/rpg_audio.js'
];
function build() {
  fs.mkdirSync(output, {recursive:true});
  const allowed = new Set([...PUBLIC_FILES, '.nojekyll', 'version.json']);
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const target = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink prohibited in public artifact');
      if (entry.isDirectory()) inspect(target);
      else if (!allowed.has(path.relative(output, target).split(path.sep).join('/'))) throw new Error('Unexpected artifact file: ' + entry.name);
    }
  }
  inspect(output);
  const hashes = {};
  for (const rel of PUBLIC_FILES) {
    const source = path.join(root, rel), target = path.join(output, rel);
    if (!fs.statSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()) throw new Error('Invalid public input: ' + rel);
    const bytes = fs.readFileSync(source);
    fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, bytes);
    hashes[rel] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  const version = {commit:process.env.GITHUB_SHA || null, builtAtUtc:new Date().toISOString(),
    attendanceCriterion:'完成當週指定關卡＋填完兩欄反思；不以答對率或戰術勝敗判定',
    sourceHashes:hashes};
  fs.writeFileSync(path.join(output,'version.json'), JSON.stringify(version,null,2)+'\n');
  return version;
}
if (require.main === module) console.log(JSON.stringify(build()));
module.exports = {build, PUBLIC_FILES, output};
