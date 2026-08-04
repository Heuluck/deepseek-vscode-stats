import * as vscode from 'vscode';
import * as fs from 'fs';
import type { HistoryStore, Snapshot } from './historyStore';
import type { PanelConfig } from './config';

/** 余额趋势图 Webview 面板（单例，重复打开复用）。 */
export class ChartPanel {
  private static current?: ChartPanel;

  private panel?: vscode.WebviewPanel;

  /** 由扩展侧注入，处理来自 Webview 的消息。 */
  onDidReceiveMessage?: (msg: any) => void;

  private constructor(private extUri: vscode.Uri) {}

  static create(extUri: vscode.Uri): ChartPanel {
    if (ChartPanel.current && ChartPanel.current.alive) {
      return ChartPanel.current;
    }
    const inst = new ChartPanel(extUri);
    ChartPanel.current = inst;
    inst.create();
    return inst;
  }

  get alive(): boolean {
    return !!this.panel;
  }

  show(): void {
    this.panel?.reveal(vscode.ViewColumn.One);
  }

  postSnapshot(s: Snapshot): void {
    this.panel?.webview.postMessage({ type: 'snapshot', payload: s });
  }

  postData(store: HistoryStore, config: PanelConfig, hasKey: boolean): void {
    this.panel?.webview.postMessage({
      type: 'init',
      payload: {
        snapshots: store.getSnapshots(),
        daily: store.getDaily(),
        current: store.getLatest() || null,
        config,
        hasKey,
      },
    });
  }

  postConfig(config: PanelConfig): void {
    this.panel?.webview.postMessage({ type: 'config', payload: config });
  }

  postSettingsReset(): void {
    this.panel?.webview.postMessage({ type: 'settingsReset' });
  }

  postTheme(): void {
    this.panel?.webview.postMessage({ type: 'theme' });
  }

  postError(message: string): void {
    this.panel?.webview.postMessage({ type: 'error', payload: { message } });
  }

  private create(): void {
    const panel = vscode.window.createWebviewPanel(
      'deepseekStats.chart',
      'DeepSeek 余额',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extUri, 'media')],
      }
    );
    this.panel = panel;
    panel.webview.html = this.getHtml(panel.webview);
    panel.webview.onDidReceiveMessage((msg) => this.onDidReceiveMessage?.(msg));
    panel.onDidDispose(() => {
      this.panel = undefined;
      if (ChartPanel.current === this) {
        ChartPanel.current = undefined;
      }
    });
  }

  private getHtml(wv: vscode.Webview): string {
    const nonce = getNonce();
    const cssUri = wv.asWebviewUri(vscode.Uri.joinPath(this.extUri, 'media', 'chart.css'));
    const codiconCssUri = wv.asWebviewUri(
      vscode.Uri.joinPath(this.extUri, 'media', 'codicons', 'codicon.css')
    );
    const jsUri = wv.asWebviewUri(vscode.Uri.joinPath(this.extUri, 'media', 'chart.js'));
    const htmlPath = vscode.Uri.joinPath(this.extUri, 'media', 'webview.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
    const csp = [
      `default-src 'none'`,
      `img-src ${wv.cspSource} data:`,
      `style-src ${wv.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${wv.cspSource}`,
    ].join('; ');
    return html
      .replace(/\{\{CSP\}\}/g, csp)
      .replace(/\{\{CODICON_CSS_URI\}\}/g, codiconCssUri.toString())
      .replace(/\{\{CSS_URI\}\}/g, cssUri.toString())
      .replace(/\{\{JS_URI\}\}/g, jsUri.toString())
      .replace(/\{\{NONCE\}\}/g, nonce);
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
