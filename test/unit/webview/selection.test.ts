// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  bounds,
  cellCount,
  cellKey,
  containsCell,
  iterCells,
  rectFromTo,
  singleCell,
  toggleCell,
} from "../../../client/src/webview/selection";

describe("selection.singleCell", () => {
  it("returns a 1×1 inclusive rectangle at the given cell", () => {
    expect(singleCell(3, 7)).toEqual([
      { fromRow: 3, toRow: 3, fromCol: 7, toCol: 7 },
    ]);
  });
});

describe("selection.rectFromTo", () => {
  it("normalises inverted bounds (b before a in either axis)", () => {
    expect(
      rectFromTo({ row: 5, col: 9 }, { row: 2, col: 3 }),
    ).toEqual({ fromRow: 2, toRow: 5, fromCol: 3, toCol: 9 });
  });
  it("collapses to a single cell when a === b", () => {
    expect(rectFromTo({ row: 4, col: 4 }, { row: 4, col: 4 })).toEqual({
      fromRow: 4, toRow: 4, fromCol: 4, toCol: 4,
    });
  });
});

describe("selection.containsCell", () => {
  const ranges = [
    { fromRow: 0, toRow: 1, fromCol: 0, toCol: 1 },
    { fromRow: 5, toRow: 5, fromCol: 5, toCol: 5 },
  ];
  it("returns true for cells inside any rectangle", () => {
    expect(containsCell(ranges, 0, 0)).toBe(true);
    expect(containsCell(ranges, 1, 1)).toBe(true);
    expect(containsCell(ranges, 5, 5)).toBe(true);
  });
  it("returns false for cells outside every rectangle", () => {
    expect(containsCell(ranges, 2, 0)).toBe(false);
    expect(containsCell(ranges, 0, 2)).toBe(false);
    expect(containsCell(ranges, 4, 5)).toBe(false);
  });
});

describe("selection.toggleCell", () => {
  it("adds a single cell when not already present", () => {
    const next = toggleCell([], 1, 2);
    expect(next).toEqual([{ fromRow: 1, toRow: 1, fromCol: 2, toCol: 2 }]);
  });
  it("removes any rectangle that wholly covers the toggled cell", () => {
    const start = [{ fromRow: 0, toRow: 5, fromCol: 0, toCol: 5 }];
    const next = toggleCell(start, 2, 3);
    expect(next).toEqual([]);
  });
  it("does not fragment when the toggled cell sits inside a multi-cell rect (mssql parity)", () => {
    // Toggling a cell inside a 2x2 rectangle removes the whole rectangle —
    // the implementation deliberately avoids splitting into L-shapes.
    const start = [{ fromRow: 0, toRow: 1, fromCol: 0, toCol: 1 }];
    const next = toggleCell(start, 0, 0);
    expect(next).toEqual([]);
  });
});

describe("selection.iterCells", () => {
  it("emits all cells from a single rectangle, row-major", () => {
    const cells = iterCells([
      { fromRow: 0, toRow: 1, fromCol: 0, toCol: 1 },
    ]);
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
  });
  it("dedupes cells across overlapping rectangles", () => {
    const cells = iterCells([
      { fromRow: 0, toRow: 1, fromCol: 0, toCol: 1 },
      { fromRow: 1, toRow: 2, fromCol: 1, toCol: 2 },
    ]);
    // 4 + 4 cells with one overlap (1,1) → 7 unique.
    expect(cells).toHaveLength(7);
    const keys = new Set(cells.map((c) => cellKey(c.row, c.col)));
    expect(keys.size).toBe(7);
  });
  it("returns an empty array for an empty selection", () => {
    expect(iterCells([])).toEqual([]);
  });
});

describe("selection.cellCount", () => {
  it("multiplies width × height per rect, double-counting on overlap", () => {
    // Note: cellCount sums areas; overlapping cells are counted twice.
    // iterCells dedupes; cellCount does not — that is intentional for
    // status-bar speed.
    expect(
      cellCount([
        { fromRow: 0, toRow: 1, fromCol: 0, toCol: 1 },
        { fromRow: 1, toRow: 2, fromCol: 1, toCol: 2 },
      ]),
    ).toBe(8);
  });
  it("handles a single cell", () => {
    expect(cellCount([{ fromRow: 7, toRow: 7, fromCol: 4, toCol: 4 }])).toBe(1);
  });
});

describe("selection.bounds", () => {
  it("returns null for an empty selection", () => {
    expect(bounds([])).toBeNull();
  });
  it("returns the union bounding box across all rectangles", () => {
    expect(
      bounds([
        { fromRow: 2, toRow: 3, fromCol: 4, toCol: 5 },
        { fromRow: 0, toRow: 1, fromCol: 6, toCol: 9 },
      ]),
    ).toEqual({ fromRow: 0, toRow: 3, fromCol: 4, toCol: 9 });
  });
});

describe("selection.cellKey", () => {
  it("produces collision-free string keys for non-negative integers", () => {
    const seen = new Set<string>();
    for (let r = 0; r < 100; r++) {
      for (let c = 0; c < 100; c++) {
        seen.add(cellKey(r, c));
      }
    }
    expect(seen.size).toBe(10_000);
  });
  it("does not collide for cells that differ in only one axis", () => {
    expect(cellKey(1, 23)).not.toBe(cellKey(12, 3));
  });
});
