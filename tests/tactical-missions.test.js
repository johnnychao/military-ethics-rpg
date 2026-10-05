'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('../js/data/rpg_chapters.js');
const E = require('../js/tactical/tactical_engine.js');
const M = require('../js/tactical/tactical_missions.js');
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const N=p=>[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}];
function solve(id,decision=0,verbose=false){
 let s=E.createState(id,{decisionId:M.getMission(id).decisions[decision].id});const cmds=[];const assignments={};
 const run=c=>{const r=E.command(s,{...c,revision:s.revision});if(!r.ok)throw new Error(JSON.stringify(c)+' '+r.message);cmds.push(c);s=r.state;if(verbose)console.log(s.round,c,r.events.map(e=>e.message).join('|'));};
 const exits=[];M.getMission(id).map.rows.forEach((row,y)=>[...row].forEach((ch,x)=>{if(ch==='E')exits.push({x,y});}));
 function pathDistance(from,goal,radius,excludeId){
  const q=[{...from,cost:0}],seen=new Map();while(q.length){q.sort((a,b)=>a.cost-b.cost);const p=q.shift(),k=p.x+','+p.y;if(seen.has(k))continue;seen.set(k,p.cost);if(dist(p,goal)<=radius)return p.cost;for(const n of N(p)){const t=E.tileAt(s,n.x,n.y);if(!t.passable||s.units.some(u=>u.hp>0&&u.id!==excludeId&&u.x===n.x&&u.y===n.y)||s.civilians.some(c=>c.status==='waiting'&&c.x===n.x&&c.y===n.y))continue;q.push({...n,cost:p.cost+t.cost});}}return 1000;
 }
 function tasks(u){if(u.carrying)return exits.map((e,i)=>({...e,id:'exit'+i,type:'exit',radius:0}));const objs=s.objects.filter(o=>!o.complete&&o.dependsOn.every(id=>s.objects.some(other=>other.id===id&&other.complete))).map(o=>({...o,type:o.kind==='hold'?'hold':'object',radius:o.kind==='hold'?0:1}));const civs=s.civilians.filter(c=>c.status==='waiting').map(c=>({...c,type:'civilian',radius:1}));const all=objs.concat(civs);if(!all.length)return exits.map((e,i)=>({...e,id:'exit'+i,type:'exit',radius:0}));return all;}
 function objectiveAct(u,goal){if(u.acted)return false;if(goal.type==='object'||goal.type==='civilian'){const c={type:'skill',unitId:u.id,skillId:goal.type==='object'?'interact':'rescue',targetId:goal.id};if(E.preview(s,c).ok){run(c);return true;}}return false;}
 function support(u){if(u.acted)return;let actions=[];for(const sk of E.getSkills(s,u.id).filter(sk=>sk.available)){
 if(sk.id==='heal')for(const a of s.units.filter(a=>a.team==='player'&&a.hp>0)){const c={type:'skill',unitId:u.id,skillId:sk.id,targetId:a.id};const p=E.preview(s,c);if(p.ok)actions.push({c,v:(a.maxHp-a.hp)*1.1+(a.carrying?2:0)});}
 if(sk.target==='enemy')for(const e of s.units.filter(e=>e.team==='enemy'&&e.hp>0)){const c={type:'skill',unitId:u.id,skillId:sk.id,targetId:e.id};const p=E.preview(s,c);if(p.ok){const threat=E.enemyIntents(s).find(i=>i.enemyId===e.id&&i.type==='attack');actions.push({c,v:p.damage+(p.damage>=e.hp?9:0)+(sk.id==='suppress'&&threat?4:0)});}}
 }
 actions.sort((a,b)=>b.v-a.v);if(actions.length&&actions[0].v>3)run(actions[0].c);else{const c={type:'skill',unitId:u.id,skillId:'guard'};if(E.preview(s,c).ok)run(c);}
 }
 for(let round=1;round<=12&&s.status==='active';round++){
  const used=new Set();
  // Medics work last so that they can heal damage taken in previous phases.
  for(const uid of ['scout','guardian','medic']){
   let u=s.units.find(u=>u.id===uid);if(u.hp<=0||s.status!=='active')continue;
   let goals=tasks(u);const available=goals.filter(g=>!used.has(g.id));if(available.length)goals=available;
   goals=goals.map(g=>({...g,d:pathDistance(u,g,g.radius,u.id)})).sort((a,b)=>a.d-b.d||a.id.localeCompare(b.id));let goal=goals[0];used.add(goal.id);assignments[uid]=goal.id;
   objectiveAct(u,goal);u=s.units.find(v=>v.id===uid);if(u.carrying){goals=tasks(u).map(g=>({...g,d:pathDistance(u,g,g.radius,u.id)})).sort((a,b)=>a.d-b.d);goal=goals[0];}
   if(!u.moved){const moves=E.reachable(s,u.id).map(p=>({...p,d:pathDistance(p,goal,goal.radius,u.id),risk:E.hazardCells(s).reduce((n,h)=>n+(h.cells.some(c=>dist(c,p)===0)?h.damage:0),0)}));moves.push({...u,cost:0,d:pathDistance(u,goal,goal.radius,u.id),risk:0});moves.sort((a,b)=>a.d-b.d||a.risk-b.risk||E.tileAt(s,b.x,b.y).cover-E.tileAt(s,a.x,a.y).cover||a.cost-b.cost);const best=moves[0];if(best.cost>0)run({type:'move',unitId:u.id,x:best.x,y:best.y});}
   if(s.status!=='active')break;u=s.units.find(v=>v.id===uid);objectiveAct(u,goal);if(s.status!=='active')break;u=s.units.find(v=>v.id===uid);support(u);
  }
  if(s.status==='active')run({type:'endTurn'});
 }
 return {state:s,cmds,summary:E.summary(s)};
}


test('all thirteen missions preserve exact chapter concepts, source pages and ethical alternatives', () => {
  assert.equal(M.missions.length, 13);
  assert.deepEqual([...M].map(m => m.id), legacy.chapters.map(c => c.id));
  for (const mission of M.missions) {
    const chapter = legacy.chapters.find(c => c.id === mission.id);
    assert.equal(mission.chapterTitle, chapter.title);
    assert.equal(mission.topic, chapter.topic);
    assert.equal(mission.learningObjective, chapter.objective);
    assert.deepEqual(mission.concepts, chapter.concepts);
    assert.deepEqual(mission.sourceRefs, chapter.sourceRefs);
    assert.equal(mission.decisions.length, 2);
    mission.decisions.forEach((decision, i) => {
      const original = chapter.scenario.paths[i];
      for (const field of ['label', 'text', 'tradeoff']) assert.equal(decision[field], original[field]);
      assert.ok(decision.tactical.length > 10);
      assert.ok(!Object.hasOwn(decision, 'correct'));
    });
    assert.match(mission.attendanceNote, /勝敗不影響/);
    assert.match(mission.trainingNote, /訓練機器/);
    assert.ok(mission.reflection.reasonLabel && mission.reflection.revisionLabel);
  }
});

test('missions have distinct geography, hazards and more than numerical variation', () => {
  assert.equal(new Set(M.missions.map(m => m.map.rows.join('\n'))).size, 13);
  assert.equal(new Set(M.missions.map(m => m.hazards[0].id)).size, 13);
  assert.ok(new Set(M.missions.map(m => m.map.width + 'x' + m.map.height)).size >= 4);
  assert.ok(new Set(M.missions.map(m => m.objectives.map(o => o.type).join(','))).size >= 4);
  assert.ok(M.missions.some(m => m.rules && m.rules.fatigue));
  assert.ok(M.missions.some(m => m.objects.some(o => o.required > 1)));
  assert.ok(M.missions.some(m => m.objects.some(o => o.dependsOn.length > 0)));
  assert.ok(M.missions.some(m => m.civilians.some(c => c.revealRound > 1)));
  assert.equal(M.getMission('u03').turnLimit, 5);
  assert.equal(M.getMission('u03').civilians.length, 2);
});

test('all map rows, spawns, nodes, civilians, training machines and hazards are well-formed', () => {
  for (const mission of M.missions) {
    const s = E.createState(mission.id), map = mission.map;
    assert.equal(map.rows.length, map.height);
    assert.ok(map.rows.every(row => row.length === map.width));
    assert.ok(map.rows.every(row => [...row].every(ch => Object.hasOwn(M.legend, ch))));
    const initial = s.units.concat(s.civilians.filter(c => c.status === 'waiting'));
    assert.equal(new Set(initial.map(p => p.x + ',' + p.y)).size, initial.length, mission.id + ' initial occupancy');
    for (const p of initial.concat(s.objects)) assert.equal(E.tileAt(s, p.x, p.y).passable, true, mission.id + ' valid node ' + p.id);
    assert.ok(map.rows.join('').split('E').length - 1 >= 3);
    assert.ok(s.units.filter(u => u.team === 'enemy').every(u => ['sentry', 'drone', 'bulwark'].includes(u.role)));
    for (const object of s.objects) {
      assert.ok(object.required >= 1);
      assert.ok(object.dependsOn.every(id => s.objects.some(o => o.id === id)));
      assert.ok(!object.dependsOn.includes(object.id));
    }
    for (const objective of mission.objectives.filter(o => ['interact', 'hold'].includes(o.type))) {
      assert.equal(objective.required, objective.objectIds.length);
      assert.ok(objective.objectIds.every(id => s.objects.some(o => o.id === id)));
    }
    for (const hazard of mission.hazards) {
      assert.ok(hazard.rounds.every(r => Number.isInteger(r) && r >= 1 && r <= mission.turnLimit));
      assert.ok(hazard.damage >= 1 && hazard.damage <= 3);
      assert.ok(hazard.cells.every(([x, y]) => x >= 0 && y >= 0 && x < map.width && y < map.height));
    }
  }
});

for (const mission of M.missions) for (const decision of [0, 1]) {
  test('legal objective-first bot clears ' + mission.id + ' / decision ' + (decision + 1), t => {
    const result = solve(mission.id, decision), s = result.state;
    assert.equal(s.status, 'won', mission.id + ': ' + JSON.stringify(result.summary));
    assert.ok(s.round <= s.turnLimit);
    assert.ok(result.summary.objectives.every(o => o.complete));
    assert.equal(result.summary.surviving, 3);
    assert.equal(s.metrics.incapacitated, 0);
    assert.equal(E.validateState(JSON.parse(JSON.stringify(s))).ok, true);
    const replay = E.replay(mission.id, s.commandLog, { decisionId: s.initialDecisionId });
    assert.equal(replay.ok, true);
    assert.deepEqual(replay.state, s);
    for (const unit of s.units) {
      assert.ok(unit.hp >= 0 && unit.hp <= unit.maxHp);
      assert.ok(unit.energy >= 0 && unit.energy <= unit.maxEnergy);
    }
    const livePositions = s.units.filter(u => u.hp > 0).concat(s.civilians.filter(c => c.status === 'waiting')).map(p => p.x + ',' + p.y);
    assert.equal(new Set(livePositions).size, livePositions.length);
    if (mission.id === 'u03') {
      assert.equal(s.metrics.disabled, 0, 'first rescue mission never requires total elimination');
      assert.ok(s.log.filter(e => e.type === 'attack' && e.team === 'enemy').length >= 3, 'normal rescue route includes visible counterattacks');
      assert.equal(result.summary.surviving, 3);
    }
    t.diagnostic('rounds=' + s.round + '/' + s.turnLimit + ', commands=' + s.commandLog.length + ', rescued=' + s.metrics.rescued + ', squad=' + result.summary.surviving + '/3');
  });
}
