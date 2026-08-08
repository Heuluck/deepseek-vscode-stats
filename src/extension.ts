import * as vscode from 'vscode';
import { ChartPanel } from './panel';
import { HistoryStore, Snapshot } from './historyStore';
import { StatusBar } from './statusBar';
import { fetchBalance, isInvalidKeyError, pickBalanceInfos } from './balanceClient';
import type { BalanceResponse } from './balanceClient';
import { getPanelConfig, getPollIntervalMinutes } from './config';
import { getLocale, t } from './i18n';

/** DeepSeek 官方状态页地址。 */
const STATUS_PAGE_URL = 'https://status.deepseek.com/';

const API_KEY_SECRET = 'deepseekStats.apiKey';
/** 图表 UI 设置（webview 本地，存 globalState，非 VS Code 设置）：Y 轴最小跨度比例默认值。 */
const DEFAULT_Y_MIN_SPAN_RATIO = 0.2;
const Y_MIN_SPAN_RATIO_KEY = 'chartUi.yMinSpanRatio';
/** 图表模式（webview 本地，存 globalState）：默认消耗柱状图。 */
type ChartMode = 'balance' | 'spend';
const DEFAULT_CHART_MODE: ChartMode = 'spend';
const CHART_MODE_KEY = 'chartUi.mode';
/** 消耗面板「估算」一次性提示是否已确认（webview 本地，存 globalState）。 */
const SPEND_WARNING_SEEN_KEY = 'chartUi.spendWarningSeen';

function clampRatio(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_Y_MIN_SPAN_RATIO;
  return Math.min(1, Math.max(0, n));
}

function sanitizeChartMode(v: unknown): ChartMode {
  return v === 'balance' ? 'balance' : DEFAULT_CHART_MODE;
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
  connectorStyle: 'dashed' | 'dotted' | 'solid' | 'ignore' | 'none';
  connectorColor: string;
  lineStyle: 'straight' | 'smooth';
  dayBoundary: 'local' | 'utc';
  language: 'auto' | 'en' | 'zh-cn';
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
    o.connectorStyle === 'dotted' ||
    o.connectorStyle === 'solid' ||
    o.connectorStyle === 'ignore' ||
    o.connectorStyle === 'none'
      ? o.connectorStyle
      : 'dashed';
  const lineStyle = o.lineStyle === 'smooth' ? 'smooth' : 'straight';
  const language =
    o.language === 'en' || o.language === 'zh-cn' || o.language === 'auto' ? o.language : 'auto';
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
    language,
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
    } else if (msg.type === 'setChartMode') {
      void context.globalState.update(CHART_MODE_KEY, sanitizeChartMode(msg.payload?.mode));
    } else if (msg.type === 'setSpendWarningSeen') {
      void context.globalState.update(SPEND_WARNING_SEEN_KEY, true);
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
        context.globalState.get<number>(Y_MIN_SPAN_RATIO_KEY, DEFAULT_Y_MIN_SPAN_RATIO),
        context.globalState.get<ChartMode>(CHART_MODE_KEY, DEFAULT_CHART_MODE),
        context.globalState.get<boolean>(SPEND_WARNING_SEEN_KEY, false)
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
      cfg.update('language', p.language, vscode.ConfigurationTarget.Global),
    ]);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error('[deepseek-stats] 保存设置失败', failed.length, '项');
      void vscode.window.showWarningMessage(t('extension.saveSettingsFailed'));
    }
  }

  async function resetSettings(): Promise<void> {
    const pick = await vscode.window.showWarningMessage(
      t('extension.resetConfirm'),
      { modal: true },
      t('extension.resetConfirmAction')
    );
    if (pick !== t('extension.resetConfirmAction')) return;
    const cfg = vscode.workspace.getConfiguration('deepseek-stats');
    const keys = [
      'language',
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
    await context.globalState.update(CHART_MODE_KEY, undefined);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error('[deepseek-stats] 恢复默认设置失败', failed.length, '项');
    }
    pushDataToPanel();
    if (chart && chart.alive) chart.postSettingsReset();
    vscode.window.showInformationMessage(t('extension.resetDone'));
  }

  /** 用一次成功的余额响应更新 store/状态栏/webview（checkNow 与 setApiKey 校验共用，避免重复请求）。 */
  function recordBalance(res: BalanceResponse): void {
    const infos = pickBalanceInfos(res);
    if (!infos.length) {
      throw new Error(t('extension.noBalanceData'));
    }
    // 多币种：每个币种各采集一条快照（CNY 优先作为主账户，其余并列）
    const snaps: Snapshot[] = infos.map((info) => ({
      t: Date.now(),
      total: Number(info.total_balance) || 0,
      toppedUp: Number(info.topped_up_balance) || 0,
      granted: Number(info.granted_balance) || 0,
      currency: info.currency || 'CNY',
      available: !!res.is_available,
    }));
    store.appendMany(snaps);
    statusBar.update(snaps);
    if (chart && chart.alive) chart.postSnapshots(snaps);
  }

  async function checkNow(): Promise<void> {
    if (checking) return;
    checking = true;
    try {
      const key = apiKey || process.env.DEEPSEEK_API_KEY;
      if (!key) {
        statusBar.showNoKey();
        if (chart && chart.alive) {
          chart.postError(t('extension.noApiKey'));
        }
        return;
      }
      recordBalance(await fetchBalance(key));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // API Key 无效（401）切换到「点击重新设置」的橙三角状态，其余错误保持普通报错
      if (isInvalidKeyError(err)) {
        statusBar.showInvalidKey(msg);
      } else {
        statusBar.showError(msg);
      }
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
        prompt: t('extension.apiKeyPrompt'),
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'sk-...',
      });
      if (!value || !value.trim()) return;
      const key = value.trim();

      // 先校验、后保存：用真实余额接口验证 key（DeepSeek 无独立校验端点），通过才落盘
      let res: BalanceResponse;
      try {
        res = await fetchBalance(key);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isInvalidKeyError(err)) {
          // 401：key 确定无效 → 不保存，弹错 + 状态栏橙三角
          statusBar.showInvalidKey(msg);
          if (chart && chart.alive) chart.postError(msg);
          void vscode.window.showErrorMessage(t('extension.apiKeyInvalid', { detail: msg }));
          return;
        }
        // 网络/服务异常：key 可能有效，交由用户决定
        const choice = await vscode.window.showErrorMessage(
          t('extension.apiKeyVerifyFailed', { detail: msg }),
          t('extension.apiKeyRetry'),
          t('extension.apiKeySaveAnyway')
        );
        if (choice === t('extension.apiKeyRetry')) {
          void vscode.commands.executeCommand('deepseek-stats.setApiKey');
          return;
        }
        if (choice !== t('extension.apiKeySaveAnyway')) return;
        // 用户选择「仍要保存」：落盘即可，真实状态由后续轮询自然反映
        await context.secrets.store(API_KEY_SECRET, key);
        apiKey = key;
        pushDataToPanel();
        return;
      }

      // 切换账号且已有历史数据：询问是否继承（避免不同账号数据混在一起）
      const prevKey = apiKey;
      const hasHistory = store.getSnapshots().length > 0 || store.getDaily().length > 0;
      if (prevKey !== undefined && key !== prevKey && hasHistory) {
        const pick = await vscode.window.showWarningMessage(
          t('extension.apiKeySwitchConfirm'),
          { modal: true },
          t('extension.apiKeyInheritData'),
          t('extension.apiKeyFreshStart')
        );
        if (pick === undefined) return; // 取消设置，不保存新 key
        if (pick === t('extension.apiKeyFreshStart')) store.clear();
      }

      await context.secrets.store(API_KEY_SECRET, key);
      apiKey = key;
      try {
        // 校验已拿到结果，直接更新，避免二次请求
        recordBalance(res);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        statusBar.showError(msg);
        if (chart && chart.alive) chart.postError(msg);
      }
      pushDataToPanel();
      vscode.window.showInformationMessage(t('extension.apiKeySaved'));
    }),
    vscode.commands.registerCommand('deepseek-stats.clearApiKey', async () => {
      await context.secrets.delete(API_KEY_SECRET);
      apiKey = undefined;
      statusBar.showNoKey();
      pushDataToPanel();
      vscode.window.showInformationMessage(t('extension.apiKeyCleared'));
    }),
    vscode.commands.registerCommand('deepseek-stats.clearHistory', async () => {
      const pick = await vscode.window.showWarningMessage(
        t('extension.clearHistoryConfirm'),
        { modal: true },
        t('extension.clearHistoryAction')
      );
      if (pick === t('extension.clearHistoryAction')) {
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
      // 语言设置变更：热更新 webview（locale 驱动其重渲染）+ 刷新状态栏文案
      if (e.affectsConfiguration('deepseek-stats.language')) {
        if (chart && chart.alive) chart.postLocale(getLocale());
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
