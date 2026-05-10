// Copyright © 2023, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { Disposable, Uri, ViewColumn, WebviewPanel, window } from "vscode";

export class WebViewManager {
  public panels: Record<string, WebView> = {};

  public render(webview: WebView, uid: string, forceReRender: boolean = false) {
    if (this.panels[uid]) {
      if (forceReRender) {
        this.panels[uid] = webview
          .withPanel(this.panels[uid].getPanel())
          .render();
      }
      this.panels[uid].display();
      return;
    }

    const panel = window.createWebviewPanel("webView", uid, ViewColumn.One, {
      enableScripts: true,
    });

    webview.onDispose = () => delete this.panels[uid];
    this.panels[uid] = webview.withPanel(panel).render();
  }
}

export abstract class WebView {
  protected panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private _onDispose: () => void;

  public constructor(
    protected readonly extensionUri: Uri,
    protected readonly title: string,
  ) {}

  set onDispose(disposeCallback: () => void) {
    this._onDispose = disposeCallback;
  }

  abstract body(): string;
  abstract l10nMessages?(): Record<string, string>;
  abstract scripts?(): string[];
  abstract styles?(): string[];
  public render(): WebView {
    const policies = [
      `default-src 'none';`,
      `font-src ${this.panel.webview.cspSource} data:;`,
      `img-src ${this.panel.webview.cspSource} data:;`,
      `script-src ${this.panel.webview.cspSource};`,
      `style-src ${this.panel.webview.cspSource};`,
    ];
    const styles = (this?.styles() || [])
      .map(
        (style) =>
          `<link rel="stylesheet" href="${this.webviewUri(
            this.extensionUri,
            style,
          )}">`,
      )
      .join("");
    const scripts = (this?.scripts() || [])
      .map(
        (script) =>
          `<script type="module" src="${this.webviewUri(
            this.extensionUri,
            script,
          )}"></script>`,
      )
      .join("");

    // The l10n bundle ships as a body attribute. JSON values can contain
    // any of `& ' " < >`, so we HTML-escape the serialised JSON before
    // embedding it; `dataset.l10n` returns the decoded string which is
    // again valid JSON. Without this, translations like the French
    // "Erreur d'exécution" broke out of the single-quoted attribute.
    const l10nJson = JSON.stringify(
      this.l10nMessages ? this.l10nMessages() : {},
    );
    const l10nAttr = escapeHtmlAttr(l10nJson);

    this.panel.webview.html = `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="${policies.join(
            " ",
          )}" />
          ${styles}
          <title>${this.title}</title>
        </head>
        <body data-l10n="${l10nAttr}">
          ${this.body()}
          ${scripts}
        </body>
      </html>`;

    return this;
  }

  abstract processMessage(event: unknown): void;

  public withPanel(webviewPanel: WebviewPanel): WebView {
    this.panel = webviewPanel;
    this.panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this.panel.webview.onDidReceiveMessage(this.processMessage.bind(this));

    return this;
  }

  public getPanel() {
    return this.panel;
  }

  public dispose() {
    this.panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
    this._onDispose && this._onDispose();
  }

  public display() {
    this.panel.reveal(ViewColumn.One);
  }

  public webviewUri(extensionUri: Uri, name: string): Uri {
    return this.panel.webview.asWebviewUri(
      Uri.joinPath(extensionUri, "client", "dist", "webview", name),
    );
  }
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
