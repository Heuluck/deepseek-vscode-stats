/**
 * 命令式 SVG 图表引擎（从 media/chart.js 整块迁移，不改渲染行为）。
 *
 * 职责：把「数据 + 视口」画到 <svg>，并处理缩放 / 平移 / 悬停 / 双击手势。
 * 不拥有 UI 状态：数据与视口来自 getState()，手势产生的视口变化经 onViewChange
 * 回写 Solid store，悬停信息经 onHover 交给 Solid Tooltip 组件。
 * 高频手势内部状态（缩放锚点、鼠标位置、pin 等）保留在引擎闭包内，不进 store。
 */
import type { ChartPoint, InitPayload } from '../types';
import type { ViewKey, ViewRange } from '../logic/viewport';
import { clampRange, computeDataBounds, getRangeNeighbors } from '../logic/viewport';
import { fmtAxisMoney, fmtClock, fmtDay, fmtDayShort, fmtMoney, fmtMonth } from '../logic/format';

const M = { top: 16, right: 18, bottom: 30, left: 66 };
const TIME_STEPS = [
  60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 6 * 3600e3, 12 * 3600e3,
  24 * 3600e3, 2 * 86400e3, 7 * 86400e3, 14 * 86400e3, 30 * 86400e3, 60 * 86400e3,
  90 * 86400e3, 180 * 86400e3, 365 * 86400e3,
];
const ns = 'http://www.w3.org/2000/svg';

/** 引擎读取的只读状态（由 Solid store 派生传入）。 */
export interface EngineState {
  data: InitPayload | null;
  view: ViewKey;
  viewRange: ViewRange | null;
  maxWindow: number;
  minWindow: number;
  /** 断点（数据缺口）连接线样式：虚线 / 实线 / 不连接。 */
  connectorStyle: 'dashed' | 'solid' | 'none';
  /** 断点连接线颜色；空串 = 跟随主线条颜色。 */
  connectorColor: string;
  /** 主线条绘制方式：直线 / 平滑曲线。 */
  lineStyle: 'straight' | 'smooth';
}

export interface TooltipRow {
  label: string;
  value: string;
}

/** 悬停信息（pointX/pointY 为图表坐标，相对 container 左上角；位置由 Tooltip 组件计算）。 */
export interface TooltipInfo {
  pointX: number;
  pointY: number;
  title: string;
  rows: TooltipRow[];
}

export interface EngineDeps {
  svg: SVGSVGElement;
  container: HTMLElement;
  getState: () => EngineState;
  onHover?: (info: TooltipInfo | null) => void;
  /** 手势（缩放/平移）改变视口时回写 store。 */
  onViewChange?: (vr: ViewRange, followLive: boolean) => void;
  /** 双击重置视图。 */
  onReset?: () => void;
}

interface LastCtx {
  xOf: (t: number) => number;
  yOf: (v: number) => number;
  pts: ChartPoint[];
  vr: ViewRange;
  currency: string;
  width: number;
  height: number;
}

export function createChartEngine(deps: EngineDeps) {
  const { svg, container } = deps;

  // ---------- 引擎内部状态（不进 store） ----------
  let last: LastCtx | null = null; // 上一次渲染的缩放上下文
  let mouseX = -1; // 当前鼠标在图表内的 x 像素坐标（悬停用）
  let pinT: number | null = null; // 缩放手势期间悬浮线钉住的数据时刻（缩放锚点）
  let pinUntil = 0; // 钉住截止时间（毫秒时间戳）
  let zoomAnchorT: number | null = null; // 缩放手势锚点
  let zoomAnchorFrac = 0;
  let lastWheelTs = 0;
  let drag: { startX: number; startRange: ViewRange } | null = null;

  // ---------- 刻度 ----------
  function niceTicks(min: number, max: number, count: number): number[] {
    const span = max - min;
    if (span <= 0) return [min];
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const out: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
      out.push(Number(v.toFixed(10)));
    }
    return out;
  }

  function niceTimeStep(dur: number): number {
    const target = dur / 8;
    for (const s of TIME_STEPS) {
      if (s >= target) return s;
    }
    return 365 * 86400e3;
  }

  function fmtAxisTime(t: number, step: number, view: ViewKey): string {
    if (view === 'monthly' || step >= 30 * 86400e3) return fmtMonth(t);
    if (view === 'daily' || step >= 24 * 3600e3) return fmtDayShort(t);
    return fmtClock(t);
  }

  // ---------- 降采样 & 断线 ----------
  function decimate(pts: ChartPoint[], max: number): ChartPoint[] {
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

  function medianDt(pts: ChartPoint[]): number {
    if (pts.length < 2) return 0;
    const ds: number[] = [];
    for (let i = 1; i < pts.length; i++) ds.push(pts[i].t - pts[i - 1].t);
    ds.sort((a, b) => a - b);
    return ds[Math.floor(ds.length / 2)];
  }

  /** 断线阈值：分时视图依赖实际轮询间隔（轮询间隔大时阈值相应放大）。 */
  function effectiveGapMs(pts: ChartPoint[], view: ViewKey): number {
    if (view === 'hourly') {
      return Math.max(10 * 60e3, medianDt(pts) * 3);
    }
    return view === 'daily' ? 2 * 86400e3 : 60 * 86400e3;
  }

  function buildSegments(pts: ChartPoint[], gapMs: number): ChartPoint[][] {
    const segs: ChartPoint[][] = [];
    let cur = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].t - pts[i - 1].t > gapMs) {
        segs.push(cur);
        cur = [];
      }
      cur.push(pts[i]);
    }
    if (cur.length) segs.push(cur);
    return segs;
  }

  /** 直线折线路径。 */
  function straightPath(
    pts: ChartPoint[],
    xOf: (t: number) => number,
    yOf: (v: number) => number
  ): string {
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.total).toFixed(1)}`)
      .join(' ');
  }

  /**
   * 平滑曲线路径：保单调三次插值（Fritsch–Carlson）。
   * 与 Catmull-Rom 不同，曲线在任意相邻两点之间严格单调，不会越过两端点的值，
   * 因此急转弯（如余额骤降）处不会出现先反向抬升的过冲假象。
   */
  function smoothPath(
    pts: ChartPoint[],
    xOf: (t: number) => number,
    yOf: (v: number) => number
  ): string {
    const n = pts.length;
    if (n < 2) return '';
    // 各段斜率（数据空间，单位：值/ms）
    const s: number[] = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const h = pts[i + 1].t - pts[i].t;
      s[i] = h > 0 ? (pts[i + 1].total - pts[i].total) / h : 0;
    }
    // 各点切线：内部点取相邻斜率均值，符号翻转处归零
    const m: number[] = new Array(n);
    m[0] = s[0];
    m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    }
    // Fritsch–Carlson 过冲限制
    for (let i = 0; i < n - 1; i++) {
      if (s[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const alpha = m[i] / s[i];
      const beta = m[i + 1] / s[i];
      const a2b2 = alpha * alpha + beta * beta;
      if (a2b2 > 9) {
        const tau = 3 / Math.sqrt(a2b2);
        m[i] = tau * alpha * s[i];
        m[i + 1] = tau * beta * s[i];
      }
    }
    let d = `M${xOf(pts[0].t).toFixed(1)},${yOf(pts[0].total).toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = pts[i + 1].t - pts[i].t;
      const c1x = xOf(pts[i].t) + (xOf(pts[i + 1].t) - xOf(pts[i].t)) / 3;
      const c1y = yOf(pts[i].total + (m[i] * h) / 3);
      const c2x = xOf(pts[i + 1].t) - (xOf(pts[i + 1].t) - xOf(pts[i].t)) / 3;
      const c2y = yOf(pts[i + 1].total - (m[i + 1] * h) / 3);
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xOf(
        pts[i + 1].t
      ).toFixed(1)},${yOf(pts[i + 1].total).toFixed(1)}`;
    }
    return d;
  }

  /**
   * 保单调单段曲线（p1→p2）的像素坐标折线近似（24 段），
   * 切线取两侧相邻斜率，方向不一致的归零并做 Fritsch–Carlson 限制，曲线不越过两端值。
   * 折线化后供连接线裁剪用（避免虚线相位在出屏端点上错乱）。
   */
  function flattenSmoothSegment(
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
  function clipSegmentToRect(
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

  /** 折线逐段裁剪成路径；全部在外返回空串。 */
  function polylineToClippedPath(
    poly: Array<[number, number]>,
    xmin: number,
    ymin: number,
    xmax: number,
    ymax: number
  ): string {
    let d = '';
    for (let i = 0; i < poly.length - 1; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[i + 1];
      const seg = clipSegmentToRect(x0, y0, x1, y1, xmin, ymin, xmax, ymax);
      if (!seg) continue;
      d += `M${seg[0].toFixed(1)},${seg[1].toFixed(1)} L${seg[2].toFixed(1)},${seg[3].toFixed(1)}`;
    }
    return d;
  }

  // ---------- SVG 辅助 ----------
  function line(
    parent: SVGElement,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cls: string
  ): void {
    const e = document.createElementNS(ns, 'line');
    e.setAttribute('x1', String(x1));
    e.setAttribute('y1', String(y1));
    e.setAttribute('x2', String(x2));
    e.setAttribute('y2', String(y2));
    e.setAttribute('class', cls);
    parent.appendChild(e);
  }

  function text(
    parent: SVGElement,
    x: number,
    y: number,
    str: string,
    anchor: string,
    dy?: string
  ): void {
    const e = document.createElementNS(ns, 'text');
    e.setAttribute('x', String(x));
    e.setAttribute('y', String(y));
    e.setAttribute('text-anchor', anchor || 'start');
    if (dy) e.setAttribute('dominant-baseline', dy);
    e.textContent = str;
    parent.appendChild(e);
  }

  // ---------- 渲染 ----------
  function render(): void {
    const st = deps.getState();
    if (!st.data || !computeDataBounds(st.data, st.view)) {
      // 空态 overlay 由 Solid 组件渲染，这里只清空画布
      svg.innerHTML = '';
      last = null;
      deps.onHover?.(null);
      return;
    }
    const { inRange: pts, left, right, leftPrev, rightNext } = getRangeNeighbors(
      st.data,
      st.view,
      st.viewRange
    );

    const width = container.clientWidth;
    const height = container.clientHeight;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.innerHTML = '';

    const innerW = width - M.left - M.right;
    const innerH = height - M.top - M.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    // 视口内没有点（放大到断档区间）时，坐标轴仍按当前 viewRange 渲染，缩放/平移保持可用
    const vr =
      st.viewRange ||
      (left ? { start: left.t, end: right ? right.t : left.t } : { start: 0, end: 1 });
    const t0 = vr.start;
    const t1 = vr.end;
    const xOf = (t: number) => M.left + ((t - t0) / (t1 - t0)) * innerW;

    // y 范围：优先区间内数据点；空区间退回两侧最近点，保证坐标轴/连接线有意义
    const ySource = pts.length ? pts : ([left, right].filter(Boolean) as ChartPoint[]);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of ySource) {
      if (p.total < yMin) yMin = p.total;
      if (p.total > yMax) yMax = p.total;
    }
    let padY = (yMax - yMin) * 0.08 || Math.max(1, Math.abs(yMax) * 0.05);
    if (padY === 0) padY = 1;
    yMin -= padY;
    yMax += padY;
    const yOf = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const currency = (pts[0] || left || right)?.currency || 'CNY';

    // 网格 + Y 轴
    const gY = document.createElementNS(ns, 'g');
    gY.setAttribute('class', 'axis');
    svg.appendChild(gY);
    for (const v of niceTicks(yMin, yMax, 5)) {
      const y = yOf(v);
      line(gY, M.left, y, width - M.right, y, 'grid');
      text(gY, M.left - 8, y, fmtAxisMoney(v, currency), 'end', 'middle');
    }

    // X 轴
    const dur = t1 - t0;
    const step = niceTimeStep(dur);
    const gX = document.createElementNS(ns, 'g');
    gX.setAttribute('class', 'axis');
    svg.appendChild(gX);
    const first = Math.ceil(t0 / step) * step;
    for (let t = first; t <= t1; t += step) {
      const x = xOf(t);
      line(gX, x, M.top, x, height - M.bottom, 'grid');
      text(gX, x, height - M.bottom + 16, fmtAxisTime(t, step, st.view), 'middle', 'hanging');
    }

    const lineStyle = st.lineStyle || 'straight';
    const connectorStyle = st.connectorStyle || 'dashed';
    const connectorColor = st.connectorColor || '';
    // 连接线裁剪到绘图区：端点出屏时虚线从屏幕边缘重新起算，避免相位错乱
    const plotX = M.left;
    const plotY = M.top;
    const plotW = width - M.right;
    const plotH = height - M.bottom;
    /** 断点连接线：a→b 用虚线/实线相连（垫在主线条下方；不参与面积填充）。 */
    const drawConnector = (
      a: ChartPoint,
      b: ChartPoint,
      p0: ChartPoint | null,
      p3: ChartPoint | null
    ): void => {
      if (connectorStyle === 'none') return;
      let d: string;
      if (lineStyle === 'smooth') {
        d = polylineToClippedPath(
          flattenSmoothSegment(p0 ?? a, a, b, p3 ?? b, xOf, yOf),
          plotX,
          plotY,
          plotW,
          plotH
        );
      } else {
        const seg = clipSegmentToRect(
          xOf(a.t),
          yOf(a.total),
          xOf(b.t),
          yOf(b.total),
          plotX,
          plotY,
          plotW,
          plotH
        );
        if (!seg) return;
        d = `M${seg[0].toFixed(1)},${seg[1].toFixed(1)} L${seg[2].toFixed(1)},${seg[3].toFixed(1)}`;
      }
      if (!d) return;
      const e = document.createElementNS(ns, 'path');
      e.setAttribute('d', d);
      e.setAttribute('class', 'connector' + (connectorStyle === 'solid' ? ' solid' : ''));
      // 自定义颜色用内联样式（CSS 的 stroke 规则优先级高于 SVG 属性）
      if (connectorColor) e.style.stroke = connectorColor;
      svg.appendChild(e);
    };

    if (pts.length > 0) {
      // 折线（断线分段）+ 面积 + 连接线。
      // 只用视口内点分段——不把离屏点并入段，避免生成从屏外跨入的"实线+面积"伪正常线。
      const decimated = decimate(pts, 4000);
      const gapMs = effectiveGapMs(decimated, st.view);
      const segments = buildSegments(decimated, gapMs);
      const baseY = yOf(yMin);
      const linePath = (seg: ChartPoint[]) =>
        lineStyle === 'smooth' ? smoothPath(seg, xOf, yOf) : straightPath(seg, xOf, yOf);

      // 左/右边缘断档连接线：视口边缘切过缺口时，从最近的离屏点连到首/末可见点。
      // 曲线控制点保留视口外的端点（leftPrev/rightNext），内部侧回退到 right/left，
      // 让缩放跨越数据点时连接线曲率连续稳定。
      const firstP = pts[0];
      const lastP = pts[pts.length - 1];
      if (left && firstP.t - left.t > gapMs) {
        drawConnector(left, firstP, leftPrev, pts[1] ?? right);
      }
      if (right && right.t - lastP.t > gapMs) {
        drawConnector(lastP, right, pts[pts.length - 2] ?? left, rightNext);
      }

      // 段间连接线（仅视口内的缺口）
      for (let i = 0; i < segments.length - 1; i++) {
        const segA = segments[i];
        const segB = segments[i + 1];
        drawConnector(
          segA[segA.length - 1],
          segB[0],
          segA.length >= 2 ? segA[segA.length - 2] : null,
          segB.length >= 2 ? segB[1] : null
        );
      }

      for (const seg of segments) {
        if (seg.length >= 2) {
          const dPath = linePath(seg);
          const area = document.createElementNS(ns, 'path');
          area.setAttribute(
            'd',
            `${dPath} L${xOf(seg[seg.length - 1].t).toFixed(1)},${baseY.toFixed(1)} L${xOf(
              seg[0].t
            ).toFixed(1)},${baseY.toFixed(1)} Z`
          );
          area.setAttribute('class', 'area');
          svg.appendChild(area);
          const path = document.createElementNS(ns, 'path');
          path.setAttribute('d', dPath);
          path.setAttribute('class', 'line');
          svg.appendChild(path);
        } else {
          const c = document.createElementNS(ns, 'circle');
          c.setAttribute('cx', String(xOf(seg[0].t)));
          c.setAttribute('cy', String(yOf(seg[0].total)));
          c.setAttribute('r', '3');
          c.setAttribute('class', 'line isolated');
          svg.appendChild(c);
        }
      }
    } else if (left && right) {
      // 视口落在断档区间内：画一条横穿视口的连接线，明确"这里没有采样"（尊重连接线设置）
      drawConnector(left, right, leftPrev, rightNext);
    }

    // 只要视图下有数据就保留 last 上下文，缩放/平移在空区间也保持可用
    last = { xOf, yOf, pts, vr, currency, width, height };
    drawHover();
  }

  // ---------- 悬停 ----------
  function drawHover(): void {
    svg.querySelectorAll('.crosshair,.hover-dot').forEach((n) => n.remove());
    if (!last || !last.pts.length) {
      deps.onHover?.(null);
      return;
    }
    const { xOf, yOf, pts, currency } = last;
    const st = deps.getState();
    const pinned = pinT !== null && Date.now() < pinUntil;
    let idx = -1;
    let best = Infinity;
    if (pinned) {
      // 缩放手势中：悬浮线钉在缩放锚点上（标记放大位置）
      for (let i = 0; i < pts.length; i++) {
        const dx = Math.abs(pts[i].t - pinT!);
        if (dx < best) {
          best = dx;
          idx = i;
        }
      }
    } else if (mouseX >= 0) {
      // 平常：跟随鼠标
      for (let i = 0; i < pts.length; i++) {
        const dx = Math.abs(xOf(pts[i].t) - mouseX);
        if (dx < best) {
          best = dx;
          idx = i;
        }
      }
      if (best > 80) idx = -1;
    }
    if (idx < 0) {
      deps.onHover?.(null);
      return;
    }
    const p = pts[idx];
    const x = xOf(p.t);
    const y = yOf(p.total);

    const c = document.createElementNS(ns, 'line');
    c.setAttribute('class', 'crosshair');
    c.setAttribute('x1', String(x));
    c.setAttribute('y1', String(M.top));
    c.setAttribute('x2', String(x));
    c.setAttribute('y2', String(container.clientHeight - M.bottom));
    svg.appendChild(c);

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'hover-dot');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', '4');
    svg.appendChild(dot);

    const title =
      st.view === 'monthly'
        ? fmtMonth(p.t)
        : st.view === 'daily'
        ? fmtDay(p.t)
        : fmtDayShort(p.t) + ' ' + fmtClock(p.t);
    deps.onHover?.({
      pointX: x,
      pointY: y,
      title,
      rows: [
        { label: '总余额', value: fmtMoney(p.total, currency) },
        { label: '充值', value: fmtMoney(p.toppedUp, currency) },
        { label: '赠送', value: fmtMoney(p.granted, currency) },
      ],
    });
  }

  // ---------- 交互：缩放 / 平移 / 悬停 ----------
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const st = deps.getState();
    if (!last || !st.viewRange) return;
    const now = Date.now();
    const rect = svg.getBoundingClientRect();
    const innerW = rect.width - M.left - M.right;
    if (innerW <= 0) return;
    const mx = e.clientX - rect.left;
    const vr = st.viewRange;
    const tCursor = vr.start + ((mx - M.left) / innerW) * (vr.end - vr.start);
    if (now - lastWheelTs > 300) {
      // 手势开始：锚点吸附到最近的可见数据点（与悬浮线所指一致）
      const pts = last.pts;
      let best = Infinity;
      let bt = tCursor;
      for (const p of pts) {
        const dx = Math.abs(p.t - tCursor);
        if (dx < best) {
          best = dx;
          bt = p.t;
        }
      }
      const snapLimit = (vr.end - vr.start) * 0.15;
      zoomAnchorT = best <= snapLimit ? bt : tCursor;
      zoomAnchorFrac = (zoomAnchorT - vr.start) / (vr.end - vr.start);
    }
    lastWheelTs = now;
    // 缩放进行中：悬浮线钉在锚点上，直观显示正在围绕哪个点缩放
    pinT = zoomAnchorT;
    pinUntil = now + 350;
    const factor = Math.pow(1.15, -e.deltaY / 120);
    let dur = (vr.end - vr.start) * factor;
    dur = Math.min(st.maxWindow, Math.max(st.minWindow, dur));
    const bounds = computeDataBounds(st.data, st.view);
    const r = bounds
      ? clampRange(zoomAnchorT! - zoomAnchorFrac * dur, zoomAnchorT! + (1 - zoomAnchorFrac) * dur, bounds, st.minWindow)
      : { start: zoomAnchorT! - zoomAnchorFrac * dur, end: zoomAnchorT! + (1 - zoomAnchorFrac) * dur };
    // 只回写 store，由 App 的 createEffect 统一渲染（避免与 effect 双重渲染）
    deps.onViewChange?.(r, false);
  }

  function onPointerDown(e: PointerEvent): void {
    const st = deps.getState();
    if (e.button !== 0 || !st.viewRange) return;
    drag = { startX: e.clientX, startRange: { ...st.viewRange } };
    mouseX = -1; // 拖拽平移时隐藏悬浮线，避免误导
    container.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    const st = deps.getState();
    if (!drag || !st.viewRange) return;
    const rect = svg.getBoundingClientRect();
    const innerW = rect.width - M.left - M.right;
    const dur = drag.startRange.end - drag.startRange.start;
    const shift = ((drag.startX - e.clientX) / innerW) * dur;
    const bounds = computeDataBounds(st.data, st.view);
    const r = bounds
      ? clampRange(drag.startRange.start + shift, drag.startRange.end + shift, bounds, st.minWindow)
      : { start: drag.startRange.start + shift, end: drag.startRange.end + shift };
    // 只回写 store，由 App 的 createEffect 统一渲染
    deps.onViewChange?.(r, false);
  }

  function onPointerEnd(): void {
    drag = null;
  }

  function onMouseMove(e: MouseEvent): void {
    if (drag) return;
    const rect = svg.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    // 用户主动移动鼠标 → 立即结束缩放锚点钉住，指示线跟随鼠标（无需等 pin 窗口过期）
    pinUntil = 0;
    drawHover();
  }

  function onMouseLeave(): void {
    mouseX = -1;
    drawHover();
  }

  function onDblClick(): void {
    deps.onReset?.();
  }

  // ---------- 绑定 ----------
  const ro = new ResizeObserver(() => {
    if (deps.getState().data) render();
  });
  ro.observe(container);

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerEnd);
  container.addEventListener('pointercancel', onPointerEnd);
  container.addEventListener('mousemove', onMouseMove);
  container.addEventListener('mouseleave', onMouseLeave);
  container.addEventListener('dblclick', onDblClick);

  return {
    render,
    dispose(): void {
      ro.disconnect();
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerEnd);
      container.removeEventListener('pointercancel', onPointerEnd);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('dblclick', onDblClick);
    },
  };
}
