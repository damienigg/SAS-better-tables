// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Drives DataViewer's export paths against real tmpfiles and asserts
// exact bytes. These tests cover the area where we recently fixed
// error-safety bugs (partial-file unlink, promisified stream end,
// backpressure-aware writeChunk) — without them a regression there
// would silently corrupt a user's saved file.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import PaginatedResultSet from "../../../client/src/components/LibraryNavigator/PaginatedResultSet";

// Match the production code's pattern for loading exceljs — vite's
// transformer can't trace its CJS dynamic requires, so we go through a
// Function() indirection that node's native loader handles at runtime.
const loadExcelJS: () => Promise<typeof import("exceljs")> = new Function(
  'return import("exceljs")',
) as () => Promise<typeof import("exceljs")>;
import type {
  TableData,
  SortModel,
  TableQuery,
} from "../../../client/src/components/LibraryNavigator/types";
import { Uri, __testHooks } from "../../mocks/vscode";
import { makeDataViewer } from "../../helpers/fakePanel";

const COLUMNS = [
  { id: "id", name: "id", type: "num", index: 0 },
  { id: "name", name: "name", type: "char", index: 1 },
  { id: "score", name: "score", type: "num", index: 2 },
];

// Each adapter row carries a leading SAS index cell at slot 0; the
// panel strips it before forwarding. iterAllRows in the host strips
// the same cell before handing rows to exporters, so what we put here
// is what the exporter sees minus the first element.
const ROWS: string[][] = [
  ["1", "1", "alice", "98"],
  ["2", "2", "bob", "87"],
  ["3", "3", "carol with, a comma", "75"],
  ["4", "4", "dave \"quoted\"", "0"],
  ["5", "5", "eve\nmulti", "42"],
];

function fakePaginator(opts: { fail?: number } = {}) {
  let calls = 0;
  return new PaginatedResultSet<{ data: TableData; error?: Error }>(
    async (start, end, _sort: SortModel[], _query: TableQuery | undefined) => {
      calls++;
      if (opts.fail !== undefined && calls === opts.fail) {
        throw new Error("simulated mid-export adapter failure");
      }
      const slice = ROWS.slice(start, end + 1);
      return {
        data: {
          rows: slice.map((cells) => ({ cells })),
          count: ROWS.length,
        },
      };
    },
  );
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sbt-export-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function readyAndExport(args: {
  format: "csv" | "json" | "xlsx";
  scope?: "all" | "selection" | "visible";
  selection?: Array<{ fromRow: number; toRow: number; fromCol: number; toCol: number }>;
  filename: string;
  paginator?: PaginatedResultSet<{ data: TableData; error?: Error }>;
}): Promise<string> {
  const target = path.join(tmpDir, args.filename);
  __testHooks.setSaveDialogAnswer(Uri.file(target));
  const { viewer } = makeDataViewer({
    paginator: args.paginator ?? fakePaginator(),
    fetchColumns: () => COLUMNS,
  });
  await viewer.processMessage({ kind: "ready" });
  await viewer.processMessage({
    kind: "export",
    format: args.format,
    scope: args.scope ?? "all",
    selection: args.selection,
    sort: [],
    filters: [],
  });
  return target;
}

describe("DataViewer.export — CSV", () => {
  it("writes header + every row, RFC-4180 quoting embedded delimiters", async () => {
    const target = await readyAndExport({ format: "csv", filename: "out.csv" });
    const text = await fs.readFile(target, "utf8");
    // Hand-computed expected CSV. Watches every interesting case:
    //   row 3 has a comma → quoted
    //   row 4 has a double quote → quoted + doubled
    //   row 5 has a newline → quoted
    expect(text).toBe(
      "id,name,score\n" +
        "1,alice,98\n" +
        "2,bob,87\n" +
        "3,\"carol with, a comma\",75\n" +
        '4,"dave ""quoted""",0\n' +
        '5,"eve\nmulti",42\n',
    );
  });

  it("scope=selection writes only rows whose index is in any rectangle", async () => {
    const target = await readyAndExport({
      format: "csv",
      filename: "sel.csv",
      scope: "selection",
      selection: [
        { fromRow: 0, toRow: 0, fromCol: 0, toCol: 2 },
        { fromRow: 2, toRow: 2, fromCol: 0, toCol: 2 },
      ],
    });
    const text = await fs.readFile(target, "utf8");
    expect(text).toBe(
      "id,name,score\n" +
        "1,alice,98\n" +
        "3,\"carol with, a comma\",75\n",
    );
  });
});

describe("DataViewer.export — JSON", () => {
  it("writes a valid JSON array of objects keyed by column name", async () => {
    const target = await readyAndExport({ format: "json", filename: "out.json" });
    const text = await fs.readFile(target, "utf8");
    expect(text.startsWith("[\n")).toBe(true);
    expect(text.endsWith("]\n")).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(5);
    expect(parsed[0]).toEqual({ id: "1", name: "alice", score: "98" });
    expect(parsed[2]).toEqual({
      id: "3",
      name: "carol with, a comma",
      score: "75",
    });
  });
});

// XLSX export is exercised end-to-end by the @vscode/test-electron
// integration tier. The unit-tier writeFile path crashes vitest's
// worker (segfault inside exceljs's binary writer when called through
// vite's transform pipeline) regardless of pool mode. CSV + JSON
// cover the wrapping/cancellation/cleanup logic; the xlsx-specific
// path is the same `iterAllRows` walk + `addRow`/`writeFile`, validated
// downstream.
describe.skip("DataViewer.export — XLSX (skipped, see header)", () => {
  it("writes an .xlsx that exceljs can read back with the right values", async () => {
    const target = path.join(tmpDir, "out.xlsx");
    __testHooks.setSaveDialogAnswer(Uri.file(target));
    const { viewer, panel } = makeDataViewer({
      paginator: fakePaginator(),
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    await viewer.processMessage({
      kind: "export",
      format: "xlsx",
      scope: "all",
      selection: undefined,
      sort: [],
      filters: [],
    });

    // If the export failed, processMessage will have posted an
    // `error` message; surface it so the assertion reports a useful
    // diagnosis rather than just "ENOENT".
    const err = panel.webview.posted.find(
      (m) => (m.message as Record<string, unknown>).kind === "error",
    );
    if (err) {
      throw new Error(
        "Export posted an error: " +
          ((err.message as Record<string, unknown>).message as string),
      );
    }

    const stat = await fs.stat(target);
    expect(stat.size).toBeGreaterThan(0);
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(target);
    const ws = wb.getWorksheet("data")!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(["id", "name", "score"]);
    const row3 = (ws.getRow(4).values as unknown[]).slice(1);
    expect(row3).toEqual(["3", "carol with, a comma", "75"]);
  });
});

describe("DataViewer.export — cancellation", () => {
  it("does nothing when the user cancels the save dialog", async () => {
    __testHooks.setSaveDialogAnswer(undefined);
    const { viewer } = makeDataViewer({
      paginator: fakePaginator(),
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    await viewer.processMessage({
      kind: "export",
      format: "csv",
      scope: "all",
      selection: undefined,
      sort: [],
      filters: [],
    });
    const files = await fs.readdir(tmpDir);
    expect(files).toEqual([]);
  });
});

describe("DataViewer.export — error cleanup", () => {
  it("unlinks the partial file when the paginator fails mid-stream", async () => {
    // First call returns rows OK; the SECOND call (paginator hit during
    // iterAllRows after the first page) throws. We need at least one
    // page to be written before the failure so the partial file
    // exists.
    const target = path.join(tmpDir, "broken.csv");
    __testHooks.setSaveDialogAnswer(Uri.file(target));

    let callCount = 0;
    const failingPaginator = new PaginatedResultSet<{
      data: TableData; error?: Error;
    }>(async (start, end) => {
      callCount++;
      if (callCount === 1) {
        const slice = ROWS.slice(start, end + 1);
        return {
          data: {
            rows: slice.map((cells) => ({ cells })),
            count: 50_000, // pretend there are more pages
          },
        };
      }
      throw new Error("simulated mid-export failure");
    });

    const { viewer, panel } = makeDataViewer({
      paginator: failingPaginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    await viewer.processMessage({
      kind: "export",
      format: "csv",
      scope: "all",
      selection: undefined,
      sort: [],
      filters: [],
    });

    // File must NOT exist — the export wrapper unlinked it on failure.
    await expect(fs.stat(target)).rejects.toThrow();

    // The error is forwarded to the webview as an "error" message.
    const errMsg = panel.webview.posted.find(
      (m) => (m.message as Record<string, unknown>).kind === "error",
    );
    expect(errMsg).toBeDefined();
  });

});

// Sanity check — the helper itself is correct (catches a future
// regression that would silently break every test in this file).
describe("DataViewer.export — test harness sanity", () => {
  it("ready flow populates columnMeta before export runs", async () => {
    const { viewer, panel } = makeDataViewer({
      paginator: fakePaginator(),
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    const init = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect((init.columns as unknown[]).length).toBe(3);
  });
  it("vi is available", () => {
    expect(typeof vi).toBe("object");
  });
});
