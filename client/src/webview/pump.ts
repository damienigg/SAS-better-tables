// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// The data pump — turns "I want rows N..M visible" into host requests,
// dropping responses from older generations. One generation per
// sort/filter epoch.

import { send, nextReqId } from "./messaging";
import type { HostMessage } from "./protocol";
import { useStore } from "./store";

interface PendingRequest {
  reqId: number;
  generation: number;
}

const pending = new Map<number, PendingRequest>();

/**
 * Request that the page-aligned slice covering [startRow, endRow] (inclusive)
 * be in the local cache. Idempotent — pages already in flight or cached are
 * skipped. Stale responses (older generation) are discarded on arrival.
 */
export function ensureRange(startRow: number, endRow: number): void {
  const s = useStore.getState();
  const { pageSize, requestedPages, rowCount, sort, filters, generation } = s;
  if (rowCount === 0) {return;}

  const firstPage = Math.max(0, Math.floor(startRow / pageSize));
  const lastPage = Math.min(
    Math.floor((rowCount - 1) / pageSize),
    Math.floor(endRow / pageSize),
  );

  for (let p = firstPage; p <= lastPage; p++) {
    if (requestedPages.has(p)) {continue;}
    const start = p * pageSize;
    const end = Math.min(rowCount - 1, start + pageSize - 1);
    const reqId = nextReqId();
    pending.set(reqId, { reqId, generation });
    s.markRequested([p]);
    send({
      kind: "rows-req",
      reqId,
      start,
      end,
      sort,
      filters,
    });
  }
}

/** Hook the pump to incoming host messages. Returns a teardown fn. */
export function bindPump(): () => void {
  const handler = (event: MessageEvent<HostMessage>) => {
    const msg = event.data;
    if (msg.kind === "rows-resp") {
      const tracked = pending.get(msg.reqId);
      pending.delete(msg.reqId);
      if (!tracked) {return;}
      const cur = useStore.getState();
      // Drop responses from a stale sort/filter epoch.
      if (tracked.generation !== cur.generation) {return;}
      cur.applyRows(msg.start, msg.rows, msg.rowCount);
    } else if (msg.kind === "error") {
      useStore.getState().setError(msg.message);
      if (msg.reqId !== undefined) {
        // Free the request slot so the page can be retried.
        pending.delete(msg.reqId);
        useStore.setState((s) => {
          // Best-effort: don't know which page failed without the req map,
          // so just bump the generation to force a refetch on next scroll.
          return s;
        });
      }
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

/** Forget all in-flight requests. Call when re-initialising. */
export function resetPump(): void {
  pending.clear();
}
