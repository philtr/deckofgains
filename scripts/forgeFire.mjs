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

// Fixed particle slots have staggered lifetimes and quiet gaps. No random calls,
// timers, or accumulating objects: resuming a tab cannot create a spark backlog.
export function sampleForgeSpark(index, seconds, reducedMotion = false) {
  const seed = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const cycle = 4.5 + seed(index + 1) * 4;
  const time = seconds + seed(index + 20) * cycle;
  const generation = Math.floor(time / cycle);
  const age = (time % cycle) / (0.8 + seed(index + 40) * 1.1);
  const progress = Math.min(age, 1);
  const origin = 0.08 + seed(index + generation * 19 + 60) * 0.84;
  return {
    x: Math.max(0, Math.min(1, origin + Math.sin(age * 3 + index) * progress * 0.025)),
    y: progress * (0.55 + seed(index + 80) * 0.45),
    alpha: reducedMotion || age >= 1 ? 0 : Math.sin(progress * Math.PI) * (1 - progress * 0.6),
  };
}
