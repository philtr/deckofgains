const exercises = {
  'hearts': 'Jumping Jacks',
  'spades': 'Squats',
  'diamonds': 'Pushups',
  'clubs': 'Abs'
};

const suitSymbols = {
  'hearts': '♥️',
  'spades': '♠️',
  'diamonds': '♦️',
  'clubs': '♣️'
};

const suits = ['hearts', 'spades', 'diamonds', 'clubs'];

const defaultMultipliers = {
  hearts: 1,
  spades: 1,
  diamonds: 1,
  clubs: 2
};

let configuration = {
  multipliers: { ...defaultMultipliers },
  theme: 'casino',
  endless: false
};

let roundCompleted = false;
let roundNumber = 1;
const totalRounds = 12;
let deck = [];

function onThemeChange(event) {
  const selectedTheme = event?.target?.value || configuration.theme;
  configuration.theme = selectedTheme;
  applyTheme(selectedTheme);
}

function initializeApp() {
  applyRuggedTheme();
  configuration.theme = document.body.classList.contains('rugged') ? 'rugged' : 'casino';
  configuration.multipliers = { ...defaultMultipliers };
  configuration.endless = false;
  initializeConfigurationScreen();
}

function initializeDeck() {
  deck = [];
  for (let suit of suits) {
    for (let number = 1; number <= 13; number++) {
      deck.push({ suit, number });
    }
  }
}

function getCardDisplayValue(number) {
  switch (number) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return number;
  }
}

function getCardValue(number) {
  if (number >= 11) {
    return 10; // Face cards are 10
  } else if (number === 1) {
    return 11; // Ace is 11
  } else {
    return number;
  }
}

function doDrawCards() {
  let cardCount;
  if (configuration.endless) {
    cardCount = Math.min(4, deck.length);
  } else {
    cardCount = deck.length <= 8 ? deck.length : 4;
  }
  let cards = [];
  for (let i = 0; i < cardCount; i++) {
    const cardIndex = Math.floor(Math.random() * deck.length);
    const card = deck.splice(cardIndex, 1)[0];
    cards.push(card);
  }

  return cards;
}

function drawCards() {
  updateRoundTitle();
  if (deck.length === 0) {
    initializeDeck();
  }

  const drawnCardsDiv = document.getElementById("drawn-cards");
  const instructionsDiv = document.getElementById("instructions");
  const drawButton = document.getElementById("draw-button");
  drawnCardsDiv.textContent = "";
  instructionsDiv.textContent = "";

  const cards = doDrawCards();

  // Display drawn cards in a grid layout
  cards.forEach(card => {
    const cardElement = document.createElement("div");
    cardElement.className = "card";
    cardElement.innerHTML = `<span class="${card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : ''}">${getCardDisplayValue(card.number)} ${suitSymbols[card.suit]}</span>`;
    drawnCardsDiv.appendChild(cardElement);
  });

  // Calculate total reps for each exercise
  const totals = {
    'Jumping Jacks': 0,
    'Squats': 0,
    'Pushups': 0,
    'Abs': 0
  };

  cards.forEach(card => {
    const exercise = exercises[card.suit];
    let reps = getCardValue(card.number);
    const multiplier = configuration.multipliers[card.suit] ?? defaultMultipliers[card.suit] ?? 1;
    reps *= multiplier;
    totals[exercise] += reps;
  });

  // Generate combined exercise instructions
  const exerciseInstructions = Object.entries(totals)
    .filter(([, reps]) => reps > 0)
    .map(([exercise, reps]) => `${exercise}: ${reps} reps`)
    .join(' | ');

  const instruction = document.createElement("p");
  instruction.textContent = exerciseInstructions;
  instructionsDiv.appendChild(instruction);

  if (configuration.endless) {
    const sprintInstruction = document.createElement("p");
    sprintInstruction.textContent = "Complete a 50 yard sprint.";
    instructionsDiv.appendChild(sprintInstruction);
    drawButton.style.display = "";
  } else if (deck.length === 0) {
    const sprintInstruction = document.createElement("p");
    sprintInstruction.textContent = "Complete 2 sprints of 50 yards each.";
    instructionsDiv.appendChild(sprintInstruction);
    drawButton.style.display = "none";
    const newSetButton = document.createElement("button");
    newSetButton.textContent = "New Set";
    newSetButton.onclick = function () {
      location.reload();
    };
    instructionsDiv.appendChild(newSetButton);
  } else {
    const sprintInstruction = document.createElement("p");
    sprintInstruction.textContent = "Complete a 50 yard sprint.";
    instructionsDiv.appendChild(sprintInstruction);
  }

  roundCompleted = true;
  roundNumber++;
}

function updateRoundTitle() {
  const roundTitle = document.getElementById("round-title");
  if (!roundTitle) {
    return;
  }

  const baseRoundLabel = `Round ${roundNumber}`;
  roundTitle.textContent = configuration.endless ? baseRoundLabel : `${baseRoundLabel} of ${totalRounds}`;
}

function applyRuggedTheme() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('rugged') === 'true') {
    document.body.classList.add('rugged');
  } else {
    document.body.classList.remove('rugged');
  }
}

function initializeConfigurationScreen() {
  const configurationScreen = document.getElementById('configuration-screen');
  const appContainer = document.getElementById('app');
  if (configurationScreen) {
    configurationScreen.style.display = 'flex';
  }
  if (appContainer) {
    appContainer.style.display = 'none';
  }

  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const multiplier = configuration.multipliers[suit] ?? defaultMultipliers[suit];
      select.value = String(multiplier);
    }
  });

  const selectedTheme = document.body.classList.contains('rugged') ? 'rugged' : configuration.theme;
  configuration.theme = selectedTheme;
  const themeInput = document.querySelector(`input[name="theme"][value="${selectedTheme}"]`);
  if (themeInput) {
    themeInput.checked = true;
  }

  const endlessToggle = document.getElementById('endless-mode');
  if (endlessToggle) {
    endlessToggle.checked = Boolean(configuration.endless);
  }

  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach(input => {
    input.addEventListener('change', onThemeChange);
  });
}

function applyTheme(theme) {
  if (theme === 'rugged') {
    document.body.classList.add('rugged');
  } else {
    document.body.classList.remove('rugged');
  }
}

function startWorkout() {
  const configurationScreen = document.getElementById('configuration-screen');
  const appContainer = document.getElementById('app');

  const multipliers = { ...configuration.multipliers };
  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const selectedValue = parseInt(select.value, 10);
      multipliers[suit] = Number.isFinite(selectedValue) ? selectedValue : (configuration.multipliers[suit] ?? defaultMultipliers[suit]);
    }
  });

  const selectedThemeInput = document.querySelector('input[name="theme"]:checked');
  const theme = selectedThemeInput ? selectedThemeInput.value : configuration.theme;
  const endlessToggle = document.getElementById('endless-mode');
  const endless = endlessToggle ? endlessToggle.checked : configuration.endless;

  configuration = {
    multipliers,
    theme,
    endless
  };

  applyTheme(theme);

  if (configurationScreen) {
    configurationScreen.style.display = 'none';
  }
  if (appContainer) {
    appContainer.style.display = 'block';
  }

  initializeDeck();
  roundNumber = 1;
  roundCompleted = false;
  updateRoundTitle();

  const drawnCardsDiv = document.getElementById('drawn-cards');
  if (drawnCardsDiv) {
    drawnCardsDiv.textContent = '';
  }

  const instructionsDiv = document.getElementById('instructions');
  if (instructionsDiv) {
    instructionsDiv.innerHTML = '';
  }

  const drawButton = document.getElementById('draw-button');
  if (drawButton) {
    drawButton.style.display = '';
  }
}

