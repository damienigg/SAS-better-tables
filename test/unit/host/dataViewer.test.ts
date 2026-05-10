// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PaginatedResultSet from "../../../client/src/components/LibraryNavigator/PaginatedResultSet";
import type {
  TableData,
  SortModel,
  TableQuery,
} from "../../../client/src/components/LibraryNavigator/types";
import { __testHooks, env, FakeWebviewPanel } from "../../mocks/vscode";
import { makeDataViewer } from "../../helpers/fakePanel";

interface Recorded {
  start: number; end: number; sortModel: SortModel[]; query: TableQuery | undefined;
}

function fakePaginator(rows: string[][], colCount: number, opts: { fail?: boolean } = {}) {
  const calls: Recorded[] = [];
  const paginator = new PaginatedResultSet<{ data: TableData; error?: Error }>(
    async (start, end, sortModel, query) => {
      calls.push({ start, end, sortModel, query });
      if (opts.fail) {
        return { data: { rows: [], count: 0 }, error: new Error("kaboom") };
      }
      const slice = rows.slice(start, end + 1);
      return {
        data: {
          rows: slice.map((cells) => ({ cells })),
          count: rows.length,
        },
      };
    },
  );
  void colCount;
  return { paginator, calls };
}

const COLUMNS = [
  { id: "a", name: "a", type: "num", index: 0 },
  { id: "b", name: "b", type: "char", index: 1 },
];

beforeEach(() => {
  __testHooks.reset();
});

afterEach(() => {
  __testHooks.reset();
});

describe("DataViewer.processMessage — ready", () => {
  it("posts an init message with the column metadata", async () => {
    const { paginator } = fakePaginator([], 2);
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    const initMsg = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect(initMsg.kind).toBe("init");
    expect(initMsg.columns).toMatchObject([
      { id: "a", kind: "num" },
      { id: "b", kind: "char" },
    ]);
  });

  it("awaits an async fetchColumns", async () => {
    const { paginator } = fakePaginator([], 2);
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => Promise.resolve(COLUMNS),
    });
    await viewer.processMessage({ kind: "ready" });
    const init = panel.webview.posted[0]?.message as { columns: unknown[] };
    expect(init.columns).toHaveLength(2);
  });
});

describe("DataViewer.processMessage — rows-req", () => {
  it("strips the leading index cell and posts a rows-resp", async () => {
    // Each adapter row has cells[0] = some index, cells[1..] are data.
    const rows = [["1", "1", "alice"], ["2", "2", "bob"]];
    const { paginator, calls } = fakePaginator(rows, 2);
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    panel.webview.posted.length = 0;

    await viewer.processMessage({
      kind: "rows-req",
      reqId: 7,
      start: 0,
      end: 1,
      sort: [],
      filters: [],
    });

    expect(calls).toHaveLength(1);
    const resp = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect(resp.kind).toBe("rows-resp");
    expect(resp.reqId).toBe(7);
    expect(resp.rows).toEqual([
      ["1", "alice"],
      ["2", "bob"],
    ]);
    expect(resp.start).toBe(0);
    expect(resp.rowCount).toBe(2);
  });

  it("forwards the failure from the paginator as an error message with the same reqId", async () => {
    const { paginator } = fakePaginator([], 2, { fail: true });
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    panel.webview.posted.length = 0;

    await viewer.processMessage({
      kind: "rows-req",
      reqId: 42,
      start: 0,
      end: 9,
      sort: [],
      filters: [],
    });

    const err = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect(err.kind).toBe("error");
    expect(err.reqId).toBe(42);
  });

  it("translates filters into a SAS WHERE string before calling the paginator", async () => {
    const { paginator, calls } = fakePaginator([["1", "x"]], 2);
    const { viewer } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "ready" });
    await viewer.processMessage({
      kind: "rows-req", reqId: 1, start: 0, end: 0,
      sort: [],
      filters: [{ colId: "b", values: ["x"] }],
    });
    const last = calls[calls.length - 1];
    expect(last.query?.filterValue).toBe('(b in ("x"))');
    expect(last.query?.filters).toEqual([{ colId: "b", values: ["x"] }]);
  });
});

describe("DataViewer.processMessage — copy / save-view-state / open-column-properties", () => {
  it("writes the copy text to the vscode clipboard", async () => {
    const { paginator } = fakePaginator([], 2);
    const { viewer } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({
      kind: "copy",
      format: "plain",
      text: "1\talice",
    });
    expect(env.clipboard._last).toBe("1\talice");
  });

  it("save-view-state stores the snapshot for re-init", async () => {
    const { paginator } = fakePaginator([], 2);
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({
      kind: "save-view-state",
      state: { sort: [{ colId: "a", dir: "desc" }], filters: [] },
    });

    panel.webview.posted.length = 0;
    await viewer.processMessage({ kind: "ready" });
    const init = panel.webview.posted[0]?.message as Record<string, unknown>;
    expect(init.viewState).toEqual({
      sort: [{ colId: "a", dir: "desc" }], filters: [],
    });
  });

  it("open-column-properties is a no-op when no handler was wired", async () => {
    const { paginator } = fakePaginator([], 2);
    const { viewer } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
      // no loadColumnProperties
    });
    await expect(
      viewer.processMessage({ kind: "open-column-properties", colId: "a" }),
    ).resolves.toBeUndefined();
  });

  it("open-column-properties calls the wired handler with the column id", async () => {
    const { paginator } = fakePaginator([], 2);
    const seen: string[] = [];
    const { viewer } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
      loadColumnProperties: (col) => seen.push(col),
    });
    await viewer.processMessage({
      kind: "open-column-properties",
      colId: "alpha",
    });
    expect(seen).toEqual(["alpha"]);
  });

  it("ignores unknown messages without throwing", async () => {
    const { paginator } = fakePaginator([], 2);
    const { viewer, panel } = makeDataViewer({
      paginator,
      fetchColumns: () => COLUMNS,
    });
    await viewer.processMessage({ kind: "garbage" });
    expect(panel.webview.posted).toHaveLength(0);
  });
});

describe("FakeWebviewPanel sanity", () => {
  it("captures posted messages on the fake webview", () => {
    const p = new FakeWebviewPanel("vt", "title");
    void p.webview.postMessage({ kind: "ready" });
    expect(p.webview.posted).toEqual([{ message: { kind: "ready" } }]);
  });
});
