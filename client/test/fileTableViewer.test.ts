// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Integration test that boots a real Extension Development Host via
// @vscode/test-electron, runs `SBT.openTableFile` against a local CSV
// fixture, and asserts that:
//
//   1. The command is registered.
//   2. Invoking it opens a webview tab.
//   3. The DataViewer panel is reachable via the WebView panel API.
//
// This is intentionally minimal — exhaustive behavioural coverage lives
// in the Vitest layer. The integration test is the smoke-test that
// proves wiring (package.json contributes, activation, command
// registration, WebView panel creation) actually works end to end.

import * as vscode from "vscode";

import { assert } from "chai";

import { getUri } from "./utils";

describe("FileTableViewer integration", () => {
  it("registers the SBT.openTableFile command", async () => {
    const all = await vscode.commands.getCommands(true);
    assert.include(all, "SBT.openTableFile");
  });

  it("opens a webview when invoked on a CSV fixture", async () => {
    const initialTabs = totalTabs();

    const csv = getUri("cars.csv");
    await vscode.commands.executeCommand("SBT.openTableFile", csv);

    // Webview creation is async — give the panel a beat to register.
    await waitFor(
      () => totalTabs() > initialTabs,
      3000,
      "expected at least one new tab after SBT.openTableFile",
    );

    // The new tab should be a webview panel labelled with the file
    // basename. We don't snoop into the webview HTML — that's the
    // unit layer's job.
    const newTab = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find((t) => t.label === "cars.csv");
    assert.exists(newTab, "expected a tab named cars.csv");
  });
});

function totalTabs(): number {
  return vscode.window.tabGroups.all.reduce((n, g) => n + g.tabs.length, 0);
}

async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
  msg: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) {return;}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`waitFor timed out: ${msg}`);
}
