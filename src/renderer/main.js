const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const defaultState = {
  diceHistory: [],
  turnOrder: [],
  currentTurnId: null,
  notes: [],
  currentNoteId: null,
  npcs: [],
  currentNpcId: null,
  timers: [],
  preferences: { lastView: 'hub' }
};

let state = { ...defaultState };

const persist = () => {
  if (window.arcanaDesk?.saveState) {
    window.arcanaDesk.saveState(state).catch((e) => console.warn('IPC persist failed', e));
  }
};

const migrateState = () => {
  state.preferences = { lastView: 'hub', ...(state.preferences || {}) };
  state.turnOrder = (state.turnOrder || []).map((t) => ({ conditions: [], ...t }));

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
  }

  if (typeof state.notes === 'string') {
    const id = uid();
    state.notes = [{ id, title: 'Nota', content: state.notes, ts: Date.now() }];
    state.currentNoteId = id;
  }

  if (!Array.isArray(state.npcs)) {
    state.npcs = [];
  }
};

const loadPersistedState = async () => {
  let loaded = null;
  if (window.arcanaDesk?.loadState) {
    try {
      loaded = await window.arcanaDesk.loadState();
    } catch (e) {
      console.warn('IPC load failed', e);
    }
  }
  state = { ...defaultState, ...(loaded || {}) };
  migrateState();
  persist();
};

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
  const normalizeShorthand = (term) => {
    if (/^adv$/i.test(term)) return '2d20kh1';
    if (/^dis$/i.test(term)) return '2d20kl1';
    return term;
  };

  const trimmed = formula.replace(/\s+/g, '');
  const parts = trimmed.match(/[+-]?[^+-]+/g);
  if (!parts) throw new Error('Formula non valida');

  let total = 0;
  const breakdown = [];

  for (let rawTerm of parts) {
    let sign = 1;
    if (rawTerm.startsWith('-')) {
      sign = -1;
      rawTerm = rawTerm.slice(1);
    } else if (rawTerm.startsWith('+')) {
      rawTerm = rawTerm.slice(1);
    }

    const term = normalizeShorthand(rawTerm);

    const diceMatch = term.match(
      /^(\d*)d(\d+)((k[hl]|d[hl])(\d+))?(r(<=|>=|<|>|=)?(\d+))?(!)?$/i
    );
    if (diceMatch) {
      const count = parseInt(diceMatch[1] || '1', 10);
      const faces = parseInt(diceMatch[2], 10);
      const kdCode = diceMatch[4]?.toLowerCase(); // kh, kl, dh, dl
      const kdNum = diceMatch[5] ? parseInt(diceMatch[5], 10) : null;
      const rerollOp = diceMatch[7] || '=';
      const rerollVal = diceMatch[8] ? parseInt(diceMatch[8], 10) : null;
      const explode = Boolean(diceMatch[9]);

      const shouldReroll = (value) => {
        if (!rerollVal && rerollVal !== 0) return false;
        switch (rerollOp) {
          case '<=':
            return value <= rerollVal;
          case '>=':
            return value >= rerollVal;
          case '<':
            return value < rerollVal;
          case '>':
            return value > rerollVal;
          case '=':
          default:
            return value === rerollVal;
        }
      };

      // detect impossible reroll conditions (e.g., r>=6 on a d6)
      if (rerollVal || rerollVal === 0) {
        const allReroll = Array.from({ length: faces }, (_, i) => i + 1).every(shouldReroll);
        if (allReroll) {
          throw new Error(`Condizione di reroll impossibile per d${faces}: ${term}`);
        }
      }

      const rollDie = () => {
        let val = Math.floor(Math.random() * faces) + 1;
        let attempts = 0;
        while (shouldReroll(val) && attempts < 50) {
          val = Math.floor(Math.random() * faces) + 1;
          attempts += 1;
        }
        return val;
      };

      const rolls = [];
      for (let i = 0; i < count; i += 1) {
        let val = rollDie();
        rolls.push(val);
        if (explode) {
          while (val === faces) {
            val = rollDie();
            rolls.push(val);
          }
        }
      }

      let kept = [...rolls];

      if (kdCode && kdNum) {
        const sorted = [...rolls].sort((a, b) => a - b);
        if (kdCode === 'kh') {
          kept = [...sorted].reverse().slice(0, kdNum);
        } else if (kdCode === 'kl') {
          kept = sorted.slice(0, kdNum);
        } else if (kdCode === 'dh') {
          kept = [...sorted].reverse().slice(kdNum).reverse();
        } else if (kdCode === 'dl') {
          kept = sorted.slice(kdNum);
        }
      }

      const subtotal = kept.reduce((a, b) => a + b, 0) * sign;
      total += subtotal;
      breakdown.push({
        type: 'dice',
        raw: term,
        rolls,
        kept,
        subtotal,
        faces,
        count,
        sign
      });
      continue;
    }

    const numeric = Number(term);
    if (Number.isFinite(numeric)) {
      total += numeric * sign;
      breakdown.push({ type: 'flat', raw: term, value: numeric * sign });
      continue;
    }

    throw new Error('Parte non riconosciuta: ' + term);
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
      .map((p) => {
        if (p.type !== 'dice') return p.value;
        const keptCopy = [...p.kept];
        const dropped = [];
        p.rolls.forEach((r) => {
          const idx = keptCopy.indexOf(r);
          if (idx !== -1) {
            keptCopy.splice(idx, 1);
          } else {
            dropped.push(r);
          }
        });
        const keptStr = p.kept.length ? `<span class="kept">${p.kept.join(',')}</span>` : '';
        const dropStr = dropped.length
          ? `<span class="dropped">(${dropped.join(',')})</span>`
          : '';
        return `${p.raw} [${keptStr}${keptStr && dropStr ? ' ' : ''}${dropStr}]`;
      })
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
const noteTitle = el('noteTitle');
const noteListEl = el('noteList');
const newNoteBtn = el('newNote');
const deleteNoteBtn = el('deleteNote');
const noteSearch = el('noteSearch');
const exportNotes = el('exportNotes');
const exportAllNotes = el('exportAllNotes');
const importAllNotes = el('importAllNotes');
const noteImportInput = el('noteImportInput');
const saveStatus = el('saveStatus');

const ensureNote = () => {
  if (!state.notes.length) {
    const id = uid();
    state.notes = [{ id, title: 'Nuova nota', content: '', ts: Date.now() }];
    state.currentNoteId = id;
    persist();
  }
  if (!state.currentNoteId) {
    state.currentNoteId = state.notes[0].id;
    persist();
  }
};

ensureNote();

const getCurrentNote = () => state.notes.find((n) => n.id === state.currentNoteId);

const renderNoteList = () => {
  noteListEl.innerHTML = '';
  const term = (noteSearch?.value || '').toLowerCase().trim();
  state.notes
    .filter((n) => {
      if (!term) return true;
      return (
        (n.title || '').toLowerCase().includes(term) ||
        (n.content || '').toLowerCase().includes(term)
      );
    })
    .forEach((n) => {
      const li = document.createElement('li');
      li.className = n.id === state.currentNoteId ? 'active' : '';
      const titleEl = document.createElement('div');
      titleEl.className = 'note-title';
      titleEl.textContent = n.title || 'Senza titolo';
      const snippetEl = document.createElement('div');
      snippetEl.className = 'note-snippet';
      const firstLine = (n.content || '').split(/\r?\n/)[0] || '';
      const snippet = firstLine.trim().slice(0, 90);
      snippetEl.textContent = snippet;
      li.appendChild(titleEl);
      li.appendChild(snippetEl);
      li.addEventListener('click', () => {
        state.currentNoteId = n.id;
        persist();
        loadNote();
      });
      noteListEl.appendChild(li);
    });
};

const loadNote = () => {
  ensureNote();
  const note = getCurrentNote();
  if (!note) return;
  noteTitle.value = note.title || '';
  dmNotes.value = note.content || '';
  renderNoteList();
};

let saveTimeout;
const queueSave = () => {
  clearTimeout(saveTimeout);
  saveStatus.textContent = 'Salvataggio...';
  saveTimeout = setTimeout(() => {
    const note = getCurrentNote();
    if (!note) return;
    note.title = noteTitle.value.trim() || 'Senza titolo';
    note.content = dmNotes.value;
    note.ts = Date.now();
    persist();
    renderNoteList();
    saveStatus.textContent = 'Auto-save attivo';
  }, 350);
};

noteTitle.addEventListener('input', queueSave);
dmNotes.addEventListener('input', queueSave);
noteSearch?.addEventListener('input', renderNoteList);

newNoteBtn.addEventListener('click', () => {
  const id = uid();
  state.notes.unshift({
    id,
    title: `Nota ${state.notes.length + 1}`,
    content: '',
    ts: Date.now()
  });
  state.currentNoteId = id;
  persist();
  loadNote();
});

deleteNoteBtn.addEventListener('click', () => {
  state.notes = state.notes.filter((n) => n.id !== state.currentNoteId);
  state.currentNoteId = state.notes[0]?.id || null;
  ensureNote();
  persist();
  loadNote();
});

exportNotes.addEventListener('click', () => {
  const note = getCurrentNote();
  const title = note?.title || 'Nota';
  const blob = new Blob([`# ${title}\n\n${note?.content || ''}\n`], {
    type: 'text/markdown'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/\s+/g, '-').toLowerCase() || 'nota'}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

exportAllNotes?.addEventListener('click', () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    notes: state.notes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'arcanadesk-notes.json';
  a.click();
  URL.revokeObjectURL(url);
});

const importNotesFromFile = (file) => {
  if (file.size > 2_000_000) {
    alert('File troppo grande (>2MB).');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = Array.isArray(parsed?.notes) ? parsed.notes : parsed;
      if (!Array.isArray(imported)) throw new Error('Formato non valido');
      // sanitize minimal fields
      const cleanNotes = imported
        .map((n) => ({
          id: n.id || uid(),
          title: typeof n.title === 'string' ? n.title : 'Senza titolo',
          content: typeof n.content === 'string' ? n.content : '',
          ts: n.ts || Date.now()
        }))
        .filter((n) => n.title || n.content);
      if (!cleanNotes.length) throw new Error('Nessuna nota valida trovata');
      state.notes = cleanNotes;
      state.currentNoteId = state.notes[0].id;
      persist();
      loadNote();
      alert(`Import note completato: ${cleanNotes.length} note caricate.`);
    } catch (err) {
      alert('Import fallito: ' + err.message);
    }
  };
  reader.readAsText(file);
};

importAllNotes?.addEventListener('click', () => {
  noteImportInput?.click();
});

noteImportInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importNotesFromFile(file);
  noteImportInput.value = '';
});

// NPC SHEETS --------------------------------------------
const npcName = el('npcName');
const npcType = el('npcType');
const npcAC = el('npcAC');
const npcHP = el('npcHP');
const npcSpeed = el('npcSpeed');
const npcTags = el('npcTags');
const npcNotes = el('npcNotes');
const npcSTR = el('npcSTR');
const npcDEX = el('npcDEX');
const npcCON = el('npcCON');
const npcINT = el('npcINT');
const npcWIS = el('npcWIS');
const npcCHA = el('npcCHA');
const npcListEl = el('npcList');
const newNpcBtn = el('newNpc');
const deleteNpcBtn = el('deleteNpc');
const npcSearch = el('npcSearch');
const exportNpc = el('exportNpc');
const exportAllNpc = el('exportAllNpc');
const importAllNpc = el('importAllNpc');
const npcImportInput = el('npcImportInput');

const ensureNpc = () => {
  if (!state.npcs.length) {
    const id = uid();
    state.npcs = [
      {
        id,
        name: 'Nuova creatura',
        type: '',
        ac: '',
        hp: '',
        speed: '',
        tags: '',
        notes: '',
        str: '',
        dex: '',
        con: '',
        int: '',
        wis: '',
        cha: '',
        ts: Date.now()
      }
    ];
    state.currentNpcId = id;
    persist();
  }
  if (!state.currentNpcId) {
    state.currentNpcId = state.npcs[0].id;
    persist();
  }
};

const getCurrentNpc = () => state.npcs.find((n) => n.id === state.currentNpcId);

const renderNpcList = () => {
  npcListEl.innerHTML = '';
  const term = (npcSearch?.value || '').toLowerCase().trim();
  state.npcs
    .filter((n) => {
      if (!term) return true;
      return (
        (n.name || '').toLowerCase().includes(term) ||
        (n.type || '').toLowerCase().includes(term) ||
        (n.tags || '').toLowerCase().includes(term) ||
        (n.notes || '').toLowerCase().includes(term)
      );
    })
    .forEach((n) => {
      const li = document.createElement('li');
      li.className = n.id === state.currentNpcId ? 'active' : '';
      const titleEl = document.createElement('div');
      titleEl.className = 'npc-title';
      titleEl.textContent = n.name || 'Senza nome';
      const metaEl = document.createElement('div');
      metaEl.className = 'npc-meta';
      const meta = [
        n.type && `Tipo: ${n.type}`,
        n.ac && `CA ${n.ac}`,
        n.hp && `HP ${n.hp}`,
        n.tags && `Tag: ${n.tags}`,
        n.str && `STR ${n.str}`
      ]
        .filter(Boolean)
        .join(' · ');
      metaEl.textContent = meta;
      li.appendChild(titleEl);
      li.appendChild(metaEl);
      li.addEventListener('click', () => {
        state.currentNpcId = n.id;
        persist();
        loadNpc();
      });
      npcListEl.appendChild(li);
    });
};

const loadNpc = () => {
  ensureNpc();
  const npc = getCurrentNpc();
  if (!npc) return;
  npcName.value = npc.name || '';
  npcType.value = npc.type || '';
  npcAC.value = Number.isFinite(npc.ac) ? npc.ac : '';
  npcHP.value = Number.isFinite(npc.hp) ? npc.hp : '';
  npcSpeed.value = npc.speed || '';
  npcTags.value = npc.tags || '';
  npcNotes.value = npc.notes || '';
  npcSTR.value = Number.isFinite(npc.str) ? npc.str : '';
  npcDEX.value = Number.isFinite(npc.dex) ? npc.dex : '';
  npcCON.value = Number.isFinite(npc.con) ? npc.con : '';
  npcINT.value = Number.isFinite(npc.int) ? npc.int : '';
  npcWIS.value = Number.isFinite(npc.wis) ? npc.wis : '';
  npcCHA.value = Number.isFinite(npc.cha) ? npc.cha : '';
  renderNpcList();
};

let saveNpcTimeout;
const queueSaveNpc = () => {
  clearTimeout(saveNpcTimeout);
  saveNpcTimeout = setTimeout(() => {
    const npc = getCurrentNpc();
    if (!npc) return;
    npc.name = npcName.value.trim() || 'Senza nome';
    npc.type = npcType.value.trim();
    npc.ac = Number(npcAC.value);
    npc.hp = Number(npcHP.value);
    npc.speed = npcSpeed.value.trim();
    npc.tags = npcTags.value.trim();
    npc.notes = npcNotes.value;
    npc.str = Number(npcSTR.value);
    npc.dex = Number(npcDEX.value);
    npc.con = Number(npcCON.value);
    npc.int = Number(npcINT.value);
    npc.wis = Number(npcWIS.value);
    npc.cha = Number(npcCHA.value);
    npc.ts = Date.now();
    persist();
    renderNpcList();
  }, 250);
};

newNpcBtn?.addEventListener('click', () => {
  const id = uid();
  state.npcs.unshift({
    id,
    name: `Creatura ${state.npcs.length + 1}`,
    type: '',
    ac: '',
    hp: '',
    speed: '',
    tags: '',
    notes: '',
    str: '',
    dex: '',
    con: '',
    int: '',
    wis: '',
    cha: '',
    ts: Date.now()
  });
  state.currentNpcId = id;
  persist();
  loadNpc();
});

deleteNpcBtn?.addEventListener('click', () => {
  state.npcs = state.npcs.filter((n) => n.id !== state.currentNpcId);
  state.currentNpcId = state.npcs[0]?.id || null;
  ensureNpc();
  persist();
  loadNpc();
});

[npcName, npcType, npcAC, npcHP, npcSpeed, npcTags, npcNotes, npcSTR, npcDEX, npcCON, npcINT, npcWIS, npcCHA].forEach((elRef) => {
  elRef?.addEventListener('input', queueSaveNpc);
});

npcSearch?.addEventListener('input', renderNpcList);

exportNpc?.addEventListener('click', () => {
  const npc = getCurrentNpc();
  if (!npc) return;
  const payload = { ...npc };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (npc.name || 'creatura').replace(/\s+/g, '-').toLowerCase();
  a.download = `${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

exportAllNpc?.addEventListener('click', () => {
  const payload = { exportedAt: new Date().toISOString(), npcs: state.npcs };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'arcanadesk-npc.json';
  a.click();
  URL.revokeObjectURL(url);
});

const importNpcFromFile = (file) => {
  if (file.size > 2_000_000) {
    alert('File NPC troppo grande (>2MB).');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = Array.isArray(parsed?.npcs) ? parsed.npcs : parsed;
      if (!Array.isArray(imported)) throw new Error('Formato non valido');
      const clean = imported
        .map((n) => ({
          id: n.id || uid(),
          name: typeof n.name === 'string' ? n.name : 'Senza nome',
          type: typeof n.type === 'string' ? n.type : '',
          ac: typeof n.ac === 'number' || typeof n.ac === 'string' ? n.ac : '',
          hp: typeof n.hp === 'number' || typeof n.hp === 'string' ? n.hp : '',
          speed: typeof n.speed === 'string' ? n.speed : '',
          tags: typeof n.tags === 'string' ? n.tags : '',
          notes: typeof n.notes === 'string' ? n.notes : '',
          str: typeof n.str === 'number' || typeof n.str === 'string' ? n.str : '',
          dex: typeof n.dex === 'number' || typeof n.dex === 'string' ? n.dex : '',
          con: typeof n.con === 'number' || typeof n.con === 'string' ? n.con : '',
          int: typeof n.int === 'number' || typeof n.int === 'string' ? n.int : '',
          wis: typeof n.wis === 'number' || typeof n.wis === 'string' ? n.wis : '',
          cha: typeof n.cha === 'number' || typeof n.cha === 'string' ? n.cha : '',
          ts: n.ts || Date.now()
        }))
        .filter((n) => n.name || n.notes);
      if (!clean.length) throw new Error('Nessuna scheda valida');
      state.npcs = clean;
      state.currentNpcId = state.npcs[0].id;
      persist();
      loadNpc();
      alert(`Import NPC completato: ${clean.length} schede caricate.`);
    } catch (err) {
      alert('Import NPC fallito: ' + err.message);
    }
  };
  reader.readAsText(file);
};

importAllNpc?.addEventListener('click', () => npcImportInput?.click());

npcImportInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importNpcFromFile(file);
  npcImportInput.value = '';
});

// INITIALIZE ---------------------------------------------
const init = async () => {
  await loadPersistedState();
  const hasView = document.querySelector(`[data-view="${state.preferences.lastView}"]`);
  setView(hasView ? state.preferences.lastView : 'hub');
  renderHistory();
  renderTurns();
  renderTimers();
  loadNote();
  loadNpc();
};

init();
