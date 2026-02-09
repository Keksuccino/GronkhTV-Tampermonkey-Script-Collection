// ==UserScript==
// @name         Gronkh.tv Replay Chat Offset
// @namespace    https://gronkh.tv/
// @version      0.1.0
// @description  Shift replay chat timing per stream with a persistent configurable offset.
// @match        https://gronkh.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'tmGronkhReplayChatOffsetByStreamV1';
  const STYLE_ID = 'tm-gronkh-replay-offset-style';
  const MENU_ITEM_CLASS = 'tm-replay-offset-menu-item';
  const MENU_VALUE_CLASS = 'tm-replay-offset-menu-value';

  let offsetByStream = loadOffsetMap();
  let lastHref = location.href;

  function loadOffsetMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};

      const sanitized = {};
      for (const [key, value] of Object.entries(parsed)) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) continue;
        const rounded = Math.round(numeric);
        if (rounded !== 0) sanitized[key] = rounded;
      }
      return sanitized;
    } catch (_) {
      return {};
    }
  }

  function saveOffsetMap() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offsetByStream));
  }

  function getStreamKeyFromPath(pathname) {
    if (typeof pathname !== 'string' || !pathname.length) return '/';
    const match = pathname.match(/^\/streams\/([^/?#]+)/);
    if (match) return '/streams/' + match[1];
    return pathname;
  }

  function getCurrentStreamKey() {
    return getStreamKeyFromPath(location.pathname);
  }

  function getOffsetForStream(streamKey) {
    const raw = offsetByStream[streamKey];
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric);
  }

  function getCurrentOffset() {
    return getOffsetForStream(getCurrentStreamKey());
  }

  function setCurrentOffset(seconds) {
    const streamKey = getCurrentStreamKey();
    if (!streamKey) return;

    const rounded = Math.round(seconds);
    if (!Number.isFinite(rounded) || rounded === 0) {
      delete offsetByStream[streamKey];
    } else {
      offsetByStream[streamKey] = rounded;
    }

    saveOffsetMap();
    refreshMenuItems();
  }

  function parseOffsetInput(rawInput) {
    const value = String(rawInput || '').trim();
    if (!value) return 0;

    const numericPattern = /^[+-]?\d+(?:[.,]\d+)?$/;
    if (numericPattern.test(value)) {
      return Math.round(Number(value.replace(',', '.')));
    }

    const sign = value.startsWith('-') ? -1 : 1;
    const cleaned = value.replace(/^[+-]/, '');
    const parts = cleaned.split(':');

    if (parts.length < 2 || parts.length > 3) return null;
    if (!parts.every((part) => /^\d+$/.test(part))) return null;

    const nums = parts.map((part) => Number(part));
    let seconds;

    if (nums.length === 2) {
      seconds = (nums[0] * 60) + nums[1];
    } else {
      seconds = (nums[0] * 3600) + (nums[1] * 60) + nums[2];
    }

    return sign * seconds;
  }

  function formatOffset(seconds) {
    const rounded = Math.round(seconds);
    if (rounded === 0) return '0:00';

    const sign = rounded > 0 ? '+' : '-';
    const abs = Math.abs(rounded);
    const hours = Math.floor(abs / 3600);
    const minutes = Math.floor((abs % 3600) / 60);
    const secs = abs % 60;

    if (hours > 0) {
      return sign + hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    return sign + minutes + ':' + String(secs).padStart(2, '0');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${MENU_ITEM_CLASS} {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        text-align: left;
      }

      .${MENU_VALUE_CLASS} {
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
    `;

    const styleHost = document.head || document.documentElement;
    if (styleHost) styleHost.appendChild(style);
  }

  function isReplaySettingsMenu(menu) {
    if (!(menu instanceof HTMLElement)) return false;
    const text = menu.textContent || '';
    return text.includes('Animierte Emotes') && text.includes('Zeitstempel');
  }

  function buildMenuItem() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = MENU_ITEM_CLASS;
    button.setAttribute('role', 'menuitem');

    const label = document.createElement('span');
    label.textContent = 'Replay Chat Offset';

    const value = document.createElement('span');
    value.className = MENU_VALUE_CLASS;

    button.appendChild(label);
    button.appendChild(value);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const current = getCurrentOffset();
      const message = [
        'Replay-Chat Offset fuer diesen Stream setzen.',
        'Positive Werte verzoegern den Chat (zeigen aeltere Nachrichten).',
        'Negative Werte ziehen den Chat vor (zeigen spaetere Nachrichten).',
        'Format: Sekunden oder mm:ss oder hh:mm:ss (z.B. 60, -90, 1:00, -5:00).',
        'Leer oder 0 setzt zurueck.'
      ].join('\n');

      const input = window.prompt(message, String(current));
      if (input === null) return;

      const parsed = parseOffsetInput(input);
      if (parsed === null) {
        window.alert('Ungueltiger Wert. Bitte Sekunden oder mm:ss/hh:mm:ss eingeben.');
        return;
      }

      const clamped = Math.max(-86400, Math.min(86400, parsed));
      setCurrentOffset(clamped);
    });

    return button;
  }

  function updateMenuItemLabel(button) {
    const valueEl = button.querySelector('.' + MENU_VALUE_CLASS);
    if (!valueEl) return;

    const offset = getCurrentOffset();
    valueEl.textContent = formatOffset(offset);
  }

  function ensureMenuItem(menu) {
    if (!isReplaySettingsMenu(menu)) return;

    let item = menu.querySelector('.' + MENU_ITEM_CLASS);
    if (!item) {
      item = buildMenuItem();
      menu.appendChild(item);
    }

    updateMenuItemLabel(item);
  }

  function scanForReplayMenus(root) {
    if (!(root instanceof Element)) return;

    if (root.matches('.context-menu')) {
      ensureMenuItem(root);
    }

    root.querySelectorAll('.context-menu').forEach((menu) => ensureMenuItem(menu));
  }

  function refreshMenuItems() {
    document.querySelectorAll('.' + MENU_ITEM_CLASS).forEach((node) => {
      if (node instanceof HTMLElement) updateMenuItemLabel(node);
    });
  }

  function clampTimestamp(timestamp, duration) {
    let next = timestamp;

    if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
      if (next < 0) next = 0;
      if (next > duration) next = duration;
      return next;
    }

    if (next < 0) return 0;
    return next;
  }

  function patchReplayWorkerPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    const replayPayload = payload.worker_chatreplay;
    const workerData = replayPayload && replayPayload.worker;
    if (!workerData || typeof workerData !== 'object') return payload;

    const timestamp = workerData.timestamp;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return payload;

    const offset = getCurrentOffset();
    if (!offset) return payload;

    const shifted = clampTimestamp(timestamp - offset, workerData.duration);
    if (shifted === timestamp) return payload;

    const nextWorkerData = Object.assign({}, workerData, { timestamp: shifted });
    const nextReplayPayload = Object.assign({}, replayPayload, { worker: nextWorkerData });
    return Object.assign({}, payload, { worker_chatreplay: nextReplayPayload });
  }

  function patchWorkerPostMessage() {
    if (!window.Worker) return;

    const marker = '__tmReplayOffsetPatched';
    if (Worker.prototype[marker]) return;

    const originalPostMessage = Worker.prototype.postMessage;

    Worker.prototype.postMessage = function (message, transfer) {
      const patched = patchReplayWorkerPayload(message);
      if (arguments.length > 1) {
        return originalPostMessage.call(this, patched, transfer);
      }
      return originalPostMessage.call(this, patched);
    };

    Object.defineProperty(Worker.prototype, marker, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }

  function startObservers() {
    ensureStyle();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scanForReplayMenus(node);
        });
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    scanForReplayMenus(document.documentElement);

    window.setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        refreshMenuItems();
      }
    }, 500);
  }

  patchWorkerPostMessage();
  startObservers();
})();
