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
  setLastDrawn,
  setRoundCompleted,
  setRoundNumber,
  setStarted,
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
  setInitialSerialized,
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
  renderWorkoutFromState as renderWorkoutView,
  showConfigurationScreen,
  updateAutoDrawIntervalVisibility,
  updateRoundTitle as renderRoundTitle,
} from "./workoutView.js";
import { playDrawSound } from "./audio.js";
import { checkSyncHealth, createRoomSync } from "./syncClient.js";

import Analytics from "./analytics.js";

const DRAW_BUTTON_DEFAULT_LABEL = "Draw Cards";
const AUTO_DRAW_REMAINING_UPDATE_MS = 1000;

let configurationListenersInitialized = false;
let lastStoredConfiguration = null;

const autoDrawController = createAutoDrawController({
  getState,
  onAutoDraw: () => {
    drawCards();
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
  setInitialSerialized,
  createRoomSync,
});

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
  Analytics.joinRoom({ room: roomCode });
  roomSyncController.updateRoomParam(roomCode);
  void syncToRoom(roomCode);
}

async function syncToRoom(roomCode) {
  const remoteState = await roomSyncController.syncToRoom(
    roomCode,
    applyRemoteState,
  );
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
    const nextState = {
      configuration: state.configuration,
      deck: buildDeck(),
      roundNumber: 1,
      roundCompleted: false,
      started: false,
      lastDrawn: [],
    };

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
    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ""}`;
    window.location.href = url;
  });
  instructionsDiv.appendChild(newSetButton);
}

export function updateRoundTitle() {
  renderRoundTitle({
    state: getState(),
    totalRounds,
  });
}

function renderWorkoutFromState(state) {
  renderWorkoutView({
    appendNewSetButton,
    calculateTotals,
    createCardElement,
    drawButtonDefaultLabel: DRAW_BUTTON_DEFAULT_LABEL,
    hasActiveCountdown: () => autoDrawController.hasActiveCountdown(),
    refreshDrawButtonLabel: () => autoDrawController.refreshDrawButtonLabel(),
    state,
    totalRounds,
  });
}

function serializeAndRenderState() {
  const state = getState();
  renderWorkoutFromState(state);
}

export function initializeDeck() {
  const newDeck = buildDeck();
  setDeck(newDeck);
  return newDeck;
}

export function doDrawCards() {
  let { deck } = getState();
  if (deck.length === 0) {
    deck = buildDeck();
    setDeck(deck);
  }

  const state = getState();
  const activeDeck = [...state.deck];
  const configuration = state.configuration;
  const cardCount = configuration.endless
    ? Math.min(4, activeDeck.length)
    : activeDeck.length <= 8
      ? activeDeck.length
      : 4;

  const drawnCards = [];
  for (let i = 0; i < cardCount; i += 1) {
    if (activeDeck.length === 0) {
      break;
    }
    const index = Math.floor(Math.random() * activeDeck.length);
    const [card] = activeDeck.splice(index, 1);
    if (card) {
      drawnCards.push(card);
    }
  }

  setDeck(activeDeck);
  setLastDrawn(drawnCards);

  return drawnCards;
}

export function drawCards() {
  updateRoundTitle();

  let drawnCards = [];
  suppressNotifications(() => {
    const stateBeforeDraw = getState();
    drawnCards = doDrawCards();
    const newRoundNumber = stateBeforeDraw.roundNumber + 1;
    setRoundCompleted(true);
    setRoundNumber(newRoundNumber);
    playDrawSound({ count: drawnCards.length });
  });

  Analytics.drawCards({ cards: drawnCards });

  serializeAndRenderState();
  autoDrawController.schedule(getState());
}

export async function startWorkout() {
  const roomCode = roomSyncController.getRoomInputValue();

  if (roomSyncController.isEnabled()) {
    roomSyncController.updateRoomParam(roomCode);
    const remoteState = await syncToRoom(roomCode);
    if (remoteState) {
      return;
    }
  }
  const stateSnapshot = getState();
  const multipliers = { ...defaultMultipliers };
  suits.forEach((suit) => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const value = Number.parseInt(select.value, 10);
      multipliers[suit] = Number.isFinite(value)
        ? value
        : defaultMultipliers[suit];
    }
  });

  const selectedThemeInput = document.querySelector(
    'input[name="theme"]:checked',
  );
  const themeCandidate = selectedThemeInput
    ? selectedThemeInput.value
    : stateSnapshot.configuration.theme;
  const theme = applyTheme(themeCandidate);

  const endlessToggle = document.getElementById("endless-mode");
  const endless = endlessToggle
    ? endlessToggle.checked
    : stateSnapshot.configuration.endless;
  const autoDrawToggle = document.getElementById("auto-draw-enabled");
  const autoDrawMinutesInput = document.getElementById("auto-draw-minutes");
  const autoDrawSecondsInput = document.getElementById("auto-draw-seconds");

  const minutesValue = autoDrawMinutesInput
    ? Number.parseInt(autoDrawMinutesInput.value, 10)
    : NaN;
  const secondsValue = autoDrawSecondsInput
    ? Number.parseInt(autoDrawSecondsInput.value, 10)
    : NaN;
  const normalizedMinutes =
    Number.isFinite(minutesValue) && minutesValue >= 0 ? minutesValue : 0;
  const normalizedSeconds =
    Number.isFinite(secondsValue) && secondsValue >= 0
      ? Math.min(secondsValue, 59)
      : 0;
  const computedIntervalSeconds = normalizedMinutes * 60 + normalizedSeconds;
  const fallbackIntervalSeconds =
    stateSnapshot.configuration.autoDraw.intervalSeconds ??
    defaultAutoDrawIntervalSeconds;
  const intervalSeconds =
    computedIntervalSeconds > 0
      ? computedIntervalSeconds
      : fallbackIntervalSeconds;

  Analytics.startWorkout({
    theme: themeCandidate,
    drawInterval: intervalSeconds,
    room: roomCode,
  });

  autoDrawController.clear();

  suppressNotifications(() => {
    updateConfiguration({ multipliers, theme, endless });
    setDeck(buildDeck());
    setRoundNumber(1);
    setRoundCompleted(false);
    setLastDrawn([]);
    setStarted(true);
    const autoDrawEnabled = autoDrawToggle
      ? autoDrawToggle.checked
      : stateSnapshot.configuration.autoDraw.enabled;
    updateConfiguration({
      autoDraw: {
        enabled: autoDrawEnabled,
        intervalSeconds,
      },
    });
  });

  populateConfigurationForm(getState());
  renderWorkoutFromState(getState());
  autoDrawController.schedule(getState());
}

function handleRestoredState(restored) {
  const params = new URLSearchParams(window.location.search);
  const derivedTheme = deriveInitialTheme(params);
  const { configuration } = resolveConfigurationFromSources({
    params,
    sourceConfiguration: restored.configuration,
    derivedTheme,
  });

  setInitialSerialized(params.toString());

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
  }
}

export async function initializeApp() {
  bindStateToWindow(window);

  const params = new URLSearchParams(window.location.search);
  const roomCode = resolveRoomCode(params);
  const persisted = deserializeState(params);
  const derivedTheme = deriveInitialTheme(params);
  const { configuration } = resolveConfigurationFromSources({
    params,
    sourceConfiguration: persisted.configuration,
    derivedTheme,
  });
  let initialState = {
    ...persisted,
    configuration,
  };

  const syncEnabled = await checkSyncHealth();
  roomSyncController.setEnabled(syncEnabled);
  roomSyncController.setControlsEnabled(syncEnabled);

  let remoteState = null;
  if (roomCode && syncEnabled) {
    const syncResult = await roomSyncController.ensureSession(
      roomCode,
      applyRemoteState,
    );
    remoteState = syncResult.remoteState;
    if (remoteState) {
      initialState = remoteState;
    }
  }

  replaceState(initialState, { silent: true });

  const stateSnapshot = getState();
  applyTheme(stateSnapshot.configuration.theme);
  populateConfigurationForm(stateSnapshot);
  ensureConfigurationListeners();
  setInitialSerialized(params.toString());
  persistConfigurationIfChanged(stateSnapshot.configuration);

  roomSyncController.updateRoomControls(roomCode);

  if (stateSnapshot.started) {
    renderWorkoutFromState(stateSnapshot);
  } else {
    showConfigurationScreen();
  }

  const remainingSeconds = remoteState
    ? null
    : persisted.autoDrawRemainingSeconds;
  autoDrawController.ensure(stateSnapshot, { remainingSeconds });
  if (roomCode && syncEnabled) {
    roomSyncController.rememberSyncedState(stateSnapshot);
  }

  subscribe((state) => {
    persistState(state);
    autoDrawController.ensure(state);
    persistConfigurationIfChanged(state.configuration);
    sendStateToSync(state);
  });

  subscribeToPopState((restored) => {
    const nextParams = new URLSearchParams(window.location.search);
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
