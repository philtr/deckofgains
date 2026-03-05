export function createAutoDrawController({
  getState,
  onAutoDraw,
  persistRemainingSeconds,
  defaultIntervalSeconds,
  drawButtonDefaultLabel = 'Draw Cards',
  autoDrawRemainingUpdateMs = 1000,
  windowRef = window
}) {
  let autoDrawTimeoutId = null;
  let autoDrawCountdownIntervalId = null;
  let autoDrawNextTriggerAt = null;
  let autoDrawRemainingIntervalId = null;

  function getDrawButton() {
    return document.getElementById('draw-button');
  }

  function resetDrawButtonLabel() {
    const button = getDrawButton();
    if (button) {
      button.textContent = drawButtonDefaultLabel;
    }
  }

  function updateDrawButtonLabel() {
    const button = getDrawButton();
    if (!button) {
      return;
    }

    if (!autoDrawNextTriggerAt) {
      button.textContent = drawButtonDefaultLabel;
      return;
    }

    const remainingMs = Math.max(0, autoDrawNextTriggerAt - Date.now());
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const paddedSeconds = String(seconds).padStart(2, '0');
    button.textContent = `${drawButtonDefaultLabel} (${minutes}:${paddedSeconds})`;
  }

  function stopAutoDrawCountdown({ preserveLabel = false } = {}) {
    if (autoDrawCountdownIntervalId !== null) {
      windowRef.clearInterval(autoDrawCountdownIntervalId);
      autoDrawCountdownIntervalId = null;
    }

    autoDrawNextTriggerAt = null;

    if (!preserveLabel) {
      resetDrawButtonLabel();
    }
  }

  function getAutoDrawRemainingSeconds() {
    if (!autoDrawNextTriggerAt) {
      return null;
    }

    const remainingMs = autoDrawNextTriggerAt - Date.now();
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    return remainingSeconds > 0 ? remainingSeconds : null;
  }

  function updateAutoDrawRemainingParam() {
    persistRemainingSeconds(getAutoDrawRemainingSeconds());
  }

  function stopAutoDrawRemainingPersistence({ preserveParam = false } = {}) {
    if (autoDrawRemainingIntervalId !== null) {
      windowRef.clearInterval(autoDrawRemainingIntervalId);
      autoDrawRemainingIntervalId = null;
    }

    if (!preserveParam) {
      persistRemainingSeconds(null);
    }
  }

  function startAutoDrawRemainingPersistence() {
    stopAutoDrawRemainingPersistence({ preserveParam: true });
    updateAutoDrawRemainingParam();
    autoDrawRemainingIntervalId = windowRef.setInterval(() => {
      updateAutoDrawRemainingParam();
    }, autoDrawRemainingUpdateMs);
  }

  function startAutoDrawCountdown(deadline) {
    stopAutoDrawCountdown({ preserveLabel: true });

    autoDrawNextTriggerAt = deadline;
    updateDrawButtonLabel();

    const tick = () => {
      if (!autoDrawNextTriggerAt) {
        stopAutoDrawCountdown();
        return;
      }

      updateDrawButtonLabel();

      if (autoDrawNextTriggerAt - Date.now() <= 0) {
        // Allow the timeout handler to reset the label after the draw.
        updateDrawButtonLabel();
      }
    };

    autoDrawCountdownIntervalId = windowRef.setInterval(tick, 250);
  }

  function clear({ preserveCountdownLabel = false, preserveRemainingParam = false } = {}) {
    if (autoDrawTimeoutId !== null) {
      windowRef.clearTimeout(autoDrawTimeoutId);
      autoDrawTimeoutId = null;
    }

    stopAutoDrawCountdown({ preserveLabel: preserveCountdownLabel });
    stopAutoDrawRemainingPersistence({ preserveParam: preserveRemainingParam });
  }

  function shouldContinue(state) {
    if (!state?.started) {
      return false;
    }

    const autoDraw = state.configuration?.autoDraw ?? {};
    if (!autoDraw.enabled) {
      return false;
    }

    const intervalSeconds = Number.parseInt(autoDraw.intervalSeconds, 10);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      return false;
    }

    if (!state.configuration?.endless && state.deck.length === 0) {
      return false;
    }

    return true;
  }

  function schedule(state, { remainingSeconds } = {}) {
    const canContinue = shouldContinue(state);
    clear({
      preserveCountdownLabel: canContinue,
      preserveRemainingParam: canContinue
    });

    if (!canContinue) {
      return;
    }

    const configuredSeconds = Number.parseInt(state.configuration.autoDraw.intervalSeconds, 10);
    const fallbackSeconds = Number.isFinite(configuredSeconds) && configuredSeconds > 0
      ? configuredSeconds
      : defaultIntervalSeconds;
    const requestedRemaining = Number.parseInt(remainingSeconds, 10);
    const intervalSeconds = Number.isFinite(requestedRemaining) && requestedRemaining > 0
      ? Math.min(fallbackSeconds, requestedRemaining)
      : fallbackSeconds;
    const intervalMs = intervalSeconds * 1000;
    const deadline = Date.now() + intervalMs;

    autoDrawTimeoutId = windowRef.setTimeout(() => {
      autoDrawTimeoutId = null;
      stopAutoDrawCountdown({ preserveLabel: true });
      const currentState = getState();
      if (!shouldContinue(currentState)) {
        clear();
        return;
      }
      onAutoDraw();
    }, intervalMs);

    startAutoDrawCountdown(deadline);
    startAutoDrawRemainingPersistence();
  }

  function ensure(state, { remainingSeconds } = {}) {
    if (!shouldContinue(state)) {
      clear();
      return;
    }

    if (autoDrawTimeoutId === null) {
      schedule(state, { remainingSeconds });
    }
  }

  function refreshDrawButtonLabel() {
    updateDrawButtonLabel();
  }

  function hasActiveCountdown() {
    return autoDrawNextTriggerAt !== null;
  }

  return {
    clear,
    ensure,
    schedule,
    refreshDrawButtonLabel,
    hasActiveCountdown
  };
}
