/** Solid store：单一状态源 + actions（替代 chart.js 的全局 state + 手动 renderXxx）。 */
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import type {
  ChartMode,
  ConnectorStyle,
  DayBoundary,
  InitPayload,
  LineStyle,
  PanelConfig,
  Snapshot,
  Threshold,
  TooltipInfo,
} from './types';
import type { ConsumptionGranularity } from './logic/consumption';
import type { ViewKey, ViewRange, ViewState } from './logic/viewport';
import {
  activeCurrencies,
  mainData,
  onNewData,
  resetViewRange,
  upsertDailyLocal,
  viewPoints,
  VIEWS,
} from './logic/viewport';
import { postMessage, type SaveSettingsPayload } from './messaging';
import { setLocale, t } from './i18n';
import {
  advanceTodaySpendCache,
  buildTodaySpendCache,
  type TodaySpendCache,
} from './logic/todaySpend';

export interface AppState {
  data: InitPayload | null;
  config: PanelConfig | null;
  view: ViewKey;
  rangeKey: string | null;
  viewRange: ViewRange | null;
  followLive: boolean;
  maxWindow: number;
  minWindow: number;
  lastError: string;
  settingsOpen: boolean;
  themeTick: number;
  /** 手动刷新进行中（icon 旋转）。 */
  refreshing: boolean;
  /** 最近一次手动刷新结果（成功/失败），短暂显示后由 clearRefreshFeedback 清除。 */
  refreshResult: 'ok' | 'fail' | null;
  /** 图表 Y 轴最小跨度比例（webview 本地设置，存扩展 globalState；0 = 关闭约束）。 */
  yMinSpanRatio: number;
  /** 图表模式：余额曲线 / 消耗柱状图（webview 本地设置，存扩展 globalState）。 */
  chartMode: ChartMode;
  /** 消耗柱状图粒度（本次会话内有效）。 */
  consGran: ConsumptionGranularity;
  /** 今日花费增量缓存（基准 + 累计充值），跨天自动重建。 */
  todayCache: TodaySpendCache | null;
}

export const [store, setStore] = createStore<AppState>({
  data: null,
  config: null,
  view: 'hourly',
  rangeKey: null,
  viewRange: null,
  followLive: true,
  maxWindow: 0,
  minWindow: 60e3,
  lastError: '',
  settingsOpen: false,
  themeTick: 0,
  refreshing: false,
  refreshResult: null,
  yMinSpanRatio: 0.2,
  chartMode: 'spend',
  consGran: 'hour',
  todayCache: null,
});

/** 悬停信息（高频，独立 signal，避免穿透组件树）。 */
export const [tooltipInfo, setTooltipInfo] = createSignal<TooltipInfo | null>(null);

// ---------- 设置暂存（staged） ----------
/** 设置面板内编辑先进入暂存，点「保存」才统一写入配置；取消/关闭则丢弃。 */
export interface StagedConfig {
  statusBarShow: boolean;
  defaultColor: string;
  thresholds: Threshold[];
  pollMinutes: number;
  rawRetentionDays: number;
  showTodaySpend: boolean;
  connectorStyle: ConnectorStyle;
  connectorColor: string;
  lineStyle: LineStyle;
  dayBoundary: DayBoundary;
}

export function stagedFromConfig(cfg: PanelConfig | null): StagedConfig {
  return cfg
    ? {
        statusBarShow: !!cfg.statusBarShow,
        defaultColor: cfg.defaultColor || '',
        thresholds: (cfg.thresholds || []).map((t) => ({ below: t.below, color: t.color })),
        pollMinutes: cfg.pollMinutes || 1,
        rawRetentionDays: cfg.rawRetentionDays || 7,
        showTodaySpend: !!cfg.showTodaySpend,
        connectorStyle: cfg.connectorStyle || 'dashed',
        connectorColor: cfg.connectorColor || '',
        lineStyle: cfg.lineStyle || 'straight',
        dayBoundary: cfg.dayBoundary || 'local',
      }
    : {
        statusBarShow: true,
        defaultColor: '',
        thresholds: [],
        pollMinutes: 1,
        rawRetentionDays: 7,
        showTodaySpend: false,
        connectorStyle: 'dashed',
        connectorColor: '',
        lineStyle: 'straight',
        dayBoundary: 'local',
      };
}

/** 设置面板打开时的今日花费暂存预览（null = 面板未打开，Header 回退到已保存配置）。 */
export const [spendPreview, setSpendPreview] = createSignal<boolean | null>(null);

// ---------- 内部工具 ----------
function viewState(): ViewState {
  return {
    view: store.view,
    rangeKey: store.rangeKey,
    viewRange: store.viewRange,
    followLive: store.followLive,
    maxWindow: store.maxWindow,
    minWindow: store.minWindow,
  };
}

function applyResetPatch(
  r: ReturnType<typeof resetViewRange>,
  fallback: Partial<AppState>
): void {
  setStore({
    viewRange: r.viewRange,
    followLive: r.followLive ?? fallback.followLive,
    maxWindow: r.maxWindow ?? fallback.maxWindow,
    minWindow: r.minWindow ?? fallback.minWindow,
  });
}

// ---------- 消息 actions ----------
export function init(payload: InitPayload): void {
  // 与扩展侧解析结果同步（HTML 注入的初始 locale 已保证首帧正确，此处防御性再对齐一次）
  if (payload.locale) setLocale(payload.locale);
  setTooltipInfo(null);
  const view: ViewKey = 'hourly';
  const rangeKey = VIEWS[view].defaultRange;
  const r = resetViewRange(payload, view, rangeKey);
  setStore({
    data: payload,
    config: payload.config || null,
    view,
    rangeKey,
    viewRange: r.viewRange,
    followLive: r.followLive ?? true,
    maxWindow: r.maxWindow ?? 0,
    minWindow: r.minWindow ?? 60e3,
    yMinSpanRatio: payload.yMinSpanRatio ?? 0.2,
    chartMode: payload.chartMode ?? 'spend',
    consGran: 'hour',
    todayCache: buildTodaySpendCache(
      mainData(payload),
      Date.now(),
      payload.config?.dayBoundary ?? 'local'
    ),
    lastError: '',
  });
}

/** 一次轮询可能到达多条快照（多币种）：批量合并后再统一更新。 */
export function onSnapshots(snaps: Snapshot[]): void {
  if (!store.data || !snaps.length) return;
  let daily = store.data.daily;
  const merged = store.data.snapshots.slice();
  for (const s of snaps) {
    daily = upsertDailyLocal(daily, s);
    merged.push(s);
  }
  // 乱序防御：扩展侧正常单调追加；若出现乱序（时钟回拨等），整体重排一次，
  // 保证 viewPoints / todaySpend 依赖的数组有序性不被破坏（viewPoints 已不做每帧排序）
  const snapshots =
    merged.length >= 2 && merged[merged.length - 1].t < merged[merged.length - 2].t
      ? merged.sort((a, b) => a.t - b.t)
      : merged;
  const data: InitPayload = {
    ...store.data,
    snapshots,
    daily,
    current: snaps[snaps.length - 1],
  };
  const patch = onNewData(data, viewState());
  // 手动刷新成功后：停转并给出成功反馈（自动轮询来的 snapshot 不影响刷新状态）
  setStore({
    data,
    todayCache: advanceTodaySpendCache(
      store.todayCache,
      mainData(data),
      Date.now(),
      store.config?.dayBoundary ?? 'local'
    ),
    ...patch,
    // 刷新成功（手动或自动轮询）即清除之前的错误提示，避免 ⚠ 一直挂着
    lastError: '',
    ...(store.refreshing ? { refreshing: false, refreshResult: 'ok' as const } : {}),
  });
}

export function onConfig(cfg: PanelConfig): void {
  const prev = store.config?.dayBoundary ?? 'local';
  const next = cfg?.dayBoundary ?? 'local';
  setStore({
    config: cfg,
    // 日界时区切换：todayCache 需按新日界重建（下次 snapshot 也会重建，这里立即生效）
    ...(prev !== next
      ? { todayCache: buildTodaySpendCache(mainData(store.data), Date.now(), next) }
      : {}),
  });
}

/** 保存设置后的乐观更新：立即生效，避免 config 回传（异步）前 UI 闪回旧值。 */
export function applySavedConfig(p: SaveSettingsPayload): void {
  const prev = store.config?.dayBoundary ?? 'local';
  const next = p.dayBoundary ?? 'local';
  setStore('config', (cfg) => (cfg ? { ...cfg, ...p } : cfg));
  // 日界时区切换：乐观更新后立即按新日界重建今日花费缓存
  if (prev !== next) {
    setStore({ todayCache: buildTodaySpendCache(mainData(store.data), Date.now(), next) });
  }
}

/** 图表 Y 轴最小跨度比例（webview 本地设置；乐观更新立即生效）。 */
export function setYMinSpanRatio(ratio: number): void {
  setStore({ yMinSpanRatio: ratio });
}

/** 切换图表模式（余额/消耗）；乐观更新 + 持久化到扩展 globalState。 */
export function setChartMode(mode: ChartMode): void {
  setStore({ chartMode: mode });
  setTooltipInfo(null); // 坐标空间已变，清掉旧 tooltip 防止错位
  postMessage({ type: 'setChartMode', payload: { mode } });
}

/** 切换消耗柱状图粒度（仅本次会话，不持久化）。 */
export function setConsGran(g: ConsumptionGranularity): void {
  setStore({ consGran: g });
  setTooltipInfo(null);
}

export function onSettingsReset(): void {
  setStore({ settingsOpen: false, yMinSpanRatio: 0.2, chartMode: 'spend' });
}

export function onError(message: string): void {
  // 手动刷新失败：停转并给出失败反馈（自动轮询失败只更新 lastError，不改刷新状态）
  setStore({
    lastError: message,
    ...(store.refreshing ? { refreshing: false, refreshResult: 'fail' as const } : {}),
  });
}

export function onTheme(): void {
  setStore('themeTick', (t) => t + 1);
}

// ---------- 用户操作 actions ----------
export function setView(view: ViewKey): void {
  if (store.view === view) return;
  setTooltipInfo(null);
  const rangeKey = VIEWS[view].defaultRange;
  const r = resetViewRange(store.data, view, rangeKey);
  setStore({
    view,
    rangeKey,
    viewRange: r.viewRange,
    followLive: r.followLive ?? store.followLive,
    maxWindow: r.maxWindow ?? store.maxWindow,
    minWindow: r.minWindow ?? store.minWindow,
  });
}

export function setRange(rangeKey: string): void {
  // 重复点击当前范围也重新应用预设（重置右缘扩展带来的窗口变宽）
  const r = resetViewRange(store.data, store.view, rangeKey);
  applyResetPatch(r, store);
  setStore({ rangeKey });
}

export function resetView(): void {
  const r = resetViewRange(store.data, store.view, store.rangeKey);
  applyResetPatch(r, store);
}

/** 引擎手势（缩放/平移）回写。 */
export function setViewRange(vr: ViewRange, followLive: boolean): void {
  setStore({ viewRange: vr, followLive });
}

export function openSettings(): void {
  setStore({ settingsOpen: true });
}

export function closeSettings(): void {
  setStore({ settingsOpen: false });
}

// ---------- UI 操作 ----------
export function checkNow(): void {
  setStore({ refreshing: true, refreshResult: null });
  postMessage({ type: 'checkNow' });
}

/** 清除刷新结果反馈（ok/fail 短暂显示后调用，恢复 idle 图标）。 */
export function clearRefreshFeedback(): void {
  setStore({ refreshResult: null });
}

export function openUsage(): void {
  postMessage({ type: 'openUsage' });
}

export function openStatusPage(): void {
  postMessage({ type: 'openStatusPage' });
}

export function setApiKey(): void {
  postMessage({ type: 'setApiKey' });
}

// ---------- 空态派生 ----------
export interface EmptyInfo {
  msg: string;
  showAction: boolean;
}

export function emptyInfo(): EmptyInfo | null {
  const data = store.data;
  if (!data) return { msg: t('empty.loading'), showAction: false };
  if (!viewPoints(data, store.view).length) {
    const total = (data.snapshots || []).length + (data.daily || []).length;
    if (total === 0) {
      return data.hasKey
        ? { msg: t('empty.waitingFirst'), showAction: false }
        : { msg: t('empty.noKey'), showAction: true };
    }
    // 该视图下没有聚合数据（如分时视图尚无快照）——中性提示，非缩放阻断
    return { msg: t('empty.noViewData'), showAction: false };
  }
  // 有快照但所有币种余额一直为 0（含 7 天前花光、>0 快照已清除的情况）→ 无可绘制币种
  if (!activeCurrencies(data).length) {
    return { msg: t('empty.noBalance'), showAction: false };
  }
  return null;
}
