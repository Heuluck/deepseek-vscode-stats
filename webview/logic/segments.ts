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
 * - 实线段/孤立点：仅视口内
 * - 缺口：所有相邻间隔 > gapMs 的对，与视口相交才输出（含跨视口的边缘缺口）
 */
export function computeChartGeometry(
  points: ChartPoint[],
  vr: ViewRange,
  gapMs: number
): ChartGeometry {
  const solid: ChartPoint[][] = [];
  const isolated: ChartPoint[] = [];
  const gaps: GapConnector[] = [];
  let run: ChartPoint[] = [];
  const flush = (): void => {
    if (run.length === 1) isolated.push(run[0]);
    else if (run.length >= 2) solid.push(run);
    run = [];
  };
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const gapBefore = i > 0 && p.t - points[i - 1].t > gapMs;
    if (gapBefore) {
      const a = points[i - 1];
      const b = p;
      // 缺口与视口相交才需要画（离屏部分渲染端裁剪掉）
      if (b.t >= vr.start && a.t <= vr.end) {
        gaps.push({
          from: a,
          to: b,
          prev: points[i - 2] ?? null,
          next: points[i + 1] ?? null,
        });
      }
      flush();
    }
    if (p.t >= vr.start && p.t <= vr.end) run.push(p);
    else flush();
  }
  flush();
  return { solid, isolated, gaps };
}
