/**
 * todaySpend 单元测试：充值识别 / 跨天 / 日界（local|utc）/ 增量==全量 / 浮点容错。
 * 纯逻辑，无 DOM / store 依赖，直接 import 被测模块。
 */
import { describe, expect, it } from 'vitest';
import type { InitPayload, Snapshot } from '../types';
import {
  advanceTodaySpendCache,
  buildTodaySpendCache,
  todaySpendFromCache,
} from './todaySpend';
import { startOfDay, startOfDayAt } from '../../src/shared/dates';

function mkSnap(t: number, total: number): Snapshot {
  return { t, total, toppedUp: 0, granted: 0, currency: 'CNY', available: true };
}
function mkData(snapshots: Snapshot[]): InitPayload {
  return {
    snapshots,
    daily: [],
    current: null,
    config: {} as InitPayload['config'],
    hasKey: true,
    yMinSpanRatio: 0.2,
    chartMode: 'spend',
    spendWarningSeen: false,
    locale: 'en',
    vscodeLocale: 'en',
  };
}
type Cache = ReturnType<typeof buildTodaySpendCache>;
function spend(cache: Cache, current: Snapshot | null): number | null {
  return todaySpendFromCache(cache, current)?.spend ?? null;
}

const H = 3600e3;
const D = 86400e3;

describe('local 日界（相对当天构造，时区无关）', () => {
  const day = startOfDay(Date.now());
  const y = day - D;

  it('纯消费：昨日收盘 100，今日消费到 60 → 40', () => {
    const d = mkData([mkSnap(y + 12 * H, 100), mkSnap(day + H, 60)]);
    const c = buildTodaySpendCache(d, day + 2 * H, 'local');
    expect(spend(c, d.snapshots[1])).toBe(40);
  });

  it('消费 20 + 充值 50 → 20（充值跳增被识别）', () => {
    const d = mkData([mkSnap(y + 12 * H, 100), mkSnap(day + H, 80), mkSnap(day + 2 * H, 130)]);
    const c = buildTodaySpendCache(d, day + 3 * H, 'local');
    expect(spend(c, d.snapshots[2])).toBe(20);
  });

  it('充值无消费 → 0', () => {
    const d = mkData([mkSnap(y + 12 * H, 100), mkSnap(day + H, 150)]);
    const c = buildTodaySpendCache(d, day + 2 * H, 'local');
    expect(spend(c, d.snapshots[1])).toBe(0);
  });

  it('多次充值穿插：总消费 170（100→60(-40)→110(+50)→70(-40)→130(+60)→90(-40)→40(-50)）', () => {
    const d = mkData([
      mkSnap(y + 12 * H, 100),
      mkSnap(day + H, 60),
      mkSnap(day + 2 * H, 110),
      mkSnap(day + 3 * H, 70),
      mkSnap(day + 4 * H, 130),
      mkSnap(day + 5 * H, 90),
      mkSnap(day + 6 * H, 40),
    ]);
    const c = buildTodaySpendCache(d, day + 7 * H, 'local');
    // 消费 = 40+40+40+50 = 170（充值 50+60 被识别，不计入花费）
    expect(spend(c, d.snapshots[6])).toBe(170);
  });

  it('无昨日数据 → 今日首条为基准', () => {
    const d = mkData([mkSnap(day + H, 50), mkSnap(day + 2 * H, 100), mkSnap(day + 3 * H, 70)]);
    const c = buildTodaySpendCache(d, day + 4 * H, 'local');
    expect(spend(c, d.snapshots[2])).toBe(30);
  });

  it('耗尽到 0：spend 恒 ≥ 0', () => {
    const d = mkData([mkSnap(y + 12 * H, 100), mkSnap(day + H, 20), mkSnap(day + 2 * H, 0)]);
    const c = buildTodaySpendCache(d, day + 3 * H, 'local');
    expect(spend(c, d.snapshots[2])).toBe(100);
  });

  it('最后快照是昨天 → 不构建（返回 null）', () => {
    const d = mkData([mkSnap(y + H, 100), mkSnap(y + 2 * H, 80)]);
    expect(buildTodaySpendCache(d, day + H, 'local')).toBeNull();
  });

  it('今日无快照（刚开机未轮询）→ null', () => {
    const d = mkData([mkSnap(y + 12 * H, 100)]);
    expect(buildTodaySpendCache(d, day + H, 'local')).toBeNull();
  });

  it('浮点噪声（1e-15 正跳增）不判充值', () => {
    const d = mkData([mkSnap(y + 12 * H, 100), mkSnap(day + H, 60), mkSnap(day + 2 * H, 60 + 1e-15)]);
    const c = buildTodaySpendCache(d, day + 3 * H, 'local');
    expect(spend(c, d.snapshots[2])).toBe(40);
  });

  it('spend 明显为负（current 异常高于 基准+充值）→ null；微负容错归 0', () => {
    // 算法保证 spend = -Σ负跳增 ≥ 0（所有正跳增都判充值）；为负只可能来自异常 current
    const d = mkData([mkSnap(y + 12 * H, 100), mkSnap(day + H, 150)]); // 充值 50，基准 100
    const c = buildTodaySpendCache(d, day + 2 * H, 'local');
    expect(c).not.toBeNull();
    // 异常 current 余额 200 > 基准100+充值50 → spend=-50 → null
    expect(todaySpendFromCache(c, mkSnap(day + 3 * H, 200))).toBeNull();
    // 微负：current 150+1e-9 → spend = -1e-9 ∈ (-EPS, 0) → 容错归 0
    expect(spend(c, mkSnap(day + 3 * H, 150 + 1e-9))).toBe(0);
  });

  it('增量 advance == 全量 build（含新快照）', () => {
    const base = mkData([mkSnap(day + H, 50), mkSnap(day + 2 * H, 100)]);
    let c = buildTodaySpendCache(base, day + 3 * H, 'local');
    const next = mkData([...base.snapshots, mkSnap(day + 4 * H, 70)]);
    c = advanceTodaySpendCache(c, next, day + 5 * H, 'local');
    const full = buildTodaySpendCache(next, day + 5 * H, 'local');
    expect(spend(c, next.snapshots[2])).toBe(spend(full, next.snapshots[2]));
    expect(spend(c, next.snapshots[2])).toBe(30);
  });

  it('重复推送（同一快照再来一次）不重复累计', () => {
    const d = mkData([mkSnap(day + H, 50), mkSnap(day + 2 * H, 100), mkSnap(day + 3 * H, 70)]);
    let c = buildTodaySpendCache(d, day + 4 * H, 'local');
    c = advanceTodaySpendCache(c, d, day + 4 * H, 'local');
    expect(spend(c, d.snapshots[2])).toBe(30);
  });

  it('乱序快照：advance 只处理 lastT 之后新增', () => {
    const d = mkData([mkSnap(day + 3 * H, 70), mkSnap(day + H, 50), mkSnap(day + 2 * H, 100)]);
    // 乱序数组：advance 从尾部回扫，只处理 t > lastT 的（此处 tail=day+2H）
    let c = buildTodaySpendCache(d, day + 4 * H, 'local');
    expect(c).not.toBeNull();
    const full = buildTodaySpendCache(d, day + 4 * H, 'local');
    expect(spend(c, d.snapshots[2])).toBe(spend(full, d.snapshots[2]));
  });

  it('advance 跨天重建', () => {
    const nextDay = day + D;
    const d1 = mkData([mkSnap(day + H, 50), mkSnap(day + 2 * H, 100)]);
    let c = buildTodaySpendCache(d1, day + 3 * H, 'local');
    const d2 = mkData([...d1.snapshots, mkSnap(nextDay + H, 90)]);
    c = advanceTodaySpendCache(c, d2, nextDay + 2 * H, 'local');
    const full = buildTodaySpendCache(d2, nextDay + 2 * H, 'local');
    expect(c?.day).toBe(nextDay);
    expect(spend(c, d2.snapshots[2])).toBe(spend(full, d2.snapshots[2]));
  });
});

describe('UTC 日界（绝对 epoch，时区无关）', () => {
  // 用固定基准时刻构造：utcDay = 该时刻所在 UTC 日 0 点
  const base = Date.UTC(2026, 7, 6, 12, 0, 0); // 2026-08-06T12:00:00Z
  const utcDay = startOfDayAt(base, 'utc');

  it('只统计 UTC 今日：跨 UTC 日界的消费不算今日', () => {
    // UTC 昨日 23:00(100)、UTC 今日 00:30(70)、UTC 今日 08:00(65)
    const d = mkData([
      mkSnap(utcDay - H, 100),
      mkSnap(utcDay + 1800e3, 70),
      mkSnap(utcDay + 8 * H, 65),
    ]);
    const c = buildTodaySpendCache(d, utcDay + 9 * H, 'utc');
    expect(c?.day).toBe(utcDay);
    // 基准=UTC 昨日最后一条(100)；今日快照 70、65 无充值 → 100-65=35
    expect(spend(c, d.snapshots[2])).toBe(35);
  });

  it('UTC 今日尚无快照（刚过日界）→ null', () => {
    const d = mkData([mkSnap(utcDay - H, 100)]);
    expect(buildTodaySpendCache(d, utcDay + 3600e3, 'utc')).toBeNull();
  });

  it('UTC 日界内充值识别：100 → 130(充值) → 90(消费) → 40', () => {
    const d = mkData([
      mkSnap(utcDay - H, 100),
      mkSnap(utcDay + H, 130),
      mkSnap(utcDay + 10 * H, 90),
    ]);
    const c = buildTodaySpendCache(d, utcDay + 11 * H, 'utc');
    expect(spend(c, d.snapshots[2])).toBe(40);
  });

  it('日界切换：advance 遇 boundary 变化重建', () => {
    const d = mkData([mkSnap(utcDay - H, 100), mkSnap(utcDay + H, 70)]);
    const cLocal = buildTodaySpendCache(d, utcDay + 2 * H, 'local');
    const cUtc = advanceTodaySpendCache(cLocal, d, utcDay + 2 * H, 'utc');
    expect(cUtc?.boundary).toBe('utc');
    expect(cUtc?.day).toBe(utcDay);
  });

  it('utc/local 起始日不同时（快照全在 UTC 昨日），utc 判为昨日 → null 或不同口径', () => {
    // 快照都在 UTC 昨日；local（UTC+8 时区下可能是本地今日）——只断言 utc 语义
    const d = mkData([mkSnap(utcDay - 2 * H, 100), mkSnap(utcDay - H, 80)]);
    expect(buildTodaySpendCache(d, utcDay + H, 'utc')).toBeNull();
  });
});
