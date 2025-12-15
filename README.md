# ArcanaDesk Monorepo

ArcanaDesk now lives in a split layout:

- `desktop/` – the original Electron DM toolkit (see `desktop/README.md` for full feature list, setup, and packaging steps).
- `android/` – placeholder for the future mobile rewrite; no source yet.

## Getting Started

```bash
git clone https://github.com/Zeyzers/ArcanaDesk.git
cd ArcanaDesk
```

From here choose the platform you want to work on.

### Desktop (Electron)

```bash
cd desktop
npm install
npm start
```

Build instructions (Windows/Linux) and tooling details live in `desktop/README.md`.

### Android

```bash
cd android
# work-in-progress
```

The Android client does not exist yet; use this folder when you bootstrap the mobile codebase (React Native/Flutter/etc.). Update this README and add `android/README.md` when work begins.
