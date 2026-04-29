// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import type { HostMessage, WebviewMessage } from "./protocol";

/** Subset of the `acquireVsCodeApi` surface we use. */
interface VsCodeApi {
  postMessage: (msg: WebviewMessage) => void;
  setState: (state: unknown) => void;
  getState: () => unknown;
}

declare function acquireVsCodeApi(): VsCodeApi;

let cached: VsCodeApi | undefined;
function api(): VsCodeApi {
  // VS Code only allows `acquireVsCodeApi` to be called once per webview.
  if (!cached) {
    cached = acquireVsCodeApi();
  }
  return cached;
}

export function send(msg: WebviewMessage): void {
  api().postMessage(msg);
}

export type HostListener = (msg: HostMessage) => void;

export function onHostMessage(listener: HostListener): () => void {
  const handler = (event: MessageEvent<HostMessage>) => listener(event.data);
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

/**
 * Auto-incrementing request id allocator. Numeric ids fit comfortably in a
 * single doubleword and serialise compactly over postMessage.
 */
let nextId = 1;
export function nextReqId(): number {
  return nextId++;
}
