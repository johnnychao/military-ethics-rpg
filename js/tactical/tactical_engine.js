/* Deterministic tactical-v2 engine. No network, clock, RNG, DOM or student data. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tactical_missions.js'));
  else root.TacticalEngine = factory(root.TacticalMissions);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Missions) {
  'use strict';
  if (!Missions || !Array.isArray(Missions.missions)) throw new Error('TacticalMissions must load first.');
  const VERSION = 2, ENGINE_VERSION = '2.0.0', FORMAT = 'ndmu-ethics-tactical';
  const MAX_COMMANDS = 1200;
  const trusted = new WeakSet();
  const clone = value => JSON.parse(JSON.stringify(value));
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const key = (x, y) => x + ',' + y;
  const point = u => ({ x: u.x, y: u.y });
  const neighbors = u => [{ x: u.x, y: u.y - 1 }, { x: u.x - 1, y: u.y }, { x: u.x + 1, y: u.y }, { x: u.x, y: u.y + 1 }];
  function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
  function seal(state) { freeze(state); trusted.add(state); return state; }
  const ROLE = freeze({
    guardian: { name: '映岑', title: '護衛', hp: 18, armor: 1, moveRange: 3, energy: 2, maxEnergy: 3 },
    scout: { name: '若嵐', title: '偵察員', hp: 12, armor: 0, moveRange: 4, energy: 2, maxEnergy: 3 },
    medic: { name: '承澤', title: '軍醫', hp: 14, armor: 0, moveRange: 3, energy: 2, maxEnergy: 3 },
    sentry: { name: '巡戒訓練機', title: '遠程訓練機', hp: 7, armor: 0, moveRange: 1, range: 3, damage: 3 },
    drone: { name: '巡邏訓練機', title: '近程訓練機', hp: 6, armor: 0, moveRange: 2, range: 1, damage: 3 },
    bulwark: { name: '重型訓練機', title: '重型訓練機', hp: 14, armor: 1, moveRange: 1, range: 2, damage: 4 }
  });
  const SKILLS = freeze({
    strike: { id: 'strike', name: '制止', label: '制止', description: '近距離停用訓練機；相鄰隊友可提供連攜 +1。', icon: '⚔', target: 'enemy', range: 1, energyCost: 0, damage: 4, kind: 'attack' },
    shot: { id: 'shot', name: '精準射擊', label: '精準射擊', description: '對訓練機造成 3 點基礎傷害；需視線，掩體可減傷。', icon: '⌖', target: 'enemy', range: 3, energyCost: 0, damage: 3, kind: 'attack' },
    suppress: { id: 'suppress', name: '壓制', label: '壓制', description: '對訓練機造成 2 點基礎傷害，取消它本回合的行動。', icon: '⊣', target: 'enemy', range: 3, energyCost: 2, damage: 2, kind: 'suppress' },
    smoke: { id: 'smoke', name: '煙幕', label: '煙幕', description: '在指定格及相鄰格建立煙幕，阻斷本回合遠程視線。近身技能仍有效。', icon: '☁', target: 'tile', range: 3, energyCost: 1, kind: 'smoke' },
    heal: { id: 'heal', name: '照護支援', label: '照護支援', description: '回復隊友 5 點演訓 HP；屬抽象支援，不教授醫療操作。', icon: '+', target: 'ally', range: 3, energyCost: 1, heal: 5, kind: 'heal' },
    guard: { id: 'guard', name: '掩護', label: '掩護', description: '自身本回合減傷 2；護衛也替相鄰隊友減傷 1。恢復 1 能量並中斷疲勞累積。', icon: '⛨', target: 'self', range: 0, energyCost: 0, kind: 'guard' },
    rescue: { id: 'rescue', name: '救援', label: '救援', description: '接上相鄰民眾，一人一次帶一位；回到撤離格便完成交接。', icon: '↗', target: 'civilian', range: 1, energyCost: 0, kind: 'rescue' },
    interact: { id: 'interact', name: '任務互動', label: '任務互動', description: '在相鄰或所在任務節點核對、開閘或交接；留意前置節點。', icon: '◇', target: 'object', range: 1, energyCost: 0, kind: 'interact' }
  });
  const roleSkills = { guardian: ['strike', 'suppress', 'guard', 'rescue', 'interact'], scout: ['shot', 'smoke', 'guard', 'rescue', 'interact'], medic: ['shot', 'heal', 'guard', 'rescue', 'interact'] };
  function missionFor(state) { return Missions.getMission(state.missionId); }
  function getUnit(state, unitId) { return state.units.find(u => u.id === unitId) || null; }
  function createState(missionId, options) {
    if (missionId && typeof missionId === 'object') { options = missionId; missionId = options.missionId || options.id; }
    options = options || {};
    const mission = Missions.getMission(missionId || 'u03');
    if (!mission) throw new Error('Unknown tactical mission: ' + missionId);
    if (Object.keys(options).some(k => !['decisionId', 'missionId', 'id'].includes(k))) throw new Error('Unsupported createState option.');
    const decision = mission.decisions.find(d => d.id === options.decisionId) || (!options.decisionId ? mission.decisions[0] : null);
    if (!decision) throw new Error('Unknown ethical decision.');
    const mods = decision.modifiers || {};
    const units = ['guardian', 'scout', 'medic'].map((role, i) => {
      const r = ROLE[role], spawn = mission.spawns[i];
      const baseEnergy = mission.rules && mission.rules.startingEnergy != null ? mission.rules.startingEnergy : r.energy;
      const energy = mods.roleEnergy && mods.roleEnergy[role] != null ? mods.roleEnergy[role] : Math.min(r.maxEnergy, baseEnergy + (mods.energyDelta || 0));
      return { id: role, team: 'player', role, name: r.name, title: r.title, x: spawn[0], y: spawn[1], hp: r.hp, maxHp: r.hp, armor: r.armor, moveRange: r.moveRange, moved: false, acted: false, energy, maxEnergy: r.maxEnergy, carrying: null, statuses: {}, consecutiveActions: 0, lastActionRound: 0 };
    });
    mission.enemies.forEach(e => { const r = ROLE[e.role]; units.push({ id: e.id, team: 'enemy', role: e.role, name: r.name, title: r.title, x: e.x, y: e.y, hp: r.hp, maxHp: r.hp, armor: r.armor, moveRange: r.moveRange, moved: false, acted: false, energy: 0, maxEnergy: 0, carrying: null, statuses: {}, consecutiveActions: 0, lastActionRound: 0 }); });
    return seal({ format: FORMAT, version: VERSION, engineVersion: ENGINE_VERSION, contentVersion: Missions.CONTENT_VERSION, missionId: mission.id, initialDecisionId: decision.id, decisionId: decision.id, revision: 0, round: 1, turnLimit: mission.turnLimit + (mods.turnLimitDelta || 0), phase: 'player', status: 'active', reason: '', units, civilians: mission.civilians.map(c => ({ ...clone(c), status: c.revealRound > 1 ? 'hidden' : 'waiting', carrierId: null })), objects: mission.objects.map(o => ({ ...clone(o), progress: 0, complete: false })), smoke: [], undoStack: [], commandLog: [], log: [], metrics: { rescued: 0, disabled: 0, damageTaken: 0, damageDealt: 0, environmentDamage: 0, fatigueDamage: 0, healing: 0, energySpent: 0, turnsEnded: 0, interactions: 0, combos: 0, incapacitated: 0, retries: 0 }, attempt: 1 });
  }
  function inBounds(state, x, y) { const m = missionFor(state).map; return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < m.width && y < m.height; }
  function tileAt(state, x, y) {
    if (!inBounds(state, x, y)) return { type: 'void', char: '#', name: '界外', passable: false, cover: 0, cost: 0 };
    const m = missionFor(state), char = m.map.rows[y][x], tile = { ...Missions.legend[char], char, x, y };
    if (char === 'D') { tile.passable = (m.gates || []).every(id => state.objects.some(o => o.id === id && o.complete)); tile.name = tile.passable ? '已開啟閘門' : '待開啟閘門'; }
    return tile;
  }
  function occupied(state, x, y, excludeId) { return state.units.some(u => u.id !== excludeId && u.hp > 0 && u.x === x && u.y === y) || state.civilians.some(c => c.status === 'waiting' && c.x === x && c.y === y); }
  function findReachable(state, unit, budget, ignoreActions) {
    if (!unit || unit.hp <= 0 || (!ignoreActions && (state.status !== 'active' || state.phase !== 'player' || unit.team !== 'player' || unit.moved))) return [];
    const start = { x: unit.x, y: unit.y, cost: 0, path: [point(unit)] }, queue = [start], best = new Map([[key(unit.x, unit.y), start]]);
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
      const cur = queue.shift();
      if (best.get(key(cur.x, cur.y)).cost < cur.cost) continue;
      for (const next of neighbors(cur)) {
        const t = tileAt(state, next.x, next.y), cost = cur.cost + t.cost;
        if (!t.passable || occupied(state, next.x, next.y, unit.id) || cost > budget) continue;
        const old = best.get(key(next.x, next.y));
        if (!old || cost < old.cost) { const node = { ...next, cost, path: cur.path.concat([next]) }; best.set(key(next.x, next.y), node); queue.push(node); }
      }
    }
    return Array.from(best.values()).filter(n => n.cost > 0).sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
  }
  function reachable(state, unitId) { const unit = getUnit(state, unitId); return findReachable(state, unit, unit ? unit.moveRange : 0, false); }
  function lineCells(a, b) {
    const cells = [], dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let x = a.x, y = a.y, err = dx - dy;
    while (x !== b.x || y !== b.y) { const twice = 2 * err; if (twice > -dy) { err -= dy; x += sx; } if (twice < dx) { err += dx; y += sy; } cells.push({ x, y }); }
    return cells;
  }
  function hasLineOfSight(state, a, b, ignoreSmoke) {
    if (distance(a, b) <= 1) return true;
    const cells = [point(a)].concat(lineCells(a, b));
    return cells.every((p, i) => { const tile = tileAt(state, p.x, p.y); return (i === 0 || tile.passable) && (ignoreSmoke || !state.smoke.some(s => s.x === p.x && s.y === p.y)); });
  }
  function mitigation(state, target) {
    let amount = target.armor + tileAt(state, target.x, target.y).cover;
    if (target.statuses.guarding) amount += 2;
    if (target.team === 'player' && state.units.some(u => u.id !== target.id && u.role === 'guardian' && u.hp > 0 && u.statuses.guarding && distance(u, target) <= 1)) amount += 1;
    return amount;
  }
  function comboBonus(state, unit) { return state.units.some(u => u.id !== unit.id && u.team === 'player' && u.hp > 0 && distance(unit, u) === 1) ? 1 : 0; }
  function damagePreview(state, actor, target, base) { return Math.max(1, base + (actor.team === 'player' ? comboBonus(state, actor) : 0) - mitigation(state, target)); }
  function skillIds(unit) { return unit && unit.team === 'player' ? roleSkills[unit.role] || [] : []; }
  function getSkills(state, unitId) {
    const unit = getUnit(state, unitId);
    return skillIds(unit).map(id => { const skill = SKILLS[id]; let reason = '';
      if (state.status !== 'active') reason = '演訓已結束'; else if (unit.hp <= 0) reason = '本角色已退出演訓'; else if (unit.acted) reason = '本回合已使用技能'; else if (unit.energy < skill.energyCost) reason = '能量不足'; else if (id === 'rescue' && unit.carrying) reason = '已在護送一位民眾';
      return { ...skill, available: !reason, reason };
    });
  }
  function targetFor(state, cmd, skill, actor) {
    if (skill.target === 'self') return actor;
    if (skill.target === 'tile') return inBounds(state, cmd.x, cmd.y) ? { x: cmd.x, y: cmd.y } : null;
    const pool = skill.target === 'enemy' ? state.units.filter(u => u.team === 'enemy' && u.hp > 0) : skill.target === 'ally' ? state.units.filter(u => u.team === 'player' && u.hp > 0) : skill.target === 'civilian' ? state.civilians.filter(c => c.status === 'waiting') : state.objects;
    return pool.find(item => cmd.targetId ? item.id === cmd.targetId : item.x === cmd.x && item.y === cmd.y) || null;
  }
  function fail(message, extra) { return { ok: false, message, reason: message, ...(extra || {}) }; }
  function preview(state, input) {
    const cmd = input || {};
    if (!state || !missionFor(state)) return fail('找不到任務。');
    if (cmd.revision != null && cmd.revision !== state.revision) return fail('畫面已更新，請重新選擇。');
    if (cmd.type === 'retry' || cmd.type === 'restart') return { ok: true, message: '重新開始本次演訓。', effects: ['reset'] };
    if (cmd.type === 'undo') return state.status === 'active' && state.undoStack.length ? { ok: true, message: '撤回本回合最後一步。', effects: ['undo'] } : fail('敵方行動後不能撤回；本回合尚無可撤回指令。');
    if (cmd.type === 'chooseDecision') return state.commandLog.length === 0 && missionFor(state).decisions.some(d => d.id === cmd.decisionId) ? { ok: true, message: '已選擇行動思路。', effects: ['decision'] } : fail('請在演訓開始前選擇思路。');
    if (state.status !== 'active' || state.phase !== 'player') return fail('本次演訓已結束，可重試或進入反思。');
    if (cmd.type === 'endTurn') return { ok: true, message: '執行敵方預告並進入下一回合。', effects: ['enemyPhase'], intents: enemyIntents(state) };
    const unit = getUnit(state, cmd.unitId);
    if (!unit || unit.team !== 'player' || unit.hp <= 0) return fail('請選擇可行動的隊員。');
    if (cmd.type === 'move') {
      if (unit.moved) return fail('這位隊員本回合已移動。');
      const node = reachable(state, unit.id).find(n => n.x === cmd.x && n.y === cmd.y);
      return node ? { ok: true, message: '移動 ' + node.cost + ' 步。', cost: node.cost, path: node.path, target: { x: node.x, y: node.y }, effects: ['move'] } : fail('無法抵達：超出步數、受阻或格子已占用。');
    }
    if (cmd.type === 'wait') return !unit.moved || !unit.acted ? { ok: true, message: '保留這位隊員剩餘行動。', effects: ['wait'] } : fail('這位隊員本回合已完成行動。');
    if (cmd.type !== 'skill') return fail('不支援的指令。');
    const skill = getSkills(state, unit.id).find(s => s.id === cmd.skillId);
    if (!skill) return fail('這位隊員沒有此技能。');
    if (!skill.available) return fail(skill.reason);
    const target = targetFor(state, cmd, skill, unit);
    if (!target) return fail('請選擇正確的技能目標。');
    if (distance(unit, target) > skill.range) return fail('目標超出技能範圍。');
    if (['attack', 'suppress', 'heal'].includes(skill.kind) && !hasLineOfSight(state, unit, target)) return fail('障礙或煙幕擋住視線。');
    if (skill.kind === 'smoke' && !tileAt(state, target.x, target.y).passable) return fail('煙幕不能放在牆內或未開啟閘門。');
    if (skill.kind === 'heal' && target.hp === target.maxHp) return fail('這位隊員的 HP 已滿。');
    if (skill.kind === 'interact') {
      if (target.kind === 'hold') return fail('輪值點需站在該格，並維持到本回合結束。');
      if (target.complete) return fail('此任務節點已完成。');
      const missing = target.dependsOn.filter(id => !state.objects.some(o => o.id === id && o.complete));
      if (missing.length) return fail('先完成：' + missing.map(id => state.objects.find(o => o.id === id).name).join('、') + '。');
    }
    const damage = skill.damage ? damagePreview(state, unit, target, skill.damage) : 0;
    return { ok: true, message: skill.name + (damage ? '：預計 ' + damage + ' 傷害' : ''), cost: skill.energyCost, energyCost: skill.energyCost, target: target.id ? { id: target.id, x: target.x, y: target.y } : point(target), effects: [skill.kind], damage, healing: skill.heal ? Math.min(skill.heal, target.maxHp - target.hp) : 0, combo: !!(skill.damage && comboBonus(state, unit)) };
  }
  function event(state, events, type, details) { const e = { type, round: state.round, ...(details || {}) }; events.push(e); state.log.push(e); if (state.log.length > 180) state.log.shift(); }
  function damage(state, target, amount, events, sourceId, kind) {
    const before = target.hp; target.hp = Math.max(0, target.hp - amount);
    const actual = before - target.hp;
    if (target.team === 'player') state.metrics.damageTaken += actual;
    else if (!kind || kind === 'attack') state.metrics.damageDealt += actual;
    if (kind === 'hazard') state.metrics.environmentDamage += actual;
    if (kind === 'fatigue') state.metrics.fatigueDamage += actual;
    event(state, events, 'damage', { unitId: sourceId, targetId: target.id, team: target.team, amount: actual, hpBefore: before, hpAfter: target.hp, kind: kind || 'attack', message: target.name + ' −' + actual + ' HP' });
    if (before > 0 && target.hp === 0) {
      target.statuses = { incapacitated: true };
      if (target.team === 'enemy') { state.metrics.disabled++; event(state, events, 'disabled', { targetId: target.id, message: target.name + '已停用。' }); }
      else { state.metrics.incapacitated++; event(state, events, 'incapacitated', { targetId: target.id, message: target.name + '退出本次演訓，模擬角色由教官回收。' }); if (target.carrying) { const c = state.civilians.find(item => item.id === target.carrying); c.status = 'waiting'; c.carrierId = null; c.x = target.x; c.y = target.y; target.carrying = null; event(state, events, 'rescueInterrupted', { unitId: target.id, targetId: c.id, message: c.name + '仍待另一名隊員接手。' }); } }
    }
  }
  function deliver(state, unit, events) {
    if (!unit.carrying) return;
    const c = state.civilians.find(item => item.id === unit.carrying); c.x = unit.x; c.y = unit.y;
    if (tileAt(state, unit.x, unit.y).type === 'exit') { c.status = 'evacuated'; c.carrierId = null; unit.carrying = null; state.metrics.rescued++; event(state, events, 'evacuate', { unitId: unit.id, targetId: c.id, message: c.name + '已完成撤離交接。' }); }
  }
  function objectiveProgress(state) {
    const m = missionFor(state), living = state.units.filter(u => u.team === 'player' && u.hp > 0);
    return m.objectives.map(o => {
      let current = 0, required = o.required;
      if (o.type === 'rescue') current = state.civilians.filter(c => c.status === 'evacuated').length;
      if (o.type === 'interact' || o.type === 'hold') { const relevant = state.objects.filter(ob => Array.isArray(o.objectIds) ? o.objectIds.includes(ob.id) : (o.type === 'hold' ? ob.kind === 'hold' : ob.kind !== 'hold')); current = relevant.filter(ob => ob.complete).length; required = relevant.length; }
      if (o.type === 'extract') { current = living.filter(u => tileAt(state, u.x, u.y).type === 'exit').length; required = living.length || 1; }
      return { ...o, current, required, complete: current >= required };
    });
  }
  function checkOutcome(state, events, timeout) {
    if (state.status !== 'active') return;
    const living = state.units.filter(u => u.team === 'player' && u.hp > 0);
    if (living.length && objectiveProgress(state).every(o => o.complete)) { state.status = 'won'; state.phase = 'complete'; state.reason = '任務目標完成，存活全隊已返回撤離區。'; state.undoStack = []; event(state, events, 'win', { message: state.reason }); }
    else if (!living.length || timeout) { state.status = 'lost'; state.phase = 'complete'; state.reason = !living.length ? '全隊退出本次演訓。可以重試，也能據實完成反思。' : '演訓期限已到，仍有任務或撤離交接未完成。'; state.undoStack = []; event(state, events, 'loss', { message: state.reason }); }
  }
  function intentFor(state, enemy) {
    const targets = state.units.filter(u => u.team === 'player' && u.hp > 0);
    const from = point(enemy), base = { enemyId: enemy.id, unitId: enemy.id, team: 'enemy', from, to: from, path: [from], targetId: null, damage: 0, cells: [] };
    if (enemy.hp <= 0 || !targets.length || enemy.statuses.suppressed) return { ...base, type: 'wait', message: enemy.statuses.suppressed ? '受壓制，本回合不行動' : '待機' };
    const r = ROLE[enemy.role], positions = [{ ...from, cost: 0, path: [from] }].concat(findReachable(state, enemy, enemy.moveRange, true));
    const possibilities = [];
    for (const p of positions) for (const target of targets) if (distance(p, target) <= r.range && hasLineOfSight(state, p, target)) possibilities.push({ p, target, damage: damagePreview(state, enemy, target, r.damage) });
    possibilities.sort((a, b) => a.p.cost - b.p.cost || distance(a.p, a.target) - distance(b.p, b.target) || a.target.hp - b.target.hp || a.target.id.localeCompare(b.target.id) || a.p.y - b.p.y || a.p.x - b.p.x);
    if (possibilities.length) { const v = possibilities[0]; return { ...base, type: 'attack', to: { x: v.p.x, y: v.p.y }, path: v.p.path, targetId: v.target.id, damage: v.damage, cells: [point(v.target)], message: '預計對' + v.target.name + '造成 ' + v.damage + ' 傷害' }; }
    const nearest = targets.slice().sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.id.localeCompare(b.id))[0];
    positions.sort((a, b) => distance(a, nearest) - distance(b, nearest) || a.cost - b.cost || a.y - b.y || a.x - b.x);
    const p = positions[0];
    return { ...base, type: p.cost ? 'move' : 'wait', to: { x: p.x, y: p.y }, path: p.path, targetId: nearest.id, cells: [], message: p.cost ? '向' + nearest.name + '靠近' : '通路受阻，待機' };
  }
  function enemyIntents(state) {
    // Simulate the same ordered enemy phase so later intents account for occupied cells
    // and disabled targets. The visible preview is exactly the next endTurn sequence.
    const projected = clone(state), intents = [];
    for (const enemy of projected.units.filter(u => u.team === 'enemy' && u.hp > 0)) {
      const intent = intentFor(projected, enemy); intents.push(intent);
      enemy.x = intent.to.x; enemy.y = intent.to.y;
      if (intent.type === 'attack') damage(projected, getUnit(projected, intent.targetId), intent.damage, [], enemy.id);
    }
    return intents;
  }
  function hazardCells(state, round) {
    return (missionFor(state).hazards || []).filter(h => h.rounds.includes(round == null ? state.round : round)).map(h => ({ ...clone(h), cells: h.cells.map(c => ({ x: c[0], y: c[1] })) }));
  }
  function runEnemyPhase(state, events) {
    event(state, events, 'phase', { phase: 'enemy', message: '敵方演訓機行動。' });
    for (const enemy of state.units.filter(u => u.team === 'enemy' && u.hp > 0)) {
      const intent = intentFor(state, enemy);
      if (intent.path.length > 1) { const from = point(enemy); enemy.x = intent.to.x; enemy.y = intent.to.y; event(state, events, 'move', { unitId: enemy.id, team: 'enemy', from, to: point(enemy), path: intent.path, message: enemy.name + '移動。' }); }
      if (intent.type === 'attack') { const target = getUnit(state, intent.targetId); event(state, events, 'attack', { unitId: enemy.id, targetId: target.id, team: 'enemy', from: point(enemy), to: point(target), amount: intent.damage, message: enemy.name + '發動演訓攻擊。' }); damage(state, target, intent.damage, events, enemy.id); }
      else if (intent.type === 'wait') event(state, events, 'wait', { unitId: enemy.id, team: 'enemy', message: intent.message });
    }
    for (const hazard of hazardCells(state)) {
      event(state, events, 'hazard', { hazardId: hazard.id, cells: hazard.cells, amount: hazard.damage, message: hazard.name + '啟動。' });
      for (const unit of state.units.filter(u => u.hp > 0 && hazard.cells.some(p => p.x === u.x && p.y === u.y))) damage(state, unit, Math.max(1, hazard.damage - (unit.statuses.guarding ? 1 : 0)), events, hazard.id, 'hazard');
    }
    for (const obj of state.objects.filter(o => o.kind === 'hold' && !o.complete)) {
      const holder = state.units.find(u => u.team === 'player' && u.hp > 0 && distance(u, obj) === 0);
      if (holder) { obj.progress = Math.min(obj.required, obj.progress + 1); obj.complete = obj.progress >= obj.required; event(state, events, 'hold', { unitId: holder.id, targetId: obj.id, progress: obj.progress, required: obj.required, message: obj.name + '維持 ' + obj.progress + '/' + obj.required }); }
    }
    if (missionFor(state).rules && missionFor(state).rules.fatigue) for (const unit of state.units.filter(u => u.team === 'player' && u.hp > 0)) { if (unit.consecutiveActions >= 3) { damage(state, unit, 1, events, 'fatigue', 'fatigue'); event(state, events, 'fatigue', { targetId: unit.id, message: unit.name + '連續負荷增加；下回合可掩護或待命調整。' }); } }
    state.metrics.turnsEnded++;
    checkOutcome(state, events, state.round >= state.turnLimit);
    state.undoStack = [];
    if (state.status === 'active') {
      state.round++; state.smoke = [];
      for (const unit of state.units) { unit.moved = false; unit.acted = false; if (unit.hp > 0) unit.statuses = {}; if (unit.team === 'player' && unit.hp > 0) { unit.energy = Math.min(unit.maxEnergy, unit.energy + 1); if (unit.lastActionRound < state.round - 1) unit.consecutiveActions = 0; } }
      for (const c of state.civilians.filter(c => c.status === 'hidden' && c.revealRound <= state.round)) {
        const map = missionFor(state).map, free = [];
        for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (tileAt(state, x, y).passable && !occupied(state, x, y, null)) free.push({ x, y });
        free.sort((a, b) => distance(a, c) - distance(b, c) || a.y - b.y || a.x - b.x);
        if (free.length) { const original = point(c); c.x = free[0].x; c.y = free[0].y; c.status = 'waiting'; event(state, events, 'reveal', { targetId: c.id, from: original, to: point(c), message: '新情報：' + c.name + '確認需要救援，請調整分工。' }); }
      }
      event(state, events, 'phase', { phase: 'player', message: '第 ' + state.round + ' 回合，隊員行動與 1 能量已恢復。' });
    }
  }
  const SNAPSHOT_KEYS = ['units', 'civilians', 'objects', 'smoke', 'metrics', 'log', 'status', 'phase', 'reason'];
  function snapshot(state) { const snap = {}; SNAPSHOT_KEYS.forEach(k => { snap[k] = clone(state[k]); }); return snap; }
  const CMD_KEYS = ['type', 'unitId', 'x', 'y', 'targetId', 'skillId', 'revision', 'decisionId'];
  function normalizedCommand(input) { const out = {}; CMD_KEYS.forEach(k => { if (input[k] !== undefined) out[k] = input[k]; }); return out; }
  function execute(current, input, shouldSeal) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !CMD_KEYS.includes(k))) return { ...fail('指令格式不正確。'), state: current, events: [] };
    if (!Number.isSafeInteger(input.revision) || input.revision !== current.revision) return { ...fail('畫面已更新，請重新選擇。'), state: current, events: [] };
    if (current.commandLog.length >= MAX_COMMANDS) return { ...fail('本次指令已達上限，請從章節頁重新開始。'), state: current, events: [] };
    const cmd = normalizedCommand(input), p = preview(current, cmd);
    if (!p.ok) return { ...p, state: current, events: [] };
    let state = clone(current); const events = [];
    if (cmd.type === 'retry' || cmd.type === 'restart') {
      const oldLog = state.commandLog, revision = state.revision, attempt = state.attempt + 1, initialDecisionId = state.initialDecisionId;
      state = clone(createState(state.missionId, { decisionId: state.decisionId })); state.commandLog = oldLog; state.revision = revision; state.attempt = attempt; state.metrics.retries = attempt - 1; state.initialDecisionId = initialDecisionId;
      event(state, events, 'retry', { message: '已重設隊員、民眾、敵機、資源與任務進度。' });
    } else if (cmd.type === 'chooseDecision') {
      const fresh = clone(createState(state.missionId, { decisionId: cmd.decisionId })); state.units = fresh.units; state.turnLimit = fresh.turnLimit; state.decisionId = cmd.decisionId; event(state, events, 'decision', { decisionId: cmd.decisionId, message: '行動思路已更新。' });
    } else if (cmd.type === 'undo') {
      const snap = state.undoStack.pop(); SNAPSHOT_KEYS.forEach(k => { state[k] = snap[k]; }); event(state, events, 'undo', { message: '已撤回本回合最後一步。' });
    } else if (cmd.type === 'endTurn') {
      runEnemyPhase(state, events);
    } else {
      state.undoStack.push(snapshot(state)); if (state.undoStack.length > 6) state.undoStack.shift();
      const unit = getUnit(state, cmd.unitId);
      if (cmd.type === 'move') {
        const from = point(unit); unit.x = cmd.x; unit.y = cmd.y; unit.moved = true;
        event(state, events, 'move', { unitId: unit.id, team: unit.team, from, to: point(unit), path: p.path, message: unit.name + '移動。' }); deliver(state, unit, events);
      } else if (cmd.type === 'wait') { unit.moved = true; unit.acted = true; unit.consecutiveActions = 0; event(state, events, 'wait', { unitId: unit.id, team: unit.team, message: unit.name + '待命。' }); }
      else if (cmd.type === 'skill') {
        const skill = SKILLS[cmd.skillId], target = targetFor(state, cmd, skill, unit);
        unit.acted = true; unit.energy -= skill.energyCost; state.metrics.energySpent += skill.energyCost;
        unit.consecutiveActions = unit.lastActionRound === state.round - 1 ? unit.consecutiveActions + 1 : 1; unit.lastActionRound = state.round;
        if (skill.kind === 'attack' || skill.kind === 'suppress') {
          const amount = damagePreview(state, unit, target, skill.damage), combo = comboBonus(state, unit);
          if (combo) { state.metrics.combos++; event(state, events, 'combo', { unitId: unit.id, targetId: target.id, amount: 1, message: '相鄰連攜 +1' }); }
          event(state, events, 'attack', { unitId: unit.id, targetId: target.id, team: unit.team, from: point(unit), to: point(target), amount, skillId: skill.id, message: unit.name + '使用' + skill.name + '。' }); damage(state, target, amount, events, unit.id);
          if (skill.kind === 'suppress' && target.hp > 0) { target.statuses.suppressed = true; event(state, events, 'suppress', { unitId: unit.id, targetId: target.id, message: target.name + '本回合被壓制。' }); }
        } else if (skill.kind === 'guard') { unit.statuses.guarding = true; unit.energy = Math.min(unit.maxEnergy, unit.energy + 1); unit.consecutiveActions = 0; event(state, events, 'guard', { unitId: unit.id, team: unit.team, message: unit.name + '建立掩護。' }); }
        else if (skill.kind === 'smoke') {
          const cells = [point(target)].concat(neighbors(target)).filter(c => inBounds(state, c.x, c.y) && tileAt(state, c.x, c.y).passable);
          for (const c of cells) if (!state.smoke.some(s => s.x === c.x && s.y === c.y)) state.smoke.push({ ...c, expiresRound: state.round });
          event(state, events, 'smoke', { unitId: unit.id, to: point(target), cells, message: '煙幕已阻斷遠程視線，持續至本次敵方回合結束。' });
        } else if (skill.kind === 'heal') {
          const before = target.hp; target.hp = Math.min(target.maxHp, target.hp + skill.heal); state.metrics.healing += target.hp - before;
          event(state, events, 'heal', { unitId: unit.id, targetId: target.id, amount: target.hp - before, hpBefore: before, hpAfter: target.hp, message: target.name + '獲得照護支援 +' + (target.hp - before) + ' HP' });
        } else if (skill.kind === 'rescue') { unit.carrying = target.id; target.status = 'carried'; target.carrierId = unit.id; target.x = unit.x; target.y = unit.y; event(state, events, 'rescue', { unitId: unit.id, targetId: target.id, message: unit.name + '接上' + target.name + '，請回撤離區。' }); deliver(state, unit, events); }
        else if (skill.kind === 'interact') {
          target.progress = Math.min(target.required, target.progress + 1); target.complete = target.progress >= target.required; state.metrics.interactions++;
          if (target.complete && target.kind === 'supply') for (const ally of state.units.filter(u => u.team === 'player' && u.hp > 0)) ally.energy = Math.min(ally.maxEnergy, ally.energy + 1);
          event(state, events, 'interact', { unitId: unit.id, targetId: target.id, progress: target.progress, required: target.required, complete: target.complete, message: target.name + '：' + target.progress + '/' + target.required + (target.complete ? ' 已完成' : '') });
        }
      }
      checkOutcome(state, events, false);
    }
    state.revision = current.revision + 1; state.commandLog.push(cmd);
    return { ok: true, state: shouldSeal === false ? state : seal(state), events: clone(events), message: events.length ? events[events.length - 1].message || p.message : p.message };
  }
  function replay(missionId, commandLog, options) {
    if (!Array.isArray(commandLog) || commandLog.length > MAX_COMMANDS) return fail('指令紀錄無效或過長。');
    let state;
    try { state = createState(missionId, options); } catch (e) { return fail(e.message); }
    for (let i = 0; i < commandLog.length; i++) { const result = execute(state, commandLog[i], false); if (!result.ok) return { ...fail('第 ' + (i + 1) + ' 筆指令無效：' + result.message), index: i }; state = result.state; }
    return { ok: true, state: seal(state) };
  }
  function stable(value) { if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}'; return JSON.stringify(value); }
  function validateState(state) {
    if (trusted.has(state)) return { ok: true, errors: [] };
    if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, errors: ['狀態必須是物件。'] };
    try {
      const encoded = JSON.stringify(state); if (encoded.length > 1500000) return { ok: false, errors: ['狀態超過大小限制。'] };
      if (state.format !== FORMAT || state.version !== VERSION || state.engineVersion !== ENGINE_VERSION || state.contentVersion !== Missions.CONTENT_VERSION) return { ok: false, errors: ['狀態版本不相容。'] };
      const rebuilt = replay(state.missionId, state.commandLog, { decisionId: state.initialDecisionId });
      if (!rebuilt.ok) return { ok: false, errors: [rebuilt.message] };
      if (stable(rebuilt.state) !== stable(state)) return { ok: false, errors: ['狀態與可信指令重演不符。'] };
      return { ok: true, errors: [] };
    } catch (e) { return { ok: false, errors: ['狀態無法驗證。'] }; }
  }
  function command(state, input) {
    const check = validateState(state);
    if (!check.ok) return { ...fail('存檔驗證未通過：' + check.errors[0]), state, events: [] };
    return execute(state, input, true);
  }
  function summary(state) {
    const check = validateState(state); if (!check.ok) return { status: 'invalid', canReflect: false, reason: check.errors[0], objectives: [], metrics: {} };
    return { missionId: state.missionId, title: missionFor(state).title, status: state.status, won: state.status === 'won', round: state.round, turnLimit: state.turnLimit, reason: state.reason, objectives: objectiveProgress(state), metrics: clone(state.metrics), canReflect: state.status === 'won' || state.status === 'lost', decision: clone(missionFor(state).decisions.find(d => d.id === state.decisionId)), surviving: state.units.filter(u => u.team === 'player' && u.hp > 0).length, unresolvedCivilians: state.civilians.filter(c => c.status !== 'evacuated').length };
  }
  return freeze({ VERSION, ENGINE_VERSION, FORMAT, CONTENT_VERSION: Missions.CONTENT_VERSION, MAX_COMMANDS, createState, command, reachable, preview, enemyIntents, summary, validateState, replay, getSkills, tileAt, hazardCells, hasLineOfSight, objectiveProgress, roles: ROLE, skills: SKILLS });
});
