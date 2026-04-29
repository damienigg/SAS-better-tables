// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Per-cell renderer used by react-data-grid. Subscribes to the selection
// slice of the store so the highlight survives virtualisation re-renders
// (an imperative class toggle would lose styling as react-data-grid
// recycles cells on scroll).

import { useStore } from "../store";
import { displayValue, isNumericKind } from "../formatters";
import { containsCell } from "../selection";
import type { ColumnKind } from "../protocol";

interface Props {
  row: number;
  col: number;
  kind: ColumnKind;
  value: string | null | undefined;
}

export function CellView({ row, col, kind, value }: Props) {
  const selected = useStore((s) => containsCell(s.selection, row, col));
  const v = value === undefined ? null : value;
  const { text, isNull, truncated } = displayValue(v);
  const cls = [
    "btv-cell",
    isNull && "btv-cell-null",
    isNumericKind(kind) && "btv-cell-num",
    selected && "btv-cell-selected",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} title={truncated && v ? v : undefined}>
      {text}
    </div>
  );
}
