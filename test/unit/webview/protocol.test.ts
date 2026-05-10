// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { isWebviewMessage } from "../../../client/src/panels/DataViewerHelpers";

describe("protocol.isWebviewMessage", () => {
  it.each([
    { kind: "ready" },
    { kind: "rows-req", reqId: 1, start: 0, end: 10, sort: [], filters: [] },
    { kind: "open-column-properties", colId: "a" },
    { kind: "save-view-state", state: { sort: [], filters: [] } },
    { kind: "copy", format: "plain", text: "" },
    { kind: "export", format: "csv", scope: "all", sort: [], filters: [] },
  ])("accepts a well-formed $kind message", (msg) => {
    expect(isWebviewMessage(msg)).toBe(true);
  });

  it("rejects null", () => {
    expect(isWebviewMessage(null)).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isWebviewMessage(42)).toBe(false);
    expect(isWebviewMessage("ready")).toBe(false);
  });
  it("rejects objects without a kind", () => {
    expect(isWebviewMessage({ reqId: 1 })).toBe(false);
  });
  it("rejects unknown message kinds", () => {
    expect(isWebviewMessage({ kind: "unknown" })).toBe(false);
  });
  it("rejects when kind is the wrong type", () => {
    expect(isWebviewMessage({ kind: 123 })).toBe(false);
  });
});
