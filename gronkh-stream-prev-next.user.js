// ==UserScript==
// @name         Gronkh.tv Stream Prev/Next Buttons
// @namespace    https://gronkh.tv/
// @version      0.1.0
// @description  Adds previous/next stream buttons to the Aufrufe box on stream pages.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STREAM_PATH_RE = /^\/streams\/(\d+)\/?$/;
  const VIEW_TAG_TEXT_RE = /Aufrufe/i;
  const STYLE_ID = 'tm-stream-prev-next-style';
  const NAV_CLASS = 'tm-stream-nav';
  const NAV_BUTTON_CLASS = 'tm-stream-nav-button';
  const NAV_ICON_CLASS = 'tm-stream-nav-icon';

  let lastPath = '';

  function getStreamId(pathname) {
    const match = STREAM_PATH_RE.exec(pathname);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${NAV_CLASS} {
        --tm-tag-height: 28px;
        --tm-tag-radius: 14px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
        vertical-align: middle;
      }
      .${NAV_BUTTON_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--tm-tag-height);
        height: var(--tm-tag-height);
        border: none;
        border-radius: var(--tm-tag-radius);
        background: #461675;
        color: #ffffff;
        cursor: pointer;
        opacity: 0.85;
        padding: 0;
      }
      .${NAV_BUTTON_CLASS}:hover {
        opacity: 1;
      }
      .${NAV_BUTTON_CLASS}:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
      .${NAV_BUTTON_CLASS}:disabled {
        cursor: not-allowed;
        opacity: 0.35;
      }
      .${NAV_ICON_CLASS} {
        font-size: 20px;
        line-height: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function findViewsTag() {
    const metaTags = document.querySelector('grnk-stream .g-video-meta-tags');
    if (!metaTags) return null;
    const tags = metaTags.querySelectorAll('.g-video-meta-info-tag');
    for (const tag of tags) {
      if (VIEW_TAG_TEXT_RE.test(tag.textContent || '')) {
        return tag;
      }
    }
    return null;
  }

  function createNavButton(direction, iconName) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = NAV_BUTTON_CLASS;
    button.dataset.direction = direction;
    button.title = direction === 'prev' ? 'Vorheriger Stream' : 'Nächster Stream';
    button.setAttribute('aria-label', button.title);
    const icon = document.createElement('i');
    icon.className = `material-icons ${NAV_ICON_CLASS}`;
    icon.textContent = iconName;
    button.appendChild(icon);
    button.addEventListener('click', () => {
      const target = Number(button.dataset.target);
      if (!Number.isFinite(target) || target < 1) return;
      window.location.assign(`/streams/${target}`);
    });
    return button;
  }

  function updateButtons(nav, streamId) {
    const prevButton = nav.querySelector(`[data-direction="prev"]`);
    const nextButton = nav.querySelector(`[data-direction="next"]`);
    const prevTarget = streamId - 1;
    const nextTarget = streamId + 1;
    if (prevButton) {
      prevButton.dataset.target = String(prevTarget);
      prevButton.disabled = prevTarget < 1;
    }
    if (nextButton) {
      nextButton.dataset.target = String(nextTarget);
      nextButton.disabled = false;
    }
  }

  function ensureNavigation(streamId) {
    const viewsTag = findViewsTag();
    if (!viewsTag) return;
    const metaTags = viewsTag.parentElement;
    if (!metaTags) return;
    let nav = metaTags.querySelector(`.${NAV_CLASS}`);
    if (!nav) {
      nav = document.createElement('span');
      nav.className = NAV_CLASS;
      nav.setAttribute('role', 'group');
      nav.setAttribute('aria-label', 'Stream Navigation');
      nav.appendChild(createNavButton('prev', 'skip_previous'));
      nav.appendChild(createNavButton('next', 'skip_next'));
      viewsTag.insertAdjacentElement('afterend', nav);
    }
    syncNavSizing(viewsTag, nav);
    updateButtons(nav, streamId);
  }

  function syncNavSizing(viewsTag, nav) {
    const rect = viewsTag.getBoundingClientRect();
    const computed = window.getComputedStyle(viewsTag);
    if (rect.height) {
      nav.style.setProperty('--tm-tag-height', `${Math.round(rect.height)}px`);
    }
    if (computed.borderRadius) {
      nav.style.setProperty('--tm-tag-radius', computed.borderRadius);
    }
  }

  function updateForLocation() {
    const pathname = window.location.pathname;
    if (pathname === lastPath) return;
    lastPath = pathname;
    const streamId = getStreamId(pathname);
    if (!streamId) return;
    injectStyles();
    ensureNavigation(streamId);
  }

  function updateForDom() {
    const streamId = getStreamId(window.location.pathname);
    if (!streamId) return;
    injectStyles();
    ensureNavigation(streamId);
  }

  function init() {
    injectStyles();
    updateForLocation();
    const observer = new MutationObserver(() => {
      updateForDom();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(updateForLocation, 500);
  }

  init();
})();
