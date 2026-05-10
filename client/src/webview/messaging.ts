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

// Single window listener feeds all subscribers. Previously the pump and
// the App component each registered their own `window` listener, which
// meant the same incoming message was decoded twice. This bus deduplicates
// dispatch and centralises the event surface for tests.
const listeners = new Set<HostListener>();
let installed = false;
function install(): void {
  if (installed) {return;}
  installed = true;
  window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
    for (const l of listeners) {
      try {
        l(event.data);
      } catch {
        // A faulty listener must not block the rest of the dispatch.
      }
    }
  });
}

export function onHostMessage(listener: HostListener): () => void {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Auto-incrementing request id allocator. Numeric ids fit comfortably in a
 * single doubleword and serialise compactly over postMessage.
 */
let nextId = 1;
export function nextReqId(): number {
  return nextId++;
}
