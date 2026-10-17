import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleForgeFire } from "../../scripts/forgeFire.mjs";

test("fire varies smoothly and deterministically within readable lighting bounds", () => {
  const samples = Array.from({ length: 120 }, (_, i) =>
    sampleForgeFire(i / 30),
  );
  for (const sample of samples) {
    assert.ok(sample.left >= 0.4 && sample.left <= 1);
    assert.ok(sample.right >= 0.4 && sample.right <= 1);
    assert.ok(sample.opacity >= 0.55 && sample.opacity <= 1);
    assert.ok(sample.scale >= 0.9 && sample.scale <= 1.04);
  }
  assert.deepEqual(sampleForgeFire(1), sampleForgeFire(1));
  assert.ok(
    Math.max(...samples.map((s) => s.left)) -
      Math.min(...samples.map((s) => s.left)) >
      0.2,
  );
  assert.notEqual(samples[0].left, samples[0].right);
  for (let i = 1; i < samples.length; i++)
    assert.ok(Math.abs(samples[i].left - samples[i - 1].left) < 0.1);
});
