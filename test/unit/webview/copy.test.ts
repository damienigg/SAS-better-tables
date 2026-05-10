// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { buildCopyText } from "../../../client/src/webview/copy";
import type { CellRange, ColumnMeta } from "../../../client/src/webview/protocol";

const COLS: ColumnMeta[] = [
  { id: "a", name: "a", kind: "num" },
  { id: "b", name: "b", kind: "char" },
  { id: "c", name: "c", kind: "char" },
];

const DATA: Record<string, Record<string, string | null>> = {
  "0:0": { v: "1" }, "0:1": { v: "alice" }, "0:2": { v: "x" },
  "1:0": { v: "2" }, "1:1": { v: "bob" },   "1:2": { v: null },
  "2:0": { v: "3" }, "2:1": { v: "carl" },  "2:2": { v: "z" },
};

function getCell(r: number, c: number): string | null | undefined {
  return DATA[`${r}:${c}`]?.v ?? undefined;
}

const fullRect: CellRange[] = [{ fromRow: 0, toRow: 2, fromCol: 0, toCol: 2 }];

describe("copy.buildCopyText", () => {
  it("plain → tab-separated cells, no header line", () => {
    const out = buildCopyText("plain", { selection: fullRect, columns: COLS, getCell });
    expect(out).toBe(
      "1\talice\tx\n" +
      "2\tbob\t\n" +
      "3\tcarl\tz",
    );
  });

  it("with-headers → header line then data lines (TSV)", () => {
    const out = buildCopyText("with-headers", { selection: fullRect, columns: COLS, getCell });
    expect(out.split("\n")[0]).toBe("a\tb\tc");
    expect(out.split("\n")).toHaveLength(4);
  });

  it("headers-only → only the column headers, ignores selection", () => {
    const out = buildCopyText("headers-only", {
      selection: [],
      columns: COLS,
      getCell: () => undefined,
    });
    expect(out).toBe("a\tb\tc");
  });

  it("csv → RFC-4180 quoted on commas / quotes / newlines", () => {
    const dataMap: Record<string, string | null> = {
      "0:0": "x,y", "0:1": 'a"b', "0:2": "line\nbreak",
    };
    const out = buildCopyText("csv", {
      selection: [{ fromRow: 0, toRow: 0, fromCol: 0, toCol: 2 }],
      columns: COLS,
      getCell: (r, c) => dataMap[`${r}:${c}`],
    });
    // The data row contains a literal LF; can't naively split on \n.
    expect(out).toBe('a,b,c\n"x,y","a""b","line\nbreak"');
  });

  it("tsv → header then tab-separated data", () => {
    const out = buildCopyText("tsv", { selection: fullRect, columns: COLS, getCell });
    expect(out.split("\n")[0]).toBe("a\tb\tc");
    expect(out.split("\n")).toHaveLength(4);
  });

  it("plain TSV preserves multi-line cell content via CSV-style quoting", () => {
    // Regression: previously \t/\r/\n were rewritten to spaces, which
    // silently corrupted multi-line text. Now they are quoted.
    const dataMap: Record<string, string> = { "0:0": "line1\nline2" };
    const out = buildCopyText("plain", {
      selection: [{ fromRow: 0, toRow: 0, fromCol: 0, toCol: 0 }],
      columns: [COLS[0]],
      getCell: (r, c) => dataMap[`${r}:${c}`],
    });
    expect(out).toBe('"line1\nline2"');
  });

  it("json → array of objects keyed by column name", () => {
    const out = buildCopyText("json", { selection: fullRect, columns: COLS, getCell });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual([
      { a: "1", b: "alice", c: "x" },
      { a: "2", b: "bob",   c: null },
      { a: "3", b: "carl",  c: "z" },
    ]);
  });

  it("returns empty string for an empty selection (other than headers-only)", () => {
    expect(
      buildCopyText("plain", { selection: [], columns: COLS, getCell: () => undefined }),
    ).toBe("");
    expect(
      buildCopyText("csv", { selection: [], columns: COLS, getCell: () => undefined }),
    ).toBe("");
  });

  it("non-rectangular union: cells outside the selected sub-rectangles render as null/empty", () => {
    const sel: CellRange[] = [
      { fromRow: 0, toRow: 0, fromCol: 0, toCol: 0 },
      { fromRow: 0, toRow: 0, fromCol: 2, toCol: 2 },
    ];
    const out = buildCopyText("plain", { selection: sel, columns: COLS, getCell });
    // Bounding rectangle covers cols 0..2; the unselected col 1 → empty.
    expect(out).toBe("1\t\tx");
  });
});
