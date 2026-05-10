// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// End-to-end host-side round-trip: wires a real CSV-backed paginator
// (csvSource → InMemorySource) into a real DataViewer and asserts the
// full message cycle works as the webview would experience it.
//
//   ready  →  init                    (host posts column metadata)
//          →  rows-req                (we drive this as the webview)
//          →  rows-resp               (host returns paged rows)
//          → save-view-state          (webview persists sort+filter)
//          → ready (re-init)          (host re-runs init with viewState)
//
// This is the through-line that the unit tests for individual modules
// (store, pump, copy, csvParser, …) cannot prove on their own —
// individual pieces can be correct while the wiring is wrong.

import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { csvSource } from "../../../client/src/components/FileTableViewer/csvSource";
import PaginatedResultSet from "../../../client/src/components/LibraryNavigator/PaginatedResultSet";
import type {
  TableData,
  SortModel,
  TableQuery,
} from "../../../client/src/components/LibraryNavigator/types";
import { __testHooks } from "../../mocks/vscode";
import { makeDataViewer } from "../../helpers/fakePanel";

const FIXTURES = path.resolve(__dirname, "../../fixtures");

beforeEach(() => {
  __testHooks.reset();
});
afterEach(() => {
  __testHooks.reset();
});

/** Build a paginator backed by an InMemorySource over the cars.csv
 *  fixture, the way the FileTableViewer dispatcher does in production. */
async function carsPaginator() {
  const source = await csvSource(path.join(FIXTURES, "cars.csv"), "uid");
  return {
    columns: source.columns,
    paginator: new PaginatedResultSet<{ data: TableData; error?: Error }>(
      async (start, end, sort: SortModel[], query: TableQuery | undefined) => {
        try {
          return { data: await source.getRows(start, end, sort, query) };
        } catch (e) {
          return {
            error: e instanceof Error ? e : new Error(String(e)),
            data: { rows: [], count: 0 },
          };
        }
      },
    ),
  };
}

describe("DataViewer round-trip — CSV-backed source", () => {
  it("ready → init posts the inferred columns from the CSV", async () => {
    const { columns, paginator } = await carsPaginator();
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => columns,
    });
    await viewer.processMessage({ kind: "ready" });

    const init = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect(init.kind).toBe("init");
    expect((init.columns as Array<{ name: string }>).map((c) => c.name)).toEqual([
      "make", "model", "year", "price", "electric",
    ]);
  });

  it("rows-req → rows-resp returns the requested slice with the index cell stripped", async () => {
    const { columns, paginator } = await carsPaginator();
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => columns,
    });
    await viewer.processMessage({ kind: "ready" });
    panel.webview.posted.length = 0;

    await viewer.processMessage({
      kind: "rows-req",
      reqId: 11,
      start: 0,
      end: 2,
      sort: [],
      filters: [],
    });

    const resp = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect(resp.kind).toBe("rows-resp");
    expect(resp.reqId).toBe(11);
    expect(resp.rows).toEqual([
      ["Toyota", "Corolla", "2020", "18500", "no"],
      ["Ford", "Focus", "2018", "12300.50", "no"],
      ["Tesla", "Model 3", "2023", "45000", "yes"],
    ]);
    expect(resp.rowCount).toBe(5);
  });

  it("rows-req with sort returns rows in sorted order", async () => {
    const { columns, paginator } = await carsPaginator();
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => columns,
    });
    await viewer.processMessage({ kind: "ready" });
    panel.webview.posted.length = 0;

    await viewer.processMessage({
      kind: "rows-req",
      reqId: 1,
      start: 0,
      end: 4,
      sort: [{ colId: "price", dir: "asc" }],
      filters: [],
    });

    const resp = panel.webview.posted[0]?.message as { rows: string[][] };
    const prices = resp.rows.map((r) => r[3]); // price is column index 3
    // Numeric sort: 12300.50, 18500, 21750, 45000, 52000.
    expect(prices).toEqual(["12300.50", "18500", "21750", "45000", "52000"]);
  });

  it("rows-req with checklist filter narrows the response", async () => {
    const { columns, paginator } = await carsPaginator();
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => columns,
    });
    await viewer.processMessage({ kind: "ready" });
    panel.webview.posted.length = 0;

    await viewer.processMessage({
      kind: "rows-req",
      reqId: 1,
      start: 0,
      end: 99,
      sort: [],
      filters: [{ colId: "electric", values: ["yes"] }],
    });

    const resp = panel.webview.posted[0]?.message as {
      rows: string[][]; rowCount: number;
    };
    expect(resp.rowCount).toBe(2);
    expect(resp.rows.map((r) => r[0])).toEqual(["Tesla", "Tesla"]);
  });

  it("save-view-state persists, then the next ready re-emits init with that state", async () => {
    const { columns, paginator } = await carsPaginator();
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => columns,
    });
    await viewer.processMessage({ kind: "ready" });
    panel.webview.posted.length = 0;

    const view = {
      sort: [{ colId: "year", dir: "desc" as const }],
      filters: [{ colId: "electric", values: ["yes"] }],
    };
    await viewer.processMessage({ kind: "save-view-state", state: view });
    await viewer.processMessage({ kind: "ready" });

    const init = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect(init.viewState).toEqual(view);
  });

  it("a paginator failure surfaces as `error` with the same reqId, no rows-resp", async () => {
    const failing = new PaginatedResultSet<{
      data: TableData; error?: Error;
    }>(async () => ({
      error: new Error("backing source unavailable"),
      data: { rows: [], count: 0 },
    }));
    const { viewer, panel } = makeDataViewer({
      paginator: failing,
      fetchColumns: () => [{ id: "x", name: "x", type: "char" }],
    });
    await viewer.processMessage({ kind: "ready" });
    panel.webview.posted.length = 0;

    await viewer.processMessage({
      kind: "rows-req",
      reqId: 99,
      start: 0,
      end: 9,
      sort: [],
      filters: [],
    });

    const messages = panel.webview.posted.map(
      (m) => m.message as Record<string, unknown>,
    );
    expect(messages.some((m) => m.kind === "error" && m.reqId === 99)).toBe(true);
    expect(messages.some((m) => m.kind === "rows-resp")).toBe(false);
  });
});
