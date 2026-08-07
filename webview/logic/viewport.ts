/** 视图 / 数据逻辑（从 media/chart.js 迁移，状态访问参数化，无全局状态）。 */
import type { ChartPoint, DayAgg, InitPayload, Snapshot } from '../types';
import { startOfDay } from './format';
// type-only：仅供 t() 的 key 类型检查；运行时不引入 i18n（保持纯逻辑可 node 单测）
import type { MessageKey } from '../i18n';

export type ViewKey = 'hourly' | 'daily' | 'monthly';

export interface ViewRange {
  start: number;
  end: number;
}

export interface RangePreset {
  key: string;
  /** 翻译 key（纯逻辑层只存 key，由组件 t() 翻译）。 */
  labelKey: MessageKey;
  ms: number;
}

export const VIEWS: Record<
  ViewKey,
  { labelKey: MessageKey; ranges: RangePreset[]; defaultRange: string; tickLabel: string }
> = {
  hourly: {
    labelKey: 'view.hourly',
    ranges: [
      { key: '1h', labelKey: 'range.1h', ms: 3600e3 },
      { key: '6h', labelKey: 'range.6h', ms: 6 * 3600e3 },
      { key: '24h', labelKey: 'range.24h', ms: 24 * 3600e3 },
      { key: '7d', labelKey: 'range.7d', ms: 7 * 86400e3 },
    ],
    defaultRange: '6h',
    tickLabel: 'time',
  },
  daily: {
    labelKey: 'view.daily',
    ranges: [
      { key: '7d', labelKey: 'range.7d', ms: 7 * 86400e3 },
      { key: '30d', labelKey: 'range.30d', ms: 30 * 86400e3 },
      { key: '90d', labelKey: 'range.90d', ms: 90 * 86400e3 },
      { key: 'all', labelKey: 'range.all', ms: Infinity },
    ],
    defaultRange: '30d',
    tickLabel: 'day',
  },
  monthly: {
    labelKey: 'view.monthly',
    ranges: [
      { key: '6m', labelKey: 'range.6m', ms: 6 * 30 * 86400e3 },
      { key: '12m', labelKey: 'range.12m', ms: 12 * 30 * 86400e3 },
      { key: 'all', labelKey: 'range.all', ms: Infinity },
    ],
    defaultRange: '12m',
    tickLabel: 'month',
  },
};

/** 最小可缩放窗口：分时 15 分钟，分天 6 小时，分月 7 天。 */
export const MIN_WINDOW_MS: Record<ViewKey, number> = {
  hourly: 15 * 60e3,
  daily: 6 * 3600e3,
  monthly: 7 * 86400e3,
};

/** 视图状态（由 Solid store 持有）。 */
export interface ViewState {
  view: ViewKey;
  rangeKey: string | null;
  viewRange: ViewRange | null;
  followLive: boolean;
  maxWindow: number;
  minWindow: number;
}

export function currentViewCfg(view: ViewKey) {
  return VIEWS[view];
}

export function currentRangeMs(view: ViewKey, rangeKey: string | null): number {
  const cfg = VIEWS[view];
  const r = cfg.ranges.find((x) => x.key === rangeKey) || cfg.ranges[0];
  return r ? r.ms : Infinity;
}

/** 该币种历史上是否曾有过余额（任一快照 total > 0）——全 0 币种没有信息量，不参与展示。 */
export function hasEverHadMoney(data: InitPayload | null, currency: string): boolean {
  if (!data) return false;
  return data.snapshots.some((s) => s.currency === currency && s.total > 0);
}

/** 参与展示的币种（曾有过余额的），主币种在前。 */
export function activeCurrencies(data: InitPayload | null): string[] {
  if (!data) return [];
  const set = new Set<string>();
  for (const s of data.snapshots) if (s.total > 0) set.add(s.currency);
  const main = mainCurrency(data);
  return [...set].sort((a, b) => (a === main ? -1 : b === main ? 1 : a < b ? -1 : 1));
}

/**
 * 主币种：在「当前有钱」的币种里优先人民币（CNY 有钱则 CNY）；
 * 全都没钱时退回「历史出现过 CNY 优先」，再退回最新快照币种。
 */
export function mainCurrency(data: InitPayload | null): string {
  if (!data) return 'CNY';
  const latest = new Map<string, number>();
  for (const s of data.snapshots) latest.set(s.currency, s.total); // 有序，最后覆盖 = 最新
  const withMoney = [...latest.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => (a[0] === 'CNY' ? -1 : b[0] === 'CNY' ? 1 : a[0] < b[0] ? -1 : 1));
  if (withMoney.length) return withMoney[0][0];
  if (data.snapshots.some((s) => s.currency === 'CNY')) return 'CNY';
  return data.current?.currency || 'CNY';
}

/** 过滤出主币种快照的数据副本（供今日花费等单币种计算使用）；已是主币种则原样返回。 */
export function mainData(data: InitPayload | null): InitPayload | null {
  if (!data) return null;
  const main = mainCurrency(data);
  if (!data.snapshots.some((s) => s.currency !== main)) return data;
  return { ...data, snapshots: data.snapshots.filter((s) => s.currency === main) };
}

export function viewPoints(data: InitPayload | null, view: ViewKey): ChartPoint[] {
  if (!data) return [];
  if (view === 'hourly') {
    // 数据已由扩展侧保证有序（构造时排序 + 追加单调递增），只做防御性复制，不再全量排序
    return data.snapshots.slice();
  }
  if (view === 'daily') {
    return data.daily
      .slice()
      .map((x) => ({
        t: x.day,
        total: x.total,
        toppedUp: x.toppedUp,
        granted: x.granted,
        currency: x.currency,
      }));
  }
  // monthly：按「自然月 + 币种」聚合，取当月最后一条（同月不同币种各占一点）
  const byMonth = new Map<string, DayAgg>();
  for (const x of data.daily) {
    const m = startOfDay(new Date(x.day).setDate(1));
    byMonth.set(`${m}:${x.currency}`, x);
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0])) // key 为「13 位时间戳:币种」，字符串序即时间序
    .map(([key, x]) => {
      const m = Number(key.slice(0, key.indexOf(':')));
      return {
        t: m,
        total: x.total,
        toppedUp: x.toppedUp,
        granted: x.granted,
        currency: x.currency,
      };
    });
}

export function computeDataBounds(
  data: InitPayload | null,
  view: ViewKey
): { minT: number; maxT: number } | null {
  const pts = viewPoints(data, view);
  if (!pts.length) return null;
  return { minT: pts[0].t, maxT: pts[pts.length - 1].t };
}

/** 重置视图范围到当前 range 预设（返回需写入 store 的字段）。 */
export function resetViewRange(
  data: InitPayload | null,
  view: ViewKey,
  rangeKey: string | null
): Partial<ViewState> & { viewRange: ViewRange | null } {
  const bounds = computeDataBounds(data, view);
  if (!bounds) {
    return { viewRange: null };
  }
  const ms = currentRangeMs(view, rangeKey);
  const span = Math.max(bounds.maxT - bounds.minT, 60e3);
  const maxWindow = Math.max(ms === Infinity ? span : ms, span);
  const minWindow = MIN_WINDOW_MS[view];
  let start: number;
  let end: number;
  if (ms === Infinity) {
    const padAmt = span * 0.03;
    start = bounds.minT - padAmt;
    end = bounds.maxT + padAmt;
  } else {
    // 右缘锚定最新数据：不钳制到 minT（数据不足时左侧留空），
    // 与 onNewData 的右缘滑动保持一致，避免初始视图与刷新后视图跳变
    end = bounds.maxT;
    start = end - ms;
  }
  return { viewRange: { start, end }, followLive: true, maxWindow, minWindow };
}

export function clampRange(
  start: number,
  end: number,
  bounds: { minT: number; maxT: number },
  minWindow: number
): ViewRange {
  let dur = end - start;
  if (dur < minWindow) {
    end = start + minWindow;
    dur = end - start;
  }
  const hi = bounds.maxT + (bounds.maxT - bounds.minT) * 0.05;
  let s = Math.max(bounds.minT, Math.min(start, hi - dur));
  let e = s + dur;
  if (e > hi) {
    e = hi;
    s = e - dur;
  }
  if (s < bounds.minT) {
    s = bounds.minT;
    e = s + dur;
  }
  return { start: s, end: e };
}

/** 新快照到达后的视图处理（返回需写入 store 的字段；无变化返回 {}）。 */
export function onNewData(data: InitPayload | null, vs: ViewState): Partial<ViewState> {
  const bounds = computeDataBounds(data, vs.view);
  if (!bounds) return {};
  if (!vs.viewRange) {
    return resetViewRange(data, vs.view, vs.rangeKey);
  }
  if (vs.followLive && bounds.maxT > vs.viewRange.end) {
    // 右缘锚定最新数据、宽度保持当前窗口：整体右滑（左侧旧数据滑出视野）。
    // 不要钳制到 minT，数据不足时左侧留空即可——与 resetViewRange 一致，刷新不重置视图
    const width = vs.viewRange.end - vs.viewRange.start;
    return { viewRange: { start: bounds.maxT - width, end: bounds.maxT } };
  }
  return {};
}

/** 本地 upsert 按天聚合（纯函数，返回新数组）；按「天 + 币种」维度，同天多币种各占一条。 */
export function upsertDailyLocal(daily: DayAgg[], s: Snapshot): DayAgg[] {
  const day = startOfDay(s.t);
  const ex = daily.find((d) => d.day === day && d.currency === s.currency);
  if (ex) {
    return daily.map((d) =>
      d.day === day && d.currency === s.currency
        ? {
            ...d,
            total: s.total,
            toppedUp: s.toppedUp,
            granted: s.granted,
          }
        : d
    );
  }
  const next = [
    ...daily,
    { day, total: s.total, toppedUp: s.toppedUp, granted: s.granted, currency: s.currency },
  ];
  next.sort((a, b) => a.day - b.day);
  return next;
}
