import { state, loadPersistedState, el } from "./js/state.js";
import { initRouter } from "./js/router.js";
import { initDice } from "./js/dice.js";
import { initTurns } from "./js/turns.js";
import { initTimers } from "./js/timers.js";
import { initNotes } from "./js/notes.js";
import { initNpcs } from "./js/npcs.js";

const bootstrap = async () => {
  await loadPersistedState();

  const { setView } = initRouter({ rollInput: el("rollInput") });
  const diceApi = initDice();
  initTurns();
  initTimers();
  initNotes();
  initNpcs({ parseRoll: diceApi.parseRoll, addHistory: diceApi.addHistory });

  const hasView = document.querySelector(
    `[data-view="${state.preferences.lastView}"]`,
  );
  setView(hasView ? state.preferences.lastView : "hub");
};

bootstrap();
