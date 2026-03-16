# Repository Guidelines

## Project Structure & Module Organization
This repository is a flat collection of standalone Tampermonkey userscripts. Each feature lives in a single root-level file such as `gronkh-autoscroll.user.js` or `gronkh-tv-chat-filter.user.js`. `README.md` documents behavior and screenshots, and `LICENSE` covers distribution. There are no shared modules, asset folders, or generated build outputs, so keep changes isolated to the relevant script unless a cross-script convention needs updating.

## Build, Test, and Development Commands
There is no build step or package-managed toolchain in this repository.

- `node --check gronkh-autoscroll.user.js`
  Performs a quick syntax check on a script.
- `rg --files '*.user.js'`
  Lists all userscripts in the collection.
- `git diff -- *.user.js`
  Reviews script-only changes before committing.

For runtime validation, load the changed `.user.js` file in Tampermonkey and test directly on `https://gronkh.tv/*`.

## Coding Style & Naming Conventions
Match the existing script style:

- Use two-space indentation, semicolons, and single quotes.
- Wrap scripts in an IIFE with `'use strict';`.
- Prefer `const` by default, `let` only when reassignment is required.
- Keep Tampermonkey metadata blocks current: `@name`, `@version`, `@description`, `@match`, and `@run-at`.
- Name new files with the existing pattern `gronkh-<feature>.user.js`.
- Prefix DOM classes, IDs, and storage keys with a script-specific namespace such as `tm-gronkh-` or `tmGronkh` to avoid collisions.

Use English for identifiers and code comments. Preserve established German UI labels where they are already part of the site-facing behavior.

## Testing Guidelines
There is no automated test suite yet. Every change should include:

- A `node --check` syntax pass for each modified script.
- Manual testing on the affected Gronkh.TV page state, including reloads and repeated navigation.
- Regression checks for DOM selectors, localStorage persistence, and duplicate UI injection.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Update README.md`. Follow that style and keep subjects specific, for example `Add replay offset reset button`.

When a task is complete, create a git commit for the finished work and push it to the tracked remote branch unless the user explicitly tells you not to.

Pull requests should include a short summary, the affected script filenames, manual test notes, and screenshots or GIFs for visible UI changes. Link related issues when applicable.
