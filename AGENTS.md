# Repository Guidelines

## Project Structure & Module Organization
This repository is a flat collection of standalone Tampermonkey userscripts. Each feature lives in a single root-level file such as `gronkh-autoscroll.user.js` or `gronkh-tv-chat-filter.user.js`. `README.md` documents behavior and screenshots, and `LICENSE` covers distribution. There are no shared modules, asset folders, or generated build outputs, so keep changes isolated to the relevant script unless a cross-script convention needs updating.

## Agent Workflow
When analyzing `gronkh.tv` while working on these scripts, prefer BrowserMCP so DOM structure, controls, and live behavior are checked against the real site rather than guessed from static code.
