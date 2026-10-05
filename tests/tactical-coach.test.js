'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const E = require('../js/tactical/tactical_engine.js');
const M = require('../js/tactical/tactical_missions.js');
const C = require('../js/tactical/tactical_coach.js');
const source = fs.readFileSync(require.resolve('../js/tactical/tactical_coach.js'), 'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const unit = (state, id) => state.units.find(u => u.id === id);
const ROUTE = [
  { type: 'move', unitId: 'scout', x: 5, y: 3 },
  { type: 'skill', unitId: 'scout', skillId: 'shot', targetId: 'enemy-2' },
  { type: 'move', unitId: 'medic', x: 4, y: 4 },
  { type: 'skill', unitId: 'medic', skillId: 'shot', targetId: 'enemy-2' },
  { type: 'move', unitId: 'guardian', x: 2, y: 1 },
  { type: 'skill', unitId: 'guardian', skillId: 'rescue', targetId: 'civilian-1' },
  { type: 'endTurn' },
  { type: 'move', unitId: 'guardian', x: 0, y: 2 },
  { type: 'skill', unitId: 'scout', skillId: 'rescue', targetId: 'civilian-2' },
  { type: 'move', unitId: 'scout', x: 1, y: 3 },
  { type: 'move', unitId: 'medic', x: 1, y: 4 },
  { type: 'endTurn' },
  { type: 'move', unitId: 'scout', x: 0, y: 3 },
  { type: 'move', unitId: 'medic', x: 0, y: 4 }
];
function apply(state, command) {
  const result = E.command(state, { ...command, revision: state.revision });
  assert.equal(result.ok, true, JSON.stringify(command) + ': ' + result.message);
  return result.state;
}
const run = (state, commands) => commands.reduce(apply, state);
function checkHint(state, expectedKind) {
  const before = JSON.stringify(state), hint = C.suggest(state);
  assert.equal(JSON.stringify(state), before, 'suggestion never changes input state or history');
  assert.deepEqual(Object.keys(hint).sort(), ['available', 'kind', 'title', 'reason', 'command', 'step', 'total', 'notice'].sort());
  assert.ok(['route', 'adaptive', 'complete', 'unsupported'].includes(hint.kind));
  if (expectedKind) assert.equal(hint.kind, expectedKind);
  assert.equal(typeof hint.title, 'string'); assert.ok(hint.title.length > 0);
  assert.equal(typeof hint.reason, 'string'); assert.ok(hint.reason.length > 0);
  assert.match(hint.notice, /可以略過/); assert.match(hint.notice, /倫理選擇不排名/); assert.match(hint.notice, /盤面更新/);
  assert.equal(hint.available, !!hint.command);
  if (hint.command) {
    assert.equal(hint.command.revision, state.revision);
    assert.equal(E.preview(state, hint.command).ok, true, 'suggested command previews legally');
    assert.equal(E.command(state, hint.command).ok, true, 'suggested command executes legally if user confirms');
    assert.ok(Object.isFrozen(hint.command));
  }
  assert.ok(Object.isFrozen(hint));
  return hint;
}

test('CommonJS and UMD exports agree without browser, DOM or storage', () => {
  const context = vm.createContext({ TacticalEngine: E, TacticalMissions: M });
  vm.runInContext(source, context);
  assert.deepEqual(copy(context.TacticalCoach.suggest(E.createState('u03'))), copy(C.suggest(E.createState('u03'))));
  assert.deepEqual(C.getOpening(E.createState('u03')), C.suggest(E.createState('u03')));
  assert.ok(Object.isFrozen(C));
  assert.doesNotMatch(source, /Math\.random\(|Date\.now\(|new Date\(|fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.|window\./);
});

for (const decision of M.getMission('u03').decisions) test('all 14 route steps finish safely for ' + decision.id, () => {
  let state = E.createState('u03', { decisionId: decision.id });
  for (let i = 0; i < ROUTE.length; i++) {
    const hint = checkHint(state, 'route');
    assert.equal(hint.step, i + 1); assert.equal(hint.total, 14);
    assert.deepEqual(hint.command, { ...ROUTE[i], revision: state.revision });
    assert.deepEqual(C.suggest(state), hint, 'same state gives deterministic advice');
    assert.deepEqual(C.suggest(copy(state)), hint, 'validated restored state has same advice');
    state = apply(state, hint.command);
  }
  const result = E.summary(state);
  assert.equal(result.status, 'won'); assert.equal(result.round, 3);
  assert.equal(result.metrics.rescued, 2); assert.equal(result.metrics.disabled, 1);
  assert.equal(result.metrics.damageTaken, 3); assert.equal(result.surviving, 3);
  assert.equal(result.canReflect, true);
  const complete = checkHint(state, 'complete');
  assert.equal(complete.available, false); assert.equal(complete.command, null);
  assert.equal(complete.step, null); assert.equal(complete.total, null);
});

test('undo recovers the semantic route step despite a different command history and revision', () => {
  let state = E.createState('u03');
  for (let i = 0; i < 6; i++) {
    const before = state;
    const after = apply(state, ROUTE[i]);
    const undone = apply(after, { type: 'undo' });
    assert.ok(undone.commandLog.length > before.commandLog.length);
    assert.equal(C.suggest(undone).step, i + 1);
    assert.equal(C.suggest(undone).command.revision, undone.revision);
    state = apply(undone, ROUTE[i]);
  }
  assert.equal(C.suggest(state).step, 7);
});

test('retry and pre-battle decision change preserve the route without relying on initial decision or attempt', () => {
  let state = apply(E.createState('u03'), { type: 'chooseDecision', decisionId: 'u03-decision-2' });
  assert.equal(state.initialDecisionId, 'u03-decision-1');
  assert.equal(C.suggest(state).step, 1);
  state = run(state, ROUTE.slice(0, 9));
  state = apply(state, { type: 'retry' });
  assert.equal(state.attempt, 2); assert.equal(state.metrics.retries, 1);
  assert.equal(state.decisionId, 'u03-decision-2');
  assert.equal(C.suggest(state).kind, 'route'); assert.equal(C.suggest(state).step, 1);
  for (let i = 0; i < ROUTE.length; i++) { assert.equal(C.suggest(state).step, i + 1); state = apply(state, C.suggest(state).command); }
  assert.equal(state.status, 'won');
});

test('equivalent independent action order re-enters the route by semantic state', () => {
  const alternate = run(E.createState('u03'), [ROUTE[2], ROUTE[0], ROUTE[3], ROUTE[1]]);
  assert.notDeepEqual(alternate.commandLog.map(c => c.unitId), ['scout', 'scout', 'medic', 'medic']);
  const hint = checkHint(alternate, 'route');
  assert.equal(hint.step, 5); assert.deepEqual(hint.command, { ...ROUTE[4], revision: 4 });
});

test('legal differences in action flags, energy, HP, smoke or round do not masquerade as the scripted route', () => {
  const start = E.createState('u03');
  const states = [
    apply(start, { type: 'skill', unitId: 'guardian', skillId: 'guard' }),
    apply(start, { type: 'skill', unitId: 'scout', skillId: 'smoke', x: 3, y: 3 }),
    apply(start, { type: 'endTurn' }),
    run(start, [ROUTE[0], { type: 'endTurn' }])
  ];
  for (const state of states) { const hint = checkHint(state, 'adaptive'); assert.equal(hint.step, null); assert.equal(hint.total, null); }
  assert.ok(unit(states[3], 'scout').hp < unit(start, 'scout').hp);
});

test('deviating guardian gets an adjacent rescue rather than a restart instruction', () => {
  const state = apply(E.createState('u03'), ROUTE[4]);
  const hint = checkHint(state, 'adaptive');
  assert.deepEqual(hint.command, { ...ROUTE[5], revision: state.revision });
  assert.doesNotMatch(hint.title + hint.reason, /重新開始|重來|必須|唯一/);
});

test('a carrying teammate is guided to a reachable unoccupied exit', () => {
  const state = run(E.createState('u03'), [ROUTE[4], ROUTE[5], { type: 'endTurn' }]);
  const hint = checkHint(state, 'adaptive');
  assert.equal(hint.command.type, 'move'); assert.equal(hint.command.unitId, 'guardian');
  assert.equal(E.tileAt(state, hint.command.x, hint.command.y).type, 'exit');
  const next = apply(state, hint.command);
  assert.equal(next.metrics.rescued, 1); assert.equal(unit(next, 'guardian').carrying, null);
});

test('critical HP can receive legal, in-range medic support after a deviation', () => {
  const state = run(E.createState('u03'), [ROUTE[0], { type: 'endTurn' }, { type: 'wait', unitId: 'scout' }, ROUTE[2]]);
  assert.equal(unit(state, 'scout').hp, 6);
  const hint = checkHint(state, 'adaptive');
  assert.equal(hint.command.type, 'skill'); assert.equal(hint.command.unitId, 'medic');
  assert.equal(hint.command.skillId, 'heal'); assert.equal(hint.command.targetId, 'scout');
});

test('a new approach uses a real traversable path and gets closer to a rescue', () => {
  const state = apply(E.createState('u03'), { type: 'skill', unitId: 'medic', skillId: 'guard' });
  const hint = checkHint(state, 'adaptive');
  assert.equal(hint.command.type, 'move');
  const path = E.reachable(state, hint.command.unitId).find(p => p.x === hint.command.x && p.y === hint.command.y);
  assert.ok(path); assert.ok(path.cost > 0);
  const actor = unit(state, hint.command.unitId);
  assert.ok(state.civilians.some(c => Math.abs(c.x - hint.command.x) + Math.abs(c.y - hint.command.y) < Math.abs(c.x - actor.x) + Math.abs(c.y - actor.y)));
});

test('all actions spent yields an explicit endTurn; last round warns about the result', () => {
  let state = run(E.createState('u03'), ['guardian', 'scout', 'medic'].map(unitId => ({ type: 'wait', unitId })));
  let hint = checkHint(state, 'adaptive');
  assert.deepEqual(hint.command, { type: 'endTurn', revision: state.revision });
  while (state.round < state.turnLimit && state.status === 'active') state = apply(state, { type: 'endTurn' });
  assert.equal(state.status, 'active');
  for (const actor of state.units.filter(u => u.team === 'player' && u.hp > 0)) state = apply(state, { type: 'wait', unitId: actor.id });
  hint = checkHint(state, 'adaptive');
  assert.equal(hint.command.type, 'endTurn'); assert.match(hint.reason, /最後一回合/); assert.match(hint.reason, /判定/);
});

test('lost and won are terminal and do not ask the learner to retry to unlock reflection', () => {
  let lost = E.createState('u03');
  while (lost.status === 'active') lost = apply(lost, { type: 'endTurn' });
  assert.equal(lost.status, 'lost');
  const hint = checkHint(lost, 'complete');
  assert.equal(hint.available, false); assert.equal(hint.command, null);
  assert.match(hint.reason, /戰術勝敗都能完成反思/);
  assert.doesNotMatch(hint.reason, /必須重試|重試才能/);
});

test('stale recommendation is rejected by the engine and refreshed recommendation has the current revision', () => {
  const start = E.createState('u03'), oldHint = C.suggest(start);
  const next = apply(start, { type: 'skill', unitId: 'guardian', skillId: 'guard' });
  const result = E.command(next, oldHint.command);
  assert.equal(result.ok, false); assert.match(result.message, /畫面已更新/); assert.equal(result.state, next);
  const refreshed = checkHint(next, 'adaptive');
  assert.equal(refreshed.command.revision, 1);
});

test('malformed, out-of-bounds, forged and polluted input returns no command without throwing', () => {
  const start = copy(E.createState('u03'));
  const variants = [null, undefined, 3, 'u03', [], {}, { missionId: 'missing' }, { missionId: '__proto__' }];
  const changed = mutate => { const state = copy(start); mutate(state); variants.push(state); };
  changed(s => { s.units[0].x = -1; }); changed(s => { s.units[0].y = 999; });
  changed(s => { s.units[0].hp = 999; }); changed(s => { s.units[0].energy++; });
  changed(s => { s.units[0].name = '<img src=x onerror=alert(1)>'; });
  changed(s => { s.civilians[0].status = 'evacuated'; });
  changed(s => { s.decisionId = 'u03-decision-2'; });
  changed(s => { s.revision = -1; }); changed(s => { s.revision = Infinity; });
  changed(s => { s.phase = 'enemy'; }); changed(s => { s.status = 'won'; });
  changed(s => { s.commandLog = new Array(E.MAX_COMMANDS + 1); });
  changed(s => { s.units = new Array(10000); });
  changed(s => { s.undoStack = new Array(7); });
  changed(s => { s.units[0].statuses.loop = s; });
  variants.push(JSON.parse(JSON.stringify(start).replace('"version":2', '"version":2,"__proto__":{"polluted":true}')));
  const throwing = {}; Object.defineProperty(throwing, 'missionId', { get() { throw new Error('bad field'); } }); variants.push(throwing);
  for (const value of variants) {
    let hint; assert.doesNotThrow(() => { hint = C.suggest(value); });
    assert.equal(hint.available, false); assert.equal(hint.command, null); assert.equal(hint.kind, 'unsupported');
    assert.doesNotMatch(hint.title + hint.reason, /onerror|polluted/);
  }
  assert.equal({}.polluted, undefined);
});

test('other chapters are unsupported with useful text and no move command', () => {
  for (const mission of M.missions.filter(m => m.id !== 'u03')) {
    const hint = checkHint(E.createState(mission.id), 'unsupported');
    assert.equal(hint.available, false); assert.equal(hint.command, null); assert.match(hint.reason, /任務目標/);
  }
});

test('suggestions are deeply immutable and do not share a mutable route template', () => {
  const state = E.createState('u03'), before = JSON.stringify(state), hint = C.suggest(state);
  assert.throws(() => { hint.command.x = 99; }, TypeError);
  assert.throws(() => { hint.reason = 'changed'; }, TypeError);
  assert.equal(C.suggest(state).command.x, 5); assert.equal(JSON.stringify(state), before);
});

test('many legal deviations continue to produce legal, bounded suggestions through terminal outcomes', () => {
  const initial = E.createState('u03');
  const deviations = [{ type: 'endTurn' }];
  for (const actor of initial.units.filter(u => u.team === 'player')) {
    deviations.push({ type: 'wait', unitId: actor.id }, { type: 'skill', unitId: actor.id, skillId: 'guard' });
    const nodes = E.reachable(initial, actor.id);
    for (const node of nodes.filter((_, i) => i % 7 === 0)) deviations.push({ type: 'move', unitId: actor.id, x: node.x, y: node.y });
  }
  let checked = 0;
  for (const decision of M.getMission('u03').decisions) for (const deviation of deviations) {
    let state = apply(E.createState('u03', { decisionId: decision.id }), deviation);
    for (let i = 0; state.status === 'active' && i < 36; i++) {
      const hint = C.suggest(state); assert.equal(hint.available, true, JSON.stringify(hint));
      assert.equal(hint.command.revision, state.revision);
      state = apply(state, hint.command); checked++;
    }
    assert.notEqual(state.status, 'active', 'suggested actions do not loop indefinitely');
    assert.equal(C.suggest(state).kind, 'complete');
  }
  assert.ok(checked > 100);
});

test('route warming is at most 14 private simulations; adaptive advice never simulates user commands', () => {
  const counts = { command: 0, intents: 0, reachable: 0 };
  const observed = { ...E,
    command(...args) { counts.command++; return E.command(...args); },
    enemyIntents(...args) { counts.intents++; return E.enemyIntents(...args); },
    reachable(...args) { counts.reachable++; return E.reachable(...args); }
  };
  const context = vm.createContext({ TacticalEngine: observed, TacticalMissions: M }); vm.runInContext(source, context);
  const state = E.createState('u03'); context.TacticalCoach.suggest(state);
  assert.equal(counts.command, 14); assert.equal(counts.intents, 0);
  context.TacticalCoach.suggest(state); assert.equal(counts.command, 14);
  const deviated = apply(state, { type: 'skill', unitId: 'medic', skillId: 'guard' });
  context.TacticalCoach.suggest(deviated);
  assert.equal(counts.command, 14, 'adaptive never executes a command even on a copy of caller state');
  assert.equal(counts.intents, 1); assert.ok(counts.reachable <= 6);
});

test('normal first-battle suggestions stay within a small interactive CPU budget', () => {
  const state = apply(E.createState('u03'), { type: 'skill', unitId: 'medic', skillId: 'guard' });
  C.suggest(state);
  const start = performance.now();
  for (let i = 0; i < 100; i++) C.suggest(state);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 2000, '100 adaptive hints took ' + Math.round(elapsed) + 'ms');
});

test('an exhausted engine command budget never offers an unexecutable endTurn', () => {
  let state = E.createState('u03');
  for (let i = 0; i < E.MAX_COMMANDS / 2; i++) {
    state = apply(state, { type: 'move', unitId: 'guardian', x: 2, y: 2 });
    state = apply(state, { type: 'undo' });
  }
  assert.equal(state.commandLog.length, E.MAX_COMMANDS);
  const hint = C.suggest(state);
  assert.equal(hint.available, false); assert.equal(hint.command, null); assert.match(hint.reason, /章節頁/);
});
