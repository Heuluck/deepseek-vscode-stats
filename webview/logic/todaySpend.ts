/** 今日花费估算（从 media/chart.js 迁移，纯函数）。 */
import type { InitPayload } from '../types';
import { startOfDay } from './format';

export interface TodaySpendInfo {
  spend: number | null;
  source: string | null;
  baseline: number | null;
}

/** 今日花费估算：昨日收盘余额（或今日首条快照）− 当前余额，数据断点自动降级。 */
export function computeTodaySpend(data: InitPayload | null): TodaySpendInfo | null {
  if (!data || !data.snapshots || !data.snapshots.length) return null;
  const snapshots = data.snapshots.slice().sort((a, b) => a.t - b.t);
  const current = snapshots[snapshots.length - 1];
  const todayStart = startOfDay(Date.now());
  const yesterdayStart = todayStart - 86400e3;
  let baseline: number | null = null;
  let source = '';
  const yesterdayDaily = (data.daily || []).find((x) => x.day === yesterdayStart);
  if (yesterdayDaily) {
    baseline = yesterdayDaily.total;
    source = '昨日余额';
  } else {
    const firstToday = snapshots.find((s) => s.t >= todayStart);
    if (firstToday) {
      baseline = firstToday.total;
      source = '今日首条快照';
    }
  }
  if (baseline == null) return { spend: null, source: null, baseline: null };
  return { spend: Math.max(0, baseline - current.total), source, baseline };
}
