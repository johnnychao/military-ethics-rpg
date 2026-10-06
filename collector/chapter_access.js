/** Trusted-time admission policy for the verified formal course only.
 * This is not a general class configuration or an attendance/grade policy.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../js/data/course_schedule'));
  else root.EthicsCourseAccess = factory(root.CourseSchedule);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (schedule) {
  'use strict';
  const CLASS_ID = 'military-ethics-2026-fall';
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function requireOpen(chapterId, now) {
    if (!schedule || typeof schedule.isOpen !== 'function' || !schedule.get(chapterId)) fail('CONFIGURATION_INVALID');
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('SERVER_CLOCK_INVALID');
    if (!schedule.isOpen(chapterId, now)) fail('CHAPTER_NOT_OPEN');
  }
  function checkClass(payload, now, previousBonusEnvelopes) {
    if (payload.classId !== CLASS_ID) return;
    requireOpen(payload.attempt.chapterId, now);
    if (payload.bonus === null) return;
    // Engine replay already validated the entire cumulative envelope. Client dates
    // cannot grandfather events. Only byte-equivalent, server-acknowledged events
    // in an integrity-checked history for this member/content version may carry on.
    const closed = payload.bonus.events.filter(event => !schedule.isOpen(event.chapterId, now));
    if (!closed.length) return;
    const previous = new Set();
    previousBonusEnvelopes().forEach(envelope => {
      if (envelope && envelope.contentVersion === payload.bonus.contentVersion && Array.isArray(envelope.events)) {
        envelope.events.forEach(event => previous.add(canonicalJson(event)));
      }
    });
    if (closed.some(event => !previous.has(canonicalJson(event)))) fail('CHAPTER_NOT_OPEN');
  }
  function canonicalJson(value) {
    function canonical(item) {
      if (Array.isArray(item)) return item.map(canonical);
      if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])]));
      return item;
    }
    return JSON.stringify(canonical(value));
  }
  function checkCollector(session, now) {
    // Only the verified D84 session naming for this schedule is in scope. A new
    // arbitrary class/session is not silently assigned this course's dates.
    if (!schedule || !schedule.entries) fail('CONFIGURATION_INVALID');
    const entry = Object.values(schedule.entries).find(item =>
      session.id === item.opensAt.slice(0, 10) + '-d84-26-' + item.id);
    if (!entry) return;
    if (entry.id !== session.chapterId) fail('SESSION_CONFIGURATION_INVALID');
    requireOpen(entry.id, now);
  }
  return Object.freeze({ CLASS_ID, checkClass, checkCollector });
}));
