import * as vscode from 'vscode';
import { ChartPanel } from './panel';
import { HistoryStore, Snapshot } from './historyStore';
import { StatusBar } from './statusBar';
import { fetchBalance, pickBalanceInfo } from './balanceClient';
import { getPanelConfig, getPollIntervalMinutes } from './config';

const API_KEY_SECRET = 'deepseekStats.apiKey';

let timer: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new HistoryStore(context.globalState);
  const statusBar = new StatusBar();
  let chart: ChartPanel | undefined;
  let apiKey: string | undefined = (await context.secrets.get(API_KEY_SECRET)) || undefined;
  let checking = false;

  // 图表面板懒创建：只有用户执行“打开余额图表”时才创建，避免启动时弹出标签页
  function handleWebviewMessage(msg: any): void {
    if (!msg || !msg.type) return;
    if (msg.type === 'setApiKey') {
      void vscode.commands.executeCommand('deepseek-stats.setApiKey');
    } else if (msg.type === 'clearApiKey') {
      void vscode.commands.executeCommand('deepseek-stats.clearApiKey');
    } else if (msg.type === 'clearHistory') {
      void vscode.commands.executeCommand('deepseek-stats.clearHistory');
    } else if (msg.type === 'resetSettings') {
      void resetSettings();
    } else if (msg.type === 'openUsage') {
      void vscode.env.openExternal(vscode.Uri.parse('https://platform.deepseek.com/usage'));
    } else if (msg.type === 'updateSetting') {
      void updateSetting(msg.payload?.key, msg.payload?.value);
    } else if (msg.type === 'ready') {
      // Webview 就绪后补发一次数据，避免启动时消息丢失
      pushDataToPanel();
    } else if (msg.type === 'checkNow') {
      void checkNow();
    }
  }

  function getChart(): ChartPanel {
    if (!chart || !chart.alive) {
      chart = ChartPanel.create(context.extensionUri);
      chart.onDidReceiveMessage = handleWebviewMessage;
    }
    return chart;
  }

  function pushDataToPanel(): void {
    if (chart && chart.alive) {
      chart.postData(store, getPanelConfig(), !!apiKey);
    }
  }

  /** 由设置面板写入某个 deepseekStats 配置项。 */
  async function updateSetting(key: string, value: unknown): Promise<void> {
    if (!key) return;
    try {
      await vscode.workspace
        .getConfiguration('deepseekStats')
        .update(key, value, vscode.ConfigurationTarget.Global);
    } catch (e) {
      console.error('[deepseek-stats] 更新设置失败', e);
    }
  }

  /** 恢复 DeepSeek Stats 全部配置为默认值。 */
  async function resetSettings(): Promise<void> {
    const pick = await vscode.window.showWarningMessage(
      '确定恢复 DeepSeek Stats 全部设置为默认值？',
      { modal: true },
      '恢复'
    );
    if (pick !== '恢复') return;
    const cfg = vscode.workspace.getConfiguration('deepseekStats');
    const keys = [
      'pollIntervalMinutes',
      'statusBar.show',
      'statusBar.defaultColor',
      'statusBar.thresholds',
      'history.rawRetentionDays',
    ];
    for (const k of keys) {
      await cfg.update(k, undefined, vscode.ConfigurationTarget.Global);
    }
    pushDataToPanel();
    vscode.window.showInformationMessage('DeepSeek Stats 设置已恢复默认');
  }

  async function checkNow(): Promise<void> {
    if (checking) return;
    checking = true;
    try {
      const key = apiKey || process.env.DEEPSEEK_API_KEY;
      if (!key) {
        statusBar.showNoKey();
        if (chart && chart.alive) {
          chart.postError('未配置 API Key，请运行命令 “DeepSeek Stats: 设置 API Key”');
        }
        return;
      }
      const res = await fetchBalance(key);
      const info = pickBalanceInfo(res);
      if (!info) {
        throw new Error('接口返回中没有余额数据');
      }
      const snap: Snapshot = {
        t: Date.now(),
        total: Number(info.total_balance) || 0,
        toppedUp: Number(info.topped_up_balance) || 0,
        granted: Number(info.granted_balance) || 0,
        currency: info.currency || 'CNY',
        available: !!res.is_available,
      };
      store.append(snap);
      statusBar.update(snap);
      if (chart && chart.alive) chart.postSnapshot(snap);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusBar.showError(msg);
      if (chart && chart.alive) chart.postError(msg);
    } finally {
      checking = false;
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    const minutes = getPollIntervalMinutes();
    timer = setTimeout(() => {
      void checkNow().finally(schedule);
    }, minutes * 60_000);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek-stats.openChart', () => {
      getChart().show();
      pushDataToPanel();
    }),
    vscode.commands.registerCommand('deepseek-stats.checkNow', checkNow),
    vscode.commands.registerCommand('deepseek-stats.setApiKey', async () => {
      const value = await vscode.window.showInputBox({
        prompt: '输入 DeepSeek API Key（sk-...）',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'sk-...',
      });
      if (!value || !value.trim()) return;
      const key = value.trim();
      await context.secrets.store(API_KEY_SECRET, key);
      apiKey = key;
      await checkNow();
      pushDataToPanel();
      vscode.window.showInformationMessage('DeepSeek API Key 已保存');
    }),
    vscode.commands.registerCommand('deepseek-stats.clearApiKey', async () => {
      await context.secrets.delete(API_KEY_SECRET);
      apiKey = undefined;
      statusBar.showNoKey();
      pushDataToPanel();
      vscode.window.showInformationMessage('DeepSeek API Key 已清除');
    }),
    vscode.commands.registerCommand('deepseek-stats.clearHistory', async () => {
      const pick = await vscode.window.showWarningMessage(
        '确定清除所有历史余额记录？此操作不可撤销。',
        { modal: true },
        '清除'
      );
      if (pick === '清除') {
        store.clear();
        pushDataToPanel();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('deepseekStats')) return;
      if (e.affectsConfiguration('deepseekStats.pollIntervalMinutes')) {
        schedule();
      }
      if (e.affectsConfiguration('deepseekStats.statusBar')) {
        statusBar.refresh();
      }
      if (chart && chart.alive) {
        chart.postConfig(getPanelConfig());
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (chart && chart.alive) chart.postTheme();
    }),
    statusBar
  );

  statusBar.showLoading();
  await checkNow();
  schedule();
}

export function deactivate(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
