import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSurfacePixels,
  drawCardFace,
} from "../../scripts/tabletopArtwork.mjs";

const palette = { surface: "#493124", grain: "#211b17" };
test("rugged grain joins continuously across every repeated texture edge", () => {
  const size = 128;
  const pixels = createSurfacePixels("rugged", palette, size);
  const pixel = (x, y) => [
    ...pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4),
  ];
  for (let i = 0; i < size; i++) {
    assert.deepEqual(pixel(0, i), pixel(size - 1, i));
    assert.deepEqual(pixel(i, 0), pixel(i, size - 1));
  }
  assert.deepEqual(pixels, createSurfacePixels("rugged", palette, size));
  assert.notDeepEqual(pixel(40, 40), pixel(70, 70));
});
test("every card has a prominent central rank and suit plus jumbo corner indices", () => {
  for (const suit of ["hearts", "spades", "diamonds", "clubs"]) {
    for (const number of [1, 2, 10, 11, 12, 13]) {
      const text = [];
      const ctx = {
        fillRect() {},
        strokeRect() {},
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        fillText(value, x, y) {
          text.push({ value, x, y, font: this.font, color: this.fillStyle });
        },
      };
      drawCardFace(ctx, 384, 544, { suit, number });
      const rank =
        { 1: "A", 11: "J", 12: "Q", 13: "K" }[number] ?? String(number);
      const central = text.find(
        (item) => item.value === rank && item.x === 192,
      );
      assert.ok(central, `central rank missing for ${suit} ${number}`);
      assert.ok(Number(central.font.match(/(\d+)px/)[1]) >= 150);
      assert.ok(
        text.some(
          (item) =>
            item.value === rank &&
            item.x !== 192 &&
            Number(item.font.match(/(\d+)px/)[1]) >= 90,
        ),
      );
      assert.equal(
        central.color,
        suit === "hearts" || suit === "diamonds" ? "#a31624" : "#101820",
      );
    }
  }
});
