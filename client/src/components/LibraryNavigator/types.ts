// Copyright © 2023, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Modifications © 2026 Damien Iggiotti — replaced ag-grid SortModelItem
// with a local SortModel type so the data-access stack no longer depends on
// the grid library used by the webview.

import { ColumnCollection, TableInfo } from "../../connection/rest/api/compute";
import type { ColumnFilter } from "../../webview/protocol";

export const LibraryType = "library";
export const TableType = "table";
export type LibraryItemType = "library" | "table";
export interface LibraryItem {
  uid: string;
  id: string;
  name: string;
  type: LibraryItemType;
  library?: string;
  readOnly: boolean;
}

export interface TableRow {
  cells?: string[];
  columns?: string[];
}

export interface TableData {
  rows: TableRow[];
  count: number;
}

export interface TableQuery {
  /** SAS WHERE-clause fragment, used by server-backed adapters. */
  filterValue: string;
  /** Raw filter spec as sent by the webview. SAS-server adapters ignore
   *  this and read `filterValue`; in-memory adapters (csv/tsv/xlsx) read
   *  this directly so they don't have to round-trip through SAS WHERE
   *  syntax just to undo it. */
  filters?: ColumnFilter[];
}

export type SortDirection = "asc" | "desc";
export interface SortModel {
  colId: string;
  sort: SortDirection;
}

export interface LibraryAdapter {
  connect(): Promise<void>;
  deleteTable(item: LibraryItem): Promise<void>;
  getColumns(
    item: LibraryItem,
    start: number,
    limit: number,
  ): Promise<ColumnCollection>;
  getLibraries(
    start: number,
    limit: number,
  ): Promise<{
    items: LibraryItem[];
    count: number;
  }>;
  getRows(
    item: LibraryItem,
    start: number,
    limit: number,
    sortModel: SortModel[],
    query: TableQuery | undefined,
  ): Promise<TableData>;
  getRowsAsCSV(
    item: LibraryItem,
    start: number,
    limit: number,
  ): Promise<TableData>;
  getTableRowCount(
    item: LibraryItem,
  ): Promise<{ rowCount: number; maxNumberOfRowsToRead: number }>;
  getTables(
    item: LibraryItem,
    start: number,
    limit: number,
  ): Promise<{
    items: LibraryItem[];
    count: number;
  }>;
  getTableInfo?(item: LibraryItem): Promise<TableInfo>;
  setup(): Promise<void>;
}
