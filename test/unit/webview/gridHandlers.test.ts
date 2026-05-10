// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  buildCopyShortcutMessage,
  buildSelectAll,
  isCopyShortcut,
  isSelectAllShortcut,
  resolveCellClick,
  visibleRange,
} from "../../../client/src/webview/grid/gridHandlers";
import type { CellRange, ColumnMeta } from "../../../client/src/webview/protocol";

const COLS: ColumnMeta[] = [
  { id: "a", name: "a", kind: "char" },
  { id: "b", name: "b", kind: "num" },
  { id: "c", name: "c", kind: "char" },
];

function key(opts: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    key: "", preventDefault: () => undefined,
    ...opts,
  } as unknown as KeyboardEvent;
}

// --------------------------------------------------------------------------
// resolveCellClick
// --------------------------------------------------------------------------

describe("resolveCellClick", () => {
  it("plain click → single-cell selection at the target", () => {
    const out = resolveCellClick({
      row: 3, col: 4, isRowGutter: false,
      shift: false, ctrlOrMeta: false,
      columnCount: 5, selection: [], anchor: null,
    });
    expect(out.selection).toEqual([
      { fromRow: 3, toRow: 3, fromCol: 4, toCol: 4 },
    ]);
    expect(out.anchor).toEqual({ row: 3, col: 4 });
  });

  it("row-gutter click → whole-row selection across all columns", () => {
    const out = resolveCellClick({
      row: 7, col: 0, isRowGutter: true,
      shift: false, ctrlOrMeta: false,
      columnCount: 4, selection: [], anchor: null,
    });
    expect(out.selection).toEqual([
      { fromRow: 7, toRow: 7, fromCol: 0, toCol: 3 },
    ]);
    expect(out.anchor).toEqual({ row: 7, col: 0 });
  });

  it("shift-click with anchor → rectangle from anchor to target", () => {
    const out = resolveCellClick({
      row: 5, col: 2, isRowGutter: false,
      shift: true, ctrlOrMeta: false,
      columnCount: 5,
      selection: [{ fromRow: 1, toRow: 1, fromCol: 1, toCol: 1 }],
      anchor: { row: 1, col: 1 },
    });
    expect(out.selection).toEqual([
      { fromRow: 1, toRow: 5, fromCol: 1, toCol: 2 },
    ]);
    // The anchor stays put (we only extend FROM it).
    expect(out.anchor).toEqual({ row: 1, col: 1 });
  });

  it("shift-click with NO anchor falls back to single-cell selection", () => {
    const out = resolveCellClick({
      row: 2, col: 2, isRowGutter: false,
      shift: true, ctrlOrMeta: false,
      columnCount: 3, selection: [], anchor: null,
    });
    expect(out.selection).toEqual([
      { fromRow: 2, toRow: 2, fromCol: 2, toCol: 2 },
    ]);
  });

  it("ctrl-click adds a cell to the existing selection", () => {
    const out = resolveCellClick({
      row: 0, col: 0, isRowGutter: false,
      shift: false, ctrlOrMeta: true,
      columnCount: 3,
      selection: [{ fromRow: 5, toRow: 5, fromCol: 5, toCol: 5 }],
      anchor: { row: 5, col: 5 },
    });
    expect(out.selection).toHaveLength(2);
    expect(out.anchor).toEqual({ row: 0, col: 0 });
  });

  it("ctrl-click on a cell already covered by the selection removes the rect", () => {
    const out = resolveCellClick({
      row: 1, col: 1, isRowGutter: false,
      shift: false, ctrlOrMeta: true,
      columnCount: 3,
      selection: [{ fromRow: 1, toRow: 1, fromCol: 1, toCol: 1 }],
      anchor: { row: 1, col: 1 },
    });
    expect(out.selection).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// visibleRange
// --------------------------------------------------------------------------

describe("visibleRange", () => {
  it("computes a one-screenful buffer either side of the visible band", () => {
    // scrollTop=200 / 28 = first row 7. clientHeight=280/28 = 10 visible.
    // buffer = 10. So range should be [max(0,7-10), min(N-1, 7+10+10)]
    // = [0, 27] when N >= 28.
    const r = visibleRange(200, 280, 28, 100);
    expect(r).toEqual({ from: 0, to: 27 });
  });
  it("clamps the high end to rowCount-1", () => {
    const r = visibleRange(2800, 280, 28, 110);
    expect(r.to).toBe(109);
  });
  it("clamps the low end to 0", () => {
    const r = visibleRange(0, 280, 28, 100);
    expect(r.from).toBe(0);
  });
});

// --------------------------------------------------------------------------
// keyboard shortcut predicates
// --------------------------------------------------------------------------

describe("isCopyShortcut", () => {
  it.each([
    [{ ctrlKey: true, key: "c" }, true],
    [{ metaKey: true, key: "C" }, true],
    [{ ctrlKey: true, shiftKey: true, key: "c" }, true], // copy-with-headers
    [{ ctrlKey: true, key: "v" }, false],
    [{ ctrlKey: true, key: "c", altKey: true }, false], // alt is excluded
    [{ key: "c" }, false], // no modifier
  ])("evaluates %o → %s", (opts, expected) => {
    expect(isCopyShortcut(key(opts))).toBe(expected);
  });
});

describe("isSelectAllShortcut", () => {
  it.each([
    [{ ctrlKey: true, key: "a" }, true],
    [{ metaKey: true, key: "A" }, true],
    [{ key: "a" }, false],
    [{ ctrlKey: true, key: "b" }, false],
  ])("evaluates %o → %s", (opts, expected) => {
    expect(isSelectAllShortcut(key(opts))).toBe(expected);
  });
});

// --------------------------------------------------------------------------
// buildCopyShortcutMessage
// --------------------------------------------------------------------------

describe("buildCopyShortcutMessage", () => {
  const dataMap: Record<string, string | null> = {
    "0:0": "1", "0:1": "alice", "0:2": "x",
    "1:0": "2", "1:1": "bob",   "1:2": null,
  };
  const rect: CellRange[] = [
    { fromRow: 0, toRow: 1, fromCol: 0, toCol: 2 },
  ];

  it("returns null when the selection is empty", () => {
    const msg = buildCopyShortcutMessage({
      selection: [], columns: COLS,
      getCell: () => undefined, withHeaders: false,
    });
    expect(msg).toBeNull();
  });

  it("plain Ctrl+C → tab-separated cells, no header line", () => {
    const msg = buildCopyShortcutMessage({
      selection: rect, columns: COLS,
      getCell: (r, c) => dataMap[`${r}:${c}`],
      withHeaders: false,
    });
    expect(msg).not.toBeNull();
    expect(msg!.kind).toBe("copy");
    expect(msg!.format).toBe("plain"); // wire format is always "plain"
    expect(msg!.text).toBe("1\talice\tx\n2\tbob\t");
  });

  it("Ctrl+Shift+C → header line then data lines", () => {
    const msg = buildCopyShortcutMessage({
      selection: rect, columns: COLS,
      getCell: (r, c) => dataMap[`${r}:${c}`],
      withHeaders: true,
    });
    expect(msg!.text.split("\n")[0]).toBe("a\tb\tc");
    expect(msg!.text.split("\n")).toHaveLength(3);
  });
});

// --------------------------------------------------------------------------
// buildSelectAll
// --------------------------------------------------------------------------

describe("buildSelectAll", () => {
  it("returns a single rectangle covering every cell", () => {
    expect(buildSelectAll(10, 3)).toEqual([
      { fromRow: 0, toRow: 9, fromCol: 0, toCol: 2 },
    ]);
  });
  it("returns null when the table is empty", () => {
    expect(buildSelectAll(0, 3)).toBeNull();
    expect(buildSelectAll(5, 0)).toBeNull();
  });
});
