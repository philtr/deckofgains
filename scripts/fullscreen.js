// Fullscreen is a local presentation choice, never part of game or room state.
export function createFullscreenController(app) {
  let active = false;
  let nativeEntered = false;
  let toggle;
  let finish;

  function setActive(value) {
    active = value;
    app.classList.toggle("is-fullscreen", value);
    document.body.classList.toggle("workout-fullscreen", value);
    toggle.textContent = value ? "Exit full screen" : "Full screen";
    toggle.setAttribute("aria-pressed", String(value));
  }
  async function exit() {
    setActive(false);
    if (document.fullscreenElement === app) {
      try {
        await document.exitFullscreen();
      } catch {
        /* The browser may already have exited. */
      }
    }
    nativeEntered = false;
    toggle.focus({ preventScroll: true });
  }
  async function enter() {
    setActive(true);
    // Mobile browsers without this API still get the viewport-filling layout.
    if (app.requestFullscreen && document.fullscreenEnabled !== false) {
      try {
        await app.requestFullscreen({ navigationUI: "hide" });
        if (!active && document.fullscreenElement === app)
          await document.exitFullscreen();
      } catch {
        /* Keep the useful viewport layout if native fullscreen is unavailable. */
      }
    }
  }
  function fullscreenChanged() {
    if (document.fullscreenElement === app) nativeEntered = true;
    else if (nativeEntered) {
      nativeEntered = false;
      setActive(false);
      toggle.focus({ preventScroll: true });
    }
  }
  function keydown(event) {
    if (event.key === "Escape" && active) void exit();
  }
  function mount() {
    toggle = document.createElement("button");
    toggle.id = "fullscreen-toggle";
    toggle.type = "button";
    toggle.textContent = "Full screen";
    toggle.setAttribute("aria-pressed", "false");
    toggle.addEventListener("click", () => {
      if (active) void exit();
      else void enter();
    });
    finish = document.createElement("button");
    finish.id = "fullscreen-finish";
    finish.type = "button";
    finish.textContent = "Finish workout";
    finish.hidden = true;
    finish.addEventListener("click", async () => {
      await exit();
      document.querySelector("#instructions button")?.focus();
    });
    app.prepend(toggle, finish);
    document.addEventListener("fullscreenchange", fullscreenChanged);
    document.addEventListener("keydown", keydown);
  }
  function update(model) {
    finish.hidden = !model.complete;
    if (!model.started && active) void exit();
  }
  return { mount, update };
}
