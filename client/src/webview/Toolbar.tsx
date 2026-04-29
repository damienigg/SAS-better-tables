// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { send } from "./messaging";
import { useStore } from "./store";
import { l10n } from "./theme";
import { buildCopyText } from "./copy";
import type { CopyFormat, ExportFormat, ExportScope } from "./protocol";

interface MenuProps {
  label: string;
  children: React.ReactNode;
}

function DropMenu({ label, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="btv-menu">
      <button
        type="button"
        className="btv-btn btv-menu-trigger"
        onClick={() => setOpen((b) => !b)}
        onBlur={(e) => {
          // Close when focus leaves the menu entirely (not when moving to a
          // child item). `relatedTarget` is the new focus owner.
          const parent = e.currentTarget.parentElement;
          const next = e.relatedTarget;
          if (!parent || !(next instanceof Node) || !parent.contains(next)) {
            setOpen(false);
          }
        }}
      >
        {label} <span className="btv-caret">▾</span>
      </button>
      {open && (
        <div className="btv-menu-list" onMouseDown={(e) => e.preventDefault()}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const selection = useStore((s) => s.selection);
  const filters = useStore((s) => s.filters);
  const sort = useStore((s) => s.sort);
  const clearFilters = useStore((s) => s.clearFilters);

  const doCopy = (format: CopyFormat) => {
    const cols = useStore.getState().columns;
    const map = useStore.getState().rows;
    const text = buildCopyText(format, {
      selection,
      columns: cols,
      getCell: (r, c) => map.get(r)?.[c] ?? undefined,
    });
    send({ kind: "copy", format, text });
  };

  const doExport = (format: ExportFormat, scope: ExportScope) => {
    send({
      kind: "export",
      format,
      scope,
      selection: scope === "selection" ? selection : undefined,
      sort,
      filters,
    });
  };

  const hasSelection = selection.length > 0;

  return (
    <div className="btv-toolbar">
      <DropMenu label={l10n("Copy")}>
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doCopy("plain")}
        >
          {l10n("Copy")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doCopy("with-headers")}
        >
          {l10n("Copy with headers")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          onClick={() => doCopy("headers-only")}
        >
          {l10n("Copy headers only")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doCopy("csv")}
        >
          {l10n("Copy as CSV")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doCopy("json")}
        >
          {l10n("Copy as JSON")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doCopy("tsv")}
        >
          {l10n("Copy as TSV")}
        </button>
      </DropMenu>

      <DropMenu label={l10n("Export")}>
        <button
          type="button"
          className="btv-menu-item"
          onClick={() => doExport("csv", "all")}
        >
          {l10n("All rows as CSV")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          onClick={() => doExport("json", "all")}
        >
          {l10n("All rows as JSON")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          onClick={() => doExport("xlsx", "all")}
        >
          {l10n("All rows as Excel")}
        </button>
        <div className="btv-menu-sep" />
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doExport("csv", "selection")}
        >
          {l10n("Selection as CSV")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doExport("json", "selection")}
        >
          {l10n("Selection as JSON")}
        </button>
        <button
          type="button"
          className="btv-menu-item"
          disabled={!hasSelection}
          onClick={() => doExport("xlsx", "selection")}
        >
          {l10n("Selection as Excel")}
        </button>
      </DropMenu>

      {filters.length > 0 && (
        <button
          type="button"
          className="btv-btn"
          onClick={clearFilters}
          title={l10n("Clear all filters")}
        >
          {l10n("Clear filters")} ({filters.length})
        </button>
      )}
    </div>
  );
}
