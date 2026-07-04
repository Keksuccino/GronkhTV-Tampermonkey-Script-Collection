# Repository Guidelines

## Project Structure & Module Organization
This repository is a flat collection of standalone Tampermonkey userscripts for the `https://gronkh.tv` webpage. Each feature lives in a single root-level file such as `gronkh-autoscroll.user.js` or `gronkh-tv-chat-filter.user.js`. `README.md` documents behavior and screenshots, and `LICENSE` covers distribution. There are no shared modules, asset folders, or generated build outputs, so keep changes isolated to the relevant script unless a cross-script convention needs updating.

## Agent Workflow
When analyzing `gronkh.tv` while working on these scripts, use the Node REPL with the local Chrome executable as the default live debugging workflow. DOM structure, controls, worker messages, and live behavior must be checked against the real site rather than guessed from static code.

### GronkhTV Live Debugging Workflow

Use this workflow whenever a script depends on current GronkhTV markup, menus, chat replay behavior, media controls, localStorage, worker traffic, or SPA navigation.

1. Start from the repo state and affected script.
   - Run `git status --short --branch` first and avoid touching unrelated files.
   - Read the affected `.user.js` file and any nearby scripts that solve a similar problem.
   - Search with `rg` for old selectors, storage keys, menu labels, worker payload names, and DOM class names.

2. Open the real page, not a static approximation.
   - Use the user-provided URL when available. If no URL is provided and the work concerns a video/stream page, `https://gronkh.tv/stream/518` is a useful regression page because it includes the video player, chat, comments, metadata, controls, and stream-page layout.
   - Use the Node REPL with the local Chrome executable for the browser session:

     ```js
     const { chromium } = await import('playwright');

     const browser = await chromium.launch({
       executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
       headless: true
     });

     const context = await browser.newContext({
       viewport: { width: 1440, height: 1000 },
       locale: 'de-DE',
       timezoneId: 'Europe/Berlin'
     });

     const page = await context.newPage();
     await page.goto('https://gronkh.tv/stream/518', {
       waitUntil: 'domcontentloaded',
       timeout: 60000
     });
     await page.waitForTimeout(8000);
     ```

3. Capture the current DOM shape before changing code.
   - Inspect custom elements, buttons, labels, attributes, menu roots, and overlay containers.
   - For Angular/CDK menus, check both `.cdk-overlay-container` and the component subtree, because menus may be mounted near the trigger instead of inside the overlay.
   - Record selector-relevant attributes such as `mattooltip`, `aria-label`, `aria-controls`, `ngmenutrigger`, `ngmenu`, `ngmenuitem`, `role`, `data-visible`, and `_ngcontent-*`.

     ```js
     const info = await page.evaluate(() => ({
       url: location.href,
       title: document.title,
       customElements: Array.from(new Set(
         Array.from(document.querySelectorAll('*'))
           .map((el) => el.localName)
           .filter((name) => name && name.startsWith('grnk'))
       )).sort(),
       buttons: Array.from(document.querySelectorAll('button')).map((btn, i) => ({
         i,
         text: btn.innerText,
         aria: btn.getAttribute('aria-label'),
         mattooltip: btn.getAttribute('mattooltip'),
         className: btn.className,
         attrs: Array.from(btn.attributes).map((a) => [a.name, a.value])
       })),
       overlayText: document.querySelector('.cdk-overlay-container')?.innerText || ''
     }));
     ```

4. Deal with first-visit dialogs explicitly.
   - Cookie and autoplay dialogs can block pointer clicks in headless runs.
   - Inspect `.cdk-overlay-container button` and click the relevant button from the page context if browser automation reports that a backdrop intercepts pointer events.

     ```js
     await page.evaluate(() => {
       const button = Array.from(document.querySelectorAll('.cdk-overlay-container button'))
         .find((btn) => (btn.textContent || '').includes('Einverstanden'));
       if (button) button.click();
     });

     await page.evaluate(() => {
       const button = Array.from(document.querySelectorAll('.cdk-overlay-container button'))
         .find((btn) => (btn.textContent || '').includes('Deaktiviert lassen'));
       if (button) button.click();
     });
     ```

5. Open and inspect GronkhTV menus in their live state.
   - Click the real trigger, then inspect the element referenced by `aria-controls`.
   - For chat settings, the current trigger is a `grnk-chat-replay` button with `mattooltip="Chat-Einstellungen"` and `ngmenutrigger`.
   - The current chat settings menu is a `role="menu"` element with `ngmenu`; items use `button[ngmenuitem]` and scoped Angular attributes. Copy existing item classes and `_ngcontent-*` attributes when injecting a custom menu item so the new item matches the page design.

     ```js
     await page.locator('button[mattooltip="Chat-Einstellungen"]').first().click();
     await page.waitForTimeout(1000);

     const menu = await page.evaluate(() => {
       const trigger = document.querySelector('button[mattooltip="Chat-Einstellungen"]');
       const controlledId = trigger?.getAttribute('aria-controls');
       const controlled = controlledId ? document.getElementById(controlledId) : null;

       return {
         trigger: trigger?.outerHTML.slice(0, 1000) || null,
         controlled: controlled?.outerHTML.slice(0, 4000) || null,
         menus: Array.from(document.querySelectorAll('[role="menu"], [ngmenu], .cdk-menu'))
           .map((el) => ({
             tag: el.localName,
             id: el.id,
             role: el.getAttribute('role'),
             text: el.innerText || el.textContent,
             html: el.outerHTML.slice(0, 4000)
           }))
       };
     });
     ```

6. Capture worker messages before page scripts run when testing replay logic.
   - Use `context.addInitScript({ content })` so the hook is installed at document start.
   - Patch `Worker.prototype.postMessage` in the test context and store cloned messages on `window.__tmWorkerMessages`.
   - This is especially useful for replay chat scripts; the current replay payload uses `worker_chatreplay.worker.timestamp`.

     ```js
     await context.addInitScript({
       content: `
         (() => {
           const messages = [];
           Object.defineProperty(window, '__tmWorkerMessages', {
             value: messages,
             configurable: true
           });

           if (window.Worker && !Worker.prototype.__tmCapturePatched) {
             const originalPostMessage = Worker.prototype.postMessage;
             Worker.prototype.postMessage = function (message, transfer) {
               try {
                 messages.push({
                   time: Date.now(),
                   message: JSON.parse(JSON.stringify(message))
                 });
               } catch (_) {
                 messages.push({
                   time: Date.now(),
                   messageType: typeof message,
                   keys: message && typeof message === 'object' ? Object.keys(message) : null
                 });
               }

               return arguments.length > 1
                 ? originalPostMessage.call(this, message, transfer)
                 : originalPostMessage.call(this, message);
             };

             Object.defineProperty(Worker.prototype, '__tmCapturePatched', {
               value: true
             });
           }
         })();
       `
     });
     ```

7. Inject the local userscript at document start for verification.
   - Read the local `.user.js` file and inject its source with `context.addInitScript({ content })`.
   - If testing persistence or migration behavior, seed `localStorage` in the same init script before the userscript source runs.
   - If a script stores per-page state, seed realistic route-key variants when testing compatibility, for example `'/stream/518'` and `'/streams/518'`.

     ```js
     const fs = await import('node:fs/promises');
     const userscript = await fs.readFile('gronkh-some-feature.user.js', 'utf8');

     await context.addInitScript({
       content: `
         if (location.hostname === 'gronkh.tv') {
           localStorage.setItem(
             'tmGronkhExampleStateV1',
             JSON.stringify({ '/stream/518': { enabled: true } })
           );
         }

         ${userscript}
       `
     });
     ```

8. Verify behavior through page state, not only visual assumptions.
   - Check that injected UI appears exactly once after repeated menu opens.
   - Check the menu text, item HTML, classes, ARIA attributes, and displayed value.
   - Trigger prompts or dialogs with the page `dialog` event and verify localStorage updates.
   - For worker-based logic, verify the captured payload changed or passed through as expected for the feature being tested.

     ```js
     const result = await page.evaluate(() => ({
       storage: localStorage.getItem('tmGronkhExampleStateV1'),
       injectedCount: document.querySelectorAll('[data-tm-example-menu-item]').length,
       injectedText: Array.from(document.querySelectorAll('[data-tm-example-menu-item]'))
         .map((el) => (el.innerText || el.textContent || '').trim()),
       workerMessages: (window.__tmWorkerMessages || []).slice(0, 4)
     }));
     ```

9. Regression-check SPA behavior and duplicate injection.
   - Reopen the same menu multiple times.
   - Navigate or change routes without a full reload when relevant.
   - Re-check DOM selectors, localStorage persistence, duplicate UI injection, and worker payloads after navigation.

10. Finish with local checks and a concise record of what was verified.
    - Run a syntax check for each modified userscript. If `node` is not on PATH, use the Codex bundled Node runtime when available.
    - Run `git diff --check`.
    - Summarize live-page checks in the final response or commit notes, including the URL tested and the exact behavior verified.
