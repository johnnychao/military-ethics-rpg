'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {PUBLIC_FILES}=require('../scripts/build-site');
const root=path.resolve(__dirname,'..');
test('Pages allowlist cannot publish collector code, textbooks, backups or exports',()=>{
 assert.ok(PUBLIC_FILES.includes('index.html')); assert.ok(PUBLIC_FILES.includes('privacy.html'));
 assert.equal(new Set(PUBLIC_FILES).size,PUBLIC_FILES.length);
 PUBLIC_FILES.forEach(rel=>assert.ok(!/(collector|tests|教材|備份|\\.pdf$|\\.csv$|\\.json$|\\.gs$|\\.env)/i.test(rel)));
});
test('Public entry loads only allowlisted local scripts/styles',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"]+\\.(?:js|css))"/g)){
  assert.ok(PUBLIC_FILES.includes(match[1]),'Unapproved loaded asset '+match[1]);
 }
 assert.ok(!/<script[^>]+src="https?:/i.test(html));
 assert.ok(!/<link[^>]+href="https?:/i.test(html));
});
test('Unactivated classroom configuration fails closed without student collection',()=>{
 const vm=require('node:vm'), sandbox={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/classroom_config.js'),'utf8'),sandbox);
 const config=sandbox.RPGClassroomConfig||sandbox.RPG_CLASSROOM_CONFIG||sandbox.ClassroomConfig;
 assert.ok(config,'Expected public classroom config');
 assert.equal(config.enabled,false); assert.equal(config.collectorUrl,'');
 assert.equal(config.sessionId,''); assert.equal(config.assignedChapter,'');
});

