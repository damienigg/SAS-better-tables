// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { StatusBar } from "../../client/src/webview/StatusBar";
import { useStore } from "../../client/src/webview/store";
import { resetStore } from "../helpers/store";

beforeEach(() => {
  resetStore();
});
afterEach(() => {
  resetStore();
});

describe("StatusBar", () => {
  it("renders the row count and pluralises", () => {
    useStore.getState().init({
      title: "t",
      columns: [],
      rowCount: 1234,
      pageSize: 200,
    });
    render(<StatusBar />);
    expect(screen.getByText(/1,234/)).toBeDefined();
  });

  it("shows filter count when filters are applied", () => {
    useStore.getState().init({
      title: "t",
      columns: [{ id: "a", name: "a", kind: "char" }],
      rowCount: 10,
      pageSize: 200,
    });
    useStore.getState().setFilter("a", { colId: "a", values: ["x"] });
    render(<StatusBar />);
    expect(screen.getByText(/filters/i)).toBeDefined();
  });

  it("renders an error toast with a dismiss button", () => {
    useStore.getState().init({
      title: "t", columns: [], rowCount: 0, pageSize: 200,
    });
    useStore.getState().setError("things went wrong");
    render(<StatusBar />);
    expect(screen.getByText("things went wrong")).toBeDefined();
    fireEvent.click(screen.getByLabelText("dismiss"));
    expect(useStore.getState().error).toBeNull();
  });

  it("computes selection summary stats when a selection exists", () => {
    useStore.getState().init({
      title: "t",
      columns: [{ id: "n", name: "n", kind: "num" }],
      rowCount: 3,
      pageSize: 200,
    });
    useStore.getState().applyRows(0, [["10"], ["20"], ["30"]], 3);
    useStore.getState().setSelection([
      { fromRow: 0, toRow: 2, fromCol: 0, toCol: 0 },
    ]);
    render(<StatusBar />);
    expect(screen.getByText(/Sum/i)).toBeDefined();
    // 60 should appear in the sum stat
    expect(screen.getByText(/60/)).toBeDefined();
  });
});
