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

function playWhoosh(ctx) {
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

  source.start();
  source.stop(ctx.currentTime + duration);
}

function playPunch(ctx) {
  const duration = 0.3;
  const oscillator = ctx.createOscillator();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(160, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

export function playDrawSound(theme) {
  const effect = theme === 'rugged' ? 'punch' : 'whoosh';
  window.__deckOfGainsLastSound = effect;

  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  resumeIfSuspended(ctx);

  try {
    if (effect === 'punch') {
      playPunch(ctx);
    } else {
      playWhoosh(ctx);
    }
  } catch (error) {
    // Audio playback errors should not interrupt gameplay.
  }
}
