// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { inferColumns } from "../../../client/src/components/FileTableViewer/typeInfer";

describe("typeInfer.inferColumns", () => {
  it("classifies numeric columns when every non-empty sample is numeric", () => {
    const cols = inferColumns(
      ["x"],
      [["1"], ["2.5"], ["-3e2"], [""], ["4"]],
    );
    expect(cols[0].type).toBe("num");
  });

  it("downgrades to char when any sample value is non-numeric", () => {
    const cols = inferColumns(["x"], [["1"], ["two"], ["3"]]);
    expect(cols[0].type).toBe("char");
  });

  it("classifies date columns (YYYY-MM-DD)", () => {
    const cols = inferColumns(
      ["d"],
      [["2024-01-02"], ["2025-12-31"]],
    );
    expect(cols[0].type).toBe("date");
  });

  it("classifies datetime columns (YYYY-MM-DDTHH:MM)", () => {
    const cols = inferColumns(
      ["d"],
      [["2024-01-02 10:00"], ["2025-12-31T23:59:59Z"]],
    );
    expect(cols[0].type).toBe("datetime");
  });

  it("falls back to char when both date patterns fail", () => {
    const cols = inferColumns(["d"], [["yesterday"], ["never"]]);
    expect(cols[0].type).toBe("char");
  });

  it("preserves the column display order and infers per-column", () => {
    const cols = inferColumns(
      ["id", "name", "score"],
      [["1", "alice", "98"], ["2", "bob", "87"]],
    );
    expect(cols.map((c) => c.type)).toEqual(["num", "char", "num"]);
  });

  it("treats columns of all-empty values as char (no signal)", () => {
    const cols = inferColumns(["mystery"], [[""], [""]]);
    expect(cols[0].type).toBe("char");
  });

  it("reports a sensible char length (max non-empty cell length)", () => {
    const cols = inferColumns(
      ["s"],
      [["short"], ["a much longer cell"]],
    );
    expect(cols[0].length).toBe("a much longer cell".length);
  });

  it("renames blank headers to col1, col2, ... so duplicates don't collide on insert", () => {
    const cols = inferColumns(["", "ok", "  "], [["", "x", ""]]);
    expect(cols[0].name).toBe("col1");
    expect(cols[2].name).toBe("col3");
  });
});
