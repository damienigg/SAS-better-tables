// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetForTests,
  nextReqId,
  onHostMessage,
  send,
} from "../../../client/src/webview/messaging";
import { fireHostMessage, installAcquireVsCodeApi } from "../../helpers/messaging";

beforeEach(() => {
  __resetForTests();
  installAcquireVsCodeApi();
});

afterEach(() => {
  __resetForTests();
});

describe("messaging.nextReqId", () => {
  it("starts at 1 and is monotonically increasing", () => {
    expect(nextReqId()).toBe(1);
    expect(nextReqId()).toBe(2);
    expect(nextReqId()).toBe(3);
  });
});

describe("messaging.send", () => {
  it("forwards the message to the captured vscode-api postMessage", () => {
    const captured = installAcquireVsCodeApi();
    send({ kind: "ready" });
    expect(captured.posted).toEqual([{ kind: "ready" }]);
  });

  it("caches the api handle — only one call to acquireVsCodeApi per session", () => {
    const spy = vi.fn(() => ({
      postMessage: () => undefined,
      setState: () => undefined,
      getState: () => undefined,
    }));
    globalThis.acquireVsCodeApi = spy;
    send({ kind: "ready" });
    send({ kind: "ready" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("messaging.onHostMessage", () => {
  it("delivers messages dispatched on `window` to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    onHostMessage(a);
    onHostMessage(b);
    fireHostMessage({ kind: "error", message: "boom" });
    expect(a).toHaveBeenCalledWith({ kind: "error", message: "boom" });
    expect(b).toHaveBeenCalledWith({ kind: "error", message: "boom" });
  });

  it("uses a single window listener regardless of how many subscribers register", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    onHostMessage(() => undefined);
    onHostMessage(() => undefined);
    onHostMessage(() => undefined);
    const messageBindings = addSpy.mock.calls.filter((c) => c[0] === "message");
    expect(messageBindings).toHaveLength(1);
  });

  it("returns a teardown that detaches just that subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    onHostMessage(a);
    const offB = onHostMessage(b);
    offB();
    fireHostMessage({ kind: "error", message: "x" });
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("a faulty subscriber does not stop the rest of the dispatch", () => {
    const bad = vi.fn(() => {
      throw new Error("listener failed");
    });
    const good = vi.fn();
    onHostMessage(bad);
    onHostMessage(good);
    fireHostMessage({ kind: "error", message: "x" });
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });
});
