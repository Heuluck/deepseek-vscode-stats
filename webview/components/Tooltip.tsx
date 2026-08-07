/** 悬浮提示：内容与图表坐标来自引擎 onHover，位置在渲染后按自身尺寸自适应。 */
import { createRenderEffect, createSignal, For, Show } from 'solid-js';
import { tooltipInfo } from '../store';
import type { TooltipInfo } from '../types';

/** 按 tooltip 自身尺寸 + 悬停点，计算容器内四边不越界的位置。尺寸未就绪返回 null。 */
function computePos(
  info: TooltipInfo,
  el: HTMLElement,
  wrap: HTMLElement | null
): { left: number; top: number } | null {
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  if (tw <= 0 || th <= 0) return null; // 尺寸未就绪（如切换视图后首个悬停），等下一帧
  const ww = wrap ? wrap.clientWidth : 0;
  const wh = wrap ? wrap.clientHeight : 0;
  let tx = info.pointX + 14;
  if (tx + tw > ww - 8) tx = info.pointX - tw - 14;
  // 四边钳制：无论悬停点在哪、tooltip 多大，都不超出图表容器（防窄面板越界）
  tx = Math.max(4, Math.min(tx, ww - tw - 4));
  let ty = info.pointY - th - 12;
  if (ty < 8) ty = info.pointY + 14;
  ty = Math.max(4, Math.min(ty, wh - th - 4));
  return { left: tx, top: ty };
}

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
    const pos = computePos(info, ref, wrap);
    if (!pos) {
      // 尺寸为 0（如切换视图后首个悬停读到空尺寸）：延迟一帧重算，避免按 0 尺寸定位越界
      const info0 = info;
      const el = ref;
      setPos(null);
      requestAnimationFrame(() => {
        if (tooltipInfo() === info0 && el) {
          setPos(computePos(info0, el, document.getElementById('chartWrap')));
        }
      });
      return;
    }
    setPos(pos);
  });

  return (
    <Show when={tooltipInfo()}>
      <div ref={ref} class="tooltip" style={{ left: `${pos()?.left ?? 0}px`, top: `${pos()?.top ?? 0}px` }}>
        <div class="tt-time">{tooltipInfo()!.title}</div>
        <Show when={tooltipInfo()!.columns} fallback={<For each={tooltipInfo()!.rows}>{(r) => (
          <div class="tt-row">
            <span>{r.label}</span>
            <b>{r.value}</b>
          </div>
        )}</For>}>
          <div class="tt-cols">
            <For each={tooltipInfo()!.columns}>
              {(col) => (
                <div class={'tt-col' + (col.secondary ? ' secondary' : '')}>
                  <Show when={col.title}>
                    <div class="tt-col-title">{col.title}</div>
                  </Show>
                  <For each={col.rows}>
                    {(r) => (
                      <div class="tt-row">
                        <span>{r.label}</span>
                        <b>{r.value}</b>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
