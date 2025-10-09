let audioContext;

function getAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  audioContext = new AudioContextConstructor();
  return audioContext;
}

function resumeIfSuspended(ctx) {
  if (!ctx || typeof ctx.resume !== 'function') {
    return;
  }

  try {
    if (ctx.state === 'suspended') {
      const resumeResult = ctx.resume();
      if (resumeResult && typeof resumeResult.catch === 'function') {
        resumeResult.catch(() => {});
      }
    }
  } catch (error) {
    // Ignore resume errors; audio playback will be attempted regardless.
  }
}

function playWhoosh(ctx, when = ctx.currentTime) {
  const duration = 0.45;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const progress = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * progress * progress;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  const startTime = Math.max(when, ctx.currentTime);
  source.start(startTime);
  source.stop(startTime + duration);
}

export function playDrawSound(options = {}) {
  const countCandidate = typeof options === 'number' ? options : options?.count;
  const plays = Number.isFinite(countCandidate) ? Math.max(0, Math.round(countCandidate)) : 0;

  window.__deckOfGainsLastSound = 'whoosh';
  window.__deckOfGainsLastSoundPlayCount = plays;

  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  resumeIfSuspended(ctx);

  try {
    const baseTime = ctx.currentTime;
    const spacingSeconds = 0.08;
    for (let i = 0; i < plays; i += 1) {
      const when = baseTime + i * spacingSeconds;
      playWhoosh(ctx, when);
    }
  } catch (error) {
    // Audio playback errors should not interrupt gameplay.
  }
}
