// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { computeStats } from "../../../client/src/webview/stats";
import type { CellRange, ColumnMeta } from "../../../client/src/webview/protocol";

const numCols: ColumnMeta[] = [
  { id: "x", name: "x", kind: "num" },
  { id: "y", name: "y", kind: "num" },
];
const charCols: ColumnMeta[] = [
  { id: "name", name: "name", kind: "char" },
];
const fullRect: CellRange[] = [{ fromRow: 0, toRow: 2, fromCol: 0, toCol: 0 }];

describe("stats.computeStats", () => {
  it("computes sum/avg/min/max on a selection of numeric cells", () => {
    const cells = ["1", "2", "3"];
    const out = computeStats({
      ranges: fullRect,
      columns: numCols,
      getCell: (r) => cells[r],
    });
    expect(out.sum).toBe(6);
    expect(out.avg).toBe(2);
    expect(out.min).toBe(1);
    expect(out.max).toBe(3);
    expect(out.cellCount).toBe(3);
    expect(out.nullCount).toBe(0);
    expect(out.distinctCount).toBe(3);
  });

  it("returns null sum/avg when any cell is non-numeric", () => {
    const cells = ["1", "two", "3"];
    const out = computeStats({
      ranges: fullRect,
      columns: numCols,
      getCell: (r) => cells[r],
    });
    expect(out.sum).toBeNull();
    expect(out.avg).toBeNull();
    expect(out.min).toBeNull();
    expect(out.max).toBeNull();
  });

  it("counts nulls separately and excludes them from numeric aggregates", () => {
    const cells: (string | null)[] = ["10", null, "20"];
    const out = computeStats({
      ranges: fullRect,
      columns: numCols,
      getCell: (r) => cells[r],
    });
    expect(out.nullCount).toBe(1);
    expect(out.sum).toBe(30);
    expect(out.avg).toBe(15);
  });

  it("ignores cells whose value is undefined (not loaded yet)", () => {
    const cells: (string | undefined)[] = ["10", undefined, "20"];
    const out = computeStats({
      ranges: fullRect,
      columns: numCols,
      getCell: (r) => cells[r],
    });
    expect(out.nullCount).toBe(0);
    expect(out.nonNullCount).toBe(2);
    expect(out.sum).toBe(30);
  });

  it("returns null sum for char columns even with parseable numbers", () => {
    const cells = ["1", "2", "3"];
    const out = computeStats({
      ranges: fullRect,
      columns: charCols,
      getCell: (r) => cells[r],
    });
    expect(out.sum).toBeNull();
    expect(out.distinctCount).toBe(3);
  });

  it("computes distinct across an empty selection", () => {
    const out = computeStats({
      ranges: [],
      columns: numCols,
      getCell: () => undefined,
    });
    expect(out.cellCount).toBe(0);
    expect(out.distinctCount).toBe(0);
    expect(out.sum).toBeNull();
  });
});
