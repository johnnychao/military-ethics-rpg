/* Optional, deterministic first-battle advice. Never submits a player command. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tactical_engine.js'), require('./tactical_missions.js'));
  else root.TacticalCoach = factory(root.TacticalEngine, root.TacticalMissions);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Missions) {
  'use strict';
  if (!Engine || !Missions) throw new Error('TacticalEngine and TacticalMissions must load before TacticalCoach.');

  const VERSION = '1.0.0';
  const NOTICE = '建議可以略過，也不是唯一解；倫理選擇不排名，戰術勝敗都能完成反思。採用後仍需確認；盤面更新時請重新取得建議。';
  const routeCache = new Map();
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const cellKey = p => p.x + ',' + p.y;
  const neighbors = p => [{ x: p.x, y: p.y - 1 }, { x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }];
  const label = p => String.fromCharCode(65 + p.x) + (p.y + 1);
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function answer(kind, title, reason, command, step) {
    return freeze({ available: !!command, kind, title, reason, command: command || null, step: step || null, total: step ? ROUTE.length : null, notice: NOTICE });
  }

  // Both ethical decisions have this same optional, tested tactical route.
  // These are private templates, not commands held over from an earlier revision.
  const ROUTE = freeze([
    { command: { type: 'move', unitId: 'scout', x: 5, y: 3 }, title: '偵察員移動到 F4', reason: '先讓若嵐沿走道前進到 F4，形成對右下巡邏訓練機的射線；接著與軍醫集中停用它，騰出救援空間。' },
    { command: { type: 'skill', unitId: 'scout', skillId: 'shot', targetId: 'enemy-2' }, title: '偵察員瞄準巡邏訓練機', reason: '用精準射擊削弱右下的巡邏訓練機。下一步讓軍醫接上火力，減少它干擾救援的機會。' },
    { command: { type: 'move', unitId: 'medic', x: 4, y: 4 }, title: '軍醫移動到 E5', reason: '承澤到 E5 後可看見同一台巡邏訓練機。這次先用遠程支援協助隊友，再一起撤回。' },
    { command: { type: 'skill', unitId: 'medic', skillId: 'shot', targetId: 'enemy-2' }, title: '軍醫接力停用巡邏訓練機', reason: '繼續對同一台巡邏訓練機使用精準射擊，這一步可將它停用。不必清光所有訓練機，重點是接應民眾。' },
    { command: { type: 'move', unitId: 'guardian', x: 2, y: 1 }, title: '護衛移動到 C2', reason: '映岑到 C2 後便與上方民眾相鄰。每人有一次移動和一次技能，移動後仍可救援。' },
    { command: { type: 'skill', unitId: 'guardian', skillId: 'rescue', targetId: 'civilian-1' }, title: '護衛接上第一位民眾', reason: '使用救援，讓上方民眾跟隨映岑。接上還不算完成交接，下回合要帶回左側綠色撤離格。' },
    { command: { type: 'endTurn' }, title: '看過敵機預告，進入第 2 回合', reason: '三位隊員已完成這回合的分工。確認敵機預告後結束回合，下一回合可恢復移動與技能，再分頭接應。' },
    { command: { type: 'move', unitId: 'guardian', x: 0, y: 2 }, title: '護衛帶民眾回到 A3', reason: '映岑移動到 A3 的綠色撤離格，會自動完成第一位民眾的交接，也為其他隊員保留 A4、A5。' },
    { command: { type: 'skill', unitId: 'scout', skillId: 'rescue', targetId: 'civilian-2' }, title: '偵察員接上第二位民眾', reason: '若嵐已在右側民眾旁，現在使用救援。本回合尚未移動，因此接上後就能往撤離區前進。' },
    { command: { type: 'move', unitId: 'scout', x: 1, y: 3 }, title: '偵察員護送到 B4', reason: '帶著第二位民眾沿走道回到 B4，先拉開與訓練機的距離；下一回合再走進 A4 完成交接。' },
    { command: { type: 'move', unitId: 'medic', x: 1, y: 4 }, title: '軍醫回撤到 B5', reason: '承澤跟著回到 B5，為最後一段撤離做好準備。救援完成後，存活隊員也都要回到綠色撤離格。' },
    { command: { type: 'endTurn' }, title: '看過預告，準備最後一段撤離', reason: '護衛已交接，偵察員和軍醫也已回到左側。確認敵機預告後結束回合，下一回合各自走進撤離格。' },
    { command: { type: 'move', unitId: 'scout', x: 0, y: 3 }, title: '偵察員帶民眾進入 A4', reason: '若嵐走進 A4，會自動交接第二位民眾。接著讓軍醫回到 A5，就能完成全隊撤離。' },
    { command: { type: 'move', unitId: 'medic', x: 0, y: 4 }, title: '軍醫進入 A5，完成全隊撤離', reason: '承澤回到最後一格撤離區，兩位民眾與存活全隊都已交接。接著可回顧分工、代價與自己的倫理選擇。' }
  ]);

  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function semanticKey(state) {
    // Retry/undo/decision-selection history is irrelevant to where the team is.
    // All gameplay data (including HP, resources, statuses and metrics) remains.
    const metrics = { ...state.metrics }; delete metrics.retries;
    return stable({ format: state.format, version: state.version, engineVersion: state.engineVersion, contentVersion: state.contentVersion,
      missionId: state.missionId, decisionId: state.decisionId, round: state.round, turnLimit: state.turnLimit,
      phase: state.phase, status: state.status, reason: state.reason, units: state.units, civilians: state.civilians,
      objects: state.objects, smoke: state.smoke, metrics });
  }
  function routeFor(decisionId) {
    if (routeCache.has(decisionId)) return routeCache.get(decisionId);
    const states = new Map();
    let state = Engine.createState('u03', { decisionId });
    for (let i = 0; i < ROUTE.length; i++) {
      states.set(semanticKey(state), i);
      // Simulate only our own freshly-created route, never the caller's state.
      const result = Engine.command(state, { ...ROUTE[i].command, revision: state.revision });
      if (!result.ok) { routeCache.set(decisionId, null); return null; }
      state = result.state;
    }
    if (state.status !== 'won' || state.round !== 3 || state.metrics.rescued !== 2 || state.units.filter(u => u.team === 'player' && u.hp > 0).length !== 3) {
      routeCache.set(decisionId, null); return null;
    }
    routeCache.set(decisionId, states);
    return states;
  }
  function legal(state, template) {
    if (state.commandLog.length >= Engine.MAX_COMMANDS) return null;
    const command = { ...template, revision: state.revision };
    return Engine.preview(state, command).ok ? command : null;
  }
  function hint(state, template, title, reason) {
    const command = legal(state, template);
    return command ? answer('adaptive', title, reason, command) : null;
  }
  function validEnvelope(state, mission) {
    // Bound malformed input before asking the engine to verify its trusted replay.
    return Number.isSafeInteger(state.revision) && state.revision >= 0 &&
      Number.isSafeInteger(state.round) && state.round >= 1 && state.round <= 20 &&
      Array.isArray(state.commandLog) && state.commandLog.length <= Engine.MAX_COMMANDS &&
      Array.isArray(state.undoStack) && state.undoStack.length <= 6 &&
      Array.isArray(state.log) && state.log.length <= 180 &&
      Array.isArray(state.units) && state.units.length === 3 + mission.enemies.length &&
      state.units.every(u => u && Number.isInteger(u.x) && Number.isInteger(u.y) && u.x >= 0 && u.y >= 0 && u.x < mission.map.width && u.y < mission.map.height) &&
      Array.isArray(state.civilians) && state.civilians.length === mission.civilians.length &&
      Array.isArray(state.objects) && state.objects.length === mission.objects.length &&
      Array.isArray(state.smoke) && state.smoke.length <= mission.map.width * mission.map.height;
  }

  // One small reverse Dijkstra field per unit/goal set; u03 has only 48 cells.
  // Using traversable route distance prevents advice that merely approaches a
  // goal in a straight line while actually walking into a wall or dead end.
  function goalDistances(state, actor, goals) {
    const blocked = new Set(state.units.filter(u => u.id !== actor.id && u.hp > 0).map(cellKey));
    state.civilians.filter(c => c.status === 'waiting').forEach(c => blocked.add(cellKey(c)));
    const passable = p => Engine.tileAt(state, p.x, p.y).passable && !blocked.has(cellKey(p));
    const distances = new Map(), queue = [];
    goals.filter(passable).forEach(p => { const key = cellKey(p); if (!distances.has(key)) { distances.set(key, 0); queue.push({ ...p, cost: 0 }); } });
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
      const current = queue.shift();
      if (current.cost !== distances.get(cellKey(current))) continue;
      for (const previous of neighbors(current).filter(passable)) {
        const cost = current.cost + Engine.tileAt(state, current.x, current.y).cost;
        const key = cellKey(previous);
        if (!distances.has(key) || cost < distances.get(key)) { distances.set(key, cost); queue.push({ ...previous, cost }); }
      }
    }
    return distances;
  }
  function exits(state) {
    const map = Missions.getMission(state.missionId).map, result = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (Engine.tileAt(state, x, y).type === 'exit') result.push({ x, y });
    return result;
  }
  function betterMove(state, actor, goals, hazards) {
    if (actor.moved) return null;
    const distances = goalDistances(state, actor, goals), before = distances.get(cellKey(actor));
    if (before == null || before === 0) return null;
    const options = Engine.reachable(state, actor.id).map(p => ({ ...p, remaining: distances.get(cellKey(p)), hazard: hazards.get(cellKey(p)) || 0 }))
      .filter(p => p.remaining != null && p.remaining < before && p.hazard < actor.hp);
    // A non-hazardous step is preferable even when it makes less progress.
    options.sort((a, b) => a.hazard - b.hazard || a.remaining - b.remaining || a.cost - b.cost || a.y - b.y || a.x - b.x);
    return options.length ? { actor, destination: options[0], before } : null;
  }
  function moveHint(state, move, carrying) {
    const { actor, destination } = move;
    const onExit = Engine.tileAt(state, destination.x, destination.y).type === 'exit';
    return hint(state, { type: 'move', unitId: actor.id, x: destination.x, y: destination.y }, actor.title + (carrying ? '護送到 ' : '回撤到 ') + label(destination),
      carrying ? (onExit ? actor.name + '走進這個綠色撤離格，會自動完成民眾交接。' : actor.name + '可沿目前暢通的路線靠近撤離區；民眾會跟著移動。到達後仍要看敵機預告。') : actor.name + '先靠近綠色撤離格，讓存活全隊完成撤離；不需要為了清光訓練機而停留。');
  }
  function adaptive(state) {
    const players = state.units.filter(u => u.team === 'player' && u.hp > 0);
    const waiting = state.civilians.filter(c => c.status === 'waiting');
    const exitCells = exits(state), hazards = new Map();
    Engine.hazardCells(state).forEach(h => h.cells.forEach(p => hazards.set(cellKey(p), (hazards.get(cellKey(p)) || 0) + h.damage)));
    const carriers = players.filter(u => u.carrying).map(u => betterMove(state, u, exitCells, hazards)).filter(Boolean);
    carriers.sort((a, b) => a.destination.remaining - b.destination.remaining || a.before - b.before || a.actor.id.localeCompare(b.actor.id));
    for (const move of carriers) { const result = moveHint(state, move, true); if (result) return result; }

    for (const actor of players.filter(u => !u.carrying && !u.acted)) for (const civilian of waiting) {
      if (distance(actor, civilian) > 1) continue;
      const result = hint(state, { type: 'skill', unitId: actor.id, skillId: 'rescue', targetId: civilian.id }, actor.title + '接上身旁民眾',
        actor.name + '已與' + civilian.name + '相鄰。先使用救援，再把民眾帶回綠色撤離格；每人一次可護送一位。');
      if (result) return result;
    }

    // A single deterministic enemy-intent calculation, not a search tree.
    const intents = Engine.enemyIntents(state), incoming = new Map();
    intents.filter(i => i.type === 'attack').forEach(i => incoming.set(i.targetId, (incoming.get(i.targetId) || 0) + i.damage));
    const medic = players.find(u => u.role === 'medic' && !u.acted);
    const wounded = players.filter(u => u.hp < u.maxHp && (u.hp <= u.maxHp / 2 || u.hp <= (incoming.get(u.id) || 0) + 2)).sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id));
    if (medic) for (const target of wounded) {
      const result = hint(state, { type: 'skill', unitId: medic.id, skillId: 'heal', targetId: target.id }, '軍醫支援低 HP 隊友',
        target.name + '目前剩 ' + target.hp + ' HP。可先用照護支援補回演訓 HP，保留下一步救援或撤離的空間。');
      if (result) return result;
    }
    const threatened = players.filter(u => (incoming.get(u.id) || 0) > 0).sort((a, b) => a.hp - (incoming.get(a.id) || 0) - (b.hp - (incoming.get(b.id) || 0)) || a.id.localeCompare(b.id));
    function protection(urgentOnly) {
      for (const target of threatened) {
        if (urgentOnly && target.hp > (incoming.get(target.id) || 0) + 2) continue;
        const guardian = players.find(u => u.role === 'guardian' && !u.acted);
        if (guardian) for (const intent of intents.filter(i => i.type === 'attack' && i.targetId === target.id)) {
          const result = hint(state, { type: 'skill', unitId: guardian.id, skillId: 'suppress', targetId: intent.enemyId }, '護衛壓制即將攻擊的訓練機',
            '目前預告中有訓練機瞄準' + target.name + '。壓制可以取消這台訓練機本回合的行動；其他敵機仍需留意。');
          if (result) return result;
        }
        const result = hint(state, { type: 'skill', unitId: target.id, skillId: 'guard' }, target.title + '先建立掩護',
          target.name + '正被敵機瞄準。掩護能減少本回合的演訓傷害，之後仍要確認其他隊員的位置與撤離路線。');
        if (result) return result;
      }
      return null;
    }
    const urgent = protection(true); if (urgent) return urgent;

    const approaches = [];
    for (const actor of players.filter(u => !u.carrying && !u.moved)) for (const civilian of waiting) {
      const move = betterMove(state, actor, neighbors(civilian), hazards);
      if (move) approaches.push({ ...move, civilian });
    }
    approaches.sort((a, b) => Number(a.actor.acted) - Number(b.actor.acted) || a.before - b.before || a.destination.hazard - b.destination.hazard || a.destination.remaining - b.destination.remaining || a.actor.id.localeCompare(b.actor.id) || a.civilian.id.localeCompare(b.civilian.id));
    for (const move of approaches) {
      const { actor, destination, civilian } = move;
      const result = hint(state, { type: 'move', unitId: actor.id, x: destination.x, y: destination.y }, actor.title + '靠近民眾，到 ' + label(destination),
        actor.name + '可沿暢通路線靠近' + civilian.name + '。' + (destination.remaining === 0 ? (actor.acted ? '這回合技能已用過，下回合恢復後可救援。' : '到達後與民眾相鄰，還能使用救援。') : '目前還接不到民眾，先縮短實際通路距離，再看敵機預告。'));
      if (result) return result;
    }
    if (!waiting.length) for (const actor of players.filter(u => !u.carrying)) {
      const move = betterMove(state, actor, exitCells, hazards);
      if (move) { const result = moveHint(state, move, false); if (result) return result; }
    }
    const guarded = protection(false); if (guarded) return guarded;
    const ending = hint(state, { type: 'endTurn' }, '確認預告，再結束回合',
      state.round >= state.turnLimit ? '已到最後一回合，目前沒有可建議的救援或前進步驟。結束回合會判定本次戰果；也可先自行檢查其他技能與路線。' : '目前沒有可建議的救援或前進步驟。看過敵機預告後可結束回合，讓隊員恢復移動、技能與 1 能量；也可自行改用其他戰術。');
    return ending || answer('adaptive', '先查看任務與撤離路線', '目前沒有合適的可執行建議。可先查看隊員行動、民眾位置及敵機預告，不必重來。');
  }

  /**
   * suggest(state) -> { available, kind, title, reason, command, step, total, notice }
   * available means a preview-validated command is present. Route steps are 1-based;
   * step/total are null for adaptive, complete and unsupported responses.
   * Commands always carry the current revision. The caller prepares the preview
   * and asks the learner to confirm; it must never auto-submit this suggestion.
   */
  function suggest(state) {
    try {
      if (!state || typeof state !== 'object' || Array.isArray(state)) return answer('unsupported', '暫時無法讀取盤面', '請先開啟一場演訓，再取得戰術建議。');
      const mission = Missions.getMission(state.missionId);
      if (!mission) return answer('unsupported', '找不到這場任務', '請回到有效的演訓盤面，再取得建議。');
      if (mission.id !== 'u03') return answer('unsupported', '這章可自行規劃分工', '逐步戰術建議目前提供給「撤離救護站」。其他章可先看任務目標、角色技能與敵機預告，再安排分工。');
      if (!validEnvelope(state, mission) || !Engine.validateState(state).ok) return answer('unsupported', '盤面資料無法驗證', '為避免提供過期或無效指令，請重新載入有效的演訓進度。');
      if (state.status === 'won' || state.status === 'lost') return answer('complete', state.status === 'won' ? '撤離演訓已完成' : '本次演訓已結束', '可以回顧剛才的分工與代價，再說明自己的倫理選擇。戰術勝敗都能完成反思，也可以自行決定是否重試。');
      if (state.phase !== 'player' || state.status !== 'active') return answer('unsupported', '請等待隊員行動階段', '回到可行動的盤面後，再取得建議。');
      if (state.commandLog.length >= Engine.MAX_COMMANDS) return answer('unsupported', '本次操作已達上限', '目前無法再提交演訓指令，請從章節頁重新開始。');
      const route = routeFor(state.decisionId), index = route && route.get(semanticKey(state));
      if (index != null) {
        const item = ROUTE[index], command = legal(state, item.command);
        if (command) return answer('route', item.title, item.reason, command, index + 1);
      }
      return adaptive(state);
    } catch (error) {
      // Invalid imported data must not crash the board or produce a guessed move.
      return answer('unsupported', '暫時無法提供建議', '請確認演訓資料已載入。你仍可自行查看任務與技能，不必照著固定路線行動。');
    }
  }
  return freeze({ VERSION, suggest, getOpening: suggest });
});
