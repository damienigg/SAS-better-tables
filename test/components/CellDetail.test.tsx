// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CellDetail } from "../../client/src/webview/CellDetail";
import { useStore } from "../../client/src/webview/store";
import { resetStore } from "../helpers/store";

beforeEach(() => {
  resetStore();
  useStore.getState().init({
    title: "t",
    columns: [
      { id: "name", name: "name", label: "Full Name", kind: "char" },
      { id: "doc", name: "doc", kind: "char" },
    ],
    rowCount: 1,
    pageSize: 200,
  });
});
afterEach(() => {
  resetStore();
});

describe("CellDetail", () => {
  it("renders nothing when no cell is selected", () => {
    const { container } = render(<CellDetail />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the column label and row number when opened", () => {
    useStore.getState().applyRows(0, [["alice", "hello"]], 1);
    useStore.getState().setCellDetail({ row: 0, col: 0 });
    render(<CellDetail />);
    expect(screen.getByText(/Full Name/)).toBeDefined();
    expect(screen.getByText(/row 1/i)).toBeDefined();
    expect(screen.getByText("alice")).toBeDefined();
  });

  it("pretty-prints JSON content with a JSON badge", () => {
    useStore.getState().applyRows(
      0,
      [["alice", '{"a":1,"b":[2,3]}']],
      1,
    );
    useStore.getState().setCellDetail({ row: 0, col: 1 });
    render(<CellDetail />);
    expect(screen.getByText("JSON")).toBeDefined();
    // Pretty-printed body contains a newline + 2 spaces
    expect(screen.getByText(/"a": 1/)).toBeDefined();
  });

  it("shows NULL for an unfetched cell", () => {
    useStore.getState().setCellDetail({ row: 99, col: 0 });
    render(<CellDetail />);
    expect(screen.getByText("NULL")).toBeDefined();
  });

  it("close button clears the cellDetail state", () => {
    useStore.getState().applyRows(0, [["alice", "doc"]], 1);
    useStore.getState().setCellDetail({ row: 0, col: 0 });
    render(<CellDetail />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(useStore.getState().cellDetail).toBeNull();
  });
});
