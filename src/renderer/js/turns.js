import {
  state,
  persistDebounced,
  confirmAction,
  escapeHtml,
  el,
  uid,
} from "./state.js";

const turnForm = el("turnForm");
const turnList = el("turnList");
const nextTurn = el("nextTurn");
const turnTimerToggle = el("turnTimerToggle");
const turnTimer = el("turnTimer");
const condTargetSelect = el("condTargetSelect");
const condType = el("condType");
const condNote = el("condNote");
const condDuration = el("condDuration");
const addConditionBtn = el("addCondition");
let turnInterval = null;
let turnRemaining = 30;

const sortTurns = () => {
  state.turnOrder.sort(
    (a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name),
  );
};

const resetTurnTimer = () => {
  if (!turnTimerToggle?.checked) {
    if (turnTimer) turnTimer.textContent = "";
    clearInterval(turnInterval);
    turnInterval = null;
    return;
  }
  turnRemaining = 30;
  if (turnTimer) turnTimer.textContent = `Timer turno: ${turnRemaining}s`;
  clearInterval(turnInterval);
  turnInterval = setInterval(() => {
    turnRemaining -= 1;
    if (turnRemaining <= 0) {
      if (turnTimer) turnTimer.textContent = "Tempo! *";
      clearInterval(turnInterval);
      return;
    }
    if (turnTimer) turnTimer.textContent = `Timer turno: ${turnRemaining}s`;
  }, 1000);
};

const setCurrentTurn = (id) => {
  state.currentTurnId = id;
  persistDebounced();
  resetTurnTimer();
  renderTurns();
};

export const renderTurns = () => {
  sortTurns();
  if (turnList) turnList.innerHTML = "";
  if (condTargetSelect) condTargetSelect.innerHTML = "";

  if (!state.turnOrder.length) {
    if (turnList) {
      turnList.innerHTML =
        '<li class="empty">Aggiungi i partecipanti per tenere traccia dell\'iniziativa.</li>';
    }
    if (condTargetSelect) {
      condTargetSelect.innerHTML = "<option>Nessun partecipante</option>";
    }
    return;
  }

  state.turnOrder.forEach((entry) => {
    if (!condTargetSelect) return;
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.name;
    condTargetSelect.appendChild(opt);
  });
  if (condTargetSelect) {
    condTargetSelect.value = state.currentTurnId || state.turnOrder[0].id;
  }

  state.turnOrder.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `turn-card ${entry.id === state.currentTurnId ? "active" : ""}`;
    const conditions = entry.conditions || [];
    const safeName = escapeHtml(entry.name);
    const safeNote = escapeHtml(entry.note);
    const condMarkup =
      conditions.length > 0
        ? `<div class="cond-tags">${conditions
            .map(
              (c) =>
                `<span class="tag secondary">${escapeHtml(c.type)}${
                  c.note ? `<span class="badge">${escapeHtml(c.note)}</span>` : ""
                }${
                  Number.isFinite(c.duration)
                    ? `<span class="badge time">${c.duration}r</span>`
                    : ""
                }<button class="remove" data-cond="${c.id}" title="Rimuovi">x</button></span>`,
            )
            .join("")}</div>`
        : '<div class="muted tiny">Nessuna condizione</div>';

    li.innerHTML = `
      <div>
        <div class="turn-meta">
          <span class="badge mono">${entry.initiative}</span>
          <strong>${safeName}</strong>
          ${entry.note ? `<span class="chip">${safeNote}</span>` : ""}
        </div>
        <div class="tiny muted">Aggiunto ${new Date(entry.ts).toLocaleTimeString()}</div>
        ${condMarkup}
      </div>
      <div class="turn-meta">
        <button class="ghost" data-action="activate">Seleziona</button>
        <button class="ghost" data-action="remove">x</button>
      </div>
    `;

    li.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      if (!confirmAction("Rimuovere questo partecipante?")) return;
      state.turnOrder = state.turnOrder.filter((t) => t.id !== entry.id);
      if (state.currentTurnId === entry.id) {
        state.currentTurnId = state.turnOrder[0]?.id || null;
      }
      persistDebounced();
      renderTurns();
    });

    li.querySelector('[data-action="activate"]')?.addEventListener("click", () => {
      setCurrentTurn(entry.id);
    });

    li.querySelectorAll("[data-cond]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (!confirmAction("Rimuovere questa condizione?")) return;
        entry.conditions = (entry.conditions || []).filter(
          (c) => c.id !== btn.dataset.cond,
        );
        persistDebounced();
        renderTurns();
      }),
    );

    turnList?.appendChild(li);
  });

  if (!state.currentTurnId && state.turnOrder.length) {
    state.currentTurnId = state.turnOrder[0].id;
    persistDebounced();
    renderTurns();
  }
};

export const initTurns = () => {
  turnForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(turnForm);
    const name = data.get("name")?.toString().trim();
    const initiative = Number(data.get("initiative"));
    const note = data.get("note")?.toString().trim();
    if (!name || Number.isNaN(initiative)) return;
    state.turnOrder.push({
      id: uid(),
      name,
      initiative,
      note,
      ts: Date.now(),
      conditions: [],
    });
    sortTurns();
    state.currentTurnId = state.turnOrder[0].id;
    persistDebounced();
    renderTurns();
    turnForm.reset();
  });

  nextTurn?.addEventListener("click", () => {
    if (!state.turnOrder.length) return;
    sortTurns();
    const idx = state.turnOrder.findIndex((t) => t.id === state.currentTurnId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % state.turnOrder.length;
    state.turnOrder.forEach((t) => {
      if (!t.conditions) return;
      t.conditions = t.conditions
        .map((c) => {
          if (c.duration === null || c.duration === undefined) return c;
          const nextDur = c.duration - 1;
          return nextDur <= 0 ? null : { ...c, duration: nextDur };
        })
        .filter(Boolean);
    });
    setCurrentTurn(state.turnOrder[nextIdx].id);
  });

  turnTimerToggle?.addEventListener("change", resetTurnTimer);

  addConditionBtn?.addEventListener("click", () => {
    const targetId = condTargetSelect?.value;
    const typeRaw = condType?.value;
    const note = condNote?.value.trim() || "";
    const durationRaw = condDuration?.value;
    const entry = state.turnOrder.find((t) => t.id === targetId);
    if (!entry || !typeRaw) return;
    const label = typeRaw === "custom" ? note || "Custom" : typeRaw;
    entry.conditions = entry.conditions || [];
    const duration = durationRaw === "" ? null : Number(durationRaw);
    entry.conditions.push({
      id: uid(),
      type: label,
      note,
      ts: Date.now(),
      duration,
    });
    if (condNote) condNote.value = "";
    if (condDuration) condDuration.value = "";
    persistDebounced();
    renderTurns();
  });

  renderTurns();
};
