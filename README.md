# SAS Better Tables

A fork of the [SAS VS Code extension](https://github.com/sassoftware/vscode-sas-extension)
with the data-table viewer rebuilt to match the look, feel and capabilities
of Microsoft's [mssql VS Code extension](https://github.com/Microsoft/vscode-mssql)
results grid.

Everything else in the original SAS extension — language service, notebook
support, content navigator, profiles, OAuth, syntax — is preserved unchanged.
Two pieces are different from upstream: the table viewer that opens when you
click a dataset in the **Libraries** tree has been replaced, and the same
viewer can now be opened directly on local data files (`.csv`, `.tsv`,
`.xlsx`, `.sas7bdat`) from the file explorer.

## Why a fork?

The upstream SAS extension exposes no public API for its connection adapters
or its `SAS.viewTable` command, so a side-by-side "supplement" extension
cannot intercept the table-open flow. A fork is the only way to ship a
drop-in replacement viewer.

## What's different from upstream

### Table viewer

- **New webview**: virtualised grid built on `react-data-grid`, replacing the
  ag-grid-based viewer.
- **Header sort indicator** with single-column toggle (asc / desc / none).
- **Header filter popup** — checkbox list with search, plus a free-form WHERE
  expression slot for SAS-style filtering.
- **Multi-cell selection** with click+drag, shift-click and ctrl/cmd-click.
- **Copy variants** — plain, with headers, headers only, CSV, JSON, TSV.
- **Export** — CSV, JSON, Excel (.xlsx) of selection, visible window or whole
  table.
- **Selection summary** — row/cell count, sum, avg, min, max, distinct, nulls.
- **Cell detail panel** — for long text / JSON / XML cells (improvement over
  upstream mssql, which only tooltips).
- **Lifted row caps** — REST adapter chunk size raised, ITC adapter chunk
  size raised, server-side sort temp-view leak fixed, ITC filter support
  added.
- **Stale-request cancellation** in the row pump so fast scrolling does not
  flicker.
- **No 60-second hardcoded request timeout.**

### File-explorer integration

The same viewer also opens local data files. Right-click a supported file in
the **Explorer** view and pick **Open in Table Viewer**, or run
`SAS Better Tables: Open in Table Viewer` from the command palette, or
"Reopen with..." → **SAS Better Tables — Table Viewer**.

| Format         | Backed by                                           | Sort & filter        |
|----------------|-----------------------------------------------------|----------------------|
| `.csv`, `.tsv` | RFC-4180 streaming parser, header-row + type sniff  | in-memory predicate  |
| `.xlsx`        | `exceljs`; multi-sheet workbooks prompt for a sheet | in-memory predicate  |
| `.sas7bdat`    | Routed through your active SAS connection: a libname is assigned to the file's directory and the dataset opens through the **same** `LibraryAdapter` and panel as a normal Libraries-tree table | server-side WHERE |

The custom editor is registered at priority `option`, so it never overrides
the built-in handler for `.csv` / `.xlsx`. Use the explorer right-click or
"Reopen with..." menu to launch it explicitly.

#### sas7bdat caveats

- Requires a connected SAS profile (Viya / IOM / COM / SSH). Without one the
  extension surfaces a message inviting you to add a profile.
- The file's *directory* must be readable from the SAS server. A Viya
  connection on a remote server cannot open a sas7bdat that lives only on
  your local machine — the file needs to be on a path the SAS session can
  resolve. ITC and SSH connections to a server you control usually work
  out of the box.

## Installing

This extension uses the same VS Code authentication provider id as the
official SAS extension (`SAS`) so that existing connection profiles and
sessions are picked up. **You must uninstall the official `sas.sas-lsp`
extension before installing this one.** Two extensions cannot register the
same auth provider id.

## Building

```sh
# from the repo root, after `sudo apt install npm`:
npm install
npm run compile
```

The extension's main entry is `client/dist/node/extension.js`. Press F5 in
VS Code with the repo open to launch an Extension Development Host.

## Testing

The test stack has three layers, each with its own runner:

| Layer | Runner | Command | What it covers |
|-------|--------|---------|----------------|
| Unit + component | [Vitest](https://vitest.dev/) (jsdom) | `npm run test:unit` | Pure modules (`webview/*`, `FileTableViewer/*`, host helpers) and React webview components (Toolbar, StatusBar, FilterPopup, HeaderCell, CellDetail, CellView). Sub-second feedback loop. |
| VS Code integration | [@vscode/test-electron](https://github.com/microsoft/vscode-test) (mocha) | `npm run test:vscode` | Real Extension Development Host. Asserts that `SBT.openTableFile` is registered and opens a webview tab against the `cars.csv` fixture. |
| Server (LSP) | mocha + ts-node | `npm run test-server` | Language-server / embedded-language tests from upstream. |

`npm test` runs all three. Coverage is enforced on the unit layer
(80% lines / statements / functions, 75% branches) over the new code in
`client/src/webview/**`, `client/src/panels/DataViewer*.ts`, and
`client/src/components/FileTableViewer/**` — `npm run test:coverage`
produces an HTML report under `coverage/`.

### Test layout

```
test/                            ← Vitest tree (unit + component)
  unit/
    webview/         protocol, copy, selection, formatters, stats,
                     store, pump, messaging, theme
    fileSource/      csvParser, typeInfer, filterEval, inMemorySource,
                     csvSource, xlsxSource, sas7bdatSource
    host/            DataViewerHelpers, DataViewer.processMessage,
                     dispatcher
  components/        React component tests (jsdom + Testing Library)
  fixtures/          cars.csv, quoted.csv, nullable.csv, tabs.tsv,
                     bom.csv (xlsx fixtures are generated at runtime)
  helpers/           fakeAdapter, fakeSession, fakePanel, messaging,
                     store
  mocks/             vscode  — hand-rolled stub of the vscode API
client/test/                     ← @vscode/test-electron tree (mocha)
  fileTableViewer.test.ts        ← integration smoke for SBT.openTableFile
  ... (upstream LSP / connection / notebook tests)
```

The vscode API is stubbed for the unit layer at `test/mocks/vscode.ts`;
Vitest's `resolve.alias` redirects every `import "vscode"` to that
file. Tests that need the real API run in the integration layer.

## Licence

Apache 2.0 — same as upstream. See `LICENSE` for the full text and `NOTICE`
for attribution and provenance.
