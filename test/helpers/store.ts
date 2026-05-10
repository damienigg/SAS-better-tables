// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Reset helpers for the zustand store. Vitest gives us module isolation
// per file, but inside a file the store keeps state across tests; we
// drive `init` to reset it.

import { useStore } from "../../client/src/webview/store";

export function resetStore(): void {
  useStore.setState({
    title: "",
    columns: [],
    rowCount: 0,
    pageSize: 200,
    rows: new Map(),
    requestedPages: new Set(),
    sort: [],
    filters: [],
    generation: 0,
    selection: [],
    selectionAnchor: null,
    loading: false,
    error: null,
    cellDetail: null,
  });
}
