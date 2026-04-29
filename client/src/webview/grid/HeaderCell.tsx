// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import type { ColumnFilter, ColumnMeta, SortSpec } from "../protocol";
import { useStore } from "../store";
import { l10n } from "../theme";
import { FilterPopup } from "./FilterPopup";

interface Props {
  column: ColumnMeta;
}

function nextSortDir(spec: SortSpec | undefined): SortSpec | null {
  if (!spec) return { colId: "", dir: "asc" };
  if (spec.dir === "asc") return { ...spec, dir: "desc" };
  return null; // third click clears
}

export function HeaderCell({ column }: Props) {
  const sort = useStore((s) => s.sort);
  const filters = useStore((s) => s.filters);
  const setSort = useStore((s) => s.setSort);
  const [filterOpen, setFilterOpen] = useState(false);

  const current = sort.find((s) => s.colId === column.id);
  const filter = filters.find((f) => f.colId === column.id);

  const onSortClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = nextSortDir(current);
    if (next === null) {
      // Remove this column from the sort.
      setSort(sort.filter((s) => s.colId !== column.id));
    } else {
      // Single-column sort, like mssql.
      setSort([{ colId: column.id, dir: next.dir }]);
    }
  };

  const onFilterClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFilterOpen((b) => !b);
  };

  return (
    <div className="btv-header" title={column.label || column.name}>
      <span className="btv-header-name" onClick={onSortClick}>
        {column.label || column.name}
      </span>
      {current && (
        <span className="btv-header-sort" aria-label={l10n("Sort")}>
          {current.dir === "asc" ? "▲" : "▼"}
        </span>
      )}
      <button
        type="button"
        className={
          "btv-header-filter" + (filter ? " btv-header-filter-on" : "")
        }
        onClick={onFilterClick}
        title={l10n("Filter")}
      >
        ⚲
      </button>
      {filterOpen && (
        <FilterPopup
          column={column}
          current={filter}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
