// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Higher-level test of the FileTableViewer dispatcher: given a URI,
// does it route to the right loader and surface errors via
// showErrorMessage?

import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Uri,
  __testHooks,
  type ExtensionContext,
} from "../../mocks/vscode";

const FIXTURES = path.resolve(__dirname, "../../fixtures");

// Mock sas7bdatSource since it depends on the SAS connection.
vi.mock("../../../client/src/components/FileTableViewer/sas7bdatSource", async () => {
  const actual = await vi.importActual<
    typeof import(
      "../../../client/src/components/FileTableViewer/sas7bdatSource"
    )
  >("../../../client/src/components/FileTableViewer/sas7bdatSource");
  return {
    ...actual,
    sas7bdatSource: vi.fn(async () => undefined),
  };
});

// Mock the panel so we can observe what gets rendered.
const renderCalls = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("../../../client/src/panels/WebviewManager", () => ({
  WebViewManager: class {
    render(_view: unknown, uid: string) {
      renderCalls.list.push(uid);
    }
  },
  WebView: class {
    constructor(_extensionUri: unknown, public title: string) {}
  },
}));
vi.mock("../../../client/src/panels/DataViewer", () => ({
  default: class FakeDataViewer {
    public title = "fake";
    public constructor(
      _extensionUri: unknown,
      public uid: string,
      _paginator: unknown,
      _fetchColumns: unknown,
      _loadColumnProperties?: unknown,
    ) {}
  },
}));
vi.mock("../../../client/src/panels/TablePropertiesViewer", () => ({
  default: class {
    public constructor(...args: unknown[]) {
      void args;
    }
  },
}));

// Imported AFTER mocks.
const { default: FileTableViewer } = await import(
  "../../../client/src/components/FileTableViewer"
);

function makeCtx(): ExtensionContext {
  return {
    extensionUri: Uri.file("/ext"),
    subscriptions: [],
  };
}

beforeEach(() => {
  renderCalls.list.length = 0;
  __testHooks.reset();
});
afterEach(() => {
  renderCalls.list.length = 0;
});

describe("FileTableViewer.open — extension dispatch", () => {
  it("opens a CSV via the in-memory path", async () => {
    const v = new FileTableViewer(makeCtx());
    await v.open(Uri.file(path.join(FIXTURES, "cars.csv")));
    expect(renderCalls.list).toEqual([`file:${path.join(FIXTURES, "cars.csv")}`]);
  });
  it("opens a TSV via the in-memory path", async () => {
    const v = new FileTableViewer(makeCtx());
    await v.open(Uri.file(path.join(FIXTURES, "tabs.tsv")));
    expect(renderCalls.list).toHaveLength(1);
  });
  it("rejects unsupported extensions with an error toast", async () => {
    const v = new FileTableViewer(makeCtx());
    await v.open(Uri.file("/tmp/document.pdf"));
    expect(__testHooks.shownErrorMessages.some((m) =>
      m.includes("not supported"),
    )).toBe(true);
    expect(renderCalls.list).toHaveLength(0);
  });
  it("surfaces unexpected errors via showErrorMessage rather than crashing", async () => {
    const v = new FileTableViewer(makeCtx());
    await v.open(Uri.file("/does/not/exist.csv"));
    expect(__testHooks.shownErrorMessages.some((m) =>
      m.includes("Failed to open table"),
    )).toBe(true);
  });
});
