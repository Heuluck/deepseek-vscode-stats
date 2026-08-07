/** 消耗模式条形图：按 小时/天/月 聚合消费额（负跳增累加，充值免疫），柱状图。
 * 固定窗口（小时=最近 24h / 周=最近 7 天 / 月=最近 12 个月），无缩放平移，只悬停看值。
 * 坐标轴复用 ChartAxis（Layout 兼容），柱为 <rect>，复用 Tooltip / Empty。
 */
import { createMemo, onCleanup, onMount, Show, For } from 'solid-js';
import { createSignal } from 'solid-js';
import { setTooltipInfo, store } from '../store';
import { t } from '../i18n';
import {
  aggregateConsumption,
  bucketStart,
  EPS,
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
import type { Layout, Snapshot, XLabel, YLabel } from '../types';
import { activeCurrencies, mainCurrency, type ViewKey } from '../logic/viewport';
import { ChartAxis } from './ChartAxis';
import { Empty } from './Empty';
import { Tooltip } from './Tooltip';

/** 小时粒度忽略无消费小时；周/月不忽略。 */
const SKIP_ZERO: Record<ConsumptionGranularity, boolean> = {
  hour: true,
  day: false,
  month: false,
};

/** 一个时间桶：各币种消费额（缺失币种 = 无消费，渲染 0 高柱）。 */
interface BarsBucket {
  t: number;
  values: Record<string, number>;
}

interface BarsLayout extends Layout {
  /** 单柱宽（px），按时间槽宽计算，避免稀疏小时柱过宽互相压叠。 */
  barW: number;
  /** 双币种时两柱间距（px）。 */
  barGap: number;
  /** 槽宽（px），悬停命中阈值用。 */
  slotW: number;
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

  // ---------- 数据：按币种分别聚合消费（多币种快照混算负跳增会错乱，必须隔离），再按桶合并 ----------
  const buckets = createMemo<BarsBucket[]>(() => {
    const data = store.data;
    if (!data || !data.snapshots.length) return [];
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
    // 按币种分组（主币种在前）；只保留曾有过余额的币种——全 0 账户在周/月（skipZero=false）
    // 会产出整段 0 桶，不参与展示
    const main = mainCurrency(data);
    const activeSet = new Set(activeCurrencies(data));
    const groups = new Map<string, Snapshot[]>();
    for (const s of data.snapshots) {
      if (!activeSet.has(s.currency)) continue;
      const list = groups.get(s.currency);
      if (list) list.push(s);
      else groups.set(s.currency, [s]);
    }
    const ordered = [...groups.keys()].sort((a, b) =>
      a === main ? -1 : b === main ? 1 : a < b ? -1 : 1
    );
    // 各币种独立聚合后合并桶：任一币种有消费的桶都保留（小时粒度天然跳过全 0 小时）
    const byBucket = new Map<number, Record<string, number>>();
    for (const cur of ordered) {
      const bars = aggregateConsumption(groups.get(cur)!, g, windowMs, SKIP_ZERO[g], now);
      for (const b of bars) {
        const m = byBucket.get(b.t);
        if (m) m[cur] = b.value;
        else byBucket.set(b.t, { [cur]: b.value });
      }
    }
    return Array.from(byBucket.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, values]) => ({ t, values }));
  });

  const axisView = createMemo((): ViewKey =>
    store.consGran === 'hour' ? 'hourly' : store.consGran === 'day' ? 'daily' : 'monthly'
  );

  // ---------- 布局（Y 恒从 0，X 为时间轴） ----------
  const layout = createMemo<BarsLayout | null>(() => {
    const bs = buckets();
    const { w, h } = size();
    if (!bs.length || w <= 0 || h <= 0) return null;
    const g = store.consGran;
    const n = bs.length;
    const currency = mainCurrency(store.data) || 'CNY';
    const curKeys = Array.from(new Set(bs.flatMap((b) => Object.keys(b.values))));
    const sec = curKeys.find((c) => c !== currency);
    // Y 轴从 0 起；顶部刻度必须是 ≥ 数据峰值的 nice 值——niceTicks 只含 ≤ max 的刻度，
    // 若直接把「最后一个刻度」当 yMax，峰值落在刻度之间时最高柱会顶出绘图区
    const rangeOf = (vals: number[]): { yMax: number; yTicks: number[] } => {
      const maxVal = vals.reduce((m, v) => Math.max(m, v), 0);
      let yTop = Math.max(maxVal, 0.01);
      let yTicks = niceTicks(0, yTop * 1.1, 5);
      while (yTicks.length > 1 && yTicks[yTicks.length - 1] < maxVal) {
        yTop *= 1.3;
        yTicks = niceTicks(0, yTop, 5);
      }
      return { yMax: yTicks[yTicks.length - 1], yTicks };
    };

    // 主币种：左 Y 轴
    const { yMax, yTicks } = rangeOf(bs.map((b) => b.values[currency] ?? 0));
    const yMin = 0;
    const yLabelW = yTicks.reduce(
      (m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, currency))),
      0
    );
    const plotLeft = Math.max(M.left, yLabelW + 14);

    // 次币种：右 Y 轴（双币种时），右缘预留标签空间
    let currency2: string | undefined;
    let yMax2 = 0;
    let yTicks2: number[] = [];
    let yLabels2: YLabel[] | undefined;
    let yOf2: ((v: number) => number) | undefined;
    let rightAxisW = 0;
    if (sec) {
      currency2 = sec;
      const r2 = rangeOf(bs.map((b) => b.values[sec] ?? 0));
      yMax2 = r2.yMax;
      yTicks2 = r2.yTicks;
      const rightLabelW = yTicks2.reduce(
        (m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, sec))),
        0
      );
      rightAxisW = Math.max(M.left, rightLabelW + 14);
    }
    const plotRight = w - M.right - rightAxisW;
    const innerW = plotRight - plotLeft;
    const innerH = h - M.top - M.bottom;
    if (innerW <= 0 || innerH <= 0) return null;

    // 槽位布局：每根柱一个槽、柱相邻填满绘图区 →
    //   小时粒度天然忽略无消费小时（无空白）；周/月连续、无右端空带（无“偏移”）
    const slotW = innerW / n;
    const xOf = (t: number) => plotLeft + t * slotW; // t = 槽索引（0..n 边界；柱 i 中心 = i+0.5）
    const yOf = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    if (sec) {
      yOf2 = (v: number) => M.top + innerH - (v / yMax2) * innerH;
      // 右轴标签：0 与最大值必保留，中间按垂直间距去重
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
    // 柱宽：双币种每桶两根（各占约半槽），单币种一根（原逻辑）
    const barW = sec
      ? Math.max(2, Math.min(slotW * 0.32, 22))
      : Math.max(2, Math.min(slotW * 0.7, 48));
    const barGap = sec ? Math.max(2, Math.min(slotW * 0.08, 6)) : 0;

    // X 网格线：槽边界
    const xTicks: number[] = [];
    for (let i = 0; i <= n; i++) xTicks.push(i);

    // X 标签：每根柱的类别标签（小时=HH:MM、跨天带日期；天=MM-DD；月=YYYY-MM），按宽度薄化
    const crossesDay = startOfDay(bs[0].t) !== startOfDay(bs[n - 1].t);
    const labelText = (t: number): string =>
      g === 'hour'
        ? (crossesDay ? fmtDayShort(t) + ' ' : '') + fmtClock(t)
        : g === 'day'
        ? fmtDayShort(t)
        : fmtMonth(t);
    const labelW = g === 'hour' ? (crossesDay ? 82 : 42) : g === 'day' ? 46 : 62;
    const every = Math.max(1, Math.ceil((n * labelW) / Math.max(1, innerW)));
    const xLabels: XLabel[] = [];
    for (let i = 0; i < n; i += every) {
      xLabels.push({
        t: bs[i].t,
        x: plotLeft + (i + 0.5) * slotW,
        text: labelText(bs[i].t),
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
          text: labelText(bs[n - 1].t),
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
      currency2,
      yOf2,
      yMin2: 0,
      yMax2,
      yTicks2,
      yLabels2,
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
      barGap,
      slotW,
    };
  });

  // ---------- 悬停：最近桶 → tooltip（双币种各显示一列消费） ----------
  const onMove = (e: MouseEvent) => {
    const lay = layout();
    const bs = buckets();
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
    const thr = Math.max(lay.slotW * 0.45, 24);
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
    const mainVal = b.values[lay.currency] ?? 0;
    const mainRow = { label: t('chartBars.tooltip.spend'), value: fmtMoney(mainVal, lay.currency) };
    setTooltipInfo({
      pointX: lay.xOf(best + 0.5),
      pointY: lay.yOf(mainVal),
      title,
      rows: [mainRow],
      ...(lay.currency2 && lay.yOf2
        ? {
            columns: [
              { title: lay.currency, rows: [mainRow] },
              {
                title: lay.currency2,
                secondary: true,
                rows: [
                  {
                    label: t('chartBars.tooltip.spend'),
                    value: fmtMoney(b.values[lay.currency2] ?? 0, lay.currency2),
                  },
                ],
              },
            ],
          }
        : {}),
    });
  };

  const hasData = () => !!(store.data && store.data.snapshots.length);
  /** 窗口内没有任何消费（小时粒度恒跳过 0 桶；周/月全 0 时也该显示空态而非平图）。 */
  const noConsumption = () =>
    buckets().length === 0 ||
    buckets().every((b) => Object.values(b.values).every((v) => v <= EPS));

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
              <For each={buckets()}>
                {(b, i) => {
                  const lay = layout()!;
                  const center = lay.xOf(i() + 0.5);
                  const bottom = lay.yOf(lay.yMin);
                  // 主币种柱（左轴，偏左）
                  const mainX = Math.max(
                    lay.plotLeft,
                    Math.min(
                      lay.plotRight - lay.barW,
                      center - (lay.currency2 ? lay.barW + lay.barGap / 2 : lay.barW / 2)
                    )
                  );
                  const mainTop = lay.yOf(b.values[lay.currency] ?? 0);
                  return (
                    <>
                      <rect
                        class="bar"
                        x={mainX}
                        y={mainTop}
                        width={lay.barW}
                        height={Math.max(0, bottom - mainTop)}
                        rx={2}
                      />
                      <Show when={lay.currency2 && lay.yOf2}>
                        <rect
                          class="bar secondary"
                          x={Math.max(
                            lay.plotLeft,
                            Math.min(lay.plotRight - lay.barW, center + lay.barGap / 2)
                          )}
                          y={lay.yOf2!(b.values[lay.currency2!] ?? 0)}
                          width={lay.barW}
                          height={Math.max(
                            0,
                            lay.yOf2!(0) - lay.yOf2!(b.values[lay.currency2!] ?? 0)
                          )}
                          rx={2}
                        />
                      </Show>
                    </>
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
          <div class="empty-text">{t('chartBars.noConsumption')}</div>
        </div>
      </Show>
      <Show when={!hasData()}>
        <Empty />
      </Show>
    </main>
  );
}
