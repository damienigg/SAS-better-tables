// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { xlsxSource } from "../../../client/src/components/FileTableViewer/xlsxSource";
import { __testHooks } from "../../mocks/vscode";

let tmpDir: string;
let oneSheet: string;
let twoSheets: string;

// Programmatic xlsx fixtures so we don't have to commit binary files.
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sbt-xlsx-"));

  const ExcelJS = await import("exceljs");

  const wb1 = new ExcelJS.Workbook();
  const ws1 = wb1.addWorksheet("data");
  ws1.addRow(["id", "name", "score"]);
  ws1.addRow([1, "alice", 98]);
  ws1.addRow([2, "bob", 87]);
  oneSheet = path.join(tmpDir, "one.xlsx");
  await wb1.xlsx.writeFile(oneSheet);

  const wb2 = new ExcelJS.Workbook();
  const wsA = wb2.addWorksheet("Alpha");
  wsA.addRow(["a", "b"]);
  wsA.addRow([1, 2]);
  const wsB = wb2.addWorksheet("Beta");
  wsB.addRow(["x", "y"]);
  wsB.addRow([10, 20]);
  twoSheets = path.join(tmpDir, "two.xlsx");
  await wb2.xlsx.writeFile(twoSheets);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("xlsxSource", () => {
  it("opens a single-sheet workbook without prompting", async () => {
    const src = await xlsxSource(oneSheet, "uid");
    expect(src).toBeDefined();
    expect(src!.title).toBe("one.xlsx");
    expect(src!.columns.map((c) => c.name)).toEqual(["id", "name", "score"]);
    expect(src!.rowCount).toBe(2);
    const out = await src!.getRows(0, 99, [], undefined);
    expect(out.rows[0].cells.slice(1)).toEqual(["1", "alice", "98"]);
  });

  it("prompts a sheet picker on a multi-sheet workbook and opens the chosen sheet", async () => {
    __testHooks.setQuickPickAnswer("Beta");
    const src = await xlsxSource(twoSheets, "uid");
    expect(src).toBeDefined();
    expect(src!.title).toContain("(Beta)");
    expect(src!.columns.map((c) => c.name)).toEqual(["x", "y"]);
    const out = await src!.getRows(0, 99, [], undefined);
    expect(out.rows[0].cells.slice(1)).toEqual(["10", "20"]);
  });

  it("returns undefined when the user cancels the sheet picker", async () => {
    __testHooks.setQuickPickAnswer(undefined);
    const src = await xlsxSource(twoSheets, "uid");
    expect(src).toBeUndefined();
  });
});
