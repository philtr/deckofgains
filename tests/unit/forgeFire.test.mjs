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

test("sparks rise, cool, expire, and leave quiet gaps without gameplay randomness", async () => {
  const { sampleForgeSpark } = await import("../../scripts/forgeFire.mjs");
  let visible = 0, quiet = 0;
  for (let i = 0; i < 18; i++) {
    for (let t = 0; t < 12; t += 0.05) {
      const spark = sampleForgeSpark(i, t);
      assert.deepEqual(spark, sampleForgeSpark(i, t));
      assert.ok(spark.x >= 0 && spark.x <= 1);
      assert.ok(spark.y >= 0 && spark.y <= 1);
      assert.ok(spark.alpha >= 0 && spark.alpha <= 1);
      if (spark.alpha > 0) visible++; else quiet++;
    }
  }
  assert.ok(visible > 0 && quiet > visible);
  assert.equal(sampleForgeSpark(0, 2, true).alpha, 0);
});
