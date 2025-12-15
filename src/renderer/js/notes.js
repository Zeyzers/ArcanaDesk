import { state, persistDebounced, confirmAction, el, uid } from "./state.js";

const dmNotes = el("dmNotes");
const noteTitle = el("noteTitle");
const noteListEl = el("noteList");
const newNoteBtn = el("newNote");
const deleteNoteBtn = el("deleteNote");
const noteSearch = el("noteSearch");
const exportNotes = el("exportNotes");
const exportAllNotes = el("exportAllNotes");
const importAllNotes = el("importAllNotes");
const noteImportInput = el("noteImportInput");
const saveStatus = el("saveStatus");
const confirmDeletesToggle = el("confirmDeletes");

const ensureNote = () => {
  if (!state.notes.length) {
    const id = uid();
    state.notes = [{ id, title: "Nuova nota", content: "", ts: Date.now() }];
    state.currentNoteId = id;
    persistDebounced();
  }
  if (!state.currentNoteId) {
    state.currentNoteId = state.notes[0].id;
    persistDebounced();
  }
};

const getCurrentNote = () => state.notes.find((n) => n.id === state.currentNoteId);

const renderNoteList = () => {
  if (!noteListEl) return;
  noteListEl.innerHTML = "";
  const term = (noteSearch?.value || "").toLowerCase().trim();
  state.notes
    .filter((n) => {
      if (!term) return true;
      return (
        (n.title || "").toLowerCase().includes(term) ||
        (n.content || "").toLowerCase().includes(term)
      );
    })
    .forEach((n) => {
      const li = document.createElement("li");
      li.className = n.id === state.currentNoteId ? "active" : "";
      const titleEl = document.createElement("div");
      titleEl.className = "note-title";
      titleEl.textContent = n.title || "Senza titolo";
      const snippetEl = document.createElement("div");
      snippetEl.className = "note-snippet";
      const firstLine = (n.content || "").split(/\r?\n/)[0] || "";
      const snippet = firstLine.trim().slice(0, 90);
      snippetEl.textContent = snippet;
      li.appendChild(titleEl);
      li.appendChild(snippetEl);
      li.addEventListener("click", () => {
        state.currentNoteId = n.id;
        persistDebounced();
        loadNote();
      });
      noteListEl.appendChild(li);
    });
};

const loadNote = () => {
  ensureNote();
  const note = getCurrentNote();
  if (!note) return;
  if (noteTitle) noteTitle.value = note.title || "";
  if (dmNotes) dmNotes.value = note.content || "";
  renderNoteList();
};

let saveTimeout;
const queueSave = () => {
  clearTimeout(saveTimeout);
  if (saveStatus) saveStatus.textContent = "Salvataggio...";
  saveTimeout = setTimeout(() => {
    const note = getCurrentNote();
    if (!note) return;
    note.title = noteTitle?.value.trim() || "Senza titolo";
    note.content = dmNotes?.value || "";
    note.ts = Date.now();
    persistDebounced();
    renderNoteList();
    if (saveStatus) saveStatus.textContent = "Auto-save attivo";
  }, 350);
};

const importNotesFromFile = (file) => {
  if (file.size > 2_000_000) {
    alert("File troppo grande (>2MB).");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = Array.isArray(parsed?.notes) ? parsed.notes : parsed;
      if (!Array.isArray(imported)) throw new Error("Formato non valido");
      const cleanNotes = imported
        .map((n) => ({
          id: n.id || uid(),
          title: typeof n.title === "string" ? n.title : "Senza titolo",
          content: typeof n.content === "string" ? n.content : "",
          ts: n.ts || Date.now(),
        }))
        .filter((n) => n.title || n.content);
      if (!cleanNotes.length) throw new Error("Nessuna nota valida trovata");
      const existingIds = new Set(state.notes.map((n) => n.id));
      const merged = [...state.notes];
      cleanNotes.forEach((n) => {
        const id = existingIds.has(n.id) ? uid() : n.id;
        merged.push({ ...n, id });
      });
      state.notes = merged;
      if (!state.currentNoteId && state.notes.length) {
        state.currentNoteId = state.notes[0].id;
      }
      persistDebounced();
      loadNote();
      alert(
        `Import note completato: ${cleanNotes.length} note aggiunte, totale ${state.notes.length}.`,
      );
    } catch (err) {
      alert("Import fallito: " + err.message);
    }
  };
  reader.readAsText(file);
};

export const initNotes = () => {
  ensureNote();
  loadNote();
  if (confirmDeletesToggle) {
    confirmDeletesToggle.checked = state.preferences.confirmDeletes !== false;
  }
  noteTitle?.addEventListener("input", queueSave);
  dmNotes?.addEventListener("input", queueSave);
  noteSearch?.addEventListener("input", renderNoteList);

  newNoteBtn?.addEventListener("click", () => {
    const id = uid();
    state.notes.unshift({
      id,
      title: `Nota ${state.notes.length + 1}`,
      content: "",
      ts: Date.now(),
    });
    state.currentNoteId = id;
    persistDebounced();
    loadNote();
  });

  deleteNoteBtn?.addEventListener("click", () => {
    if (!confirmAction("Eliminare questa nota?")) return;
    state.notes = state.notes.filter((n) => n.id !== state.currentNoteId);
    state.currentNoteId = state.notes[0]?.id || null;
    ensureNote();
    persistDebounced();
    loadNote();
  });

  exportNotes?.addEventListener("click", () => {
    const note = getCurrentNote();
    const title = note?.title || "Nota";
    const blob = new Blob([`# ${title}\n\n${note?.content || ""}\n`], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase() || "nota"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  exportAllNotes?.addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      notes: state.notes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arcanadesk-notes.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  importAllNotes?.addEventListener("click", () => {
    noteImportInput?.click();
  });

  noteImportInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importNotesFromFile(file);
    noteImportInput.value = "";
  });

  confirmDeletesToggle?.addEventListener("change", () => {
    state.preferences.confirmDeletes = confirmDeletesToggle.checked;
    persistDebounced();
  });
};
