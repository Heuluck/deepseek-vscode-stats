/**
 * viewport 单元测试：followLive 滑动窗口（右缘锚定 + 宽度恒预设）、
 * resetViewRange 钳制回归、clampRange、viewPoints 有序性。
 */
import { describe, expect, it } from 'vitest';
import type { InitPayload, Snapshot } from '../types';
import {
  clampRange,
  computeDataBounds,
  onNewData,
  resetViewRange,
  viewPoints,
  type ViewState,
} from './viewport';

function mkSnap(t: number, total: number): Snapshot {
  return { t, total, toppedUp: 0, granted: 0, currency: 'CNY', available: true };
}
function mkData(maxT: number, minT = 1000): InitPayload {
  return {
    snapshots: [
      mkSnap(minT, 50),
      mkSnap(minT + (maxT - minT) / 2, 40),
      mkSnap(maxT, 45),
    ],
    daily: [],
    current: null,
    config: {} as InitPayload['config'],
    hasKey: true,
    yMinSpanRatio: 0.2,
  };
}

const H = 3600e3;
const SIX_H = 6 * H;
const MINUTE = 60e3;

function vsOf(r: ReturnType<typeof resetViewRange>, view: ViewState['view']): ViewState {
  return {
    view,
    rangeKey: '6h',
    viewRange: r.viewRange,
    followLive: true,
    maxWindow: r.maxWindow ?? 0,
    minWindow: r.minWindow ?? 60e3,
  };
}

describe('resetViewRange（B1 修复回归：数据不足时左侧留空，不钳制 minT）', () => {
  it('数据 < 预设窗口：start = maxT - ms（右缘锚定，左侧留空）', () => {
    const minT = 1000;
    const maxT = minT + 2 * H; // 2h 数据
    const r = resetViewRange(mkData(maxT, minT), 'hourly', '6h');
    expect(r.viewRange!.end).toBe(maxT);
    expect(r.viewRange!.start).toBe(maxT - SIX_H); // 不钳到 minT
    expect(r.viewRange!.end - r.viewRange!.start).toBe(SIX_H);
  });

  it('数据 ≥ 预设窗口：start = maxT - ms', () => {
    const minT = 1000;
    const maxT = minT + 10 * H; // 10h 数据
    const r = resetViewRange(mkData(maxT, minT), 'hourly', '6h');
    expect(r.viewRange!.start).toBe(maxT - SIX_H);
    expect(r.viewRange!.end).toBe(maxT);
  });

  it('all 范围：带 3% padding（数据源为 daily）', () => {
    const minT = new Date(2026, 0, 1).getTime();
    const maxT = minT + 29 * 86400e3; // 30 天
    const days = Array.from({ length: 30 }, (_, i) => minT + i * 86400e3);
    const d: InitPayload = {
      snapshots: [],
      daily: days.map((day) => ({ day, total: 50, toppedUp: 0, granted: 0, currency: 'CNY' })),
      current: null,
      config: {} as InitPayload['config'],
      hasKey: true,
      yMinSpanRatio: 0.2,
    };
    const r = resetViewRange(d, 'daily', 'all');
    const span = maxT - minT;
    expect(r.viewRange!.start).toBeCloseTo(minT - span * 0.03);
    expect(r.viewRange!.end).toBeCloseTo(maxT + span * 0.03);
  });

  it('无数据：viewRange 为 null', () => {
    const d: InitPayload = { ...mkData(1000), snapshots: [], daily: [] };
    expect(resetViewRange(d, 'hourly', '6h').viewRange).toBeNull();
  });
});

describe('onNewData followLive（B1 完整修复：右缘锚定 + 宽度恒为预设）', () => {
  it('数据 < 窗口：右缘跟随最新，宽度恒 6h（整体右滑）', () => {
    const minT = 1000;
    const maxT = minT + 2 * H;
    const r = resetViewRange(mkData(maxT, minT), 'hourly', '6h');
    let vs = vsOf(r, 'hourly');
    // +3 分钟
    const d2 = mkData(maxT + 3 * MINUTE, minT);
    const p = onNewData(d2, vs);
    expect(p.viewRange).toBeTruthy();
    vs = { ...vs, viewRange: p.viewRange! };
    expect(vs.viewRange!.end).toBe(maxT + 3 * MINUTE);
    expect(vs.viewRange!.end - vs.viewRange!.start).toBe(SIX_H); // 宽度不变
  });

  it('数据 > 窗口：整体右滑 1 分钟，宽度恒 6h', () => {
    const minT = 1000;
    const maxT = minT + 10 * H;
    const r = resetViewRange(mkData(maxT, minT), 'hourly', '6h');
    let vs = vsOf(r, 'hourly');
    const d2 = mkData(maxT + MINUTE, minT);
    const p = onNewData(d2, vs);
    expect(p.viewRange).toBeTruthy();
    vs = { ...vs, viewRange: p.viewRange! };
    expect(vs.viewRange!.start).toBe(maxT + MINUTE - SIX_H);
    expect(vs.viewRange!.end).toBe(maxT + MINUTE);
    expect(vs.viewRange!.end - vs.viewRange!.start).toBe(SIX_H);
  });

  it('右缘已超出最新数据：不触发滑动', () => {
    const minT = 1000;
    const maxT = minT + 2 * H;
    // 窗口右缘超出数据（如平移/缩放后）：新快照仍未超右缘 → 不触发
    const vs: ViewState = {
      view: 'hourly',
      rangeKey: '6h',
      viewRange: { start: minT - H, end: minT + 4 * H },
      followLive: true,
      maxWindow: SIX_H,
      minWindow: 15 * MINUTE,
    };
    const d2 = mkData(maxT + MINUTE, minT); // 新快照 t = maxT+1min < 右缘 minT+4h
    expect(onNewData(d2, vs)).toEqual({});
  });

  it('缩放后（followLive=false）：不自动滑动', () => {
    const minT = 1000;
    const maxT = minT + 10 * H;
    const r = resetViewRange(mkData(maxT, minT), 'hourly', '6h');
    const vs: ViewState = { ...vsOf(r, 'hourly'), followLive: false };
    const d2 = mkData(maxT + MINUTE, minT);
    expect(onNewData(d2, vs)).toEqual({});
  });
});

describe('clampRange', () => {
  const bounds = { minT: 1000, maxT: 1000 + 24 * H };

  it('窗口过小 → 撑到 minWindow', () => {
    const r = clampRange(1000, 1000 + 60e3, bounds, 15 * MINUTE);
    expect(r.end - r.start).toBe(15 * MINUTE);
  });

  it('窗口远超数据范围：保宽贴左（不收缩）', () => {
    const bounds = { minT: 1000, maxT: 1000 + 24 * H };
    const dur = 24 * H + 100 * H;
    const r = clampRange(bounds.minT, bounds.maxT + 100 * H, bounds, 15 * MINUTE);
    // clampRange 只限制平移范围，窗口宽度保持；贴左后 end 可超出数据右缘
    expect(r.start).toBe(bounds.minT);
    expect(r.end - r.start).toBe(dur);
  });
});

describe('viewPoints（P1 优化后：依赖数据有序）', () => {
  it('hourly：输入有序时返回原顺序（不去重/不排序）', () => {
    const d = mkData(1000 + 2 * H, 1000);
    const pts = viewPoints(d, 'hourly');
    expect(pts.length).toBe(d.snapshots.length);
    expect(pts[0].t).toBe(1000);
    expect(pts[pts.length - 1].t).toBe(1000 + 2 * H);
  });

  it('daily：聚合按天，输入有序则输出有序（P1 后不再内部排序）', () => {
    const day = new Date(2026, 7, 6).getTime();
    const d: InitPayload = {
      ...mkData(1000),
      daily: [
        { day, total: 60, toppedUp: 0, granted: 0, currency: 'CNY' },
        { day: day + 86400e3, total: 50, toppedUp: 0, granted: 0, currency: 'CNY' },
      ],
    };
    const pts = viewPoints(d, 'daily');
    expect(pts.map((p) => p.t)).toEqual([day, day + 86400e3]);
  });

  it('computeDataBounds 取首尾', () => {
    const d = mkData(1000 + 2 * H, 1000);
    const b = computeDataBounds(d, 'hourly');
    expect(b).toEqual({ minT: 1000, maxT: 1000 + 2 * H });
  });
});
