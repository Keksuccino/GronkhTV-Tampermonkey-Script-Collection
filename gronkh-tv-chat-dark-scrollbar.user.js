// ==UserScript==
// @name         gronkh.tv Chat Dark Scrollbar
// @namespace    https://gronkh.tv/
// @version      0.1.0
// @description  Replaces the chat’s bright scrollbar with a modern dark one.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CLASS = 'tm-gronkh-dark-scrollbar';
  const STYLE_ID = 'tm-gronkh-dark-scrollbar-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Firefox */
      .${CLASS} {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.28) rgba(0, 0, 0, 0.18);
      }

      /* Chromium/WebKit */
      .${CLASS}::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      .${CLASS}::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.18);
        border-radius: 999px;
      }
      .${CLASS}::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.22);
        border-radius: 999px;
        border: 2px solid rgba(0, 0, 0, 0.18);
        background-clip: padding-box;
      }
      .${CLASS}:hover::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.32);
      }
      .${CLASS}::-webkit-scrollbar-thumb:active {
        background: rgba(255, 255, 255, 0.40);
      }

      /* Optional: reduce the “white gap” some themes have beside the track */
      .${CLASS}::-webkit-scrollbar-corner {
        background: transparent;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function isScrollable(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
    return el.scrollHeight - el.clientHeight > 20;
  }

  function findNearestScrollableAncestor(el) {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      if (isScrollable(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function mark(el) {
    if (!el || !(el instanceof Element)) return;
    if (el.classList.contains(CLASS)) return;
    el.classList.add(CLASS);
  }

  function scan() {
    ensureStyle();

    // Known replay chat scroller
    document.querySelectorAll('grnk-chat-replay .cr-scroll-container').forEach(mark);

    // Fallback: locate the “Automatisch Scrollen” button and style its scroller ancestor.
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => {
      const text = (b.textContent || '').trim();
      return /Automatisch\\s+Scrollen/i.test(text) || b.classList.contains('cr-content-float-scroll');
    });
    for (const btn of btns) {
      const scrollEl = findNearestScrollableAncestor(btn);
      if (scrollEl) mark(scrollEl);
    }
  }

  // Boot + keep up with SPA changes.
  scan();
  let pending = false;
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      scan();
    }, 250);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();

