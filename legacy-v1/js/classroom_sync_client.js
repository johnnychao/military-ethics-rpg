/* Classroom-only client. Proofs and session credentials live only in closures. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EthicsClassroomClient = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'ndmu-ethics-classroom:queue:v1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
  const clone = value => JSON.parse(JSON.stringify(value));
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
  const stringify = value => JSON.stringify(canonical(value));
  const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(value, k));
  const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  function validReceipt(result, eventId) {
    return exact(result, ['ok', 'eventId', 'serverReceivedAt', 'reviewStatus', 'duplicate']) && result.ok === true && result.eventId === eventId && UUID.test(result.eventId) && iso(result.serverReceivedAt) && result.reviewStatus === 'pending_teacher_review' && typeof result.duplicate === 'boolean';
  }
  function randomHex(crypto, length) {
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw new Error('SECURE_RANDOM_UNAVAILABLE');
    return [...crypto.getRandomValues(new Uint8Array(length))].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function uuid(crypto) {
    const bytes = randomHex(crypto, 16).split(''); bytes[12] = '4'; bytes[16] = (8 + (parseInt(bytes[16], 16) % 4)).toString(16);
    const raw = bytes.join(''); return [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join('-');
  }
  function createRpc(host) {
    return function rpc(method, args) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = fn => result => { if (settled) return; settled = true; host.clearTimeout(timer); fn(result); };
        const timer = host.setTimeout(() => finish(reject)(new Error('RPC_TIMEOUT')), 30000);
        try {
          const runner = host.google.script.run.withSuccessHandler(finish(resolve)).withFailureHandler(finish(reject));
          runner[method].apply(runner, args);
        } catch (error) { finish(reject)(error); }
      });
    };
  }
  function createClient(options) {
    const now = options.now || Date.now, crypto = options.crypto, notify = options.onChange || (() => {});
    const storage = options.storage, rpc = options.rpc, local = options.mode === 'public';
    const scopeValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
    let enabled = options.enabled === true, consent = false, session = null, login = null, preparing = false, context = null;
    let entries = [], owners = new Map(), durableOwners = new Map(), damagedRaw = null, storageWarning = '', message = enabled ? '請先登入 Google，選擇班級並同意同步。' : '老師尚未啟用班級同步；遊戲可先在本機進行。';
    let sending = false, generation = 0, nextGlobalAt = 0, currentStore = null, bonus = null;
    let profileKey = null, lineages = new Map(), bonusCaptures = new Map();
    function profile() { return currentStore && currentStore.save && currentStore.save.createdAt || null; }
    function profileConflict() { return !!(context && profile() && owners.has(profile()) && owners.get(profile()) !== context.queueScope); }
    function state() {
      if (session && session.expiresAt <= now()) { resetIdentity(); message = '登入已到期，請重新登入同一帳號。'; }
      return { enabled, consent, authenticated: !!session && session.expiresAt > now(), loginPending: !!login || preparing,
        classId: context && context.classId, classes: session ? clone(session.classes || []) : [], profileConflict: profileConflict(),
        pending: entries.filter(e => e.status !== 'synced').length, synced: entries.filter(e => e.status === 'synced').length,
        foreignPending: entries.filter(e => e.status !== 'synced' && (!context || e.queueScope !== context.queueScope || e.classId !== context.classId)).length,
        storageWarning, message, entries: entries.map(e => ({ eventId: e.eventId, chapterId: JSON.parse(e.raw).attempt.chapterId, status: e.status, error: e.error || '', receipt: e.receipt ? clone(e.receipt) : null })) };
    }
    function emit() { try { notify(state()); } catch (_) {} }
    function savedQueue() {
      return { format: 'ndmu-ethics-classroom-queue', version: 2, owners: [...owners].map(([profile, queueScope]) => ({ profile, queueScope })),
        entries: entries.map(e => ({ eventId: e.eventId, classId: e.classId, queueScope: e.queueScope, lineage: e.lineage, raw: e.raw, status: e.status, receipt: e.receipt, tries: e.tries, nextTryAt: e.nextTryAt, error: e.error || '' })) };
    }
    function readQueue(raw) {
      const saved = JSON.parse(raw);
      if ((!exact(saved, ['format', 'version', 'entries']) && !exact(saved, ['format', 'version', 'owners', 'entries'])) || saved.format !== 'ndmu-ethics-classroom-queue' || ![1, 2].includes(saved.version) || !Array.isArray(saved.entries) || (saved.version === 2 && !Array.isArray(saved.owners))) throw new Error('QUEUE_INVALID');
      const seen = new Set(), ownership = new Map();
      (saved.owners || []).forEach(o => {
        if (!exact(o, ['profile', 'queueScope']) || typeof o.profile !== 'string' || !o.profile || o.profile.length > 100 || !scopeValid(o.queueScope) || ownership.has(o.profile)) throw new Error('QUEUE_INVALID');
        ownership.set(o.profile, o.queueScope);
      });
      saved.entries.forEach(e => {
        if (!exact(e, ['eventId', 'classId', 'queueScope', 'lineage', 'raw', 'status', 'receipt', 'tries', 'nextTryAt', 'error']) || !UUID.test(e.eventId) || seen.has(e.eventId) || !ID.test(e.classId) || !scopeValid(e.queueScope) || typeof e.lineage !== 'string' || e.lineage.length > 200 || !['pending', 'synced'].includes(e.status) || typeof e.raw !== 'string' || !Number.isSafeInteger(e.tries) || e.tries < 0 || !Number.isFinite(e.nextTryAt) || typeof e.error !== 'string') throw new Error('QUEUE_INVALID');
        const p = JSON.parse(e.raw), match = e.lineage.match(/^(.*):u(?:0[1-9]|1[0-3]):\d+$/);
        if (!exact(p, ['format', 'version', 'eventId', 'classId', 'attempt', 'bonus']) || p.eventId !== e.eventId || p.classId !== e.classId || p.format !== 'ndmu-ethics-class-attempt' || p.version !== 1 || !plain(p.attempt) || !/^u(0[1-9]|1[0-3])$/.test(p.attempt.chapterId) || !match || !match[1] || (e.status === 'synced' ? !validReceipt(e.receipt, e.eventId) : e.receipt !== null)) throw new Error('QUEUE_INVALID');
        if (ownership.has(match[1]) && ownership.get(match[1]) !== e.queueScope) throw new Error('PROFILE_OWNER_CONFLICT');
        ownership.set(match[1], e.queueScope); seen.add(e.eventId);
      });
      return { entries: saved.entries, owners: ownership };
    }
    function mergeSaved(saved) {
      saved.owners.forEach((scope, key) => { if (owners.has(key) && owners.get(key) !== scope) throw new Error('PROFILE_OWNER_CONFLICT'); });
      const byId = new Map(entries.map(e => [e.eventId, e]));
      saved.entries.forEach(e => { const existing = byId.get(e.eventId); if (existing && (existing.raw !== e.raw || existing.queueScope !== e.queueScope || existing.lineage !== e.lineage)) throw new Error('QUEUE_CONFLICT'); });
      saved.owners.forEach((scope, key) => { owners.set(key, scope); durableOwners.set(key, scope); });
      saved.entries.forEach(e => { const existing = byId.get(e.eventId); if (!existing) entries.push(clone(e)); else if (e.status === 'synced' && existing.status !== 'synced') Object.assign(existing, clone(e)); });
    }
    function refresh() {
      if (!storage || typeof storage.getItem !== 'function') return;
      const raw = storage.getItem(STORAGE_KEY); if (raw) mergeSaved(readQueue(raw));
    }
    function persist() {
      try {
        if (damagedRaw !== null) throw new Error('QUEUE_DAMAGED');
        if (!storage || typeof storage.setItem !== 'function') throw new Error('STORAGE_UNAVAILABLE');
        refresh(); const raw = JSON.stringify(savedQueue()); storage.setItem(STORAGE_KEY, raw);
        if (storage.getItem(STORAGE_KEY) !== raw) throw new Error('STORAGE_READBACK_FAILED');
        storageWarning = ''; durableOwners = new Map(owners); return true;
      } catch (_) { storageWarning = '待同步資料目前只保留在本頁記憶體，請立即匯出備份，不要關閉本頁。'; return false; }
    }
    if (local) {
      try { const raw = storage && storage.getItem(STORAGE_KEY); if (raw) { try { mergeSaved(readQueue(raw)); } catch (_) { damagedRaw = raw; storageWarning = '待同步備份無法讀取；原文已保留。請匯出備份並請老師協助。'; } } }
      catch (_) { storageWarning = '無法讀取本機待同步資料；本頁新紀錄僅保留於記憶體，請匯出備份。'; }
    }
    function clearCapture() {
      lineages = new Map(); profileKey = null;
      bonusCaptures.forEach(pending => { if (pending.timer !== null && options.clearTimeout) options.clearTimeout(pending.timer); });
      bonusCaptures.clear();
    }
    function authFailure(error) { return /ACCESS_DENIED|AUTH_NOT_CONFIGURED|AUTH_REQUIRED|SESSION_EXPIRED|CLASSROOM_DISABLED/.test(String(error && (error.code || error.message))); }
    function resetIdentity() { generation += 1; login = null; preparing = false; session = null; context = null; consent = false; clearCapture(); }
    function baseline(store) {
      currentStore = store; profileKey = profile(); lineages = new Map();
      if (store && store.save) Object.keys(store.save.records).forEach(id => lineages.set(id, { id: profileKey + ':' + id + ':' + store.save.records[id].attempts.length }));
    }
    async function beginLogin() {
      if (!enabled || local) throw new Error('CLASSROOM_DISABLED');
      const oldToken = session && session.token; resetIdentity(); const current = generation; preparing = true; message = '準備 Google 登入中。'; emit();
      try {
      if (oldToken) Promise.resolve(rpc('endClassroomLogin', [oldToken])).catch(() => {});
      if (!crypto || !crypto.subtle) throw new Error('SECURE_RANDOM_UNAVAILABLE');
      const proof = randomHex(crypto, 32), bytes = new TextEncoder().encode(proof);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
      if (current !== generation) return null;
      const result = await rpc('beginClassroomLogin', [hash]);
      if (current !== generation) return null;
      if (!result || result.ok !== true || typeof result.loginId !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(result.loginId) || !iso(result.expiresAt) || Date.parse(result.expiresAt) <= now()) throw new Error('LOGIN_RESPONSE_INVALID');
      let url; try { url = new URL(result.authUrl); } catch (_) { throw new Error('LOGIN_RESPONSE_INVALID'); }
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com' || url.username || url.password || url.hash) throw new Error('LOGIN_RESPONSE_INVALID');
      login = { loginId: result.loginId, proof, expiresAt: Date.parse(result.expiresAt), generation: current };
      message = '請按「開啟 Google 登入」，登入後回到這個同步分頁。'; emit();
      return { authUrl: result.authUrl, expiresAt: result.expiresAt };
      } finally { if (generation === current) { preparing = false; emit(); } }
    }
    async function pollLogin() {
      if (!login) return false;
      const pending = login;
      if (pending.expiresAt <= now()) { resetIdentity(); message = '登入已逾時，請重新開始登入。'; emit(); return false; }
      let result;
      try { result = await rpc('finishClassroomLogin', [pending.loginId, pending.proof]); }
      catch (error) { if (login === pending && authFailure(error)) { resetIdentity(); emit(); } throw error; }
      if (login !== pending || pending.generation !== generation) return false;
      if (result && result.ok === true && result.status === 'pending') return false;
      if (!result || result.ok !== true || result.status !== 'authenticated' || typeof result.sessionToken !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(result.sessionToken) || !iso(result.expiresAt) || Date.parse(result.expiresAt) <= now() || !Array.isArray(result.classes) || !result.classes.length) { resetIdentity(); emit(); throw new Error('ACCESS_DENIED'); }
      let classes;
      try { classes = result.classes.map(c => { if (!plain(c) || !ID.test(c.id) || typeof c.label !== 'string' || c.label.length > 100) throw new Error('LOGIN_RESPONSE_INVALID'); return { id: c.id, label: c.label }; }); }
      catch (error) { resetIdentity(); emit(); throw error; }
      session = { token: result.sessionToken, expiresAt: Date.parse(result.expiresAt), classes }; login = null;
      message = 'Google 登入成功，請選擇班級並按「連接班級」。'; emit(); return true;
    }
    function activeSession() {
      if (!session || session.expiresAt <= now()) { resetIdentity(); message = '登入已到期；待同步資料保留，請重新登入同一帳號。'; emit(); throw new Error('SESSION_EXPIRED'); }
      return session.token;
    }
    async function join(classId) {
      if (!enabled || local || !ID.test(classId)) throw new Error('CLASSROOM_DISABLED');
      const token = activeSession(); generation += 1; const current = generation;
      context = null; consent = false; clearCapture(); message = '核對班級名冊中。'; emit();
      let result;
      try { result = await rpc('classroomJoin', [classId, token]); }
      catch (error) { if (session && session.token === token && generation === current && authFailure(error)) { resetIdentity(); emit(); } throw error; }
      if (!session || session.token !== token || generation !== current) return false;
      if (!result || result.ok !== true || result.classId !== classId || !scopeValid(result.queueScope)) throw new Error('JOIN_RESPONSE_INVALID');
      context = { classId, queueScope: result.queueScope, rankingsEnabled: result.rankingsEnabled === true, connectionId: randomHex(crypto, 32) };
      message = '班級身分已核對，勾選同意後才會連線；遊戲分頁也須另行同意。'; emit(); return true;
    }
    function setConsent(value) {
      if (value && (!enabled || !context || !session || session.expiresAt <= now())) throw new Error('LOGIN_REQUIRED');
      if (value && local) {
        try { refresh(); } catch (_) { storageWarning = '無法核對本機待同步備份，請先匯出並請老師協助。'; throw new Error('PROFILE_OWNER_CONFLICT'); }
        const key = profile();
        if (!key || typeof key !== 'string' || key.length > 100) throw new Error('PROFILE_REQUIRED');
        if (profileConflict()) { consent = false; message = '這份本機遊戲紀錄已連結另一帳號或班級。請登入原帳號，或先備份後建立新的遊戲紀錄。'; emit(); throw new Error('PROFILE_OWNER_CONFLICT'); }
        owners.set(key, context.queueScope); baseline(currentStore); persist();
        if (durableOwners.get(key) !== context.queueScope) { consent = false; message = '無法安全保存本機紀錄與帳號的連結，暫不啟用同步。請保留遊戲備份並允許本機儲存後重試。'; emit(); throw new Error('OWNERSHIP_STORAGE_REQUIRED'); }
      }
      consent = value === true;
      if (consent && local) captureHistory(); else if (!consent) clearCapture();
      message = consent ? '已開啟同步。全班同步不自動列入出席；10/6 當堂提交仍用原收件流程。' : '已暫停新的同步及重送；尚未確認的資料保留。'; emit();
    }
    function ownedProfile() { return !!(profileKey && profileKey === profile() && context && owners.get(profileKey) === context.queueScope); }
    function enqueue(attempt, envelope, lineage) {
      if (!local || !enabled || !consent || !context || !session || session.expiresAt <= now() || !ownedProfile() || !lineage || !lineage.id.startsWith(profileKey + ':')) return false;
      const body = { format: 'ndmu-ethics-class-attempt', version: 1, classId: context.classId, attempt: clone(attempt), bonus: envelope ? clone(envelope) : null };
      const signature = stringify(body);
      if (entries.some(e => e.lineage === lineage.id && e.queueScope === context.queueScope && (() => { const p = JSON.parse(e.raw); delete p.eventId; return stringify(p) === signature; })())) return false;
      const eventId = uuid(crypto), raw = stringify({ ...body, eventId });
      entries.push({ eventId, classId: context.classId, queueScope: context.queueScope, lineage: lineage.id, raw, status: 'pending', receipt: null, tries: 0, nextTryAt: 0, error: '' });
      persist(); message = '新紀錄已排入待同步；收到可核對回執後才算已收件。'; emit(); return true;
    }
    async function pump() {
      if (!local || !enabled || !consent || !context || sending || now() < nextGlobalAt || damagedRaw !== null) return false;
      let token; try { token = activeSession(); } catch (_) { return false; }
      const sendingSession = session, sendingContext = context;
      const entry = entries.find(e => e.status === 'pending' && e.classId === context.classId && e.queueScope === context.queueScope && e.nextTryAt <= now());
      if (!entry) return false;
      sending = true; entry.tries += 1; nextGlobalAt = now() + 5000;
      try {
        const result = await rpc('classroomSubmitAttempt', [entry.raw, token, entry.queueScope]);
        if (!validReceipt(result, entry.eventId)) throw new Error('RECEIPT_INVALID');
        entry.status = 'synced'; entry.receipt = clone(result); entry.error = '';
        if (context === sendingContext) message = '伺服器已收件並讀回核對，仍待老師核實。';
      } catch (error) {
        const code = String(error && (error.code || error.message) || 'RPC_FAILED');
        entry.error = /(?:SESSION_EXPIRED|ACCESS_DENIED|AUTH_REQUIRED)/.test(code) ? '請重新登入同一帳號後重送。' : '尚未取得可核對回執，保留原事件編號重送。';
        if (/(?:SESSION_EXPIRED|ACCESS_DENIED|AUTH_REQUIRED)/.test(code) && session === sendingSession) resetIdentity();
        entry.nextTryAt = now() + Math.min(120000, 5000 * Math.pow(2, Math.min(entry.tries - 1, 5)));
        if (context === sendingContext || !context) message = entry.error;
      } finally { sending = false; persist(); emit(); }
      return entry.status === 'synced';
    }
    async function leaderboard(metric, expectedScope) {
      if (!context || !context.rankingsEnabled || !['exploration', 'collection', 'puzzle'].includes(metric)) throw new Error('RANKINGS_DISABLED');
      if (expectedScope !== undefined && expectedScope !== context.queueScope) throw new Error('SESSION_CHANGED');
      const boardContext = context, boardSession = session;
      let rows;
      try { rows = await rpc('classroomLeaderboard', [context.classId, metric, activeSession(), context.queueScope]); }
      catch (error) { if (session === boardSession && context === boardContext && authFailure(error)) { resetIdentity(); emit(); } throw error; }
      if (context !== boardContext || session !== boardSession) throw new Error('SESSION_CHANGED');
      if (!Array.isArray(rows) || rows.length > 1000 || rows.some(r => !exact(r, ['nickname', 'score', 'rank']) || !/^探索員 [A-Z2-9]{6}$/.test(r.nickname) || !Number.isSafeInteger(r.score) || r.score < 0 || !Number.isSafeInteger(r.rank) || r.rank < 1)) throw new Error('RANKINGS_RESPONSE_INVALID');
      return clone(rows);
    }
    function envelope() {
      try { if (!bonus || !currentStore || !currentStore.save || !bonus.o.getProfile() || bonus.o.getProfile().createdAt !== profile()) return null; if (bonus.ensure) bonus.ensure(); return bonus.engine.exportEvents(bonus.state); } catch (_) { return null; }
    }
    function observeStore(store, kind, before, id, restart) {
      const oldKey = profile(); currentStore = store;
      if (!store.save) return;
      if (kind === 'newProfile' || kind === 'importJSON' || oldKey && oldKey !== profile() || profileKey && profileKey !== profile()) {
        consent = false; generation += 1; clearCapture(); baseline(store); message = '遊戲紀錄已變更，請重新核對帳號並勾選同意同步。'; emit(); return;
      }
      if (!profileKey || kind === 'load') baseline(store);
      if (!consent || !ownedProfile()) return;
      if (kind === 'load') { captureHistory(); return; }
      if (kind === 'startChapter') {
        if (restart && before && before.records[id]) enqueue(before.records[id].current, envelope(), lineages.get(id));
        if (restart || !before || !before.records[id]) lineages.set(id, { id: profileKey + ':' + id + ':' + store.save.records[id].attempts.length });
      }
      if (kind === 'updateState') {
        const current = store.getCurrent(), previous = before && before.records[current.chapterId] && before.records[current.chapterId].current;
        if (current.phase === 'complete' && (!previous || previous.phase !== 'complete') || previous && current.tacticalAttempts.length > previous.tacticalAttempts.length) enqueue(current, envelope(), lineages.get(current.chapterId));
      }
    }
    function captureHistory() {
      if (!currentStore || !currentStore.save || !consent || !ownedProfile()) return;
      Object.keys(currentStore.save.records).forEach(id => {
        const record = currentStore.save.records[id];
        record.attempts.forEach((attempt, i) => enqueue(attempt, envelope(), { id: profileKey + ':' + id + ':' + i }));
        enqueue(record.current, envelope(), { id: profileKey + ':' + id + ':' + record.attempts.length });
      });
    }
    function observeBonus(ui) {
      bonus = ui;
      if (!consent || !ownedProfile() || !ui.o.getProfile() || ui.o.getProfile().createdAt !== profile()) return;
      const state = currentStore.getCurrent(); if (!state) return;
      const s = clone(state), b = clone(envelope()), l = lineages.get(s.chapterId), target = context, current = generation, key = profileKey;
      const previous = bonusCaptures.get(s.chapterId);
      if (previous && previous.timer !== null && options.clearTimeout) options.clearTimeout(previous.timer);
      const pending = { timer: null }; bonusCaptures.set(s.chapterId, pending);
      const capture = () => {
        if (bonusCaptures.get(s.chapterId) !== pending) return;
        bonusCaptures.delete(s.chapterId);
        if (context === target && generation === current && key === profile()) enqueue(s, b, l);
      };
      if (options.setTimeout) pending.timer = options.setTimeout(capture, 1000); else capture();
    }
    function connectBridge(config) {
      if (!local || !enabled || !exact(config, ['classId', 'queueScope', 'rankingsEnabled', 'expiresAt', 'connectionId']) || !ID.test(config.classId) || !scopeValid(config.queueScope) || !/^[a-f0-9]{64}$/.test(config.connectionId) || typeof config.rankingsEnabled !== 'boolean' || !iso(config.expiresAt) || Date.parse(config.expiresAt) <= now()) throw new Error('BRIDGE_INVALID');
      if (context && context.connectionId === config.connectionId && context.classId === config.classId && context.queueScope === config.queueScope && session) { session.expiresAt = Date.parse(config.expiresAt); return; }
      resetIdentity(); session = { token: null, expiresAt: Date.parse(config.expiresAt), classes: [] };
      context = { classId: config.classId, queueScope: config.queueScope, rankingsEnabled: config.rankingsEnabled, connectionId: config.connectionId };
      message = 'Google 同步分頁已連線；請核對目前帳號與本機紀錄，勾選同意後開始同步。'; emit();
    }
    function bridgeState() {
      if (session && session.expiresAt <= now()) { resetIdentity(); message = '登入已到期，請重新登入同一帳號。'; emit(); }
      if (local || !session || session.expiresAt <= now() || !context || !consent) return null;
      return { classId: context.classId, queueScope: context.queueScope, rankingsEnabled: context.rankingsEnabled, expiresAt: new Date(session.expiresAt).toISOString(), connectionId: context.connectionId };
    }
    async function submitRemote(raw, expectedScope) {
      if (local || !consent || !context || expectedScope !== context.queueScope || typeof raw !== 'string' || raw.length > 3200000) throw new Error('ACCESS_DENIED');
      const p = JSON.parse(raw);
      if (p.classId !== context.classId || !UUID.test(p.eventId)) throw new Error('PAYLOAD_INVALID');
      // Scope and token are captured synchronously immediately before RPC. Account changes
      // cannot rebind an A payload to the new B token while state messages are in transit.
      const token = activeSession();
      if (!context || expectedScope !== context.queueScope || !consent) throw new Error('ACCESS_DENIED');
      let receipt;
      try { receipt = await rpc('classroomSubmitAttempt', [raw, token]); }
      catch (error) { if (session && session.token === token && authFailure(error)) { resetIdentity(); emit(); } throw error; }
      if (!validReceipt(receipt, p.eventId)) throw new Error('RECEIPT_INVALID');
      return receipt;
    }
    function clearJoined() { generation += 1; context = null; consent = false; clearCapture(); message = '班級選擇已變更，請重新核對班級並同意同步。'; emit(); }
    function attachBonus(ui) { bonus = ui; }
    function logout() { const oldToken = session && session.token; resetIdentity(); if (oldToken) Promise.resolve(rpc('endClassroomLogin', [oldToken])).catch(() => {}); message = '已清除本頁登入狀態。待同步紀錄保留，請自行匯出保管。'; emit(); }
    function retry() { entries.forEach(e => { if (e.status === 'pending' && context && e.queueScope === context.queueScope) e.nextTryAt = Math.min(e.nextTryAt, now()); }); nextGlobalAt = 0; emit(); }
    function exportQueue() { return JSON.stringify({ ...savedQueue(), ...(damagedRaw !== null ? { damagedRaw } : {}) }, null, 2); }
    function reportError(error) {
      const code = String(error && error.message);
      message = /OWNERSHIP_STORAGE_REQUIRED/.test(code) ? '無法安全保存本機紀錄與帳號的連結，暫不啟用同步。請保留遊戲備份並允許本機儲存後重試。' : /PROFILE_OWNER_CONFLICT/.test(code) ? '這份本機遊戲紀錄已連結另一帳號或班級。請登入原帳號，或先備份後建立新的遊戲紀錄。' : /PROFILE_REQUIRED/.test(code) ? '請先建立遊戲紀錄，再勾選同步同意。' : /SESSION|ACCESS_DENIED/.test(code) ? '登入無效或沒有此班級權限，請重新登入並請老師核對名冊。' : /POPUP_BLOCKED/.test(code) ? '同步視窗被瀏覽器阻擋，請允許此網站開啟彈出視窗後重試。' : '目前無法完成連線；待同步紀錄保留，可匯出備份。'; emit();
    }
    return Object.freeze({ state, beginLogin, pollLogin, join, setConsent, enqueue, pump, leaderboard, observeStore, observeBonus, attachBonus, clearJoined, connectBridge, bridgeState, submitRemote, logout, retry, exportQueue, reportError });
  }
  function installGameHooks(host, client) {
    const storePrototype = host.RPGStore && host.RPGStore.prototype;
    if (!storePrototype || storePrototype.__classroomHooked) return;
    Object.defineProperty(storePrototype, '__classroomHooked', { value: true });
    ['load', 'importJSON', 'newProfile', 'startChapter', 'updateState'].forEach(name => {
      const original = storePrototype[name];
      storePrototype[name] = function () {
        const before = name === 'startChapter' || name === 'updateState' ? this.save : null;
        const value = original.apply(this, arguments);
        try { client.observeStore(this, name, before, arguments[0], arguments[1]); } catch (error) { client.reportError(error); }
        return value;
      };
    });
    const bonusPrototype = host.RPGBonusUI && host.RPGBonusUI.prototype;
    if (bonusPrototype) {
      const ensure = bonusPrototype.ensure;
      bonusPrototype.ensure = function () { const result = ensure.apply(this, arguments); client.attachBonus(this); return result; };
      const original = bonusPrototype.apply;
      bonusPrototype.apply = function (result) { const accepted = original.apply(this, arguments); if (accepted && result.changed) { try { client.observeBonus(this); } catch (error) { client.reportError(error); } } return accepted; };
    }
  }
  function mount(document, host, bootstrap) {
    bootstrap = bootstrap || {};
    const $ = id => document.getElementById(id), status = $('class-sync-status');
    let client, polling = false, rankRequest = 0, priorView = '';
    function render(s) {
      status.textContent = s.message; $('class-sync-warning').textContent = s.storageWarning;
      $('class-sync-count').textContent = '請回原遊戲分頁查看待同步筆數與伺服器回執。';
      $('class-login').disabled = !s.enabled || s.loginPending;
      $('class-consent').disabled = !s.authenticated || !s.classId; $('class-consent').checked = s.consent;
      $('class-select').disabled = !s.authenticated; $('class-join').disabled = !s.authenticated;
      $('class-logout').disabled = !s.authenticated && !s.loginPending;
      $('class-ranking').disabled = !s.authenticated || !s.classId;
      $('class-retry').disabled = true; $('class-export').disabled = true;
      const view = JSON.stringify([s.authenticated, s.loginPending, s.classId, s.consent]);
      if (view !== priorView) { rankRequest += 1; $('class-ranking-list').replaceChildren(); priorView = view; }
      if (!s.loginPending) { $('class-auth-link').hidden = true; $('class-auth-link').removeAttribute('href'); }
      const select = $('class-select'), selected = select.value;
      select.replaceChildren(); s.classes.forEach(c => { const option = document.createElement('option'); option.value = c.id; option.textContent = c.label; select.append(option); });
      if (s.classes.some(c => c.id === selected)) select.value = selected;
      $('class-events').replaceChildren();
    }
    // No localStorage, game hooks or credentials in a DOM attribute on this page.
    client = createClient({ enabled: bootstrap.enabled === true, crypto: host.crypto, rpc: createRpc(host), onChange: render, setTimeout: host.setTimeout.bind(host), clearTimeout: host.clearTimeout.bind(host) });
    render(client.state());
    $('class-login').addEventListener('click', async () => {
      $('class-auth-link').hidden = true; $('class-auth-link').removeAttribute('href');
      try { const result = await client.beginLogin(); if (result && client.state().loginPending) { $('class-auth-link').href = result.authUrl; $('class-auth-link').hidden = false; } }
      catch (e) { client.reportError(e); }
    });
    $('class-select').addEventListener('change', () => client.clearJoined());
    $('class-join').addEventListener('click', () => client.join($('class-select').value).catch(client.reportError));
    $('class-consent').addEventListener('change', () => { try { client.setConsent($('class-consent').checked); } catch (e) { client.reportError(e); } });
    $('class-logout').addEventListener('click', () => client.logout());
    $('class-ranking').addEventListener('click', async () => {
      const list = $('class-ranking-list'), request = ++rankRequest; list.replaceChildren();
      try { const rows = await client.leaderboard($('class-metric').value); if (request !== rankRequest) return; rows.forEach(r => { const li = document.createElement('li'); li.textContent = r.rank + '. ' + r.nickname + ' · ' + r.score; list.append(li); }); if (!rows.length) list.textContent = '尚無班級探索紀錄。'; }
      catch (_) { if (request === rankRequest) list.textContent = '班級榜尚未啟用或目前無法取得。'; }
    });
    if (bootstrap.enabled === true) {
      const interval = host.setInterval(async () => {
        if (client.state().loginPending && !polling) { polling = true; try { await client.pollLogin(); } catch (e) { client.reportError(e); } finally { polling = false; } }
        client.bridgeState();
      }, 3000);
      host.addEventListener('pagehide', () => { host.clearInterval(interval); client.logout(); });
    }
    return client;
  }
  const BRIDGE_PROTOCOL = 'ndmu-ethics-classroom-bridge-v1';
  const GAME_ORIGIN = 'https://johnnychao.github.io';
  const EXEC_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXZwRVoQYSZNz_DkX5mDEbw2uO7gqsbxZuegByuPt9tOdnYaGcUIZCM-5jQRtk2Wlt/exec';
  const PINNED_BRIDGE_ORIGIN = 'https://n-t47dac2m5h2bd33ymboaztfpl5kw5ksd2ps5ekq-0lu-script.googleusercontent.com';
  function createBridgeTransport(host, config, onState) {
    if (!config || config.enabled !== true) throw new Error('CLASSROOM_DISABLED');
    // The deployed /exec is fixed. A changed Google iframe host must be explicitly
    // configured after verification; never accept a suffix match on incoming messages.
    const bridgeOrigin = config.bridgeOrigin;
    if (config.endpoint !== EXEC_ENDPOINT || typeof bridgeOrigin !== 'string' || !/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(bridgeOrigin) || new URL(bridgeOrigin).origin !== bridgeOrigin) throw new Error('BRIDGE_CONFIGURATION_INVALID');
    let popup = null, frame = null, challenge = null, generation = 0, joined = null;
    const pending = new Map();
    function closeRequests() { pending.forEach(p => { host.clearTimeout(p.timer); p.reject(new Error('BRIDGE_CLOSED')); }); pending.clear(); }
    function clearState() { closeRequests(); joined = null; onState(null); }
    function receive(event) {
      if (event.origin !== bridgeOrigin || !popup || popup.closed || !event.source || !plain(event.data)) return;
      let sourceIsPopup = false; try { sourceIsPopup = event.source.top === popup; } catch (_) {}
      const data = event.data;
      if (!sourceIsPopup || data.protocol !== BRIDGE_PROTOCOL || data.challenge !== challenge) return;
      if (data.type === 'ready') { if (frame !== event.source) { generation += 1; clearState(); frame = event.source; } return; }
      if (event.source !== frame) return;
      if (data.type === 'joined') {
        const s = data.state;
        if (!exact(s, ['classId', 'queueScope', 'rankingsEnabled', 'expiresAt', 'connectionId']) || !ID.test(s.classId) || !/^[A-Za-z0-9_-]{32,128}$/.test(s.queueScope) || !/^[a-f0-9]{64}$/.test(s.connectionId) || typeof s.rankingsEnabled !== 'boolean' || !iso(s.expiresAt)) return;
        if (!joined || joined.connectionId !== s.connectionId || joined.queueScope !== s.queueScope || joined.classId !== s.classId) { generation += 1; closeRequests(); }
        joined = clone(s); onState(clone(s)); return;
      }
      if (data.type === 'disconnected') { generation += 1; clearState(); return; }
      if (data.type !== 'result' || typeof data.requestId !== 'string') return;
      const p = pending.get(data.requestId); if (!p || p.generation !== generation) return;
      pending.delete(data.requestId); host.clearTimeout(p.timer);
      if (data.ok === true) p.resolve(data.result); else p.reject(new Error('BRIDGE_REQUEST_FAILED'));
    }
    host.addEventListener('message', receive);
    function open() {
      generation += 1; clearState(); frame = null; challenge = randomHex(host.crypto, 32);
      const url = new URL(EXEC_ENDPOINT); url.searchParams.set('mode', 'classroom'); url.searchParams.set('bridge', challenge);
      // Opener is deliberately retained for this exact-origin, nonce-bound channel.
      // Only the random bridge challenge enters the URL; no credentials or identities.
      popup = host.open(url.href, '_blank', 'popup,width=580,height=800');
      if (!popup) throw new Error('POPUP_BLOCKED');
      return true;
    }
    function rpc(method, args) {
      if (!['classroomSubmitAttempt', 'classroomLeaderboard'].includes(method) || !Array.isArray(args) || !joined || !frame || !popup || popup.closed) return Promise.reject(new Error('BRIDGE_CLOSED'));
      const expectedScope = method === 'classroomSubmitAttempt' ? args[2] : args[3];
      if (expectedScope !== joined.queueScope) return Promise.reject(new Error('SESSION_CHANGED'));
      const requestId = uuid(host.crypto), captured = generation;
      const safeArgs = method === 'classroomSubmitAttempt' ? [args[0], expectedScope] : [args[0], args[1], expectedScope];
      return new Promise((resolve, reject) => {
        const timer = host.setTimeout(() => { pending.delete(requestId); reject(new Error('RPC_TIMEOUT')); }, 35000);
        pending.set(requestId, { resolve, reject, timer, generation: captured });
        try { frame.postMessage({ protocol: BRIDGE_PROTOCOL, challenge, type: 'request', requestId, method, args: safeArgs }, bridgeOrigin); }
        catch (_) { pending.delete(requestId); host.clearTimeout(timer); reject(new Error('BRIDGE_CLOSED')); }
      });
    }
    function disconnect() {
      // Do not navigate a popup that may now show an unrelated page. This advisory
      // logout is sent only to the verified iframe, then the local channel is erased.
      if (frame && challenge) { try { frame.postMessage({ protocol: BRIDGE_PROTOCOL, challenge, type: 'disconnect' }, bridgeOrigin); } catch (_) {} }
      generation += 1; clearState(); frame = null; popup = null; challenge = null;
    }
    function check() { if (popup && popup.closed) { generation += 1; clearState(); popup = null; frame = null; challenge = null; } }
    return Object.freeze({ open, rpc, check, disconnect });
  }
  function installBridgeServer(host, client, bootstrap) {
    if (!bootstrap || bootstrap.enabled !== true || !/^[a-f0-9]{64}$/.test(bootstrap.bridge)) return null;
    let opener; try { opener = host.top.opener; } catch (_) { return null; }
    if (!opener) return null;
    const challenge = bootstrap.bridge;
    let connected = true;
    function send(type, data) { if (connected) { try { opener.postMessage({ protocol: BRIDGE_PROTOCOL, challenge, type, ...data }, GAME_ORIGIN); } catch (_) {} } }
    const inFlight = new Set();
    host.addEventListener('message', async event => {
      const d = event.data;
      let currentOpener; try { currentOpener = host.top.opener; } catch (_) { return; }
      if (!connected || event.origin !== GAME_ORIGIN || event.source !== opener || event.source !== currentOpener || !plain(d) || d.protocol !== BRIDGE_PROTOCOL || d.challenge !== challenge) return;
      if (d.type === 'disconnect') { client.logout(); publish(); connected = false; host.clearInterval(timer); return; }
      if (d.type !== 'request' || !UUID.test(d.requestId) || !Array.isArray(d.args) || inFlight.has(d.requestId) || inFlight.size >= 3) return;
      const bound = client.bridgeState();
      if (!bound) { send('result', { requestId: d.requestId, ok: false }); return; }
      inFlight.add(d.requestId);
      try {
        let result;
        // expected queueScope travels with each payload. Check it again in the
        // client immediately before dispatching the token-bearing Google RPC.
        if (d.method === 'classroomSubmitAttempt' && d.args.length === 2 && d.args[1] === bound.queueScope) result = await client.submitRemote(d.args[0], d.args[1]);
        else if (d.method === 'classroomLeaderboard' && d.args.length === 3 && d.args[0] === bound.classId && d.args[2] === bound.queueScope) result = await client.leaderboard(d.args[1], d.args[2]);
        else throw new Error('REQUEST_INVALID');
        send('result', { requestId: d.requestId, ok: true, result });
      } catch (_) { send('result', { requestId: d.requestId, ok: false }); }
      finally { inFlight.delete(d.requestId); }
    });
    function publish() {
      // Republish the complete small public state on every heartbeat: if the first
      // ready event arrives before window.open returns, later heartbeats recover.
      send('ready', {}); const state = client.bridgeState(); send(state ? 'joined' : 'disconnected', state ? { state } : {});
    }
    publish(); const timer = host.setInterval(publish, 2000);
    host.addEventListener('pagehide', () => { host.clearInterval(timer); send('disconnected', {}); connected = false; client.logout(); });
    return Object.freeze({ publish });
  }
  function mountPublic(document, host, config) {
    if (!config || config.enabled !== true) return null;
    const panel = document.createElement('section'); panel.className = 'classroom-receipt'; panel.id = 'classroom-auto-sync';
    function add(tag, text) { const n = document.createElement(tag); n.textContent = text; panel.append(n); return n; }
    add('h2', '全班遊戲紀錄同步');
    add('p', '遊戲留在原網站。Google 分頁只負責登入、私密收件及班級榜。全班同步保留遊戲紀錄，不自動列入出席；10/6 當堂提交仍用原收件流程。');
    const connect = add('button', '開啟 Google 同步分頁'), status = add('p', ''), count = add('p', ''), warning = add('p', ''); status.setAttribute('role', 'status'); warning.setAttribute('role', 'alert');
    const label = add('label', ''), check = document.createElement('input'); check.type = 'checkbox'; label.append(check, document.createTextNode('我同意將本機歷次及後續遊戲行動、反思與支線紀錄送交目前登入帳號所屬班級的老師，並在此裝置保留待同步備份。關閉同步可停止後續傳送；已收件資料不會因此刪除。'));
    const retry = add('button', '重試待同步紀錄'), exp = add('button', '匯出待同步備份'), area = add('textarea', ''); area.hidden = true; area.readOnly = true; area.setAttribute('aria-label', '待同步備份全文');
    const metric = document.createElement('select'); [['exploration','探索榜'],['collection','收藏榜'],['puzzle','解謎榜']].forEach(([value,text]) => { const o = document.createElement('option'); o.value = value; o.textContent = text; metric.append(o); }); panel.append(metric);
    const rank = add('button', '查看班級榜'), board = add('ol', ''), receipts = add('ol', ''); receipts.setAttribute('aria-label', '最近同步紀錄與回執');
    const logout = add('button', '中斷同步連線');
    const before = document.getElementById('classroom-receipt'); if (before) before.before(panel); else document.body.append(panel);
    let transport = null, storage = null, rankRequest = 0, priorView = ''; try { storage = host.localStorage; } catch (_) {}
    const client = createClient({ mode: 'public', enabled: config && config.enabled === true, crypto: host.crypto, storage, rpc: (m,a) => transport ? transport.rpc(m,a) : Promise.reject(new Error('BRIDGE_CLOSED')), setTimeout: host.setTimeout.bind(host), clearTimeout: host.clearTimeout.bind(host), onChange: render });
    function render(s) {
      status.textContent = s.message; warning.textContent = s.storageWarning + (s.profileConflict ? ' 目前本機遊戲紀錄屬於另一帳號或班級，請登入原帳號，或先備份後建立新的遊戲紀錄。' : '');
      count.textContent = '待確認 ' + s.pending + ' 筆 · 已收件 ' + s.synced + ' 筆' + (s.foreignPending ? '；其他帳號／班級待確認 ' + s.foreignPending + ' 筆' : '');
      check.disabled = !s.authenticated || !s.classId || s.profileConflict; check.checked = s.consent; connect.disabled = !s.enabled || !transport;
      retry.disabled = !s.consent; rank.disabled = !s.authenticated || !s.classId;
      const view = JSON.stringify([s.authenticated, s.classId, s.consent]); if (view !== priorView) { rankRequest += 1; board.replaceChildren(); priorView = view; }
      receipts.replaceChildren(); s.entries.slice(-20).reverse().forEach(e => { const li = document.createElement('li'); li.textContent = e.chapterId + ' · ' + e.eventId + ' · ' + (e.receipt ? e.receipt.serverReceivedAt + ' 已收件，待教師核實' : '待確認收件'); receipts.append(li); });
    }
    if (config && config.enabled === true) { try { transport = createBridgeTransport(host, config, state => { try { if (state) client.connectBridge(state); else client.logout(); } catch (e) { client.reportError(e); } }); } catch (e) { client.reportError(e); connect.disabled = true; } }
    installGameHooks(host, client); render(client.state());
    connect.addEventListener('click', () => { try { transport.open(); } catch (e) { client.reportError(e); } });
    check.addEventListener('change', () => { try { client.setConsent(check.checked); } catch (e) { client.reportError(e); } });
    retry.addEventListener('click', () => { client.retry(); client.pump(); });
    exp.addEventListener('click', () => { area.value = client.exportQueue(); area.hidden = false; area.focus(); area.select(); });
    rank.addEventListener('click', async () => { const request = ++rankRequest; board.replaceChildren(); try { const rows = await client.leaderboard(metric.value); if (request !== rankRequest) return; rows.forEach(r => { const li = document.createElement('li'); li.textContent = r.rank + '. ' + r.nickname + ' · ' + r.score; board.append(li); }); if (!rows.length) board.textContent = '尚無班級探索紀錄。'; } catch (_) { if (request === rankRequest) board.textContent = '班級榜尚未開啟或連線中斷。'; } });
    logout.addEventListener('click', () => { if (transport) transport.disconnect(); else client.logout(); });
    const timer = host.setInterval(() => { if (transport) transport.check(); client.pump(); }, 3000);
    host.addEventListener('pagehide', () => { host.clearInterval(timer); if (transport) transport.disconnect(); });
    host.addEventListener('beforeunload', event => { if (client.state().pending) { event.preventDefault(); event.returnValue = ''; } });
    return client;
  }

  return Object.freeze({ BRIDGE_PROTOCOL, GAME_ORIGIN, EXEC_ENDPOINT, PINNED_BRIDGE_ORIGIN, createBridgeTransport, installBridgeServer, mountPublic, STORAGE_KEY, createClient, createRpc, validReceipt, installGameHooks, mount });
}));
