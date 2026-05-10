// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { ColumnFilter } from "../../../client/src/webview/protocol";
import { buildRowPredicate } from "../../../client/src/components/FileTableViewer/filterEval";

const colIndex = (id: string) => ({ a: 0, b: 1, c: 2 })[id] ?? -1;

function p(filters: ColumnFilter[]) {
  return buildRowPredicate(filters, colIndex);
}

describe("filterEval — checklist (values)", () => {
  it("matches rows whose cell is in the values set", () => {
    const pred = p([{ colId: "a", values: ["x", "y"] }]);
    expect(pred(["x"])).toBe(true);
    expect(pred(["y"])).toBe(true);
    expect(pred(["z"])).toBe(false);
  });
  it("treats null cells as not matching any checklist", () => {
    const pred = p([{ colId: "a", values: ["x"] }]);
    expect(pred([null])).toBe(false);
  });
  it("AND-combines multiple column filters", () => {
    const pred = p([
      { colId: "a", values: ["1"] },
      { colId: "b", values: ["x"] },
    ]);
    expect(pred(["1", "x"])).toBe(true);
    expect(pred(["1", "y"])).toBe(false);
    expect(pred(["2", "x"])).toBe(false);
  });
});

describe("filterEval — expression operators", () => {
  it.each([
    ["= 5", "5", true],
    ["= 5", "6", false],
    ["!= 5", "6", true],
    ["<> 5", "5", false],
  ])("equality %s on %s → %s", (expr, cell, expected) => {
    expect(p([{ colId: "a", expr }])([cell])).toBe(expected);
  });

  it.each([
    ["> 5", "6", true],
    ["> 5", "5", false],
    [">= 5", "5", true],
    ["< 5", "4.99", true],
    ["<= 5", "5", true],
  ])("numeric comparison %s on %s → %s", (expr, cell, expected) => {
    expect(p([{ colId: "a", expr }])([cell])).toBe(expected);
  });

  it("falls back to lexicographic comparison when the literal is not numeric", () => {
    expect(p([{ colId: "a", expr: '> "alpha"' }])(["beta"])).toBe(true);
    expect(p([{ colId: "a", expr: '> "alpha"' }])(["aaa"])).toBe(false);
  });

  it("contains matches substrings", () => {
    expect(p([{ colId: "a", expr: 'contains "foo"' }])(["bar foo baz"])).toBe(true);
    expect(p([{ colId: "a", expr: "contains foo" }])(["fox"])).toBe(false);
  });

  it("like maps SQL wildcards to regex (% any, _ one)", () => {
    expect(p([{ colId: "a", expr: 'like "A%"' }])(["Apple"])).toBe(true);
    expect(p([{ colId: "a", expr: 'like "A%"' }])(["banana"])).toBe(false);
    expect(p([{ colId: "a", expr: 'like "_oo"' }])(["foo"])).toBe(true);
    expect(p([{ colId: "a", expr: 'like "_oo"' }])(["fool"])).toBe(false);
  });

  it("escapes regex special chars in the literal so they aren't interpreted", () => {
    // a literal "." should not match any single char.
    expect(p([{ colId: "a", expr: 'like "."' }])(["x"])).toBe(false);
    expect(p([{ colId: "a", expr: 'like "."' }])(["."])).toBe(true);
  });

  it("in (...) honours quoted and unquoted values", () => {
    const pred = p([{ colId: "a", expr: 'in ("apple", banana, "cherry")' }]);
    expect(pred(["apple"])).toBe(true);
    expect(pred(["banana"])).toBe(true);
    expect(pred(["durian"])).toBe(false);
  });

  it("strips a leading column-name token before the operator", () => {
    expect(p([{ colId: "a", expr: "score > 10" }])(["12"])).toBe(true);
    expect(p([{ colId: "a", expr: "score > 10" }])(["8"])).toBe(false);
  });

  it("treats an unparseable expression as the always-true predicate (degrade gracefully)", () => {
    expect(p([{ colId: "a", expr: "??!?" }])(["anything"])).toBe(true);
  });

  it("ignores filters that reference unknown columns rather than crashing", () => {
    const pred = p([{ colId: "missing", values: ["x"] }]);
    expect(pred(["any"])).toBe(true);
  });
});
