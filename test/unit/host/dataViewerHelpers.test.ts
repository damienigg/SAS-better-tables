// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  buildSelectionPredicate,
  combineFilters,
  csvCell,
  inSelectionAtCell,
  isWebviewMessage,
  mapType,
  toColumnMeta,
} from "../../../client/src/panels/DataViewerHelpers";

describe("DataViewerHelpers.toColumnMeta", () => {
  it("maps SAS Column shape to ColumnMeta", () => {
    expect(
      toColumnMeta({
        id: "x", name: "x", label: "X axis", type: "num", length: 8,
        format: { name: "BEST" },
      }),
    ).toEqual({
      id: "x", name: "x", label: "X axis", kind: "num", length: 8, format: "BEST",
    });
  });
  it("falls back to id when name is absent", () => {
    expect(toColumnMeta({ id: "fallback", type: "char" }).name).toBe("fallback");
  });
});

describe("DataViewerHelpers.mapType", () => {
  it.each([
    ["char", "char"], ["string", "char"], ["text", "char"],
    ["num", "num"], ["numeric", "num"], ["double", "num"], ["integer", "num"],
    ["date", "date"], ["time", "time"],
    ["datetime", "datetime"], ["dt", "datetime"],
    ["currency", "currency"],
    [undefined, "unknown"], ["mystery", "unknown"], ["", "unknown"],
  ])("type %s → kind %s", (input, expected) => {
    expect(mapType(input)).toBe(expected);
  });
});

describe("DataViewerHelpers.combineFilters", () => {
  it("returns undefined for an empty filter list", () => {
    expect(combineFilters([])).toBeUndefined();
  });
  it("emits the SAS WHERE syntax for a checklist filter", () => {
    const out = combineFilters([{ colId: "name", values: ["alice", "bob"] }]);
    expect(out!.filterValue).toBe('(name in ("alice","bob"))');
  });
  it("doubles embedded quotes in values (SAS string-literal escaping)", () => {
    const out = combineFilters([{ colId: "n", values: ['He said "hi"'] }]);
    expect(out!.filterValue).toBe('(n in ("He said ""hi"""))');
  });
  it("wraps free-form expr filters in parentheses", () => {
    const out = combineFilters([{ colId: "x", expr: "age > 30" }]);
    expect(out!.filterValue).toBe("(age > 30)");
  });
  it("ANDs multiple filters together", () => {
    const out = combineFilters([
      { colId: "x", expr: "age > 30" },
      { colId: "y", values: ["yes"] },
    ]);
    expect(out!.filterValue).toBe('(age > 30) and (y in ("yes"))');
  });
  it("attaches the raw filter array as a sidecar so file adapters see it", () => {
    const out = combineFilters([{ colId: "x", values: ["a"] }]);
    expect(out!.filters).toEqual([{ colId: "x", values: ["a"] }]);
  });
});

describe("DataViewerHelpers.csvCell", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['has "quote"', '"has ""quote"""'],
    ["multi\nline", '"multi\nline"'],
  ])("formats %p as %p", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});

describe("DataViewerHelpers.buildSelectionPredicate", () => {
  it("returns true iff the row is touched by any rectangle", () => {
    const pred = buildSelectionPredicate([
      { fromRow: 2, toRow: 4, fromCol: 0, toCol: 5 },
      { fromRow: 7, toRow: 7, fromCol: 0, toCol: 0 },
    ]);
    expect(pred(2)).toBe(true);
    expect(pred(4)).toBe(true);
    expect(pred(5)).toBe(false);
    expect(pred(7)).toBe(true);
  });
});

describe("DataViewerHelpers.inSelectionAtCell", () => {
  const ranges = [
    { fromRow: 1, toRow: 3, fromCol: 1, toCol: 3 },
  ];
  it("checks both row AND column membership", () => {
    expect(inSelectionAtCell(ranges, 2, 2)).toBe(true);
    expect(inSelectionAtCell(ranges, 2, 4)).toBe(false);
    expect(inSelectionAtCell(ranges, 4, 2)).toBe(false);
  });
});

describe("DataViewerHelpers.isWebviewMessage", () => {
  it.each([
    [{ kind: "ready" }, true],
    [{ kind: "rows-req" }, true],
    [{ kind: "open-column-properties" }, true],
    [{ kind: "save-view-state" }, true],
    [{ kind: "copy" }, true],
    [{ kind: "export" }, true],
    [{ kind: "unknown" }, false],
    [{ noKind: 1 }, false],
    [null, false],
    ["string", false],
  ])("checks %p → %p", (input, expected) => {
    expect(isWebviewMessage(input)).toBe(expected);
  });
});
