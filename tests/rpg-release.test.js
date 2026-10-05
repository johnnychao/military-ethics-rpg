'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(p,'utf8');
test('formal name appears in title, header, accessible name, privacy and new exports',()=>{
 const html=read('index.html');assert.match(html,/<title>國醫軍事倫理冒險｜2D 策略 RPG<\/title>/);assert.match(html,/aria-label="國醫軍事倫理冒險"/);assert.match(html,/<strong>國醫軍事倫理冒險<\/strong>/);assert.match(read('privacy.html'),/<title>紀錄與隱私｜國醫軍事倫理冒險<\/title>/);assert.match(read('js/rpg_app.js'),/download\('國醫軍事倫理冒險-/);assert.match(read('js/rpg_bonus_ui.js'),/國醫軍事倫理冒險-支線收藏\.json/);
});
test('formal release keeps original persistence keys, format and activated u03 collector bytes',()=>{
 assert.match(read('js/engine/rpg_store.js'),/const KEY = 'ndmu-ethics-rpg:v1'/);assert.match(read('js/engine/rpg_store.js'),/const FORMAT = 'ndmu-ethics-rpg'/);assert.match(read('js/engine/rpg_avatar.js'),/const KEY='ndmu-ethics-rpg:avatar:v1'/);assert.match(read('js/engine/rpg_bonus.js'),/const STORAGE_KEY = 'ndmu-ethics-rpg:bonus:v1'/);
 const b=fs.readFileSync('js/classroom_config.js');const sha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');assert.equal(sha,'439678662216c5e29d092bc2c68fd13a200923d9');assert.ok(!read('index.html').includes('ClassroomConfig={enabled:false'));
});
test('both previews have the new visible name while collection remains off and progress isolated',()=>{for(const file of['preview/u03/index.html','preview/avatar-audio/index.html']){const html=read(file);assert.match(html,/<title>國醫軍事倫理冒險｜2D 策略 RPG<\/title>/);assert.match(html,/window.ClassroomConfig=\{enabled:false,collectorUrl:''/);assert.ok(!html.includes("const KEY = 'ndmu-ethics-rpg:v1'"));assert.ok(!html.includes("const KEY='ndmu-ethics-rpg:avatar:v1'"));}});
