/** 视图 / 数据逻辑（从 media/chart.js 迁移，状态访问参数化，无全局状态）。 */
import type { ChartPoint, DayAgg, InitPayload, Snapshot } from '../types';
import { startOfDay } from './format';

export type ViewKey = 'hourly' | 'daily' | 'monthly';

export interface ViewRange {
  start: number;
  end: number;
}

export interface RangePreset {
  key: string;
  label: string;
  ms: number;
}

export const VIEWS: Record<
  ViewKey,
  { label: string; ranges: RangePreset[]; defaultRange: string; tickLabel: string }
> = {
  hourly: {
    label: '分时',
    ranges: [
      { key: '1h', label: '1 小时', ms: 3600e3 },
      { key: '6h', label: '6 小时', ms: 6 * 3600e3 },
      { key: '24h', label: '24 小时', ms: 24 * 3600e3 },
      { key: '7d', label: '7 天', ms: 7 * 86400e3 },
    ],
    defaultRange: '6h',
    tickLabel: 'time',
  },
  daily: {
    label: '分天',
    ranges: [
      { key: '7d', label: '7 天', ms: 7 * 86400e3 },
      { key: '30d', label: '30 天', ms: 30 * 86400e3 },
      { key: '90d', label: '90 天', ms: 90 * 86400e3 },
      { key: 'all', label: '全部', ms: Infinity },
    ],
    defaultRange: '30d',
    tickLabel: 'day',
  },
  monthly: {
    label: '分月',
    ranges: [
      { key: '6m', label: '6 个月', ms: 6 * 30 * 86400e3 },
      { key: '12m', label: '12 个月', ms: 12 * 30 * 86400e3 },
      { key: 'all', label: '全部', ms: Infinity },
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

export function viewPoints(data: InitPayload | null, view: ViewKey): ChartPoint[] {
  if (!data) return [];
  if (view === 'hourly') {
    return data.snapshots.slice().sort((a, b) => a.t - b.t);
  }
  if (view === 'daily') {
    return data.daily
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((x) => ({
        t: x.day,
        total: x.total,
        toppedUp: x.toppedUp,
        granted: x.granted,
        currency: x.currency,
      }));
  }
  // monthly：按自然月聚合，取当月最后一条
  const byMonth = new Map<number, DayAgg>();
  for (const x of data.daily) {
    const m = startOfDay(new Date(x.day).setDate(1));
    byMonth.set(m, x);
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, x]) => ({
      t,
      total: x.total,
      toppedUp: x.toppedUp,
      granted: x.granted,
      currency: x.currency,
    }));
}

export function computeDataBounds(
  data: InitPayload | null,
  view: ViewKey
): { minT: number; maxT: number } | null {
  const pts = viewPoints(data, view);
  if (!pts.length) return null;
  return { minT: pts[0].t, maxT: pts[pts.length - 1].t };
}

export function getPts(
  data: InitPayload | null,
  view: ViewKey,
  viewRange: ViewRange | null
): ChartPoint[] {
  const pts = viewPoints(data, view);
  if (!viewRange) return pts;
  return pts.filter((p) => p.t >= viewRange.start && p.t <= viewRange.end);
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
    end = bounds.maxT;
    start = end - ms;
    if (start < bounds.minT) {
      start = bounds.minT;
      end = start + ms;
    }
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
    // 新数据超出右缘时仅向右扩展，保持左缘与当前位置不动——刷新不重置视图
    return { viewRange: { start: vs.viewRange.start, end: bounds.maxT } };
  }
  return {};
}

/** 本地 upsert 按天聚合（纯函数，返回新数组）。 */
export function upsertDailyLocal(daily: DayAgg[], s: Snapshot): DayAgg[] {
  const day = startOfDay(s.t);
  const ex = daily.find((d) => d.day === day);
  if (ex) {
    return daily.map((d) =>
      d.day === day
        ? {
            ...d,
            total: s.total,
            toppedUp: s.toppedUp,
            granted: s.granted,
            currency: s.currency,
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
