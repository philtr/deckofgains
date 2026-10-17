import { test } from "node:test";
import assert from "node:assert/strict";
import {
  transition,
  selectWorkoutView,
  buildDeck,
  calculateTotals,
  normalizeCards,
} from "../../scripts/game.mjs";
const settings = {
  endless: false,
  multipliers: { hearts: 1, spades: 1, diamonds: 1, clubs: 2 },
};
const start = () =>
  transition({ configuration: settings }, { type: "START" }).state;
test("starts a complete deck without browser dependencies", () => {
  const state = start();
  assert.equal(state.deck.length, 52);
  assert.equal(
    new Set(state.deck.map((c) => `${c.suit}-${c.number}`)).size,
    52,
  );
  assert.equal(state.started, true);
});
test("draw is immutable, deterministic and advances one round", () => {
  const before = start();
  const snapshot = JSON.stringify(before);
  const { state, events } = transition(
    before,
    { type: "DRAW" },
    { random: () => 0 },
  );
  assert.equal(JSON.stringify(before), snapshot);
  assert.deepEqual(state.lastDrawn, buildDeck().slice(0, 4));
  assert.equal(state.deck.length, 48);
  assert.equal(state.roundNumber, 2);
  assert.equal(events[0].type, "HAND_DRAWN");
});
test("finite game draws final eight then refuses further draws", () => {
  let state = start();
  for (let i = 0; i < 11; i++)
    state = transition(state, { type: "DRAW" }, { random: () => 0 }).state;
  assert.equal(state.deck.length, 8);
  const result = transition(state, { type: "DRAW" }, { random: () => 0 });
  assert.equal(result.state.lastDrawn.length, 8);
  assert.equal(result.events[1].type, "WORKOUT_COMPLETED");
  assert.equal(selectWorkoutView(result.state).canDraw, false);
  assert.equal(transition(result.state, { type: "DRAW" }).state, result.state);
});
test("endless refills without completing and reset returns to setup", () => {
  let state = {
    ...start(),
    configuration: { ...settings, endless: true },
    deck: [],
  };
  const result = transition(state, { type: "DRAW" }, { random: () => 0 });
  assert.equal(result.state.deck.length, 48);
  assert.equal(result.events.length, 1);
  assert.equal(
    transition(result.state, { type: "RESET" }).state.started,
    false,
  );
});
test("scores aces, faces and multipliers, exposes instructions and round label", () => {
  assert.equal(
    calculateTotals(
      [
        { suit: "clubs", number: 1 },
        { suit: "clubs", number: 13 },
      ],
      settings,
    ).Abs,
    42,
  );
  const state = {
    ...start(),
    deck: [],
    lastDrawn: [{ suit: "hearts", number: 2 }],
    roundNumber: 13,
    roundCompleted: true,
  };
  const view = selectWorkoutView(state);
  assert.equal(view.roundLabel, "Round 12 of 12");
  assert.equal(view.instructions, "Complete 2 sprints of 50 yards each.");
});

test("normalizes external cards before they enter the state store", () => {
  assert.deepEqual(
    normalizeCards([
      { suit: "hearts", number: "2" },
      null,
      { suit: "bogus", number: 3 },
      { suit: "clubs", number: 14 },
      { suit: "spades", number: 1.5 },
    ]),
    [{ suit: "hearts", number: 2 }],
  );
  assert.deepEqual(normalizeCards({}), []);
});

test("configuration commands keep presentation settings outside the game", () => {
  const result = transition(start(), {
    type: "CONFIGURE",
    configuration: {
      endless: true,
      theme: "plain",
      multipliers: { hearts: 3 },
    },
  });
  assert.equal(result.state.configuration.endless, true);
  assert.equal(result.state.configuration.multipliers.hearts, 3);
  assert.equal(result.state.configuration.multipliers.clubs, 2);
  assert.equal(result.state.configuration.theme, undefined);
});
test("drawing requires a valid random source and an active workout", () => {
  assert.throws(() => transition(start(), { type: "DRAW" }), TypeError);
  assert.throws(
    () => transition(start(), { type: "DRAW" }, { random: () => 1 }),
    RangeError,
  );
  const stopped = transition(start(), { type: "RESET" }).state;
  assert.equal(transition(stopped, { type: "DRAW" }).state, stopped);
});
