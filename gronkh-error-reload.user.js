// ==UserScript==
// @name         Gronkh.tv Error Auto-Reload
// @namespace    https://gronkh.tv/
// @version      0.1.0
// @description  Reloads the page when the Gronkh.tv error info box appears.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ERROR_BOX_SELECTOR = 'grnk-info-box[type="error"]';
  const RELOAD_COOLDOWN_MS = 15000;
  const STORAGE_KEY = 'tmGronkhErrorReloadLast';

  let reloadScheduled = false;

  function canReloadNow() {
    const lastRaw = sessionStorage.getItem(STORAGE_KEY);
    const lastTime = lastRaw ? Number(lastRaw) : 0;
    const now = Date.now();
    if (now - lastTime < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(STORAGE_KEY, String(now));
    return true;
  }

  function scheduleReload() {
    if (reloadScheduled) return;
    reloadScheduled = true;
    if (!canReloadNow()) return;
    window.setTimeout(() => {
      window.location.reload();
    }, 250);
  }

  function checkForErrorBox() {
    if (document.querySelector(ERROR_BOX_SELECTOR)) {
      scheduleReload();
    }
  }

  function watchDom() {
    const observer = new MutationObserver(() => {
      checkForErrorBox();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    checkForErrorBox();
  }

  watchDom();
})();
