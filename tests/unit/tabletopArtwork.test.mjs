import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSurfacePixels,
  drawCardFace,
  createRuggedReliefPixels,
  drawCardBack,
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

test("rugged steel includes deep wear and hammered relief without losing seamless edges", () => {
  const size = 128;
  const pixels = createSurfacePixels(
    "rugged",
    { surface: "#59402e", grain: "#0f0d0a" },
    size,
  );
  const red = [...pixels].filter((value, index) => index % 4 === 0);
  assert.ok(
    Math.max(...red) - Math.min(...red) > 70,
    "steel should include deep gouges and worn highlights",
  );
});

test("rugged relief repeats seamlessly and steel backs use a curved pick and the complete DECK of GAINS name", () => {
  const size = 64;
  const pixels = createRuggedReliefPixels(size);
  for (let i = 0; i < size; i++) {
    assert.deepEqual(
      pixels.slice(i * size * 4, i * size * 4 + 4),
      pixels.slice((i * size + size - 1) * 4, (i * size + size - 1) * 4 + 4),
    );
    assert.deepEqual(
      pixels.slice(i * 4, i * 4 + 4),
      pixels.slice(
        ((size - 1) * size + i) * 4,
        ((size - 1) * size + i) * 4 + 4,
      ),
    );
  }
  const text = [];
  const curves = [];
  const ctx = new Proxy(
    {
      fillText(value) {
        text.push(value);
      },
      quadraticCurveTo(...args) {
        curves.push(args);
      },
    },
    {
      get(target, key) {
        return key in target ? target[key] : () => {};
      },
    },
  );
  drawCardBack(ctx, 384, 544, "rugged", { back: "#30231d", ink: "#bc9365" });
  assert.deepEqual(text, ["DECK", "of", "GAINS"]);
  assert.ok(
    curves.length > 0,
    "the pick needs the curved, pointed head from the reference",
  );
});
