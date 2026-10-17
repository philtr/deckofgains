import { getCardDisplayValue } from "./game.mjs";

const symbols = { hearts: "♥", spades: "♠", diamonds: "♦", clubs: "♣" };
const rgb = (color) =>
  [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));

// Periodic grain has matching edge pixels in both directions. Drawing clipped
// horizontal strokes created a density gradient and a visible join on repeat.
export function createSurfacePixels(theme, palette, size = 512) {
  const surface = rgb(palette.surface);
  const grain = rgb(palette.grain);
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = y % (size - 1);
    const phaseY = (row / (size - 1)) * Math.PI * 2;
    for (let x = 0; x < size; x++) {
      const column = x % (size - 1);
      const phaseX = (column / (size - 1)) * Math.PI * 2;
      const hash =
        ((Math.imul(column + 1, 374761393) ^ Math.imul(row + 1, 668265263)) >>>
          0) /
        4294967295;
      const blend =
        theme === "rugged"
          ? 0.35 +
            Math.sin(phaseY * 36 + Math.sin(phaseX) * 1.4) * 0.2 +
            Math.sin(phaseY * 79 + Math.sin(phaseX * 2)) * 0.13 +
            hash * 0.12
          : theme === "plain"
            ? 0.05 + hash * 0.05
            : 0.12 + hash * 0.22;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] =
          surface[channel] + (grain[channel] - surface[channel]) * blend;
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
