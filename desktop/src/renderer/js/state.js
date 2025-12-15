export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const defaultState = {
  diceHistory: [],
  turnOrder: [],
  currentTurnId: null,
  notes: [],
  currentNoteId: null,
  npcs: [],
  currentNpcId: null,
  timers: [],
  preferences: { lastView: "hub", confirmDeletes: true, npcSort: "name" },
};

export const state = structuredClone(defaultState);

export const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const persist = () => {
  if (window.arcanaDesk?.saveState) {
    window.arcanaDesk
      .saveState(state)
      .catch((e) => console.warn("IPC persist failed", e));
  }
};

let persistTimer = null;
export const persistDebounced = () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist(), 250);
};

const migrateState = () => {
  state.preferences = {
    lastView: "hub",
    confirmDeletes: true,
    npcSort: "name",
    ...(state.preferences || {}),
  };
  state.turnOrder = (state.turnOrder || []).map((t) => ({
    conditions: [],
    ...t,
  }));

  if (state.conditions?.length) {
    state.conditions.forEach((c) => {
      const target = state.turnOrder.find((t) => t.name === c.target);
      if (target) {
        target.conditions.push({
          id: c.id || uid(),
          type: c.type,
          note: c.note,
          ts: c.ts || Date.now(),
        });
      }
    });
    state.conditions = [];
  }

  if (typeof state.notes === "string") {
    const id = uid();
    state.notes = [{ id, title: "Nota", content: state.notes, ts: Date.now() }];
    state.currentNoteId = id;
  }

  if (!Array.isArray(state.npcs)) {
    state.npcs = [];
  }
};

const replaceState = (next) => {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, next);
};

export const loadPersistedState = async () => {
  let loaded = null;
  if (window.arcanaDesk?.loadState) {
    try {
      loaded = await window.arcanaDesk.loadState();
    } catch (e) {
      console.warn("IPC load failed", e);
    }
  }
  const merged = { ...defaultState, ...(loaded || {}) };
  replaceState(merged);
  migrateState();
  persist();
};

export const confirmAction = (message) => {
  if (state.preferences.confirmDeletes === false) return true;
  return window.confirm(message);
};

export const el = (id) => document.getElementById(id);
