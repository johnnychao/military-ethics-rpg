/* Teacher activation requires a verified collector and an explicit assigned chapter.
 * This public file must never contain a Sheet ID, secret, credential or student data.
 */
(function (root) {
  'use strict';
  const config = Object.freeze({
    enabled: false,
    collectorUrl: '',
    sessionId: '',
    assignedChapter: ''
  });
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.ClassroomConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
