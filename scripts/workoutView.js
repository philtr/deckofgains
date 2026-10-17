import {
  exercises,
  defaultMultipliers,
  defaultAutoDrawIntervalSeconds,
  suits,
} from "./constants.js";
import { selectWorkoutView } from "./game.mjs";

function getAutoDrawIntervalElements() {
  return {
    container: document.getElementById("auto-draw-interval-container"),
    minutesInput: document.getElementById("auto-draw-minutes"),
    secondsInput: document.getElementById("auto-draw-seconds"),
  };
}

export function updateAutoDrawIntervalVisibility(enabled) {
  const { container } = getAutoDrawIntervalElements();
  if (!container) {
    return;
  }

  container.classList.toggle("is-hidden", !enabled);
  if (enabled) {
    container.style.removeProperty("display");
  } else {
    container.style.display = "none";
  }
}

export function setAutoDrawIntervalInputs(totalSeconds, fallbackSeconds) {
  const { minutesInput, secondsInput } = getAutoDrawIntervalElements();
  const safeSeconds =
    Number.isFinite(totalSeconds) && totalSeconds > 0
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
  const safeMinutes =
    Number.isFinite(minutesValue) && minutesValue >= 0 ? minutesValue : 0;
  const safeSeconds =
    Number.isFinite(secondsValue) && secondsValue >= 0
      ? Math.min(secondsValue, 59)
      : 0;
  const total = safeMinutes * 60 + safeSeconds;
  return total > 0 ? total : null;
}

export function populateConfigurationForm({
  state,
  defaultAutoDrawIntervalSeconds,
  defaultMultipliers,
  roomCode,
  suits,
}) {
  const { configuration } = state;
  const roomInput = document.getElementById("room-code");
  if (roomInput) {
    roomInput.value = roomCode ?? "";
  }

  suits.forEach((suit) => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const value = configuration.multipliers[suit] ?? defaultMultipliers[suit];
      select.value = String(value);
    }
  });

  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach((input) => {
    input.checked = input.value === configuration.theme;
  });

  const endlessToggle = document.getElementById("endless-mode");
  if (endlessToggle) {
    endlessToggle.checked = Boolean(configuration.endless);
  }

  const autoDrawToggle = document.getElementById("auto-draw-enabled");
  const autoDrawEnabled = Boolean(configuration.autoDraw?.enabled);
  if (autoDrawToggle) {
    autoDrawToggle.checked = autoDrawEnabled;
  }

  const intervalSeconds =
    configuration.autoDraw?.intervalSeconds ?? defaultAutoDrawIntervalSeconds;
  setAutoDrawIntervalInputs(intervalSeconds, defaultAutoDrawIntervalSeconds);
  updateAutoDrawIntervalVisibility(autoDrawEnabled);
}

export function showConfigurationScreen() {
  const configurationScreen = document.getElementById("configuration-screen");
  const appContainer = document.getElementById("app");
  if (configurationScreen) {
    configurationScreen.style.display = "flex";
  }
  if (appContainer) {
    appContainer.style.display = "none";
  }
}

function showWorkoutScreen() {
  const configurationScreen = document.getElementById("configuration-screen");
  const appContainer = document.getElementById("app");
  if (configurationScreen) {
    configurationScreen.style.display = "none";
  }
  if (appContainer) {
    appContainer.style.display = "block";
  }
}

function setTileOrder(element, mobileOrder, landscapeOrder) {
  element.style.setProperty("--tile-order-mobile", String(mobileOrder));
  element.style.setProperty("--tile-order-landscape", String(landscapeOrder));
}

function renderTotalsParagraphs(summaryDiv, totals) {
  Object.values(exercises).forEach((exercise, index) => {
    const item = document.createElement("div");
    item.className = "rep-summary-item";
    setTileOrder(item, index + 5, index + 3 + Math.floor(index / 2) * 2);

    const count = document.createElement("span");
    count.className = "rep-summary-count";
    count.textContent = String(totals[exercise] ?? 0);

    const label = document.createElement("span");
    label.className = "rep-summary-exercise";
    label.textContent = exercise;

    item.append(count, label);
    summaryDiv.appendChild(item);
  });
}

function appendSprintInstruction(instructionsDiv, text) {
  const sprintInstruction = document.createElement("p");
  sprintInstruction.textContent = text;
  instructionsDiv.appendChild(sprintInstruction);
}

export function updateRoundTitle({ state, totalRounds }) {
  const roundTitle = document.getElementById("round-title");
  if (!roundTitle) {
    return;
  }

  roundTitle.textContent = selectWorkoutView(state).roundLabel;
}

export function renderWorkoutFromState({
  appendNewSetButton,
  createFeedbackPrompt,
  createCardElement,
  drawButtonDefaultLabel,
  hasActiveCountdown,
  refreshDrawButtonLabel,
  state,
  viewModel = selectWorkoutView(state),
  shouldShowFeedback,
  totalRounds,
}) {
  showWorkoutScreen();
  updateRoundTitle({ state, totalRounds });

  const drawnCardsDiv = document.getElementById("drawn-cards");
  const repSummaryDiv = document.getElementById("rep-summary");
  const instructionsDiv = document.getElementById("instructions");
  const drawButton = document.getElementById("draw-button");

  if (drawnCardsDiv) {
    drawnCardsDiv.textContent = "";
  }
  if (repSummaryDiv) {
    repSummaryDiv.textContent = "";
  }
  if (instructionsDiv) {
    instructionsDiv.textContent = "";
  }

  const cards = viewModel.cards;
  if (drawnCardsDiv && cards.length > 0) {
    cards.forEach((card, index) => {
      const cardElement = createCardElement(card);
      setTileOrder(
        cardElement,
        index + 1,
        index + 1 + Math.floor(index / 2) * 2,
      );
      drawnCardsDiv.appendChild(cardElement);
    });
  }

  if (repSummaryDiv && cards.length > 0) {
    const totals = viewModel.totals;
    renderTotalsParagraphs(repSummaryDiv, totals);
  }

  if (instructionsDiv) {
    if (viewModel.complete && cards.length > 0) {
      appendSprintInstruction(instructionsDiv, viewModel.instructions);
      if (shouldShowFeedback()) {
        const feedbackPrompt = createFeedbackPrompt({
          onDismiss: () => {
            feedbackPrompt.remove();
            appendNewSetButton(instructionsDiv);
          },
        });
        instructionsDiv.appendChild(feedbackPrompt);
      } else {
        appendNewSetButton(instructionsDiv);
      }
    }
  }

  if (drawButton) {
    if (!viewModel.canDraw) {
      drawButton.style.display = "none";
    } else {
      drawButton.style.display = "";
    }

    if (!hasActiveCountdown()) {
      drawButton.textContent = drawButtonDefaultLabel;
    } else {
      refreshDrawButtonLabel();
    }
  }
}

export function readConfigurationForm(fallback) {
  const multipliers = Object.fromEntries(
    suits.map((suit) => [
      suit,
      Number.parseInt(
        document.getElementById(`multiplier-${suit}`)?.value,
        10,
      ) || defaultMultipliers[suit],
    ]),
  );
  return {
    multipliers,
    theme:
      document.querySelector('input[name="theme"]:checked')?.value ??
      fallback.theme,
    endless:
      document.getElementById("endless-mode")?.checked ?? fallback.endless,
    autoDraw: {
      enabled:
        document.getElementById("auto-draw-enabled")?.checked ??
        fallback.autoDraw.enabled,
      intervalSeconds:
        readAutoDrawIntervalFromInputs() ??
        fallback.autoDraw.intervalSeconds ??
        defaultAutoDrawIntervalSeconds,
    },
  };
}
