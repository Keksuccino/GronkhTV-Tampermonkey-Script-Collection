// ==UserScript==
// @name         Gronkh.tv Stream Prev/Next Buttons
// @namespace    https://gronkh.tv/
// @version      0.2.0
// @description  Adds previous/next stream buttons to the Aufrufe box on stream pages.
// @match        https://gronkh.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STREAM_PATH_RE = /^\/streams?\/(\d+)\/?$/;
  const VIEW_TAG_TEXT_RE = /Aufrufe/i;
  const STYLE_ID = 'tm-stream-prev-next-style';
  const NAV_CLASS = 'tm-stream-nav';
  const NAV_BUTTON_CLASS = 'tm-stream-nav-button';
  const NAV_ICON_CLASS = 'tm-stream-nav-icon';

  let lastPath = '';

  function getStreamMatch(pathname) {
    const match = STREAM_PATH_RE.exec(pathname);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    return {
      id: value,
      basePath: match[0].startsWith('/streams') ? '/streams' : '/stream'
    };
  }

  function getStreamId(pathname) {
    const match = getStreamMatch(pathname);
    return match ? match.id : null;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${NAV_CLASS} {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        gap: 4px;
        height: var(--tm-tag-height, 40px);
        vertical-align: middle;
      }
      .${NAV_BUTTON_CLASS} {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--tm-tag-height, 40px);
        min-width: var(--tm-tag-height, 40px);
        height: var(--tm-tag-height, 40px);
        border: 1px solid rgba(128, 128, 128, 0.16);
        border-color: color-mix(in oklab, currentColor 10%, transparent);
        border-radius: var(--tm-tag-radius, 8px);
        background: rgba(128, 128, 128, 0.18);
        background: color-mix(in oklab, currentColor 15%, transparent);
        color: inherit;
        cursor: pointer;
        font: inherit;
        line-height: 1;
        padding: 0;
        transition: background-color 140ms ease, opacity 140ms ease, transform 140ms ease;
      }
      .${NAV_BUTTON_CLASS}:hover {
        background: rgba(128, 128, 128, 0.26);
        background: color-mix(in oklab, currentColor 22%, transparent);
      }
      .${NAV_BUTTON_CLASS}:active {
        transform: translateY(1px);
      }
      .${NAV_BUTTON_CLASS}:focus-visible {
        outline: 2px solid var(--outline-color, currentColor);
        outline-offset: 2px;
      }
      .${NAV_BUTTON_CLASS}:disabled {
        cursor: not-allowed;
        opacity: 0.35;
        transform: none;
      }
      .${NAV_ICON_CLASS} {
        display: block;
        height: 16px;
        position: relative;
        width: 16px;
      }
      .${NAV_ICON_CLASS}::before {
        border: solid currentColor;
        border-width: 0 2.5px 2.5px 0;
        content: '';
        height: 8px;
        position: absolute;
        top: 50%;
        width: 8px;
      }
      .${NAV_BUTTON_CLASS}[data-direction="prev"] .${NAV_ICON_CLASS}::before {
        left: 5px;
        transform: translateY(-50%) rotate(135deg);
      }
      .${NAV_BUTTON_CLASS}[data-direction="next"] .${NAV_ICON_CLASS}::before {
        right: 5px;
        transform: translateY(-50%) rotate(-45deg);
      }
    `;
    document.head.appendChild(style);
  }

  function copyAngularScopeAttributes(source, target) {
    if (!(source instanceof Element) || !(target instanceof Element)) return;
    Array.from(source.attributes).forEach((attr) => {
      if (attr.name.startsWith('_ngcontent-')) {
        target.setAttribute(attr.name, attr.value);
      }
    });
  }

  function getElementText(element) {
    return (element && (element.innerText || element.textContent) || '').trim();
  }

  function findCurrentNavigationTarget() {
    const rows = document.querySelectorAll('grnk-stream .row.big-badges');
    for (const row of rows) {
      const badges = Array.from(row.children).filter((child) => child.classList.contains('badge'));
      const viewsBadge = badges.find((badge) => VIEW_TAG_TEXT_RE.test(getElementText(badge)));
      if (viewsBadge) {
        return {
          anchor: viewsBadge,
          container: row
        };
      }
    }
    return null;
  }

  function findLegacyNavigationTarget() {
    const metaTags = document.querySelector('grnk-stream .g-video-meta-tags');
    if (!metaTags) return null;
    const tags = metaTags.querySelectorAll('.g-video-meta-info-tag');
    for (const tag of tags) {
      if (VIEW_TAG_TEXT_RE.test(tag.textContent || '')) {
        return {
          anchor: tag,
          container: metaTags
        };
      }
    }
    return null;
  }

  function findNavigationTarget() {
    return findCurrentNavigationTarget() || findLegacyNavigationTarget();
  }

  function createNavButton(direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = NAV_BUTTON_CLASS;
    button.dataset.direction = direction;
    button.title = direction === 'prev' ? 'Vorheriger Stream' : 'Nächster Stream';
    button.setAttribute('aria-label', button.title);
    const icon = document.createElement('span');
    icon.className = NAV_ICON_CLASS;
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    button.addEventListener('click', () => {
      const target = Number(button.dataset.target);
      if (!Number.isFinite(target) || target < 1) return;
      const streamMatch = getStreamMatch(window.location.pathname);
      const basePath = streamMatch ? streamMatch.basePath : '/stream';
      window.location.assign(`${basePath}/${target}`);
    });
    return button;
  }

  function createNavigation(anchor) {
    const nav = document.createElement('span');
    nav.className = NAV_CLASS;
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', 'Stream Navigation');
    copyAngularScopeAttributes(anchor, nav);
    nav.appendChild(createNavButton('prev'));
    nav.appendChild(createNavButton('next'));
    return nav;
  }

  function updateButtons(nav, streamId) {
    const prevButton = nav.querySelector(`[data-direction="prev"]`);
    const nextButton = nav.querySelector(`[data-direction="next"]`);
    const prevTarget = streamId - 1;
    const nextTarget = streamId + 1;
    if (prevButton) {
      prevButton.dataset.target = String(Math.max(prevTarget, 0));
      prevButton.disabled = prevTarget < 1;
    }
    if (nextButton) {
      nextButton.dataset.target = String(nextTarget);
      nextButton.disabled = false;
    }
  }

  function ensureNavigation(streamId) {
    const target = findNavigationTarget();
    if (!target) return;
    const { anchor, container } = target;
    let nav = container.querySelector(`.${NAV_CLASS}`);
    if (!nav) {
      nav = createNavigation(anchor);
    }
    if (anchor.nextElementSibling !== nav) {
      anchor.insertAdjacentElement('afterend', nav);
    }
    syncNavSizing(anchor, nav);
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
    if (!streamId) {
      removeNavigation();
      return;
    }
    injectStyles();
    ensureNavigation(streamId);
  }

  function updateForDom() {
    const streamId = getStreamId(window.location.pathname);
    if (!streamId) return;
    injectStyles();
    ensureNavigation(streamId);
  }

  function removeNavigation() {
    document.querySelectorAll(`.${NAV_CLASS}`).forEach((nav) => nav.remove());
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
