/* Hook before RPGApp initializes; leave the existing game completely untouched while disabled. */
(function (root) {
  'use strict';
  const config = root.ClassroomSyncConfig;
  if (!config || config.enabled !== true) return;
  if (!root.EthicsClassroomClient || !root.document) return;
  try { root.EthicsClassroomClient.mountPublic(root.document, root, config); }
  catch (_) {
    const status = root.document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = '班級同步暫時無法啟動；遊戲仍可使用，請保留本機備份。';
    root.document.body.append(status);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
