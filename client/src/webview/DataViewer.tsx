// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Webview entry-point. esbuild bundles this file plus its CSS imports into
// `client/dist/webview/DataViewer.{js,css}`. The host (`panels/DataViewer.ts`)
// references those output paths directly.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "react-data-grid/lib/styles.css";
import "./DataViewer.css";

import { App } from "./App";

const mount = document.querySelector(".data-viewer-container");
if (mount instanceof HTMLElement) {
  createRoot(mount).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
