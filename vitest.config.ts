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
  esbuild: {
    // React 17+ automatic JSX runtime — components don't need to
    // `import React`, vite/esbuild injects the runtime import.
    jsx: "automatic",
  },
  resolve: {
    alias: {
      // Tests stub the `vscode` API surface; the real module is only
      // available when running inside an Extension Development Host.
      vscode: path.resolve(root, "test/mocks/vscode.ts"),
      // Pin react/react-dom to the top-level copies so the production
      // components and @testing-library/react share a single instance.
      // npm `overrides` matches the version, but without these aliases
      // vite would still resolve the client/-tree copy when the
      // importer lives under client/, producing the classic
      // "Invalid hook call" symptom.
      react: path.resolve(root, "node_modules/react"),
      "react-dom": path.resolve(root, "node_modules/react-dom"),
      "react-dom/client": path.resolve(
        root,
        "node_modules/react-dom/client.js",
      ),
      "react/jsx-runtime": path.resolve(
        root,
        "node_modules/react/jsx-runtime.js",
      ),
      "react/jsx-dev-runtime": path.resolve(
        root,
        "node_modules/react/jsx-dev-runtime.js",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@testing-library/react",
    ],
    exclude: ["exceljs"],
  },
  ssr: {
    // exceljs is CJS with dynamic requires that vite's transformer
    // cannot trace. Pass it through to Node's native loader so the
    // export tests get the real binary writer/reader.
    external: ["exceljs"],
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
    // Per-test-file pool selection: forks for the xlsx test (which
    // needs Node's native loader for the CJS exceljs module), threads
    // for everything else (faster, and required for the React DOM
    // test setup to share a single React instance across the test
    // process).
    server: {
      deps: {
        inline: [
          /\/node_modules\/react\//,
          /\/node_modules\/react-dom\//,
          /\/node_modules\/@testing-library\//,
          /\/node_modules\/scheduler\//,
        ],
      },
    },
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
      // Entry-point bundles, the react-data-grid host wrapper, and the
      // xlsx binary reader are validated by the @vscode/test-electron
      // integration tier rather than vitest. Excluding them keeps the
      // gate honest: it covers what unit tests can realistically reach.
      exclude: [
        "**/*.d.ts",
        "**/index.ts",
        "**/__fixtures__/**",
        // React entry points — bootstrapped by the host, exercised
        // end-to-end by the integration test.
        "client/src/webview/App.tsx",
        "client/src/webview/DataViewer.tsx",
        "client/src/webview/TablePropertiesViewer.ts",
        // Pure react-data-grid wrapper; jsdom can't drive its
        // virtualisation reliably enough for unit tests.
        "client/src/webview/grid/Grid.tsx",
        // xlsx binary parser — covered in integration tier (CJS
        // module incompatible with vitest's mock infrastructure).
        "client/src/components/FileTableViewer/xlsxSource.ts",
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
