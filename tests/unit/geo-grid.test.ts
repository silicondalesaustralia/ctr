import { describe, expect, it } from "vitest";
import { buildGridPoints, gridSettings, isCentreCell } from "../../src/geo-grid/grid-points.js";
import { summariseGridPoints } from "../../src/geo-grid/grid-summary.js";

describe("grid points", () => {
  const centre = { latitude: -34.9285, longitude: 138.6007 };

  it("builds an odd square grid centred on the rank check location", () => {
    const cells = buildGridPoints(centre, { size: 5, spacingKm: 2 });
    expect(cells).toHaveLength(25);
    const middle = cells.find((cell) => isCentreCell(cell, 5));
    expect(middle).toMatchObject({ row: 2, col: 2, ...centre });
    const north = cells.find((cell) => cell.row === 0 && cell.col === 2)!;
    expect(north.latitude - centre.latitude).toBeCloseTo((2 * 2) / 111.32, 4);
  });

  it("clamps settings to an odd size and sane spacing", () => {
    expect(gridSettings({ gridSize: null, gridSpacingKm: null })).toEqual({ size: 5, spacingKm: 2 });
    expect(gridSettings({ gridSize: 4, gridSpacingKm: 50 })).toEqual({ size: 5, spacingKm: 10 });
    expect(gridSettings({ gridSize: 1, gridSpacingKm: 0.1 })).toEqual({ size: 3, spacingKm: 0.5 });
  });
});

describe("grid summary", () => {
  it("counts 3-pack points and averages with not found as 21", () => {
    const summary = summariseGridPoints([
      { status: "captured", position: 2, source: "local_pack" },
      { status: "captured", position: 9, source: "more_places" },
      { status: "not_found", position: null, source: null },
      { status: "pending", position: null, source: null },
    ]);
    expect(summary).toEqual({ inPackCount: 1, foundCount: 2, avgRank: 10.7 });
  });
});
