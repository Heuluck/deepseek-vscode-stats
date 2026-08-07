/**
 * Solid 声明式图表：数据 + 视口 → 几何 → 路径，全部由 memo 派生；
 * 手势（缩放/平移/悬停/双击）由 useChartGestures hook 管理，只读写 store 与高频 signal。
 * 渲染拆为 ChartAxis / ChartSeries / ChartCrosshair 纯展示组件。
 */
import { createEffect, createMemo, onCleanup, onMount, Show } from 'solid-js';
import { createSignal } from 'solid-js';
import { setTooltipInfo, store } from '../store';
import { t } from '../i18n';
import { activeCurrencies, mainCurrency, viewPoints } from '../logic/viewport';
import type { ChartPoint, ConnectorStyle, Layout, XLabel, YLabel } from '../types';
import {
  computeChartGeometry,
  decimate,
  effectiveGapMs,
  type ChartGeometry,
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
import { ChartAxis } from './ChartAxis';
import { ChartSeries } from './ChartSeries';
import { ChartCrosshair } from './ChartCrosshair';
import { useChartGestures } from '../hooks/useChartGestures';

export function Chart() {
  let wrapRef: HTMLDivElement | undefined;
  let svgRef: SVGSVGElement | undefined;

  // ---------- 尺寸（ResizeObserver → signal） ----------
  const [size, setSize] = createSignal({ w: 0, h: 0 });
  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (wrapRef) setSize({ w: wrapRef.clientWidth, h: wrapRef.clientHeight });
    });
    ro.observe(wrapRef!);
    if (wrapRef) setSize({ w: wrapRef.clientWidth, h: wrapRef.clientHeight });
    onCleanup(() => ro.disconnect());
  });

  // ---------- 手势（只回写 store 与高频 signal；渲染由 memo 统一驱动） ----------
  const { mouseX, pinT, pinUntil } = useChartGestures({
    wrapRef: () => wrapRef,
    svgRef: () => svgRef,
    getLayout: () => layout(),
    // 手势命中基于主系列几何（悬停命中同样只针对主系列）
    getChartData: () => {
      const cd = chartData();
      return cd ? { geom: cd.series[0].geom } : null;
    },
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
    // 按币种拆成独立系列（主币种在前）：几何 / Y 轴 / 悬停均按系列隔离，互不干扰
    // 只保留「曾有过余额」的币种——全 0 账户没有信息量，不画线不设轴
    const main = mainCurrency(data);
    const activeSet = new Set(activeCurrencies(data));
    const groups = new Map<string, ChartPoint[]>();
    for (const p of all) {
      if (!activeSet.has(p.currency)) continue;
      const list = groups.get(p.currency);
      if (list) list.push(p);
      else groups.set(p.currency, [p]);
    }
    const series = Array.from(groups.entries())
      .sort((a, b) => (a[0] === main ? -1 : b[0] === main ? 1 : a[0] < b[0] ? -1 : 1))
      .map(([currency, pts]) => {
        const decimated = decimate(pts, 4000);
        return {
          currency,
          geom: computeChartGeometry(decimated, vr, effectiveGapMs(decimated, view)),
        };
      });
    // 所有币种都从未有过余额（全 0）→ 无可绘制系列，返回 null 走空态（防 layout 访问空 series[0]）
    if (!series.length) return null;
    return { view, vr, bounds, series };
  });

  // ---------- 布局 / 刻度 ----------
  const layout = createMemo<Layout | null>(() => {
    const cd = chartData();
    const { w, h } = size();
    if (!cd || w <= 0 || h <= 0) return null;
    const { vr, view } = cd;
    const mainSeries = cd.series[0];
    const secSeries = cd.series[1];
    const t0 = vr.start;
    const t1 = vr.end;

    // 收集某系列视口内参与 Y 轴自适应的点（overscan 点是纯渲染预取，不参与自适应）
    const collectY = (geom: ChartGeometry): ChartPoint[] => {
      const yPts: ChartPoint[] = [];
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
      return yPts;
    };
    // y 范围：自适应基线——数据贴近 0（最小值 ≤ 量程 20%）才保留 0 基线；
    // 否则按数据范围缩放，避免高余额区间曲线被压成一条平线
    const rangeOf = (yPts: ChartPoint[]): { yMin: number; yMax: number } => {
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
      return enforceMinSpan(yMin, yMax, spanRatio);
    };

    // 主币种：左 Y 轴
    const mainRange = rangeOf(collectY(mainSeries.geom));
    const currency = mainSeries.currency || 'CNY';
    const yTicks = niceTicks(mainRange.yMin, mainRange.yMax, 5);

    // 左缘按最宽 Y 标签自适应，避免大金额数字被裁切，也为时间标签留出空间
    const yLabelW = yTicks.reduce(
      (m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, currency))),
      0
    );
    const plotLeft = Math.max(M.left, yLabelW + 14);

    // 次币种：右 Y 轴（多币种叠加时），右缘为其标签预留空间
    let currency2: string | undefined;
    let yMin2 = 0;
    let yMax2 = 1;
    let yTicks2: number[] = [];
    let yLabels2: YLabel[] | undefined;
    let yOf2: ((v: number) => number) | undefined;
    let rightAxisW = 0;
    if (secSeries) {
      const r2 = rangeOf(collectY(secSeries.geom));
      yMin2 = r2.yMin;
      yMax2 = r2.yMax;
      currency2 = secSeries.currency;
      yTicks2 = niceTicks(yMin2, yMax2, 5);
      const rightLabelW = yTicks2.reduce(
        (m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, currency2!))),
        0
      );
      rightAxisW = Math.max(M.left, rightLabelW + 14);
    }
    const plotRight = w - M.right - rightAxisW;
    const innerW = plotRight - plotLeft;
    const innerH = h - M.top - M.bottom;
    if (innerW <= 0 || innerH <= 0) return null;
    const xOf = (t: number) => plotLeft + ((t - t0) / (t1 - t0)) * innerW;
    const yOf = (v: number) =>
      M.top + innerH - ((v - mainRange.yMin) / (mainRange.yMax - mainRange.yMin)) * innerH;
    if (secSeries) {
      yOf2 = (v: number) => M.top + innerH - ((v - yMin2) / (yMax2 - yMin2)) * innerH;
      // 右轴标签：0 点（底部）与最大值（顶部）必保留，中间按垂直间距去重防重叠
      const labels2: YLabel[] = [];
      {
        let lastY = Infinity;
        for (let i = 0; i < yTicks2.length; i++) {
          const v = yTicks2[i];
          const y = yOf2(v);
          const isEdge = i === 0 || i === yTicks2.length - 1;
          if (!isEdge && lastY - y < 16) continue;
          labels2.push({ v, y, text: fmtAxisMoney(v, currency2!) });
          lastY = y;
        }
      }
      yLabels2 = labels2;
    }

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
      yMin: mainRange.yMin,
      yMax: mainRange.yMax,
      currency,
      currency2,
      yOf2,
      yMin2,
      yMax2,
      yTicks2,
      yLabels2,
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
  // 主/次系列共用同一套路径生成，仅 Y 映射函数与范围不同
  const buildSolid = (
    geom: ChartGeometry,
    lay: Layout,
    yOf: (v: number) => number,
    yMin: number
  ): { d: string; area: string }[] => {
    const smooth = (store.config?.lineStyle ?? 'straight') === 'smooth';
    const baseY = yOf(yMin);
    return geom.solid.map((seg) => {
      const d = smooth ? smoothPath(seg, lay.xOf, yOf) : straightPath(seg, lay.xOf, yOf);
      return {
        d,
        area: `${d} L${lay.xOf(seg[seg.length - 1].t).toFixed(1)},${baseY.toFixed(1)} L${lay.xOf(
          seg[0].t
        ).toFixed(1)},${baseY.toFixed(1)} Z`,
      };
    });
  };

  const buildConnectors = (
    geom: ChartGeometry,
    lay: Layout,
    yOf: (v: number) => number,
    yMin: number
  ): { d: string; area?: string; kind: ConnectorStyle; color: string }[] => {
    const style = store.config?.connectorStyle ?? 'dashed';
    if (style === 'none') return [];
    const color = store.config?.connectorColor ?? '';
    const smooth = (store.config?.lineStyle ?? 'straight') === 'smooth';
    const { xOf } = lay;
    // clipSegmentToRect / polylineToClippedPath 第 5~8 参是绝对坐标 (xmin,ymin,xmax,ymax)，
    // 不能把"绘图区宽度"当 xmax——否则右缘被剪在 plotLeft 之前，连接线到不了右边缘
    const plotX = lay.plotLeft;
    const plotY = M.top;
    const plotRight = lay.plotRight;
    const plotBottom = lay.h - M.bottom;
    const baseY = yOf(yMin);
    const out: { d: string; area?: string; kind: ConnectorStyle; color: string }[] = [];
    for (const g of geom.gaps) {
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
      if (!d) continue;
      const item: { d: string; area?: string; kind: ConnectorStyle; color: string } = {
        d,
        kind: style,
        color,
      };
      // ignore：假装是正常数据段——实线 + 下方面积填充（整组已套 plotClip，底部自动裁齐）
      if (style === 'ignore') {
        item.area = `${d} L${xOf(g.to.t).toFixed(1)},${baseY.toFixed(1)} L${xOf(g.from.t).toFixed(1)},${baseY.toFixed(1)} Z`;
      }
      out.push(item);
    }
    return out;
  };

  // ignore 样式下：断档被实线连接线补齐后，中间的单点已"连着线"，不再画独立圆点；
  // 仅过滤渲染（悬停仍可命中该点查看数值）。纯单点数据集（无任何缺口）保持圆点。
  const buildIsolated = (geom: ChartGeometry): ChartPoint[] => {
    if ((store.config?.connectorStyle ?? 'dashed') !== 'ignore') return geom.isolated;
    const connected = new Set<ChartPoint>();
    for (const g of geom.gaps) {
      connected.add(g.from);
      connected.add(g.to);
    }
    return geom.isolated.filter((p) => !connected.has(p));
  };

  // 主币种系列（左轴）
  const solidDraws = createMemo(() => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay) return [] as { d: string; area: string }[];
    return buildSolid(cd.series[0].geom, lay, lay.yOf, lay.yMin);
  });

  const connectorDraws = createMemo(() => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay)
      return [] as { d: string; area?: string; kind: ConnectorStyle; color: string }[];
    return buildConnectors(cd.series[0].geom, lay, lay.yOf, lay.yMin);
  });

  // ---------- 孤立点（主系列） ----------
  const isolatedDraws = createMemo(() => {
    const cd = chartData();
    if (!cd) return [] as ChartPoint[];
    return buildIsolated(cd.series[0].geom);
  });

  // ---------- 次币种系列（右轴） ----------
  const secondarySolidDraws = createMemo(() => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay || !cd.series[1] || !lay.yOf2) return [] as { d: string; area: string }[];
    return buildSolid(cd.series[1].geom, lay, lay.yOf2, lay.yMin2!);
  });

  const secondaryConnectorDraws = createMemo(() => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay || !cd.series[1] || !lay.yOf2)
      return [] as { d: string; area?: string; kind: ConnectorStyle; color: string }[];
    return buildConnectors(cd.series[1].geom, lay, lay.yOf2, lay.yMin2!);
  });

  const secondaryIsolatedDraws = createMemo(() => {
    const cd = chartData();
    if (!cd || !cd.series[1]) return [] as ChartPoint[];
    return buildIsolated(cd.series[1].geom);
  });

  // ---------- 悬停 ----------
  const hover = createMemo(
    ():
      | {
          x: number;
          y: number;
          p: ChartPoint;
          p2: { x: number; y: number; p: ChartPoint } | null;
        }
      | null => {
    const cd = chartData();
    const lay = layout();
    if (!cd || !lay) return null;
    const mainGeom = cd.series[0].geom;
    const pts: ChartPoint[] = [];
    // 交互只命中真实视口内的点；视口外 overscan 点是纯渲染预取，不参与悬停
    const t0 = cd.vr.start;
    const t1 = cd.vr.end;
    for (const seg of mainGeom.solid)
      for (const p of seg) if (p.t >= t0 && p.t <= t1) pts.push(p);
    for (const p of mainGeom.isolated) if (p.t >= t0 && p.t <= t1) pts.push(p);
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
    // 次系列：取 t 最接近主点的点（同批轮询通常同 t 采集）
    let p2: { x: number; y: number; p: ChartPoint } | null = null;
    if (cd.series.length >= 2 && lay.yOf2) {
      const secGeom = cd.series[1].geom;
      let b2 = Infinity;
      const consider = (q: ChartPoint): void => {
        const dx = Math.abs(q.t - p.t);
        if (dx < b2) {
          b2 = dx;
          p2 = { x: xOf(q.t), y: lay.yOf2!(q.total), p: q };
        }
      };
      for (const seg of secGeom.solid)
        for (const q of seg) if (q.t >= t0 && q.t <= t1) consider(q);
      for (const q of secGeom.isolated) if (q.t >= t0 && q.t <= t1) consider(q);
    }
    return { x: xOf(p.t), y: yOf(p.total), p, p2 };
  });

  // 悬停 → 十字线坐标（ChartCrosshair 的 HoverInfo 形态）
  const crosshairHover = createMemo(() => {
    const h = hover();
    if (!h) return null;
    return { x: h.x, y: h.y, x2: h.p2?.x, y2: h.p2?.y };
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
    const mainRows = [
      { label: t('chart.tooltip.total'), value: fmtMoney(h.p.total, h.p.currency) },
      { label: t('chart.tooltip.toppedUp'), value: fmtMoney(h.p.toppedUp, h.p.currency) },
      { label: t('chart.tooltip.granted'), value: fmtMoney(h.p.granted, h.p.currency) },
    ];
    // 双币种：每币种一列（各含总余额/充值/赠送），标题标币种避免“总和”误解
    setTooltipInfo(
      h.p2
        ? {
            pointX: h.x,
            pointY: h.y,
            title,
            rows: mainRows,
            columns: [
              { title: h.p.currency, rows: mainRows },
              {
                title: h.p2.p.currency,
                secondary: true,
                rows: [
                  { label: t('chart.tooltip.total'), value: fmtMoney(h.p2.p.total, h.p2.p.currency) },
                  { label: t('chart.tooltip.toppedUp'), value: fmtMoney(h.p2.p.toppedUp, h.p2.p.currency) },
                  { label: t('chart.tooltip.granted'), value: fmtMoney(h.p2.p.granted, h.p2.p.currency) },
                ],
              },
            ],
          }
        : { pointX: h.x, pointY: h.y, title, rows: mainRows }
    );
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
          <ChartAxis lay={layout()!} view={store.view} />
          <g clip-path="url(#plotClip)">
            <ChartSeries
              lay={layout()!}
              isolated={isolatedDraws()}
              solidDraws={solidDraws()}
              connectorDraws={connectorDraws()}
            />
            <Show when={layout()!.yOf2}>
              <ChartSeries
                secondary
                lay={layout()!}
                isolated={secondaryIsolatedDraws()}
                solidDraws={secondarySolidDraws()}
                connectorDraws={secondaryConnectorDraws()}
              />
            </Show>
          </g>
          <ChartCrosshair hover={crosshairHover()} h={size().h} />
        </Show>
      </svg>
      <Tooltip />
      <Empty />
    </main>
  );
}
