// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Stubs for the connection-layer Session used by `sas7bdatSource`.
// We swap `getSession` with a captured fake so tests can inspect which
// SAS code was submitted.

import type { Session } from "../../client/src/connection/session";

export interface SessionRecord {
  ran: string[];
  setupCalls: number;
}

export function createFakeSession(): { session: Session; record: SessionRecord } {
  const record: SessionRecord = { ran: [], setupCalls: 0 };
  const session = {
    async setup() {
      record.setupCalls++;
    },
    async run(code: string) {
      record.ran.push(code);
      return {};
    },
    sessionId() {
      return "test-session";
    },
  } as unknown as Session;
  return { session, record };
}
