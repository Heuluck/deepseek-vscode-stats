/** 坐标轴：Y/X 轴标签（含防重叠去重后的标签集合，逻辑在 layout memo 中），不画网格线。
 * 次币种右轴只画标签。 */
import { For, Show } from 'solid-js';
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
        <For each={props.lay.yLabels}>
          {(lbl) => (
            <text x={props.lay.plotLeft - 8} y={lbl.y} text-anchor="end" dominant-baseline="middle">
              {lbl.text}
            </text>
          )}
        </For>
      </g>
      <Show when={props.lay.yLabels2 && props.lay.yLabels2!.length}>
        <g class="axis axis-right">
          <For each={props.lay.yLabels2}>
            {(lbl) => (
              <text
                x={props.lay.plotRight + 8}
                y={lbl.y}
                text-anchor="start"
                dominant-baseline="middle"
              >
                {lbl.text}
              </text>
            )}
          </For>
        </g>
      </Show>
      <g class="axis">
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
