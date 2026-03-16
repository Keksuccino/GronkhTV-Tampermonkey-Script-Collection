// ==UserScript==
// @name         Gronkh.tv Watch History
// @namespace    https://gronkh.tv/
// @version      0.1.0
// @description  Adds a persistent watch history for streams and opens it from the user menu.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'tmGronkhWatchHistoryV1';
  const STYLE_ID = 'tm-gronkh-watch-history-style';
  const MODAL_ID = 'tm-gronkh-watch-history-modal';
  const MENU_ITEM_ATTR = 'data-tm-watch-history-item';
  const MENU_ITEM_CLASS = 'tm-gronkh-watch-history-menu-item';
  const MENU_COUNT_CLASS = 'tm-gronkh-watch-history-menu-count';
  const STREAM_PATH_RE = /^\/streams\/(\d+)\/?$/;
  const HISTORY_LIMIT = 200;
  const MIN_WATCH_SECONDS = 8;
  const SAVE_PROGRESS_INTERVAL_MS = 15000;

  const state = {
    history: loadHistory(),
    currentStreamId: null,
    currentStreamTitle: '',
    currentStreamUrl: '',
    currentStreamImageUrl: '',
    currentVideo: null,
    loggedCurrentStream: false,
    playedSeconds: 0,
    lastMediaTime: null,
    lastProgressSaveTs: 0,
    pollId: null,
    lastHref: location.href,
  };

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function loadHistory() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeJsonParse(raw, []);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => sanitizeHistoryEntry(entry))
      .filter(Boolean)
      .sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0))
      .slice(0, HISTORY_LIMIT);
  }

  function sanitizeHistoryEntry(entry) {
    const streamId = String(entry.streamId || '').trim();
    if (!streamId) return null;

    const watchedAt = Number(entry.watchedAt);
    const firstWatchedAt = Number(entry.firstWatchedAt);
    const duration = Number(entry.duration);
    const lastPosition = Number(entry.lastPosition);
    const viewCount = Number(entry.viewCount);

    return {
      streamId,
      url: normalizeStreamUrl(entry.url, streamId),
      title: cleanTitle(String(entry.title || '')) || `Stream ${streamId}`,
      watchedAt: Number.isFinite(watchedAt) ? watchedAt : Date.now(),
      firstWatchedAt: Number.isFinite(firstWatchedAt) ? firstWatchedAt : (Number.isFinite(watchedAt) ? watchedAt : Date.now()),
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
      lastPosition: Number.isFinite(lastPosition) && lastPosition >= 0 ? Math.round(lastPosition) : 0,
      imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : '',
      viewCount: Number.isFinite(viewCount) && viewCount > 0 ? Math.round(viewCount) : 1,
    };
  }

  function saveHistory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
    refreshMenuItemCount();
    if (isModalOpen()) renderModal();
  }

  function normalizeStreamUrl(url, streamId) {
    const fallback = `${location.origin}/streams/${streamId}`;
    if (typeof url !== 'string' || !url.trim()) return fallback;
    try {
      const resolved = new URL(url, location.origin);
      resolved.search = '';
      resolved.hash = '';
      return resolved.href;
    } catch (_) {
      return fallback;
    }
  }

  function getStreamIdFromPath(pathname) {
    const match = String(pathname || '').match(STREAM_PATH_RE);
    return match ? match[1] : null;
  }

  function getCurrentStreamId() {
    return getStreamIdFromPath(location.pathname);
  }

  function findVideo() {
    return document.querySelector('grui-video video');
  }

  function cleanTitle(rawTitle) {
    return String(rawTitle || '')
      .replace(/\s+[—-]\s+GronkhTV\s*-\s*Alle Streams an einem Ort\s*$/i, '')
      .replace(/\s+[|]\s*GronkhTV.*$/i, '')
      .trim();
  }

  function getCurrentTitle() {
    const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const heading =
      document.querySelector('grnk-stream h1')?.textContent ||
      document.querySelector('main h1')?.textContent ||
      document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
      document.title;

    return cleanTitle(metaTitle || heading) || `Stream ${getCurrentStreamId() || ''}`.trim();
  }

  function getCurrentImageUrl() {
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (!ogImage) return '';
    try {
      return new URL(ogImage, location.origin).href;
    } catch (_) {
      return '';
    }
  }

  function resetCurrentStreamSnapshot() {
    state.currentStreamTitle = '';
    state.currentStreamUrl = '';
    state.currentStreamImageUrl = '';
  }

  function refreshCurrentStreamSnapshot() {
    const streamId = state.currentStreamId || getCurrentStreamId();
    if (!streamId) return;

    state.currentStreamUrl = `${location.origin}/streams/${streamId}`;

    if (getCurrentStreamId() !== streamId) return;

    const title = getCurrentTitle();
    if (title) state.currentStreamTitle = title;

    const imageUrl = getCurrentImageUrl();
    if (imageUrl) state.currentStreamImageUrl = imageUrl;
  }

  function getCurrentStreamMeta() {
    const streamId = state.currentStreamId || getCurrentStreamId();
    if (!streamId) return null;
    refreshCurrentStreamSnapshot();

    const video = state.currentVideo;
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null;
    const lastPosition = video && Number.isFinite(video.currentTime) && video.currentTime >= 0 ? Math.round(video.currentTime) : 0;

    return {
      streamId,
      url: normalizeStreamUrl(state.currentStreamUrl, streamId),
      title: state.currentStreamTitle || `Stream ${streamId}`,
      imageUrl: state.currentStreamImageUrl || '',
      duration,
      lastPosition,
    };
  }

  function upsertHistoryEntry(meta, options) {
    if (!meta || !meta.streamId) return;

    const opts = options || {};
    const nowTs = Number.isFinite(opts.watchedAt) ? opts.watchedAt : Date.now();
    const existingIndex = state.history.findIndex((entry) => entry.streamId === meta.streamId);
    const existing = existingIndex >= 0 ? state.history[existingIndex] : null;
    const nextEntry = {
      streamId: meta.streamId,
      url: normalizeStreamUrl(meta.url, meta.streamId),
      title: cleanTitle(meta.title) || existing?.title || `Stream ${meta.streamId}`,
      watchedAt: nowTs,
      firstWatchedAt: existing?.firstWatchedAt || nowTs,
      duration: Number.isFinite(meta.duration) && meta.duration > 0 ? Math.round(meta.duration) : (existing?.duration || null),
      lastPosition: Number.isFinite(meta.lastPosition) && meta.lastPosition >= 0 ? Math.round(meta.lastPosition) : (existing?.lastPosition || 0),
      imageUrl: meta.imageUrl || existing?.imageUrl || '',
      viewCount: (existing?.viewCount || 0) + (opts.bumpViewCount ? 1 : 0),
    };

    if (!nextEntry.viewCount) nextEntry.viewCount = 1;

    if (existingIndex >= 0) {
      state.history.splice(existingIndex, 1);
    }

    state.history.unshift(nextEntry);
    if (state.history.length > HISTORY_LIMIT) {
      state.history.length = HISTORY_LIMIT;
    }

    saveHistory();
  }

  function formatDuration(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
    const rounded = Math.round(totalSeconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const seconds = rounded % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDate(timestamp) {
    if (!Number.isFinite(timestamp)) return 'Unbekannt';
    try {
      return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(timestamp));
    } catch (_) {
      return new Date(timestamp).toLocaleString();
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
      }

      #${MODAL_ID}[data-open="1"] {
        display: block;
      }

      #${MODAL_ID} .tm-wh-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.68);
        backdrop-filter: blur(4px);
      }

      #${MODAL_ID} .tm-wh-panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(960px, calc(100vw - 24px));
        max-height: min(82vh, 860px);
        display: flex;
        flex-direction: column;
        color: #f6f3ff;
        background:
          radial-gradient(1400px 420px at 12% -10%, rgba(103, 180, 255, 0.18), transparent 60%),
          radial-gradient(900px 360px at 110% 0%, rgba(107, 74, 198, 0.24), transparent 58%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0)),
          rgba(16, 18, 27, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        overflow: hidden;
        box-shadow:
          0 28px 90px rgba(0, 0, 0, 0.58),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        font: inherit;
      }

      #${MODAL_ID} .tm-wh-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 16px 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0));
      }

      #${MODAL_ID} .tm-wh-title-wrap {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
      }

      #${MODAL_ID} .tm-wh-icon-chip {
        width: 38px;
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: rgba(103, 180, 255, 0.12);
        border: 1px solid rgba(103, 180, 255, 0.24);
        color: #cbe3ff;
        flex: 0 0 auto;
      }

      #${MODAL_ID} .tm-wh-title {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      #${MODAL_ID} .tm-wh-subtitle {
        color: rgba(246, 243, 255, 0.7);
        font-size: 12px;
        margin-top: 2px;
      }

      #${MODAL_ID} .tm-wh-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      #${MODAL_ID} .tm-wh-btn {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        padding: 8px 12px;
        cursor: pointer;
        font: inherit;
      }

      #${MODAL_ID} .tm-wh-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      #${MODAL_ID} .tm-wh-btn.tm-danger {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.32);
      }

      #${MODAL_ID} .tm-wh-body {
        padding: 16px 18px 18px;
        overflow: auto;
      }

      #${MODAL_ID} .tm-wh-list {
        display: grid;
        gap: 12px;
      }

      #${MODAL_ID} .tm-wh-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      #${MODAL_ID} .tm-wh-card:hover {
        background: rgba(255, 255, 255, 0.065);
        border-color: rgba(103, 180, 255, 0.2);
      }

      #${MODAL_ID} .tm-wh-card-main {
        min-width: 0;
      }

      #${MODAL_ID} .tm-wh-card-title {
        font-weight: 700;
        line-height: 1.35;
        word-break: break-word;
      }

      #${MODAL_ID} .tm-wh-card-meta,
      #${MODAL_ID} .tm-wh-card-progress {
        color: rgba(246, 243, 255, 0.72);
        font-size: 12px;
        line-height: 1.45;
        margin-top: 4px;
      }

      #${MODAL_ID} .tm-wh-open {
        appearance: none;
        border: 1px solid rgba(103, 180, 255, 0.28);
        border-radius: 12px;
        background: rgba(103, 180, 255, 0.12);
        color: #d6e7ff;
        padding: 8px 12px;
        cursor: pointer;
        font: inherit;
        white-space: nowrap;
      }

      #${MODAL_ID} .tm-wh-open:hover {
        background: rgba(103, 180, 255, 0.18);
      }

      #${MODAL_ID} .tm-wh-empty {
        padding: 28px 18px;
        border-radius: 16px;
        border: 1px dashed rgba(255, 255, 255, 0.14);
        color: rgba(246, 243, 255, 0.72);
        text-align: center;
        background: rgba(255, 255, 255, 0.025);
      }

      .${MENU_ITEM_CLASS} {
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .${MENU_ITEM_CLASS} .tm-wh-menu-main {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        min-width: 0;
      }

      .${MENU_ITEM_CLASS} .tm-wh-menu-main svg {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .${MENU_COUNT_CLASS} {
        flex: 0 0 auto;
        min-width: 1.8em;
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        background: rgba(103, 180, 255, 0.16);
        border: 1px solid rgba(103, 180, 255, 0.22);
        color: #d3e7ff;
        font-size: 11px;
        line-height: 1.2;
        text-align: center;
      }

      .${MENU_COUNT_CLASS}[data-empty="1"] {
        display: none;
      }

      @media (max-width: 680px) {
        #${MODAL_ID} .tm-wh-panel {
          width: min(100vw - 16px, 960px);
          max-height: min(90vh, 960px);
        }

        #${MODAL_ID} .tm-wh-card {
          grid-template-columns: 1fr;
        }

        #${MODAL_ID} .tm-wh-open {
          width: 100%;
        }
      }
    `;

    const styleHost = document.head || document.documentElement;
    if (styleHost) styleHost.appendChild(style);
  }

  function ensureModal() {
    ensureStyle();

    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('data-open', '0');
    modal.innerHTML = `
      <div class="tm-wh-backdrop"></div>
      <div class="tm-wh-panel" role="dialog" aria-modal="true" aria-label="Watch History">
        <div class="tm-wh-header">
          <div class="tm-wh-title-wrap">
            <div class="tm-wh-icon-chip" aria-hidden="true">${clockIcon()}</div>
            <div>
              <div class="tm-wh-title">Watch History</div>
              <div class="tm-wh-subtitle">Wird lokal im Browser gespeichert.</div>
            </div>
          </div>
          <div class="tm-wh-actions">
            <button type="button" class="tm-wh-btn tm-danger" data-action="clear">Verlauf leeren</button>
            <button type="button" class="tm-wh-btn" data-action="close">Schliessen</button>
          </div>
        </div>
        <div class="tm-wh-body"></div>
      </div>
    `;

    document.documentElement.appendChild(modal);

    modal.querySelector('.tm-wh-backdrop')?.addEventListener('click', closeModal);
    modal.querySelector('[data-action="close"]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-action="clear"]')?.addEventListener('click', clearHistory);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!isModalOpen()) return;
      closeModal();
    });

    return modal;
  }

  function isModalOpen() {
    return document.getElementById(MODAL_ID)?.getAttribute('data-open') === '1';
  }

  function openModal() {
    const modal = ensureModal();
    renderModal();
    modal.setAttribute('data-open', '1');
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.setAttribute('data-open', '0');
  }

  function renderModal() {
    const modal = ensureModal();
    const body = modal.querySelector('.tm-wh-body');
    if (!body) return;

    if (!state.history.length) {
      body.innerHTML = `
        <div class="tm-wh-empty">
          Noch keine Streams im Verlauf. Ein Stream wird gespeichert, sobald das Video kurz abgespielt wurde.
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="tm-wh-list">
        ${state.history
          .map((entry) => {
            const progress = entry.duration
              ? `Zuletzt bei ${formatDuration(entry.lastPosition)} / ${formatDuration(entry.duration)}`
              : `Zuletzt bei ${formatDuration(entry.lastPosition)}`;
            const views = entry.viewCount > 1 ? ` • ${entry.viewCount}x angesehen` : '';
            return `
              <div class="tm-wh-card">
                <div class="tm-wh-card-main">
                  <div class="tm-wh-card-title">${escapeHtml(entry.title)}</div>
                  <div class="tm-wh-card-meta">Folge ${escapeHtml(entry.streamId)} • ${escapeHtml(formatDate(entry.watchedAt))}${views}</div>
                  <div class="tm-wh-card-progress">${escapeHtml(progress)}</div>
                </div>
                <button type="button" class="tm-wh-open" data-open-url="${escapeHtml(entry.url)}">Stream oeffnen</button>
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    body.querySelectorAll('[data-open-url]').forEach((button) => {
      button.addEventListener('click', () => {
        const url = button.getAttribute('data-open-url');
        if (!url) return;
        closeModal();
        window.location.assign(url);
      });
    });
  }

  function clearHistory() {
    if (!state.history.length) return;

    const confirmed = window.confirm('Gesamten Watch History Verlauf loeschen?');
    if (!confirmed) return;

    state.history = [];
    saveHistory();
    renderModal();
  }

  function clockIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5"></circle>
        <path d="M12 7.5v5l3.5 2"></path>
      </svg>
    `;
  }

  function refreshMenuItemCount() {
    document.querySelectorAll('.' + MENU_COUNT_CLASS).forEach((node) => {
      node.textContent = state.history.length ? String(Math.min(state.history.length, HISTORY_LIMIT)) : '';
      node.setAttribute('data-empty', state.history.length ? '0' : '1');
    });
  }

  function cleanupInteractiveClone(node) {
    node.removeAttribute('id');
    node.removeAttribute('href');
    node.removeAttribute('routerlink');
    node.removeAttribute('ng-reflect-router-link');
    node.removeAttribute('target');
    node.removeAttribute('download');
    node.removeAttribute('disabled');
    node.removeAttribute('aria-disabled');
    node.removeAttribute('data-disabled');
  }

  function buildMenuItem(sampleItem, sampleWrapper) {
    const interactive = sampleItem.cloneNode(false);
    cleanupInteractiveClone(interactive);
    if (interactive.tagName === 'A') {
      interactive.setAttribute('href', '#');
    } else if (interactive.tagName === 'BUTTON') {
      interactive.type = 'button';
    }

    interactive.setAttribute(MENU_ITEM_ATTR, '1');
    interactive.classList.add(MENU_ITEM_CLASS);
    interactive.innerHTML = `
      <span class="tm-wh-menu-main">
        ${clockIcon()}
        <span>Watch History</span>
      </span>
      <span class="${MENU_COUNT_CLASS}" data-empty="${state.history.length ? '0' : '1'}">${state.history.length ? state.history.length : ''}</span>
    `;
    interactive.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTimeout(openModal, 0);
    });

    if (!sampleWrapper) return interactive;

    const wrapper = sampleWrapper.cloneNode(false);
    wrapper.removeAttribute('id');
    wrapper.appendChild(interactive);
    return wrapper;
  }

  function ensureMenuItem() {
    const logoutLink = Array.from(document.querySelectorAll('a[href="/logout"], a[href$="/logout"]')).find((node) => node instanceof Element);
    if (!logoutLink) return;

    const sampleItem = logoutLink.closest('a, button, [role="menuitem"], .cdk-menu-item') || logoutLink;
    const parent = sampleItem.parentElement;
    if (!parent) return;

    const useWrapper =
      parent.children.length === 1 &&
      parent.parentElement &&
      !parent.matches('nav, [role="menu"], .cdk-menu, .context-menu, [popover]');

    const referenceNode = useWrapper ? parent : sampleItem;
    const container = referenceNode.parentElement;
    if (!container) return;
    if (container.querySelector(`[${MENU_ITEM_ATTR}]`)) {
      refreshMenuItemCount();
      return;
    }

    const item = buildMenuItem(sampleItem, useWrapper ? parent : null);
    container.insertBefore(item, referenceNode);
    refreshMenuItemCount();
  }

  function resetPlaybackState() {
    state.loggedCurrentStream = false;
    state.playedSeconds = 0;
    state.lastMediaTime = null;
    state.lastProgressSaveTs = 0;
  }

  function detachCurrentVideo() {
    commitProgress(false);

    if (state.currentVideo) {
      state.currentVideo.removeEventListener('playing', onVideoPlaying);
      state.currentVideo.removeEventListener('timeupdate', onVideoTimeUpdate);
      state.currentVideo.removeEventListener('pause', onVideoPause);
      state.currentVideo.removeEventListener('ended', onVideoEnded);
      state.currentVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
      state.currentVideo.removeEventListener('seeked', onVideoSeeked);
    }

    state.currentVideo = null;
    resetPlaybackState();
  }

  function attachVideoIfNeeded() {
    const streamId = getCurrentStreamId();
    if (!streamId) {
      detachCurrentVideo();
      state.currentStreamId = null;
      resetCurrentStreamSnapshot();
      return;
    }

    if (state.currentStreamId !== streamId) {
      detachCurrentVideo();
      state.currentStreamId = streamId;
      resetCurrentStreamSnapshot();
    }
    refreshCurrentStreamSnapshot();

    const video = findVideo();
    if (!video) return;
    if (video === state.currentVideo) return;

    detachCurrentVideo();
    state.currentStreamId = streamId;
    state.currentVideo = video;

    video.addEventListener('playing', onVideoPlaying);
    video.addEventListener('timeupdate', onVideoTimeUpdate);
    video.addEventListener('pause', onVideoPause);
    video.addEventListener('ended', onVideoEnded);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onVideoSeeked);
  }

  function onLoadedMetadata() {
    refreshCurrentStreamSnapshot();
    if (state.loggedCurrentStream) {
      maybePersistCurrentStream(false);
    }
  }

  function onVideoPlaying() {
    if (!state.currentVideo) return;
    state.lastMediaTime = Number.isFinite(state.currentVideo.currentTime) ? state.currentVideo.currentTime : 0;
  }

  function onVideoSeeked() {
    if (!state.currentVideo) return;
    state.lastMediaTime = Number.isFinite(state.currentVideo.currentTime) ? state.currentVideo.currentTime : state.lastMediaTime;
  }

  function onVideoTimeUpdate() {
    const video = state.currentVideo;
    if (!video) return;

    const nowTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const lastTime = Number.isFinite(state.lastMediaTime) ? state.lastMediaTime : nowTime;
    const delta = nowTime - lastTime;
    state.lastMediaTime = nowTime;

    if (delta > 0 && delta < 4 && !video.seeking && !video.paused) {
      state.playedSeconds += Math.min(delta, 1.5);
    }

    if (!state.loggedCurrentStream && state.playedSeconds >= MIN_WATCH_SECONDS) {
      maybePersistCurrentStream(true);
      state.loggedCurrentStream = true;
      state.lastProgressSaveTs = Date.now();
      return;
    }

    if (state.loggedCurrentStream && Date.now() - state.lastProgressSaveTs >= SAVE_PROGRESS_INTERVAL_MS) {
      maybePersistCurrentStream(false);
      state.lastProgressSaveTs = Date.now();
    }
  }

  function onVideoPause() {
    commitProgress(false);
  }

  function onVideoEnded() {
    commitProgress(false);
  }

  function maybePersistCurrentStream(bumpViewCount) {
    const meta = getCurrentStreamMeta();
    if (!meta) return;
    upsertHistoryEntry(meta, { bumpViewCount });
  }

  function commitProgress(bumpViewCount) {
    if (!state.currentStreamId || !state.currentVideo) return;
    if (!state.loggedCurrentStream && !bumpViewCount) return;
    maybePersistCurrentStream(bumpViewCount);
    state.lastProgressSaveTs = Date.now();
  }

  function handleRouteChange() {
    if (location.href === state.lastHref) return;
    state.lastHref = location.href;
    attachVideoIfNeeded();
  }

  function scheduleMenuInjection() {
    window.setTimeout(() => ensureMenuItem(), 0);
    window.setTimeout(() => ensureMenuItem(), 120);
    window.setTimeout(() => ensureMenuItem(), 350);
  }

  function installMenuTriggerListener() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        const trigger = target.closest('button[aria-label*="Nutzermenü"], button[title*="Nutzermenü"]');
        if (!trigger) return;

        scheduleMenuInjection();
      },
      true,
    );
  }

  function startPolling() {
    if (state.pollId !== null) return;
    state.pollId = window.setInterval(() => {
      handleRouteChange();
      attachVideoIfNeeded();
    }, 1000);
  }

  function init() {
    ensureStyle();
    attachVideoIfNeeded();
    installMenuTriggerListener();
    startPolling();

    window.addEventListener('pagehide', () => commitProgress(false));
    window.addEventListener('beforeunload', () => commitProgress(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        commitProgress(false);
      }
    });

    refreshMenuItemCount();
  }

  init();
})();
