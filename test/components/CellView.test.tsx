// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CellView } from "../../client/src/webview/grid/CellView";
import { useStore } from "../../client/src/webview/store";
import { resetStore } from "../helpers/store";

beforeEach(() => {
  resetStore();
  useStore.getState().init({
    title: "t",
    columns: [
      { id: "n", name: "n", kind: "num" },
      { id: "s", name: "s", kind: "char" },
    ],
    rowCount: 2,
    pageSize: 200,
  });
});
afterEach(() => {
  resetStore();
});

describe("CellView", () => {
  it("renders NULL for an unfetched cell", () => {
    render(<CellView row={5} col={0} kind="num" />);
    expect(screen.getByText("NULL")).toBeDefined();
  });

  it("renders the value for a fetched cell", () => {
    useStore.getState().applyRows(0, [["42", "hello"]], 1);
    render(<CellView row={0} col={1} kind="char" />);
    expect(screen.getByText("hello")).toBeDefined();
  });

  it("applies the right-align class for numeric kinds", () => {
    useStore.getState().applyRows(0, [["42", "hello"]], 1);
    const { container } = render(<CellView row={0} col={0} kind="num" />);
    expect(container.firstElementChild?.className).toContain("btv-cell-num");
  });

  it("applies the selected class when in the selection", () => {
    useStore.getState().applyRows(0, [["42", "hello"]], 1);
    useStore.getState().setSelection([
      { fromRow: 0, toRow: 0, fromCol: 0, toCol: 0 },
    ]);
    const { container } = render(<CellView row={0} col={0} kind="num" />);
    expect(container.firstElementChild?.className).toContain(
      "btv-cell-selected",
    );
  });
});
