import {
  state,
  persistDebounced,
  confirmAction,
  el,
  uid,
} from "./state.js";

const npcName = el("npcName");
const npcType = el("npcType");
const npcAC = el("npcAC");
const npcHP = el("npcHP");
const npcHPCurrent = el("npcHPCurrent");
const npcSpeed = el("npcSpeed");
const npcTags = el("npcTags");
const npcNotes = el("npcNotes");
const npcSTR = el("npcSTR");
const npcDEX = el("npcDEX");
const npcCON = el("npcCON");
const npcINT = el("npcINT");
const npcWIS = el("npcWIS");
const npcCHA = el("npcCHA");
const npcListEl = el("npcList");
const newNpcBtn = el("newNpc");
const deleteNpcBtn = el("deleteNpc");
const npcSearch = el("npcSearch");
const npcSort = el("npcSort");
const npcHpUndo = el("npcHpUndo");
const exportNpc = el("exportNpc");
const exportAllNpc = el("exportAllNpc");
const importAllNpc = el("importAllNpc");
const npcImportInput = el("npcImportInput");
const atkName = el("atkName");
const atkToHit = el("atkToHit");
const atkDamage = el("atkDamage");
const addAttackBtn = el("addAttack");
const attackListEl = el("attackList");

const ensureNpc = () => {
  if (!state.npcs.length) {
    const id = uid();
    state.npcs = [
      {
        id,
        name: "Nuova creatura",
        type: "",
        ac: "",
        hp: "",
        hpCurrent: "",
        lastHp: null,
        speed: "",
        tags: "",
        notes: "",
        str: "",
        dex: "",
        con: "",
        int: "",
        wis: "",
        cha: "",
        attacks: [],
        ts: Date.now(),
      },
    ];
    state.currentNpcId = id;
    persistDebounced();
  }
  if (!state.currentNpcId) {
    state.currentNpcId = state.npcs[0].id;
    persistDebounced();
  }
};

const getCurrentNpc = () => state.npcs.find((n) => n.id === state.currentNpcId);

const renderNpcList = () => {
  if (!npcListEl) return;
  npcListEl.innerHTML = "";
  const term = (npcSearch?.value || "").toLowerCase().trim();
  const sorted = [...state.npcs].sort((a, b) => {
    const sortMode = state.preferences.npcSort || "name";
    if (sortMode === "tag") {
      return (
        (a.tags || "").localeCompare(b.tags || "") ||
        (a.name || "").localeCompare(b.name || "")
      );
    }
    return (a.name || "").localeCompare(b.name || "");
  });
  sorted
    .filter((n) => {
      if (!term) return true;
      return (
        (n.name || "").toLowerCase().includes(term) ||
        (n.type || "").toLowerCase().includes(term) ||
        (n.tags || "").toLowerCase().includes(term) ||
        (n.notes || "").toLowerCase().includes(term)
      );
    })
    .forEach((n) => {
      const li = document.createElement("li");
      li.className = n.id === state.currentNpcId ? "active" : "";
      if (Number.isFinite(n.hpCurrent) && Number.isFinite(n.hp)) {
        if (n.hpCurrent <= 0) li.classList.add("ko");
        else if (n.hpCurrent < n.hp / 2) li.classList.add("bloodied");
      }
      const titleEl = document.createElement("div");
      titleEl.className = "npc-title";
      titleEl.textContent = n.name || "Senza nome";
      const metaEl = document.createElement("div");
      metaEl.className = "npc-meta";
      const meta = [
        n.type && `Tipo: ${n.type}`,
        n.ac && `CA ${n.ac}`,
        n.hp && `HP ${n.hpCurrent ?? n.hp}/${n.hp}`,
        n.tags && `Tag: ${n.tags}`,
        n.str && `STR ${n.str}`,
        n.attacks?.length ? `Atk: ${n.attacks.length}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      metaEl.textContent = meta;
      li.appendChild(titleEl);
      li.appendChild(metaEl);
      li.addEventListener("click", () => {
        state.currentNpcId = n.id;
        persistDebounced();
        loadNpc();
      });
      npcListEl.appendChild(li);
    });
};

const renderAttacks = (npc, parseRoll, addHistory) => {
  if (!attackListEl) return;
  attackListEl.innerHTML = "";
  if (!npc.attacks || !npc.attacks.length) {
    attackListEl.innerHTML = '<li class="muted tiny">Nessun attacco salvato.</li>';
    return;
  }
  npc.attacks.forEach((atk, idx) => {
    const li = document.createElement("li");
    li.className = "attack-item";

    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = atk.name || "Attacco";
    title.appendChild(strong);

    const meta = document.createElement("div");
    meta.className = "npc-meta";
    meta.textContent = `Colpire: +${Number(atk.toHit) || 0} · Danni: ${
      atk.damage || "-"
    }`;

    const actions = document.createElement("div");
    actions.className = "attack-actions";
    const hitBtn = document.createElement("button");
    hitBtn.className = "primary";
    hitBtn.dataset.action = "hit";
    hitBtn.textContent = "Tira per colpire";
    const dmgBtn = document.createElement("button");
    dmgBtn.className = "ghost";
    dmgBtn.dataset.action = "damage";
    dmgBtn.textContent = "Tira danni";
    const remBtn = document.createElement("button");
    remBtn.className = "ghost";
    remBtn.dataset.action = "remove";
    remBtn.textContent = "Rimuovi";
    actions.append(hitBtn, dmgBtn, remBtn);

    li.append(title, meta, actions);

    hitBtn.addEventListener("click", () => {
      const mod = Number(atk.toHit) || 0;
      const formula = `1d20+${mod}`;
      try {
        const result = parseRoll(formula);
        addHistory(`${npc.name} - ${atk.name} (colpire)`, result);
        alert(`Tiro per colpire: ${result.total}`);
      } catch (e) {
        alert(e.message);
      }
    });
    dmgBtn.addEventListener("click", () => {
      const formula = atk.damage?.trim();
      if (!formula) return alert("Nessuna formula danni.");
      try {
        const result = parseRoll(formula);
        addHistory(`${npc.name} - ${atk.name} (danni)`, result);
        alert(`Danni: ${result.total}`);
      } catch (e) {
        alert(e.message);
      }
    });
    remBtn.addEventListener("click", () => {
      if (!confirmAction("Rimuovere questo attacco?")) return;
      npc.attacks.splice(idx, 1);
      persistDebounced();
      renderAttacks(npc, parseRoll, addHistory);
    });
    attackListEl.appendChild(li);
  });
};

const loadNpc = (helpers = {}) => {
  ensureNpc();
  const npc = getCurrentNpc();
  if (!npc) return;
  if (npcName) npcName.value = npc.name || "";
  if (npcType) npcType.value = npc.type || "";
  if (npcAC) npcAC.value = Number.isFinite(npc.ac) ? npc.ac : "";
  if (npcHP) npcHP.value = Number.isFinite(npc.hp) ? npc.hp : "";
  if (npcHPCurrent)
    npcHPCurrent.value = Number.isFinite(npc.hpCurrent) ? npc.hpCurrent : "";
  if (npcSpeed) npcSpeed.value = npc.speed || "";
  if (npcTags) npcTags.value = npc.tags || "";
  if (npcNotes) npcNotes.value = npc.notes || "";
  if (npcSTR) npcSTR.value = Number.isFinite(npc.str) ? npc.str : "";
  if (npcDEX) npcDEX.value = Number.isFinite(npc.dex) ? npc.dex : "";
  if (npcCON) npcCON.value = Number.isFinite(npc.con) ? npc.con : "";
  if (npcINT) npcINT.value = Number.isFinite(npc.int) ? npc.int : "";
  if (npcWIS) npcWIS.value = Number.isFinite(npc.wis) ? npc.wis : "";
  if (npcCHA) npcCHA.value = Number.isFinite(npc.cha) ? npc.cha : "";
  renderAttacks(npc, helpers.parseRoll, helpers.addHistory);
  renderNpcList();
};

const importNpcFromFile = (file, helpers) => {
  if (file.size > 2_000_000) {
    alert("File NPC troppo grande (>2MB).");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = Array.isArray(parsed?.npcs) ? parsed.npcs : parsed;
      if (!Array.isArray(imported)) throw new Error("Formato non valido");
      const clean = imported
        .map((n) => ({
          id: n.id || uid(),
          name: typeof n.name === "string" ? n.name : "Senza nome",
          type: typeof n.type === "string" ? n.type : "",
          ac: typeof n.ac === "number" || typeof n.ac === "string" ? n.ac : "",
          hp: typeof n.hp === "number" || typeof n.hp === "string" ? n.hp : "",
          speed: typeof n.speed === "string" ? n.speed : "",
          tags: typeof n.tags === "string" ? n.tags : "",
          notes: typeof n.notes === "string" ? n.notes : "",
          str:
            typeof n.str === "number" || typeof n.str === "string" ? n.str : "",
          dex:
            typeof n.dex === "number" || typeof n.dex === "string" ? n.dex : "",
          con:
            typeof n.con === "number" || typeof n.con === "string" ? n.con : "",
          int:
            typeof n.int === "number" || typeof n.int === "string" ? n.int : "",
          wis:
            typeof n.wis === "number" || typeof n.wis === "string" ? n.wis : "",
          cha:
            typeof n.cha === "number" || typeof n.cha === "string" ? n.cha : "",
          attacks: Array.isArray(n.attacks)
            ? n.attacks.map((a) => ({
                name: typeof a.name === "string" ? a.name : "",
                toHit: Number(a.toHit) || 0,
                damage: typeof a.damage === "string" ? a.damage : "",
              }))
            : [],
          ts: n.ts || Date.now(),
        }))
        .filter((n) => n.name || n.notes);
      if (!clean.length) throw new Error("Nessuna scheda valida");
      const existingIds = new Set(state.npcs.map((n) => n.id));
      const merged = [...state.npcs];
      clean.forEach((n) => {
        const id = existingIds.has(n.id) ? uid() : n.id;
        merged.push({ ...n, id });
      });
      state.npcs = merged;
      if (!state.currentNpcId && state.npcs.length) {
        state.currentNpcId = state.npcs[0].id;
      }
      persistDebounced();
      loadNpc(helpers);
      alert(
        `Import NPC completato: ${clean.length} schede aggiunte, totale ${state.npcs.length}.`,
      );
    } catch (err) {
      alert("Import NPC fallito: " + err.message);
    }
  };
  reader.readAsText(file);
};

export const initNpcs = (helpers) => {
  ensureNpc();
  renderNpcList();
  loadNpc(helpers);

  const saveNpcTimeouts = { id: null };
  const queueSaveNpc = () => {
    clearTimeout(saveNpcTimeouts.id);
    saveNpcTimeouts.id = setTimeout(() => {
      const npc = getCurrentNpc();
      if (!npc) return;
      npc.name = npcName?.value.trim() || "Senza nome";
      npc.type = npcType?.value.trim() || "";
      npc.ac = Number(npcAC?.value);
      npc.hp = Number(npcHP?.value);
      npc.lastHp = npc.hpCurrent;
      npc.hpCurrent =
        npcHPCurrent?.value === "" ? null : Number(npcHPCurrent?.value);
      npc.speed = npcSpeed?.value.trim() || "";
      npc.tags = npcTags?.value.trim() || "";
      npc.notes = npcNotes?.value || "";
      npc.str = Number(npcSTR?.value);
      npc.dex = Number(npcDEX?.value);
      npc.con = Number(npcCON?.value);
      npc.int = Number(npcINT?.value);
      npc.wis = Number(npcWIS?.value);
      npc.cha = Number(npcCHA?.value);
      npc.ts = Date.now();
      persistDebounced();
      renderNpcList();
    }, 250);
  };

  newNpcBtn?.addEventListener("click", () => {
    const id = uid();
    state.npcs.unshift({
      id,
      name: `Creatura ${state.npcs.length + 1}`,
      type: "",
      ac: "",
      hp: "",
      hpCurrent: "",
      lastHp: null,
      speed: "",
      tags: "",
      notes: "",
      str: "",
      dex: "",
      con: "",
      int: "",
      wis: "",
      cha: "",
      attacks: [],
      ts: Date.now(),
    });
    state.currentNpcId = id;
    persistDebounced();
    loadNpc(helpers);
  });

  deleteNpcBtn?.addEventListener("click", () => {
    if (!confirmAction("Eliminare questa scheda NPC?")) return;
    state.npcs = state.npcs.filter((n) => n.id !== state.currentNpcId);
    state.currentNpcId = state.npcs[0]?.id || null;
    ensureNpc();
    persistDebounced();
    loadNpc(helpers);
  });

  [
    npcName,
    npcType,
    npcAC,
    npcHP,
    npcSpeed,
    npcTags,
    npcNotes,
    npcSTR,
    npcDEX,
    npcCON,
    npcINT,
    npcWIS,
    npcCHA,
  ].forEach((elRef) => {
    elRef?.addEventListener("input", queueSaveNpc);
  });

  npcSearch?.addEventListener("input", renderNpcList);
  npcSort?.addEventListener("change", () => {
    state.preferences.npcSort = npcSort.value;
    persistDebounced();
    renderNpcList();
  });

  exportNpc?.addEventListener("click", () => {
    const npc = getCurrentNpc();
    if (!npc) return;
    const payload = { ...npc };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (npc.name || "creatura").replace(/\s+/g, "-").toLowerCase();
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  exportAllNpc?.addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), npcs: state.npcs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arcanadesk-npc.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  importAllNpc?.addEventListener("click", () => npcImportInput?.click());
  npcImportInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importNpcFromFile(file, helpers);
    npcImportInput.value = "";
  });

  document.querySelectorAll(".hp-controls [data-hp]")?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.hp);
      const npc = getCurrentNpc();
      if (!npc) return;
      npc.lastHp = Number.isFinite(npc.hpCurrent) ? npc.hpCurrent : npc.hp || 0;
      const base = Number.isFinite(npc.hpCurrent) ? npc.hpCurrent : npc.hp || 0;
      npc.hpCurrent = Math.max(0, base + delta);
      persistDebounced();
      loadNpc(helpers);
    });
  });

  npcHpUndo?.addEventListener("click", () => {
    const npc = getCurrentNpc();
    if (!npc || npc.lastHp === null || npc.lastHp === undefined) return;
    npc.hpCurrent = npc.lastHp;
    npc.lastHp = null;
    persistDebounced();
    loadNpc(helpers);
  });

  addAttackBtn?.addEventListener("click", () => {
    const npc = getCurrentNpc();
    if (!npc) return;
    const name = atkName?.value.trim();
    const toHit = Number(atkToHit?.value) || 0;
    const damage = atkDamage?.value.trim();
    if (!name) return alert("Nome attacco richiesto.");
    npc.attacks = npc.attacks || [];
    npc.attacks.push({ name, toHit, damage });
    if (atkName) atkName.value = "";
    if (atkToHit) atkToHit.value = "";
    if (atkDamage) atkDamage.value = "";
    persistDebounced();
    renderAttacks(npc, helpers.parseRoll, helpers.addHistory);
  });
};
