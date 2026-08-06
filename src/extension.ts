import * as vscode from 'vscode';
import { ChartPanel } from './panel';
import { HistoryStore, Snapshot } from './historyStore';
import { StatusBar } from './statusBar';
import { fetchBalance, pickBalanceInfo } from './balanceClient';
import { getPanelConfig, getPollIntervalMinutes } from './config';

/** DeepSeek 官方状态页地址。 */
const STATUS_PAGE_URL = 'https://status.deepseek.com/';

const API_KEY_SECRET = 'deepseekStats.apiKey';
/** 图表 UI 设置（webview 本地，存 globalState，非 VS Code 设置）：Y 轴最小跨度比例默认值。 */
const DEFAULT_Y_MIN_SPAN_RATIO = 0.2;
const Y_MIN_SPAN_RATIO_KEY = 'chartUi.yMinSpanRatio';

function clampRatio(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_Y_MIN_SPAN_RATIO;
  return Math.min(1, Math.max(0, n));
}

/** 合法 6 位十六进制颜色（如 #ffb900）；空串表示“跟随主题/主色”。 */
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

interface SaveSettingsPayload {
  statusBarShow: boolean;
  defaultColor: string;
  thresholds: { below: number; color: string }[];
  pollMinutes: number;
  rawRetentionDays: number;
  showTodaySpend: boolean;
  connectorStyle: 'dashed' | 'solid' | 'none';
  connectorColor: string;
  lineStyle: 'straight' | 'smooth';
  dayBoundary: 'local' | 'utc';
}

/**
 * 校验并净化来自 webview 的 saveSettings payload（纵深防御）。
 * 非法结构返回 null；字段级非法值回退默认，杜绝 NaN/畸形颜色写入配置。
 */
function sanitizeSavePayload(p: unknown): SaveSettingsPayload | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const validColor = (c: unknown): string =>
    typeof c === 'string' && COLOR_RE.test(c) ? c : '';
  const num = (v: unknown, def: number, min: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? n : def;
  };
  const thresholds = Array.isArray(o.thresholds)
    ? o.thresholds
        .filter(
          (t): t is { below: unknown; color: unknown } =>
            !!t &&
            typeof t === 'object' &&
            Number.isFinite(Number((t as { below: unknown }).below)) &&
            typeof (t as { color: unknown }).color === 'string' &&
            COLOR_RE.test((t as { color: unknown }).color as string)
        )
        .map((t) => ({ below: Number(t.below), color: t.color as string }))
        .sort((a, b) => a.below - b.below)
    : [];
  const connectorStyle =
    o.connectorStyle === 'solid' || o.connectorStyle === 'none' ? o.connectorStyle : 'dashed';
  const lineStyle = o.lineStyle === 'smooth' ? 'smooth' : 'straight';
  return {
    statusBarShow: !!o.statusBarShow,
    defaultColor: validColor(o.defaultColor),
    thresholds,
    pollMinutes: num(o.pollMinutes, 1, 1),
    rawRetentionDays: num(o.rawRetentionDays, 7, 1),
    showTodaySpend: !!o.showTodaySpend,
    connectorStyle,
    connectorColor: validColor(o.connectorColor),
    lineStyle,
    dayBoundary: o.dayBoundary === 'utc' ? 'utc' : 'local',
  };
}

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
    } else if (msg.type === 'saveSettings') {
      const sanitized = sanitizeSavePayload(msg.payload);
      if (sanitized) {
        void saveSettings(sanitized);
      } else {
        console.warn('[deepseek-stats] 收到非法 saveSettings 消息，已忽略');
      }
    } else if (msg.type === 'setYMinSpanRatio') {
      void context.globalState.update(Y_MIN_SPAN_RATIO_KEY, clampRatio(msg.payload?.ratio));
    } else if (msg.type === 'openNativeSettings') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'deepseek-stats');
    } else if (msg.type === 'ready') {
      // Webview 就绪后补发一次数据，避免启动时消息丢失
      pushDataToPanel();
    } else if (msg.type === 'checkNow') {
      void checkNow();
    } else if (msg.type === 'openStatusPage') {
      void vscode.env.openExternal(vscode.Uri.parse(STATUS_PAGE_URL));
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
      chart.postData(
        store,
        getPanelConfig(),
        !!apiKey,
        context.globalState.get<number>(Y_MIN_SPAN_RATIO_KEY, DEFAULT_Y_MIN_SPAN_RATIO)
      );
    }
  }

  /** 由设置面板「保存」时统一写入全部 deepseek-stats 配置项。 */
  async function saveSettings(p: SaveSettingsPayload): Promise<void> {
    if (!p) return;
    // 并行提交全部配置项；单项失败不中断其余项（避免"保存了一半"）
    const cfg = vscode.workspace.getConfiguration('deepseek-stats');
    const results = await Promise.allSettled([
      cfg.update('statusBar.show', p.statusBarShow, vscode.ConfigurationTarget.Global),
      cfg.update('statusBar.defaultColor', p.defaultColor, vscode.ConfigurationTarget.Global),
      cfg.update('statusBar.thresholds', p.thresholds, vscode.ConfigurationTarget.Global),
      cfg.update('pollIntervalMinutes', p.pollMinutes, vscode.ConfigurationTarget.Global),
      cfg.update(
        'history.rawRetentionDays',
        p.rawRetentionDays,
        vscode.ConfigurationTarget.Global
      ),
      cfg.update('showTodaySpend', p.showTodaySpend, vscode.ConfigurationTarget.Global),
      cfg.update(
        'chart.connectorStyle',
        p.connectorStyle,
        vscode.ConfigurationTarget.Global
      ),
      cfg.update(
        'chart.connectorColor',
        p.connectorColor,
        vscode.ConfigurationTarget.Global
      ),
      cfg.update('chart.lineStyle', p.lineStyle, vscode.ConfigurationTarget.Global),
      cfg.update('dayBoundary', p.dayBoundary, vscode.ConfigurationTarget.Global),
    ]);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error('[deepseek-stats] 保存设置失败', failed.length, '项');
      void vscode.window.showWarningMessage('部分设置保存失败，请检查配置值后重试');
    }
  }

  async function resetSettings(): Promise<void> {
    const pick = await vscode.window.showWarningMessage(
      '确定恢复 DeepSeek Stats 全部设置为默认值？',
      { modal: true },
      '恢复'
    );
    if (pick !== '恢复') return;
    const cfg = vscode.workspace.getConfiguration('deepseek-stats');
    const keys = [
      'pollIntervalMinutes',
      'statusBar.show',
      'statusBar.defaultColor',
      'statusBar.thresholds',
      'history.rawRetentionDays',
      'showTodaySpend',
      'chart.connectorStyle',
      'chart.connectorColor',
      'chart.lineStyle',
      'dayBoundary',
    ];
    // 并行恢复，单项失败不中断其余项
    const results = await Promise.allSettled(
      keys.map((k) => cfg.update(k, undefined, vscode.ConfigurationTarget.Global))
    );
    await context.globalState.update(Y_MIN_SPAN_RATIO_KEY, undefined);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error('[deepseek-stats] 恢复默认设置失败', failed.length, '项');
    }
    pushDataToPanel();
    if (chart && chart.alive) chart.postSettingsReset();
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
    vscode.commands.registerCommand('deepseek-stats.toggleStatusBar', async () => {
      const cfg = vscode.workspace.getConfiguration('deepseek-stats');
      const current = cfg.get<boolean>('statusBar.show', true);
      await cfg.update('statusBar.show', !current, vscode.ConfigurationTarget.Global);
    }),
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
      if (!e.affectsConfiguration('deepseek-stats')) return;
      if (e.affectsConfiguration('deepseek-stats.pollIntervalMinutes')) {
        schedule();
      }
      if (e.affectsConfiguration('deepseek-stats.statusBar')) {
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
