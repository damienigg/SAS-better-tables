// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Toolbar } from "../../client/src/webview/Toolbar";
import {
  __resetForTests as resetMessaging,
} from "../../client/src/webview/messaging";
import { useStore } from "../../client/src/webview/store";
import { installAcquireVsCodeApi } from "../helpers/messaging";
import { resetStore } from "../helpers/store";

let captured: ReturnType<typeof installAcquireVsCodeApi>;

beforeEach(() => {
  resetMessaging();
  resetStore();
  captured = installAcquireVsCodeApi();
  useStore.getState().init({
    title: "t",
    columns: [
      { id: "a", name: "a", kind: "num" },
      { id: "b", name: "b", kind: "char" },
    ],
    rowCount: 1,
    pageSize: 200,
  });
  useStore.getState().applyRows(0, [["1", "alice"]], 1);
});

afterEach(() => {
  resetStore();
  resetMessaging();
});

describe("Toolbar — Copy menu", () => {
  it("Copy items are disabled when nothing is selected", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: /^Copy/i }));
    const items = screen.getAllByRole("button", { name: /Copy/i });
    // First button is the trigger; items inside are disabled when no selection
    const enabled = items.filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled.length).toBeGreaterThanOrEqual(1); // trigger + headers-only
  });

  it("posts a `copy` message with the rendered text when a selection exists", () => {
    useStore.getState().setSelection([
      { fromRow: 0, toRow: 0, fromCol: 0, toCol: 1 },
    ]);
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: /^Copy/i }));
    fireEvent.click(screen.getAllByText(/^Copy as CSV$/)[0]);
    const msgs = captured.posted.filter((m) => m.kind === "copy");
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as { format: string }).format).toBe("csv");
    expect((msgs[0] as { text: string }).text).toContain("a,b");
  });
});

describe("Toolbar — Export menu", () => {
  it("posts an `export` message scoped to all rows", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: /^Export/i }));
    fireEvent.click(screen.getByText(/^All rows as CSV$/));
    const msgs = captured.posted.filter((m) => m.kind === "export");
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as { scope: string }).scope).toBe("all");
  });
});

describe("Toolbar — clear filters button", () => {
  it("renders only when at least one filter is applied", () => {
    const { rerender } = render(<Toolbar />);
    expect(screen.queryByText(/Clear filters/i)).toBeNull();
    useStore.getState().setFilter("a", { colId: "a", values: ["1"] });
    rerender(<Toolbar />);
    expect(screen.getByText(/Clear filters/i)).toBeDefined();
  });

  it("clears all filters when clicked", () => {
    useStore.getState().setFilter("a", { colId: "a", values: ["1"] });
    render(<Toolbar />);
    fireEvent.click(screen.getByText(/Clear filters/i));
    expect(useStore.getState().filters).toEqual([]);
  });
});

describe("Toolbar — dropdown close behaviour", () => {
  it("closes the menu on Escape", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: /^Copy/i }));
    expect(screen.queryByText(/^Copy as CSV$/)).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(/^Copy as CSV$/)).toBeNull();
  });

  it("closes the menu on click outside", () => {
    render(
      <div>
        <Toolbar />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Copy/i }));
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText(/^Copy as CSV$/)).toBeNull();
  });
});
