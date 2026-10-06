/* Verified Google-login-only collector; 2026-10-06 u03 classroom session.
 * This public file must never contain a Sheet ID, secret, credential or student data.
 */
(function (root) {
  'use strict';
  const config = Object.freeze({
    enabled: true,
    collectorUrl: 'https://script.google.com/macros/s/AKfycbxXZwRVoQYSZNz_DkX5mDEbw2uO7gqsbxZuegByuPt9tOdnYaGcUIZCM-5jQRtk2Wlt/exec',
    sessionId: '2026-10-06-d84-26-u03',
    assignedChapter: 'u03'
  });
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.ClassroomConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
