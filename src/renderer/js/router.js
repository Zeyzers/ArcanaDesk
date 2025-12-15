import { state, persistDebounced } from "./state.js";

export const initRouter = ({ rollInput }) => {
  const views = document.querySelectorAll("[data-view]");
  const navButtons = document.querySelectorAll("[data-nav]");

  const setView = (view) => {
    views.forEach((v) => v.classList.toggle("active", v.dataset.view === view));
    navButtons.forEach((btn) =>
      btn.classList.toggle(
        "active",
        btn.dataset.nav === view && btn.closest(".quick-links"),
      ),
    );
    state.preferences.lastView = view;
    persistDebounced();
    if (view === "dice" && rollInput) {
      rollInput.focus();
    }
  };

  navButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      setView(btn.dataset.nav);
    }),
  );

  return { setView };
};
