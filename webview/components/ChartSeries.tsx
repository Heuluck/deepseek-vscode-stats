/** 数据系列：断点连接线 + 实线/面积 + 孤立点。渲染在 clipPath（绘图区裁剪）内。
 * secondary：次币种系列，使用右轴（lay.yOf2）映射 + secondary 样式变体。 */
import { For } from 'solid-js';
import type { ConnectorStyle, Layout, ChartPoint } from '../types';

interface Props {
  lay: Layout;
  isolated: ChartPoint[];
  solidDraws: { d: string; area: string }[];
  connectorDraws: { d: string; area?: string; kind: ConnectorStyle; color: string }[];
  secondary?: boolean;
}

export function ChartSeries(props: Props) {
  const yOf = () => (props.secondary && props.lay.yOf2 ? props.lay.yOf2 : props.lay.yOf);
  const cls = (base: string) => (props.secondary ? `${base} secondary` : base);
  return (
    <>
      <For each={props.connectorDraws}>
        {(c) => (
          <>
            {c.area ? (
              <path
                class={cls('area')}
                d={c.area}
                style={c.color ? { fill: c.color } : undefined}
              />
            ) : null}
            <path
              class={
                cls('connector') +
                (c.kind === 'solid' || c.kind === 'ignore'
                  ? ' solid'
                  : c.kind === 'dotted'
                  ? ' dotted'
                  : '')
              }
              d={c.d}
              style={c.color ? { stroke: c.color } : undefined}
            />
          </>
        )}
      </For>
      <For each={props.solidDraws}>
        {(s) => (
          <>
            <path class={cls('area')} d={s.area} />
            <path class={cls('line')} d={s.d} />
          </>
        )}
      </For>
      <For each={props.isolated}>
        {(p) => (
          <circle
            class={cls('line isolated')}
            cx={props.lay.xOf(p.t)}
            cy={yOf()(p.total)}
            r={3}
          />
        )}
      </For>
    </>
  );
}
