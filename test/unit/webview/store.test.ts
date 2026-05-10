// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from "vitest";

import { useStore } from "../../../client/src/webview/store";
import type { ColumnMeta } from "../../../client/src/webview/protocol";
import { resetStore } from "../../helpers/store";

const COLS: ColumnMeta[] = [
  { id: "a", name: "a", kind: "num" },
  { id: "b", name: "b", kind: "char" },
];

beforeEach(() => {
  resetStore();
});

describe("store.init", () => {
  it("seeds title / columns / rowCount / pageSize and clears caches", () => {
    useStore.getState().init({
      title: "t", columns: COLS, rowCount: 100, pageSize: 50,
    });
    const s = useStore.getState();
    expect(s.title).toBe("t");
    expect(s.columns).toEqual(COLS);
    expect(s.rowCount).toBe(100);
    expect(s.pageSize).toBe(50);
    expect(s.rows.size).toBe(0);
    expect(s.requestedPages.size).toBe(0);
    expect(s.generation).toBe(1);
    expect(s.selection).toEqual([]);
    expect(s.selectionAnchor).toBeNull();
  });

  it("resets loading, error, and cellDetail to clean state", () => {
    const s = useStore.getState();
    s.setLoading(true);
    s.setError("boom");
    s.setCellDetail({ row: 1, col: 2 });
    s.init({ title: "fresh", columns: [], rowCount: 0, pageSize: 200 });
    const after = useStore.getState();
    expect(after.loading).toBe(false);
    expect(after.error).toBeNull();
    expect(after.cellDetail).toBeNull();
  });
});

describe("store.applyRows", () => {
  it("writes rows starting at the given absolute index and updates rowCount", () => {
    useStore.getState().init({
      title: "t", columns: COLS, rowCount: 0, pageSize: 200,
    });
    useStore.getState().applyRows(10, [["1", "a"], ["2", "b"]], 12);
    const s = useStore.getState();
    expect(s.rows.get(10)).toEqual(["1", "a"]);
    expect(s.rows.get(11)).toEqual(["2", "b"]);
    expect(s.rowCount).toBe(12);
  });
});

describe("store.markRequested", () => {
  it("merges new pages into the existing requested set", () => {
    const s = useStore.getState();
    s.markRequested([0, 1]);
    s.markRequested([1, 2]);
    expect(useStore.getState().requestedPages.has(0)).toBe(true);
    expect(useStore.getState().requestedPages.has(1)).toBe(true);
    expect(useStore.getState().requestedPages.has(2)).toBe(true);
    expect(useStore.getState().requestedPages.size).toBe(3);
  });
});

describe("store.setSort / setFilter / clearFilters", () => {
  it("setSort bumps generation and clears the row cache", () => {
    const s = useStore.getState();
    s.applyRows(0, [["1", "a"]], 1);
    s.markRequested([0]);
    const before = useStore.getState().generation;
    s.setSort([{ colId: "a", dir: "asc" }]);
    const after = useStore.getState();
    expect(after.generation).toBe(before + 1);
    expect(after.rows.size).toBe(0);
    expect(after.requestedPages.size).toBe(0);
    expect(after.sort).toEqual([{ colId: "a", dir: "asc" }]);
  });

  it("setFilter merges by colId, replacing the entry for that column", () => {
    const s = useStore.getState();
    s.setFilter("a", { colId: "a", values: ["1"] });
    s.setFilter("b", { colId: "b", values: ["x"] });
    s.setFilter("a", { colId: "a", values: ["2"] }); // overwrite
    const filters = useStore.getState().filters;
    expect(filters).toHaveLength(2);
    const aFilter = filters.find((f) => f.colId === "a");
    expect(aFilter?.values).toEqual(["2"]);
  });

  it("setFilter(null) removes only the entry for that column", () => {
    const s = useStore.getState();
    s.setFilter("a", { colId: "a", values: ["1"] });
    s.setFilter("b", { colId: "b", values: ["x"] });
    s.setFilter("a", null);
    const filters = useStore.getState().filters;
    expect(filters).toHaveLength(1);
    expect(filters[0].colId).toBe("b");
  });

  it("clearFilters empties the filters list and bumps generation", () => {
    const s = useStore.getState();
    s.setFilter("a", { colId: "a", values: ["1"] });
    const before = useStore.getState().generation;
    s.clearFilters();
    const after = useStore.getState();
    expect(after.filters).toEqual([]);
    expect(after.generation).toBe(before + 1);
  });
});

describe("store selection / cellDetail / loading / error", () => {
  it("setSelection / setAnchor wire through to state", () => {
    const s = useStore.getState();
    s.setSelection([{ fromRow: 0, toRow: 1, fromCol: 0, toCol: 1 }]);
    s.setAnchor({ row: 0, col: 0 });
    expect(useStore.getState().selection).toHaveLength(1);
    expect(useStore.getState().selectionAnchor).toEqual({ row: 0, col: 0 });
  });
  it("setError accepts null", () => {
    const s = useStore.getState();
    s.setError("err");
    expect(useStore.getState().error).toBe("err");
    s.setError(null);
    expect(useStore.getState().error).toBeNull();
  });
});
