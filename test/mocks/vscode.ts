// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Hand-rolled stub for the `vscode` module so unit tests can import
// extension-host code without a live Extension Development Host. The
// real module is only resolvable from within VS Code itself.
//
// This file exposes ONLY the surface our code actually touches. If a
// new test needs additional API, extend it here rather than dropping
// to a partial type cast.

import { EventEmitter as NodeEventEmitter } from "node:events";

// --------------------------------------------------------------------------
// Uri
// --------------------------------------------------------------------------

export class Uri {
  public readonly scheme: string;
  public readonly path: string;
  public readonly fsPath: string;
  public readonly fragment: string;
  public readonly query: string;
  public readonly authority: string;

  private constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
    this.fsPath = path;
    this.fragment = "";
    this.query = "";
    this.authority = "";
  }

  public static file(p: string): Uri {
    return new Uri("file", p);
  }
  public static parse(s: string): Uri {
    const m = s.match(/^([a-z]+):\/\/(.*)$/i);
    return m ? new Uri(m[1], "/" + m[2]) : new Uri("file", s);
  }
  public static joinPath(base: Uri, ...paths: string[]): Uri {
    return Uri.file([base.fsPath, ...paths].join("/").replace(/\/+/g, "/"));
  }
  public toString(): string {
    return `${this.scheme}://${this.path}`;
  }
  public with(_change: Record<string, string>): Uri {
    return this;
  }
}

// --------------------------------------------------------------------------
// Events / disposables
// --------------------------------------------------------------------------

export interface Disposable {
  dispose(): void;
}

export class EventEmitter<T> {
  private readonly emitter = new NodeEventEmitter();
  private readonly key = "fire";

  public readonly event = (listener: (e: T) => unknown): Disposable => {
    this.emitter.on(this.key, listener);
    return { dispose: () => this.emitter.off(this.key, listener) };
  };

  public fire(data: T): void {
    this.emitter.emit(this.key, data);
  }

  public dispose(): void {
    this.emitter.removeAllListeners();
  }
}

// --------------------------------------------------------------------------
// Webview / panel mocks
// --------------------------------------------------------------------------

export interface WebviewPosted {
  message: unknown;
}

export class FakeWebview {
  public html = "";
  public readonly cspSource = "vscode-webview://test";
  public readonly posted: WebviewPosted[] = [];
  private readonly emitter = new EventEmitter<unknown>();

  public postMessage = (message: unknown): Thenable<boolean> => {
    this.posted.push({ message });
    return Promise.resolve(true);
  };

  public asWebviewUri(uri: Uri): Uri {
    return uri;
  }

  public onDidReceiveMessage = this.emitter.event;
  public _fireMessage(message: unknown): void {
    this.emitter.fire(message);
  }
}

export class FakeWebviewPanel {
  public readonly webview = new FakeWebview();
  public readonly viewType: string;
  public title: string;
  public readonly viewColumn = 1;
  public visible = true;
  private readonly disposeEmitter = new EventEmitter<void>();
  public disposed = false;

  public constructor(viewType: string, title: string) {
    this.viewType = viewType;
    this.title = title;
  }

  public reveal = (_column?: number, _preserveFocus?: boolean): void => {};
  public dispose = (): void => {
    if (!this.disposed) {
      this.disposed = true;
      this.disposeEmitter.fire();
    }
  };
  public onDidDispose = this.disposeEmitter.event;
  public onDidChangeViewState = new EventEmitter<unknown>().event;
}

// --------------------------------------------------------------------------
// Window
// --------------------------------------------------------------------------

let _activeProgressTitle: string | undefined;
const _shownErrorMessages: string[] = [];
const _shownInfoMessages: string[] = [];
const _shownWarnMessages: string[] = [];
let _quickPickAnswer: string | undefined;
let _saveDialogAnswer: Uri | undefined;
let _openDialogAnswer: Uri[] | undefined;

export const window = {
  createWebviewPanel: (
    viewType: string,
    title: string,
    _column: number,
    _options?: unknown,
  ) => new FakeWebviewPanel(viewType, title),
  showErrorMessage: (msg: string) => {
    _shownErrorMessages.push(msg);
    return Promise.resolve(undefined);
  },
  showInformationMessage: (msg: string, ..._items: unknown[]) => {
    _shownInfoMessages.push(msg);
    return Promise.resolve(undefined);
  },
  showWarningMessage: (msg: string, ..._items: unknown[]) => {
    _shownWarnMessages.push(msg);
    return Promise.resolve(undefined);
  },
  showQuickPick: (
    _items: readonly string[] | Thenable<readonly string[]>,
    _options?: unknown,
  ) => Promise.resolve(_quickPickAnswer),
  showSaveDialog: (_options?: unknown) => Promise.resolve(_saveDialogAnswer),
  showOpenDialog: (_options?: unknown) => Promise.resolve(_openDialogAnswer),
  withProgress: <T>(
    options: { title?: string; location?: unknown; cancellable?: boolean },
    task: (progress: unknown, token: unknown) => Thenable<T> | T,
  ): Thenable<T> => {
    _activeProgressTitle = options.title;
    return Promise.resolve(task({ report: () => undefined }, {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => undefined }),
    }));
  },
  registerCustomEditorProvider: (
    _viewType: string,
    _provider: unknown,
    _options?: unknown,
  ): Disposable => ({ dispose: () => undefined }),
  registerWebviewPanelSerializer: (
    _viewType: string,
    _serializer: unknown,
  ): Disposable => ({ dispose: () => undefined }),
};

// Helpers exposed for assertion in tests:
export const __testHooks = {
  shownErrorMessages: _shownErrorMessages,
  shownInfoMessages: _shownInfoMessages,
  shownWarnMessages: _shownWarnMessages,
  setQuickPickAnswer: (v: string | undefined) => {
    _quickPickAnswer = v;
  },
  setSaveDialogAnswer: (v: Uri | undefined) => {
    _saveDialogAnswer = v;
  },
  setOpenDialogAnswer: (v: Uri[] | undefined) => {
    _openDialogAnswer = v;
  },
  lastProgressTitle: () => _activeProgressTitle,
  reset: () => {
    _shownErrorMessages.length = 0;
    _shownInfoMessages.length = 0;
    _shownWarnMessages.length = 0;
    _quickPickAnswer = undefined;
    _saveDialogAnswer = undefined;
    _openDialogAnswer = undefined;
    _activeProgressTitle = undefined;
  },
};

// --------------------------------------------------------------------------
// Workspace, env, commands, l10n
// --------------------------------------------------------------------------

export const workspace = {
  workspaceFolders: undefined as undefined | Array<{ uri: Uri }>,
  onDidChangeConfiguration: () => ({ dispose: () => undefined }),
  registerNotebookSerializer: () => ({ dispose: () => undefined }),
};

export const env = {
  remoteName: undefined as undefined | string,
  clipboard: {
    _last: "",
    writeText(text: string): Promise<void> {
      this._last = text;
      return Promise.resolve();
    },
    readText(): Promise<string> {
      return Promise.resolve(this._last);
    },
  },
};

const _registeredCommands = new Map<
  string,
  (...args: unknown[]) => unknown
>();

export const commands = {
  registerCommand: (
    id: string,
    handler: (...args: unknown[]) => unknown,
  ): Disposable => {
    _registeredCommands.set(id, handler);
    return { dispose: () => _registeredCommands.delete(id) };
  },
  executeCommand: async <T = unknown>(id: string, ...args: unknown[]) => {
    const fn = _registeredCommands.get(id);
    if (!fn) {throw new Error(`Command not registered: ${id}`);}
    return (await fn(...args)) as T;
  },
  registerTextEditorCommand: (
    _id: string,
    _handler: unknown,
  ): Disposable => ({ dispose: () => undefined }),
};

export const __commandHooks = {
  registered: _registeredCommands,
  reset: () => _registeredCommands.clear(),
};

export const l10n = {
  t: (msg: string, args?: Record<string, string | number>): string => {
    if (!args) {return msg;}
    return msg.replace(/\{(\w+)\}/g, (_, k) =>
      args[k] === undefined ? `{${k}}` : String(args[k]),
    );
  },
};

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export class Disposable {
  public static from(...disposables: Disposable[]): Disposable {
    const d = new Disposable(() => {
      for (const x of disposables) {x.dispose();}
    });
    return d;
  }
  public constructor(private readonly fn: () => void) {}
  public dispose(): void {
    this.fn();
  }
}

// Authentication / language services / tasks — registrations only;
// our tests don't drive them.
export const authentication = {
  registerAuthenticationProvider: () => ({ dispose: () => undefined }),
};

export const languages = {
  registerDocumentSemanticTokensProvider: () => ({
    dispose: () => undefined,
  }),
  registerDocumentDropEditProvider: () => ({ dispose: () => undefined }),
};

export const tasks = {
  registerTaskProvider: () => ({ dispose: () => undefined }),
};

// Required types referenced by extension code that we only declare as
// type aliases — none of these are constructed in tests.
export type ExtensionContext = {
  extensionUri: Uri;
  subscriptions: Disposable[];
};
export type WebviewPanel = FakeWebviewPanel;
export type Webview = FakeWebview;
export type CustomDocument = { uri: Uri; dispose: () => void };
export type CustomDocumentOpenContext = unknown;
export type CancellationToken = {
  isCancellationRequested: boolean;
  onCancellationRequested: () => Disposable;
};

export interface CustomReadonlyEditorProvider {
  openCustomDocument(
    uri: Uri,
    ctx: CustomDocumentOpenContext,
    token: CancellationToken,
  ): CustomDocument | Thenable<CustomDocument>;
  resolveCustomEditor(
    document: CustomDocument,
    panel: WebviewPanel,
    token: CancellationToken,
  ): Thenable<void> | void;
}
