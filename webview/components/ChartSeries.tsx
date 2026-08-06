/** 数据系列：断点连接线 + 实线/面积 + 孤立点。渲染在 clipPath（绘图区裁剪）内。 */
import { For } from 'solid-js';
import type { Layout, ChartPoint } from '../types';

interface Props {
  lay: Layout;
  isolated: ChartPoint[];
  solidDraws: { d: string; area: string }[];
  connectorDraws: { d: string; solid: boolean; color: string }[];
}

export function ChartSeries(props: Props) {
  return (
    <>
      <For each={props.connectorDraws}>
        {(c) => (
          <path
            class={'connector' + (c.solid ? ' solid' : '')}
            d={c.d}
            style={c.color ? { stroke: c.color } : undefined}
          />
        )}
      </For>
      <For each={props.solidDraws}>
        {(s) => (
          <>
            <path class="area" d={s.area} />
            <path class="line" d={s.d} />
          </>
        )}
      </For>
      <For each={props.isolated}>
        {(p) => (
          <circle class="line isolated" cx={props.lay.xOf(p.t)} cy={props.lay.yOf(p.total)} r={3} />
        )}
      </For>
    </>
  );
}
