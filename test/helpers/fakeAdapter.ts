// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Minimal LibraryAdapter stub for tests that drive `LibraryModel` /
// `panels/DataViewer` without a live SAS connection. The shape mirrors
// the real adapter; only methods our tests exercise are real.

import type {
  Column,
  ColumnCollection,
  TableInfo,
} from "../../client/src/connection/rest/api/compute";
import type {
  LibraryAdapter,
  LibraryItem,
  SortModel,
  TableData,
  TableQuery,
} from "../../client/src/components/LibraryNavigator/types";

export interface FakeAdapterOptions {
  /** Cells of each row, including the leading index cell at slot 0. */
  rows: string[][];
  columns: Column[];
  /** If set, getRows throws on the Nth call (1-based). */
  failOnCall?: number;
}

export interface FakeAdapterRecord {
  getRowsCalls: Array<{
    item: Pick<LibraryItem, "name" | "library">;
    start: number;
    limit: number;
    sortModel: SortModel[];
    query: TableQuery | undefined;
  }>;
}

export function createFakeAdapter(
  opts: FakeAdapterOptions,
): LibraryAdapter & { __record: FakeAdapterRecord } {
  const record: FakeAdapterRecord = { getRowsCalls: [] };
  const adapter: LibraryAdapter & { __record: FakeAdapterRecord } = {
    __record: record,
    async connect() {},
    async setup() {},
    async deleteTable() {},
    async getColumns(): Promise<ColumnCollection> {
      return { items: opts.columns, count: opts.columns.length, start: 0, limit: opts.columns.length };
    },
    async getLibraries() {
      return { items: [], count: 0 };
    },
    async getRows(item, start, limit, sortModel, query) {
      record.getRowsCalls.push({ item, start, limit, sortModel, query });
      if (
        opts.failOnCall !== undefined &&
        record.getRowsCalls.length === opts.failOnCall
      ) {
        throw new Error("simulated adapter failure");
      }
      const slice = opts.rows.slice(start, start + limit);
      const data: TableData = {
        rows: slice.map((cells) => ({ cells })),
        count: opts.rows.length,
      };
      return data;
    },
    async getRowsAsCSV(): Promise<TableData> {
      // Returns columns row + all data rows, matching the real adapter.
      const headers: string[] = opts.columns.map((c) => c.name ?? "");
      const rows = [{ columns: headers }, ...opts.rows.map((cells) => ({ cells }))];
      return { rows, count: opts.rows.length };
    },
    async getTableRowCount() {
      return { rowCount: opts.rows.length, maxNumberOfRowsToRead: 1000 };
    },
    async getTables() {
      return { items: [], count: 0 };
    },
    async getTableInfo(): Promise<TableInfo> {
      return {
        name: "FAKE",
        rowCount: opts.rows.length,
        columnCount: opts.columns.length,
      } as TableInfo;
    },
  };
  return adapter;
}
