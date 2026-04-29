# Manual smoke-test plan

I cannot run these — you have the only SAS server. Walk through them in
the Extension Development Host and tick each off.

## Set-up

1. From the repo root: `npm install` (needs Node ≥ 18 and npm ≥ 10).
2. `npm run compile` — should exit cleanly with three subprocesses
   (`node`, `browser`, `static`).
3. Open the repo in VS Code, **uninstall the official `sas.sas-lsp`
   extension** if present (we register the same `SAS` auth provider id),
   then press F5 to launch an Extension Development Host.
4. In the host window, open the SAS Libraries panel and connect to your
   server using an existing profile.

## 1 — Open a small table (≈ 20 rows)

- [ ] Click a table in the Libraries tree.
- [ ] A new editor tab opens with the table title in the tab strip.
- [ ] Toolbar shows **Copy ▾** and **Export ▾** menus.
- [ ] Row-number gutter is on the left, frozen during horizontal scroll.
- [ ] Status bar shows `<n> rows`, no filter count, no selection stats.
- [ ] Numeric columns are right-aligned, `NULL` cells render in italic
      muted colour.

## 2 — Pagination on a large table (≥ 5 000 rows)

- [ ] Initial render is fast — the grid fills with placeholders, real
      values stream in within ~1 second.
- [ ] Scrolling to the middle of the table fetches the new pages
      without freezing.
- [ ] Scrolling back to the top shows cells already populated (cache
      hit).
- [ ] Status bar row count matches `proc sql; select count(1) ...`.

## 3 — Sort

- [ ] Click a column header. A `▲` indicator appears.
- [ ] Click again — `▼`.
- [ ] Click again — indicator clears, original order is restored.
- [ ] Click a *different* column header — sort moves to that column
      (single-column sort, like mssql).

## 4 — Filter

- [ ] Click the funnel icon in a column header. A popup appears with a
      search box, a checkbox list of distinct loaded values, and a
      free-form `WHERE expression` slot.
- [ ] Untick a few values, click **Apply**. Grid refreshes with fewer
      rows; status bar shows `<m> rows · 1 filters`.
- [ ] Click the funnel icon again — the previous selections persist.
- [ ] Type an expression like `age > 30` in the WHERE slot and Apply —
      grid updates accordingly.
- [ ] Click **Clear filters** in the toolbar — full table returns.

## 5 — Multi-cell selection

- [ ] Click a single cell — only that cell highlights.
- [ ] Shift-click another cell — a rectangle from anchor to target
      highlights.
- [ ] Ctrl/Cmd-click a cell outside the rectangle — that cell is added
      to the selection (mssql-style discontiguous selection).
- [ ] Click a row number — the entire data row highlights.
- [ ] Status bar shows selected cell count, distinct count, null count;
      if any selected column is numeric and all selected cells are
      numeric, also shows sum / avg / min / max.

## 6 — Copy variants

For each, paste into a scratch text file and confirm shape:

- [ ] **Ctrl+C** — tab-separated, no headers.
- [ ] **Toolbar → Copy** — same as Ctrl+C.
- [ ] **Toolbar → Copy with headers** — first line is the column
      headers.
- [ ] **Toolbar → Copy headers only** — only the column headers
      (regardless of selection).
- [ ] **Toolbar → Copy as CSV** — RFC-4180 quoting, comma-separated.
- [ ] **Toolbar → Copy as JSON** — array of objects keyed by column
      name.
- [ ] **Toolbar → Copy as TSV** — tab-separated with header row.

## 7 — Export

- [ ] **Toolbar → Export → All rows as CSV** — save dialog opens with
      `<library>.<table>.csv` default name; saved file matches a
      reference export from `proc export`.
- [ ] **All rows as JSON** — file is a valid JSON array.
- [ ] **All rows as Excel** — opens in Excel/LibreOffice with one
      header row and the data rows.
- [ ] **Selection as CSV / JSON / Excel** — only the selected
      rectangles are written; cells outside the selection are blank.
- [ ] Sorting and filtering before export is reflected in the export.

## 8 — Cell detail panel

- [ ] Double-click any cell — a panel slides in from the right with
      the column name + row number in the header, full untruncated
      value in the body.
- [ ] If the value parses as JSON, it shows pretty-printed with a JSON
      badge.
- [ ] If the value is XML, it shows pretty-printed with an XML badge.
- [ ] Click the `×` to close.

## 9 — Theme

- [ ] Open `Color Theme` (Ctrl+K Ctrl+T) and pick a dark theme —
      grid colours follow.
- [ ] Pick a high-contrast theme — borders thicken, contrasts honoured.
- [ ] Pick a light theme — colours invert.

## 10 — Error handling

- [ ] Disconnect from the server in the middle of a scroll — an error
      strip appears in the status bar with a × close button. Closing it
      clears it.
- [ ] Apply a deliberately malformed WHERE expression
      (`age >>>>> 30`) — error appears in status bar; grid does not
      crash.

## Known deferred items (NOT bugs to file)

- ITC connection: filter expressions are sent to the PowerShell runner
  but the runner script itself does not yet apply them. Untested
  pending PowerShell-side support.
- Drag-rectangle selection: shift-click and ctrl-click work, but
  drag-to-extend is not yet implemented (single click then shift-click
  is the workaround).
- Column reorder by drag: not yet implemented.
