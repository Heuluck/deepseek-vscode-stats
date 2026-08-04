/** 悬浮提示：内容与图表坐标来自引擎 onHover，位置在渲染后按自身尺寸自适应。 */
import { createRenderEffect, createSignal, For, Show } from 'solid-js';
import { tooltipInfo } from '../store';

export function Tooltip() {
  let ref: HTMLDivElement | undefined;
  const [pos, setPos] = createSignal<{ left: number; top: number } | null>(null);

  // 同步定位（Solid 渲染后 DOM 已插入、尺寸可读），避免 rAF 让 tooltip 延迟一帧
  createRenderEffect(() => {
    const info = tooltipInfo();
    if (!info || !ref) {
      setPos(null);
      return;
    }
    const wrap = document.getElementById('chartWrap');
    const tw = ref.offsetWidth;
    const th = ref.offsetHeight;
    const ww = wrap ? wrap.clientWidth : 0;
    let tx = info.pointX + 14;
    if (tx + tw > ww - 8) tx = info.pointX - tw - 14;
    if (tx < 8) tx = 8;
    let ty = info.pointY - th - 12;
    if (ty < 8) ty = info.pointY + 14;
    setPos({ left: tx, top: ty });
  });

  return (
    <Show when={tooltipInfo()}>
      <div ref={ref} class="tooltip" style={{ left: `${pos()?.left ?? 0}px`, top: `${pos()?.top ?? 0}px` }}>
        <div class="tt-time">{tooltipInfo()!.title}</div>
        <For each={tooltipInfo()!.rows}>
          {(r) => (
            <div class="tt-row">
              <span>{r.label}</span>
              <b>{r.value}</b>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
