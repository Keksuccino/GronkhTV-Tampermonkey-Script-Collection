// ==UserScript==
// @name         Gronkh.tv Stream Auto-Play
// @namespace    https://gronkh.tv/
// @version      0.2.0
// @description  Auto-plays the stream video on page load when the tab is active.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STREAM_PATH_RE = /^\/streams?\/\d+\/?$/;
  const MAX_ATTEMPTS = 120;
  const ATTEMPT_INTERVAL_MS = 500;

  let attempts = 0;
  let intervalId = null;
  let observer = null;
  let videoObserver = null;
  let videoEl = null;
  let hasAttempted = false;
  let allowAutoplay = false;

  function isTabActive() {
    return document.visibilityState === 'visible';
  }

  function isStreamPage() {
    return STREAM_PATH_RE.test(window.location.pathname);
  }

  function findVideo() {
    return document.querySelector('grui-video video');
  }

  function findPlayButton() {
    const host = document.querySelector('grui-video');
    if (!host) return null;
    const buttons = host.querySelectorAll('button');
    for (const button of buttons) {
      const label = (button.getAttribute('aria-label') || '').toLowerCase();
      const text = (button.textContent || '').toLowerCase();
      if (label.includes('fortsetzen') || label.includes('play') || text.includes('play_arrow')) {
        return button;
      }
    }
    return null;
  }

  function isVideoReady(video) {
    if (!video) return false;
    if (video.readyState >= 2) return true;
    if (video.currentSrc) return true;
    if (video.getAttribute('src')) return true;
    const source = video.querySelector('source[src]');
    return Boolean(source && source.getAttribute('src'));
  }

  function cleanup() {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (videoObserver) {
      videoObserver.disconnect();
      videoObserver = null;
    }
    if (videoEl) {
      videoEl.removeEventListener('loadedmetadata', attemptPlay);
      videoEl.removeEventListener('canplay', attemptPlay);
      videoEl.removeEventListener('canplaythrough', attemptPlay);
      videoEl = null;
    }
    document.removeEventListener('visibilitychange', attemptPlay);
  }

  function attemptPlay() {
    if (hasAttempted || !allowAutoplay) return;
    if (!isTabActive()) return;

    const video = findVideo();
    if (!video) return;
    if (!isVideoReady(video)) return;

    if (!video.paused) {
      hasAttempted = true;
      cleanup();
      return;
    }
    hasAttempted = true;
    cleanup();

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        const button = findPlayButton();
        if (button) button.click();
      });
    }
  }

  function scheduleAttempts() {
    if (intervalId !== null) return;
    intervalId = window.setInterval(() => {
      if (!isTabActive()) return;
      attempts += 1;
      attemptPlay();
      if (hasAttempted || attempts >= MAX_ATTEMPTS) {
        cleanup();
      }
    }, ATTEMPT_INTERVAL_MS);
  }

  function watchForVideo() {
    observer = new MutationObserver(() => {
      const video = findVideo();
      if (video) attachVideoWatchers(video);
      attemptPlay();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function attachVideoWatchers(video) {
    if (!video || videoEl === video) return;
    if (videoEl) {
      videoEl.removeEventListener('loadedmetadata', attemptPlay);
      videoEl.removeEventListener('canplay', attemptPlay);
      videoEl.removeEventListener('canplaythrough', attemptPlay);
    }
    videoEl = video;
    videoEl.addEventListener('loadedmetadata', attemptPlay);
    videoEl.addEventListener('canplay', attemptPlay);
    videoEl.addEventListener('canplaythrough', attemptPlay);
    if (!videoObserver) {
      videoObserver = new MutationObserver(() => {
        attemptPlay();
      });
      videoObserver.observe(videoEl, { childList: true, subtree: true, attributes: true });
    }
  }

  function init() {
    if (!isStreamPage()) return;
    allowAutoplay = isTabActive();
    if (!allowAutoplay) return;
    document.addEventListener('visibilitychange', attemptPlay);
    const video = findVideo();
    if (video) attachVideoWatchers(video);
    attemptPlay();
    scheduleAttempts();
    watchForVideo();
  }

  init();
})();
