// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Cross-check between the CSV writer (`copy.ts:buildCopyText("csv")`)
// and the CSV reader (`csvParser.ts:parseCsv`). Each module's own unit
// suite is exhaustive within itself, but neither catches contract
// drift between the two — a writer that quotes the wrong character
// will silently survive the writer's tests, and so will a reader that
// fails to unescape the same character on the read side.
//
// The property tested here: for any matrix of cell values, parsing the
// CSV that the writer produced reconstructs the matrix exactly.

import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { buildCopyText } from "../../../client/src/webview/copy";
import { parseCsv } from "../../../client/src/components/FileTableViewer/csvParser";
import type { ColumnMeta } from "../../../client/src/webview/protocol";

function colsFor(headers: string[]): ColumnMeta[] {
  return headers.map((h) => ({ id: h, name: h, kind: "char" as const }));
}

async function roundTrip(
  headers: string[],
  rows: string[][],
): Promise<string[][]> {
  const cols = colsFor(headers);
  const dataMap = new Map<string, string>();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      dataMap.set(`${r}:${c}`, rows[r][c]);
    }
  }
  const csv = buildCopyText("csv", {
    selection: [
      {
        fromRow: 0,
        toRow: rows.length - 1,
        fromCol: 0,
        toCol: headers.length - 1,
      },
    ],
    columns: cols,
    getCell: (r, c) => dataMap.get(`${r}:${c}`),
  });
  const parsed = await parseCsv(Readable.from([csv]));
  return parsed;
}

describe("CSV writer/reader round-trip", () => {
  it("plain ASCII rectangular matrix round-trips identically", async () => {
    const headers = ["a", "b", "c"];
    const rows = [
      ["1", "alice", "x"],
      ["2", "bob", "y"],
      ["3", "carol", "z"],
    ];
    const out = await roundTrip(headers, rows);
    expect(out).toEqual([headers, ...rows]);
  });

  it("cells with embedded commas survive the round-trip", async () => {
    const headers = ["name", "city"];
    const rows = [
      ["Smith, Jane", "Paris, France"],
      ["O'Connor", "Cork"],
    ];
    const out = await roundTrip(headers, rows);
    expect(out).toEqual([headers, ...rows]);
  });

  it("cells with embedded double-quotes survive the round-trip", async () => {
    const headers = ["q"];
    const rows = [
      ['He said "hi"'],
      ['""'],
      ['mix "of" quotes "and" text'],
    ];
    const out = await roundTrip(headers, rows);
    expect(out).toEqual([headers, ...rows]);
  });

  it("cells with embedded newlines survive the round-trip", async () => {
    const headers = ["multi"];
    const rows = [
      ["line1\nline2"],
      ["a\nb\nc"],
      ["plain"],
    ];
    const out = await roundTrip(headers, rows);
    expect(out).toEqual([headers, ...rows]);
  });

  it("the worst case of all three at once still round-trips", async () => {
    const headers = ["chaos"];
    const rows = [
      [`a, "b" \n c, "d" `],
      [`""\n,"`],
      ["plain"],
    ];
    const out = await roundTrip(headers, rows);
    expect(out).toEqual([headers, ...rows]);
  });

  it("empty-string cells are preserved (not collapsed to null)", async () => {
    const headers = ["a", "b"];
    const rows = [
      ["", "x"],
      ["y", ""],
      ["", ""],
    ];
    const out = await roundTrip(headers, rows);
    expect(out).toEqual([headers, ...rows]);
  });

  it("a single-row, single-column matrix still round-trips", async () => {
    const out = await roundTrip(["only"], [["value"]]);
    expect(out).toEqual([["only"], ["value"]]);
  });
});
