/** 坐标轴：Y/X 网格线与标签（含防重叠去重后的标签集合，逻辑在 layout memo 中）。 */
import { For } from 'solid-js';
import { M } from '../logic/axis';
import type { Layout } from '../types';
import type { ViewKey } from '../logic/viewport';

interface Props {
  lay: Layout;
  view: ViewKey;
}

export function ChartAxis(props: Props) {
  return (
    <>
      <g class="axis">
        <For each={props.lay.yTicks}>
          {(v) => {
            const y = props.lay.yOf(v);
            return (
              <line class="grid" x1={props.lay.plotLeft} y1={y} x2={props.lay.plotRight} y2={y} />
            );
          }}
        </For>
        <For each={props.lay.yLabels}>
          {(lbl) => (
            <text x={props.lay.plotLeft - 8} y={lbl.y} text-anchor="end" dominant-baseline="middle">
              {lbl.text}
            </text>
          )}
        </For>
      </g>
      <g class="axis">
        <For each={props.lay.xTicks}>
          {(t) => {
            const x = props.lay.xOf(t);
            return <line class="grid" x1={x} y1={M.top} x2={x} y2={props.lay.h - M.bottom} />;
          }}
        </For>
        <For each={props.lay.xLabels}>
          {(lbl) => (
            <text
              x={lbl.x}
              y={props.lay.h - M.bottom + 16}
              text-anchor={lbl.anchor}
              dominant-baseline="hanging"
            >
              {lbl.text}
            </text>
          )}
        </For>
      </g>
    </>
  );
}
