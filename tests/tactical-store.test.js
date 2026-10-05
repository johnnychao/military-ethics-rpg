'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Store=require('../js/tactical/tactical_store'),Bonus=require('../js/engine/rpg_bonus');
const Engine={validateState:s=>({ok:!!s&&s.format==='ndmu-ethics-tactical'&&s.version===2&&/^u(0[1-9]|1[0-3])$/.test(s.missionId)&&Number.isSafeInteger(s.revision)&&s.revision>=0&&['player','complete'].includes(s.phase)&&['active','won','lost'].includes(s.status),errors:['invalid']})};
const memory=()=>{const m=new Map(),writes=[];return {getItem:k=>m.get(k)||null,setItem:(k,v)=>{m.set(k,v);writes.push(k);},m,writes};};
let n=0;const opts=(storage=memory())=>({storage,Engine,makeId:()=>`test-record-${++n}`,now:()=>new Date('2026-10-05T20:00:00.000Z').toISOString()});
const state=(status='active',revision=0)=>({format:'ndmu-ethics-tactical',version:2,missionId:'u03',revision,phase:status==='active'?'player':'complete',status});
const reflection={reason:'守住能力界線，請督導接手。教材提供角色責任的判斷依據。',revisionCondition:'若支援尚未到場，會重新查明撤離路線與交接責任。'};
test('all tactical writes use one isolated key and never mutate legacy data',()=>{
 const storage=memory();storage.m.set('ndmu-ethics-rpg:v1',JSON.stringify({format:'ndmu-ethics-rpg',version:1,records:{u03:{current:{phase:'complete'},attempts:[]}}}));
 const before=storage.m.get('ndmu-ethics-rpg:v1'),s=new Store(opts(storage));assert.equal(s.legacySummary().data.count,1);assert.equal(s.startAttempt(state()).ok,true);assert.deepEqual(new Set(storage.writes),new Set([Store.KEY]));assert.equal(storage.m.get('ndmu-ethics-rpg:v1'),before);assert.match(Store.KEY,/preview:v2$/);
});
test('validated profile, three character appearances and all preferences roundtrip',()=>{
 const o=opts(),s=new Store(o),p=s.loadProfile().data;p.nickname='學員';p.squadAppearance.guardian.skin='umber';p.settings.voiceEnabled=false;p.settings.reducedMotion=true;
 const result=s.saveProfile(p);assert.equal(result.persisted,true);const r=new Store(o);assert.deepEqual(r.loadProfile().data,p);p.nickname='unsaved';assert.equal(r.loadProfile().data.nickname,'學員');
});
test('invalid settings, arbitrary profile keys and unsafe objects are rejected atomically',()=>{
 const s=new Store(opts()),original=s.exportJSON(),p=s.loadProfile().data;
 for(const bad of [{...p,nickname:''},{...p,settings:{...p.settings,musicVolume:NaN}},{...p,settings:{...p.settings,voiceEnabled:'yes'}},{...p,email:'qa@example.invalid'},{...p,squadAppearance:{other:p.appearance}},{...p,appearance:{...p.appearance,skin:'unknown'}},JSON.parse('{"__proto__":{"bad":1}}')])assert.equal(s.saveProfile(bad).ok,false);
 assert.equal(s.exportJSON(),original);assert.equal({}.bad,undefined);
});
test('same-attempt saves reject stale and conflicting revisions',()=>{
 const s=new Store(opts());s.startAttempt(state());assert.equal(s.saveSession(state('active',1)).ok,true);assert.equal(s.saveSession(state()).ok,false);assert.equal(s.saveSession(state('lost',1)).ok,false);assert.equal(s.loadSession().data.revision,1);
});
test('win and loss both become learning completion only with two reflections',()=>{
 for(const outcome of ['won','lost']){const s=new Store(opts());s.startAttempt(state());const terminal=state(outcome,5);s.saveSession(terminal);assert.equal(s.finishAttempt(terminal,{reason:' ',revisionCondition:'ok'}).ok,false);assert.equal(Object.keys(s.loadProgress().data.completed).length,0);const r=s.finishAttempt(terminal,reflection);assert.equal(r.ok,true);assert.equal(r.persisted,true);assert.equal(s.loadProgress().data.completed.u03.count,1);assert.equal(s.loadProgress().data.completed.u03.lastOutcome,outcome);assert.equal(r.data.learning.clockSource,'device-untrusted');assert.equal(s.loadSession().data,null);assert.equal(s.finishAttempt(terminal,reflection).duplicate,true);assert.equal(s.loadAttempts().data.length,1);}
});
test('active battle cannot satisfy learning completion even with reflections',()=>{const s=new Store(opts());s.startAttempt(state());assert.equal(s.finishAttempt(state(),reflection).ok,false);assert.deepEqual(s.loadProgress().data.completed,{});});
test('retry archives the whole previous attempt and starts a fresh id',()=>{
 const s=new Store(opts()),first=s.startAttempt(state());s.saveSession(state('lost',5));const second=s.startAttempt(state());assert.notEqual(first.attemptId,second.attemptId);const a=s.loadAttempts().data[0];assert.equal(a.battle.status,'lost');assert.equal(a.learning,null);assert.equal(a.closure,'retry');assert.deepEqual(s.loadProgress().data.completed,{});assert.equal(s.loadSession().data.revision,0);
});
test('leaving archives incomplete battle and does not destroy attempts',()=>{const s=new Store(opts());s.startAttempt(state());s.clearSession();assert.equal(s.loadAttempts().data[0].closure,'left');assert.equal(s.loadSession().data,null);});
test('storage failures keep memory state, warn once, and never claim persisted',()=>{
 const messages=[],storage={getItem:()=>null,setItem:()=>{throw new Error('quota');}},s=new Store({...opts(storage),onWarning:m=>messages.push(m)});const r=s.startAttempt(state());assert.equal(r.ok,true);assert.equal(r.persisted,false);s.saveSession(state('active',1));assert.equal(s.loadSession().data.revision,1);assert.equal(messages.length,1);assert.ok(JSON.parse(s.exportJSON()).session);
});
test('readback mismatch is not reported as saved',()=>{const s=new Store(opts({getItem:()=>null,setItem:()=>{}}));assert.equal(s.startAttempt(state()).persisted,false);});
test('corrupted original bytes are preserved while new work is exportable',()=>{
 const storage=memory();storage.m.set(Store.KEY,'{not valid');const s=new Store(opts(storage));assert.equal(s.exportDamagedJSON(),'{not valid');assert.equal(s.startAttempt(state()).persisted,false);assert.equal(storage.m.get(Store.KEY),'{not valid');assert.ok(JSON.parse(s.exportJSON()).session);assert.equal(storage.writes.length,0);
});
test('export/import has independent profile and immutable archive identity; can replace damaged with valid import',()=>{
 const a=new Store(opts());a.startAttempt(state());a.saveSession(state('lost',7));a.finishAttempt(state('lost',7),reflection);const storage=memory();storage.m.set(Store.KEY,'broken');const b=new Store(opts(storage));const r=b.importJSON(a.exportJSON(),{replaceExisting:true});assert.equal(r.ok,true);assert.equal(r.persisted,true);assert.equal(b.exportDamagedJSON(),'broken');assert.equal(b.loadAttempts().data[0].attemptId,a.loadAttempts().data[0].attemptId);
});
test('old save import is rejected without converting its six commands or touching legacy keys',()=>{
 const s=new Store(opts()),before=s.exportJSON();const r=s.importJSON(JSON.stringify({format:'ndmu-ethics-rpg',version:1,records:{}}));assert.equal(r.ok,false);assert.equal(s.exportJSON(),before);
});
test('malformed import, duplicated attempt, unsupported version and unsafe prototype are atomically rejected',()=>{
 const s=new Store(opts());s.startAttempt(state());s.saveSession(state('won',3));s.finishAttempt(state('won',3),reflection);const base=JSON.parse(s.exportJSON()),before=s.exportJSON();const variations=[{...base,version:1},{...base,attempts:[base.attempts[0],base.attempts[0]]},{...base,engineVersion:'1.0'},{...base,session:{attemptId:'short',startedAt:base.createdAt,state:state()}},{...base,profile:{...base.profile,settings:{...base.profile.settings,musicVolume:2}}}];
 for(const v of variations)assert.equal(s.importJSON(JSON.stringify(v)).ok,false);
 assert.equal(s.importJSON('{"__proto__":{"polluted":true}}').ok,false);assert.equal(s.importJSON('{').ok,false);assert.equal(s.importJSON('x'.repeat(Store.MAX_BYTES+1)).ok,false);assert.equal(s.exportJSON(),before);assert.equal({}.polluted,undefined);
});
test('progress is derived and cannot be forged by saveProgress',()=>{
 const s=new Store(opts());const p=s.loadProgress().data;assert.equal(s.saveProgress(p).ok,true);p.completed.u03={count:1,lastOutcome:'won'};assert.equal(s.saveProgress(p).ok,false);assert.equal(s.loadProgress().data.unlocked,13);
});
test('bonus events remain independent and are validated on save/import',()=>{
 const s=new Store(opts()),b=s.loadBonus().data,next=Bonus.interact(b,'u03','u03-egg').state;assert.equal(s.saveBonus(next).ok,true);assert.equal(Bonus.getSummary(s.loadBonus().data).collections,1);const damaged=JSON.parse(JSON.stringify(next));damaged.revision=99;assert.equal(s.saveBonus(damaged).ok,false);assert.equal(s.loadAttempts().data.length,0);
});

test('finish cannot swap a different legal game or advance without saving its exact terminal state',()=>{
 const s=new Store(opts());s.startAttempt(state());s.saveSession(state('won',5));assert.equal(s.finishAttempt(state('lost',5),reflection).ok,false);assert.equal(s.finishAttempt(state('won',6),reflection).ok,false);assert.equal(s.finishAttempt(state('won',5),reflection).ok,true);
});
test('attempt lineage rejects another decision, content version, or divergent command history',()=>{
 const s=new Store(opts()),base={...state(),decisionId:'a',engineVersion:'2.0.0',contentVersion:'v1',commandLog:[]};s.startAttempt(base);base.revision=1;base.commandLog=[{type:'move',revision:0}];s.saveSession(base);
 for(const patch of [{decisionId:'b'},{engineVersion:'3.0'},{contentVersion:'v2'},{commandLog:[{type:'skill',revision:0}]},{commandLog:[]}])assert.equal(s.saveSession({...base,revision:2,...patch}).ok,false);
 assert.equal(s.saveSession({...base,revision:2,commandLog:[...base.commandLog,{type:'undo',revision:1}]}).ok,true);
});
test('two tabs cannot overwrite the newer complete archive with an older profile change',()=>{
 const storage=memory(),a=new Store(opts(storage));a.startAttempt(state());const b=new Store(opts(storage));a.saveSession(state('won',5));a.finishAttempt(state('won',5),reflection);const saved=storage.getItem(Store.KEY);const p=b.loadProfile().data;p.nickname='另一個分頁';const result=b.saveProfile(p);assert.equal(result.persisted,false);assert.equal(result.conflict,true);assert.equal(storage.getItem(Store.KEY),saved);assert.equal(JSON.parse(saved).attempts.length,1);assert.equal(b.loadProfile().data.nickname,'另一個分頁');
});
test('importing over an existing save needs explicit replace confirmation',()=>{
 const s=new Store(opts());s.startAttempt(state());const raw=s.exportJSON();assert.equal(s.importJSON(raw).ok,false);assert.equal(s.importJSON(raw,{replaceExisting:true}).ok,true);
});

test('new attempts cannot import an arbitrary terminal or already acted battle',()=>{
 const s=new Store(opts());assert.equal(s.startAttempt(state('won',3)).ok,false);assert.equal(s.startAttempt(state('active',1)).ok,false);assert.equal(s.startAttempt({...state(),commandLog:[{type:'move'}]}).ok,false);assert.equal(s.loadSession().data,null);
});
test('Web Locks ownership prevents a second tab from writing even if storage bytes match',async()=>{
 const storage=memory(),locks={request:async(name,options,callback)=>callback(null)},s=new Store({...opts(storage),lockManager:locks});await Promise.resolve();const r=s.startAttempt(state());assert.equal(r.persisted,false);assert.equal(r.conflict,true);assert.equal(storage.writes.length,0);assert.equal(s.loadSession().data.missionId,'u03');
});

test('reflection drafts are tied to the active terminal attempt and survive reload without marking completion',()=>{
 const storage=memory(),s=new Store(opts(storage));const started=s.startAttempt(state());assert.equal(s.saveDraft(started.attemptId,{reason:'未結束',revisionCondition:''}).ok,false);s.saveSession(state('lost',5));const draft={reason:'只寫一半的理由 <script>不執行</script>',revisionCondition:''};const saved=s.saveDraft(started.attemptId,draft);assert.equal(saved.ok,true);assert.equal(saved.persisted,true);const restored=new Store(opts(storage));assert.deepEqual(restored.loadSession().draft,draft);assert.equal(restored.loadSession().attemptId,started.attemptId);assert.deepEqual(restored.loadProgress().data.completed,{});assert.equal(restored.loadAttempts().data.length,0);
});
test('late draft callbacks cannot write into a restarted or imported different attempt',()=>{
 const s=new Store(opts());const first=s.startAttempt(state());s.saveSession(state('lost',5));s.saveDraft(first.attemptId,{reason:'舊局文字',revisionCondition:''});const second=s.startAttempt(state());const before=s.exportJSON();assert.equal(s.saveDraft(first.attemptId,{reason:'迟到文字',revisionCondition:'不得串局'}).code,'draft-stale');assert.equal(s.exportJSON(),before);assert.deepEqual(s.loadSession().draft,{reason:'',revisionCondition:''});assert.notEqual(first.attemptId,second.attemptId);assert.equal(s.loadAttempts().data[0].draft.reason,'舊局文字');assert.equal(s.loadAttempts().data[0].learning,null);
});
test('final learning uses reviewed form fields and clears draft without losing its battle',()=>{
 const s=new Store(opts()),a=s.startAttempt(state());s.saveSession(state('won',3));s.saveDraft(a.attemptId,{reason:'舊草稿',revisionCondition:'未定'});const r=s.finishAttempt(state('won',3),reflection);assert.equal(r.ok,true);assert.equal(r.data.draft,null);assert.equal(r.data.learning.reason,reflection.reason);assert.equal(s.saveDraft(a.attemptId,{reason:'延遲',revisionCondition:''}).code,'draft-stale');assert.equal(s.loadSession().draft,null);
});
test('invalid, oversized and unbound drafts are rejected atomically',()=>{
 const s=new Store(opts()),a=s.startAttempt(state());s.saveSession(state('lost',5));const before=s.exportJSON();for(const d of [{reason:'x'}, {reason:1,revisionCondition:''},{reason:'x'.repeat(6001),revisionCondition:''},{reason:'x',revisionCondition:'',email:'qa@example.invalid'},JSON.parse('{"reason":"x","revisionCondition":"","__proto__":{}}')])assert.equal(s.saveDraft(a.attemptId,d).ok,false);assert.equal(s.exportJSON(),before);assert.equal(s.saveDraft('other-uuid',{reason:'x',revisionCondition:''}).code,'draft-stale');
});
test('storage failure keeps draft available in the complete downloadable backup',()=>{
 const storage=memory(),s=new Store(opts(storage)),a=s.startAttempt(state());s.saveSession(state('lost',5));storage.setItem=()=>{throw new Error('quota')};const r=s.saveDraft(a.attemptId,{reason:'務必保留',revisionCondition:'檔案可還原'});assert.equal(r.ok,true);assert.equal(r.persisted,false);assert.equal(JSON.parse(s.exportJSON()).session.draft.reason,'務必保留');
});
test('initial published v2 files migrate losslessly with empty draft and optional coach defaults',()=>{
 const storage=memory(),s=new Store(opts());s.startAttempt(state());s.saveSession(state('lost',5));s.finishAttempt(state('lost',5),reflection);s.startAttempt(state());const old=JSON.parse(s.exportJSON());delete old.schemaRevision;delete old.profile.settings.coachEnabled;delete old.session.draft;for(const a of old.attempts)delete a.draft;const raw=JSON.stringify(old);storage.m.set(Store.KEY,raw);const migrated=new Store(opts(storage));assert.equal(migrated.damagedRaw,null);assert.equal(storage.m.get(Store.KEY),raw,'loading never overwrites the old backup');const next=JSON.parse(migrated.exportJSON());assert.equal(next.schemaRevision,Store.SCHEMA_REVISION);assert.equal(next.profile.settings.coachEnabled,true);assert.equal(next.profileId,old.profileId);assert.equal(next.session.attemptId,old.session.attemptId);assert.deepEqual(next.session.state,old.session.state);assert.deepEqual(next.attempts[0].battle,old.attempts[0].battle);assert.deepEqual(next.attempts[0].learning,old.attempts[0].learning);assert.equal(migrated.loadProgress().data.completed.u03.count,1);assert.equal(new Store(opts()).importJSON(raw).ok,true);
});
test('future schema revisions and corrupted early records are not guessed or silently repaired',()=>{
 const s=new Store(opts()),before=s.exportJSON(),future=JSON.parse(before);future.schemaRevision=99;assert.equal(s.importJSON(JSON.stringify(future)).ok,false);const old=JSON.parse(before);delete old.schemaRevision;delete old.profile.settings.coachEnabled;old.unexpected='reject';assert.equal(s.importJSON(JSON.stringify(old)).ok,false);assert.equal(s.exportJSON(),before);
});
