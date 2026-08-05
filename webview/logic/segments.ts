/**
 * 图表几何规约（纯逻辑，可单测）：数据点 + 视口 → 绘制清单。
 * 统一的模型替代了命令式引擎里散落的断档/空区间/边缘缺口分支：
 * 实线段 = 视口内、无缺口的连续点段；缺口 = 任意相邻两点间隔 > gapMs（与视口相交才画）。
 * 连接线的 prev/next 取全局相邻点，与视口无关 → 缩放跨越数据点时曲率稳定。
 */
import type { ChartPoint } from '../types';
import type { ViewKey, ViewRange } from './viewport';

/** 缺口连接线：from→to 之间有断档；prev/next 为全局相邻点（曲线切线上下文）。 */
export interface GapConnector {
  from: ChartPoint;
  to: ChartPoint;
  /** from 的前一点；无则 null。 */
  prev: ChartPoint | null;
  /** to 的后一点；无则 null。 */
  next: ChartPoint | null;
}

export interface ChartGeometry {
  /** 实线 + 面积：视口内、无缺口的连续点段（长度 ≥ 2）。 */
  solid: ChartPoint[][];
  /** 孤立点：视口内单点段。 */
  isolated: ChartPoint[];
  /** 与视口相交的缺口连接线（含边缘缺口；离屏部分由渲染端裁剪）。 */
  gaps: GapConnector[];
}

/** 降采样：超过 max 点时按桶保留 min/max，保极值形状。 */
export function decimate(pts: ChartPoint[], max: number): ChartPoint[] {
  if (pts.length <= max) return pts;
  const out: ChartPoint[] = [];
  const bucket = Math.ceil(pts.length / max);
  for (let i = 0; i < pts.length; i += bucket) {
    const slice = pts.slice(i, i + bucket);
    let minP = slice[0];
    let maxP = slice[0];
    for (const p of slice) {
      if (p.total < minP.total) minP = p;
      if (p.total > maxP.total) maxP = p;
    }
    out.push(slice[0]);
    if (minP !== slice[0] && minP !== slice[slice.length - 1]) out.push(minP);
    if (maxP !== slice[0] && maxP !== slice[slice.length - 1] && maxP !== minP) out.push(maxP);
    out.push(slice[slice.length - 1]);
  }
  return out;
}

export function medianDt(pts: ChartPoint[]): number {
  if (pts.length < 2) return 0;
  const ds: number[] = [];
  for (let i = 1; i < pts.length; i++) ds.push(pts[i].t - pts[i - 1].t);
  ds.sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)];
}

/** 断线阈值：分时视图依赖实际轮询间隔（轮询间隔大时阈值相应放大）。 */
export function effectiveGapMs(pts: ChartPoint[], view: ViewKey): number {
  if (view === 'hourly') {
    return Math.max(10 * 60e3, medianDt(pts) * 3);
  }
  return view === 'daily' ? 2 * 86400e3 : 60 * 86400e3;
}

/**
 * 核心规约：把（已排序、可选已降采样的）数据点 + 视口计算成绘制清单。
 * - 实线段/孤立点：视口内（含左右各 overscan 个点的"预渲染"余量）
 * - 缺口：所有相邻间隔 > gapMs 的对，与（扩展后）范围相交才输出（含跨视口的边缘缺口）
 *
 * overscan：视口外左右各最多 N 个点也纳入几何。渲染端用 clipPath 把绘图区外的部分
 * 裁掉，平移/缩放时曲线整体滑入/滑出视口，避免点在边缘"弹入"造成的顿挫。
 */
export function computeChartGeometry(
  points: ChartPoint[],
  vr: ViewRange,
  gapMs: number,
  overscan = 10
): ChartGeometry {
  const n = points.length;
  if (n === 0) return { solid: [], isolated: [], gaps: [] };
  // 视口内索引区间 [lo, hi]（points 已排序）
  let lo = 0;
  let hi = n - 1;
  while (lo < n && points[lo].t < vr.start) lo++;
  while (hi >= 0 && points[hi].t > vr.end) hi--;
  if (hi < lo) {
    // 视口内无数据点（空区间）：lo/hi 退化为视口两侧最近点，仍画两侧连接线
    hi = lo - 1;
  }
  const lo2 = Math.max(0, lo - overscan);
  const hi2 = Math.min(n - 1, hi + overscan);
  const t0 = points[lo2].t;
  const t1 = points[hi2].t;

  const solid: ChartPoint[][] = [];
  const isolated: ChartPoint[] = [];
  const gaps: GapConnector[] = [];
  let run: ChartPoint[] = [];
  const flush = (): void => {
    if (run.length === 1) isolated.push(run[0]);
    else if (run.length >= 2) solid.push(run);
    run = [];
  };
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const gapBefore = i > 0 && p.t - points[i - 1].t > gapMs;
    if (gapBefore) {
      const a = points[i - 1];
      const b = p;
      // 缺口与（扩展后）范围相交才需要画（离屏部分渲染端裁剪掉）
      if (b.t >= t0 && a.t <= t1) {
        gaps.push({
          from: a,
          to: b,
          prev: points[i - 2] ?? null,
          next: points[i + 1] ?? null,
        });
      }
      flush();
    }
    if (p.t >= t0 && p.t <= t1) run.push(p);
    else flush();
  }
  flush();
  return { solid, isolated, gaps };
}
