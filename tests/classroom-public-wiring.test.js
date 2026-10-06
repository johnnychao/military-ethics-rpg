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
test('legacy safety fallback disables automatic class sync while keeping original manual collection',()=>{
 const html=fs.readFileSync(path.join(root,'legacy-v1/index.html'),'utf8');
 assert.ok(!/<script[^>]+src="js\/classroom_sync_(config|client|boot)\.js"/.test(html));
 assert.match(html,/src="js\/receipt_client\.js"/);assert.match(html,/src="js\/classroom_config\.js"/);
 assert.match(html,/本頁不再啟動全班自動同步/);assert.match(html,/已收件歷史與帳號權限不變/);
});

test('both visual previews disable class sync and isolate the persistent sync queue',()=>{
 for(const name of ['u03','avatar-audio']){
  const html=fs.readFileSync(path.join(root,'preview',name,'index.html'),'utf8');
  assert.ok(html.includes("window.ClassroomSyncConfig={enabled:false,endpoint:'',bridgeOrigin:''};"));
  assert.ok(!html.includes("const STORAGE_KEY = 'ndmu-ethics-classroom:queue:v1'"));
 }
});
