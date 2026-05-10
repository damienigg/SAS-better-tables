// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Vitest setup file. Runs before every test file.

import { afterEach, beforeEach } from "vitest";

import { __commandHooks, __testHooks } from "./mocks/vscode";

// Reset all mutable state on the vscode mock between tests so a stray
// `showErrorMessage` from one test cannot leak into another's assertions.
beforeEach(() => {
  __testHooks.reset();
  __commandHooks.reset();
});

afterEach(() => {
  __testHooks.reset();
});

// jsdom doesn't ship `acquireVsCodeApi` or `vscode-webview://...`-style
// resources. Tests that touch the webview messaging bus install their
// own per-test stub via `installAcquireVsCodeApi` from the helpers.
declare global {
  // eslint-disable-next-line no-var
  var acquireVsCodeApi: undefined | (() => unknown);
}
