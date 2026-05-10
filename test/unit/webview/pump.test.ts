// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetForTests as resetMessaging,
} from "../../../client/src/webview/messaging";
import {
  __pendingForTests,
  bindPump,
  ensureRange,
  resetPump,
} from "../../../client/src/webview/pump";
import { useStore } from "../../../client/src/webview/store";
import { fireHostMessage, installAcquireVsCodeApi } from "../../helpers/messaging";
import { resetStore } from "../../helpers/store";

let captured: ReturnType<typeof installAcquireVsCodeApi>;

beforeEach(() => {
  resetMessaging();
  resetPump();
  resetStore();
  captured = installAcquireVsCodeApi();
});

afterEach(() => {
  resetMessaging();
  resetPump();
  resetStore();
});

function seedStore(): void {
  useStore.getState().init({
    title: "test",
    columns: [
      { id: "a", name: "a", kind: "num" },
      { id: "b", name: "b", kind: "char" },
    ],
    rowCount: 1000,
    pageSize: 100,
  });
}

describe("pump.ensureRange", () => {
  it("requests page-aligned spans covering the visible window", () => {
    seedStore();
    ensureRange(0, 250); // covers pages 0, 1, 2
    expect(captured.posted).toHaveLength(3);
    const reqs = captured.posted.map((m) => m as { start: number; end: number });
    expect(reqs[0]).toMatchObject({ start: 0, end: 99 });
    expect(reqs[1]).toMatchObject({ start: 100, end: 199 });
    expect(reqs[2]).toMatchObject({ start: 200, end: 299 });
  });

  it("does not re-request a page that is already in flight", () => {
    seedStore();
    ensureRange(0, 99);
    expect(captured.posted).toHaveLength(1);
    ensureRange(0, 99);
    expect(captured.posted).toHaveLength(1);
  });

  it("clamps to the row count even if the requested range overshoots", () => {
    seedStore();
    ensureRange(950, 5_000);
    // rowCount=1000 → last index is 999 → only page 9 is requested
    expect(captured.posted).toHaveLength(1);
    expect(captured.posted[0]).toMatchObject({ start: 900, end: 999 });
  });

  it("is a no-op when rowCount is zero", () => {
    useStore.getState().init({
      title: "empty", columns: [], rowCount: 0, pageSize: 100,
    });
    ensureRange(0, 100);
    expect(captured.posted).toHaveLength(0);
  });

  it("attaches the current sort and filters to every request", () => {
    seedStore();
    useStore.getState().setSort([{ colId: "a", dir: "asc" }]);
    useStore.getState().setFilter("b", { colId: "b", values: ["x"] });
    ensureRange(0, 99);
    expect(captured.posted[0]).toMatchObject({
      sort: [{ colId: "a", dir: "asc" }],
      filters: [{ colId: "b", values: ["x"] }],
    });
  });
});

describe("pump.bindPump", () => {
  it("applies a matching `rows-resp` to the store", () => {
    seedStore();
    bindPump();
    ensureRange(0, 99);
    const req = captured.posted[0] as { reqId: number };
    fireHostMessage({
      kind: "rows-resp",
      reqId: req.reqId,
      start: 0,
      rows: [["1", "x"], ["2", "y"]],
      rowCount: 1000,
    });
    expect(useStore.getState().rows.get(0)).toEqual(["1", "x"]);
    expect(useStore.getState().rows.get(1)).toEqual(["2", "y"]);
  });

  it("drops `rows-resp` from a stale generation (sort change mid-flight)", () => {
    seedStore();
    bindPump();
    ensureRange(0, 99);
    const req = captured.posted[0] as { reqId: number };
    // user changes sort BEFORE the response arrives → generation bumps
    useStore.getState().setSort([{ colId: "a", dir: "desc" }]);
    fireHostMessage({
      kind: "rows-resp",
      reqId: req.reqId,
      start: 0,
      rows: [["stale", "stale"]],
      rowCount: 1000,
    });
    expect(useStore.getState().rows.size).toBe(0);
  });

  it("on `error` with a reqId, frees the page so the next ensureRange retries it", () => {
    seedStore();
    bindPump();
    ensureRange(0, 99);
    const req = captured.posted[0] as { reqId: number };
    expect(__pendingForTests().size).toBe(1);

    fireHostMessage({
      kind: "error",
      reqId: req.reqId,
      message: "kaboom",
    });

    expect(useStore.getState().error).toBe("kaboom");
    expect(__pendingForTests().size).toBe(0);
    // requestedPages should no longer hold page 0
    expect(useStore.getState().requestedPages.has(0)).toBe(false);

    // A subsequent ensureRange re-requests page 0
    captured.posted.length = 0;
    ensureRange(0, 99);
    expect(captured.posted).toHaveLength(1);
    expect(captured.posted[0]).toMatchObject({ start: 0, end: 99 });
  });

  it("on `error` without a reqId, surfaces the message but does not touch requestedPages", () => {
    seedStore();
    bindPump();
    ensureRange(0, 99);
    fireHostMessage({ kind: "error", message: "global failure" });
    expect(useStore.getState().error).toBe("global failure");
    expect(useStore.getState().requestedPages.has(0)).toBe(true);
  });
});
