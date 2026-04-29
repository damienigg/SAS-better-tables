// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// The main data grid. Wraps react-data-grid and adds:
//   - row-number gutter
//   - mssql-style multi-cell selection (click / shift-click / ctrl-click)
//   - Ctrl+C copy via the active selection
//   - scroll-driven prefetch through the data pump
//   - sort/filter via custom header cells

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  DataGrid,
  type Column,
  type CellClickArgs,
  type CellMouseEvent,
} from "react-data-grid";

import { send } from "../messaging";
import { ensureRange } from "../pump";
import { useStore } from "../store";
import { displayValue, isNumericKind } from "../formatters";
import { buildCopyText } from "../copy";
import {
  containsCell,
  rectFromTo,
  singleCell,
  toggleCell,
} from "../selection";
import { HeaderCell } from "./HeaderCell";

interface Row {
  __index: number;
  [colId: string]: string | null | number;
}

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 36;
const ROWNO_KEY = "__rowno";

export function Grid() {
  const columns = useStore((s) => s.columns);
  const rowCount = useStore((s) => s.rowCount);
  const rowsMap = useStore((s) => s.rows);
  const filters = useStore((s) => s.filters);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const setAnchor = useStore((s) => s.setAnchor);
  const anchor = useStore((s) => s.selectionAnchor);
  const setCellDetail = useStore((s) => s.setCellDetail);

  const containerRef = useRef<HTMLDivElement>(null);

  // Build the rows array. We materialise placeholders for absent rows so
  // react-data-grid sees a contiguous list and can virtualise correctly.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      const cached = rowsMap.get(i);
      const r: Row = { __index: i };
      for (let c = 0; c < columns.length; c++) {
        r[columns[c].id] = cached ? cached[c] : null;
      }
      out[i] = r;
    }
    // Apply client-side checklist filters (host-side filters are applied
    // on the server and just affect the rowCount we get back; checklist
    // filters work locally on already-loaded values).
    const checklists = filters.filter((f) => f.values && !f.expr);
    if (checklists.length === 0) return out;
    return out.filter((row) =>
      checklists.every((f) => f.values!.includes(String(row[f.colId] ?? ""))),
    );
  }, [columns, rowCount, rowsMap, filters]);

  const gridColumns = useMemo<Column<Row>[]>(() => {
    const cols: Column<Row>[] = [
      {
        key: ROWNO_KEY,
        name: "",
        width: 60,
        minWidth: 40,
        frozen: true,
        resizable: false,
        cellClass: "btv-rowno",
        renderCell: ({ row }) => row.__index + 1,
        renderHeaderCell: () => <span className="btv-rowno-header">#</span>,
      },
    ];
    for (const c of columns) {
      cols.push({
        key: c.id,
        name: c.label || c.name,
        width: 140,
        resizable: true,
        sortable: false, // we own sort UX via the custom header
        renderHeaderCell: () => <HeaderCell column={c} />,
        renderCell: ({ row }) => {
          const raw = row[c.id];
          const v = raw === undefined ? null : (raw as string | null);
          const { text, isNull, truncated } = displayValue(v);
          const cls = [
            "btv-cell",
            isNull && "btv-cell-null",
            isNumericKind(c.kind) && "btv-cell-num",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span className={cls} title={truncated && v ? v : undefined}>
              {text}
            </span>
          );
        },
      });
    }
    return cols;
  }, [columns]);

  // Selection coordinates use *data* column indices (i.e. row-number col is
  // excluded). react-data-grid's column.idx counts the row-number col, so
  // subtract one when translating.
  const onCellClick = useCallback(
    (args: CellClickArgs<Row>, event: CellMouseEvent) => {
      if (args.column.key === ROWNO_KEY) {
        // Clicking the row number selects the entire row.
        const r = args.row.__index;
        setSelection([
          { fromRow: r, toRow: r, fromCol: 0, toCol: columns.length - 1 },
        ]);
        setAnchor({ row: r, col: 0 });
        return;
      }
      const row = args.row.__index;
      const col = args.column.idx - 1;

      if (event.shiftKey && anchor) {
        setSelection([rectFromTo(anchor, { row, col })]);
      } else if (event.ctrlKey || event.metaKey) {
        setSelection(toggleCell(selection, row, col));
        setAnchor({ row, col });
      } else {
        setSelection(singleCell(row, col));
        setAnchor({ row, col });
      }
    },
    [anchor, columns.length, selection, setAnchor, setSelection],
  );

  const onCellDoubleClick = useCallback(
    (args: CellClickArgs<Row>) => {
      if (args.column.key === ROWNO_KEY) return;
      setCellDetail({
        row: args.row.__index,
        col: args.column.idx - 1,
      });
    },
    [setCellDetail],
  );

  // Apply visual selection by reading container DOM and toggling a class.
  // react-data-grid v7 exposes per-cell `cellClass` only as a function of
  // row, not (row, col). We override with a layout effect on the container.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const cells = root.querySelectorAll<HTMLElement>(".rdg-cell");
    cells.forEach((cell) => {
      const rowEl = cell.parentElement;
      if (!rowEl) return;
      const rowIdx = Number(rowEl.getAttribute("aria-rowindex"));
      if (Number.isNaN(rowIdx)) return;
      const colIdx = Number(cell.getAttribute("aria-colindex"));
      if (Number.isNaN(colIdx)) return;
      // aria-rowindex starts at 1 for the header, so data rows start at 2.
      const dataRow = rowIdx - 2;
      // aria-colindex is 1-based and counts the row-number col, so data
      // col 0 lives at aria-colindex 2.
      const dataCol = colIdx - 2;
      if (dataCol < 0 || dataRow < 0) {
        cell.classList.remove("btv-selected");
        return;
      }
      cell.classList.toggle(
        "btv-selected",
        containsCell(selection, dataRow, dataCol),
      );
    });
  }, [selection, rows]);

  // Scroll-driven prefetch. We compute the visible row band from the
  // scroll container and pre-load a buffer either side.
  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      const first = Math.floor(el.scrollTop / ROW_HEIGHT);
      const visible = Math.ceil(el.clientHeight / ROW_HEIGHT);
      const buffer = visible; // pre-load one screenful either side
      ensureRange(
        Math.max(0, first - buffer),
        Math.min(rowCount - 1, first + visible + buffer),
      );
    },
    [rowCount],
  );

  // Trigger the initial fetch once we know the row count.
  useEffect(() => {
    if (rowCount > 0) ensureRange(0, Math.min(rowCount - 1, 200));
  }, [rowCount]);

  // Ctrl/Cmd+C: copy the current selection in mssql's default format —
  // tab-separated cells with no headers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "c" || e.key === "C") &&
        !e.altKey
      ) {
        const sel = useStore.getState().selection;
        if (sel.length === 0) return;
        const cols = useStore.getState().columns;
        const map = useStore.getState().rows;
        const text = buildCopyText(e.shiftKey ? "with-headers" : "plain", {
          selection: sel,
          columns: cols,
          getCell: (r, c) => map.get(r)?.[c] ?? undefined,
        });
        send({ kind: "copy", format: "plain", text });
        e.preventDefault();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "a" || e.key === "A")
      ) {
        if (rowCount > 0 && columns.length > 0) {
          setSelection([
            {
              fromRow: 0,
              toRow: rowCount - 1,
              fromCol: 0,
              toCol: columns.length - 1,
            },
          ]);
          setAnchor({ row: 0, col: 0 });
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [columns.length, rowCount, setAnchor, setSelection]);

  return (
    <div className="btv-grid" ref={containerRef}>
      <DataGrid
        columns={gridColumns}
        rows={rows}
        rowKeyGetter={(row) => row.__index}
        rowHeight={ROW_HEIGHT}
        headerRowHeight={HEADER_HEIGHT}
        onCellClick={onCellClick}
        onCellDoubleClick={onCellDoubleClick}
        onScroll={onScroll}
        className="btv-rdg"
        defaultColumnOptions={{ resizable: true }}
      />
    </div>
  );
}
