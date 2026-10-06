(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPGEngine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PARTY = [
    { id: 'cadet', x: 1, y: 6 }, { id: 'liaison', x: 2, y: 6 },
    { id: 'logistics', x: 3, y: 6 }, { id: 'doctor', x: 4, y: 6 }
  ];
  const PHASES = ['briefing', 'exploration', 'planning', 'tactics', 'outcome', 'review', 'complete'];
  const RESOURCES = ['time', 'supplies', 'load'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
  const integer = value => Number.isInteger(value);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const fail = (state, message) => ({ ok: false, state, message });
  function pass(previous, state, message, event) {
    state.revision = previous.revision + 1;
    return Object.assign({ ok: true, state, message }, event ? { event } : {});
  }
  function blocked(chapter, x, y) {
    return !integer(x) || !integer(y) || x < 0 || y < 0 || x >= chapter.map.width || y >= chapter.map.height ||
      chapter.map.walls.some(w => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);
  }
  function flood(chapter) {
    const queue = [chapter.map.spawn], found = new Set();
    for (let i = 0; i < queue.length; i++) {
      const tile = queue[i], key = tile.x + ',' + tile.y;
      if (found.has(key) || blocked(chapter, tile.x, tile.y)) continue;
      found.add(key);
      for (const [dx, dy] of [[0,-1],[-1,0],[1,0],[0,1]]) queue.push({ x: tile.x + dx, y: tile.y + dy });
    }
    return found;
  }
  function pathFor(state, chapter) { return chapter.scenario.paths.find(p => p.id === state.pathId); }
  function resourcesAfter(resources, cost) {
    const next = {};
    for (const key of RESOURCES) {
      const value = cost[key] || 0;
      if (!Number.isFinite(value) || (key !== 'load' && value < 0)) return null;
      next[key] = key === 'load' ? Math.max(0, resources[key] + value) : resources[key] - value;
      if (next[key] < 0 || next[key] > (key === 'load' ? 9 : 20)) return null;
    }
    return next;
  }
  function createState(chapter) {
    return {
      chapterId: chapter.id, phase: 'briefing', revision: 0,
      player: { x: chapter.map.spawn.x, y: chapter.map.spawn.y, facing: 'up' },
      clues: [], sideDone: false, pathId: null, tactical: null, tacticalAttempts: [],
      reflection: { reason: '', revision: '' }, completedAt: null
    };
  }
  function begin(state, chapter) {
    if (state.chapterId !== chapter.id || state.phase !== 'briefing') return fail(state, '請從任務簡報開始。');
    const next = clone(state); next.phase = 'exploration';
    return pass(state, next, '探索地圖，靠近標記後交談或查閱線索。');
  }
  function move(state, chapter, dx, dy) {
    if (state.chapterId !== chapter.id) return fail(state, '章節不相符，請重新選擇章節。');
    if (state.phase !== 'exploration') return fail(state, '目前不在探索階段。');
    if (!integer(dx) || !integer(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return fail(state, '每次只能往上下左右移動一格。');
    const x = state.player.x + dx, y = state.player.y + dy;
    if (blocked(chapter, x, y)) return fail(state, '這裡無法通行。');
    const next = clone(state);
    next.player = { x, y, facing: dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down' };
    return pass(state, next, '已移動。');
  }
  function interact(state, chapter, id) {
    if (state.chapterId !== chapter.id) return fail(state, '章節不相符，請重新選擇章節。');
    if (id === 'review' && state.phase === 'outcome') {
      const next = clone(state); next.phase = 'review';
      return pass(state, next, '記錄你的理由，以及哪些新資訊會讓你修正。');
    }
    if (state.phase !== 'exploration') return fail(state, '請先回到探索階段。');
    const target = id === 'gate' ? chapter.map.gate : id === 'side' ? chapter.sideQuest : chapter.clues.find(c => c.id === id);
    if (!target || !integer(target.x) || !integer(target.y)) return fail(state, '找不到這個互動對象。');
    if (!near(state.player, target)) return fail(state, '先靠近標記，才能交談或查閱。');
    const next = clone(state);
    if (id === 'gate') {
      if (!chapter.clues.every(c => state.clues.includes(c.id))) return fail(state, '請先取得三份必需線索，再開始策略挑戰。');
      next.phase = 'planning';
    } else if (id === 'side') {
      if (state.sideDone) return fail(state, '這段支線已完成。');
      next.sideDone = true;
    } else {
      if (state.clues.includes(id)) return fail(state, '這份線索已記錄，可在任務紀錄再次閱讀。');
      next.clues.push(id);
    }
    return pass(state, next, id === 'gate' ? '選擇一個願意承擔代價的方案。' : target.text,
      { type: id === 'gate' ? 'planning' : 'clue', id, text: target.text || chapter.objective });
  }
  function initialTactical(chapter, path) {
    const resources = resourcesAfter(chapter.scenario.resources, path.cost || {});
    if (!resources) return null;
    return { round: 1, commandsLeft: 2, used: [], units: clone(PARTY), resources, flags: [], log: [], result: null };
  }
  function choosePath(state, chapter, pathId) {
    if (state.chapterId !== chapter.id) return fail(state, '章節不相符，請重新選擇章節。');
    if (state.phase !== 'planning') return fail(state, '目前不能選擇策略方案。');
    const path = chapter.scenario.paths.find(p => p.id === pathId);
    if (!path) return fail(state, '找不到這個方案。');
    const tactical = initialTactical(chapter, path);
    if (!tactical) return fail(state, '這個方案需要的資源超過目前可用資源。');
    const next = clone(state); next.pathId = path.id; next.tactical = tactical; next.phase = 'tactics';
    return pass(state, next, '第一回合開始。每回合可指揮兩名不同隊員。');
  }
  function reachable(state, chapter, unitId) {
    if (state.chapterId !== chapter.id || state.phase !== 'tactics' || !state.tactical) return [];
    const unit = state.tactical.units.find(u => u.id === unitId);
    if (!unit || state.tactical.used.includes(unitId)) return [];
    const occupied = new Set(state.tactical.units.filter(u => u.id !== unitId).map(u => u.x + ',' + u.y));
    const queue = [{ x: unit.x, y: unit.y, distance: 0 }], found = new Set(), result = [];
    for (let i = 0; i < queue.length; i++) {
      const tile = queue[i], key = tile.x + ',' + tile.y;
      if (tile.x < 0 || tile.x >= 6 || tile.y < 0 || tile.y >= 8 || found.has(key) || occupied.has(key)) continue;
      found.add(key); result.push(tile);
      if (tile.distance < 3) {
        for (const [dx, dy] of [[0,-1],[-1,0],[1,0],[0,1]]) queue.push({ x: tile.x + dx, y: tile.y + dy, distance: tile.distance + 1 });
      }
    }
    return result;
  }
  function preview(state, chapter, command) {
    const bad = message => ({ ok: false, message, cost: null, action: null, distance: null });
    if (state.chapterId !== chapter.id) return bad('章節不相符，請重新選擇章節。');
    if (state.phase !== 'tactics' || !state.tactical) return bad('目前不在策略挑戰。');
    if (!command || command.token !== state.revision) return bad('這個指令已過期，請重新選擇。');
    const tactical = state.tactical;
    if (tactical.round > 3 || tactical.commandsLeft < 1) return bad('本次挑戰已結束。');
    if (tactical.used.includes(command.unitId)) return bad('這位隊員本回合已行動，請選擇其他隊員。');
    if (command.actionId === 'wait') {
      const unit = tactical.units.find(u => u.id === command.unitId);
      if (!unit || command.x !== unit.x || command.y !== unit.y) return bad('等待指令需由隊員留在原地。');
      return { ok: true, message: '保留資源，等待下一次回報。', cost: { time: 0, supplies: 0, load: 0 },
        action: { id: 'wait', unitId: unit.id, flag: null, feedback: '隊員原地等待，保留資源。' }, distance: 0 };
    }
    const action = chapter.scenario.actions.find(a => a.id === command.actionId && a.unitId === command.unitId);
    if (!action) return bad('這位隊員不能使用這個技能。');
    const tile = reachable(state, chapter, command.unitId).find(t => t.x === command.x && t.y === command.y);
    if (!tile) return bad('目的地需在三格步行內，且不能穿過其他隊員。');
    const target = chapter.scenario.targets.find(t => t.id === action.targetId);
    if (!target || !near(tile, target)) return bad('需移動到技能對象旁邊一格內。');
    const cost = Object.fromEntries(RESOURCES.map(key => [key, action.cost[key] || 0]));
    if (!resourcesAfter(tactical.resources, cost)) return bad('時間或物資不足，或隊員負荷將超過 9。');
    return { ok: true, message: action.preview, cost, action: clone(action), distance: tile.distance };
  }
  function outcome(state, chapter) {
    const path = pathFor(state, chapter);
    if (state.chapterId !== chapter.id || !path || !state.tactical || state.tactical.round !== 3 || state.tactical.commandsLeft !== 0) {
      return { success: false, title: '尚未完成挑戰', text: '先選擇方案並完成三回合。', missing: [] };
    }
    const missing = path.requiredFlags.filter(flag => !state.tactical.flags.includes(flag));
    const success = missing.length === 0;
    return Object.assign({ success }, clone(success ? path.success : path.partial), { missing });
  }
  function applyEvent(tactical, event) {
    for (const key of RESOURCES) tactical.resources[key] = Math.min(key === 'load' ? 9 : 20,
      Math.max(0, tactical.resources[key] + (event.delta[key] || 0)));
    tactical.log.push({ type: 'event', round: event.round, text: event.text, delta: clone(event.delta) });
  }
  function execute(state, chapter, command) {
    const check = preview(state, chapter, command);
    if (!check.ok) return fail(state, check.message);
    const next = clone(state), tactical = next.tactical, action = check.action;
    const unit = tactical.units.find(u => u.id === command.unitId);
    unit.x = command.x; unit.y = command.y;
    tactical.resources = resourcesAfter(tactical.resources, check.cost);
    if (action.flag && !tactical.flags.includes(action.flag)) tactical.flags.push(action.flag);
    tactical.used.push(unit.id); tactical.commandsLeft--;
    tactical.log.push({ type: 'action', round: tactical.round, unitId: unit.id, actionId: action.id,
      x: unit.x, y: unit.y, cost: check.cost, flag: action.flag || null, text: action.feedback });
    let event;
    if (tactical.commandsLeft === 0) {
      if (tactical.round === 1) {
        // The second-round update arrives before students make their next choice.
        const events = chapter.scenario.events.filter(e => e.round === 1 || e.round === 2);
        events.forEach(e => applyEvent(tactical, e));
        if (events.length) event = { type: 'update', round: 2, text: events.map(e => e.text).join('\n') };
      }
      if (tactical.round === 3) {
        next.phase = 'outcome'; tactical.result = outcome(next, chapter);
      } else {
        tactical.round++; tactical.commandsLeft = 2; tactical.used = [];
      }
    }
    return pass(state, next, action.feedback, event);
  }
  function wait(state, chapter, command) {
    const unit = state.tactical && state.tactical.units.find(u => command && u.id === command.unitId);
    return execute(state, chapter, {
      token: command && command.token, unitId: command && command.unitId, actionId: 'wait',
      x: unit ? unit.x : null, y: unit ? unit.y : null
    });
  }
  function retry(state, chapter) {
    if (state.chapterId !== chapter.id) return fail(state, '章節不相符，請重新選擇章節。');
    if (!['outcome', 'review'].includes(state.phase)) return fail(state, '先完成本次挑戰，才能重試。');
    if (state.tacticalAttempts.length >= 100) return fail(state, '已保留 100 次挑戰，請先匯出紀錄並重新開始本章。');
    const next = clone(state);
    next.tacticalAttempts.push(clone(state.tactical)); next.tactical = initialTactical(chapter, pathFor(state, chapter));
    if (!next.tactical) return fail(state, '方案資料的起始資源無效。');
    next.phase = 'tactics'; next.reflection = { reason: '', revision: '' }; next.completedAt = null;
    return pass(state, next, '已回到挑戰起點。線索與歷次挑戰紀錄仍保留。');
  }
  function setReflection(state, chapter, reflection) {
    if (state.chapterId !== chapter.id) return fail(state, '章節不相符，請重新選擇章節。');
    if (state.phase !== 'review') return fail(state, '請先進入回顧。');
    if (!reflection || !['reason', 'revision'].every(key => typeof reflection[key] === 'string' && reflection[key].length <= 6000)) {
      return fail(state, '回顧需包含兩個文字欄位，每欄最多 6000 字。');
    }
    const next = clone(state); next.reflection = { reason: reflection.reason, revision: reflection.revision };
    return pass(state, next, '回顧已儲存。');
  }
  function complete(state, chapter) {
    if (state.chapterId !== chapter.id) return fail(state, '章節不相符，請重新選擇章節。');
    if (state.phase !== 'review') return fail(state, '請先完成挑戰並進入回顧。');
    if (!state.reflection.reason.trim() || !state.reflection.revision.trim()) return fail(state, '請填寫理由與教材依據，以及何時會修正。');
    const next = clone(state); next.phase = 'complete'; next.completedAt = new Date().toISOString();
    return pass(state, next, '本章已完成。此紀錄是學習歷程，不等於正式成績。');
  }

  function assert(condition, message) { if (!condition) throw new Error('無效 RPG 存檔：' + message); }
  function assertKeys(object, keys, label) {
    assert(object && typeof object === 'object' && !Array.isArray(object), label);
    assert(Object.keys(object).length === keys.length && keys.every(key => own(object, key)), label + ' 欄位不符');
  }
  function validateTactical(tactical, state, chapter, finished) {
    assertKeys(tactical, ['round','commandsLeft','used','units','resources','flags','log','result'], '策略');
    assert(Array.isArray(tactical.log) && tactical.log.length <= 8, '策略紀錄長度');
    const path = pathFor(state, chapter);
    assert(path, '策略方案');
    let replay = createState(chapter);
    replay.phase = 'planning'; replay = choosePath(replay, chapter, path.id).state;
    for (const entry of tactical.log) {
      if (entry.type === 'event') continue; // Generated by execute and compared below, never trusted.
      assert(entry.type === 'action', '策略紀錄種類');
      const result = execute(replay, chapter, { token: replay.revision, unitId: entry.unitId,
        actionId: entry.actionId, x: entry.x, y: entry.y });
      assert(result.ok, '策略指令無法重演'); replay = result.state;
    }
    assert(equal(tactical, replay.tactical), '策略資源、位置、事件、結果或紀錄不一致');
    assert((replay.phase === 'outcome') === finished, '策略階段不一致');
  }
  function validateState(state, chapter) {
    assertKeys(state, ['chapterId','phase','revision','player','clues','sideDone','pathId','tactical',
      'tacticalAttempts','reflection','completedAt'], '狀態');
    assert(state.chapterId === chapter.id && PHASES.includes(state.phase), '章節或階段');
    assert(integer(state.revision) && state.revision >= 0 && state.revision <= Number.MAX_SAFE_INTEGER, '版本');
    assertKeys(state.player, ['x','y','facing'], '探索位置');
    assert(['up','down','left','right'].includes(state.player.facing), '方向');
    assert(!blocked(chapter, state.player.x, state.player.y) && flood(chapter).has(state.player.x + ',' + state.player.y), '探索位置不可達');
    assert(Array.isArray(state.clues) && state.clues.length <= chapter.clues.length && new Set(state.clues).size === state.clues.length &&
      state.clues.every(id => chapter.clues.some(c => c.id === id)), '線索');
    assert(typeof state.sideDone === 'boolean', '支線');
    assertKeys(state.reflection, ['reason','revision'], '回顧');
    assert(['reason','revision'].every(key => typeof state.reflection[key] === 'string' && state.reflection[key].length <= 6000), '回顧內容');
    assert(Array.isArray(state.tacticalAttempts) && state.tacticalAttempts.length <= 100, '歷次挑戰');
    const late = ['planning','tactics','outcome','review','complete'].includes(state.phase);
    if (late) assert(chapter.clues.every(c => state.clues.includes(c.id)) && near(state.player, chapter.map.gate), '尚未取得線索或到達入口');
    if (['briefing','exploration','planning'].includes(state.phase)) {
      assert(state.pathId === null && state.tactical === null && state.tacticalAttempts.length === 0, '提前出現策略');
    } else {
      assert(typeof state.pathId === 'string', '方案識別碼');
      validateTactical(state.tactical, state, chapter, state.phase !== 'tactics');
      state.tacticalAttempts.forEach(tactical => validateTactical(tactical, state, chapter, true));
    }
    if (!['review','complete'].includes(state.phase)) assert(state.reflection.reason === '' && state.reflection.revision === '', '回顧提前填寫');
    if (state.phase === 'complete') {
      assert(state.reflection.reason.trim() && state.reflection.revision.trim(), '完成章節缺少回顧');
      assert(typeof state.completedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(state.completedAt) && Number.isFinite(Date.parse(state.completedAt)), '完成時間');
    } else assert(state.completedAt === null, '提前完成');
    if (state.phase === 'briefing') assert(equal(state, createState(chapter)), '簡報狀態');
    const actionCount = state.tactical ? state.tactical.log.filter(e => e.type === 'action').length : 0;
    const minimum = (state.phase === 'briefing' ? 0 : 1) + state.clues.length + Number(state.sideDone) +
      Number(late) + Number(!!state.tactical) + actionCount + state.tacticalAttempts.length * 7 +
      Number(['review','complete'].includes(state.phase)) + (state.phase === 'complete' ? 2 : 0);
    assert(state.revision >= minimum, '版本不足以支持操作紀錄');
    return true;
  }
  return { createState, begin, move, interact, choosePath, execute, wait, retry, setReflection, complete,
    reachable, preview, outcome, validateState };
}));
