// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FilterPopup } from "../../client/src/webview/grid/FilterPopup";
import { useStore } from "../../client/src/webview/store";
import { resetStore } from "../helpers/store";

const COLUMN = { id: "name", name: "name", kind: "char" as const };

beforeEach(() => {
  resetStore();
  useStore.getState().init({
    title: "t",
    columns: [COLUMN],
    rowCount: 3,
    pageSize: 200,
  });
  useStore.getState().applyRows(
    0,
    [["alice"], ["bob"], ["carol"]],
    3,
  );
});
afterEach(() => {
  resetStore();
});

describe("FilterPopup", () => {
  it("renders the distinct values as checkboxes", () => {
    render(<FilterPopup column={COLUMN} current={undefined} onClose={() => {}} />);
    expect(screen.getByText("alice")).toBeDefined();
    expect(screen.getByText("bob")).toBeDefined();
    expect(screen.getByText("carol")).toBeDefined();
  });

  it("filters the visible list as the user types in the search box", () => {
    render(<FilterPopup column={COLUMN} current={undefined} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "ar" },
    });
    expect(screen.queryByText("alice")).toBeNull();
    expect(screen.getByText("carol")).toBeDefined();
  });

  it("Apply with no expr emits a `values` filter", () => {
    const onClose = vi.fn();
    render(<FilterPopup column={COLUMN} current={undefined} onClose={onClose} />);
    // Untick alice so the filter is non-trivial.
    fireEvent.click(screen.getByText("alice"));
    fireEvent.click(screen.getByText("Apply"));
    const f = useStore.getState().filters[0];
    expect(f.colId).toBe("name");
    expect(f.values?.sort()).toEqual(["bob", "carol"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("Apply with an expr emits an `expr` filter and ignores the checklist", () => {
    render(<FilterPopup column={COLUMN} current={undefined} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("name > 0"), {
      target: { value: 'contains "ar"' },
    });
    fireEvent.click(screen.getByText("Apply"));
    const f = useStore.getState().filters[0];
    expect(f.expr).toBe('contains "ar"');
    expect(f.values).toBeUndefined();
  });

  it("Clear removes the column's filter and closes", () => {
    useStore.getState().setFilter("name", { colId: "name", values: ["alice"] });
    const onClose = vi.fn();
    render(
      <FilterPopup
        column={COLUMN}
        current={{ colId: "name", values: ["alice"] }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("Clear"));
    expect(useStore.getState().filters).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });

  it("warns when the distinct list is built from a partial cache", () => {
    // Force rowCount > rows.size.
    useStore.setState({ rowCount: 1000 });
    render(<FilterPopup column={COLUMN} current={undefined} onClose={() => {}} />);
    expect(screen.getByText(/loaded rows only/i)).toBeDefined();
  });

  it("does not show the warning when all rows are loaded", () => {
    render(<FilterPopup column={COLUMN} current={undefined} onClose={() => {}} />);
    expect(screen.queryByText(/loaded rows only/i)).toBeNull();
  });
});
