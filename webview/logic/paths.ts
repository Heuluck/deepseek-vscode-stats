/** 图表路径生成（纯逻辑）：直线 / 保单调平滑曲线 + Liang–Barsky 裁剪。 */
import { curveMonotoneX, line as d3Line } from 'd3-shape';
import type { ChartPoint } from '../types';

/** 直线折线路径。 */
export function straightPath(
  pts: ChartPoint[],
  xOf: (t: number) => number,
  yOf: (v: number) => number
): string {
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.total).toFixed(1)}`)
    .join(' ');
}

/**
 * 平滑曲线路径：d3-shape 的 curveMonotoneX（Fritsch–Carlson 保单调三次插值）。
 * 曲线在任意相邻两点之间严格单调，不会越过两端点的值，
 * 急转弯（如余额骤降）处不会出现先反向抬升的过冲假象。
 * accessor 内保留 1 位小数，与旧手写实现的 SVG 输出格式一致。
 */
export function smoothPath(
  pts: ChartPoint[],
  xOf: (t: number) => number,
  yOf: (v: number) => number
): string {
  const n = pts.length;
  if (n < 2) return '';
  const l = d3Line<ChartPoint>()
    .x((p) => Number(xOf(p.t).toFixed(1)))
    .y((p) => Number(yOf(p.total).toFixed(1)))
    .curve(curveMonotoneX);
  return l(pts) ?? '';
}

/**
 * 保单调单段曲线（p1→p2）的像素坐标折线近似（64 段）。
 * 注意：此函数保留手写实现而非改用 d3——d3 的 curve 接口不暴露采样点，
 * 而连接线需要折线化后逐段 Liang–Barsky 裁剪（虚线相位在屏幕边缘重同步），
 * 换成 d3 会破坏连接线的裁剪/虚线逻辑。
 * 切线取两侧相邻斜率，方向不一致的归零并做 Fritsch–Carlson 限制，曲线不越过两端值。
 */
export function flattenSmoothSegment(
  p0: ChartPoint,
  p1: ChartPoint,
  p2: ChartPoint,
  p3: ChartPoint,
  xOf: (t: number) => number,
  yOf: (v: number) => number
): Array<[number, number]> {
  const h = p2.t - p1.t;
  if (h <= 0) return [[xOf(p1.t), yOf(p1.total)], [xOf(p2.t), yOf(p2.total)]];
  const s = (p2.total - p1.total) / h;
  if (s === 0) return [[xOf(p1.t), yOf(p1.total)], [xOf(p2.t), yOf(p2.total)]];
  let m1 = p1.t > p0.t ? (p1.total - p0.total) / (p1.t - p0.t) : s;
  let m2 = p3.t > p2.t ? (p3.total - p2.total) / (p3.t - p2.t) : s;
  // 与缺口方向不一致的切线归零，保证段内单调
  if (m1 * s <= 0) m1 = 0;
  if (m2 * s <= 0) m2 = 0;
  const alpha = m1 / s;
  const beta = m2 / s;
  const a2b2 = alpha * alpha + beta * beta;
  if (a2b2 > 9) {
    const tau = 3 / Math.sqrt(a2b2);
    m1 = tau * alpha * s;
    m2 = tau * beta * s;
  }
  const bx0 = xOf(p1.t);
  const by0 = yOf(p1.total);
  const bx3 = xOf(p2.t);
  const by3 = yOf(p2.total);
  const c1x = bx0 + (bx3 - bx0) / 3;
  const c1y = yOf(p1.total + (m1 * h) / 3);
  const c2x = bx3 - (bx3 - bx0) / 3;
  const c2y = yOf(p2.total - (m2 * h) / 3);
  const STEPS = 64;
  const out: Array<[number, number]> = [[bx0, by0]];
  for (let i = 1; i < STEPS; i++) {
    const u = i / STEPS;
    const w = 1 - u;
    out.push([
      w * w * w * bx0 + 3 * w * w * u * c1x + 3 * w * u * u * c2x + u * u * u * bx3,
      w * w * w * by0 + 3 * w * w * u * c1y + 3 * w * u * u * c2y + u * u * u * by3,
    ]);
  }
  out.push([bx3, by3]);
  return out;
}

/** Liang–Barsky 线段裁剪到矩形。返回裁剪后的 [x0,y0,x1,y1]；整条在外返回 null。 */
export function clipSegmentToRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number
): [number, number, number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

/** 折线逐段裁剪成路径；全部在外返回空串。
 *  相邻可见段合并为同一子路径（首个可见段 M、后续 L），保证虚线相位在可见区内连续——
 *  若每段独立 M L，SVG 的 stroke-dasharray 会逐段重置，折线化（如曲线连接线 64 段）后
 *  每段都短于虚线周期，拼起来像实线。
 *  仅在进/出绘图区边界（被裁剪的段）处断开，使虚线从屏幕边缘重新起算。 */
export function polylineToClippedPath(
  poly: Array<[number, number]>,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number
): string {
  let d = '';
  let drawing = false;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[i + 1];
    const seg = clipSegmentToRect(x0, y0, x1, y1, xmin, ymin, xmax, ymax);
    if (!seg) {
      drawing = false;
      continue;
    }
    if (!drawing) {
      d += `M${seg[0].toFixed(1)},${seg[1].toFixed(1)}`;
      drawing = true;
    }
    d += `L${seg[2].toFixed(1)},${seg[3].toFixed(1)}`;
  }
  return d;
}
