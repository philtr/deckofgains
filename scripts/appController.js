import {
  suits,
  defaultMultipliers,
  totalRounds,
  defaultAutoDrawIntervalSeconds
} from './constants.js';
import { applyTheme, deriveInitialTheme, resolveTheme } from './theme.js';
import { buildDeck, calculateTotals, createCardElement } from './deck.js';
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
  updateConfiguration
} from './workoutState.js';
import {
  deserializeState,
  persistState,
  replaceStateWithAutoDrawRemaining,
  serializeState,
  resolveRoomCode,
  setInitialSerialized,
  subscribeToPopState
} from './persistence.js';
import { loadStoredConfiguration, storeConfiguration } from './configStorage.js';
import { playDrawSound } from './audio.js';
import { checkSyncHealth, createRoomSync } from './syncClient.js';

const DRAW_BUTTON_DEFAULT_LABEL = 'Draw Cards';
const AUTO_DRAW_REMAINING_UPDATE_MS = 1000;

let configurationListenersInitialized = false;
let autoDrawTimeoutId = null;
let autoDrawCountdownIntervalId = null;
let autoDrawNextTriggerAt = null;
let autoDrawRemainingIntervalId = null;
let lastStoredConfiguration = null;
let syncSession = null;
let syncRoomCode = null;
let syncSuppressOutbound = false;
let lastSyncedSerialized = null;
let syncHasRemoteState = false;
let syncEnabled = true;

function hasConfigurationParams(params) {
  if (!(params instanceof URLSearchParams)) {
    return false;
  }

  return [
    'theme',
    'rugged',
    'endless',
    'multipliers',
    'auto',
    'autoIntervalSeconds',
    'autoInterval',
    'autoRemainingSeconds'
  ].some(param => params.has(param));
}

function resolveRoomCodeFromLocation() {
  return resolveRoomCode(new URLSearchParams(window.location.search));
}

function normalizeRoomCodeInput(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function updateRoomParam(roomCode) {
  const params = new URLSearchParams(window.location.search);
  if (roomCode) {
    params.set('room', roomCode);
  } else {
    params.delete('room');
  }
  const search = params.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  history.replaceState(null, '', url);
  setInitialSerialized(params.toString());
  updateRoomControls(roomCode);
}

function getRoomInputValue() {
  const roomInput = document.getElementById('room-code');
  const roomCode = normalizeRoomCodeInput(roomInput?.value);
  if (roomInput) {
    roomInput.value = roomCode ?? '';
  }
  return roomCode;
}

function setSyncControlsEnabled(enabled) {
  const groupJoin = document.getElementById('group-join');
  if (groupJoin) {
    groupJoin.style.display = enabled ? '' : 'none';
  }
  if (enabled) {
    updateRoomControls(resolveRoomCodeFromLocation());
  }
}

function updateRoomControls(roomCode) {
  const controls = document.querySelector('.group-join-controls');
  const active = document.getElementById('room-active');
  const activeName = document.getElementById('room-active-name');
  const hasRoom = Boolean(roomCode);

  if (controls) {
    controls.style.display = hasRoom ? 'none' : 'flex';
  }
  if (active) {
    active.style.display = hasRoom ? 'flex' : 'none';
  }
  if (activeName) {
    activeName.textContent = roomCode ?? '';
  }
}

function requestRoomJoin() {
  if (!syncEnabled) {
    return;
  }
  const roomCode = getRoomInputValue();
  updateRoomParam(roomCode);
  void syncToRoom(roomCode);
}

async function syncToRoom(roomCode) {
  if (!roomCode) {
    stopSyncSession();
    return null;
  }

  const { remoteState } = await ensureSyncSession(roomCode);
  if (remoteState) {
    applyRemoteState(remoteState);
  }
  return remoteState;
}

function serializeSyncState(state) {
  return JSON.stringify(state ?? null);
}

function rememberSyncedState(state) {
  lastSyncedSerialized = serializeSyncState(state);
}

function buildConfigurationSnapshot(baseConfiguration, theme) {
  return {
    multipliers: baseConfiguration?.multipliers ?? defaultMultipliers,
    endless: baseConfiguration?.endless ?? false,
    theme,
    autoDraw: baseConfiguration?.autoDraw ?? {
      enabled: false,
      intervalSeconds: defaultAutoDrawIntervalSeconds
    }
  };
}

function serializeConfiguration(configuration) {
  const multipliers = suits.reduce((acc, suit) => {
    acc[suit] = configuration?.multipliers?.[suit] ?? defaultMultipliers[suit];
    return acc;
  }, {});

  return JSON.stringify({
    multipliers,
    theme: resolveTheme(configuration?.theme),
    endless: Boolean(configuration?.endless),
    autoDraw: {
      enabled: Boolean(configuration?.autoDraw?.enabled),
      intervalSeconds: Number.parseInt(configuration?.autoDraw?.intervalSeconds, 10)
    }
  });
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
  if (!remoteState || typeof remoteState !== 'object') {
    return;
  }

  syncHasRemoteState = true;
  syncSuppressOutbound = true;
  try {
    replaceState(remoteState);
    const state = getState();
    rememberSyncedState(state);
    applyTheme(state.configuration?.theme);
    populateConfigurationForm(state);
    ensureConfigurationListeners();
    persistConfigurationIfChanged(state.configuration);
    if (state.started) {
      renderWorkoutFromState(state);
    } else {
      showConfigurationScreen();
    }
  } finally {
    syncSuppressOutbound = false;
  }
}

function stopSyncSession() {
  if (syncSession) {
    syncSession.stop();
  }
  syncSession = null;
  syncRoomCode = null;
  lastSyncedSerialized = null;
  syncHasRemoteState = false;
}

async function ensureSyncSession(roomCode) {
  if (!syncEnabled) {
    stopSyncSession();
    return { remoteState: null };
  }

  if (!roomCode) {
    stopSyncSession();
    return { remoteState: null };
  }

  if (syncSession && syncRoomCode === roomCode) {
    return { remoteState: null };
  }

  stopSyncSession();
  syncRoomCode = roomCode;
  syncSession = createRoomSync({
    roomCode,
    onRemoteState: applyRemoteState
  });

  const remoteState = await syncSession.fetchState();
  if (remoteState) {
    syncHasRemoteState = true;
  }
  syncSession.startStream();
  return { remoteState };
}

function sendStateToSync(state) {
  if (!syncSession || syncSuppressOutbound) {
    return;
  }

  const serialized = serializeSyncState(state);
  if (serialized === lastSyncedSerialized) {
    return;
  }
  lastSyncedSerialized = serialized;
  syncSession.sendState(state);
}

function resolveConfigurationFromSources({ params, sourceConfiguration, derivedTheme }) {
  const storedConfiguration = loadStoredConfiguration();
  const useStored = storedConfiguration && !hasConfigurationParams(params);
  const baseConfiguration = useStored ? storedConfiguration : sourceConfiguration;
  const themeCandidate = baseConfiguration?.theme ?? derivedTheme;
  const theme = resolveTheme(themeCandidate);

  return {
    configuration: buildConfigurationSnapshot(baseConfiguration, theme)
  };
}

function getAutoDrawIntervalElements() {
  return {
    container: document.getElementById('auto-draw-interval-container'),
    minutesInput: document.getElementById('auto-draw-minutes'),
    secondsInput: document.getElementById('auto-draw-seconds')
  };
}

function updateAutoDrawIntervalVisibility(enabled) {
  const { container } = getAutoDrawIntervalElements();
  if (!container) {
    return;
  }

  container.classList.toggle('is-hidden', !enabled);
  if (enabled) {
    container.style.removeProperty('display');
  } else {
    container.style.display = 'none';
  }
}

function setAutoDrawIntervalInputs(totalSeconds) {
  const { minutesInput, secondsInput } = getAutoDrawIntervalElements();
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0
    ? Math.round(totalSeconds)
    : defaultAutoDrawIntervalSeconds;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutesInput) {
    minutesInput.value = String(minutes);
  }
  if (secondsInput) {
    secondsInput.value = String(seconds);
  }
}

function readAutoDrawIntervalFromInputs() {
  const { minutesInput, secondsInput } = getAutoDrawIntervalElements();
  if (!minutesInput || !secondsInput) {
    return null;
  }

  const minutesValue = Number.parseInt(minutesInput.value, 10);
  const secondsValue = Number.parseInt(secondsInput.value, 10);
  const safeMinutes = Number.isFinite(minutesValue) && minutesValue >= 0 ? minutesValue : 0;
  const safeSeconds = Number.isFinite(secondsValue) && secondsValue >= 0 ? Math.min(secondsValue, 59) : 0;
  const total = safeMinutes * 60 + safeSeconds;
  return total > 0 ? total : null;
}

function resetDrawButtonLabel() {
  const button = document.getElementById('draw-button');
  if (button) {
    button.textContent = DRAW_BUTTON_DEFAULT_LABEL;
  }
}

function updateDrawButtonLabel() {
  const button = document.getElementById('draw-button');
  if (!button) {
    return;
  }

  if (!autoDrawNextTriggerAt) {
    button.textContent = DRAW_BUTTON_DEFAULT_LABEL;
    return;
  }

  const remainingMs = Math.max(0, autoDrawNextTriggerAt - Date.now());
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');
  button.textContent = `${DRAW_BUTTON_DEFAULT_LABEL} (${minutes}:${paddedSeconds})`;
}

function stopAutoDrawCountdown({ preserveLabel = false } = {}) {
  if (autoDrawCountdownIntervalId !== null) {
    window.clearInterval(autoDrawCountdownIntervalId);
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
  const remainingSeconds = getAutoDrawRemainingSeconds();
  replaceStateWithAutoDrawRemaining(getState(), remainingSeconds);
}

function stopAutoDrawRemainingPersistence({ preserveParam = false } = {}) {
  if (autoDrawRemainingIntervalId !== null) {
    window.clearInterval(autoDrawRemainingIntervalId);
    autoDrawRemainingIntervalId = null;
  }

  if (!preserveParam) {
    replaceStateWithAutoDrawRemaining(getState(), null);
  }
}

function startAutoDrawRemainingPersistence() {
  stopAutoDrawRemainingPersistence({ preserveParam: true });
  updateAutoDrawRemainingParam();
  autoDrawRemainingIntervalId = window.setInterval(() => {
    updateAutoDrawRemainingParam();
  }, AUTO_DRAW_REMAINING_UPDATE_MS);
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

  autoDrawCountdownIntervalId = window.setInterval(tick, 250);
}

function populateConfigurationForm(state) {
  const { configuration } = state;
  const roomInput = document.getElementById('room-code');
  if (roomInput) {
    roomInput.value = resolveRoomCodeFromLocation() ?? '';
  }
  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const value = configuration.multipliers[suit] ?? defaultMultipliers[suit];
      select.value = String(value);
    }
  });

  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach(input => {
    input.checked = input.value === configuration.theme;
  });

  const endlessToggle = document.getElementById('endless-mode');
  if (endlessToggle) {
    endlessToggle.checked = Boolean(configuration.endless);
  }

  const autoDrawToggle = document.getElementById('auto-draw-enabled');
  const autoDrawEnabled = Boolean(configuration.autoDraw?.enabled);
  if (autoDrawToggle) {
    autoDrawToggle.checked = autoDrawEnabled;
  }

  const intervalSeconds = configuration.autoDraw?.intervalSeconds ?? defaultAutoDrawIntervalSeconds;
  setAutoDrawIntervalInputs(intervalSeconds);
  updateAutoDrawIntervalVisibility(autoDrawEnabled);
}

function showConfigurationScreen() {
  const configurationScreen = document.getElementById('configuration-screen');
  const appContainer = document.getElementById('app');
  if (configurationScreen) {
    configurationScreen.style.display = 'flex';
  }
  if (appContainer) {
    appContainer.style.display = 'none';
  }
}

function showWorkoutScreen() {
  const configurationScreen = document.getElementById('configuration-screen');
  const appContainer = document.getElementById('app');
  if (configurationScreen) {
    configurationScreen.style.display = 'none';
  }
  if (appContainer) {
    appContainer.style.display = 'block';
  }
}

function ensureConfigurationListeners() {
  if (configurationListenersInitialized) {
    return;
  }

  const joinRoomButton = document.getElementById('join-room');
  if (joinRoomButton) {
    joinRoomButton.addEventListener('click', () => {
      requestRoomJoin();
    });
  }

  const changeRoomButton = document.getElementById('change-room');
  if (changeRoomButton) {
    changeRoomButton.addEventListener('click', () => {
      if (!syncEnabled) {
        return;
      }
      const roomInput = document.getElementById('room-code');
      const currentRoom = resolveRoomCodeFromLocation();
      if (roomInput) {
        roomInput.value = currentRoom ?? '';
      }
      updateRoomParam(null);
      stopSyncSession();
      if (roomInput) {
        roomInput.focus();
        roomInput.select();
      }
    });
  }

  const roomInput = document.getElementById('room-code');
  if (roomInput) {
    roomInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        requestRoomJoin();
      }
    });
  }

  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      select.addEventListener('change', event => {
        const value = Number.parseInt(event.target.value, 10);
        updateConfiguration({
          multipliers: {
            [suit]: Number.isFinite(value) ? value : defaultMultipliers[suit]
          }
        });
      });
    }
  });

  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach(input => {
    input.addEventListener('change', event => {
      const selected = event.target.value;
      const theme = applyTheme(selected);
      updateConfiguration({ theme });
    });
  });

  const endlessToggle = document.getElementById('endless-mode');
  if (endlessToggle) {
    endlessToggle.addEventListener('change', event => {
      updateConfiguration({ endless: event.target.checked });
    });
  }

  const autoDrawToggle = document.getElementById('auto-draw-enabled');
  if (autoDrawToggle) {
    autoDrawToggle.addEventListener('change', event => {
      const intervalSeconds = readAutoDrawIntervalFromInputs();
      updateConfiguration({
        autoDraw: {
          enabled: event.target.checked,
          intervalSeconds: intervalSeconds ?? defaultAutoDrawIntervalSeconds
        }
      });
      updateAutoDrawIntervalVisibility(event.target.checked);
      populateConfigurationForm(getState());
    });
  }

  const { minutesInput, secondsInput } = getAutoDrawIntervalElements();
  const handleIntervalChange = () => {
    const intervalSeconds = readAutoDrawIntervalFromInputs();
    updateConfiguration({
      autoDraw: {
        intervalSeconds: intervalSeconds ?? defaultAutoDrawIntervalSeconds
      }
    });
    populateConfigurationForm(getState());
  };

  if (minutesInput && secondsInput) {
    [minutesInput, secondsInput].forEach(input => {
      input.addEventListener('change', handleIntervalChange);
      input.addEventListener('blur', () => {
        const intervalSeconds = readAutoDrawIntervalFromInputs();
        if (!intervalSeconds) {
          populateConfigurationForm(getState());
        }
      });
    });
  }

  configurationListenersInitialized = true;
  if (typeof window !== 'undefined') {
    window.__configListenersReady = true;
  }
}

function clearAutoDrawTimer({ preserveCountdownLabel = false, preserveRemainingParam = false } = {}) {
  if (autoDrawTimeoutId !== null) {
    window.clearTimeout(autoDrawTimeoutId);
    autoDrawTimeoutId = null;
  }

  stopAutoDrawCountdown({ preserveLabel: preserveCountdownLabel });
  stopAutoDrawRemainingPersistence({ preserveParam: preserveRemainingParam });
}

function shouldContinueAutoDraw(state) {
  if (!state.started) {
    return false;
  }

  const autoDraw = state.configuration.autoDraw ?? {};
  if (!autoDraw.enabled) {
    return false;
  }

  const intervalSeconds = Number.parseInt(autoDraw.intervalSeconds, 10);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    return false;
  }

  if (!state.configuration.endless && state.deck.length === 0) {
    return false;
  }

  return true;
}

function scheduleAutoDraw(state, { remainingSeconds } = {}) {
  const canContinue = shouldContinueAutoDraw(state);
  clearAutoDrawTimer({
    preserveCountdownLabel: canContinue,
    preserveRemainingParam: canContinue
  });

  if (!canContinue) {
    return;
  }

  const configuredSeconds = Number.parseInt(state.configuration.autoDraw.intervalSeconds, 10);
  const fallbackSeconds = Number.isFinite(configuredSeconds) && configuredSeconds > 0
    ? configuredSeconds
    : defaultAutoDrawIntervalSeconds;
  const requestedRemaining = Number.parseInt(remainingSeconds, 10);
  const intervalSeconds = Number.isFinite(requestedRemaining) && requestedRemaining > 0
    ? Math.min(fallbackSeconds, requestedRemaining)
    : fallbackSeconds;
  const intervalMs = intervalSeconds * 1000;
  const deadline = Date.now() + intervalMs;

  autoDrawTimeoutId = window.setTimeout(() => {
    autoDrawTimeoutId = null;
    stopAutoDrawCountdown({ preserveLabel: true });
    const currentState = getState();
    if (!shouldContinueAutoDraw(currentState)) {
      clearAutoDrawTimer();
      return;
    }
    drawCards();
  }, intervalMs);

  startAutoDrawCountdown(deadline);
  startAutoDrawRemainingPersistence();
}

function ensureAutoDrawTimer(state, { remainingSeconds } = {}) {
  if (!shouldContinueAutoDraw(state)) {
    clearAutoDrawTimer();
    return;
  }

  if (autoDrawTimeoutId === null) {
    scheduleAutoDraw(state, { remainingSeconds });
  }
}

function renderTotalsParagraphs(instructionsDiv, totals) {
  const combined = Object.entries(totals)
    .filter(([, reps]) => reps > 0)
    .map(([exercise, reps]) => `${exercise}: ${reps} reps`)
    .join(' | ');

  if (combined) {
    const instruction = document.createElement('p');
    instruction.textContent = combined;
    instructionsDiv.appendChild(instruction);
  }
}

function appendSprintInstruction(instructionsDiv, text) {
  const sprintInstruction = document.createElement('p');
  sprintInstruction.textContent = text;
  instructionsDiv.appendChild(sprintInstruction);
}

function appendNewSetButton(instructionsDiv) {
  const newSetButton = document.createElement('button');
  newSetButton.textContent = 'New Set';
  newSetButton.addEventListener('click', async () => {
    const state = getState();
    const roomCode = resolveRoomCodeFromLocation();
    const nextState = {
      configuration: state.configuration,
      deck: buildDeck(),
      roundNumber: 1,
      roundCompleted: false,
      started: false,
      lastDrawn: []
    };

    if (roomCode && syncSession) {
      await syncSession.sendState(nextState);
    }

    const params = serializeState({
      configuration: state.configuration,
      started: false
    }, { roomCode });
    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
    window.location.href = url;
  });
  instructionsDiv.appendChild(newSetButton);
}

export function updateRoundTitle() {
  const roundTitle = document.getElementById('round-title');
  if (!roundTitle) {
    return;
  }

  const state = getState();
  const activeRoundNumber = state.roundCompleted
    ? Math.max(1, state.roundNumber - 1)
    : state.roundNumber;
  const baseRoundLabel = `Round ${activeRoundNumber}`;
  roundTitle.textContent = state.configuration.endless
    ? baseRoundLabel
    : `${baseRoundLabel} of ${totalRounds}`;
}

function renderWorkoutFromState(state) {
  showWorkoutScreen();
  updateRoundTitle();

  const drawnCardsDiv = document.getElementById('drawn-cards');
  const instructionsDiv = document.getElementById('instructions');
  const drawButton = document.getElementById('draw-button');

  if (drawnCardsDiv) {
    drawnCardsDiv.textContent = '';
  }
  if (instructionsDiv) {
    instructionsDiv.textContent = '';
  }

  const cards = state.lastDrawn;
  if (drawnCardsDiv && cards.length > 0) {
    cards.forEach(card => {
      drawnCardsDiv.appendChild(createCardElement(card));
    });
  }

  if (instructionsDiv && cards.length > 0) {
    const totals = calculateTotals(cards, state.configuration);
    renderTotalsParagraphs(instructionsDiv, totals);
  }

  const deckLength = state.deck.length;
  if (instructionsDiv) {
    if (state.configuration.endless) {
      appendSprintInstruction(instructionsDiv, 'Complete a 50 yard sprint.');
    } else if (deckLength === 0 && cards.length > 0) {
      appendSprintInstruction(instructionsDiv, 'Complete 2 sprints of 50 yards each.');
      appendNewSetButton(instructionsDiv);
    } else if (cards.length > 0) {
      appendSprintInstruction(instructionsDiv, 'Complete a 50 yard sprint.');
    }
  }

  if (drawButton) {
    if (!state.configuration.endless && deckLength === 0) {
      drawButton.style.display = 'none';
    } else {
      drawButton.style.display = '';
    }

    if (!autoDrawNextTriggerAt) {
      drawButton.textContent = DRAW_BUTTON_DEFAULT_LABEL;
    } else {
      updateDrawButtonLabel();
    }
  }
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

  serializeAndRenderState();
  scheduleAutoDraw(getState());
}

export async function startWorkout() {
  if (syncEnabled) {
    const roomCode = getRoomInputValue();
    updateRoomParam(roomCode);
    const remoteState = await syncToRoom(roomCode);
    if (remoteState) {
      return;
    }
  }

  const stateSnapshot = getState();
  const multipliers = { ...defaultMultipliers };
  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const value = Number.parseInt(select.value, 10);
      multipliers[suit] = Number.isFinite(value) ? value : defaultMultipliers[suit];
    }
  });

  const selectedThemeInput = document.querySelector('input[name="theme"]:checked');
  const themeCandidate = selectedThemeInput ? selectedThemeInput.value : stateSnapshot.configuration.theme;
  const theme = applyTheme(themeCandidate);

  const endlessToggle = document.getElementById('endless-mode');
  const endless = endlessToggle ? endlessToggle.checked : stateSnapshot.configuration.endless;
  const autoDrawToggle = document.getElementById('auto-draw-enabled');
  const autoDrawMinutesInput = document.getElementById('auto-draw-minutes');
  const autoDrawSecondsInput = document.getElementById('auto-draw-seconds');

  const minutesValue = autoDrawMinutesInput ? Number.parseInt(autoDrawMinutesInput.value, 10) : NaN;
  const secondsValue = autoDrawSecondsInput ? Number.parseInt(autoDrawSecondsInput.value, 10) : NaN;
  const normalizedMinutes = Number.isFinite(minutesValue) && minutesValue >= 0 ? minutesValue : 0;
  const normalizedSeconds = Number.isFinite(secondsValue) && secondsValue >= 0 ? Math.min(secondsValue, 59) : 0;
  const computedIntervalSeconds = normalizedMinutes * 60 + normalizedSeconds;
  const fallbackIntervalSeconds = stateSnapshot.configuration.autoDraw.intervalSeconds ?? defaultAutoDrawIntervalSeconds;
  const intervalSeconds = computedIntervalSeconds > 0 ? computedIntervalSeconds : fallbackIntervalSeconds;

  clearAutoDrawTimer();

  suppressNotifications(() => {
    updateConfiguration({ multipliers, theme, endless });
    setDeck(buildDeck());
    setRoundNumber(1);
    setRoundCompleted(false);
    setLastDrawn([]);
    setStarted(true);
    const autoDrawEnabled = autoDrawToggle ? autoDrawToggle.checked : stateSnapshot.configuration.autoDraw.enabled;
    updateConfiguration({
      autoDraw: {
        enabled: autoDrawEnabled,
        intervalSeconds
      }
    });
  });

  populateConfigurationForm(getState());
  renderWorkoutFromState(getState());
  scheduleAutoDraw(getState());
}

function handleRestoredState(restored) {
  const params = new URLSearchParams(window.location.search);
  const derivedTheme = deriveInitialTheme(params);
  const { configuration } = resolveConfigurationFromSources({
    params,
    sourceConfiguration: restored.configuration,
    derivedTheme
  });

  setInitialSerialized(params.toString());

  replaceState(
    {
      ...restored,
      configuration
    },
    { silent: true }
  );

  applyTheme(configuration.theme);
  populateConfigurationForm(getState());
  ensureConfigurationListeners();
  persistConfigurationIfChanged(getState().configuration);

  if (getState().started) {
    renderWorkoutFromState(getState());
    ensureAutoDrawTimer(getState());
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
    derivedTheme
  });
  let initialState = {
    ...persisted,
    configuration
  };

  syncEnabled = await checkSyncHealth();
  setSyncControlsEnabled(syncEnabled);

  let remoteState = null;
  if (roomCode && syncEnabled) {
    const syncResult = await ensureSyncSession(roomCode);
    remoteState = syncResult.remoteState;
    if (remoteState) {
      initialState = remoteState;
      syncHasRemoteState = true;
    }
  } else if (!syncEnabled) {
    stopSyncSession();
  }

  replaceState(initialState, { silent: true });

  const stateSnapshot = getState();
  applyTheme(stateSnapshot.configuration.theme);
  populateConfigurationForm(stateSnapshot);
  ensureConfigurationListeners();
  setInitialSerialized(params.toString());
  persistConfigurationIfChanged(stateSnapshot.configuration);

  updateRoomControls(roomCode);

  if (stateSnapshot.started) {
    renderWorkoutFromState(stateSnapshot);
  } else {
    showConfigurationScreen();
  }

  const remainingSeconds = remoteState ? null : persisted.autoDrawRemainingSeconds;
  ensureAutoDrawTimer(stateSnapshot, { remainingSeconds });
  if (roomCode && syncEnabled) {
    rememberSyncedState(stateSnapshot);
  }

  subscribe(state => {
    persistState(state);
    ensureAutoDrawTimer(state);
    persistConfigurationIfChanged(state.configuration);
    sendStateToSync(state);
  });

  subscribeToPopState(restored => {
    const nextParams = new URLSearchParams(window.location.search);
    const nextRoomCode = resolveRoomCode(nextParams);
    ensureSyncSession(nextRoomCode).then(({ remoteState: nextRemoteState }) => {
      if (nextRoomCode) {
        if (nextRemoteState) {
          applyRemoteState(nextRemoteState);
          return;
        }
        if (syncHasRemoteState) {
          return;
        }
      }
      handleRestoredState(restored);
      ensureAutoDrawTimer(getState(), { remainingSeconds: restored.autoDrawRemainingSeconds });
    });
  });
}
