// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// The main data grid. Wraps react-data-grid and adds:
//   - row-number gutter
//   - mssql-style multi-cell selection (click / shift-click / ctrl-click)
//   - Ctrl+C copy via the active selection
//   - scroll-driven prefetch through the data pump
//   - sort/filter via custom header cells

import { useCallback, useEffect, useMemo } from "react";

import DataGrid, {
  type Column,
  type CellClickArgs,
  type CellMouseEvent,
} from "react-data-grid";

import { send } from "../messaging";
import { ensureRange } from "../pump";
import { useStore } from "../store";
import { buildCopyText } from "../copy";
import {
  rectFromTo,
  singleCell,
  toggleCell,
} from "../selection";
import { HeaderCell } from "./HeaderCell";
import { CellView } from "./CellView";

interface Row {
  __index: number;
  __cells: Record<string, string | null>;
}

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 36;
const ROWNO_KEY = "__rowno";

export function Grid() {
  const columns = useStore((s) => s.columns);
  const rowCount = useStore((s) => s.rowCount);
  const rowsMap = useStore((s) => s.rows);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const setAnchor = useStore((s) => s.setAnchor);
  const anchor = useStore((s) => s.selectionAnchor);
  const setCellDetail = useStore((s) => s.setCellDetail);

  // Build the rows array. We materialise placeholders for absent rows so
  // react-data-grid sees a contiguous list and can virtualise correctly.
  // Filtering is applied server-side, so `rowCount` already reflects the
  // post-filter total and array index equals data-row index.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      const cached = rowsMap.get(i);
      const cells: Record<string, string | null> = {};
      for (let c = 0; c < columns.length; c++) {
        cells[columns[c].id] = cached ? cached[c] : null;
      }
      out[i] = { __index: i, __cells: cells };
    }
    return out;
  }, [columns, rowCount, rowsMap]);

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
    columns.forEach((c, dataColIdx) => {
      cols.push({
        key: c.id,
        name: c.label || c.name,
        width: 140,
        resizable: true,
        sortable: false, // we own sort UX via the custom header
        cellClass: "btv-data-cell",
        renderHeaderCell: () => <HeaderCell column={c} />,
        renderCell: ({ row }) => (
          <CellView
            row={row.__index}
            col={dataColIdx}
            kind={c.kind}
            value={row.__cells[c.id]}
          />
        ),
      });
    });
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
      if (args.column.key === ROWNO_KEY) {return;}
      setCellDetail({
        row: args.row.__index,
        col: args.column.idx - 1,
      });
    },
    [setCellDetail],
  );

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
    if (rowCount > 0) {ensureRange(0, Math.min(rowCount - 1, 200));}
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
        if (sel.length === 0) {return;}
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
    <div className="btv-grid">
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
