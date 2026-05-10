// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { HeaderCell } from "../../client/src/webview/grid/HeaderCell";
import { useStore } from "../../client/src/webview/store";
import { resetStore } from "../helpers/store";

beforeEach(() => {
  resetStore();
  useStore.getState().init({
    title: "t",
    columns: [{ id: "score", name: "score", kind: "num" }],
    rowCount: 0,
    pageSize: 100,
  });
});
afterEach(() => {
  resetStore();
});

const COLUMN = { id: "score", name: "score", kind: "num" as const };

describe("HeaderCell", () => {
  it("renders the column label and a filter button", () => {
    render(<HeaderCell column={COLUMN} />);
    expect(screen.getByText("score")).toBeDefined();
    expect(screen.getByTitle("Filter")).toBeDefined();
  });

  it("cycles sort: asc → desc → off on repeated header clicks", () => {
    render(<HeaderCell column={COLUMN} />);
    const name = screen.getByText("score");
    fireEvent.click(name);
    expect(useStore.getState().sort).toEqual([
      { colId: "score", dir: "asc" },
    ]);
    fireEvent.click(name);
    expect(useStore.getState().sort).toEqual([
      { colId: "score", dir: "desc" },
    ]);
    fireEvent.click(name);
    expect(useStore.getState().sort).toEqual([]);
  });

  it("sort click stops propagation so the cell-click handler isn't triggered", () => {
    let parentClicked = false;
    render(
      <div onClick={() => (parentClicked = true)}>
        <HeaderCell column={COLUMN} />
      </div>,
    );
    fireEvent.click(screen.getByText("score"));
    expect(parentClicked).toBe(false);
  });

  it("opens the filter popup when the filter button is clicked", () => {
    render(<HeaderCell column={COLUMN} />);
    fireEvent.click(screen.getByTitle("Filter"));
    // FilterPopup renders a "Search" input.
    expect(screen.getByPlaceholderText("Search")).toBeDefined();
  });
});
