# ArcanaDesk · DM Toolkit

[![Electron](https://img.shields.io/badge/Electron-31.x-2f3241?logo=electron&logoColor=9feaf9)](#)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-026e00?logo=node.js&logoColor=white)](#)
[![Platform](https://img.shields.io/badge/Windows-build-green)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#)

One sleek, dark-mode console for Dungeon Masters. No copyrighted text, no internet calls: everything runs locally on your PC.

## What’s inside
- 🎲 **Dice Roller PRO**: fast rolls with advanced syntax (`3d8+4`, advantage/disadvantage, keep highest/lowest, reroll, exploding dice). Shows kept/dropped dice, history, and stats.
- 🛡️ **Turn Tracker**: auto-sorted initiatives, highlighted active turn, optional turn timer, multiple conditions with notes and duration.
- ⏱️ **Multi Timers**: countdowns and stopwatches with table-ready presets (round, 1m, 5m, 10m), pause and reset.
- 📝 **DM Notes**: titles with first-line preview, full-text search, Markdown export, JSON import/export with size guard.
- 🐉 **NPC/Monster Sheets**: stats (STR/DEX/CON/INT/WIS/CHA), tags and notes, HP tracker with +/-, undo, bloodied/KO states; saved attacks with to-hit and damage rolls via the roller; sort by name or tag; sanitized JSON import/export.
- ⚙️ **Quick Settings**: gear always visible, toggle for delete confirmations, dark theme locked in.

## Getting started
1) Install dependencies:
```bash
npm install
```
2) Run the app:
```bash
npm start
```

## Want a Windows executable?
```bash
npm run pack:win
```
You’ll find `ArcanaDesk.exe` in `dist/ArcanaDesk-win32-x64/`.

## Under the hood (short)
- `src/main/main.js` — Electron window, IPC, local JSON store.
- `preload.js` — secure bridge to the renderer.
- Modular renderer: `src/renderer/index.html` + `src/renderer/js/` (state, router, dice, turns, timers, notes, npcs) + `src/renderer/css/styles.css`.

## Privacy & content
- Data stays local (JSON), no network calls.

