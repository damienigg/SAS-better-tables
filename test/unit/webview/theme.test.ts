// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectTheme, l10n, watchTheme } from "../../../client/src/webview/theme";

beforeEach(() => {
  document.body.className = "";
  document.body.removeAttribute("data-l10n");
});

afterEach(() => {
  document.body.className = "";
  document.body.removeAttribute("data-l10n");
});

describe("theme.detectTheme", () => {
  it("returns light by default", () => {
    expect(detectTheme()).toBe("light");
  });
  it("returns dark when the body has the dark class", () => {
    document.body.className = "vscode-dark";
    expect(detectTheme()).toBe("dark");
  });
  it("returns high-contrast when the high-contrast class is set", () => {
    document.body.className = "vscode-high-contrast vscode-dark";
    expect(detectTheme()).toBe("high-contrast");
  });
});

describe("theme.watchTheme", () => {
  it("invokes the callback when the body class changes", async () => {
    let theme: string | undefined;
    const off = watchTheme((t) => (theme = t));
    document.body.className = "vscode-dark";
    // MutationObserver fires asynchronously; wait one microtask tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(theme).toBe("dark");
    off();
  });
});

describe("theme.l10n", () => {
  it("falls back to the key when the bundle is empty", () => {
    expect(l10n("Apply")).toBe("Apply");
  });
});
