// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Vitest configuration for the unit + component test layer. Two
// projects share this config:
//
//   - "node"       — pure modules + host-side helpers, no DOM
//   - "browser"    — webview React components, jsdom-backed
//
// The VS Code integration tier runs separately via `npm run test:vscode`
// (mocha + @vscode/test-electron) and is NOT executed by Vitest.

import path from "node:path";

import { defineConfig } from "vitest/config";

const root = __dirname;

export default defineConfig({
  resolve: {
    alias: {
      // Tests stub the `vscode` API surface; the real module is only
      // available when running inside an Extension Development Host.
      vscode: path.resolve(root, "test/mocks/vscode.ts"),
    },
  },
  test: {
    globals: true,
    setupFiles: [path.resolve(root, "test/setup.ts")],
    include: [
      "test/unit/**/*.test.ts",
      "test/unit/**/*.test.tsx",
      "test/components/**/*.test.tsx",
    ],
    // The pre-existing client/test/ tree belongs to the @vscode/test-electron
    // runner (mocha) and must not be picked up here.
    exclude: ["client/test/**", "server/test/**", "node_modules/**"],
    environmentMatchGlobs: [
      ["test/components/**", "jsdom"],
      ["test/unit/webview/**", "jsdom"],
      ["test/unit/**", "node"],
    ],
    // Per-file isolation so module-level singletons (zustand store,
    // messaging bus, pump pending map) start each test in a clean
    // state. The cost is small for our suite size.
    isolate: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "client/src/webview/**/*.{ts,tsx}",
        "client/src/panels/DataViewer.ts",
        "client/src/panels/DataViewerHelpers.ts",
        "client/src/components/FileTableViewer/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/index.ts",
        "**/__fixtures__/**",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
