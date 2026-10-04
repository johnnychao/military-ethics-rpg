'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/engine/rpg_engine.js');

function fixture() {
  const roles = ['cadet', 'liaison', 'logistics', 'doctor'];
  return {
    id: 'u03', number: 3, title: '界線',
    map: { width: 16, height: 20, spawn: { x: 8, y: 17 }, gate: { x: 8, y: 13 }, walls: [{ x: 9, y: 16, w: 2, h: 2 }] },
    clues: [0,1,2].map(i => ({ id: 'c' + i, x: 8, y: 16 - i, text: '線索 ' + i })),
    sideQuest: { x: 7, y: 17, text: '支線故事' },
    scenario: {
      resources: { time: 12, supplies: 7, load: 0 },
      targets: roles.map((role, i) => ({ id: role + '-desk', x: i + 1, y: 5, text: '工作站' })),
      actions: roles.flatMap((unitId, i) => [
        { id: unitId + '-act', unitId, targetId: unitId + '-desk', label: '查證', cost: { time: 1, supplies: 0, load: 1 }, flag: 'f' + i, preview: '先查證', feedback: '完成查證' },
        { id: unitId + '-rest', unitId, targetId: unitId + '-desk', label: '休息', cost: { time: 1, supplies: 0, load: -2 }, flag: null, preview: '安排休息', feedback: '已休息' }
      ]),
      events: [{ round: 1, text: '第一回合回報', delta: { time: -1 } }, { round: 2, text: '新資訊：需求增加', delta: { supplies: -1, load: 1 } }],
      paths: [
        { id: 'a', cost: { time: 1 }, requiredFlags: ['f0','f1'], success: { title: '完成 A', text: 'A 結果' }, partial: { title: '未完成 A', text: 'A 部分結果' } },
        { id: 'b', cost: { supplies: 1 }, requiredFlags: ['f2','f3'], success: { title: '完成 B', text: 'B 結果' }, partial: { title: '未完成 B', text: 'B 部分結果' } }
      ]
    }
  };
}
function ok(result) { assert.equal(result.ok, true, result.message); return result.state; }
function planning(chapter = fixture()) {
  let state = ok(Engine.begin(Engine.createState(chapter), chapter));
  state = ok(Engine.interact(state, chapter, 'side'));
  for (let i = 0; i < 3; i++) {
    state = ok(Engine.interact(state, chapter, 'c' + i));
    state = ok(Engine.move(state, chapter, 0, -1));
  }
  state = ok(Engine.interact(state, chapter, 'gate'));
  return state;
}
function act(state, chapter, unitId, resting = false) {
  const actionId = unitId + (resting ? '-rest' : '-act');
  const target = chapter.scenario.targets.find(t => t.id === chapter.scenario.actions.find(a => a.id === actionId).targetId);
  const tile = Engine.reachable(state, chapter, unitId).find(t => Math.abs(t.x-target.x)+Math.abs(t.y-target.y)<=1);
  assert.ok(tile, '隊員可抵達目標');
  return { token: state.revision, unitId, actionId, x: tile.x, y: tile.y };
}
function finished(chapter = fixture(), path = 'a', partial = false) {
  let state = ok(Engine.choosePath(planning(chapter), chapter, path));
  const roles = path === 'a' ? ['cadet', 'liaison'] : ['logistics', 'doctor'];
  for (let round = 1; round <= 3; round++) {
    for (const role of roles) state = ok(Engine.execute(state, chapter, act(state, chapter, role, partial)));
  }
  return state;
}

test('探索：四方向、障礙、距離、必需線索、不可變與重複互動', () => {
  const chapter = fixture(); let state = Engine.createState(chapter);
  assert.equal(Engine.validateState(state, chapter), true);
  const original = JSON.stringify(state);
  assert.equal(Engine.move(state, chapter, 0, -1).ok, false);
  assert.equal(JSON.stringify(state), original);
  state = ok(Engine.begin(state, chapter));
  assert.equal(Engine.interact(state, chapter, 'gate').ok, false);
  assert.equal(Engine.move(state, chapter, 1, 0).ok, false);
  assert.equal(Engine.move(state, chapter, 1, -1).ok, false);
  assert.equal(Engine.interact(state, chapter, 'unknown').ok, false);
  state = ok(Engine.interact(state, chapter, 'c0'));
  const result = Engine.interact(state, chapter, 'c0');
  assert.equal(result.ok, false); assert.equal(result.state, state);
  assert.equal(Engine.validateState(planning(chapter), chapter), true);
});

test('策略：三格 BFS、角色技能限制、行動順序、成本與過期 token', () => {
  const chapter = fixture(); let state = ok(Engine.choosePath(planning(chapter), chapter, 'a'));
  assert.equal(state.tactical.resources.time, 11);
  assert.deepEqual(Engine.reachable(state, chapter, 'cadet')[0], { x: 1, y: 6, distance: 0 });
  assert.equal(Engine.reachable(state, chapter, 'cadet').some(t => t.x === 2 && t.y === 6), false);
  assert.equal(Engine.reachable(state, chapter, 'cadet').some(t => t.x === 5 && t.y === 6), false);
  const command = { ...act(state, chapter, 'cadet'), x: 1, y: 4 }, original = JSON.stringify(state);
  const check = Engine.preview(state, chapter, command);
  assert.equal(check.ok, true); assert.deepEqual(check.cost, { time: 1, supplies: 0, load: 1 });
  assert.equal(JSON.stringify(state), original);
  assert.equal(Engine.execute(state, chapter, { ...command, actionId: 'doctor-act' }).ok, false);
  assert.equal(Engine.execute(state, chapter, { ...command, x: 0, y: 0 }).ok, false);
  state = ok(Engine.execute(state, chapter, command));
  assert.deepEqual(state.tactical.units[0], { id: 'cadet', x: 1, y: 4 });
  assert.equal(Engine.execute(state, chapter, command).ok, false);
  assert.equal(Engine.execute(state, chapter, { ...command, token: state.revision }).ok, false);
  assert.equal(state.tactical.commandsLeft, 1);
  assert.equal(Engine.validateState(state, chapter), true);
  state = ok(Engine.execute(state, chapter, act(state, chapter, 'liaison')));
  assert.equal(state.tactical.round, 2); assert.equal(state.tactical.commandsLeft, 2);
  assert.deepEqual(state.tactical.used, []);
  assert.equal(state.tactical.log.filter(e => e.type === 'event').length, 2);
  assert.equal(state.tactical.log.find(e => e.round === 2 && e.type === 'event').text.includes('新資訊'), true);
  assert.equal(Engine.validateState(state, chapter), true);
});

test('資源不足與負荷過高拒絕，休息不產生負負荷', () => {
  const chapter = fixture();
  chapter.scenario.actions[0].cost.time = 30;
  const state = ok(Engine.choosePath(planning(chapter), chapter, 'a'));
  assert.equal(Engine.execute(state, chapter, act(state, chapter, 'cadet')).ok, false);
  chapter.scenario.actions[0].cost = { load: 10 };
  assert.equal(Engine.execute(state, chapter, act(state, chapter, 'cadet')).ok, false);
  const rested = ok(Engine.execute(state, chapter, act(state, chapter, 'cadet', true)));
  assert.equal(rested.tactical.resources.load, 0);
});

test('兩条倫理路徑均可完成；策略失敗同樣可回顧和完成', () => {
  const chapter = fixture();
  for (const path of ['a', 'b']) for (const partial of [false, true]) {
    let state = finished(chapter, path, partial);
    assert.equal(state.phase, 'outcome');
    assert.equal(state.tactical.result.success, !partial);
    assert.deepEqual(Engine.outcome(state, chapter), state.tactical.result);
    assert.equal(Engine.validateState(state, chapter), true);
    state = ok(Engine.interact(state, chapter, 'review'));
    assert.equal(Engine.complete(state, chapter).ok, false);
    state = ok(Engine.setReflection(state, chapter, { reason: '依據資格文件分工', revision: '收到不同資格證据時修正' }));
    state = ok(Engine.complete(state, chapter));
    assert.equal(state.phase, 'complete'); assert.ok(state.completedAt);
    assert.equal(Engine.validateState(state, chapter), true);
    assert.equal(Engine.retry(state, chapter).ok, false);
  }
});

test('重試保留線索、支線及歷次策略證據，清空當次回顧', () => {
  const chapter = fixture(); let state = finished(chapter);
  state = ok(Engine.interact(state, chapter, 'review'));
  state = ok(Engine.setReflection(state, chapter, { reason: '第一次', revision: '第二次' }));
  const previous = JSON.stringify(state);
  const next = ok(Engine.retry(state, chapter));
  assert.equal(JSON.stringify(state), previous);
  assert.deepEqual(next.clues, state.clues); assert.equal(next.sideDone, true);
  assert.deepEqual(next.tacticalAttempts[0], state.tactical);
  assert.deepEqual(next.reflection, { reason: '', revision: '' });
  assert.equal(next.tactical.log.length, 0); assert.equal(next.tactical.round, 1);
  assert.equal(Engine.validateState(next, chapter), true);
});

test('匯入驗證重演歷程，拒絕偽造旗標、成本、位置、結果、事件和完成狀態', () => {
  const chapter = fixture(), valid = finished(chapter);
  const edits = [
    s => s.tactical.flags.push('fake'), s => s.tactical.resources.time++,
    s => s.tactical.units[0].x = 5, s => s.tactical.result.success = false,
    s => s.tactical.log[2].delta.time = 20, s => s.tactical.log[0].x = 5,
    s => s.clues.pop(), s => s.player.x = 9, s => s.tactical.commandsLeft = 2,
    s => s.phase = 'complete', s => s.revision = 1,
    s => s.tactical.log = s.tactical.log.filter(e => e.type !== 'event'),
    s => s.tacticalAttempts.push({ ...s.tactical, flags: ['fake'] })
  ];
  for (const edit of edits) {
    const forged = structuredClone(valid); edit(forged);
    assert.throws(() => Engine.validateState(forged, chapter), /無效 RPG 存檔/);
  }
  const copy = JSON.parse(JSON.stringify(valid));
  copy.tactical.resources = { load: copy.tactical.resources.load, supplies: copy.tactical.resources.supplies, time: copy.tactical.resources.time };
  assert.equal(Engine.validateState(copy, chapter), true, '欄位順序不影響合法匯入');
});

test('資源耗盡／負荷滿仍可等待，六指令後失敗、回顧與完成，不會卡住', () => {
  const chapter = fixture();
  chapter.scenario.resources = { time: 0, supplies: 0, load: 9 };
  chapter.scenario.paths[0].cost = {};
  chapter.scenario.events.forEach(event => event.delta = {});
  let state = ok(Engine.choosePath(planning(chapter), chapter, 'a'));
  assert.equal(Engine.execute(state, chapter, act(state, chapter, 'cadet')).ok, false);
  const command = { token: state.revision, unitId: 'cadet' };
  state = ok(Engine.wait(state, chapter, command));
  for (const invalid of [command, { token: state.revision, unitId: 'cadet' }, { token: state.revision, unitId: 'unknown' }]) {
    const result = Engine.wait(state, chapter, invalid);
    assert.equal(result.ok, false); assert.equal(result.state, state);
  }
  state = ok(Engine.wait(state, chapter, { token: state.revision, unitId: 'liaison' }));
  for (let round = 2; round <= 3; round++) for (const unitId of ['cadet','liaison']) {
    state = ok(Engine.wait(state, chapter, { token: state.revision, unitId }));
    assert.equal(Engine.validateState(state, chapter), true);
  }
  assert.equal(state.phase, 'outcome'); assert.equal(state.tactical.result.success, false);
  assert.equal(state.tactical.log.filter(entry => entry.actionId === 'wait').length, 6);
  assert.deepEqual(state.tactical.resources, { time: 0, supplies: 0, load: 9 });
  state = ok(Engine.interact(state, chapter, 'review'));
  state = ok(Engine.setReflection(state, chapter, { reason: '資源不足，等待求援', revision: '補給到達後修正' }));
  state = ok(Engine.complete(state, chapter));
  assert.equal(Engine.validateState(state, chapter), true);
});

// Walk real maps through the same transitions as the UI; no state is fabricated.
function walkNear(state, chapter, target) {
  const queue = [{ x: state.player.x, y: state.player.y, steps: [] }], seen = new Set();
  const blocked = (x, y) => x < 0 || x >= chapter.map.width || y < 0 || y >= chapter.map.height ||
    chapter.map.walls.some(w => x >= w.x && x < w.x+w.w && y >= w.y && y < w.y+w.h);
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i], key = tile.x + ',' + tile.y;
    if (seen.has(key) || blocked(tile.x,tile.y)) continue;
    seen.add(key);
    if (Math.abs(tile.x-target.x)+Math.abs(tile.y-target.y)<=1) {
      for (const [dx,dy] of tile.steps) state = ok(Engine.move(state,chapter,dx,dy));
      return state;
    }
    for (const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]) {
      queue.push({ x:tile.x+dx, y:tile.y+dy, steps:[...tile.steps,[dx,dy]] });
    }
  }
  assert.fail('探索標記不可達：'+chapter.id);
}
function realPlanning(chapter) {
  let state = ok(Engine.begin(Engine.createState(chapter),chapter));
  for (const clue of chapter.clues) {
    state = walkNear(state,chapter,clue);
    state = ok(Engine.interact(state,chapter,clue.id));
    assert.equal(Engine.validateState(state,chapter),true);
  }
  state = walkNear(state,chapter,chapter.sideQuest);
  state = ok(Engine.interact(state,chapter,'side'));
  state = walkNear(state,chapter,chapter.map.gate);
  state = ok(Engine.interact(state,chapter,'gate'));
  assert.equal(Engine.validateState(state,chapter),true);
  return state;
}
function solve(state, chapter, path, seen = new Set()) {
  if (state.phase === 'outcome') return state.tactical.result.success ? state : null;
  const missing = path.requiredFlags.filter(flag => !state.tactical.flags.includes(flag));
  const slots = (3-state.tactical.round)*2+state.tactical.commandsLeft;
  if (missing.length>slots) return null;
  const signature = JSON.stringify({ ...state.tactical, log: [], result: null });
  if (seen.has(signature)) return null;
  seen.add(signature);
  for (const action of chapter.scenario.actions.filter(a => missing.includes(a.flag))) {
    const target = chapter.scenario.targets.find(t => t.id === action.targetId);
    const tiles = Engine.reachable(state,chapter,action.unitId).filter(tile =>
      Math.abs(tile.x-target.x)+Math.abs(tile.y-target.y)<=1);
    for (const tile of tiles) {
      const result = Engine.execute(state,chapter,{ token:state.revision,unitId:action.unitId,actionId:action.id,x:tile.x,y:tile.y });
      if (!result.ok) continue;
      const solution = solve(result.state,chapter,path,seen);
      if (solution) return solution;
    }
  }
  for (const unit of state.tactical.units) {
    const result = Engine.wait(state,chapter,{token:state.revision,unitId:unit.id});
    if (!result.ok) continue;
    const solution = solve(result.state,chapter,path,seen);
    if (solution) return solution;
  }
  return null;
}
test('真實13章探索可達、26條方案六指令成功，以及26條全等待失敗均可完成', () => {
  const data = require('../js/data/rpg_chapters.js');
  assert.equal(data.chapters.length,13);
  let successful = 0, partial = 0;
  for (const chapter of data.chapters) {
    assert.equal(chapter.scenario.actions.some(action => action.id === 'wait'),false,'保留ID不可用於教材技能');
    const explored = realPlanning(chapter);
    for (const path of chapter.scenario.paths) {
      const start = ok(Engine.choosePath(explored,chapter,path.id));
      const solved = solve(start,chapter,path);
      assert.ok(solved,chapter.id+' '+path.id+' 在6指令內有成功方案');
      assert.equal(Engine.validateState(solved,chapter),true);
      assert.equal(solved.tactical.log.filter(entry => entry.type === 'action').length,6);
      successful++;
      let failed = start;
      for (let i=0;i<6;i++) failed = ok(Engine.wait(failed,chapter,{
        token:failed.revision,unitId:i%2===0?'cadet':'liaison'
      }));
      assert.equal(failed.tactical.result.success,false);
      for (let state of [solved,failed]) {
        state = ok(Engine.interact(state,chapter,'review'));
        state = ok(Engine.setReflection(state,chapter,{reason:'教材依據與取捨',revision:'新資訊與方案調整'}));
        state = ok(Engine.complete(state,chapter));
        assert.equal(Engine.validateState(state,chapter),true);
      }
      partial++;
    }
  }
  assert.equal(successful,26); assert.equal(partial,26);
});

module.exports = { fixture, planning, finished, act };
