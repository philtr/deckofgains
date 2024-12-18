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

let roundCompleted = false;
let roundNumber = 1;
const totalRounds = 12;
let deck = [];

function initializeDeck() {
  deck = [];
  const suits = ['hearts', 'spades', 'diamonds', 'clubs'];
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
  let cardCount = (deck.length <= 8) ? deck.length : (roundCompleted ? 4 : 4);
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
    if (card.suit === 'clubs') {
      reps *= 2;
    }
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

  if (deck.length === 0) {
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
  roundTitle.textContent = `Round ${roundNumber} of ${totalRounds}`;
}

function applyRuggedTheme() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('rugged') === 'true') {
    document.body.classList.add('rugged');
  }
}

