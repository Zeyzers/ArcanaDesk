import { state, uid, persistDebounced, escapeHtml, confirmAction, el } from "./state.js";

const rollInput = el("rollInput");
const rollButton = el("rollButton");
const historyList = el("historyList");
const diceStats = el("diceStats");
const clearHistory = el("clearHistory");

const enableRollInput = () => {
  if (!rollInput) return;
  rollInput.disabled = false;
  rollInput.readOnly = false;
  rollInput.removeAttribute("disabled");
};

const parseRoll = (formula) => {
  const normalizeShorthand = (term) => {
    if (/^adv$/i.test(term)) return "2d20kh1";
    if (/^dis$/i.test(term)) return "2d20kl1";
    return term;
  };

  const trimmed = formula.replace(/\s+/g, "");
  const parts = trimmed.match(/[+-]?[^+-]+/g);
  if (!parts) throw new Error("Formula non valida");

  let total = 0;
  const breakdown = [];

  for (let rawTerm of parts) {
    let sign = 1;
    if (rawTerm.startsWith("-")) {
      sign = -1;
      rawTerm = rawTerm.slice(1);
    } else if (rawTerm.startsWith("+")) {
      rawTerm = rawTerm.slice(1);
    }

    const term = normalizeShorthand(rawTerm);

    const diceMatch = term.match(
      /^(\d*)d(\d+)((k[hl]|d[hl])(\d+))?(r(<=|>=|<|>|=)?(\d+))?(!)?$/i,
    );
    if (diceMatch) {
      const count = parseInt(diceMatch[1] || "1", 10);
      const faces = parseInt(diceMatch[2], 10);
      const kdCode = diceMatch[4]?.toLowerCase(); // kh, kl, dh, dl
      const kdNum = diceMatch[5] ? parseInt(diceMatch[5], 10) : null;
      const rerollOp = diceMatch[7] || "=";
      const rerollVal = diceMatch[8] ? parseInt(diceMatch[8], 10) : null;
      const explode = Boolean(diceMatch[9]);

      const shouldReroll = (value) => {
        if (!rerollVal && rerollVal !== 0) return false;
        switch (rerollOp) {
          case "<=":
            return value <= rerollVal;
          case ">=":
            return value >= rerollVal;
          case "<":
            return value < rerollVal;
          case ">":
            return value > rerollVal;
          case "=":
          default:
            return value === rerollVal;
        }
      };

      // detect impossible reroll conditions (e.g., r>=6 on a d6)
      if (rerollVal || rerollVal === 0) {
        const allReroll = Array.from({ length: faces }, (_, i) => i + 1).every(
          shouldReroll,
        );
        if (allReroll) {
          throw new Error(
            `Condizione di reroll impossibile per d${faces}: ${term}`,
          );
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
        if (kdCode === "kh") {
          kept = [...sorted].reverse().slice(0, kdNum);
        } else if (kdCode === "kl") {
          kept = sorted.slice(0, kdNum);
        } else if (kdCode === "dh") {
          kept = [...sorted].reverse().slice(kdNum).reverse();
        } else if (kdCode === "dl") {
          kept = sorted.slice(kdNum);
        }
      }

      const subtotal = kept.reduce((a, b) => a + b, 0) * sign;
      total += subtotal;
      breakdown.push({
        type: "dice",
        raw: term,
        rolls,
        kept,
        subtotal,
        faces,
        count,
        sign,
      });
      continue;
    }

    const numeric = Number(term);
    if (Number.isFinite(numeric)) {
      total += numeric * sign;
      breakdown.push({ type: "flat", raw: term, value: numeric * sign });
      continue;
    }

    throw new Error("Parte non riconosciuta: " + term);
  }

  return { total, breakdown };
};

const renderHistory = () => {
  historyList.innerHTML = "";
  if (!state.diceHistory.length) {
    historyList.innerHTML = '<li class="empty">Nessun tiro ancora.</li>';
    diceStats.textContent = "";
    enableRollInput();
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

  state.diceHistory
    .slice()
    .reverse()
    .forEach((entry) => {
      const li = document.createElement("li");
      li.className = "history-item";
      const left = document.createElement("div");
      const formulaDiv = document.createElement("div");
      formulaDiv.className = "formula mono";
      formulaDiv.textContent = entry.formula;
      const details = document.createElement("div");
      details.className = "muted tiny";

      entry.breakdown.forEach((p, idx) => {
        if (idx > 0) details.append(" + ");
        if (p.type !== "dice") {
          details.append(document.createTextNode(String(p.value)));
          return;
        }
        const keptCopy = [...p.kept];
        const dropped = [];
        p.rolls.forEach((r) => {
          const found = keptCopy.indexOf(r);
          if (found !== -1) {
            keptCopy.splice(found, 1);
          } else {
            dropped.push(r);
          }
        });
        const rawSpan = document.createElement("span");
        rawSpan.textContent = `${p.raw} [`;
        details.append(rawSpan);
        if (p.kept.length) {
          const keptSpan = document.createElement("span");
          keptSpan.className = "kept";
          keptSpan.textContent = p.kept.join(",");
          details.append(keptSpan);
        }
        if (dropped.length) {
          const sep = document.createTextNode(p.kept.length ? " " : "");
          details.append(sep);
          const dropSpan = document.createElement("span");
          dropSpan.className = "dropped";
          dropSpan.textContent = `(${dropped.join(",")})`;
          details.append(dropSpan);
        }
        const close = document.createTextNode("]");
        details.append(close);
      });

      left.appendChild(formulaDiv);
      left.appendChild(details);
      const totalDiv = document.createElement("div");
      totalDiv.className = "total";
      totalDiv.textContent = entry.total;
      li.appendChild(left);
      li.appendChild(totalDiv);
      historyList.appendChild(li);
    });
};

const addHistory = (formula, result) => {
  const entry = {
    id: uid(),
    formula,
    total: result.total,
    breakdown: result.breakdown,
    ts: Date.now(),
  };
  state.diceHistory.push(entry);
  if (state.diceHistory.length > 40) state.diceHistory.shift();
  persistDebounced();
  renderHistory();
};

export const initDice = () => {
  enableRollInput();
  renderHistory();

  rollButton?.addEventListener("click", () => {
    const formula = rollInput.value.trim();
    if (!formula) return;
    try {
      const result = parseRoll(formula);
      addHistory(formula, result);
    } catch (e) {
      alert(e.message);
    }
  });

  rollInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      rollButton.click();
    }
  });

  document.querySelectorAll("[data-die]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const die = btn.dataset.die;
      rollInput.value = rollInput.value
        ? `${rollInput.value}+1${die}`
        : `1${die}`;
      rollButton.click();
    });
  });

  clearHistory?.addEventListener("click", () => {
    if (!confirmAction("Confermi la cancellazione della cronologia dadi?"))
      return;
    state.diceHistory = [];
    persistDebounced();
    renderHistory();
    enableRollInput();
    if (rollInput) {
      rollInput.value = "";
      rollInput.focus();
    }
  });

  return { parseRoll, addHistory, renderHistory, enableRollInput };
};
