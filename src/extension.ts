import * as vscode from 'vscode';
import { ChartPanel } from './panel';
import { HistoryStore, Snapshot } from './historyStore';
import { StatusBar } from './statusBar';
import { fetchBalance, pickBalanceInfo } from './balanceClient';
import { getPollIntervalMinutes } from './config';

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
    if (msg.type === 'apiKeyMenu') {
      void vscode.window
        .showQuickPick(['设置 / 更换 API Key', '清除 API Key'], {
          placeHolder: 'DeepSeek API Key 管理',
        })
        .then((pick) => {
          if (pick === '设置 / 更换 API Key') {
            void vscode.commands.executeCommand('deepseek-stats.setApiKey');
          } else if (pick === '清除 API Key') {
            void vscode.commands.executeCommand('deepseek-stats.clearApiKey');
          }
        });
    } else if (msg.type === 'ready') {
      // Webview 就绪后补发一次数据，避免启动时消息丢失
      pushDataToPanel();
    } else if (msg.type === 'checkNow') {
      void checkNow();
    } else if (msg.type === 'clearHistory') {
      void vscode.commands.executeCommand('deepseek-stats.clearHistory');
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
      chart.postData(store, getPollIntervalMinutes(), !!apiKey);
    }
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
        chart.postConfig(getPollIntervalMinutes());
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
