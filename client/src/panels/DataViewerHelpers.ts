// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Pure helpers shared by `DataViewer.ts`. Extracted into their own
// module so they can be unit-tested in isolation — the panel class
// itself depends on the vscode runtime and is harder to instantiate in
// a unit test.

import type { Column } from "../connection/rest/api/compute";
import type { TableQuery } from "../components/LibraryNavigator/types";
import type {
  CellRange,
  ColumnFilter,
  ColumnKind,
  ColumnMeta,
  WebviewMessage,
} from "../webview/protocol";

/** Map a SAS-shaped `Column` to the slimmer `ColumnMeta` the webview
 *  protocol uses. Keep this aligned with `protocol.ColumnKind`. */
export function toColumnMeta(c: Column): ColumnMeta {
  const name = c.name ?? c.id ?? "";
  return {
    id: name,
    name,
    label: c.label,
    kind: mapType(c.type),
    length: c.length,
    format: c.format?.name,
  };
}

/** Translate the loose `Column.type` string into the `ColumnKind` enum.
 *  Anything we don't recognise becomes "unknown" so downstream code can
 *  still render the cell as text. */
export function mapType(t: string | undefined): ColumnKind {
  switch ((t || "").toLowerCase()) {
    case "char":
    case "string":
    case "text":
      return "char";
    case "num":
    case "numeric":
    case "double":
    case "integer":
      return "num";
    case "date":
      return "date";
    case "time":
      return "time";
    case "datetime":
    case "dt":
      return "datetime";
    case "currency":
      return "currency";
    default:
      return "unknown";
  }
}

/**
 * Build the SAS WHERE clause + raw-filter sidecar for a list of column
 * filters. SAS-server adapters read `filterValue`; in-memory adapters
 * read the raw `filters` array directly so they don't have to undo
 * SAS-WHERE parsing.
 */
export function combineFilters(
  filters: ColumnFilter[],
): TableQuery | undefined {
  const parts: string[] = [];
  for (const f of filters) {
    if (f.expr && f.expr.trim()) {
      parts.push(`(${f.expr.trim()})`);
    } else if (f.values) {
      // Best-effort SAS string-literal escaping — embedded `"` becomes
      // `""`. Numeric columns will not match against double-quoted
      // literals; the `expr` slot exists for those.
      const list = f.values.map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
      parts.push(`(${f.colId} in (${list}))`);
    }
  }
  if (parts.length === 0) {return undefined;}
  return { filterValue: parts.join(" and "), filters };
}

/** RFC-4180 cell formatter used by the host-side CSV exporter. */
export function csvCell(v: string | null | undefined): string {
  if (v === null || v === undefined) {return "";}
  if (
    v.indexOf(",") === -1 &&
    v.indexOf('"') === -1 &&
    v.indexOf("\n") === -1
  ) {
    return v;
  }
  return `"${v.replace(/"/g, '""')}"`;
}

/** Predicate that returns true iff a row index is touched by any of
 *  the selection rectangles. Column membership is ignored — used for
 *  row-level "should I include this row?" decisions. */
export function buildSelectionPredicate(
  selection: CellRange[],
): (row: number) => boolean {
  return (row: number) =>
    selection.some((r) => row >= r.fromRow && row <= r.toRow);
}

/** True iff the cell at (row, col) is contained in any selection
 *  rectangle. */
export function inSelectionAtCell(
  selection: CellRange[],
  row: number,
  col: number,
): boolean {
  for (const r of selection) {
    if (
      row >= r.fromRow &&
      row <= r.toRow &&
      col >= r.fromCol &&
      col <= r.toCol
    ) {
      return true;
    }
  }
  return false;
}

const KNOWN_KINDS = new Set([
  "ready",
  "rows-req",
  "open-column-properties",
  "save-view-state",
  "copy",
  "export",
]);

/** Type guard for incoming messages from the webview. We accept a value
 *  iff it has a `kind` field naming one of the known message types. */
export function isWebviewMessage(value: unknown): value is WebviewMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("kind" in value)) {
    return false;
  }
  const kind = value.kind;
  return typeof kind === "string" && KNOWN_KINDS.has(kind);
}
