import { dispatchGame, workoutView } from "./gameRuntime.js";
import { createPresentationController } from "./presentation.js";
import {
  readUrlState,
  buildStateUrl,
  migrateLegacyUrlState,
} from "./urlState.js";
import {
  suits,
  defaultMultipliers,
  totalRounds,
  defaultAutoDrawIntervalSeconds,
} from "./constants.js";
import { applyTheme, deriveInitialTheme } from "./theme.js";
import { buildDeck, calculateTotals, createCardElement } from "./deck.js";
import {
  bindStateToWindow,
  getState,
  replaceState,
  setDeck,
  subscribe,
  suppressNotifications,
  updateConfiguration,
} from "./workoutState.js";
import {
  deserializeState,
  persistState,
  replaceStateWithAutoDrawRemaining,
  serializeState,
  resolveRoomCode,
  subscribeToPopState,
} from "./persistence.js";
import {
  loadStoredConfiguration,
  storeConfiguration,
} from "./configStorage.js";
import {
  normalizeConfiguration,
  serializeConfiguration,
} from "./configuration.js";
import { createAutoDrawController } from "./autoDrawController.js";
import { createRoomSyncController } from "./roomSyncController.js";
import {
  populateConfigurationForm as renderConfigurationForm,
  readAutoDrawIntervalFromInputs,
  readConfigurationForm,
  renderWorkoutFromState as renderWorkoutView,
  showConfigurationScreen,
  updateAutoDrawIntervalVisibility,
  updateRoundTitle as renderRoundTitle,
} from "./workoutView.js";
import { playDrawSound } from "./audio.js";
import { checkSyncHealth, createRoomSync } from "./syncClient.js";
import {
  createFeedbackPrompt,
  hasSubmittedFeedback,
  rememberFeedbackSubmission,
} from "./feedbackPrompt.js";

import Analytics from "./analytics.js";

const DRAW_BUTTON_DEFAULT_LABEL = "Draw Cards";
const AUTO_DRAW_REMAINING_UPDATE_MS = 1000;

function getAnalyticsMode(configuration) {
  return configuration.endless ? "endless" : "finite";
}

let configurationListenersInitialized = false;
let lastStoredConfiguration = null;

const autoDrawController = createAutoDrawController({
  getState,
  onAutoDraw: () => {
    drawCards({ trigger: "auto" });
  },
  persistRemainingSeconds: (remainingSeconds) => {
    replaceStateWithAutoDrawRemaining(getState(), remainingSeconds);
  },
  defaultIntervalSeconds: defaultAutoDrawIntervalSeconds,
  drawButtonDefaultLabel: DRAW_BUTTON_DEFAULT_LABEL,
  autoDrawRemainingUpdateMs: AUTO_DRAW_REMAINING_UPDATE_MS,
});

const roomSyncController = createRoomSyncController({
  resolveRoomCode,
  createRoomSync,
});

const presentation = createPresentationController({
  dispatch: (command) => {
    if (command.type === "DRAW") drawCards();
  },
});
let roomPending = false;
function setRoomPending(value) {
  roomPending = value;
  document.getElementById("start-workout").disabled = value;
  document.getElementById("draw-button").disabled = value;
  if (!value) autoDrawController.ensure(getState());
}

function setRoomStatus(message) {
  const status = document.getElementById("room-status");
  if (status) status.textContent = message;
}

function hasConfigurationParams(params) {
  if (!(params instanceof URLSearchParams)) {
    return false;
  }

  return [
    "theme",
    "rugged",
    "endless",
    "multipliers",
    "auto",
    "autoIntervalSeconds",
    "autoInterval",
    "autoRemainingSeconds",
  ].some((param) => params.has(param));
}

function resolveRoomCodeFromLocation() {
  return roomSyncController.resolveRoomCodeFromLocation();
}

function requestRoomJoin() {
  if (!roomSyncController.isEnabled()) {
    return;
  }
  const roomCode = roomSyncController.getRoomInputValue();
  void Analytics.roomJoinRequested();
  roomSyncController.updateRoomParam(roomCode);
  void syncToRoom(roomCode);
}

async function syncToRoom(roomCode) {
  if (roomCode) setRoomPending(true);
  let remoteState;
  setRoomStatus(roomCode ? "Connecting to group…" : "");
  try {
    remoteState = await roomSyncController.syncToRoom(
      roomCode,
      applyRemoteState,
    );
    setRoomStatus(roomCode ? "Group connection ready." : "");
  } finally {
    setRoomPending(false);
  }
  if (remoteState) {
    applyRemoteState(remoteState);
  }
  return remoteState;
}

function persistConfigurationIfChanged(configuration) {
  const serialized = serializeConfiguration(configuration);
  if (serialized === lastStoredConfiguration) {
    return;
  }

  storeConfiguration(configuration);
  lastStoredConfiguration = serialized;
}

function applyRemoteState(remoteState) {
  if (!remoteState || typeof remoteState !== "object") {
    return;
  }

  const previousState = getState();
  roomSyncController.markRemoteStateReceived();
  roomSyncController.suppressOutbound(() => {
    replaceState(remoteState);
    const state = getState();
    roomSyncController.rememberSyncedState(state);
    applyTheme(state.configuration?.theme);
    populateConfigurationForm(state);
    ensureConfigurationListeners();
    persistConfigurationIfChanged(state.configuration);
    if (state.started) {
      renderWorkoutFromState(state);
    } else {
      showConfigurationScreen();
      presentation.update(workoutView(state), {
        theme: state.configuration.theme,
      });
    }
    void Analytics.trackView(state.started ? "workout" : "setup");
    if (state.started && !previousState.started) {
      void Analytics.workoutResumed({
        source: "room",
        round: state.roundNumber,
        theme: state.configuration.theme,
        mode: getAnalyticsMode(state.configuration),
        has_room: true,
      });
    }
  });
}

function sendStateToSync(state) {
  roomSyncController.sendState(state);
}

function resolveConfigurationFromSources({
  params,
  sourceConfiguration,
  derivedTheme,
}) {
  const storedConfiguration = loadStoredConfiguration();
  const useStored = storedConfiguration && !hasConfigurationParams(params);
  const baseConfiguration = useStored
    ? storedConfiguration
    : sourceConfiguration;

  return {
    configuration: normalizeConfiguration({
      ...baseConfiguration,
      theme: baseConfiguration?.theme ?? derivedTheme,
    }),
  };
}

function populateConfigurationForm(state) {
  renderConfigurationForm({
    state,
    defaultAutoDrawIntervalSeconds,
    defaultMultipliers,
    roomCode: resolveRoomCodeFromLocation(),
    suits,
  });
}

function ensureConfigurationListeners() {
  if (configurationListenersInitialized) {
    return;
  }

  const joinRoomButton = document.getElementById("join-room");
  if (joinRoomButton) {
    joinRoomButton.addEventListener("click", () => {
      requestRoomJoin();
    });
  }

  const changeRoomButton = document.getElementById("change-room");
  if (changeRoomButton) {
    changeRoomButton.addEventListener("click", () => {
      if (!roomSyncController.isEnabled()) {
        return;
      }
      const roomInput = document.getElementById("room-code");
      const currentRoom = resolveRoomCodeFromLocation();
      if (roomInput) {
        roomInput.value = currentRoom ?? "";
      }
      roomSyncController.updateRoomParam(null);
      roomSyncController.stopSession();
      setRoomStatus("");
      if (roomInput) {
        roomInput.focus();
        roomInput.select();
      }
    });
  }

  const roomInput = document.getElementById("room-code");
  if (roomInput) {
    roomInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        requestRoomJoin();
      }
    });
  }

  suits.forEach((suit) => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      select.addEventListener("change", (event) => {
        const value = Number.parseInt(event.target.value, 10);
        updateConfiguration({
          multipliers: {
            [suit]: Number.isFinite(value) ? value : defaultMultipliers[suit],
          },
        });
      });
    }
  });

  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      const selected = event.target.value;
      const theme = applyTheme(selected);
      updateConfiguration({ theme });
    });
  });

  const endlessToggle = document.getElementById("endless-mode");
  if (endlessToggle) {
    endlessToggle.addEventListener("change", (event) => {
      updateConfiguration({ endless: event.target.checked });
    });
  }

  const autoDrawToggle = document.getElementById("auto-draw-enabled");
  if (autoDrawToggle) {
    autoDrawToggle.addEventListener("change", (event) => {
      const intervalSeconds = readAutoDrawIntervalFromInputs();
      updateConfiguration({
        autoDraw: {
          enabled: event.target.checked,
          intervalSeconds: intervalSeconds ?? defaultAutoDrawIntervalSeconds,
        },
      });
      updateAutoDrawIntervalVisibility(event.target.checked);
      populateConfigurationForm(getState());
    });
  }

  const minutesInput = document.getElementById("auto-draw-minutes");
  const secondsInput = document.getElementById("auto-draw-seconds");
  const handleIntervalChange = () => {
    const intervalSeconds = readAutoDrawIntervalFromInputs();
    updateConfiguration({
      autoDraw: {
        intervalSeconds: intervalSeconds ?? defaultAutoDrawIntervalSeconds,
      },
    });
    populateConfigurationForm(getState());
  };

  if (minutesInput && secondsInput) {
    [minutesInput, secondsInput].forEach((input) => {
      input.addEventListener("change", handleIntervalChange);
      input.addEventListener("blur", () => {
        const intervalSeconds = readAutoDrawIntervalFromInputs();
        if (!intervalSeconds) {
          populateConfigurationForm(getState());
        }
      });
    });
  }

  configurationListenersInitialized = true;
  if (typeof window !== "undefined") {
    window.__configListenersReady = true;
  }
}

function appendNewSetButton(instructionsDiv) {
  const newSetButton = document.createElement("button");
  newSetButton.textContent = "New Set";
  newSetButton.addEventListener("click", async () => {
    const state = getState();
    const roomCode = resolveRoomCodeFromLocation();
    void Analytics.newSetStarted({
      has_room: Boolean(roomCode),
      theme: state.configuration.theme,
      auto_draw: state.configuration.autoDraw.enabled,
    });
    const nextState = dispatchGame({ type: "RESET" }).state;
    nextState.configuration = state.configuration;

    if (roomCode) {
      roomSyncController.sendState(nextState);
    }

    const params = serializeState(
      {
        configuration: state.configuration,
        started: false,
      },
      { roomCode },
    );
    history.pushState(null, "", buildStateUrl(params));
    window.location.reload();
  });
  instructionsDiv.appendChild(newSetButton);
}

export function updateRoundTitle() {
  renderRoundTitle({
    state: getState(),
    totalRounds,
  });
}

function renderWorkoutFromState(state, { animate = false, events = [] } = {}) {
  const viewModel = workoutView(state);
  presentation.update(viewModel, {
    theme: state.configuration.theme,
    animate,
    events,
  });
  renderWorkoutView({
    appendNewSetButton,
    calculateTotals,
    createFeedbackPrompt: ({ onDismiss }) =>
      createFeedbackPrompt({
        onDismiss,
        onRating: (data) => {
          rememberFeedbackSubmission();
          void Analytics.feedbackRated(data);
        },
        onSubmit: (data) => {
          rememberFeedbackSubmission();
          void Analytics.feedbackSubmitted(data);
        },
        onSkip: () => {
          rememberFeedbackSubmission();
        },
      }),
    createCardElement,
    drawButtonDefaultLabel: DRAW_BUTTON_DEFAULT_LABEL,
    hasActiveCountdown: () => autoDrawController.hasActiveCountdown(),
    refreshDrawButtonLabel: () => autoDrawController.refreshDrawButtonLabel(),
    state,
    viewModel,
    shouldShowFeedback: () => !hasSubmittedFeedback(),
    totalRounds,
  });
}

export function initializeDeck() {
  const newDeck = buildDeck();
  setDeck(newDeck);
  return newDeck;
}

// Compatibility helper for existing integrations; rules remain in the engine.
export function doDrawCards() {
  const result = dispatchGame({ type: "DRAW" });
  return result.events[0]?.cards ?? [];
}

export function drawCards({ trigger = "manual" } = {}) {
  if (roomPending) return;
  const stateBeforeDraw = getState();
  const { events } = dispatchGame({ type: "DRAW" });
  const drawnCards = events.find((event) => event.type === "HAND_DRAWN")?.cards;
  if (!drawnCards) return;
  playDrawSound({ count: drawnCards.length });

  const stateAfterDraw = getState();
  const totals = calculateTotals(drawnCards, stateBeforeDraw.configuration);
  const repTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const finalDraw = events.some((event) => event.type === "WORKOUT_COMPLETED");

  void Analytics.roundDrawn({
    round: stateBeforeDraw.roundNumber,
    trigger,
    card_count: drawnCards.length,
    rep_total: repTotal,
    remaining_cards: stateAfterDraw.deck.length,
    final_draw: finalDraw,
  });
  if (finalDraw) {
    void Analytics.workoutCompleted({
      round_count: stateBeforeDraw.roundNumber,
      trigger,
      theme: stateBeforeDraw.configuration.theme,
      auto_draw: stateBeforeDraw.configuration.autoDraw.enabled,
      has_room: Boolean(resolveRoomCodeFromLocation()),
    });
  }

  renderWorkoutFromState(getState(), { animate: true, events });
  autoDrawController.schedule(getState());
}

export async function startWorkout() {
  if (roomPending) return;
  const roomCode = roomSyncController.getRoomInputValue();

  if (roomSyncController.isEnabled()) {
    roomSyncController.updateRoomParam(roomCode);
    const remoteState = await syncToRoom(roomCode);
    if (remoteState) {
      return;
    }
  }
  if (roomPending) return;
  const { multipliers, theme, endless, autoDraw } = readConfigurationForm(
    getState().configuration,
  );
  applyTheme(theme);
  const autoDrawEnabled = autoDraw.enabled;
  const intervalSeconds = autoDraw.intervalSeconds;
  autoDrawController.clear();
  suppressNotifications(() => {
    updateConfiguration({ multipliers, theme, endless, autoDraw });
    dispatchGame({ type: "START" });
  });

  void Analytics.trackView("workout");
  void Analytics.workoutStarted({
    theme,
    mode: endless ? "endless" : "finite",
    auto_draw: autoDrawEnabled,
    auto_interval_seconds: intervalSeconds,
    has_room: Boolean(roomCode),
    hearts_multiplier: multipliers.hearts,
    spades_multiplier: multipliers.spades,
    diamonds_multiplier: multipliers.diamonds,
    clubs_multiplier: multipliers.clubs,
  });

  populateConfigurationForm(getState());
  renderWorkoutFromState(getState());
  autoDrawController.schedule(getState());
}

function handleRestoredState(restored) {
  const previousState = getState();
  const params = readUrlState();
  const derivedTheme = deriveInitialTheme(params);
  const { configuration } = resolveConfigurationFromSources({
    params,
    sourceConfiguration: restored.configuration,
    derivedTheme,
  });

  replaceState(
    {
      ...restored,
      configuration,
    },
    { silent: true },
  );

  applyTheme(configuration.theme);
  populateConfigurationForm(getState());
  ensureConfigurationListeners();
  persistConfigurationIfChanged(getState().configuration);

  if (getState().started) {
    renderWorkoutFromState(getState());
    autoDrawController.ensure(getState());
  } else {
    showConfigurationScreen();
    presentation.update(workoutView(getState()), {
      theme: getState().configuration.theme,
    });
  }

  const restoredState = getState();
  void Analytics.trackView(restoredState.started ? "workout" : "setup");
  if (restoredState.started && !previousState.started) {
    void Analytics.workoutResumed({
      source: "url",
      round: restoredState.roundNumber,
      theme: restoredState.configuration.theme,
      mode: getAnalyticsMode(restoredState.configuration),
      has_room: Boolean(resolveRoomCodeFromLocation()),
    });
  }
}

export async function initializeApp() {
  migrateLegacyUrlState();
  Analytics.initialize();
  bindStateToWindow(window);

  const params = readUrlState();
  const roomCode = resolveRoomCode(params);
  const persisted = deserializeState(params);
  const derivedTheme = deriveInitialTheme(params);
  const { configuration } = resolveConfigurationFromSources({
    params,
    sourceConfiguration: persisted.configuration,
    derivedTheme,
  });
  const initialState = {
    ...persisted,
    configuration,
  };

  // Theme the first render before waiting on optional group-sync networking.
  applyTheme(configuration.theme);

  presentation.mount();
  const groupControls = document.getElementById("group-join");
  groupControls.disabled = true;
  const roomStatus = document.createElement("p");
  roomStatus.id = "room-status";
  roomStatus.className = "presentation-notice";
  roomStatus.setAttribute("role", "status");
  groupControls.after(roomStatus);
  if (roomCode) setRoomStatus("Connecting to group…");
  if (roomCode) setRoomPending(true);
  void checkSyncHealth()
    .then(async (syncEnabled) => {
      roomSyncController.setEnabled(syncEnabled);
      roomSyncController.setControlsEnabled(syncEnabled);
      groupControls.disabled = !syncEnabled;
      if (!syncEnabled && roomCode)
        setRoomStatus(
          "Group connection unavailable. You can continue locally.",
        );
      if (roomCode && syncEnabled) {
        const { remoteState } = await roomSyncController.ensureSession(
          roomCode,
          applyRemoteState,
        );
        if (remoteState) applyRemoteState(remoteState);
        setRoomStatus("Group connection ready.");
      }
    })
    .finally(() => setRoomPending(false));

  replaceState(initialState, { silent: true });

  const stateSnapshot = getState();
  applyTheme(stateSnapshot.configuration.theme);
  populateConfigurationForm(stateSnapshot);
  ensureConfigurationListeners();
  persistConfigurationIfChanged(stateSnapshot.configuration);

  roomSyncController.updateRoomControls(roomCode);

  if (stateSnapshot.started) {
    renderWorkoutFromState(stateSnapshot);
  } else {
    showConfigurationScreen();
  }

  void Analytics.trackView(stateSnapshot.started ? "workout" : "setup");
  if (stateSnapshot.started) {
    void Analytics.workoutResumed({
      source: "url",
      round: stateSnapshot.roundNumber,
      theme: stateSnapshot.configuration.theme,
      mode: getAnalyticsMode(stateSnapshot.configuration),
      has_room: Boolean(roomCode),
    });
  }

  const remainingSeconds = persisted.autoDrawRemainingSeconds;
  autoDrawController.ensure(stateSnapshot, { remainingSeconds });

  subscribe((state) => {
    persistState(state);
    autoDrawController.ensure(state);
    persistConfigurationIfChanged(state.configuration);
    sendStateToSync(state);
    if (!state.started)
      presentation.update(workoutView(state), {
        theme: state.configuration.theme,
      });
  });

  subscribeToPopState((restored) => {
    const nextParams = readUrlState();
    const nextRoomCode = resolveRoomCode(nextParams);
    roomSyncController
      .ensureSession(nextRoomCode, applyRemoteState)
      .then(({ remoteState: nextRemoteState }) => {
        if (nextRoomCode) {
          if (nextRemoteState) {
            applyRemoteState(nextRemoteState);
            return;
          }
          if (roomSyncController.hasRemoteState()) {
            return;
          }
        }
        handleRestoredState(restored);
        autoDrawController.ensure(getState(), {
          remainingSeconds: restored.autoDrawRemainingSeconds,
        });
      });
  });
}
