/** 消耗模式：按 小时/天/月 桶聚合消费额（纯函数，可单测）。
 * 消费 = 相邻快照间余额的下降量（负跳增）；正跳增（充值/赠送）忽略 → 结构上免疫充值，
 * 不需要"识别充值"这一步：充值不会产生任何柱，也不会让柱变负。
 * 消费归属到「后一条快照」所在的桶（观测到余额下降的时刻）。
 */
import type { Snapshot } from '../types';

export type ConsumptionGranularity = 'hour' | 'day' | 'month';

export interface ConsumptionBar {
  /** 桶起点（本地时区，epoch ms）：整点 / 当日 0 点 / 当月 1 号 0 点 */
  t: number;
  /** 该桶内消费额 */
  value: number;
}

/** 金额浮点容差（同 todaySpend：挡 1e-15 噪声，不漏真实消费 ≥ 0.01）。 */
export const EPS = 1e-6;

/** 本地时区桶起点。 */
export function bucketStart(t: number, g: ConsumptionGranularity): number {
  const d = new Date(t);
  if (g === 'hour') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
  }
  if (g === 'day') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** 桶终点（下一个桶起点）。 */
export function bucketEnd(t: number, g: ConsumptionGranularity): number {
  if (g === 'hour') return t + 3600e3;
  if (g === 'day') return t + 86400e3;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

/**
 * 按桶聚合消费。
 * - 只统计窗口 [now - windowMs, now] 内的桶；桶起点早于窗口起点的消费不计。
 * - skipZero：跳过 value≈0 的桶（小时粒度忽略无消耗小时；周/月不忽略）。
 * - 快照需按 t 升序（扩展侧已保证有序）。
 * - 返回桶按 t 升序，窗口内桶连续（skipZero 除外）。
 */
export function aggregateConsumption(
  snapshots: Snapshot[],
  g: ConsumptionGranularity,
  windowMs: number,
  skipZero: boolean,
  now: number
): ConsumptionBar[] {
  const acc = new Map<number, number>();
  const winStart = now - windowMs;
  let prev: Snapshot | null = null;
  for (const s of snapshots) {
    if (prev && s.total < prev.total - EPS) {
      const b = bucketStart(s.t, g);
      if (b >= winStart) {
        acc.set(b, (acc.get(b) ?? 0) + (prev.total - s.total));
      }
    }
    prev = s;
  }

  const out: ConsumptionBar[] = [];
  const start = bucketStart(winStart, g);
  const end = bucketStart(now, g);
  if (g === 'month') {
    const d = new Date(start);
    for (let t = start; t <= end; ) {
      const v = acc.get(t) ?? 0;
      if (!skipZero || v > EPS) out.push({ t, value: v });
      d.setMonth(d.getMonth() + 1);
      t = d.getTime();
    }
  } else {
    const step = g === 'hour' ? 3600e3 : 86400e3;
    for (let t = start; t <= end; t += step) {
      const v = acc.get(t) ?? 0;
      if (!skipZero || v > EPS) out.push({ t, value: v });
    }
  }
  return out;
}
