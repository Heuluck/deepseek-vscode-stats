/**
 * Solid 声明式图表：数据 + 视口 → 几何 → 路径，全部由 memo 派生；
 * 手势（缩放/平移/悬停/双击）只读写 store 与少量高频 signal，不直接操作 DOM。
 * 取代原命令式 chartEngine.ts。
 */
import { createEffect, createMemo, For, onCleanup, onMount, Show } from 'solid-js';
import { createSignal } from 'solid-js';
import { resetView, setTooltipInfo, setViewRange, store } from '../store';
import type { ViewRange } from '../logic/viewport';
import { clampRange, computeDataBounds, viewPoints } from '../logic/viewport';
import type { ChartPoint } from '../types';
import {
  computeChartGeometry,
  decimate,
  effectiveGapMs,
} from '../logic/segments';
import {
  clipSegmentToRect,
  flattenSmoothSegment,
  polylineToClippedPath,
  smoothPath,
  straightPath,
} from '../logic/paths';
import {
  enforceMinSpan,
  estimateTextWidth,
  fmtAxisTime,
  M,
  niceTicks,
  niceTimeStep,
} from '../logic/axis';
import {
  fmtAxisMoney,
  fmtClock,
  fmtDay,
  fmtDayShort,
  fmtMoney,
  fmtMonth,
} from '../logic/format';
import { Tooltip } from './Tooltip';
import { Empty } from './Empty';

interface XLabel {
  t: number;
  x: number;
  text: string;
  w: number;
  anchor: 'start' | 'middle' | 'end';
}

interface YLabel {
  v: number;
  y: number;
  text: string;
}

interface Layout {
  xOf: (t: number) => number;
  yOf: (v: number) => number;
  yMin: number;
  yMax: number;
  currency: string;
  w: number;
  h: number;
  xStep: number;
  xTicks: number[];
  xLabels: XLabel[];
  yTicks: number[];
  yLabels: YLabel[];
  plotLeft: number;
  plotRight: number;
}

export function Chart() {
  let wrapRef: HTMLDivElement | undefined;
  let svgRef: SVGSVGElement | undefined;

  // ---------- 高频手势内部状态（不进 store） ----------
  const [size, setSize] = createSignal({ w: 0, h: 0 });
  const [mouseX, setMouseX] = createSignal(-1); // 悬停 x 像素坐标
  const [pinT, setPinT] = createSignal<number | null>(null); // 缩放手势钉住的数据时刻
  const [pinUntil, setPinUntil] = createSignal(0);
  let zoomAnchorT: number | null = null; // 缩放手势锚点
  let zoomAnchorFrac = 0;
  let lastWheelTs = 0;
  let drag: { startX: number; startRange: ViewRange } | null = null;

  // ---------- 尺寸（ResizeObserver → signal） ----------
  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (wrapRef) setSize({ w: wrapRef.clientWidth, h: wrapRef.clientHeight });
    });
    ro.observe(wrapRef!);
    if (wrapRef) setSize({ w: wrapRef.clientWidth, h: wrapRef.clientHeight });
    onCleanup(() => ro.disconnect());
  });

  // ---------- 数据 + 几何（纯函数派生） ----------
  const chartData = createMemo(() => {
    const data = store.data;
    const view = store.view;
    if (!data) return null;
    const all = viewPoints(data, view);
    if (!all.length) return null;
    const bounds = { minT: all[0].t, maxT: all[all.length - 1].t };
    const vr = store.viewRange ?? { start: bounds.minT, end: bounds.maxT };
    const decimated = decimate(all, 4000);
    const gapMs = effectiveGapMs(decimated, view);
    return {
      view,
      vr,
      bounds,
      geom: computeChartGeometry(decimated, vr, gapMs),
    };
  });

  // ---------- 布局 / 刻度 ----------
  const layout = createMemo<Layout | null>(() => {
    const cd = chartData();
    const { w, h } = size();
    if (!cd || w <= 0 || h <= 0) return null;
    const { vr, geom, view } = cd;
    const t0 = vr.start;
    const t1 = vr.end;

    // y 范围：自适应基线——数据贴近 0（最小值 ≤ 量程 20%）才保留 0 基线；
    // 否则按数据范围缩放，避免高余额区间曲线被压成一条平线
    const yPts: ChartPoint[] = [];
    // Y 轴只按真实视口内的点算；overscan 点是纯渲染预取，不参与自适应
    for (const seg of geom.solid)
      for (const p of seg) if (p.t >= vr.start && p.t <= vr.end) yPts.push(p);
    for (const p of geom.isolated) if (p.t >= vr.start && p.t <= vr.end) yPts.push(p);
    for (const g of geom.gaps) {
      // 与真实视口相交的缺口才计入（保留旧版边缘缺口端点参与 Y 轴的行为）
      if (g.to.t >= vr.start && g.from.t <= vr.end) {
        yPts.push(g.from);
        yPts.push(g.to);
      }
    }
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of yPts) {
      if (p.total < yMin) yMin = p.total;
      if (p.total > yMax) yMax = p.total;
    }
    if (!isFinite(yMin)) {
      yMin = 0;
      yMax = 1;
    }
    const startAtZero = yMin <= yMax * 0.2;
    if (startAtZero) yMin = 0;
    let padY = (yMax - yMin) * 0.08 || Math.max(1, Math.abs(yMax) * 0.05);
    if (padY === 0) padY = 1;
    yMin = Math.max(0, yMin - padY);
    yMax += padY;
    // 最小跨度约束：限制纵向放大倍数（默认跨度 ≥ 最大值的 20%），0 表示关闭
    const spanRatio = store.yMinSpanRatio ?? 0.2;
    ({ yMin, yMax } = enforceMinSpan(yMin, yMax, spanRatio));
    const currency = yPts[0]?.currency || 'CNY';
    const yTicks = niceTicks(yMin, yMax, 5);

    // 左缘按最宽 Y 标签自适应，避免大金额数字被裁切，也为时间标签留出空间
    const yLabelW = yTicks.reduce(
      (m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, currency))),
      0
    );
    const plotLeft = Math.max(M.left, yLabelW + 14);
    const plotRight = w - M.right;
    const innerW = w - plotLeft - M.right;
    const innerH = h - M.top - M.bottom;
    if (innerW <= 0 || innerH <= 0) return null;
    const xOf = (t: number) => plotLeft + ((t - t0) / (t1 - t0)) * innerW;
    const yOf = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    // Y 标签：0 点（底部）与最大值（顶部）必保留，中间按垂直间距去重防重叠
    const yLabels: YLabel[] = [];
    {
      let lastY = Infinity;
      for (let i = 0; i < yTicks.length; i++) {
        const v = yTicks[i];
        const y = yOf(v);
        const isEdge = i === 0 || i === yTicks.length - 1;
        if (!isEdge && lastY - y < 16) continue; // 间距不足会重叠 → 跳过中间标签
        yLabels.push({ v, y, text: fmtAxisMoney(v, currency) });
        lastY = y;
      }
    }

    const dur = t1 - t0;
    const xStep = niceTimeStep(dur);
    const xTicks: number[] = [];
    for (let t = Math.ceil(t0 / xStep) * xStep; t <= t1 + 1e-9; t += xStep) xTicks.push(t);
    // X 标签：首尾（起点/末端）必保留，用 start/end 锚点避免出界；中间按碰撞去重
    const xLabels: XLabel[] = [];
    {
      const all = xTicks.map((t) => {
        const x = xOf(t);
        const text = fmtAxisTime(t, xStep, view);
        return { t, x, text, w: estimateTextWidth(text) };
      });
      if (all.length === 1) {
        xLabels.push({ ...all[0], anchor: 'middle' });
      } else if (all.length >= 2) {
        const firstL: XLabel = { ...all[0], anchor: 'start' };
        const lastL: XLabel = { ...all[all.length - 1], anchor: 'end' };
        xLabels.push(firstL);
        let prevRight = firstL.x + firstL.w; // start 锚点 → 右缘
        for (let i = 1; i < all.length - 1; i++) {
          const lbl = all[i];
          const l = lbl.x - lbl.w / 2;
          const r = lbl.x + lbl.w / 2;
          if (l < prevRight + 10) continue;
          if (r > plotRight - 4) continue;
          xLabels.push({ ...lbl, anchor: 'middle' });
          prevRight = r;
        }
        // 末端标签（end 锚点）：必要时挤掉与之冲突的中间标签
        const lastLeft = lastL.x - lastL.w;
        while (xLabels.length > 1 && lastLeft < prevRight + 10) {
          xLabels.pop();
          const prev = xLabels[xLabels.length - 1];
          prevRight = prev.x + (prev.anchor === 'start' ? prev.w : prev.w / 2);
        }
        xLabels.push(lastL);
      }
    }

    return {
      xOf,
      yOf,
      yMin,
      yMax,
      currency,
      w,
      h,
      xStep,
      xTicks,
      xLabels,
      yTicks,
      yLabels,
      plotLeft,
      plotRight,
    };
  });

  // ---------- 绘制路径 ----------
  const solidDraws = createMemo(() => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay) return [] as { d: string; area: string }[];
    const smooth = (store.config?.lineStyle ?? 'straight') === 'smooth';
    const baseY = lay.yOf(lay.yMin);
    return cd.geom.solid.map((seg) => {
      const d = smooth ? smoothPath(seg, lay.xOf, lay.yOf) : straightPath(seg, lay.xOf, lay.yOf);
      return {
        d,
        area: `${d} L${lay.xOf(seg[seg.length - 1].t).toFixed(1)},${baseY.toFixed(1)} L${lay.xOf(
          seg[0].t
        ).toFixed(1)},${baseY.toFixed(1)} Z`,
      };
    });
  });

  const connectorDraws = createMemo(() => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay) return [] as { d: string; solid: boolean; color: string }[];
    const style = store.config?.connectorStyle ?? 'dashed';
    if (style === 'none') return [];
    const color = store.config?.connectorColor ?? '';
    const smooth = (store.config?.lineStyle ?? 'straight') === 'smooth';
    const { xOf, yOf } = lay;
    // clipSegmentToRect / polylineToClippedPath 第 5~8 参是绝对坐标 (xmin,ymin,xmax,ymax)，
    // 不能把"绘图区宽度"当 xmax——否则右缘被剪在 plotLeft 之前，连接线到不了右边缘
    const plotX = lay.plotLeft;
    const plotY = M.top;
    const plotRight = lay.plotRight;
    const plotBottom = lay.h - M.bottom;
    const out: { d: string; solid: boolean; color: string }[] = [];
    for (const g of cd.geom.gaps) {
      let d: string;
      if (smooth) {
        d = polylineToClippedPath(
          flattenSmoothSegment(g.prev ?? g.from, g.from, g.to, g.next ?? g.to, xOf, yOf),
          plotX,
          plotY,
          plotRight,
          plotBottom
        );
      } else {
        const seg = clipSegmentToRect(
          xOf(g.from.t),
          yOf(g.from.total),
          xOf(g.to.t),
          yOf(g.to.total),
          plotX,
          plotY,
          plotRight,
          plotBottom
        );
        if (!seg) continue;
        d = `M${seg[0].toFixed(1)},${seg[1].toFixed(1)} L${seg[2].toFixed(1)},${seg[3].toFixed(1)}`;
      }
      if (d) out.push({ d, solid: style === 'solid', color });
    }
    return out;
  });

  // ---------- 悬停 ----------
  const hover = createMemo(() => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay) return null;
    const pts: ChartPoint[] = [];
    // 交互只命中真实视口内的点；视口外 overscan 点是纯渲染预取，不参与悬停
    const t0 = cd.vr.start;
    const t1 = cd.vr.end;
    for (const seg of cd.geom.solid)
      for (const p of seg) if (p.t >= t0 && p.t <= t1) pts.push(p);
    for (const p of cd.geom.isolated) if (p.t >= t0 && p.t <= t1) pts.push(p);
    if (!pts.length) return null;
    const { xOf, yOf } = lay;
    const pinned = pinT() !== null && Date.now() < pinUntil();
    let idx = -1;
    let best = Infinity;
    if (pinned) {
      const pt = pinT()!;
      for (let i = 0; i < pts.length; i++) {
        const dx = Math.abs(pts[i].t - pt);
        if (dx < best) {
          best = dx;
          idx = i;
        }
      }
    } else if (mouseX() >= 0) {
      for (let i = 0; i < pts.length; i++) {
        const dx = Math.abs(xOf(pts[i].t) - mouseX());
        if (dx < best) {
          best = dx;
          idx = i;
        }
      }
      if (best > 80) idx = -1;
    }
    if (idx < 0) return null;
    const p = pts[idx];
    return { x: xOf(p.t), y: yOf(p.total), p };
  });

  // 悬停 → tooltip 信息（经 store signal 交给 Tooltip 组件）
  createEffect(() => {
    const h = hover();
    const lay = layout();
    if (!h || !lay) {
      setTooltipInfo(null);
      return;
    }
    const title =
      store.view === 'monthly'
        ? fmtMonth(h.p.t)
        : store.view === 'daily'
        ? fmtDay(h.p.t)
        : fmtDayShort(h.p.t) + ' ' + fmtClock(h.p.t);
    setTooltipInfo({
      pointX: h.x,
      pointY: h.y,
      title,
      rows: [
        { label: '总余额', value: fmtMoney(h.p.total, lay.currency) },
        { label: '充值', value: fmtMoney(h.p.toppedUp, lay.currency) },
        { label: '赠送', value: fmtMoney(h.p.granted, lay.currency) },
      ],
    });
  });

  // ---------- 手势（只回写 store，渲染由 memo 统一驱动，无双重渲染） ----------
  onMount(() => {
    const svg = svgRef!;
    const container = wrapRef!;

    function onWheel(e: WheelEvent): void {
      e.preventDefault();
      if (!store.viewRange) return;
      const lay = layout();
      if (!lay) return;
      const now = Date.now();
      const rect = svg.getBoundingClientRect();
      const innerW = rect.width - lay.plotLeft - M.right;
      if (innerW <= 0) return;
      const mx = e.clientX - rect.left;
      const vr = store.viewRange;
      const tCursor = vr.start + ((mx - lay.plotLeft) / innerW) * (vr.end - vr.start);
      if (now - lastWheelTs > 300) {
        // 手势开始：锚点吸附到最近的可见数据点（与悬浮线所指一致）
        const cd = chartData();
        let best = Infinity;
        let bt = tCursor;
        if (cd) {
          for (const seg of cd.geom.solid) {
            for (const p of seg) {
              const dx = Math.abs(p.t - tCursor);
              if (dx < best) {
                best = dx;
                bt = p.t;
              }
            }
          }
          for (const p of cd.geom.isolated) {
            const dx = Math.abs(p.t - tCursor);
            if (dx < best) {
              best = dx;
              bt = p.t;
            }
          }
        }
        const snapLimit = (vr.end - vr.start) * 0.15;
        zoomAnchorT = best <= snapLimit ? bt : tCursor;
        zoomAnchorFrac = (zoomAnchorT - vr.start) / (vr.end - vr.start);
      }
      lastWheelTs = now;
      // 缩放进行中：悬浮线钉在锚点上，直观显示正在围绕哪个点缩放
      setPinT(zoomAnchorT);
      setPinUntil(now + 350);
      const factor = Math.pow(1.15, -e.deltaY / 120);
      let dur = (vr.end - vr.start) * factor;
      dur = Math.min(store.maxWindow, Math.max(store.minWindow, dur));
      const bounds = computeDataBounds(store.data, store.view);
      const r = bounds
        ? clampRange(
            zoomAnchorT! - zoomAnchorFrac * dur,
            zoomAnchorT! + (1 - zoomAnchorFrac) * dur,
            bounds,
            store.minWindow
          )
        : {
            start: zoomAnchorT! - zoomAnchorFrac * dur,
            end: zoomAnchorT! + (1 - zoomAnchorFrac) * dur,
          };
      setViewRange(r, false);
    }

    function onPointerDown(e: PointerEvent): void {
      if (e.button !== 0 || !store.viewRange) return;
      drag = { startX: e.clientX, startRange: { ...store.viewRange } };
      setMouseX(-1); // 拖拽平移时隐藏悬浮线，避免误导
      container.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent): void {
      if (!drag || !store.viewRange) return;
      const lay = layout();
      if (!lay) return;
      const rect = svg.getBoundingClientRect();
      const innerW = rect.width - lay.plotLeft - M.right;
      const dur = drag.startRange.end - drag.startRange.start;
      const shift = ((drag.startX - e.clientX) / innerW) * dur;
      const bounds = computeDataBounds(store.data, store.view);
      const r = bounds
        ? clampRange(
            drag.startRange.start + shift,
            drag.startRange.end + shift,
            bounds,
            store.minWindow
          )
        : { start: drag.startRange.start + shift, end: drag.startRange.end + shift };
      setViewRange(r, false);
    }

    function onPointerEnd(): void {
      drag = null;
    }

    function onMouseMove(e: MouseEvent): void {
      if (drag) return;
      const rect = svg.getBoundingClientRect();
      setMouseX(e.clientX - rect.left);
      // 用户主动移动鼠标 → 立即解除缩放锚点钉住，指示线跟随鼠标
      setPinUntil(0);
    }

    function onMouseLeave(): void {
      setMouseX(-1);
    }

    function onDblClick(): void {
      resetView();
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('dblclick', onDblClick);
    onCleanup(() => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerEnd);
      container.removeEventListener('pointercancel', onPointerEnd);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('dblclick', onDblClick);
    });
  });

  return (
    <main id="chartWrap" ref={wrapRef}>
      <svg id="chart" width={size().w} height={size().h} ref={svgRef}>
        <Show when={layout()}>
          <defs>
            {/* 绘图区裁剪：几何含视口外 overscan 预渲染点，裁掉离屏部分，避免画到坐标轴上 */}
            <clipPath id="plotClip">
              <rect
                x={layout()!.plotLeft}
                y={M.top}
                width={layout()!.plotRight - layout()!.plotLeft}
                height={size().h - M.bottom - M.top}
              />
            </clipPath>
          </defs>
          <g class="axis">
            <For each={layout()!.yTicks}>
              {(v) => {
                const lay = layout()!;
                const y = lay.yOf(v);
                return <line class="grid" x1={lay.plotLeft} y1={y} x2={lay.plotRight} y2={y} />;
              }}
            </For>
            <For each={layout()!.yLabels}>
              {(lbl) => {
                const lay = layout()!;
                return (
                  <text x={lay.plotLeft - 8} y={lbl.y} text-anchor="end" dominant-baseline="middle">
                    {lbl.text}
                  </text>
                );
              }}
            </For>
          </g>
          <g class="axis">
            <For each={layout()!.xTicks}>
              {(t) => {
                const lay = layout()!;
                const x = lay.xOf(t);
                return <line class="grid" x1={x} y1={M.top} x2={x} y2={lay.h - M.bottom} />;
              }}
            </For>
            <For each={layout()!.xLabels}>
              {(lbl) => {
                const lay = layout()!;
                return (
                  <text
                    x={lbl.x}
                    y={lay.h - M.bottom + 16}
                    text-anchor={lbl.anchor}
                    dominant-baseline="hanging"
                  >
                    {lbl.text}
                  </text>
                );
              }}
            </For>
          </g>
          <g clip-path="url(#plotClip)">
            <For each={connectorDraws()}>
              {(c) => (
                <path
                  class={'connector' + (c.solid ? ' solid' : '')}
                  d={c.d}
                  style={c.color ? { stroke: c.color } : undefined}
                />
              )}
            </For>
            <For each={solidDraws()}>
              {(s) => (
                <>
                  <path class="area" d={s.area} />
                  <path class="line" d={s.d} />
                </>
              )}
            </For>
            <For each={chartData()!.geom.isolated}>
              {(p) => {
                const lay = layout()!;
                return (
                  <circle
                    class="line isolated"
                    cx={lay.xOf(p.t)}
                    cy={lay.yOf(p.total)}
                    r={3}
                  />
                );
              }}
            </For>
          </g>
          <Show when={hover()}>
            <line
              class="crosshair"
              x1={hover()!.x}
              y1={M.top}
              x2={hover()!.x}
              y2={size().h - M.bottom}
            />
            <circle class="hover-dot" cx={hover()!.x} cy={hover()!.y} r={4} />
          </Show>
        </Show>
      </svg>
      <Tooltip />
      <Empty />
    </main>
  );
}
