// Coherent flicker uses its own clock and never consumes gameplay randomness.
const pulse = (t) =>
  0.71 +
  Math.sin(t * 7.3) * 0.13 +
  Math.sin(t * 13.1 + 0.7) * 0.09 +
  Math.sin(t * 3.7 + 1.4) * 0.05;
export function sampleForgeFire(seconds) {
  const left = pulse(seconds);
  const right = pulse(seconds + 0.43);
  const average = (left + right) / 2;
  return {
    left,
    right,
    opacity: 0.6 + average * 0.4,
    scale: 0.9 + average * 0.14,
    drift: Math.sin(seconds * 2.9) * 3,
  };
}
