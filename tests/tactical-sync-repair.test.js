'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const C = require('../js/tactical/tactical_classroom_client'), E = require('../js/tactical/tactical_engine'), S = require('../js/tactical/tactical_store'), B = require('../js/engine/rpg_bonus');
const NOW = Date.parse('2026-10-06T00:00:00.000Z'), CLASS = 'SYNTHETIC-REPAIR-ONLY', SCOPE = 'synthetic-scope-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const clone = value => JSON.parse(JSON.stringify(value));
function memory() { const values = new Map(); return { values, fail:false, getItem:key=>values.get(key)||null, setItem(key,value) { if(this.fail) throw Error('QUOTA'); values.set(key,value); } }; }
function clock() { let time = NOW; return { now:()=>time, advance:ms=>{time+=ms;} }; }
function store() { const s = new S({ storage:memory(), key:S.FORMAL_KEY, lockManager:{ request(name,options,callback) { callback({name}); return Promise.resolve(); } } }); s.saveProfile(s.loadProfile().data); return s; }
const bridgeState = (extra={}) => ({ classId:CLASS,queueScope:SCOPE,rankingsEnabled:true,expiresAt:new Date(NOW+3600000).toISOString(),connectionId:'a'.repeat(64),protocolVersion:2,engineVersion:'2.0.0',contentVersion:'tactical-2026-10-06-v1',bonusContentVersion:B.CONTENT_VERSION,...extra });
const receipt = id => ({ok:true,format:'ndmu-ethics-class-receipt',version:2,eventId:id,serverReceivedAt:new Date(NOW+1000).toISOString(),reviewStatus:'pending_teacher_review',duplicate:false});
const queue = c => JSON.parse(c.exportQueue());
function rig(options={}) { const time=options.time||clock(),storage=options.storage||memory(),calls=[]; const client=C.createClient({mode:'public',enabled:true,Engine:E,Bonus:B,crypto:crypto.webcrypto,storage,now:time.now,random:()=>0,rpc:async(m,args)=>{calls.push({m,args:clone(args)});return receipt(JSON.parse(args[0]).eventId);},...options});return {client,time,storage,calls}; }
function connect(r,s) { r.client.attachStore(s);r.client.connectBridge(bridgeState());r.client.setConsent(true); }
function turn(s) { const battle=E.command(s.data.session.state,{type:'endTurn',revision:s.data.session.state.revision}).state;s.saveSession(battle);return battle; }
function finish(s) { if(!s.data.session)s.startAttempt(E.createState('u03'));let b=s.data.session.state;while(b.status==='active')b=turn(s);return s.finishAttempt(b,{reason:'QA合成：可靠交接',revisionCondition:'QA合成：新資料時修正'}).data; }
function deferred() { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }

test('coalescing survives refresh/write/readback and removes only never-attempted progress',()=>{
  const r=rig(),s=store();s.startAttempt(E.createState('u03'));connect(r,s);
  turn(s);r.client.capture();const first=queue(r.client).entries[0];
  turn(s);r.client.capture();const second=queue(r.client).entries;
  assert.equal(second.length,1);assert.notEqual(second[0].eventId,first.eventId);assert.equal(JSON.parse(second[0].raw).attempt.battle.commandLog.length,2);
  r.client.capture();r.client.setConsent(false);r.client.setConsent(true);
  assert.equal(queue(r.client).entries.length,1);assert.equal(JSON.parse(r.storage.getItem(C.STORAGE_KEY)).entries.length,1);
  const reloaded=rig({storage:r.storage,time:r.time});connect(reloaded,s);assert.equal(queue(reloaded.client).entries.length,1);
});

test('attempt metadata is durable before RPC; crash reload preserves exact attempted bytes',async()=>{
  const storage=memory(),time=clock(),wait=deferred();let atDispatch;
  const r=rig({storage,time,rpc:async()=>{atDispatch=JSON.parse(storage.getItem(C.STORAGE_KEY)).entries;return wait.promise;}}),s=store();
  s.startAttempt(E.createState('u03'));turn(s);connect(r,s);const sent=queue(r.client).entries[0];const work=r.client.pump();
  assert.equal(atDispatch[0].tries,1);assert.ok(atDispatch[0].nextTryAt>=NOW+65000);
  const reload=rig({storage,time});connect(reload,s);turn(s);reload.client.capture();
  assert.equal(queue(reload.client).entries.length,2);assert.equal(queue(reload.client).entries[0].raw,sent.raw);assert.equal(queue(reload.client).entries[0].eventId,sent.eventId);
  assert.equal(await reload.client.pump(),false);assert.equal(reload.calls.length,0);
  wait.resolve(receipt(sent.eventId));await work;
});

test('storage failure when persisting dispatch fails closed before network',async()=>{
  const r=rig(),s=store();finish(s);connect(r,s);r.storage.fail=true;
  assert.equal(await r.client.pump(),false);assert.equal(r.calls.length,0);assert.match(r.client.state().storageWarning,/匯出/);
});

test('finished reflection supersedes only unattempted progress and distinct attempts survive',()=>{
  const r=rig(),s=store();s.startAttempt(E.createState('u03'));connect(r,s);turn(s);r.client.capture();const first=finish(s);r.client.capture();
  const second=finish(s);r.client.capture();const entries=queue(r.client).entries;
  assert.equal(entries.length,2);assert.deepEqual(entries.map(e=>JSON.parse(e.raw).attempt.attemptId),[first.attemptId,second.attemptId]);
  assert.ok(entries.every(e=>JSON.parse(e.raw).attempt.closure==='finished'));
});

test('finished full replay is prioritized over attempted progress without deleting its history',async()=>{
  const calls=[],r=rig({rpc:async(m,args)=>{calls.push(JSON.parse(args[0]));if(calls.length===1)throw Error('NETWORK');return receipt(calls.at(-1).eventId);}}),s=store();
  s.startAttempt(E.createState('u03'));turn(s);connect(r,s);await r.client.pump();const original=queue(r.client).entries[0];
  finish(s);r.client.capture();assert.equal(queue(r.client).entries.length,2);r.time.advance(65000);await r.client.pump();
  assert.equal(calls[1].attempt.closure,'finished');assert.equal(queue(r.client).entries[0].raw,original.raw);assert.equal(queue(r.client).entries[0].eventId,original.eventId);assert.equal(queue(r.client).entries[0].status,'pending');
});

test('manual retry cannot bypass quota cooldown and reload retains it',async()=>{
  const r=rig({rpc:async()=>{throw Error('Error: RETRY_LATER_KEEP_EVENT');}}),s=store();finish(s);connect(r,s);await r.client.pump();
  const saved=queue(r.client).entries[0],next=r.client.state().nextRetryAt;assert.equal(next,NOW+600000);assert.equal(r.client.state().syncState,'waiting');
  for(let i=0;i<10;i++){assert.equal(r.client.retry(),false);assert.equal(await r.client.pump(),false);}assert.equal(queue(r.client).entries[0].tries,1);
  const reload=rig({storage:r.storage,time:r.time});connect(reload,s);reload.client.retry();assert.equal(await reload.client.pump(),false);assert.equal(reload.client.state().nextRetryAt,next);
  r.time.advance(600000);assert.equal(await reload.client.pump(),true);assert.equal(reload.calls[0].args[0],saved.raw);
});

test('successful sends are paced below ten attempts per rolling ten-minute window',async()=>{
  const r=rig(),s=store();for(let i=0;i<12;i++)finish(s);connect(r,s);
  for(let i=0;i<10;i++){await r.client.pump();assert.equal(await r.client.pump(),false);if(i<9)r.time.advance(65000);}
  assert.equal(r.calls.length,10);assert.equal(r.time.now()-NOW,585000);r.time.advance(14999);assert.equal(await r.client.pump(),false);r.time.advance(50001);assert.equal(await r.client.pump(),true);
});

test('bounded jitter and safe exposed error messages never include private backend details',async()=>{
  for(const [error,lower,upper] of [['RETRY_LATER_KEEP_EVENT',600000,630000],['CLASSROOM_BUSY',65000,80000],['secret email private@example.test token ABC',65000,80000]]){
    const r=rig({random:()=>1,rpc:async()=>{throw Error(error);}}),s=store();finish(s);connect(r,s);await r.client.pump();
    assert.ok(r.client.state().retryAfterMs>=lower&&r.client.state().retryAfterMs<=upper);assert.equal(JSON.stringify(r.client.state()).includes('private@example'),false);assert.equal(r.client.exportQueue().includes('private@example'),false);
  }
});

test('expiry revokes consent and same-connection refresh cannot silently restore it',()=>{
  const r=rig(),s=store();finish(s);connect(r,s);r.time.advance(3600001);
  r.client.connectBridge(bridgeState({expiresAt:new Date(r.time.now()+3600000).toISOString()}));assert.equal(r.client.state().consent,false);assert.equal(r.client.state().syncState,'consent_required');assert.equal(r.client.state().pending,1);
});

test('subscribe exposes matching finished attempt receipt and supports unsubscribe',async()=>{
  const r=rig(),s=store(),finished=finish(s),seen=[];const stop=r.client.subscribe(value=>seen.push(value));connect(r,s);await r.client.pump();
  const item=seen.at(-1).entries[0];assert.equal(item.attemptId,finished.attemptId);assert.equal(item.closure,'finished');assert.equal(item.currentProfile,true);assert.equal(item.currentScope,true);assert.equal(item.receipt.eventId,item.eventId);assert.ok(seen.some(value=>value.sending));
  stop();const length=seen.length;r.client.retry();assert.equal(seen.length,length);
});

function host() {
  const time=clock(),listeners=new Map(),intervals=new Map(),timeouts=new Map(),sent=[],opened=[];let serial=0;
  const popup={closed:false};
  return {time,Date:{now:time.now},crypto:crypto.webcrypto,sent,opened,popup,listeners,intervals,
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    async emit(type,event){await Promise.all((listeners.get(type)||[]).map(fn=>fn(event)));},
    setTimeout(fn,delay){timeouts.set(++serial,{fn,delay});return serial;},clearTimeout:id=>timeouts.delete(id),
    setInterval(fn,delay){intervals.set(++serial,{fn,delay});return serial;},clearInterval:id=>intervals.delete(id),
    open(...args){opened.push(args);return popup;}
  };
}
function server(client,extra={}) {
  const h=host(),opener={closed:false,postMessage:(data,origin)=>h.sent.push({data:clone(data),origin})},challenge='c'.repeat(64);h.top={opener};
  const bridge=C.installBridgeServer(h,client,{enabled:true,bridge:challenge,...extra});
  const message=(type,more={},override={})=>h.emit('message',{origin:C.GAME_ORIGIN,source:opener,data:{protocol:C.BRIDGE_PROTOCOL,challenge,type,...more},...override});
  return {h,opener,bridge,message,heartbeat:()=>h.sent.filter(item=>item.data.type==='ready').at(-1).data.heartbeatId};
}
function mockGoogle() {
  const connection=[],errors=[],client={markBridgeConnection:(...args)=>connection.push(args),bridgeState:()=>bridgeState(),logout(){this.loggedOut=true;},submitRemote:async()=>{if(errors.length)throw errors.shift();return receipt(crypto.randomUUID());},leaderboard:async()=>[]};
  return {client,connection,errors};
}

test('Google original-game connected status requires exact-source nonce-bound fresh heartbeat ack',async()=>{
  const g=mockGoogle(),x=server(g.client);assert.deepEqual(g.connection.at(-1),[false,false]);
  const ack={heartbeatId:x.heartbeat(),connectionId:bridgeState().connectionId,consent:true};
  await x.message('ack',ack,{origin:'https://evil.invalid'});await x.message('ack',ack,{source:{}});await x.message('ack',{...ack,heartbeatId:'d'.repeat(64)});assert.deepEqual(g.connection.at(-1),[false,false]);
  await x.message('ack',ack);assert.deepEqual(g.connection.at(-1),[true,true]);
  x.h.time.advance(10001);x.bridge.publish();assert.deepEqual(g.connection.at(-1),[false,false]);await x.message('ack',ack);assert.deepEqual(g.connection.at(-1),[false,false]);
  await x.message('ack',{...ack,heartbeatId:x.heartbeat(),consent:false});assert.deepEqual(g.connection.at(-1),[true,false]);
});

test('Google bridge with no opener never reports original game connected',()=>{
  const g=mockGoogle(),h=host();h.top={opener:null};assert.equal(C.installBridgeServer(h,g.client,{enabled:true,bridge:'c'.repeat(64)}),null);assert.deepEqual(g.connection,[[false,false]]);assert.equal(h.sent.length,0);
});

test('bridge relays only allowlisted error codes and returns busy instead of silently timing out',async()=>{
  const g=mockGoogle(),x=server(g.client),request=()=>({requestId:crypto.randomUUID(),method:'classroomSubmitTacticalAttempt',args:['{}',SCOPE]});
  for(const [error,expected] of [['Error: RETRY_LATER_KEEP_EVENT','RETRY_LATER_KEEP_EVENT'],['CLASSROOM_BUSY','CLASSROOM_BUSY'],['SESSION_EXPIRED','SESSION_EXPIRED'],['private@example.test PRIVATE TOKEN','BRIDGE_REQUEST_FAILED']]){
    g.errors.push(Error(error));await x.message('request',request());const result=x.h.sent.at(-1).data;assert.equal(result.errorCode,expected);assert.deepEqual(Object.keys(result).sort(),['challenge','errorCode','ok','protocol','requestId','type']);
  }
  assert.equal(JSON.stringify(x.h.sent).includes('private@example'),false);
  const wait=deferred();g.client.submitRemote=()=>wait.promise;const work=[1,2,3].map(()=>x.message('request',request()));await x.message('request',request());assert.equal(x.h.sent.at(-1).data.errorCode,'CLASSROOM_BUSY');wait.resolve({});await Promise.all(work);
});

function transport() {
  const h=host(),states=[],bridge=C.createBridgeTransport(h,{enabled:true,endpoint:C.EXEC_ENDPOINT,bridgeOrigin:C.PINNED_BRIDGE_ORIGIN},s=>states.push(s));bridge.open();const challenge=new URL(h.opened[0][0]).searchParams.get('bridge'),frame={top:h.popup,postMessage:(data,origin)=>h.sent.push({data:clone(data),origin})};
  const message=(type,extra={},override={})=>h.emit('message',{origin:C.PINNED_BRIDGE_ORIGIN,source:frame,data:{protocol:C.BRIDGE_PROTOCOL,challenge,type,...extra},...override});return {h,states,bridge,message};
}

test('new transport echoes fresh advertised heartbeat, keeps consent per side, and disconnects a silent peer',async()=>{
  const t=transport();await t.message('ready',{capabilities:['verified-game-heartbeat-v1','safe-errors-v1'],heartbeatId:'e'.repeat(64)});assert.equal(t.h.sent.at(-1).data.type,'ack');assert.equal(t.h.sent.at(-1).data.consent,false);
  await t.message('joined',{state:bridgeState()});t.bridge.setConsent(true);assert.equal(t.h.sent.at(-1).data.consent,true);assert.equal(t.h.sent.at(-1).data.connectionId,bridgeState().connectionId);
  t.h.time.advance(10001);t.bridge.check();assert.equal(t.states.at(-1),null);await assert.rejects(t.bridge.rpc('classroomSubmitTacticalAttempt',['{}',null,SCOPE]),/BRIDGE_CLOSED/);
});

test('new transport refuses stale bridge capabilities but relays safe errors after upgrade',async()=>{
  const t=transport();await t.message('ready');await t.message('joined',{state:bridgeState()});assert.equal(t.h.sent.length,0);assert.equal(t.states.at(-1),null);await assert.rejects(t.bridge.rpc('classroomSubmitTacticalAttempt',['{}',null,SCOPE]),/BRIDGE_CLOSED/);
  await t.message('ready',{capabilities:['verified-game-heartbeat-v1','safe-errors-v1'],heartbeatId:'f'.repeat(64)});await t.message('joined',{state:bridgeState()});
  for(const [errorCode,expected] of [['RETRY_LATER_KEEP_EVENT','RETRY_LATER_KEEP_EVENT'],['private token','BRIDGE_REQUEST_FAILED'],[undefined,'BRIDGE_REQUEST_FAILED']]){
    const work=t.bridge.rpc('classroomSubmitTacticalAttempt',['{}',null,SCOPE]),requestId=t.h.sent.at(-1).data.requestId,rejected=assert.rejects(work,new RegExp(expected));await t.message('result',{requestId,ok:false,errorCode});await rejected;
  }
});


test('legacy persisted tries=0 is ambiguous after old-client crash and is never coalesced',()=>{
  const r=rig(),s=store();s.startAttempt(E.createState('u03'));turn(s);connect(r,s);const original=queue(r.client).entries[0];assert.equal(original.tries,0);
  const reload=rig({storage:r.storage,time:r.time});connect(reload,s);turn(s);reload.client.capture();finish(s);reload.client.capture();
  const all=queue(reload.client).entries;assert.equal(all.length,2);assert.equal(all[0].eventId,original.eventId);assert.equal(all[0].raw,original.raw);assert.equal(JSON.parse(all[1].raw).attempt.closure,'finished');
});

test('a previously open tab must respect newly persisted rate cooldown after writer-lock handoff',async()=>{
  const storage=memory(),time=clock(),first=rig({storage,time,rpc:async()=>{throw Error('RETRY_LATER_KEEP_EVENT');}}),second=rig({storage,time}),s=store();finish(s);finish(s);connect(first,s);connect(second,s);
  await first.client.pump();first.client.setConsent(false);assert.equal(await second.client.pump(),false);assert.equal(second.calls.length,0);assert.equal(second.client.state().nextRetryAt,NOW+600000);
});


test('completion receipt matches exact current finished content, never only a restored attempt ID',async()=>{
  const r=rig(),s=store(),finished=finish(s);connect(r,s);await r.client.pump();
  assert.equal(r.client.hasReceiptForAttempt(finished),true);
  assert.equal(r.client.hasReceiptForAttempt(Object.fromEntries(Object.entries(finished).reverse())),true);
  const restored=clone(finished);restored.learning.reason='QA合成：復原後不同的完整反思';assert.equal(restored.attemptId,finished.attemptId);
  assert.equal(r.client.hasReceiptForAttempt(restored),false);
  const otherReplay=clone(finished);otherReplay.battle.initialDecisionId='different';assert.equal(r.client.hasReceiptForAttempt(otherReplay),false);
  assert.equal(r.client.hasReceiptForAttempt({...finished,closure:'in_progress'}),false);
  assert.equal(JSON.stringify(r.client.state()).includes(finished.learning.reason),false);
  r.client.attachStore(store());assert.equal(r.client.hasReceiptForAttempt(finished),false);
  r.client.attachStore(s);r.client.connectBridge(bridgeState({queueScope:'synthetic-scope-bbbbbbbbbbbbbbbbbbbbbbbbbbbb',connectionId:'b'.repeat(64)}));assert.equal(r.client.hasReceiptForAttempt(finished),false);
});
