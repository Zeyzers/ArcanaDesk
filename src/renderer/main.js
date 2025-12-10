const storageKey = 'arcanadesk-state';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const defaultState = {
  diceHistory: [],
  turnOrder: [],
  currentTurnId: null,
  notes: '',
  timers: [],
  preferences: { lastView: 'hub' }
};

let state = (() => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaultState };
    return { ...defaultState, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Unable to load state, using defaults', e);
    return { ...defaultState };
  }
})();

const persist = () => localStorage.setItem(storageKey, JSON.stringify(state));

state.preferences = { lastView: 'hub', ...(state.preferences || {}) };
state.turnOrder = (state.turnOrder || []).map((t) => ({ conditions: [], ...t }));

// migrate legacy conditions array (from old view) into turn entries
if (state.conditions?.length) {
  state.conditions.forEach((c) => {
    const target = state.turnOrder.find((t) => t.name === c.target);
    if (target) {
      target.conditions.push({
        id: c.id || uid(),
        type: c.type,
        note: c.note,
        ts: c.ts || Date.now()
      });
    }
  });
  state.conditions = [];
  persist();
}

const el = (id) => document.getElementById(id);

// DICE ROLLER --------------------------------------------
const rollInput = el('rollInput');
const rollButton = el('rollButton');
const historyList = el('historyList');
const diceStats = el('diceStats');
const clearHistory = el('clearHistory');

// NAVIGATION ---------------------------------------------
const views = document.querySelectorAll('[data-view]');
const navButtons = document.querySelectorAll('[data-nav]');

const setView = (view) => {
  views.forEach((v) => v.classList.toggle('active', v.dataset.view === view));
  navButtons.forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.nav === view && btn.closest('.quick-links'))
  );
  state.preferences.lastView = view;
  persist();
  if (view === 'dice' && rollInput) {
    rollInput.focus();
  }
};

navButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    setView(btn.dataset.nav);
  })
);

const parseRoll = (formula) => {
  const trimmed = formula.replace(/\s+/g, '');
  const parts = trimmed.match(/[+-]?[^+-]+/g);
  if (!parts) throw new Error('Formula non valida');

  let total = 0;
  const breakdown = [];

  for (let rawPart of parts) {
    let sign = 1;
    if (rawPart.startsWith('-')) {
      sign = -1;
      rawPart = rawPart.slice(1);
    } else if (rawPart.startsWith('+')) {
      rawPart = rawPart.slice(1);
    }

    const diceMatch = rawPart.match(/^(\d*)d(\d+)(k[hl]?(\d+))?$/i);
    if (diceMatch) {
      const count = parseInt(diceMatch[1] || '1', 10);
      const faces = parseInt(diceMatch[2], 10);
      const keepRaw = diceMatch[3];
      const keepNum = keepRaw ? parseInt(diceMatch[4], 10) : null;
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * faces) + 1);
      let kept = [...rolls];

      if (keepNum) {
        const direction = keepRaw.includes('l') ? 1 : -1; // 1 asc = lowest, -1 desc = highest
        kept = [...rolls].sort((a, b) => direction * (a - b)).slice(0, keepNum);
      }

      const subtotal = kept.reduce((a, b) => a + b, 0) * sign;
      total += subtotal;
      breakdown.push({ type: 'dice', raw: rawPart, rolls, kept, subtotal, faces, count, sign });
      continue;
    }

    const numeric = Number(rawPart);
    if (Number.isFinite(numeric)) {
      total += numeric * sign;
      breakdown.push({ type: 'flat', raw: rawPart, value: numeric * sign });
      continue;
    }

    throw new Error('Parte non riconosciuta: ' + rawPart);
  }

  return { total, breakdown };
};

const renderHistory = () => {
  historyList.innerHTML = '';
  if (!state.diceHistory.length) {
    historyList.innerHTML = '<li class="empty">Nessun tiro ancora.</li>';
    diceStats.textContent = '';
    return;
  }

  const totals = state.diceHistory.map((h) => h.total);
  const avg = (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  diceStats.innerHTML = `
    <span class="chip">Media: ${avg}</span>
    <span class="chip">Min: ${min}</span>
    <span class="chip">Max: ${max}</span>
    <span class="chip">Tiri: ${totals.length}</span>
  `;

  state.diceHistory.slice().reverse().forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const rollsText = entry.breakdown
      .map((p) => (p.type === 'dice' ? `${p.raw} [${p.kept.join(',')}]` : p.value))
      .join(' + ');
    li.innerHTML = `
      <div>
        <div class="formula mono">${entry.formula}</div>
        <div class="muted tiny">${rollsText}</div>
      </div>
      <div class="total">${entry.total}</div>
    `;
    historyList.appendChild(li);
  });
};

const addHistory = (formula, result) => {
  const entry = {
    id: uid(),
    formula,
    total: result.total,
    breakdown: result.breakdown,
    ts: Date.now()
  };
  state.diceHistory.push(entry);
  if (state.diceHistory.length > 40) state.diceHistory.shift();
  persist();
  renderHistory();
};

rollButton.addEventListener('click', () => {
  const formula = rollInput.value.trim();
  if (!formula) return;
  try {
    const result = parseRoll(formula);
    addHistory(formula, result);
  } catch (e) {
    alert(e.message);
  }
});

rollInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    rollButton.click();
  }
});

document.querySelectorAll('[data-die]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const die = btn.dataset.die;
    rollInput.value = rollInput.value ? `${rollInput.value}+1${die}` : `1${die}`;
    rollButton.click();
  });
});

clearHistory.addEventListener('click', () => {
  state.diceHistory = [];
  persist();
  renderHistory();
});

// TURN TRACKER ------------------------------------------
const turnForm = el('turnForm');
const turnList = el('turnList');
const nextTurn = el('nextTurn');
const turnTimerToggle = el('turnTimerToggle');
const turnTimer = el('turnTimer');
const condTargetSelect = el('condTargetSelect');
const condType = el('condType');
const condNote = el('condNote');
const addConditionBtn = el('addCondition');
let turnInterval = null;
let turnRemaining = 30;

const sortTurns = () => {
  state.turnOrder.sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name));
};

const setCurrentTurn = (id) => {
  state.currentTurnId = id;
  persist();
  resetTurnTimer();
  renderTurns();
};

const renderTurns = () => {
  sortTurns();
  turnList.innerHTML = '';
  condTargetSelect.innerHTML = '';

  if (!state.turnOrder.length) {
    turnList.innerHTML = '<li class="empty">Aggiungi i partecipanti per tenere traccia dell\'iniziativa.</li>';
    condTargetSelect.innerHTML = '<option>Nessun partecipante</option>';
    return;
  }

  state.turnOrder.forEach((entry) => {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.name;
    condTargetSelect.appendChild(opt);
  });
  condTargetSelect.value = state.currentTurnId || state.turnOrder[0].id;

  state.turnOrder.forEach((entry) => {
    const li = document.createElement('li');
    li.className = `turn-card ${entry.id === state.currentTurnId ? 'active' : ''}`;
    const conditions = entry.conditions || [];
    const condMarkup =
      conditions.length > 0
        ? `<div class="cond-tags">${conditions
            .map(
              (c) =>
                `<span class="tag secondary">${c.type}${
                  c.note ? `<span class="badge">${c.note}</span>` : ''
                }<button class="remove" data-cond="${c.id}" title="Rimuovi">x</button></span>`
            )
            .join('')}</div>`
        : '<div class="muted tiny">Nessuna condizione</div>';

    li.innerHTML = `
      <div>
        <div class="turn-meta">
          <span class="badge mono">${entry.initiative}</span>
          <strong>${entry.name}</strong>
          ${entry.note ? `<span class="chip">${entry.note}</span>` : ''}
        </div>
        <div class="tiny muted">Aggiunto ${new Date(entry.ts).toLocaleTimeString()}</div>
        ${condMarkup}
      </div>
      <div class="turn-meta">
        <button class="ghost" data-action="activate">Seleziona</button>
        <button class="ghost" data-action="remove">x</button>
      </div>
    `;

    li.querySelector('[data-action="remove"]').addEventListener('click', () => {
      state.turnOrder = state.turnOrder.filter((t) => t.id !== entry.id);
      if (state.currentTurnId === entry.id) {
        state.currentTurnId = state.turnOrder[0]?.id || null;
      }
      persist();
      renderTurns();
    });

    li.querySelector('[data-action="activate"]').addEventListener('click', () => {
      setCurrentTurn(entry.id);
    });

    li.querySelectorAll('[data-cond]').forEach((btn) =>
      btn.addEventListener('click', () => {
        entry.conditions = (entry.conditions || []).filter((c) => c.id !== btn.dataset.cond);
        persist();
        renderTurns();
      })
    );

    turnList.appendChild(li);
  });

  if (!state.currentTurnId && state.turnOrder.length) {
    state.currentTurnId = state.turnOrder[0].id;
    persist();
    renderTurns();
  }
};

turnForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(turnForm);
  const name = data.get('name')?.toString().trim();
  const initiative = Number(data.get('initiative'));
  const note = data.get('note')?.toString().trim();
  if (!name || Number.isNaN(initiative)) return;
  state.turnOrder.push({ id: uid(), name, initiative, note, ts: Date.now(), conditions: [] });
  sortTurns();
  state.currentTurnId = state.turnOrder[0].id;
  persist();
  renderTurns();
  turnForm.reset();
});

nextTurn.addEventListener('click', () => {
  if (!state.turnOrder.length) return;
  sortTurns();
  const idx = state.turnOrder.findIndex((t) => t.id === state.currentTurnId);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % state.turnOrder.length;
  setCurrentTurn(state.turnOrder[nextIdx].id);
});

const resetTurnTimer = () => {
  if (!turnTimerToggle.checked) {
    turnTimer.textContent = '';
    clearInterval(turnInterval);
    turnInterval = null;
    return;
  }
  turnRemaining = 30;
  turnTimer.textContent = `Timer turno: ${turnRemaining}s`;
  clearInterval(turnInterval);
  turnInterval = setInterval(() => {
    turnRemaining -= 1;
    if (turnRemaining <= 0) {
      turnTimer.textContent = 'Tempo! *';
      clearInterval(turnInterval);
      return;
    }
    turnTimer.textContent = `Timer turno: ${turnRemaining}s`;
  }, 1000);
};

turnTimerToggle.addEventListener('change', resetTurnTimer);

addConditionBtn.addEventListener('click', () => {
  const targetId = condTargetSelect.value;
  const typeRaw = condType.value;
  const note = condNote.value.trim();
  const entry = state.turnOrder.find((t) => t.id === targetId);
  if (!entry) return;
  const label = typeRaw === 'custom' ? note || 'Custom' : typeRaw;
  entry.conditions = entry.conditions || [];
  entry.conditions.push({ id: uid(), type: label, note, ts: Date.now() });
  condNote.value = '';
  persist();
  renderTurns();
});

// TIMERS -------------------------------------------------
const timerLabel = el('timerLabel');
const timerSeconds = el('timerSeconds');
const timerMode = el('timerMode');
const addTimer = el('addTimer');
const timerList = el('timerList');

const timerIntervals = new Map();

const formatMs = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const stopTimerInterval = (id) => {
  if (timerIntervals.has(id)) {
    clearInterval(timerIntervals.get(id));
    timerIntervals.delete(id);
  }
};

const renderTimers = () => {
  timerList.innerHTML = '';
  if (!state.timers.length) {
    timerList.innerHTML = '<div class="empty">Nessun timer attivo.</div>';
    return;
  }

  state.timers.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'timer-card';

    const dynamicRemaining =
      t.mode === 'countdown'
        ? Math.max(0, t.remainingMs - (t.running ? Date.now() - t.lastStart : 0))
        : null;

    const timeLabel =
      t.mode === 'countdown'
        ? formatMs(dynamicRemaining)
        : formatMs(t.elapsedMs + (t.running ? Date.now() - t.lastStart : 0));

    card.innerHTML = `
      <div class="turn-meta">
        <strong>${t.label || 'Timer'}</strong>
        <span class="badge">${t.mode}</span>
      </div>
      <div class="mono">${timeLabel}</div>
      <div class="timer-actions">
        <button class="primary" data-action="toggle">${t.running ? 'Pausa' : 'Start'}</button>
        <button class="ghost" data-action="reset">Reset</button>
        <button class="ghost" data-action="remove">x</button>
      </div>
    `;

    card.querySelector('[data-action="toggle"]').addEventListener('click', () => {
      if (t.running) {
        t.running = false;
        if (t.mode === 'stopwatch') {
          t.elapsedMs += Date.now() - t.lastStart;
        } else {
          t.remainingMs = Math.max(0, t.remainingMs - (Date.now() - t.lastStart));
        }
        stopTimerInterval(t.id);
      } else {
        t.running = true;
        t.lastStart = Date.now();
        const tick = () => {
          if (t.mode === 'stopwatch') {
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
      persist();
      renderTimers();
    });

    card.querySelector('[data-action="reset"]').addEventListener('click', () => {
      if (t.mode === 'countdown') {
        t.remainingMs = t.durationMs;
      } else {
        t.elapsedMs = 0;
      }
      t.running = false;
      stopTimerInterval(t.id);
      persist();
      renderTimers();
    });

    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      stopTimerInterval(t.id);
      state.timers = state.timers.filter((x) => x.id !== t.id);
      persist();
      renderTimers();
    });

    timerList.appendChild(card);
  });
};

addTimer.addEventListener('click', () => {
  const label = timerLabel.value.trim();
  const seconds = Number(timerSeconds.value);
  const mode = timerMode.value;
  if (Number.isNaN(seconds) || seconds <= 0) return;
  const base = {
    id: uid(),
    label,
    mode,
    running: false,
    lastStart: null
  };
  if (mode === 'countdown') {
    state.timers.push({ ...base, durationMs: seconds * 1000, remainingMs: seconds * 1000 });
  } else {
    state.timers.push({ ...base, elapsedMs: 0 });
  }
  persist();
  renderTimers();
});

document.querySelectorAll('.preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    timerSeconds.value = btn.dataset.seconds;
  });
});

// NOTES --------------------------------------------------
const dmNotes = el('dmNotes');
const exportNotes = el('exportNotes');
const saveStatus = el('saveStatus');
dmNotes.value = state.notes || '';

let saveTimeout;
dmNotes.addEventListener('input', () => {
  clearTimeout(saveTimeout);
  saveStatus.textContent = 'Salvataggio...';
  saveTimeout = setTimeout(() => {
    state.notes = dmNotes.value;
    persist();
    saveStatus.textContent = 'Auto-save attivo';
  }, 350);
});

exportNotes.addEventListener('click', () => {
  const blob = new Blob([dmNotes.value || '# Note del DM\n'], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'arcanadesk-notes.md';
  a.click();
  URL.revokeObjectURL(url);
});

// INITIALIZE ---------------------------------------------
const hasView = document.querySelector(`[data-view="${state.preferences.lastView}"]`);
setView(hasView ? state.preferences.lastView : 'hub');
renderHistory();
renderTurns();
renderTimers();
