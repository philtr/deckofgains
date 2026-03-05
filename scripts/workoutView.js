function getAutoDrawIntervalElements() {
  return {
    container: document.getElementById('auto-draw-interval-container'),
    minutesInput: document.getElementById('auto-draw-minutes'),
    secondsInput: document.getElementById('auto-draw-seconds')
  };
}

export function updateAutoDrawIntervalVisibility(enabled) {
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

export function setAutoDrawIntervalInputs(totalSeconds, fallbackSeconds) {
  const { minutesInput, secondsInput } = getAutoDrawIntervalElements();
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0
    ? Math.round(totalSeconds)
    : fallbackSeconds;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutesInput) {
    minutesInput.value = String(minutes);
  }
  if (secondsInput) {
    secondsInput.value = String(seconds);
  }
}

export function readAutoDrawIntervalFromInputs() {
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

export function populateConfigurationForm({
  state,
  defaultAutoDrawIntervalSeconds,
  defaultMultipliers,
  roomCode,
  suits
}) {
  const { configuration } = state;
  const roomInput = document.getElementById('room-code');
  if (roomInput) {
    roomInput.value = roomCode ?? '';
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
  setAutoDrawIntervalInputs(intervalSeconds, defaultAutoDrawIntervalSeconds);
  updateAutoDrawIntervalVisibility(autoDrawEnabled);
}

export function showConfigurationScreen() {
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

export function updateRoundTitle({ state, totalRounds }) {
  const roundTitle = document.getElementById('round-title');
  if (!roundTitle) {
    return;
  }

  const activeRoundNumber = state.roundCompleted
    ? Math.max(1, state.roundNumber - 1)
    : state.roundNumber;
  const baseRoundLabel = `Round ${activeRoundNumber}`;
  roundTitle.textContent = state.configuration.endless
    ? baseRoundLabel
    : `${baseRoundLabel} of ${totalRounds}`;
}

export function renderWorkoutFromState({
  appendNewSetButton,
  calculateTotals,
  createCardElement,
  drawButtonDefaultLabel,
  hasActiveCountdown,
  refreshDrawButtonLabel,
  state,
  totalRounds
}) {
  showWorkoutScreen();
  updateRoundTitle({ state, totalRounds });

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

    if (!hasActiveCountdown()) {
      drawButton.textContent = drawButtonDefaultLabel;
    } else {
      refreshDrawButtonLabel();
    }
  }
}
