// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Wraps a fully-loaded rows-by-columns matrix as a `FileTableSource`. Used
// by the csv/tsv/xlsx readers; sas7bdat takes a different route through
// the live SAS session.
//
// Sort and filter both work against an "indices view" — a permutation of
// row indices reflecting the currently applied sort+filter combination.
// We rebuild the view only when the (sort, filter) signature changes, so
// scrolling within a sorted/filtered view costs O(end − start) per page
// rather than re-sorting on every request.

import type { Column } from "../../connection/rest/api/compute";
import type {
  SortModel,
  TableData,
  TableQuery,
  TableRow,
} from "../LibraryNavigator/types";
import type { FileTableSource } from "./types";
import { buildRowPredicate } from "./filterEval";

export class InMemorySource implements FileTableSource {
  /** Indices into `rows` that survive the current filter, in current sort
   *  order. `null` means "no view applied yet — treat as identity". */
  private viewIndices: number[] | null = null;
  private viewSig = "";

  /**
   * @param title Display title (panel tab text).
   * @param uid Stable webview-panel id.
   * @param columns SAS-shaped column metadata, in display order.
   * @param rows Each row's `cells[0]` is a placeholder for the row-number
   *             column the panel strips. Subsequent cells line up with
   *             `columns[0..]`.
   */
  public constructor(
    public readonly title: string,
    public readonly uid: string,
    public readonly columns: Column[],
    private readonly rows: (string | null)[][],
  ) {}

  public get rowCount(): number {
    return this.viewIndices ? this.viewIndices.length : this.rows.length;
  }

  public async getRows(
    start: number,
    end: number,
    sort: SortModel[],
    query: TableQuery | undefined,
  ): Promise<TableData> {
    const sig = signature(sort, query);
    if (sig !== this.viewSig) {
      this.viewIndices = this.buildView(sort, query);
      this.viewSig = sig;
    }

    const total = this.rowCount;
    const stop = Math.min(end + 1, total);
    const out: TableRow[] = [];
    for (let i = start; i < stop; i++) {
      const idx = this.viewIndices ? this.viewIndices[i] : i;
      const cells = this.rows[idx].map((c) => (c === null ? "" : c));
      out.push({ cells });
    }
    return { rows: out, count: total };
  }

  private buildView(
    sort: SortModel[],
    query: TableQuery | undefined,
  ): number[] | null {
    const filters = query?.filters ?? [];
    const colIndex = (id: string) =>
      this.columns.findIndex((c) => c.id === id || c.name === id);
    const pred = buildRowPredicate(filters, (id) => {
      const c = colIndex(id);
      // The predicate sees rows with the leading index cell stripped, so
      // shift indices back by one when it asks "what column is this id?".
      return c;
    });

    const indices: number[] = [];
    if (filters.length === 0) {
      for (let i = 0; i < this.rows.length; i++) {indices.push(i);}
    } else {
      for (let i = 0; i < this.rows.length; i++) {
        // Strip the leading index placeholder before predicate evaluation.
        const dataRow = this.rows[i].slice(1);
        if (pred(dataRow)) {indices.push(i);}
      }
    }

    if (sort.length > 0) {
      const cmps = compileSort(sort, this.columns, this.rows);
      indices.sort((a, b) => {
        for (const cmp of cmps) {
          const r = cmp(a, b);
          if (r !== 0) {return r;}
        }
        return 0;
      });
    }
    return indices;
  }
}

type Cmp = (a: number, b: number) => number;

function compileSort(
  sort: SortModel[],
  columns: Column[],
  rows: (string | null)[][],
): Cmp[] {
  const cmps: Cmp[] = [];
  for (const s of sort) {
    const dataIdx = columns.findIndex(
      (c) => c.id === s.colId || c.name === s.colId,
    );
    if (dataIdx < 0) {continue;}
    const isNumeric = isNumericKind(columns[dataIdx]?.type);
    const cellIdx = dataIdx + 1; // +1 for the leading index placeholder
    const dir = s.sort === "asc" ? 1 : -1;
    cmps.push((a, b) => {
      const va = rows[a][cellIdx];
      const vb = rows[b][cellIdx];
      // Treat null and empty string as equivalent missing values; sort
      // them last regardless of direction (mssql does the same).
      if (va === null || va === "") {
        return vb === null || vb === "" ? 0 : 1;
      }
      if (vb === null || vb === "") {
        return -1;
      }
      // Both va and vb are now non-empty strings.
      if (isNumeric) {
        const na = parseFloat(va);
        const nb = parseFloat(vb);
        if (Number.isNaN(na) && Number.isNaN(nb)) {return 0;}
        if (Number.isNaN(na)) {return 1;}
        if (Number.isNaN(nb)) {return -1;}
        return (na - nb) * dir;
      }
      return va.localeCompare(vb) * dir;
    });
  }
  return cmps;
}

function isNumericKind(type: string | undefined): boolean {
  const t = (type || "").toLowerCase();
  return (
    t === "num" ||
    t === "numeric" ||
    t === "double" ||
    t === "integer" ||
    t === "currency" ||
    t === "date" ||
    t === "time" ||
    t === "datetime"
  );
}

function signature(
  sort: SortModel[],
  query: TableQuery | undefined,
): string {
  const sortKey = sort.map((s) => `${s.colId}:${s.sort}`).join(",");
  const filterKey = (query?.filters ?? [])
    .map((f) =>
      f.expr
        ? `${f.colId}:e:${f.expr}`
        : `${f.colId}:v:${(f.values ?? []).join("|")}`,
    )
    .join(";");
  return `${sortKey}#${filterKey}`;
}
