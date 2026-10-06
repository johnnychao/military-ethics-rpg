'use strict';
// Independent, synthetic-only regression probes for migration and handover edges.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../js/tactical/tactical_classroom_client'),E=require('../js/tactical/tactical_engine'),S=require('../js/tactical/tactical_store'),B=require('../js/engine/rpg_bonus');
const NOW=Date.parse('2026-10-06T00:00:00.000Z'),CLASS='SYNTHETIC-AUDIT-ONLY',SCOPE='synthetic-scope-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const clone=value=>JSON.parse(JSON.stringify(value));
function memory(){const values=new Map();return{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}
function clock(){let time=NOW;return{now:()=>time,advance:ms=>{time+=ms;}};}
function store(){const s=new S({storage:memory(),key:S.FORMAL_KEY,lockManager:{request(name,options,callback){callback({name});return Promise.resolve();}}});s.saveProfile(s.loadProfile().data);return s;}
const config=()=>({classId:CLASS,queueScope:SCOPE,rankingsEnabled:true,expiresAt:new Date(NOW+3600000).toISOString(),connectionId:'a'.repeat(64),protocolVersion:2,engineVersion:'2.0.0',contentVersion:'tactical-2026-10-06-v1',bonusContentVersion:B.CONTENT_VERSION});
const receipt=id=>({ok:true,format:'ndmu-ethics-class-receipt',version:2,eventId:id,serverReceivedAt:new Date(NOW+1000).toISOString(),reviewStatus:'pending_teacher_review',duplicate:false});
const queue=client=>JSON.parse(client.exportQueue());
function rig(options={}){const time=options.time||clock(),storage=options.storage||memory(),calls=[];const client=C.createClient({mode:'public',enabled:true,Engine:E,Bonus:B,crypto:crypto.webcrypto,storage,now:time.now,random:()=>0,rpc:async(method,args)=>{calls.push({method,args:clone(args)});return receipt(JSON.parse(args[0]).eventId);},...options});return{client,time,storage,calls};}
function connect(r,s){r.client.attachStore(s);r.client.connectBridge(config());r.client.setConsent(true);}
function turn(s){const b=E.command(s.data.session.state,{type:'endTurn',revision:s.data.session.state.revision}).state;s.saveSession(b);return b;}
function finish(s){if(!s.data.session)s.startAttempt(E.createState('u03'));let b=s.data.session.state;while(b.status==='active')b=turn(s);return s.finishAttempt(b,{reason:'Synthetic audit reflection',revisionCondition:'Synthetic audit new information'}).data;}

test('audit: loaded pre-repair tries=0 progress is immutable because dispatch provenance is unknown',async()=>{
  const s=store(),first=rig();s.startAttempt(E.createState('u03'));turn(s);connect(first,s);
  const prior=queue(first.client).entries[0];assert.equal(prior.tries,0);
  // Old releases persisted tries only after RPC, so this is also a crash-after-send fixture.
  const reloaded=rig({storage:first.storage,time:first.time});connect(reloaded,s);finish(s);reloaded.client.capture();
  const entries=queue(reloaded.client).entries;
  assert.equal(entries.length,2);const recovered=entries.find(e=>e.eventId===prior.eventId);
  assert.ok(recovered);assert.equal(recovered.raw,prior.raw);assert.equal(recovered.tries,0);
  await reloaded.client.pump();assert.equal(JSON.parse(reloaded.calls[0].args[0]).attempt.closure,'finished');
  assert.equal(queue(reloaded.client).entries.find(e=>e.eventId===prior.eventId).raw,prior.raw);
});

test('audit: an existing tab inherits durable quota cooldown before dispatch after store handover',async()=>{
  const storage=memory(),time=clock(),s=store();finish(s);finish(s);
  const first=rig({storage,time,rpc:async()=>{throw Error('RETRY_LATER_KEEP_EVENT');}}),second=rig({storage,time});
  connect(first,s);second.client.attachStore(s);second.client.connectBridge(config());
  s.lockState='readonly';assert.throws(()=>second.client.setConsent(true),/WRITE_LOCK_REQUIRED/);s.lockState='owned';
  await first.client.pump();first.client.setConsent(false);second.client.setConsent(true);
  assert.equal(await second.client.pump(),false);assert.equal(second.calls.length,0);
  assert.equal(second.client.state().retryAfterMs,600000);second.client.retry();assert.equal(await second.client.pump(),false);
  time.advance(600000);assert.equal(await second.client.pump(),true);assert.equal(second.calls.length,1);
});

test('audit: matching command prefixes with different initial decisions are not redundant histories',()=>{
  const r=rig(),s=store();connect(r,s);const attemptId=crypto.randomUUID(),startedAt=new Date(NOW).toISOString();
  function progress(decisionId){const initial=E.createState('u03',{decisionId});const battle=E.command(initial,{type:'endTurn',revision:initial.revision}).state;return{attemptId,chapterId:'u03',startedAt,closedAt:null,closure:'in_progress',battle,learning:null,draft:{reason:'',revisionCondition:''}};}
  const a=progress('u03-decision-1'),b=progress('u03-decision-2');assert.deepEqual(a.battle.commandLog,b.battle.commandLog);assert.notEqual(a.battle.initialDecisionId,b.battle.initialDecisionId);
  r.client.enqueue(a,null,{id:s.data.profileId+':'+attemptId});r.client.enqueue(b,null,{id:s.data.profileId+':'+attemptId});
  assert.equal(queue(r.client).entries.length,2);
});

test('audit: unknown-outcome progress retains original raw/ID after reflection capture and mismatched receipt',async()=>{
  const calls=[],r=rig({rpc:async(method,args)=>{calls.push(args[0]);return receipt(crypto.randomUUID());}}),s=store();
  s.startAttempt(E.createState('u03'));turn(s);connect(r,s);const original=queue(r.client).entries[0];
  assert.equal(await r.client.pump(),false);finish(s);r.client.capture();r.time.advance(65000);assert.equal(await r.client.pump(),false);
  const entries=queue(r.client).entries;assert.equal(entries.length,2);assert.equal(entries.every(e=>e.status==='pending'&&e.receipt===null),true);
  assert.equal(entries.find(e=>e.eventId===original.eventId).raw,original.raw);assert.equal(calls[0],original.raw);assert.equal(JSON.parse(calls[1]).attempt.closure,'finished');
  const reload=rig({storage:r.storage,time:r.time});connect(reload,s);assert.equal(queue(reload.client).entries.find(e=>e.eventId===original.eventId).raw,original.raw);
});

test('audit: safe error handling neither persists nor exposes raw exception identity or credential strings',async()=>{
  const marker='synthetic-private@example.invalid token-synthetic-0123456789',r=rig({rpc:async()=>{throw new Error(marker);}}),s=store();finish(s);connect(r,s);await r.client.pump();
  for(const text of [JSON.stringify(r.client.state()),r.client.exportQueue(),r.storage.getItem(C.STORAGE_KEY)])assert.equal(text.includes(marker),false);
  assert.equal(r.client.state().entries[0].errorCode,'BRIDGE_REQUEST_FAILED');
});

test('audit: restoring an earlier backup and re-finishing requires a receipt for the exact new reflection',async()=>{
  const r=rig(),s=store();s.startAttempt(E.createState('u03'));turn(s);const earlierBackup=s.exportJSON();
  const original=finish(s);connect(r,s);assert.equal(await r.client.pump(),true);
  assert.equal(r.client.hasReceiptForAttempt(original),true);
  assert.equal(s.importJSON(earlierBackup,{replaceExisting:true}).ok,true);r.client.resetConsent('import');r.client.setConsent(true);
  let battle=s.data.session.state;while(battle.status==='active')battle=turn(s);
  const revised=s.finishAttempt(battle,{reason:'Synthetic alternate reflection after restoring an earlier backup',revisionCondition:'Synthetic alternate condition'}).data;
  assert.equal(revised.attemptId,original.attemptId);assert.notEqual(revised.learning.reason,original.learning.reason);
  r.client.capture();assert.equal(r.client.hasReceiptForAttempt(revised),false);assert.equal(r.client.hasReceiptForAttempt(original),true);
  const revisedEvent=queue(r.client).entries.find(e=>JSON.parse(e.raw).attempt.learning?.reason===revised.learning.reason);
  assert.ok(revisedEvent);assert.equal(revisedEvent.status,'pending');assert.equal(JSON.stringify(r.client.state()).includes(revised.learning.reason),false);
  r.time.advance(65000);assert.equal(await r.client.pump(),true);assert.equal(r.client.hasReceiptForAttempt(revised),true);
  r.client.logout();assert.equal(r.client.hasReceiptForAttempt(revised),false);
});
