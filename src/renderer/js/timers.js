import { state, persistDebounced, confirmAction, el } from "./state.js";

const timerLabel = el("timerLabel");
const timerSeconds = el("timerSeconds");
const timerMode = el("timerMode");
const addTimer = el("addTimer");
const timerList = el("timerList");
const timerIntervals = new Map();

const formatMs = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const stopTimerInterval = (id) => {
  if (timerIntervals.has(id)) {
    clearInterval(timerIntervals.get(id));
    timerIntervals.delete(id);
  }
};

export const renderTimers = () => {
  if (!timerList) return;
  timerList.innerHTML = "";
  if (!state.timers.length) {
    timerList.innerHTML = '<div class="empty">Nessun timer attivo.</div>';
    return;
  }

  state.timers.forEach((t) => {
    const card = document.createElement("div");
    card.className = "timer-card";
    const safeLabel = t.label || "Timer";

    const dynamicRemaining =
      t.mode === "countdown"
        ? Math.max(
            0,
            t.remainingMs - (t.running ? Date.now() - t.lastStart : 0),
          )
        : null;

    const timeLabel =
      t.mode === "countdown"
        ? formatMs(dynamicRemaining)
        : formatMs(t.elapsedMs + (t.running ? Date.now() - t.lastStart : 0));

    card.innerHTML = `
      <div class="turn-meta">
        <strong>${safeLabel}</strong>
        <span class="badge">${t.mode}</span>
      </div>
      <div class="mono">${timeLabel}</div>
      <div class="timer-actions">
        <button class="primary" data-action="toggle">${t.running ? "Pausa" : "Start"}</button>
        <button class="ghost" data-action="reset">Reset</button>
        <button class="ghost" data-action="remove">x</button>
      </div>
    `;

    card.querySelector('[data-action="toggle"]')?.addEventListener("click", () => {
      if (t.running) {
        t.running = false;
        if (t.mode === "stopwatch") {
          t.elapsedMs += Date.now() - t.lastStart;
        } else {
          t.remainingMs = Math.max(
            0,
            t.remainingMs - (Date.now() - t.lastStart),
          );
        }
        stopTimerInterval(t.id);
      } else {
        t.running = true;
        t.lastStart = Date.now();
        const tick = () => {
          if (t.mode === "stopwatch") {
            renderTimers();
            return;
          }
          const elapsed = Date.now() - t.lastStart;
          if (t.remainingMs - elapsed <= 0) {
            t.remainingMs = 0;
            t.running = false;
            stopTimerInterval(t.id);
            renderTimers();
            return;
          }
          renderTimers();
        };
        stopTimerInterval(t.id);
        timerIntervals.set(t.id, setInterval(tick, 300));
      }
      persistDebounced();
      renderTimers();
    });

    card.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
      if (t.mode === "countdown") {
        t.remainingMs = t.durationMs;
      } else {
        t.elapsedMs = 0;
      }
      t.running = false;
      stopTimerInterval(t.id);
      persistDebounced();
      renderTimers();
    });

    card.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      if (!confirmAction("Rimuovere questo timer?")) return;
      stopTimerInterval(t.id);
      state.timers = state.timers.filter((x) => x.id !== t.id);
      persistDebounced();
      renderTimers();
    });

    timerList.appendChild(card);
  });
};

export const initTimers = () => {
  addTimer?.addEventListener("click", () => {
    const label = timerLabel?.value.trim();
    const seconds = Number(timerSeconds?.value);
    const mode = timerMode?.value;
    if (Number.isNaN(seconds) || seconds <= 0 || !mode) return;
    const base = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      label,
      mode,
      running: false,
      lastStart: null,
    };
    if (mode === "countdown") {
      state.timers.push({
        ...base,
        durationMs: seconds * 1000,
        remainingMs: seconds * 1000,
      });
    } else {
      state.timers.push({ ...base, elapsedMs: 0 });
    }
    persistDebounced();
    renderTimers();
  });

  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (timerSeconds) timerSeconds.value = btn.dataset.seconds;
    });
  });

  renderTimers();
};
