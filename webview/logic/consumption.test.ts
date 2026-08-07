/**
 * consumption 单元测试：按 小时/天/月 桶聚合消费（负跳增累加、充值忽略、零桶跳过/保留、
 * 窗口过滤、浮点容错、归属到后一条快照所在桶）。
 * 纯逻辑，无 DOM / store 依赖，直接 import 被测模块。
 */
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { aggregateConsumption, bucketStart } from './consumption';

function mkSnap(t: number, total: number): Snapshot {
  return { t, total, toppedUp: 0, granted: 0, currency: 'CNY', available: true };
}

const H = 3600e3;
const D = 86400e3;

/** 本地时区基准：2026-08-07 10:00（桶起点按本地时间，测试用 Date 构造对齐）。 */
const base = new Date(2026, 7, 7, 10, 0).getTime();

describe('按小时聚合', () => {
  it('负跳增累加到后一条快照所在小时；充值正跳增忽略', () => {
    const snaps = [
      mkSnap(base, 100),
      mkSnap(base + 30 * 60e3, 80), // 10:30 消费 20 → 10 点桶
      mkSnap(base + 45 * 60e3, 130), // 10:45 充值 +50（忽略）
      mkSnap(base + H, 100), // 11:00 消费 30 → 11 点桶
      mkSnap(base + 90 * 60e3, 90), // 11:30 消费 10 → 11 点桶
    ];
    const bars = aggregateConsumption(snaps, 'hour', 24 * H, true, base + 2 * H);
    expect(bars).toEqual([
      { t: base, value: 20 },
      { t: base + H, value: 40 },
    ]);
  });

  it('skipZero=true 时跳过无消费小时', () => {
    const snaps = [mkSnap(base, 100), mkSnap(base + 30 * 60e3, 80)]; // 只有 10 点有消费
    const bars = aggregateConsumption(snaps, 'hour', 24 * H, true, base + 6 * H);
    expect(bars).toEqual([{ t: base, value: 20 }]);
  });

  it('窗口过滤：只统计窗口内桶', () => {
    const snaps = [
      mkSnap(base - 3 * H, 100), // 窗口外（早于 now-2h）
      mkSnap(base - 3 * H + 60e3, 70), // 消费 30，桶在窗口外
      mkSnap(base, 130), // 充值（忽略，也演示"跨窗口充值不算消费"）
      mkSnap(base + 60e3, 120), // 消费 10，桶在窗口内
    ];
    const bars = aggregateConsumption(snaps, 'hour', 2 * H, true, base + H);
    expect(bars).toEqual([{ t: base, value: 10 }]);
  });

  it('同一小时内多条消费合并', () => {
    const snaps = [
      mkSnap(base, 100),
      mkSnap(base + 10 * 60e3, 90), // 10
      mkSnap(base + 20 * 60e3, 75), // 15
    ];
    const bars = aggregateConsumption(snaps, 'hour', 24 * H, true, base + H);
    expect(bars).toEqual([{ t: base, value: 25 }]);
  });

  it('浮点噪声（1e-15 负跳增）不累计', () => {
    const snaps = [mkSnap(base, 100), mkSnap(base + 60e3, 100 - 1e-15)];
    expect(aggregateConsumption(snaps, 'hour', 24 * H, true, base + H)).toEqual([]);
  });

  it('空输入 / 无消费 → 空数组', () => {
    expect(aggregateConsumption([], 'hour', 24 * H, true, base + H)).toEqual([]);
    expect(
      aggregateConsumption([mkSnap(base, 100), mkSnap(base + H, 150)], 'hour', 24 * H, true, base + 2 * H)
    ).toEqual([]);
  });
});

describe('按天聚合（周视图）', () => {
  it('skipZero=false 保留无消费的天；消费归属到后一条快照所在天', () => {
    const day0 = new Date(2026, 7, 7, 12, 0).getTime(); // 2026-08-07
    const snaps = [
      mkSnap(day0, 100),
      mkSnap(day0 + 3600e3, 80), // 08-07 消费 20
      mkSnap(day0 + D, 120), // 08-08 充值 +40（忽略）
      mkSnap(day0 + 2 * D, 110), // 08-09 消费 10
    ];
    const bars = aggregateConsumption(snaps, 'day', 7 * D, false, day0 + 3 * D);
    // 窗口 [now-7d, now] 两端向下取整到日 → 08-03 ~ 08-10 共 8 天，
    // 其中 08-07=20、08-09=10，其余为 0
    expect(bars).toHaveLength(8);
    expect(bars.find((b) => b.value === 20)!.t).toBe(bucketStart(day0, 'day'));
    expect(bars.find((b) => b.value === 10)!.t).toBe(bucketStart(day0 + 2 * D, 'day'));
    expect(bars.filter((b) => b.value === 0)).toHaveLength(6);
  });
});

describe('按月聚合（月视图）', () => {
  it('skipZero=false 保留无消费的月；充值忽略', () => {
    const m0 = new Date(2026, 0, 15, 12, 0).getTime(); // 2026-01-15
    const feb = new Date(2026, 1, 5, 12, 0).getTime(); // 2026-02-05
    const snaps = [
      mkSnap(m0, 100),
      mkSnap(m0 + 3600e3, 80), // 1 月消费 20
      mkSnap(feb, 130), // 2 月充值 +50（忽略）
      mkSnap(feb + 3600e3, 100), // 2 月消费 30
    ];
    const now = new Date(2026, 11, 15).getTime(); // 2026-12-15
    const bars = aggregateConsumption(snaps, 'month', 12 * 30 * D, false, now);
    // 窗口 12 个月（2025-12 ~ 2026-11 附近），1 月=20、2 月=30，其余 0
    expect(bars.some((b) => b.t === bucketStart(m0, 'month') && b.value === 20)).toBe(true);
    expect(bars.some((b) => b.t === bucketStart(feb, 'month') && b.value === 30)).toBe(true);
    expect(bars.filter((b) => b.value === 0).length).toBeGreaterThan(0);
  });

  it('按月窗口只含窗口内的月', () => {
    const old = new Date(2025, 5, 1).getTime(); // 2025-06（窗口外）
    const recent = new Date(2026, 5, 1).getTime(); // 2026-06（窗口内）
    const snaps = [
      mkSnap(old, 100),
      mkSnap(old + 3600e3, 60), // 消费 40（窗口外）
      mkSnap(recent, 200),
      mkSnap(recent + 3600e3, 180), // 消费 20（窗口内）
    ];
    const now = new Date(2026, 6, 15).getTime(); // 2026-07-15
    const bars = aggregateConsumption(snaps, 'month', 2 * 30 * D, false, now);
    expect(bars.filter((b) => b.value > 0)).toEqual([{ t: bucketStart(recent, 'month'), value: 20 }]);
  });
});
