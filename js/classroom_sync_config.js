/* Authorized classroom integration. Never add student data, Sheet IDs, secrets, or tokens here. */
(function (root) {
  'use strict';
  const config = Object.freeze({
    enabled: true,
    endpoint: 'https://script.google.com/macros/s/AKfycbxXZwRVoQYSZNz_DkX5mDEbw2uO7gqsbxZuegByuPt9tOdnYaGcUIZCM-5jQRtk2Wlt/exec',
    bridgeOrigin: 'https://n-t47dac2m5h2bd33ymboaztfpl5kw5ksd2ps5ekq-0lu-script.googleusercontent.com'
  });
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.ClassroomSyncConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
