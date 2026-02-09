// ==UserScript==
// @name         Gronkh.tv Wide Emote Fix
// @namespace    https://gronkh.tv/
// @version      0.1.0
// @description  Fix wide 7TV/BTTV/FFZ emotes to scale by height and keep aspect ratio.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'tm-gronkh-wide-emote-style';
  const EMOTE_CLASS = 'tm-wide-emote';
  const WRAP_CLASS = 'tm-wide-emote-wrap';

  const EMOTE_QUERY = [
    'img[src*="cdn.7tv.app/emote/"]',
    'img[src*="cdn.betterttv.net/emote/"]',
    'img[src*="cdn.frankerfacez.com/emote/"]'
  ].join(',');

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${WRAP_CLASS} {
        display: inline-flex !important;
        align-items: center !important;
        width: auto !important;
        max-width: none !important;
        min-width: 0 !important;
        flex: 0 0 auto !important;
        overflow: visible !important;
        vertical-align: middle !important;
      }

      .${WRAP_CLASS} .${EMOTE_CLASS} {
        position: relative !important;
        inset: auto !important;
        width: auto !important;
        height: 100% !important;
        max-height: 100% !important;
        max-width: none !important;
        object-fit: contain !important;
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }

  function markEmote(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains(EMOTE_CLASS)) return;
    img.classList.add(EMOTE_CLASS);

    const parent = img.parentElement;
    if (parent) parent.classList.add(WRAP_CLASS);
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(EMOTE_QUERY)) {
      markEmote(root);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(EMOTE_QUERY).forEach(markEmote);
    }
  }

  function init() {
    ensureStyle();
    scan(document.documentElement);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => scan(node));
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();
})();
