import { test } from "node:test";
import assert from "node:assert/strict";
import { hotspot, peakLabel, pct, ratio } from "./patterns.ts";
import type { HeatCell } from "./derive.ts";

test("number formats", () => {
  assert.equal(pct(17, 355), "4.8%");
  assert.equal(pct(30, 100), "30%");
  assert.equal(pct(1, 0), "–");
  assert.equal(ratio(2.84), "2.8×");
  assert.equal(ratio(Infinity), "only");
});

test("peak labels", () => {
  const hours = Array.from({ length: 24 }, (_, h) => (h === 8 || h === 17 ? 10 : 1));
  assert.equal(peakLabel(hours), "08–09h, 17–18h");
  assert.equal(peakLabel(Array(24).fill(0)), "–");
});

test("hotspot finds the worst three-hour band", () => {
  const cells: HeatCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ n: 10, difficulty: 0 })),
  );
  for (let d = 0; d < 5; d++) cells[d][17].difficulty = 3;
  const h = hotspot(cells)!;
  assert.equal(h.weekdaysOnly, true);
  assert.ok(h.from <= 17 && h.to > 17);
});
