// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Wires the file-backed table sources into VS Code:
//   - dispatches an explorer URI to the right source by extension
//   - opens a `DataViewer` panel with the resulting paginator + columns
//   - registers as a `SubscriptionProvider` so the activation entry can
//     pull our subscriptions alongside the other navigators
//
// Triggers (registered in `package.json`):
//   - command: `SBT.openTableFile` — explorer/context menu, command
//     palette
//   - custom editor: `sbt.tableViewer` — a `CustomReadonlyEditorProvider`
//     gated by a `SBT.tableViewer.useAsCustomEditor` setting so we don't
//     conflict with the user's existing CSV/Excel handlers by default

import {
  CustomDocument,
  CustomReadonlyEditorProvider,
  Disposable,
  ExtensionContext,
  ProgressLocation,
  Uri,
  WebviewPanel,
  commands,
  l10n,
  window,
  workspace,
} from "vscode";

import * as path from "path";

import DataViewer from "../../panels/DataViewer";
import TablePropertiesViewer from "../../panels/TablePropertiesViewer";
import { WebViewManager } from "../../panels/WebviewManager";
import LibraryModel from "../LibraryNavigator/LibraryModel";
import PaginatedResultSet from "../LibraryNavigator/PaginatedResultSet";
import { LibraryItem, TableData } from "../LibraryNavigator/types";
import { SubscriptionProvider } from "../SubscriptionProvider";
import { csvSource } from "./csvSource";
import { sas7bdatSource } from "./sas7bdatSource";
import { xlsxSource } from "./xlsxSource";

/** Extensions we recognise. Exported so the package.json consistency
 *  test can verify the explorer-context menu glob keeps in lockstep. */
export const SUPPORTED = new Set([".csv", ".tsv", ".xlsx", ".sas7bdat"]);

/** Commands the dispatcher registers. Exported for the same reason as
 *  SUPPORTED — the package.json consistency test asserts every
 *  `SBT.*` command declared in `contributes.commands` shows up here. */
export const REGISTERED_COMMANDS: readonly string[] = ["SBT.openTableFile"];

class FileTableViewer implements SubscriptionProvider {
  private readonly webviewManager = new WebViewManager();

  public constructor(private readonly context: ExtensionContext) {}

  public getSubscriptions(): Disposable[] {
    return [
      commands.registerCommand("SBT.openTableFile", (uri?: Uri) =>
        this.openFromCommand(uri),
      ),
      window.registerCustomEditorProvider(
        "sbt.tableViewer",
        new TableViewerCustomEditorProvider(this),
        { supportsMultipleEditorsPerDocument: false, webviewOptions: {} },
      ),
    ];
  }

  /** Public entry point — used by the command and the custom editor. */
  public async open(uri: Uri): Promise<void> {
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!SUPPORTED.has(ext)) {
      void window.showErrorMessage(
        l10n.t("This file type is not supported by the table viewer: {ext}", {
          ext,
        }),
      );
      return;
    }

    try {
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: l10n.t("Opening {name}", { name: path.basename(uri.fsPath) }),
        },
        async () => {
          if (ext === ".sas7bdat") {
            await this.openSas7bdat(uri);
          } else if (ext === ".xlsx") {
            await this.openXlsx(uri);
          } else {
            await this.openCsv(uri);
          }
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void window.showErrorMessage(
        l10n.t("Failed to open table: {msg}", { msg }),
      );
    }
  }

  private async openCsv(uri: Uri): Promise<void> {
    const source = await csvSource(uri.fsPath, `file:${uri.fsPath}`);
    this.openFromInMemory(source);
  }

  private async openXlsx(uri: Uri): Promise<void> {
    const source = await xlsxSource(uri.fsPath, `file:${uri.fsPath}`);
    if (!source) {return;} // user cancelled the sheet picker
    this.openFromInMemory(source);
  }

  private async openSas7bdat(uri: Uri): Promise<void> {
    const handle = await sas7bdatSource(uri.fsPath);
    if (!handle) {return;}

    // Wire a real column-properties handler now that we have the
    // WebViewManager in scope. The synthetic LibraryItem flows into
    // `TablePropertiesViewer` exactly like a normal SAS-library table.
    const loadColumnProperties = (columnName: string) =>
      this.displayTableProperties(handle.item, true, columnName);

    this.webviewManager.render(
      new DataViewer(
        this.context.extensionUri,
        handle.uid,
        handle.paginator,
        handle.fetchColumns,
        loadColumnProperties,
      ),
      handle.uid,
    );
  }

  private openFromInMemory(source: {
    title: string;
    uid: string;
    columns: import("../../connection/rest/api/compute").Column[];
    rowCount: number;
    getRows: import("./types").FileTableSource["getRows"];
  }): void {
    const paginator = new PaginatedResultSet<{
      data: TableData;
      error?: Error;
    }>(async (start, end, sortModel, query) => {
      try {
        return { data: await source.getRows(start, end, sortModel, query) };
      } catch (e) {
        return {
          error: e instanceof Error ? e : new Error(String(e)),
          data: { rows: [], count: 0 },
        };
      }
    });

    this.webviewManager.render(
      new DataViewer(
        this.context.extensionUri,
        source.uid,
        paginator,
        () => source.columns,
        // No column-properties surface for in-memory file sources —
        // there is no SAS dictionary view to show.
        undefined,
      ),
      source.uid,
    );
  }

  private async displayTableProperties(
    item: LibraryItem,
    showPropertiesTab: boolean,
    focusedColumn: string,
  ): Promise<void> {
    // Mirror LibraryNavigator.displayTableProperties: build a fresh
    // model on demand using the active session's adapter. We don't keep
    // a model around because the active connection profile may have
    // changed since the panel was opened.
    try {
      const adapter = await activeAdapter();
      if (!adapter) {return;}
      const model = new LibraryModel(adapter);
      const tableInfo = await model.getTableInfo(item);
      const columns = await model.fetchColumns(item);
      this.webviewManager.render(
        new TablePropertiesViewer(
          this.context.extensionUri,
          item.uid,
          tableInfo,
          columns,
          showPropertiesTab,
          focusedColumn,
        ),
        `properties-${item.uid}`,
        true,
      );
    } catch (e) {
      void window.showErrorMessage(
        l10n.t("Failed to load table properties: {msg}", {
          msg: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  /** Resolve a URI to open from a command invocation. The explorer
   *  context menu passes the URI directly; the command palette form
   *  prompts the user for a file. */
  private async openFromCommand(uri?: Uri): Promise<void> {
    let target = uri;
    if (!target) {
      const picked = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          [l10n.t("Tables")]: ["csv", "tsv", "xlsx", "sas7bdat"],
        },
        defaultUri: workspace.workspaceFolders?.[0].uri,
      });
      if (!picked || picked.length === 0) {return;}
      target = picked[0];
    }
    await this.open(target);
  }
}

async function activeAdapter() {
  const { default: LibraryAdapterFactory } = await import(
    "../LibraryNavigator/LibraryAdapterFactory"
  );
  const { profileConfig } = await import("../../commands/profile");
  const profile = profileConfig.getProfileByName(profileConfig.getActiveProfile());
  if (!profile) {return undefined;}
  return new LibraryAdapterFactory().create(profile.connectionType);
}

class TableViewerCustomEditorProvider
  implements CustomReadonlyEditorProvider
{
  public constructor(private readonly host: FileTableViewer) {}

  public openCustomDocument(uri: Uri): CustomDocument {
    return { uri, dispose: () => undefined };
  }

  public async resolveCustomEditor(
    document: CustomDocument,
    panel: WebviewPanel,
  ): Promise<void> {
    // We host the table viewer in our own WebviewManager-managed panel
    // so all the Copy/Export/View-state plumbing stays unchanged. The
    // tab VS Code created for the custom editor binding is therefore
    // redundant — close it once we've launched ours.
    panel.dispose();
    await this.host.open(document.uri);
  }
}

export default FileTableViewer;
