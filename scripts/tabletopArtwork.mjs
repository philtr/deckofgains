import { getCardDisplayValue } from "./game.mjs";

const symbols = { hearts: "♥", spades: "♠", diamonds: "♦", clubs: "♣" };
const rgb = (color) =>
  [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));

const wrappedDistance = (value) => value - Math.round(value);
const scratches = [
  [0.18, 0.16, -0.45, 0.12],
  [0.62, 0.28, 0.7, 0.09],
  [0.79, 0.61, -0.8, 0.13],
  [0.35, 0.83, 0.35, 0.16],
  [0.55, 0.53, -0.4, 0.08],
].map(([x, y, angle, length]) => ({
  x,
  y,
  cos: Math.cos(angle),
  sin: Math.sin(angle),
  length,
}));

// All coordinates live on a torus so knots, scars, and relief join on repeat.
function ruggedTimber(x, y, hash) {
  const phaseX = x * Math.PI * 2,
    phaseY = y * Math.PI * 2;
  const dx = wrappedDistance(x - 0.27),
    dy = wrappedDistance(y - 0.37);
  const radius = Math.hypot(dx * 1.4, dy * 5);
  const bend = Math.exp(-radius * 9) * Math.sin(dx * 18) * 10;
  const knot =
    Math.exp(-radius * 12) * 0.3 +
    (0.5 + Math.sin(radius * 210) * 0.5) * Math.exp(-radius * 8) * 0.22;
  let tone =
    0.65 +
    Math.sin(phaseY * 44 + Math.sin(phaseX) * 3 + bend) * 0.14 +
    Math.sin(phaseY * 91 + Math.sin(phaseX * 3)) * 0.08 +
    Math.sin(phaseX * 2) * Math.cos(phaseY * 3) * 0.1 +
    hash * 0.09 -
    knot;
  for (const scar of scratches) {
    const sx = wrappedDistance(x - scar.x),
      sy = wrappedDistance(y - scar.y);
    const along = sx * scar.cos + sy * scar.sin;
    const across = -sx * scar.sin + sy * scar.cos;
    if (Math.abs(along) < scar.length) {
      const taper = 1 - Math.abs(along) / scar.length;
      if (Math.abs(across) < 0.004 * taper) tone -= 0.65 * taper;
      if (Math.abs(across - 0.006) < 0.002 * taper) tone += 0.42 * taper;
    }
  }
  return Math.max(0, Math.min(1.3, tone));
}

function pixelNoise(x, y) {
  return (
    ((Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0) /
    4294967295
  );
}

export function createRuggedReliefPixels(size = 512) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const column = x % (size - 1),
        row = y % (size - 1);
      const height = ruggedTimber(
        column / (size - 1),
        row / (size - 1),
        pixelNoise(column, row),
      );
      const offset = (y * size + x) * 4;
      pixels[offset] =
        pixels[offset + 1] =
        pixels[offset + 2] =
          20 + height * 180;
      pixels[offset + 3] = 255;
    }
  return pixels;
}

// Periodic grain has matching edge pixels in both directions. Drawing clipped
// horizontal strokes created a density gradient and a visible join on repeat.
export function createSurfacePixels(theme, palette, size = 512) {
  const surface = rgb(palette.surface);
  const grain = rgb(palette.grain);
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = y % (size - 1);
    for (let x = 0; x < size; x++) {
      const column = x % (size - 1);
      const hash = pixelNoise(column, row);
      const timber =
        theme === "rugged"
          ? ruggedTimber(column / (size - 1), row / (size - 1), hash)
          : 0;
      const blend = theme === "plain" ? 0.05 + hash * 0.05 : 0.12 + hash * 0.22;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] =
          theme === "rugged"
            ? grain[channel] +
              (surface[channel] - grain[channel]) * timber +
              Math.max(0, timber - 0.9) * 65
            : surface[channel] + (grain[channel] - surface[channel]) * blend;
      }
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

// Jumbo indices and a central rank make every card readable without counting
// small pips. Artwork is identical across themes; lighting cannot wash out ink.
export function drawCardFace(ctx, w, h, card) {
  ctx.fillStyle = "#fffef8";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#d8d0c0";
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle =
    card.suit === "hearts" || card.suit === "diamonds" ? "#a31624" : "#101820";
  const value = String(getCardDisplayValue(card.number));
  function corner() {
    ctx.textAlign = "center";
    ctx.font = "bold 96px Arial, sans-serif";
    ctx.fillText(value, 72, 112);
    ctx.font = "72px Georgia, serif";
    ctx.fillText(symbols[card.suit], 72, 190);
  }
  corner();
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  corner();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.font = "bold 160px Arial, sans-serif";
  ctx.fillText(value, w / 2, 300);
  ctx.font = "124px Georgia, serif";
  ctx.fillText(symbols[card.suit], w / 2, 424);
}

export function drawCardBack(ctx, w, h, theme, palette) {
  ctx.fillStyle = theme === "rugged" ? "#c4ac83" : "#f8f1df";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = palette.back;
  ctx.fillRect(16, 16, w - 32, h - 32);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2;
  if (theme !== "rugged") {
    for (let y = 36; y < h - 28; y += 24)
      for (let x = 34; x < w - 28; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x - 8, y);
        ctx.closePath();
        ctx.stroke();
      }
    ctx.strokeRect(28, 28, w - 56, h - 56);
    return;
  }
  // Scuffed leather, stitched perimeter, and a broad axe stamp.
  for (let i = 0; i < 5000; i++) {
    const x = 20 + ((i * 73) % (w - 40)),
      y = 20 + ((i * 137) % (h - 40));
    ctx.fillStyle = i % 3 ? "#241a15" : "#72513a";
    ctx.globalAlpha = 0.22;
    ctx.fillRect(x, y, (i % 9) + 1, 1);
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([9, 7]);
  ctx.strokeRect(31, 31, w - 62, h - 62);
  ctx.setLineDash([]);
  ctx.fillStyle = palette.ink;
  for (const angle of [-0.65, 0.65]) {
    ctx.save();
    ctx.translate(w / 2, 203);
    ctx.rotate(angle);
    ctx.fillRect(-7, -90, 14, 194);
    ctx.beginPath();
    ctx.moveTo(7, -90);
    ctx.lineTo(62, -104);
    ctx.lineTo(78, -48);
    ctx.lineTo(7, -40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = "center";
  ctx.font = "900 57px Arial, sans-serif";
  ctx.fillText("DECK", w / 2, 385);
  ctx.font = "900 65px Arial, sans-serif";
  ctx.fillText("GAINS", w / 2, 458);
}
