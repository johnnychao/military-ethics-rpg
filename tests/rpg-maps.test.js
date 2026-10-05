'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Maps = require('../js/data/rpg_maps.js');
const { chapters: originals } = require('../js/data/rpg_chapters.js');
const Engine = require('../js/engine/rpg_engine.js');
const Store = require('../js/engine/rpg_store.js');
const chapters = originals.map(Maps.apply);
const clone = value => JSON.parse(JSON.stringify(value));
const key = p => `${p.x},${p.y}`;
const steps = [[0, -1], [-1, 0], [1, 0], [0, 1]];
// Frozen pre-redesign collision geometry: do not replace with the new maps.
const legacyMap = {
  width: 16, height: 20, spawn: { x: 8, y: 17 }, gate: { x: 8, y: 3 },
  walls: [{ x: 1, y: 2, w: 3, h: 2, type: 'building' },
    { x: 11, y: 3, w: 3, h: 3, type: 'building' },
    { x: 1, y: 9, w: 2, h: 3, type: 'trees' },
    { x: 12, y: 8, w: 2, h: 2, type: 'crates' }]
};
function blocked(map, x, y) {
  return !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height ||
    map.walls.some(w => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);
}
function flood(map, start = map.spawn) {
  const seen = new Set(), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (seen.has(key(p)) || blocked(map, p.x, p.y)) continue;
    seen.add(key(p));
    for (const [dx, dy] of steps) queue.push({ x: p.x + dx, y: p.y + dy });
  }
  return seen;
}
function cells(map) {
  return [...Array(map.height)].map((_, y) => [...Array(map.width)].map((_, x) => blocked(map, x, y) ? '#' : '.').join('')).join('\n');
}
function floorCells(map) {
  const found = new Set();
  for (const route of map.paths) for (let i = 1; i < route.points.length; i++) {
    let { x, y } = route.points[i - 1];
    const end = route.points[i], dx = Math.sign(end.x - x), dy = Math.sign(end.y - y);
    assert.ok(!dx || !dy, 'Path segments must be axis aligned: ' + route.id);
    for (;;) {
      assert.ok(!blocked(map, x, y), 'A painted route runs into a wall: ' + route.id + ' at ' + x + ',' + y);
      found.add(`${x},${y}`);
      if (x === end.x && y === end.y) break;
      x += dx; y += dy;
    }
  }
  return [...found].sort().join(';');
}
function ok(result) { assert.equal(result.ok, true, result.message); return result.state; }
function walkTo(state, chapter, target) {
  const queue = [{ p: state.player, moves: [] }], seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const { p, moves } = queue[i];
    if (seen.has(key(p)) || blocked(chapter.map, p.x, p.y)) continue;
    seen.add(key(p));
    if (p.x === target.x && p.y === target.y) {
      for (const [dx, dy] of moves) state = ok(Engine.move(state, chapter, dx, dy));
      return state;
    }
    for (const [dx, dy] of steps) queue.push({ p: { x: p.x + dx, y: p.y + dy }, moves: [...moves, [dx, dy]] });
  }
  assert.fail('Unreachable tile ' + key(target));
}
function runPhases(chapter, pathIndex = 0) {
  let state = Engine.createState(chapter);
  const snapshots = [clone(state)];
  state = ok(Engine.begin(state, chapter)); snapshots.push(clone(state));
  for (const clue of chapter.clues) {
    state = walkTo(state, chapter, clue);
    state = ok(Engine.interact(state, chapter, clue.id)); snapshots.push(clone(state));
  }
  state = walkTo(state, chapter, chapter.sideQuest);
  state = ok(Engine.interact(state, chapter, 'side')); snapshots.push(clone(state));
  state = walkTo(state, chapter, chapter.map.gate);
  state = ok(Engine.interact(state, chapter, 'gate')); snapshots.push(clone(state));
  state = ok(Engine.choosePath(state, chapter, chapter.scenario.paths[pathIndex].id)); snapshots.push(clone(state));
  const waitRound = () => {
    for (const unitId of ['cadet', 'liaison']) state = ok(Engine.wait(state, chapter, { token: state.revision, unitId }));
  };
  for (let round = 0; round < 3; round++) { waitRound(); snapshots.push(clone(state)); }
  state = ok(Engine.retry(state, chapter)); snapshots.push(clone(state));
  for (let round = 0; round < 3; round++) waitRound();
  state = ok(Engine.interact(state, chapter, 'review')); snapshots.push(clone(state));
  state = ok(Engine.setReflection(state, chapter, { reason: '虛構測試：據實保留未完成事項。', revision: '虛構測試：新資訊到達時重新核對。' })); snapshots.push(clone(state));
  state = ok(Engine.complete(state, chapter)); snapshots.push(clone(state));
  return { state, snapshots };
}
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('13 maps export identically in browser and Node, with independent return values', () => {
  assert.deepEqual(Maps.ids, originals.map(c => c.id));
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/data/rpg_maps.js'), 'utf8'), browser);
  for (const id of Maps.ids) assert.equal(JSON.stringify(browser.RPGMaps.get(id)), JSON.stringify(Maps.get(id)));
  const first = Maps.get('u01'); first.map.walls.length = 0; first.map.paths[0].points[0].x = 900;
  assert.notEqual(Maps.get('u01').map.walls.length, 0);
  assert.notEqual(Maps.get('u01').map.paths[0].points[0].x, 900);
  assert.throws(() => Maps.get('u99')); assert.throws(() => Maps.apply({ id: 'u01' }));
});

test('every chapter has unique actual wall cells, route geometry, POI positions and scene composition', () => {
  assert.equal(new Set(chapters.map(c => cells(c.map))).size, 13, 'Collision geometry must differ, not just obstacle labels');
  assert.equal(new Set(chapters.map(c => floorCells(c.map))).size, 13, 'Rendered paths must differ, not just path IDs');
  assert.equal(new Set(chapters.map(c => JSON.stringify([...c.clues, c.sideQuest].map(({ x, y }) => [x, y])))).size, 13);
  assert.equal(new Set(chapters.map(c => JSON.stringify(c.map.zones.map(({ x, y, w, h }) => [x, y, w, h])))).size, 13);
  assert.equal(new Set(chapters.map(c => c.map.theme.id)).size, 13);
});

for (const chapter of chapters) {
  const original = originals.find(c => c.id === chapter.id);
  test(chapter.id + ': coherent 16×20 geography, all main/bonus POI reachable and collision-safe', () => {
    const map = chapter.map, reached = flood(map);
    assert.equal(map.width, 16); assert.equal(map.height, 20);
    assert.deepEqual(map.spawn, legacyMap.spawn); assert.deepEqual(map.gate, legacyMap.gate);
    assert.equal(map.layoutVersion, 1); assert.ok(map.summary.length > 15);
    for (const w of map.walls) {
      assert.ok([w.x, w.y, w.w, w.h].every(Number.isInteger));
      assert.ok(w.w > 0 && w.h > 0 && w.x >= 0 && w.y >= 0 && w.x + w.w <= 16 && w.y + w.h <= 20);
    }
    const bonus = Object.values(map.bonusSpots);
    assert.deepEqual(Object.keys(map.bonusSpots).sort(), ['egg', 'errand', 'order', 'puzzle']);
    const poi = [...chapter.clues, chapter.sideQuest, map.gate, map.spawn, ...bonus];
    assert.equal(new Set(poi.map(key)).size, poi.length, 'POIs must not share tiles');
    for (const p of poi) assert.ok(reached.has(key(p)), 'Unreachable POI ' + key(p));
    for (const p of map.decor) {
      assert.equal(p.walkable, true);
      assert.ok(['seal', 'inlay', 'petals', 'signal', 'stripe', 'arrow', 'grid', 'step'].includes(p.kind));
      assert.ok(reached.has(key(p)), 'Unreachable floor ornament ' + key(p));
    }
    for (const z of map.zones) {
      assert.equal(z.walkable, true);
      assert.ok([z.x, z.y, z.w, z.h].every(Number.isInteger));
      assert.ok(z.x >= 0 && z.y >= 0 && z.w > 0 && z.h > 0 && z.x + z.w <= 16 && z.y + z.h <= 20);
      for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
        assert.ok(reached.has(x + ',' + y), 'A walkable floor zone overlaps collision: ' + z.label);
      }
    }
    for (const p of map.paths) {
      assert.ok(p.width >= 1 && p.width <= 3 && p.points.length >= 2);
      assert.ok(['stone', 'slate', 'paving', 'track', 'concrete', 'tile', 'terracotta', 'gravel'].includes(p.kind));
    }
    floorCells(map);
    // Every old open cell survives; every newly blocked cell was already blocked.
    for (let y = 0; y < 20; y++) for (let x = 0; x < 16; x++) {
      if (!blocked(legacyMap, x, y)) assert.ok(!blocked(map, x, y), 'Old save position blocked at ' + x + ',' + y);
      if (blocked(map, x, y)) assert.ok(blocked(legacyMap, x, y), 'Introduced a new wall');
      if (!blocked(map, x, y)) assert.ok(reached.has(x + ',' + y), 'Disconnected open tile');
    }
  });
  test(chapter.id + ': apply preserves all educational text, IDs, tactical rules and original definitions', () => {
    const before = JSON.stringify(original), applied = Maps.apply(original);
    const stripCoordinates = ({ x, y, ...rest }) => rest;
    assert.deepEqual(applied.clues.map(stripCoordinates), original.clues.map(stripCoordinates));
    assert.deepEqual(stripCoordinates(applied.sideQuest), stripCoordinates(original.sideQuest));
    assert.deepEqual(applied.scenario, original.scenario);
    for (const k of Object.keys(original).filter(k => !['map', 'clues', 'sideQuest'].includes(k))) assert.deepEqual(applied[k], original[k]);
    applied.scenario.actions[0].label = 'mutated'; applied.concepts[0].text = 'mutated';
    assert.equal(JSON.stringify(original), before, 'apply must return a true clone');
    assert.deepEqual(original.map, legacyMap, 'Original collector data must stay frozen');
  });
  test(chapter.id + ': all 295 real legacy exploration positions validate without any migration', () => {
    let state = ok(Engine.begin(Engine.createState(original), original));
    const queue = [state], seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      state = queue[i];
      if (seen.has(key(state.player))) continue;
      seen.add(key(state.player));
      assert.equal(Engine.validateState(state, original), true);
      assert.equal(Engine.validateState(state, chapter), true);
      for (const [dx, dy] of steps) {
        const next = Engine.move(state, original, dx, dy);
        if (next.ok && !seen.has(key(next.state.player))) queue.push(next.state);
      }
    }
    assert.equal(seen.size, 295);
  });
  test(chapter.id + ': all legacy phases, clue records, retries and reflections validate unchanged', () => {
    for (const pathIndex of [0, 1]) {
      const { snapshots } = runPhases(original, pathIndex);
      for (const state of snapshots) assert.equal(Engine.validateState(state, chapter), true);
      assert.deepEqual([...new Set(snapshots.map(s => s.phase))].sort(), ['briefing', 'complete', 'exploration', 'outcome', 'planning', 'review', 'tactics']);
    }
  });
  test(chapter.id + ': redesigned maps play end-to-end and completed records pass unchanged original collector validation', () => {
    for (const pathIndex of [0, 1]) {
      const { state, snapshots } = runPhases(chapter, pathIndex);
      snapshots.forEach(s => assert.equal(Engine.validateState(s, chapter), true));
      assert.equal(state.phase, 'complete'); assert.equal(state.sideDone, true);
      assert.equal(state.tacticalAttempts.length, 1);
      assert.equal(Engine.validateState(state, original), true, 'Original collector must accept every completed new-map record');
    }
  });
}

test('u03 retains original layout, clue positions and side quest coordinates exactly', () => {
  const source = originals[2], chapter = chapters[2];
  for (const key of Object.keys(legacyMap)) assert.deepEqual(chapter.map[key], source.map[key]);
  assert.deepEqual(chapter.clues, source.clues); assert.deepEqual(chapter.sideQuest, source.sideQuest);
});

test('load/import retain original save records, completed history, current exploration, draft reflections and settings', () => {
  const sourceDisk = storage(), source = new Store({ storage: sourceDisk, chapters: originals });
  source.newProfile('虛構相容測試'); source.setSettings({ musicEnabled: false, musicVolume: 0.43, reducedMotion: true });
  for (const chapter of originals) {
    source.startChapter(chapter.id);
    source.updateState(runPhases(chapter).state);
    source.startChapter(chapter.id, true);
    let state = ok(Engine.begin(source.getCurrent(), chapter));
    state = walkTo(state, chapter, chapter.clues[0]);
    state = ok(Engine.interact(state, chapter, chapter.clues[0].id));
    source.updateState(state);
  }
  source.startChapter('u03');
  source.updateState(runPhases(originals[2]).snapshots.findLast(s => s.phase === 'review'));
  const before = source.exportJSON(), records = clone(source.save.records);
  const newDisk = storage({ [Store.KEY]: before }), loaded = new Store({ storage: newDisk, chapters });
  assert.ok(loaded.load());
  assert.equal(loaded.exportJSON(), before, 'Load must not rewrite or migrate any record');
  assert.equal(newDisk.getItem(Store.KEY), before); assert.deepEqual(loaded.save.records, records);
  assert.equal(loaded.completedCount(), 13); assert.deepEqual(loaded.save.settings, source.save.settings);
  const imported = new Store({ storage: storage(), chapters }); imported.importJSON(before);
  assert.deepEqual(imported.save.records, records); assert.deepEqual(imported.save.settings, source.save.settings);
  assert.equal(imported.completedCount(), 13);
});

test('map compatibility never relaxes tamper, collision, phase, tactical replay or import validation', () => {
  const chapter = chapters[0], valid = runPhases(chapter).state;
  const attacks = [s => { s.player.x = -1; }, s => { s.player.x = 1; s.player.y = 2; },
    s => { s.player.x = 6; s.player.y = 17; }, s => { s.clues.pop(); }, s => { s.clues.push('u99-clue-1'); },
    s => { s.tactical.resources.time++; }, s => { s.tactical.flags.push('forged'); },
    s => { s.tactical.result.success = true; }, s => { s.tacticalAttempts[0].resources.load++; },
    s => { s.reflection.reason = ''; }, s => { s.completedAt = null; }, s => { s.revision = 0; },
    s => { s.map = { walls: [] }; }];
  for (const attack of attacks) {
    const bad = clone(valid); attack(bad);
    assert.throws(() => Engine.validateState(bad, chapter), /無效 RPG 存檔/);
  }
  const disk = storage(), store = new Store({ storage: disk, chapters }); store.newProfile('虛構反竄改測試');
  store.updateState(valid);
  const before = store.exportJSON(), diskBefore = disk.getItem(Store.KEY);
  for (const attack of attacks) {
    const bad = JSON.parse(before); attack(bad.records.u01.current);
    assert.throws(() => store.importJSON(JSON.stringify(bad)));
    assert.equal(store.exportJSON(), before); assert.equal(disk.getItem(Store.KEY), diskBefore);
  }
});

test('receipt candidates remain available beside exploration on newly opened map tiles',()=>{
  const Client=require('../js/receipt_client');
  const disk=storage(),store=new Store({storage:disk,chapters});store.newProfile('虛構跨章收件測試');
  store.startChapter('u03');store.updateState(runPhases(chapters[2]).state);
  const other=chapters[12];store.startChapter(other.id);
  let exploring=ok(Engine.begin(store.getCurrent(),other));exploring=walkTo(exploring,other,{x:2,y:2});store.updateState(exploring);
  const raw=store.exportJSON();assert.throws(()=>Client.readCandidates(raw,'u03',originals),/探索位置不可達/);
  const candidates=Client.readCandidates(raw,'u03',chapters);assert.equal(candidates.length,1);
  assert.equal(Client.validateComplete(candidates[0].attempt,originals[2]).phase,'complete');
  const source=fs.readFileSync(path.join(__dirname,'../js/receipt_client.js'),'utf8');
  assert.match(source,/mount\(root\.document, root\.ClassroomConfig, root\.RPGMaps \? root\.RPGData\.chapters\.map\(root\.RPGMaps\.apply\) : root\.RPGData\.chapters, root\)/);
});
