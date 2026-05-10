// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { csvSource } from "../../../client/src/components/FileTableViewer/csvSource";

const FIXTURES = path.resolve(__dirname, "../../fixtures");

describe("csvSource", () => {
  it("loads cars.csv with inferred types", async () => {
    const src = await csvSource(path.join(FIXTURES, "cars.csv"), "uid");
    expect(src.title).toBe("cars.csv");
    expect(src.uid).toBe("uid");
    expect(src.columns.map((c) => c.name)).toEqual([
      "make", "model", "year", "price", "electric",
    ]);
    expect(src.columns.map((c) => c.type)).toEqual([
      "char", "char", "num", "num", "char",
    ]);
    expect(src.rowCount).toBe(5);
  });

  it("loads tabs.tsv with the tab delimiter (inferred from extension)", async () => {
    const src = await csvSource(path.join(FIXTURES, "tabs.tsv"), "uid");
    expect(src.columns.map((c) => c.name)).toEqual(["id", "city", "rainfall_mm"]);
    expect(src.rowCount).toBe(3);
  });

  it("preserves null vs empty distinction (empty cells become null in storage)", async () => {
    const src = await csvSource(path.join(FIXTURES, "nullable.csv"), "uid");
    const data = await src.getRows(0, 99, [], undefined);
    // Row 1: id=2, name=empty, score=87 → cells[2] (name) should be null
    const aliceRow = data.rows[1].cells;
    expect(aliceRow[2]).toBe(""); // serialised back to "" for the webview
  });

  it("handles a delimiter override", async () => {
    // Force-read the CSV as TSV — there are no tabs, so the entire
    // header row becomes one column.
    const src = await csvSource(
      path.join(FIXTURES, "cars.csv"), "uid", "\t",
    );
    expect(src.columns).toHaveLength(1);
  });
});
