/** 悬停十字线 + 命中点。 */
import { Show } from 'solid-js';
import { M } from '../logic/axis';

interface HoverInfo {
  x: number;
  y: number;
}

interface Props {
  hover: HoverInfo | null;
  /** svg 高度，用于十字线纵线底部。 */
  h: number;
}

export function ChartCrosshair(props: Props) {
  return (
    <Show when={props.hover}>
      <line
        class="crosshair"
        x1={props.hover!.x}
        y1={M.top}
        x2={props.hover!.x}
        y2={props.h - M.bottom}
      />
      <circle class="hover-dot" cx={props.hover!.x} cy={props.hover!.y} r={4} />
    </Show>
  );
}
