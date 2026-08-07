/** 消耗模式条形图：按 小时/天/月 聚合消费额（负跳增累加，充值免疫），柱状图。
 * 固定窗口（小时=最近 24h / 周=最近 7 天 / 月=最近 12 个月），无缩放平移，只悬停看值。
 * 坐标轴复用 ChartAxis（Layout 兼容），柱为 <rect>，复用 Tooltip / Empty。
 */
import { createMemo, onCleanup, onMount, Show, For } from 'solid-js';
import { createSignal } from 'solid-js';
import { setTooltipInfo, store } from '../store';
import {
  aggregateConsumption,
  bucketStart,
  EPS,
  type ConsumptionBar,
  type ConsumptionGranularity,
} from '../logic/consumption';
import { estimateTextWidth, M, niceTicks } from '../logic/axis';
import {
  fmtAxisMoney,
  fmtClock,
  fmtDay,
  fmtDayShort,
  fmtMoney,
  fmtMonth,
  startOfDay,
} from '../logic/format';
import type { Layout, XLabel, YLabel } from '../types';
import type { ViewKey } from '../logic/viewport';
import { ChartAxis } from './ChartAxis';
import { Empty } from './Empty';
import { Tooltip } from './Tooltip';

/** 小时粒度忽略无消费小时；周/月不忽略。 */
const SKIP_ZERO: Record<ConsumptionGranularity, boolean> = {
  hour: true,
  day: false,
  month: false,
};

interface BarsLayout extends Layout {
  /** 柱宽（px），按时间槽宽计算，避免稀疏小时柱过宽互相压叠。 */
  barW: number;
}

export function ChartBars() {
  let wrapRef: HTMLDivElement | undefined;
  let svgRef: SVGSVGElement | undefined;
  const [size, setSize] = createSignal({ w: 0, h: 0 });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (wrapRef) setSize({ w: wrapRef.clientWidth, h: wrapRef.clientHeight });
    });
    ro.observe(wrapRef!);
    if (wrapRef) setSize({ w: wrapRef.clientWidth, h: wrapRef.clientHeight });
    onCleanup(() => ro.disconnect());
  });

  // ---------- 数据：按当前粒度聚合消费 ----------
  const bars = createMemo(() => {
    const data = store.data;
    if (!data || !data.snapshots.length) return [] as ConsumptionBar[];
    const g = store.consGran;
    const now = Date.now();
    // 精确窗口桶数：小时=最近 24h；周=最近 7 天（含今天）；月=最近 12 个月（含本月）
    let windowMs: number;
    if (g === 'hour') {
      windowMs = 24 * 3600e3;
    } else if (g === 'day') {
      windowMs = now - (bucketStart(now, 'day') - 6 * 86400e3);
    } else {
      const t0 = new Date(bucketStart(now, 'month'));
      t0.setMonth(t0.getMonth() - 11);
      windowMs = now - t0.getTime();
    }
    return aggregateConsumption(data.snapshots, g, windowMs, SKIP_ZERO[g], now);
  });

  const axisView = createMemo((): ViewKey =>
    store.consGran === 'hour' ? 'hourly' : store.consGran === 'day' ? 'daily' : 'monthly'
  );

  // ---------- 布局（Y 恒从 0，X 为时间轴） ----------
  const layout = createMemo<BarsLayout | null>(() => {
    const bs = bars();
    const { w, h } = size();
    if (!bs.length || w <= 0 || h <= 0) return null;
    const g = store.consGran;
    const n = bs.length;
    const maxVal = bs.reduce((m, b) => Math.max(m, b.value), 0);
    const currency = (store.data && store.data.current && store.data.current.currency) || 'CNY';
    // Y 轴从 0 起；顶部刻度必须是 ≥ 数据峰值的 nice 值——niceTicks 只含 ≤ max 的刻度，
    // 若直接把「最后一个刻度」当 yMax，峰值落在刻度之间时最高柱会顶出绘图区
    let yTop = Math.max(maxVal, 0.01);
    let yTicks = niceTicks(0, yTop * 1.1, 5);
    while (yTicks.length > 1 && yTicks[yTicks.length - 1] < maxVal) {
      yTop *= 1.3;
      yTicks = niceTicks(0, yTop, 5);
    }
    const yMax = yTicks[yTicks.length - 1];
    const yMin = 0;
    const yLabelW = yTicks.reduce(
      (m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, currency))),
      0
    );
    const plotLeft = Math.max(M.left, yLabelW + 14);
    const plotRight = w - M.right;
    const innerW = w - plotLeft - M.right;
    const innerH = h - M.top - M.bottom;
    if (innerW <= 0 || innerH <= 0) return null;

    // 槽位布局：每根柱一个槽、柱相邻填满绘图区 →
    //   小时粒度天然忽略无消费小时（无空白）；周/月连续、无右端空带（无“偏移”）
    const slotW = innerW / n;
    const xOf = (t: number) => plotLeft + t * slotW; // t = 槽索引（0..n 边界；柱 i 中心 = i+0.5）
    const yOf = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    const barW = Math.max(2, Math.min(slotW * 0.7, 48));

    // X 网格线：槽边界
    const xTicks: number[] = [];
    for (let i = 0; i <= n; i++) xTicks.push(i);

    // X 标签：每根柱的类别标签（小时=HH:MM、跨天带日期；天=MM-DD；月=YYYY-MM），按宽度薄化
    const crossesDay = startOfDay(bs[0].t) !== startOfDay(bs[n - 1].t);
    const labelText = (b: ConsumptionBar): string =>
      g === 'hour'
        ? (crossesDay ? fmtDayShort(b.t) + ' ' : '') + fmtClock(b.t)
        : g === 'day'
        ? fmtDayShort(b.t)
        : fmtMonth(b.t);
    const labelW = g === 'hour' ? (crossesDay ? 82 : 42) : g === 'day' ? 46 : 62;
    const every = Math.max(1, Math.ceil((n * labelW) / Math.max(1, innerW)));
    const xLabels: XLabel[] = [];
    for (let i = 0; i < n; i += every) {
      xLabels.push({
        t: bs[i].t,
        x: plotLeft + (i + 0.5) * slotW,
        text: labelText(bs[i]),
        w: labelW,
        anchor: 'middle',
      });
    }
    // 末尾标签被薄化跳过时，若与前一个不重叠则补上（保留最近时刻）
    if ((n - 1) % every !== 0) {
      const lastX = plotLeft + (n - 1 + 0.5) * slotW;
      const prev = xLabels[xLabels.length - 1];
      if (prev && lastX - prev.x >= labelW) {
        xLabels.push({
          t: bs[n - 1].t,
          x: lastX,
          text: labelText(bs[n - 1]),
          w: labelW,
          anchor: 'middle',
        });
      }
    }

    // Y 标签：0 与最大值必保留，中间按垂直间距去重
    const yLabels: YLabel[] = [];
    {
      let lastY = Infinity;
      for (let i = 0; i < yTicks.length; i++) {
        const v = yTicks[i];
        const y = yOf(v);
        const isEdge = i === 0 || i === yTicks.length - 1;
        if (!isEdge && lastY - y < 16) continue;
        yLabels.push({ v, y, text: fmtAxisMoney(v, currency) });
        lastY = y;
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
      xStep: slotW,
      xTicks,
      xLabels,
      yTicks,
      yLabels,
      plotLeft,
      plotRight,
      barW,
    };
  });

  // ---------- 悬停：最近柱 → tooltip ----------
  const onMove = (e: MouseEvent) => {
    const lay = layout();
    const bs = bars();
    if (!lay || !svgRef) return;
    const rect = svgRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < bs.length; i++) {
      const d = Math.abs(lay.xOf(i + 0.5) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const thr = Math.max(lay.barW / 2 + 8, 24);
    if (best < 0 || bestD > thr) {
      setTooltipInfo(null);
      return;
    }
    const b = bs[best];
    const title =
      store.consGran === 'hour'
        ? fmtDayShort(b.t) + ' ' + fmtClock(b.t)
        : store.consGran === 'day'
        ? fmtDay(b.t)
        : fmtMonth(b.t);
    setTooltipInfo({
      pointX: lay.xOf(best + 0.5),
      pointY: lay.yOf(b.value),
      title,
      rows: [{ label: '消费', value: fmtMoney(b.value, lay.currency) }],
    });
  };

  const hasData = () => !!(store.data && store.data.snapshots.length);
  /** 窗口内没有任何消费（小时粒度恒跳过 0 桶；周/月全 0 时也该显示空态而非平图）。 */
  const noConsumption = () => bars().length === 0 || bars().every((b) => b.value <= EPS);

  return (
    <main id="chartWrap" ref={wrapRef}>
      <svg
        id="chart"
        width={size().w}
        height={size().h}
        ref={svgRef}
        onMouseMove={onMove}
        onMouseLeave={() => setTooltipInfo(null)}
      >
        <Show when={layout()}>
          <defs>
            {/* 绘图区裁剪：柱按真实时刻落位，边缘柱裁剪到绘图区内（与折线图 plotClip 一致） */}
            <clipPath id="plotClip">
              <rect
                x={layout()!.plotLeft}
                y={M.top}
                width={layout()!.plotRight - layout()!.plotLeft}
                height={size().h - M.bottom - M.top}
              />
            </clipPath>
          </defs>
          <ChartAxis lay={layout()!} view={axisView()} />
          <g clip-path="url(#plotClip)">
            <g class="bars">
              <For each={bars()}>
                {(b, i) => {
                  const lay = layout()!;
                  // 柱中心在第 i 槽中点；钳制防边缘柱半根伸出压到坐标轴
                  const x = Math.max(
                    lay.plotLeft,
                    Math.min(lay.plotRight - lay.barW, lay.xOf(i() + 0.5) - lay.barW / 2)
                  );
                  const top = lay.yOf(b.value);
                  const bottom = lay.yOf(lay.yMin);
                  return (
                    <rect
                      class="bar"
                      x={x}
                      y={top}
                      width={lay.barW}
                      height={Math.max(0, bottom - top)}
                      rx={2}
                    />
                  );
                }}
              </For>
            </g>
          </g>
        </Show>
      </svg>
      <Tooltip />
      <Show when={hasData() && noConsumption()}>
        <div class="empty">
          <div class="empty-text">该时段无消费</div>
        </div>
      </Show>
      <Show when={!hasData()}>
        <Empty />
      </Show>
    </main>
  );
}
