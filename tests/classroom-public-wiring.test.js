'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
test('authorized class sync contains only public routing',()=>{
 const config=require('../js/classroom_sync_config.js');
 assert.equal(config.enabled,true);assert.deepEqual(Object.keys(config).sort(),['bridgeOrigin','enabled','endpoint']);
 assert.equal(new URL(config.endpoint).origin,'https://script.google.com');
 assert.match(config.bridgeOrigin,/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/);
});
test('disabled boot makes no DOM, storage, network or game-hook calls',()=>{
 const script=fs.readFileSync(path.join(root,'js/classroom_sync_boot.js'),'utf8');
 const fail=()=>{throw new Error('MUST_NOT_TOUCH');};
 vm.runInNewContext(script,{ClassroomSyncConfig:{enabled:false},EthicsClassroomClient:{mountPublic:fail},document:{createElement:fail},localStorage:{getItem:fail}});
});
test('public sync hooks install after store definitions but before app construction',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const store=html.indexOf('src="js/engine/rpg_store.js"'),client=html.indexOf('src="js/classroom_sync_client.js"'),boot=html.indexOf('src="js/classroom_sync_boot.js"'),app=html.indexOf('src="js/rpg_app.js"');
 assert.ok(store>0&&store<client&&client<boot&&boot<app);
 const {PUBLIC_FILES}=require('../scripts/build-site.js');
 ['js/classroom_sync_config.js','js/classroom_sync_client.js','js/classroom_sync_boot.js'].forEach(x=>assert.ok(PUBLIC_FILES.includes(x)));
});

test('both visual previews disable class sync and isolate the persistent sync queue',()=>{
 for(const name of ['u03','avatar-audio']){
  const html=fs.readFileSync(path.join(root,'preview',name,'index.html'),'utf8');
  assert.ok(html.includes("window.ClassroomSyncConfig={enabled:false,endpoint:'',bridgeOrigin:''};"));
  assert.ok(!html.includes("const STORAGE_KEY = 'ndmu-ethics-classroom:queue:v1'"));
 }
});
