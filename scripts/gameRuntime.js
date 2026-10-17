import { transition, selectWorkoutView } from "./game.mjs";
import { getState, replaceState } from "./workoutState.js";

// Wire format retains historical configuration fields. The game sees rules only.
export function gameState(snapshot) {
  return {
    ...snapshot,
    configuration: {
      endless: snapshot.configuration.endless,
      multipliers: { ...snapshot.configuration.multipliers },
    },
  };
}

export function dispatchGame(command) {
  const snapshot = getState();
  const before = gameState(snapshot);
  const result = transition(before, command, { random: () => Math.random() });
  if (result.state !== before) {
    replaceState({
      ...result.state,
      configuration: {
        ...snapshot.configuration,
        ...result.state.configuration,
      },
    });
  }
  return result;
}

export function workoutView(snapshot) {
  return selectWorkoutView(gameState(snapshot));
}
