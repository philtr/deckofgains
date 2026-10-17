import { createFullscreenController } from "./fullscreen.js";
import { defaultPresentation, presentationModes } from "./constants.js";

const preferenceKey = "deckOfGains:presentation";
export function createPresentationController({ dispatch }) {
  let selected = defaultPresentation;
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (presentationModes.includes(saved)) selected = saved;
  } catch {
    /* Private browsing can deny storage. */
  }
  let renderer = null;
  let generation = 0;
  let model;
  let options = {};
  let loading = false;
  let failed = false;
  let table;
  let notice;
  const controls = [];
  const fullscreen = createFullscreenController(document.getElementById("app"));

  function dispose() {
    generation++;
    loading = false;
    renderer?.dispose();
    renderer = null;
    table?.replaceChildren();
  }
  function fallback() {
    failed = true;
    dispose();
    document.body.dataset.presentation = "classic";
    notice.textContent =
      "3D is unavailable. Your workout continues in Classic view.";
    controls.forEach((select) => (select.value = "classic"));
  }
  function switchView(event) {
    selected = event.target.value;
    failed = false;
    notice.textContent = "";
    try {
      localStorage.setItem(preferenceKey, selected);
    } catch {
      /* Optional preference. */
    }
    dispose();
    controls.forEach((select) => (select.value = selected));
    update(model, { ...options, animate: false, events: [] });
  }
  function mount() {
    fullscreen.mount();
    notice = document.createElement("p");
    notice.id = "presentation-notice";
    notice.className = "presentation-notice";
    notice.setAttribute("role", "status");
    document.getElementById("page-content").append(notice);
    for (const id of ["configuration-screen", "app"]) {
      const label = document.createElement("label");
      label.className = "presentation-choice";
      label.append("View ");
      const select = document.createElement("select");
      select.dataset.presentationSelect = "";
      select.setAttribute("aria-label", "Workout view");
      select.innerHTML =
        '<option value="three">3D table</option><option value="classic">Classic</option>';
      select.value = selected;
      select.addEventListener("change", switchView);
      controls.push(select);
      label.append(select);
      document.getElementById(id).prepend(label);
    }
    table = document.createElement("div");
    table.id = "tabletop";
    table.setAttribute("role", "group");
    table.setAttribute("aria-label", "Workout card table");
    document.getElementById("workout-grid").prepend(table);
    document.getElementById("rep-summary").setAttribute("aria-live", "polite");
    document.body.dataset.presentation = "classic";
  }
  function update(nextModel, nextOptions = {}) {
    model = nextModel;
    options = nextOptions;
    if (!table || !model) return;
    fullscreen.update(model);
    if (!model.started || selected !== "three" || failed) {
      if (renderer || loading) dispose();
      document.body.dataset.presentation = "classic";
      return;
    }
    table.setAttribute(
      "aria-label",
      model.cards.length
        ? model.cards.map((card) => `${card.number} of ${card.suit}`).join(", ")
        : "Tap the deck or use Draw Cards to deal",
    );
    table.dataset.cardCount = String(model.cards.length);
    if (renderer) {
      renderer.update(model, options);
      return;
    }
    if (loading) return;
    loading = true;
    const ticket = ++generation;
    import("./tabletop.js")
      .then(({ createTabletop }) => {
        if (ticket !== generation) return;
        renderer = createTabletop({
          container: table,
          dispatch,
          onFailure: fallback,
        });
        loading = false;
        document.body.dataset.presentation = "three";
        renderer.update(model, { ...options, animate: false });
      })
      .catch(() => {
        if (ticket === generation) fallback();
      });
  }
  return { mount, update, dispose };
}
