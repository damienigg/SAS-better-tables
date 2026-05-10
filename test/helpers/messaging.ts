// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Helpers for tests that drive the webview-side messaging bus.

import type { HostMessage, WebviewMessage } from "../../client/src/webview/protocol";

export interface CapturedSend {
  posted: WebviewMessage[];
  state: unknown;
}

/** Install a stub `acquireVsCodeApi` on the global object and return a
 *  handle that captures every message the webview posts to the host
 *  plus the persisted view-state. Idempotent — calling twice replaces
 *  the previous capture. */
export function installAcquireVsCodeApi(): CapturedSend {
  const captured: CapturedSend = { posted: [], state: undefined };
  globalThis.acquireVsCodeApi = () => ({
    postMessage: (msg: WebviewMessage) => {
      captured.posted.push(msg);
    },
    setState: (s: unknown) => {
      captured.state = s;
    },
    getState: () => captured.state,
  });
  return captured;
}

/** Dispatch a message as if the host had postMessage'd it to the
 *  webview. Routes through `window.dispatchEvent` so any listeners
 *  registered via `messaging.onHostMessage` see it. */
export function fireHostMessage(message: HostMessage): void {
  window.dispatchEvent(new MessageEvent("message", { data: message }));
}
