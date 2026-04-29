// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Extension-host counterpart of the table-viewer webview. Replaces the
// upstream ag-grid-driven panel with one that speaks the protocol defined
// in `webview/protocol.ts` and:
//
//   - lazily fetches pages from the SAS LibraryAdapter via a PaginatedResultSet
//   - assembles WHERE clauses from the webview's filter state
//   - serves clipboard writes for copy actions
//   - streams CSV / JSON / XLSX exports through a file save dialog
//
// The constructor signature is the same as the upstream panel (item id +
// paginator + fetchColumns + column-properties opener) so the
// LibraryNavigator command registration does not need to change.

import { Uri, env, l10n, window, workspace } from "vscode";

import { createWriteStream } from "fs";
import path from "path";

import PaginatedResultSet from "../components/LibraryNavigator/PaginatedResultSet";
import {
  SortModel,
  TableData,
  TableQuery,
} from "../components/LibraryNavigator/types";
import { Column } from "../connection/rest/api/compute";
import { WebView } from "./WebviewManager";
import type {
  CellRange,
  ColumnFilter,
  ColumnKind,
  ColumnMeta,
  ExportFormat,
  ExportScope,
  HostMessage,
  SortSpec,
  ViewState,
  WebviewMessage,
} from "../webview/protocol";

const PAGE_SIZE = 200;
/** When `init` happens we don't yet know the row count. We seed the webview
 *  with this so it has *something* to render; the first row response will
 *  carry the real total. */
const INITIAL_ROW_COUNT_GUESS = 1;

class DataViewer extends WebView {
  protected viewState: ViewState = { sort: [], filters: [] };
  /** Column metadata (in display order) once the webview has asked for it.
   *  Cached so we don't pay re-fetch cost on every operation. */
  protected columnMeta: ColumnMeta[] = [];

  public constructor(
    extensionUri: Uri,
    uid: string,
    protected readonly paginator: PaginatedResultSet<{
      data: TableData;
      error?: Error;
    }>,
    protected readonly fetchColumns: () => Column[],
    protected readonly loadColumnProperties: (columnName: string) => void,
  ) {
    super(extensionUri, uid);
  }

  public l10nMessages() {
    return {
      Apply: l10n.t("Apply"),
      Avg: l10n.t("Avg"),
      Clear: l10n.t("Clear"),
      "Clear all filters": l10n.t("Clear all filters"),
      "Clear filters": l10n.t("Clear filters"),
      Close: l10n.t("Close"),
      Copy: l10n.t("Copy"),
      "Copy as CSV": l10n.t("Copy as CSV"),
      "Copy as JSON": l10n.t("Copy as JSON"),
      "Copy as TSV": l10n.t("Copy as TSV"),
      "Copy headers only": l10n.t("Copy headers only"),
      "Copy with headers": l10n.t("Copy with headers"),
      Distinct: l10n.t("Distinct"),
      Export: l10n.t("Export"),
      Filter: l10n.t("Filter"),
      Max: l10n.t("Max"),
      Min: l10n.t("Min"),
      "No values loaded yet.": l10n.t("No values loaded yet."),
      Nulls: l10n.t("Nulls"),
      "(empty)": l10n.t("(empty)"),
      Search: l10n.t("Search"),
      Selected: l10n.t("Selected"),
      "Selection as CSV": l10n.t("Selection as CSV"),
      "Selection as Excel": l10n.t("Selection as Excel"),
      "Selection as JSON": l10n.t("Selection as JSON"),
      Sort: l10n.t("Sort"),
      Sum: l10n.t("Sum"),
      "All rows as CSV": l10n.t("All rows as CSV"),
      "All rows as Excel": l10n.t("All rows as Excel"),
      "All rows as JSON": l10n.t("All rows as JSON"),
      "WHERE expression": l10n.t("WHERE expression"),
      filters: l10n.t("filters"),
      row: l10n.t("row"),
      rows: l10n.t("rows"),
    };
  }

  public styles() {
    return ["DataViewer.css"];
  }

  public scripts() {
    return ["DataViewer.js"];
  }

  public body() {
    return `<div class="data-viewer-container" data-title="${this.title}"></div>`;
  }

  public async processMessage(event: unknown): Promise<void> {
    if (!isWebviewMessage(event)) {
      return;
    }
    const msg: WebviewMessage = event;
    try {
      switch (msg.kind) {
        case "ready":
          await this.sendInit();
          return;
        case "rows-req":
          await this.serveRows(msg.reqId, msg);
          return;
        case "copy":
          await env.clipboard.writeText(msg.text);
          return;
        case "open-column-properties":
          this.loadColumnProperties(msg.colId);
          return;
        case "save-view-state":
          this.viewState = msg.state;
          return;
        case "export":
          await this.exportTable(msg.format, msg.scope, msg.selection, {
            sort: msg.sort,
            filters: msg.filters,
          });
          return;
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      this.post({ kind: "error", message: text });
      void window.showErrorMessage(text);
    }
  }

  private post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private async sendInit(): Promise<void> {
    const rawColumns = this.fetchColumns();
    this.columnMeta = rawColumns.map(toColumnMeta);
    this.post({
      kind: "init",
      title: this.title,
      columns: this.columnMeta,
      rowCount: INITIAL_ROW_COUNT_GUESS,
      pageSize: PAGE_SIZE,
      viewState: this.viewState,
    });
  }

  private async serveRows(
    reqId: number,
    req: { start: number; end: number; sort: SortSpec[]; filters: ColumnFilter[] },
  ): Promise<void> {
    const sortModel = req.sort.map<SortModel>((s) => ({
      colId: s.colId,
      sort: s.dir,
    }));
    const query = combineFilters(req.filters);

    const { data, error } = await this.paginator.getData(
      req.start,
      req.end,
      sortModel,
      query,
    );

    if (error) {
      this.post({ kind: "error", reqId, message: error.message });
      return;
    }

    // Adapter rows include an index cell at position 0; strip it so column
    // indices line up with `columnMeta`.
    const rows = data.rows.map((row) => {
      const cells = row.cells ?? [];
      // Treat empty strings as nulls only when the slot is *known* to be
      // blank; we leave non-empty strings exactly as the server sent them.
      const stripped: (string | null)[] = [];
      for (let i = 1; i < cells.length; i++) {
        const v = cells[i];
        stripped.push(v === undefined ? null : v);
      }
      return stripped;
    });

    this.post({
      kind: "rows-resp",
      reqId,
      start: req.start,
      rows,
      rowCount: data.count >= 0 ? data.count : req.start + rows.length,
    });
  }

  private async exportTable(
    format: ExportFormat,
    scope: ExportScope,
    selection: CellRange[] | undefined,
    state: { sort: SortSpec[]; filters: ColumnFilter[] },
  ): Promise<void> {
    const defaultName = `${this.title}.${format === "xlsx" ? "xlsx" : format}`;
    const defaultDir =
      env.remoteName !== undefined &&
      workspace.workspaceFolders &&
      workspace.workspaceFolders.length > 0
        ? workspace.workspaceFolders[0].uri.fsPath
        : "";
    const target = await window.showSaveDialog({
      defaultUri: Uri.file(path.join(defaultDir, defaultName)),
    });
    if (!target) {return;}

    const sortModel = state.sort.map<SortModel>((s) => ({
      colId: s.colId,
      sort: s.dir,
    }));
    const query = combineFilters(state.filters);
    const cols = this.columnMeta;
    const inSelection = selection
      ? buildSelectionPredicate(selection)
      : () => true;
    let rowIdx = -1;

    if (format === "csv") {
      const stream = createWriteStream(target.fsPath);
      stream.write(cols.map((c) => csvCell(c.label || c.name)).join(","));
      stream.write("\n");
      for await (const cells of this.iterAllRows(sortModel, query)) {
        rowIdx++;
        if (scope === "selection" && !inSelection(rowIdx)) {continue;}
        const out: (string | null)[] = cols.map((_c, i) => cells[i] ?? null);
        stream.write(out.map(csvCell).join(","));
        stream.write("\n");
      }
      stream.end();
    } else if (format === "json") {
      const stream = createWriteStream(target.fsPath);
      stream.write("[\n");
      let first = true;
      for await (const cells of this.iterAllRows(sortModel, query)) {
        rowIdx++;
        if (scope === "selection" && !inSelection(rowIdx)) {continue;}
        const obj: Record<string, string> = {};
        for (let i = 0; i < cols.length; i++) {
          if (
            scope === "selection" &&
            selection &&
            !inSelectionAtCell(selection, rowIdx, i)
          ) {
            continue;
          }
          obj[cols[i].name] = cells[i] ?? "";
        }
        if (!first) {stream.write(",\n");}
        stream.write("  " + JSON.stringify(obj));
        first = false;
      }
      stream.write("\n]\n");
      stream.end();
    } else if (format === "xlsx") {
      // Lazy import so we don't load exceljs unless someone exports excel.
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("data");
      ws.addRow(cols.map((c) => c.label || c.name));
      for await (const cells of this.iterAllRows(sortModel, query)) {
        rowIdx++;
        if (scope === "selection" && !inSelection(rowIdx)) {continue;}
        const out: (string | null)[] = [];
        for (let i = 0; i < cols.length; i++) {
          if (
            scope === "selection" &&
            selection &&
            !inSelectionAtCell(selection, rowIdx, i)
          ) {
            out.push(null);
          } else {
            out.push(cells[i] ?? null);
          }
        }
        ws.addRow(out);
      }
      await wb.xlsx.writeFile(target.fsPath);
    }
  }

  private async *iterAllRows(
    sortModel: SortModel[],
    query: TableQuery | undefined,
  ): AsyncGenerator<string[], void, void> {
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const { data, error } = await this.paginator.getData(
        offset,
        offset + PAGE_SIZE - 1,
        sortModel,
        query,
      );
      if (error) {throw error;}
      if (data.count >= 0) {total = data.count;}
      if (data.rows.length === 0) {break;}
      for (const row of data.rows) {
        // Strip the leading index cell that the adapter prepends.
        yield (row.cells ?? []).slice(1);
      }
      offset += data.rows.length;
    }
  }
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function toColumnMeta(c: Column): ColumnMeta {
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

function mapType(t: string | undefined): ColumnKind {
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

function combineFilters(filters: ColumnFilter[]): TableQuery | undefined {
  const parts: string[] = [];
  for (const f of filters) {
    if (f.expr && f.expr.trim()) {
      parts.push(`(${f.expr.trim()})`);
    } else if (f.values) {
      // Quote each value as a string literal. This is best-effort for char
      // columns; numeric columns won't match if the user includes quotes.
      // The `expr` slot exists for that case.
      const list = f.values.map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
      parts.push(`(${f.colId} in (${list}))`);
    }
  }
  return parts.length === 0 ? undefined : { filterValue: parts.join(" and ") };
}

function csvCell(v: string | null | undefined): string {
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

function buildSelectionPredicate(
  selection: CellRange[],
): (row: number) => boolean {
  return (row: number) =>
    selection.some((r) => row >= r.fromRow && row <= r.toRow);
}

function inSelectionAtCell(
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

function isWebviewMessage(value: unknown): value is WebviewMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("kind" in value)) {
    return false;
  }
  const kind = value.kind;
  return typeof kind === "string" && KNOWN_KINDS.has(kind);
}

export default DataViewer;
