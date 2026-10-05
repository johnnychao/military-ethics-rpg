'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('../js/tactical/tactical_engine'),M=require('../js/tactical/tactical_missions'),Store=require('../js/tactical/tactical_store');
const memory=()=>{const m=new Map();return {m,getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
const reflection={reason:'我選擇在能力範圍內協助，把待確認的資訊交給督導，不把先後次序當作人的價值。',revisionCondition:'若支援窗口回覆未能接手，我會重查交接安排並告知仍待確認的限制。'};
function store(storage=memory()){return new Store({storage});}
function command(s,c){const r=E.command(s,{...c,revision:s.revision});assert.equal(r.ok,true,r.message);return r.state;}
const route=[{type:'move',unitId:'scout',x:2,y:1},{type:'skill',unitId:'scout',skillId:'rescue',targetId:'civilian-1'},{type:'move',unitId:'guardian',x:3,y:3},{type:'skill',unitId:'guardian',skillId:'guard'},{type:'move',unitId:'medic',x:4,y:4},{type:'skill',unitId:'medic',skillId:'guard'},{type:'endTurn'},{type:'move',unitId:'scout',x:0,y:2},{type:'skill',unitId:'scout',skillId:'guard'},{type:'move',unitId:'guardian',x:5,y:3},{type:'skill',unitId:'guardian',skillId:'rescue',targetId:'civilian-2'},{type:'move',unitId:'medic',x:1,y:4},{type:'skill',unitId:'medic',skillId:'guard'},{type:'endTurn'},{type:'skill',unitId:'scout',skillId:'guard'},{type:'move',unitId:'guardian',x:2,y:3},{type:'skill',unitId:'guardian',skillId:'guard'},{type:'move',unitId:'medic',x:0,y:4},{type:'skill',unitId:'medic',skillId:'heal',targetId:'guardian'},{type:'endTurn'},{type:'skill',unitId:'scout',skillId:'guard'},{type:'move',unitId:'guardian',x:0,y:3}];
test('real u03 combat completes, saves every move and skill, survives refresh and exports a replayable victory',()=>{
 const storage=memory();let s=E.createState('u03'),db=store(storage);assert.equal(db.startAttempt(s).persisted,true);
 for(const c of route){s=command(s,c);const saved=db.saveSession(s);assert.equal(saved.ok,true,saved.message);assert.equal(saved.persisted,true);db=store(storage);assert.deepEqual(db.loadSession().data,JSON.parse(JSON.stringify(s)));}
 assert.equal(s.status,'won');assert.equal(db.finishAttempt(s,reflection).persisted,true);const reload=store(storage),a=reload.loadAttempts().data[0];assert.equal(a.battle.commandLog.length,route.length);assert.equal(E.validateState(a.battle).ok,true);assert.equal(a.learning.reason,reflection.reason);assert.equal(reload.loadProgress().data.completed.u03.count,1);assert.equal(reload.loadSession().data,null);
 const imported=store();assert.equal(imported.importJSON(reload.exportJSON()).ok,true);assert.equal(imported.loadAttempts().data[0].attemptId,a.attemptId);
});
test('every mission and either decision stores terminal failures as reflection-eligible independent attempts',()=>{
 for(const m of M.missions)for(const d of m.decisions){let s=E.createState(m.id,{decisionId:d.id});const db=store();db.startAttempt(s);while(s.status==='active'){s=command(s,{type:'endTurn'});assert.equal(db.saveSession(s).ok,true);}const r=db.finishAttempt(s,reflection);assert.equal(r.ok,true,m.id+': '+r.message);assert.equal(db.loadProgress().data.completed[m.id].count,1);assert.equal(r.data.learning.clockSource,'device-untrusted');assert.equal(Object.hasOwn(r.data,'attendance'),false);}
});
test('actual undo restores battle while remaining a monotonic append-only store update',()=>{
 const db=store();let s=E.createState('u03');db.startAttempt(s);s=command(s,{type:'move',unitId:'guardian',x:2,y:2});assert.equal(db.saveSession(s).ok,true);s=command(s,{type:'undo'});assert.equal(db.saveSession(s).ok,true);assert.equal(s.revision,2);assert.equal(s.commandLog[1].type,'undo');assert.equal(db.loadSession().data.units[0].x,E.createState('u03').units[0].x);
});
test('fresh retry preserves prior full command history under another attempt id',()=>{
 const db=store();let s=E.createState('u03');const first=db.startAttempt(s);s=command(s,{type:'endTurn'});db.saveSession(s);const second=db.startAttempt(E.createState('u03'));assert.notEqual(first.attemptId,second.attemptId);const a=db.loadAttempts().data[0];assert.equal(a.battle.commandLog.length,1);assert.equal(a.closure,'retry');assert.equal(a.learning,null);assert.equal(db.loadSession().data.commandLog.length,0);
});
test('forged victory in a real exported save is rejected without replacing original records',()=>{
 const db=store();db.startAttempt(E.createState('u03'));const raw=db.exportJSON(),bad=JSON.parse(raw);bad.session.state.status='won';bad.session.state.phase='complete';assert.equal(db.importJSON(JSON.stringify(bad),{replaceExisting:true}).ok,false);assert.equal(db.exportJSON(),raw);
});
test('fully legal different decision state cannot replace an active attempt lineage',()=>{
 const db=store();db.startAttempt(E.createState('u03'));let other=E.createState('u03',{decisionId:'u03-decision-2'});other=command(other,{type:'endTurn'});assert.equal(E.validateState(other).ok,true);assert.equal(db.saveSession(other).ok,false);assert.equal(db.loadSession().data.decisionId,'u03-decision-1');
});
