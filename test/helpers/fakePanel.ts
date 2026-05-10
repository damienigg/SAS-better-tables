// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Helpers for tests that drive `panels/DataViewer` without going through
// the WebViewManager. We bypass the WebView base class by constructing
// a DataViewer instance and assigning a fake panel directly.

import { Uri, FakeWebviewPanel } from "../mocks/vscode";

import DataViewer from "../../client/src/panels/DataViewer";

/** Construct a DataViewer with its `panel` field set to a fake we can
 *  observe. The viewer never calls into the real WebViewManager, so we
 *  don't need to instantiate one. */
export function makeDataViewer(args: {
  uid?: string;
  paginator: ConstructorParameters<typeof DataViewer>[2];
  fetchColumns: ConstructorParameters<typeof DataViewer>[3];
  loadColumnProperties?: ConstructorParameters<typeof DataViewer>[4];
}): { viewer: DataViewer; panel: FakeWebviewPanel } {
  const viewer = new DataViewer(
    Uri.file("/ext"),
    args.uid ?? "test-uid",
    args.paginator,
    args.fetchColumns,
    args.loadColumnProperties,
  );
  const panel = new FakeWebviewPanel("dataViewer", "test");
  // The DataViewer base class declares `panel` as a protected field;
  // we assign through an index access so TS doesn't complain about
  // visibility. This is a test-only escape hatch.
  (viewer as unknown as { panel: FakeWebviewPanel }).panel = panel;
  return { viewer, panel };
}
