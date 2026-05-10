// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// xlsxSource cannot be unit-tested under vitest at the moment: the
// `import ExcelJS from "exceljs"` resolves to the real CJS module
// even when `vi.mock` is configured, because vitest delegates CJS
// loading to Node's native loader which bypasses the mock registry.
// The reader is exercised end-to-end in the @vscode/test-electron
// integration tier (where it loads a real .xlsx fixture).
//
// Logical pieces that DON'T touch exceljs (cell stringification, type
// inference for xlsx-shaped input, the InMemorySource adapter that
// owns the sort/filter pipeline) are covered by their own unit
// suites (`inMemorySource.test.ts`, `typeInfer.test.ts`).
//
// See also: client/test/fileTableViewer.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __testHooks } from "../../mocks/vscode";

interface FakeRow {
  values: unknown[];
}
interface FakeSheet {
  name: string;
  state: "visible" | "hidden";
  actualColumnCount: number;
  rows: FakeRow[];
  eachRow(
    opts: { includeEmpty: boolean },
    cb: (row: FakeRow, n: number) => void,
  ): void;
}

const sheetState = vi.hoisted(() => ({
  workbook: {
    worksheets: [] as FakeSheet[],
  },
}));

vi.mock("exceljs", () => {
  class Workbook {
    public worksheets: FakeSheet[] = [];
    public xlsx = {
      readFile: async (_path: string) => {
        this.worksheets = sheetState.workbook.worksheets;
        return this;
      },
    };
  }
  return {
    default: { Workbook },
    Workbook,
  };
});

import { xlsxSource } from "../../../client/src/components/FileTableViewer/xlsxSource";

function makeSheet(
  name: string,
  rows: unknown[][],
): FakeSheet {
  const fakeRows: FakeRow[] = rows.map((cells) => ({
    // exceljs is 1-indexed; values[0] is unused.
    values: [undefined, ...cells],
  }));
  return {
    name,
    state: "visible",
    actualColumnCount: rows[0]?.length ?? 0,
    rows: fakeRows,
    eachRow(opts, cb) {
      void opts;
      fakeRows.forEach((r, i) => cb(r, i + 1));
    },
  };
}

beforeEach(() => {
  sheetState.workbook.worksheets = [];
});
afterEach(() => {
  sheetState.workbook.worksheets = [];
});

describe.skip("xlsxSource (skipped — see file header)", () => {
  it("opens a single-sheet workbook without prompting", async () => {
    sheetState.workbook.worksheets = [
      makeSheet("data", [
        ["id", "name", "score"],
        [1, "alice", 98],
        [2, "bob", 87],
      ]),
    ];
    const src = await xlsxSource("/tmp/one.xlsx", "uid");
    expect(src).toBeDefined();
    expect(src!.title).toBe("one.xlsx");
    expect(src!.columns.map((c) => c.name)).toEqual(["id", "name", "score"]);
    expect(src!.rowCount).toBe(2);
    const out = await src!.getRows(0, 99, [], undefined);
    expect(out.rows[0].cells.slice(1)).toEqual(["1", "alice", "98"]);
  });

  it("prompts a sheet picker on a multi-sheet workbook and opens the chosen sheet", async () => {
    sheetState.workbook.worksheets = [
      makeSheet("Alpha", [["a", "b"], [1, 2]]),
      makeSheet("Beta", [["x", "y"], [10, 20]]),
    ];
    __testHooks.setQuickPickAnswer("Beta");
    const src = await xlsxSource("/tmp/two.xlsx", "uid");
    expect(src).toBeDefined();
    expect(src!.title).toContain("(Beta)");
    expect(src!.columns.map((c) => c.name)).toEqual(["x", "y"]);
    const out = await src!.getRows(0, 99, [], undefined);
    expect(out.rows[0].cells.slice(1)).toEqual(["10", "20"]);
  });

  it("returns undefined when the user cancels the sheet picker", async () => {
    sheetState.workbook.worksheets = [
      makeSheet("A", [["a"], [1]]),
      makeSheet("B", [["b"], [2]]),
    ];
    __testHooks.setQuickPickAnswer(undefined);
    const src = await xlsxSource("/tmp/two.xlsx", "uid");
    expect(src).toBeUndefined();
  });

  it("filters out hidden sheets", async () => {
    const visible = makeSheet("Visible", [["v"], [1]]);
    const hidden = makeSheet("Hidden", [["h"], [99]]);
    hidden.state = "hidden";
    sheetState.workbook.worksheets = [hidden, visible];
    const src = await xlsxSource("/tmp/x.xlsx", "uid");
    expect(src).toBeDefined();
    // only the visible sheet should be picked
    expect(src!.title).toBe("x.xlsx"); // single-sheet path, no name suffix
    expect(src!.columns.map((c) => c.name)).toEqual(["v"]);
  });
});
