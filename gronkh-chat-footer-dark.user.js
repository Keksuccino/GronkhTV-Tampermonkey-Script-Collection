// ==UserScript==
// @name         Gronkh.tv Darker Chat Footer
// @namespace    https://gronkh.tv/
// @version      0.1.0
// @description  Darken the chat footer/controls area to match the chat theme.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'tm-gronkh-chat-footer-dark-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      grnk-chat-replay .cr-controls {
        position: relative !important;
        background: rgba(14, 12, 26, 0.88) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
      }

      grnk-chat-replay .cr-controls::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.0) 0%, rgba(0, 0, 0, 0.18) 100%);
        border-radius: inherit;
      }
    `;
    document.head.appendChild(style);
  }

  ensureStyle();
})();
