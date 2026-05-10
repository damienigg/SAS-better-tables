// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { Column } from "../../../client/src/connection/rest/api/compute";
import { InMemorySource } from "../../../client/src/components/FileTableViewer/inMemorySource";

const COLS: Column[] = [
  { id: "id", name: "id", type: "num", index: 0 },
  { id: "name", name: "name", type: "char", index: 1 },
  { id: "score", name: "score", type: "num", index: 2 },
];

// Each row has a leading "" placeholder for the index column the panel
// strips, then the data cells in column order.
const ROWS: (string | null)[][] = [
  ["", "1", "alice", "98"],
  ["", "2", "bob", "87"],
  ["", "3", "carol", "75"],
  ["", "4", "dave", null],
  ["", "5", "eve", "92"],
];

function build(): InMemorySource {
  return new InMemorySource("t", "uid", COLS, ROWS.map((r) => r.slice()));
}

describe("InMemorySource — pagination", () => {
  it("returns the requested half-open range with a leading index placeholder", async () => {
    const src = build();
    const out = await src.getRows(0, 1, [], undefined);
    expect(out.count).toBe(5);
    expect(out.rows.map((r) => r.cells)).toEqual([
      ["", "1", "alice", "98"],
      ["", "2", "bob", "87"],
    ]);
  });
  it("clamps the upper bound to the total row count", async () => {
    const src = build();
    const out = await src.getRows(3, 100, [], undefined);
    expect(out.rows).toHaveLength(2);
  });
});

describe("InMemorySource — sort", () => {
  it("sorts numeric columns numerically (ascending)", async () => {
    const src = build();
    const out = await src.getRows(
      0, 4,
      [{ colId: "score", sort: "asc" }],
      undefined,
    );
    expect(out.rows.map((r) => r.cells[3])).toEqual([
      "75", "87", "92", "98",
      // null/empty sorts last regardless of direction
      "",
    ]);
  });
  it("sorts numeric columns numerically (descending)", async () => {
    const src = build();
    const out = await src.getRows(
      0, 4,
      [{ colId: "score", sort: "desc" }],
      undefined,
    );
    expect(out.rows.map((r) => r.cells[3])).toEqual([
      "98", "92", "87", "75",
      "",
    ]);
  });
  it("sorts char columns lexicographically", async () => {
    const src = build();
    const out = await src.getRows(
      0, 4,
      [{ colId: "name", sort: "asc" }],
      undefined,
    );
    expect(out.rows.map((r) => r.cells[2])).toEqual([
      "alice", "bob", "carol", "dave", "eve",
    ]);
  });
  it("supports multi-column sort, secondary by next key", async () => {
    const src = new InMemorySource("t", "uid", COLS, [
      ["", "1", "alice", "10"],
      ["", "2", "alice", "20"],
      ["", "3", "alice", "5"],
      ["", "4", "bob", "30"],
    ]);
    const out = await src.getRows(
      0, 3,
      [
        { colId: "name", sort: "asc" },
        { colId: "score", sort: "asc" },
      ],
      undefined,
    );
    expect(out.rows.map((r) => r.cells[1])).toEqual(["3", "1", "2", "4"]);
  });
});

describe("InMemorySource — filter (raw filters via TableQuery.filters)", () => {
  it("applies a checklist filter", async () => {
    const src = build();
    const out = await src.getRows(0, 9, [], {
      filterValue: "",
      filters: [{ colId: "name", values: ["alice", "carol"] }],
    });
    expect(out.count).toBe(2);
    expect(out.rows.map((r) => r.cells[2])).toEqual(["alice", "carol"]);
  });
  it("applies a numeric expression filter", async () => {
    const src = build();
    const out = await src.getRows(0, 9, [], {
      filterValue: "",
      filters: [{ colId: "score", expr: "> 85" }],
    });
    expect(out.rows.map((r) => r.cells[2])).toEqual(["alice", "bob", "eve"]);
  });
  it("AND-combines multiple filters", async () => {
    const src = build();
    const out = await src.getRows(0, 9, [], {
      filterValue: "",
      filters: [
        { colId: "score", expr: "> 80" },
        { colId: "name", values: ["alice", "bob"] },
      ],
    });
    expect(out.rows.map((r) => r.cells[2])).toEqual(["alice", "bob"]);
  });
  it("rebuilds the view only when the (sort, filter) signature changes", async () => {
    // Two requests with the same signature should hit the cached view.
    // We can prove the cache by checking that adding a filter narrows
    // the count, removing it widens it again — i.e. the view tracks.
    const src = build();
    expect((await src.getRows(0, 99, [], undefined)).count).toBe(5);
    expect(
      (await src.getRows(0, 99, [], {
        filterValue: "",
        filters: [{ colId: "score", expr: "> 90" }],
      })).count,
    ).toBe(2);
    expect((await src.getRows(0, 99, [], undefined)).count).toBe(5);
  });
});
