'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../js/tactical/tactical_engine.js');
const M = require('../js/tactical/tactical_missions.js');
const copy = x => JSON.parse(JSON.stringify(x));
const unit = (s, id) => s.units.find(u => u.id === id);
function apply(s, c) { const r = E.command(s, { ...c, revision: s.revision }); assert.equal(r.ok, true, JSON.stringify(c) + ': ' + r.message); return r.state; }
function run(s, commands) { return commands.reduce(apply, s); }
const U03_WIN = [{type:'move',unitId:'scout',x:2,y:1},{type:'skill',unitId:'scout',skillId:'rescue',targetId:'civilian-1'},{type:'move',unitId:'guardian',x:3,y:3},{type:'skill',unitId:'guardian',skillId:'guard'},{type:'move',unitId:'medic',x:4,y:4},{type:'skill',unitId:'medic',skillId:'guard'},{type:'endTurn'},{type:'move',unitId:'scout',x:0,y:2},{type:'skill',unitId:'scout',skillId:'guard'},{type:'move',unitId:'guardian',x:5,y:3},{type:'skill',unitId:'guardian',skillId:'rescue',targetId:'civilian-2'},{type:'move',unitId:'medic',x:1,y:4},{type:'skill',unitId:'medic',skillId:'guard'},{type:'endTurn'},{type:'skill',unitId:'scout',skillId:'guard'},{type:'move',unitId:'guardian',x:2,y:3},{type:'skill',unitId:'guardian',skillId:'guard'},{type:'move',unitId:'medic',x:0,y:4},{type:'skill',unitId:'medic',skillId:'heal',targetId:'guardian'},{type:'endTurn'},{type:'skill',unitId:'scout',skillId:'guard'},{type:'move',unitId:'guardian',x:0,y:3}];

test('UMD browser globals and CommonJS produce identical initial state', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../js/tactical/tactical_missions.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/tactical/tactical_engine.js'), 'utf8'), context);
  assert.deepEqual(copy(context.TacticalEngine.createState('u03')), copy(E.createState('u03')));
  assert.equal(context.TacticalMissions.missions.length, 13);
});
test('state format is isolated tactical-v2 with no random or time dependence', () => {
  const a = E.createState('u03'), b = E.createState('u03');
  assert.deepEqual(a, b); assert.equal(a.format, 'ndmu-ethics-tactical'); assert.equal(a.version, 2);
  assert.equal(a.contentVersion, M.CONTENT_VERSION); assert.equal(a.round, 1); assert.equal(a.turnLimit, 5);
  assert.equal(a.units.filter(u => u.team === 'player').length, 3);
  const src = fs.readFileSync(require.resolve('../js/tactical/tactical_engine.js'), 'utf8');
  assert.doesNotMatch(src, /Math\.random\(|Date\.now\(|new Date\(|fetch\(|localStorage/);
  assert.throws(() => E.createState('u99')); assert.throws(() => E.createState('u03', { seed: 1 }));
});
test('all generated state and public content are deeply immutable', () => {
  const s = E.createState('u03'); assert.ok(Object.isFrozen(s)); assert.ok(Object.isFrozen(s.units[0]));
  assert.throws(() => { s.units[0].hp = 999; }, TypeError);
  assert.throws(() => { M.missions[0].turnLimit = 999; }, TypeError);
  const before = JSON.stringify(s), next = apply(s, {type:'move',unitId:'guardian',x:2,y:2});
  assert.equal(JSON.stringify(s), before); assert.notEqual(next, s); assert.equal(s.revision, 0); assert.equal(next.revision, 1);
});
test('stale, absent, forged or unknown command fields are rejected without mutation', () => {
  const s = E.createState('u03');
  for (const c of [{type:'endTurn'}, {type:'endTurn',revision:99}, {type:'endTurn',revision:0,hp:999}, {type:'teleport',revision:0}, {type:'move',revision:0,unitId:'guardian',x:99,y:99}]) {
    const r = E.command(s,c); assert.equal(r.ok,false); assert.equal(r.state,s); assert.deepEqual(r.events,[]);
  }
});
test('each unit has exactly one move and one skill, in either order, and explicit endTurn', () => {
  let a = E.createState('u03'); a = apply(a,{type:'skill',unitId:'guardian',skillId:'guard'}); a = apply(a,{type:'move',unitId:'guardian',x:2,y:2});
  assert.equal(a.round,1); assert.equal(unit(a,'guardian').acted,true); assert.equal(unit(a,'guardian').moved,true);
  assert.equal(E.command(a,{type:'move',unitId:'guardian',x:3,y:2,revision:a.revision}).ok,false);
  assert.equal(E.command(a,{type:'skill',unitId:'guardian',skillId:'guard',revision:a.revision}).ok,false);
  a = apply(a,{type:'move',unitId:'scout',x:2,y:3}); a = apply(a,{type:'skill',unitId:'scout',skillId:'guard'});
  a = apply(a,{type:'wait',unitId:'medic'}); assert.equal(a.round,1,'does not automatically end player phase');
  a = apply(a,{type:'endTurn'}); assert.equal(a.round,2); assert.ok(a.units.filter(u=>u.team==='player').every(u=>!u.acted&&!u.moved));
});
test('reachable paths are cardinal, obey budget, walls and occupied cells', () => {
  const s = E.createState('u03');
  for(const p of E.reachable(s,'scout')) { assert.ok(p.cost<=4); assert.deepEqual(p.path[0],{x:1,y:3});
    for(let i=1;i<p.path.length;i++){ assert.equal(Math.abs(p.path[i].x-p.path[i-1].x)+Math.abs(p.path[i].y-p.path[i-1].y),1); assert.ok(E.tileAt(s,p.path[i].x,p.path[i].y).passable); }
  }
  assert.equal(E.reachable(s,'guardian').some(p=>p.x===1&&p.y===3),false);
  assert.equal(E.reachable(s,'guardian').some(p=>p.x===3&&p.y===1),false,'waiting civilian blocks occupancy');
  assert.equal(E.tileAt(s,-1,0).passable,false); assert.equal(E.tileAt(s,4,2).type,'wall');
});
test('rough terrain consumes two movement points', () => {
  const s = E.createState('u08'); const path = E.reachable(s,'scout').find(p=>p.x===4&&p.y===3);
  assert.equal(path,undefined,'three horizontal tiles plus rough costs exceed route or are blocked');
  assert.equal(E.tileAt(s,4,2).cost,2);
});
test('locked gates become traversable only after completing the linked object', () => {
  let s = E.createState('u01'); assert.equal(E.tileAt(s,3,3).passable,false);
  s = apply(s,{type:'skill',unitId:'medic',skillId:'interact',targetId:'gate'});
  assert.equal(s.objects[0].complete,true); assert.equal(E.tileAt(s,3,3).passable,true);
});
test('mission interactions enforce prerequisite ordering and multi-action progress', () => {
  let s=E.createState('u04'); s=run(s,[{type:'move',unitId:'guardian',x:1,y:0},{type:'move',unitId:'scout',x:4,y:2},{type:'endTurn'},{type:'move',unitId:'scout',x:4,y:3}]);
  const p=E.preview(s,{type:'skill',unitId:'scout',skillId:'interact',targetId:'relay'}); assert.equal(p.ok,false); assert.match(p.message,/前站/);
  const m=E.createState('u10'); assert.equal(m.objects.find(o=>o.id==='advice').required,2);
});
test('role-specific skills, costs and invalid targets are enforced', () => {
  const s=E.createState('u03'); assert.equal(E.preview(s,{type:'skill',unitId:'guardian',skillId:'heal',targetId:'scout'}).ok,false);
  assert.equal(E.preview(s,{type:'skill',unitId:'medic',skillId:'heal',targetId:'scout'}).ok,false,'cannot heal full HP');
  assert.equal(E.preview(s,{type:'skill',unitId:'scout',skillId:'shot',targetId:'civilian-1'}).ok,false,'cannot attack civilians');
  assert.equal(E.preview(s,{type:'skill',unitId:'scout',skillId:'smoke',x:4,y:2}).ok,false,'wall cannot be smoke target');
  assert.equal(E.preview(s,{type:'skill',unitId:'scout',skillId:'smoke',x:7,y:5}).ok,false,'out of range');
});
test('smoke costs energy, changes line of sight and clears after the enemy phase', () => {
  let s=E.createState('u03'); assert.equal(E.hasLineOfSight(s,{x:2,y:3},{x:5,y:3}),true);
  s=apply(s,{type:'skill',unitId:'scout',skillId:'smoke',x:4,y:3});
  assert.equal(unit(s,'scout').energy,0); assert.equal(s.smoke.length,4,'wall clips one smoke cell');
  assert.equal(E.hasLineOfSight(s,{x:2,y:3},{x:5,y:3}),false);
  assert.equal(E.hasLineOfSight(s,{x:3,y:3},{x:4,y:3}),true,'nearby interaction still works');
  s=apply(s,{type:'endTurn'}); assert.equal(s.smoke.length,0); assert.equal(unit(s,'scout').energy,1);
});
test('attacks are deterministic, hit-point bounded and expose before/after events', () => {
  let s=E.createState('u03'); s=apply(s,{type:'move',unitId:'scout',x:5,y:3});
  const c={type:'skill',unitId:'scout',skillId:'shot',targetId:'enemy-2',revision:s.revision};const p=E.preview(s,c);assert.equal(p.ok,true);
  const a=E.command(s,c),b=E.command(s,c);assert.deepEqual(a,b);const e=a.events.find(e=>e.type==='damage');
  assert.equal(e.hpBefore-e.hpAfter,p.damage);assert.equal(unit(a.state,'enemy-2').hp,6-p.damage);assert.equal(s.units.find(u=>u.id==='enemy-2').hp,6);
});
test('adjacent friendly formation grants a visible +1 combination bonus', () => {
  let s=E.createState('u03');s=apply(s,{type:'move',unitId:'scout',x:5,y:3});s=run(s,[{type:'move',unitId:'medic',x:4,y:4},{type:'endTurn'},{type:'move',unitId:'medic',x:4,y:3}]);
  const p=E.preview(s,{type:'skill',unitId:'scout',skillId:'shot',targetId:'enemy-2'});assert.equal(p.combo,true);assert.equal(p.damage,4);
  const r=E.command(s,{type:'skill',unitId:'scout',skillId:'shot',targetId:'enemy-2',revision:s.revision});assert.ok(r.events.some(e=>e.type==='combo'));assert.equal(r.state.metrics.combos,1);
});
test('enemy intentions exactly predict the ordered next enemy attack/move phase', () => {
  let s=E.createState('u03'); s=apply(s,{type:'move',unitId:'scout',x:5,y:3}); s=apply(s,{type:'move',unitId:'medic',x:4,y:4});
  const intents=E.enemyIntents(s),r=E.command(s,{type:'endTurn',revision:s.revision});assert.equal(r.ok,true);
  for(const intent of intents){const moves=r.events.filter(e=>e.type==='move'&&e.unitId===intent.enemyId);if(intent.path.length>1)assert.deepEqual(moves[0].to,intent.to);if(intent.type==='attack'){const e=r.events.find(e=>e.type==='attack'&&e.unitId===intent.enemyId);assert.equal(e.targetId,intent.targetId);assert.equal(e.amount,intent.damage);}}
  assert.ok(intents.some(i=>i.type==='attack'));
});
test('guardian suppression consumes two energy and cancels a machine action', () => {
  let s=E.createState('u12');s=apply(s,{type:'move',unitId:'guardian',x:3,y:3});s=apply(s,{type:'skill',unitId:'guardian',skillId:'suppress',targetId:'enemy-3'});
  assert.equal(unit(s,'guardian').energy,1);assert.equal(E.enemyIntents(s).find(i=>i.enemyId==='enemy-3').type,'wait');
  const r=E.command(s,{type:'endTurn',revision:s.revision});assert.equal(r.events.some(e=>e.type==='attack'&&e.unitId==='enemy-3'),false);assert.equal(unit(r.state,'enemy-3').statuses.suppressed,undefined);
});
test('cover and guardian protection lower the deterministic enemy damage', () => {
  let s=E.createState('u03');s=apply(s,{type:'move',unitId:'scout',x:5,y:3});
  const raw=E.enemyIntents(s).filter(i=>i.type==='attack'&&i.targetId==='scout').reduce((n,i)=>n+i.damage,0);
  const guarded=apply(s,{type:'skill',unitId:'scout',skillId:'guard'});const reduced=E.enemyIntents(guarded).filter(i=>i.type==='attack'&&i.targetId==='scout').reduce((n,i)=>n+i.damage,0);
  assert.ok(raw>reduced);assert.equal(E.tileAt(s,3,3).cover,1);
});
test('rescue carries exactly one civilian and deposits only on an exit', () => {
  let s=E.createState('u03');s=run(s,U03_WIN.slice(0,2));assert.equal(unit(s,'scout').carrying,'civilian-1');assert.equal(s.civilians[0].status,'carried');assert.equal(s.metrics.rescued,0);
  s=run(s,U03_WIN.slice(2,8));assert.equal(s.civilians[0].status,'evacuated');assert.equal(unit(s,'scout').carrying,null);assert.equal(s.metrics.rescued,1);
});
test('u03 can win within five rounds without attacking or eliminating any machine', () => {
  const s=run(E.createState('u03'),U03_WIN);const report=E.summary(s);assert.equal(s.status,'won');assert.ok(s.round<=5);assert.equal(s.metrics.disabled,0);assert.equal(s.metrics.damageDealt,0);assert.equal(s.metrics.rescued,2);assert.equal(report.surviving,3);assert.equal(report.canReflect,true);
  assert.ok(s.units.filter(u=>u.team==='enemy').every(u=>u.hp>0));assert.ok(report.objectives.every(o=>o.complete));
});
test('timeout is terminal and still permits reflection, without claiming attendance', () => {
  let s=E.createState('u03');while(s.status==='active')s=apply(s,{type:'endTurn'});
  assert.equal(s.status,'lost');assert.equal(s.round,5);assert.equal(E.summary(s).canReflect,true);assert.equal(E.summary(s).won,false);
  assert.equal(E.summary(E.createState('u03')).canReflect,false);
  assert.equal(E.command(s,{type:'endTurn',revision:s.revision}).ok,false);assert.equal(Object.hasOwn(s,'attendance'),false);
});
test('undo restores all tactical effects, appends history and cannot cross enemy phase', () => {
  let s=E.createState('u03');const initial=copy(s);s=apply(s,{type:'skill',unitId:'scout',skillId:'smoke',x:4,y:3});s=apply(s,{type:'undo'});
  assert.deepEqual(s.units,initial.units);assert.deepEqual(s.smoke,[]);assert.equal(s.revision,2);assert.equal(s.commandLog.length,2);assert.equal(s.commandLog[1].type,'undo');
  assert.equal(E.validateState(copy(s)).ok,true);s=apply(s,{type:'endTurn'});assert.equal(E.command(s,{type:'undo',revision:s.revision}).ok,false);
});
test('retry resets the full battle while preserving revision and replay lineage', () => {
  let s=run(E.createState('u03'),U03_WIN);const rev=s.revision;s=apply(s,{type:'retry'});const fresh=E.createState('u03');
  assert.equal(s.status,'active');assert.equal(s.round,1);assert.equal(s.revision,rev+1);assert.equal(s.attempt,2);assert.equal(s.metrics.retries,1);
  assert.deepEqual(s.units,fresh.units);assert.deepEqual(s.civilians,fresh.civilians);assert.deepEqual(s.objects,fresh.objects);assert.deepEqual(s.smoke,[]);assert.deepEqual(s.undoStack,[]);
  assert.equal(E.validateState(copy(s)).ok,true);assert.equal(E.command(s,{type:'endTurn',revision:rev}).ok,false);
});
test('decisions are bounded pre-battle choices and replay their real resource tradeoff', () => {
  const a=E.createState('u03'),b=E.createState('u03',{decisionId:'u03-decision-2'});assert.equal(unit(a,'medic').energy,3);assert.equal(unit(b,'scout').energy,3);assert.equal(a.turnLimit,b.turnLimit);
  let changed=apply(a,{type:'chooseDecision',decisionId:'u03-decision-2'});assert.equal(changed.decisionId,b.decisionId);assert.equal(E.validateState(copy(changed)).ok,true);
  assert.equal(E.command(changed,{type:'chooseDecision',decisionId:'u03-decision-1',revision:changed.revision}).ok,false);
  assert.equal(E.createState('u13',{decisionId:'u13-decision-2'}).turnLimit,E.createState('u13').turnLimit+1);
});
test('late information is revealed on the specified round without auto-completing', () => {
  let s=E.createState('u12');assert.equal(s.civilians[2].status,'hidden');assert.equal(E.objectiveProgress(s).find(o=>o.id==='rescue').required,3);
  const r=E.command(s,{type:'endTurn',revision:0});s=r.state;assert.equal(s.civilians[2].status,'waiting');assert.ok(r.events.some(e=>e.type==='reveal'));assert.equal(s.status,'active');
});
test('hold points require physical occupation through the enemy phase', () => {
  let s=E.createState('u06');s=apply(s,{type:'move',unitId:'guardian',x:3,y:1});s=apply(s,{type:'skill',unitId:'guardian',skillId:'guard'});s=apply(s,{type:'endTurn'});
  assert.equal(s.objects.find(o=>o.id==='north').progress,1);assert.equal(s.objects.find(o=>o.id==='south').progress,0);
  assert.equal(E.preview(s,{type:'skill',unitId:'guardian',skillId:'interact',targetId:'north'}).ok,false);
});
test('full deterministic replay matches a serialized victory exactly', () => {
  const s=run(E.createState('u03'),U03_WIN),r=E.replay('u03',copy(s.commandLog),{decisionId:s.initialDecisionId});assert.equal(r.ok,true);assert.deepEqual(r.state,s);assert.equal(E.validateState(copy(s)).ok,true);
});
test('validator rejects forged success, HP, resources, coordinates, unknown fields and event logs', () => {
  const s=run(E.createState('u03'),U03_WIN.slice(0,8));
  const mutations=[x=>x.status='won',x=>x.units[0].hp=999,x=>x.units[1].energy=999,x=>x.units[0].x=99,x=>x.units[0].x=x.units[1].x,x=>x.extra='untrusted',x=>x.units[0].extra=true,x=>x.log.push({type:'win'}),x=>x.metrics.rescued=2,x=>x.revision++,x=>x.contentVersion='other',x=>x.initialDecisionId='bad',x=>x.commandLog[0].revision=99,x=>x.commandLog.push({type:'endTurn',revision:0}),x=>x.objects.push({id:'fake',complete:true})];
  for(const mutate of mutations){const forged=copy(s);mutate(forged);assert.equal(E.validateState(forged).ok,false);assert.equal(E.command(forged,{type:'endTurn',revision:forged.revision}).ok,false);}
  assert.equal(E.validateState(null).ok,false);assert.equal(E.validateState([]).ok,false);const cyc={};cyc.self=cyc;assert.equal(E.validateState(cyc).ok,false);
});
test('replay rejects malformed commands, unknown mission and oversized histories', () => {
  assert.equal(E.replay('u99',[]).ok,false);assert.equal(E.replay('u03',{}).ok,false);assert.equal(E.replay('u03',[{type:'endTurn',revision:99}]).ok,false);assert.equal(E.replay('u03',new Array(E.MAX_COMMANDS+1).fill({type:'endTurn',revision:0})).ok,false);
});

test('an interrupted rescue drops its civilian for another teammate rather than claiming success', () => {
  let s=run(E.createState('u03'),[{type:'move',unitId:'scout',x:5,y:3},{type:'skill',unitId:'scout',skillId:'rescue',targetId:'civilian-2'},{type:'endTurn'},{type:'endTurn'}]);
  assert.equal(unit(s,'scout').hp,0);assert.equal(unit(s,'scout').carrying,null);
  const c=s.civilians.find(c=>c.id==='civilian-2');assert.equal(c.status,'waiting');assert.equal(c.carrierId,null);assert.deepEqual({x:c.x,y:c.y},{x:5,y:3});assert.equal(s.metrics.rescued,0);
  assert.equal(E.getSkills(s,'scout').every(sk=>!sk.available),true);assert.deepEqual(E.reachable(s,'scout'),[]);
  assert.equal(E.validateState(copy(s)).ok,true);
});

test('smoke really prevents exposed enemy ranged attacks while near attacks remain legal', () => {
  let s=E.createState('u03',{decisionId:'u03-decision-2'});s=apply(s,{type:'move',unitId:'scout',x:5,y:3});
  const before=E.enemyIntents(s).filter(i=>i.type==='attack'&&i.targetId==='scout');assert.equal(before.length,2);
  s=apply(s,{type:'skill',unitId:'scout',skillId:'smoke',x:5,y:3});
  const after=E.enemyIntents(s).filter(i=>i.type==='attack'&&i.targetId==='scout');assert.equal(after.length,1);assert.equal(after[0].enemyId,'enemy-2');
});

function isolatedEngine(mutator) {
  const content=copy(M.missions);mutator(content);
  const context=vm.createContext({TacticalMissions:{missions:content,CONTENT_VERSION:M.CONTENT_VERSION,legend:copy(M.legend),getMission:id=>content.find(m=>m.id===id)}});
  vm.runInContext(fs.readFileSync(require.resolve('../js/tactical/tactical_engine.js'),'utf8'),context);
  return context.TacticalEngine;
}

test('late information relocates deterministically if its original tile is occupied', () => {
  const engine=isolatedEngine(missions=>{const m=missions.find(m=>m.id==='u12');m.civilians[2].x=1;m.civilians[2].y=2;});
  const s=engine.command(engine.createState('u12'),{type:'endTurn',revision:0}).state;
  const c=s.civilians[2];assert.equal(c.status,'waiting');assert.notDeepEqual({x:c.x,y:c.y},{x:1,y:2});
  assert.equal(s.units.some(u=>u.hp>0&&u.x===c.x&&u.y===c.y),false);
  assert.equal(s.civilians.some(other=>other.id!==c.id&&other.status==='waiting'&&other.x===c.x&&other.y===c.y),false);
  assert.equal(engine.validateState(copy(s)).ok,true);
});

test('mixed objective groups cannot complete each other through shared counts', () => {
  const engine=isolatedEngine(missions=>{const m=missions.find(m=>m.id==='u01');m.objects.push({id:'hold-extra',name:'輪值點',x:2,y:0,kind:'hold',required:1,dependsOn:[]});m.objectives.push({id:'hold',type:'hold',label:'輪值',required:1,objectIds:['hold-extra']});});
  let s=engine.createState('u01');s=engine.command(s,{type:'skill',unitId:'medic',skillId:'interact',targetId:'gate',revision:0}).state;
  const progress=engine.objectiveProgress(s);assert.equal(progress.find(o=>o.id==='interact').complete,true);assert.equal(progress.find(o=>o.id==='hold').complete,false);
});

test('fatigue is a visible, bounded consequence of three consecutive active skill turns', () => {
  const engine=isolatedEngine(missions=>{const m=missions.find(m=>m.id==='u06');m.enemies=[];m.hazards=[];m.objects=[{id:'long-task',name:'接力工作',x:2,y:2,kind:'relay',required:5,dependsOn:[]}];m.objectives=[{id:'interact',type:'interact',label:'工作',required:1,objectIds:['long-task']},{id:'extract',type:'extract',label:'撤離',required:3}];});
  let s=engine.createState('u06');for(let i=0;i<3;i++){s=engine.command(s,{type:'skill',unitId:'guardian',skillId:'interact',targetId:'long-task',revision:s.revision}).state;s=engine.command(s,{type:'endTurn',revision:s.revision}).state;}
  assert.equal(unit(s,'guardian').hp,17);assert.equal(s.metrics.fatigueDamage,1);assert.ok(s.log.some(e=>e.type==='fatigue'));
  s=engine.command(s,{type:'skill',unitId:'guardian',skillId:'guard',revision:s.revision}).state;s=engine.command(s,{type:'endTurn',revision:s.revision}).state;assert.equal(s.metrics.fatigueDamage,1);assert.equal(unit(s,'guardian').consecutiveActions,0);
});

test('energy shortages reject costly skills and waiting never creates negative resources', () => {
  let s=E.createState('u08',{decisionId:'u08-decision-2'});assert.equal(unit(s,'guardian').energy,1);
  const skill=E.getSkills(s,'guardian').find(sk=>sk.id==='suppress');assert.equal(skill.available,false);assert.match(skill.reason,/能量不足/);
  s=apply(s,{type:'wait',unitId:'guardian'});assert.equal(unit(s,'guardian').energy,1);s=apply(s,{type:'endTurn'});assert.equal(unit(s,'guardian').energy,2);
});

test('deterministic adversarial command walks retain replay, bounds and occupancy invariants', () => {
  let seed=20261006;const next=limit=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%limit;};
  for(const mission of M.missions){let s=E.createState(mission.id);for(let step=0;step<70&&s.status==='active';step++){
    const candidates=[{type:'endTurn'}];
    for(const u of s.units.filter(u=>u.team==='player'&&u.hp>0)){
      for(const p of E.reachable(s,u.id))candidates.push({type:'move',unitId:u.id,x:p.x,y:p.y});
      for(const sk of E.getSkills(s,u.id).filter(sk=>sk.available)){
        const targets=sk.target==='self'?[u]:sk.target==='enemy'?s.units.filter(v=>v.team==='enemy'):sk.target==='ally'?s.units.filter(v=>v.team==='player'):sk.target==='civilian'?s.civilians:sk.target==='object'?s.objects:[u,...E.reachable(s,u.id)];
        for(const target of targets){const c={type:'skill',unitId:u.id,skillId:sk.id,...(sk.target==='tile'?{x:target.x,y:target.y}:{targetId:target.id})};if(E.preview(s,c).ok)candidates.push(c);}
      }
    }
    s=apply(s,candidates[next(candidates.length)]);
    for(const u of s.units){assert.ok(u.hp>=0&&u.hp<=u.maxHp);assert.ok(u.energy>=0&&u.energy<=u.maxEnergy);assert.equal(E.tileAt(s,u.x,u.y).passable,true);}
    const occupied=s.units.filter(u=>u.hp>0).concat(s.civilians.filter(c=>c.status==='waiting')).map(u=>u.x+','+u.y);assert.equal(occupied.length,new Set(occupied).size);
    for(const u of s.units.filter(u=>u.carrying)){const c=s.civilians.find(c=>c.id===u.carrying);assert.equal(c.status,'carried');assert.equal(c.carrierId,u.id);assert.equal(c.x,u.x);assert.equal(c.y,u.y);}
  }assert.equal(E.validateState(copy(s)).ok,true,mission.id+' replay after arbitrary legal actions');}
});
