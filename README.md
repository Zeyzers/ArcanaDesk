# ArcanaDesk · DM Toolkit

Lightweight Electron desktop app for Dungeon Masters. No SRD/compendium content—only practical tools that run locally with dark mode fixed.

## Strumenti
- **Dice Roller PRO**: formule tipo `3d8+4`, `2d20kh1`, cronologia con statistiche, shortcut rapidi.
- **Turn Tracker**: iniziative ordinate, evidenzia turno attuale, timer di turno opzionale, condizioni multiple per creatura (con note), quick links tra tool.
- **Timer multipli**: countdown e cronometri, preset per round/1m/5m/10m, pause/reset.
- **Note del DM**: appunti veloci con auto-save e export Markdown (Obsidian-friendly).

## Requisiti
- Node.js >= 18

## Setup & Run
```bash
npm install
npm start
```

## Struttura
- `src/main/main.js` — processo main Electron, finestra, tema dark fisso.
- `preload.js` — bridge sicuro verso il renderer.
- `src/renderer/` — UI e logica dei tool (`index.html`, `main.js`, `css/styles.css`).

## Note privacy/licenza
- Tutti i dati sono locali (localStorage); niente rete di default.
- Nessun testo protetto o contenuto SRD incluso. Perfetta per uso legale/donationware.
