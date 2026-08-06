/**
 * 图表手势 hook：wheel（缩放）/ pointer（拖拽平移）/ mouse（悬停）/ dblclick（重置）。
 * 只回写 store（setViewRange/resetView）与内部高频 signal，渲染由 Chart 的 memo 统一驱动——
 * 不直接操作 DOM、无双重渲染。内部状态（mouseX/pinT/pinUntil）通过返回值暴露给 Chart。
 */
import { createSignal, onCleanup, onMount } from 'solid-js';
import { M } from '../logic/axis';
import { clampRange, computeDataBounds, type ViewRange } from '../logic/viewport';
import { resetView, setViewRange, store } from '../store';
import type { ChartGeometry } from '../logic/segments';

/** hook 只需 layout 的这些字段（结构化类型，传入完整 Layout 亦可）。 */
interface GestureLayout {
  plotLeft: number;
}

/** hook 只需 chartData 的这些字段。 */
interface GestureData {
  geom: ChartGeometry;
}

interface Options {
  wrapRef: () => HTMLDivElement | undefined;
  svgRef: () => SVGSVGElement | undefined;
  getLayout: () => GestureLayout | null;
  getChartData: () => GestureData | null;
}

export function useChartGestures(opts: Options) {
  // 高频手势内部状态（不进 store）
  const [mouseX, setMouseX] = createSignal(-1); // 悬停 x 像素坐标
  const [pinT, setPinT] = createSignal<number | null>(null); // 缩放手势钉住的数据时刻
  const [pinUntil, setPinUntil] = createSignal(0);
  let zoomAnchorT: number | null = null; // 缩放手势锚点
  let zoomAnchorFrac = 0;
  let lastWheelTs = 0;
  let drag: { startX: number; startRange: ViewRange } | null = null;

  onMount(() => {
    const container = opts.wrapRef()!;
    const svg = opts.svgRef()!;

    function onWheel(e: WheelEvent): void {
      e.preventDefault();
      if (!store.viewRange) return;
      const lay = opts.getLayout();
      if (!lay) return;
      const now = Date.now();
      const rect = svg.getBoundingClientRect();
      const innerW = rect.width - lay.plotLeft - M.right;
      if (innerW <= 0) return;
      const mx = e.clientX - rect.left;
      const vr = store.viewRange;
      const tCursor = vr.start + ((mx - lay.plotLeft) / innerW) * (vr.end - vr.start);
      if (now - lastWheelTs > 300) {
        // 手势开始：锚点吸附到最近的可见数据点（与悬浮线所指一致）
        const cd = opts.getChartData();
        let best = Infinity;
        let bt = tCursor;
        if (cd) {
          for (const seg of cd.geom.solid) {
            for (const p of seg) {
              const dx = Math.abs(p.t - tCursor);
              if (dx < best) {
                best = dx;
                bt = p.t;
              }
            }
          }
          for (const p of cd.geom.isolated) {
            const dx = Math.abs(p.t - tCursor);
            if (dx < best) {
              best = dx;
              bt = p.t;
            }
          }
        }
        const snapLimit = (vr.end - vr.start) * 0.15;
        zoomAnchorT = best <= snapLimit ? bt : tCursor;
        zoomAnchorFrac = (zoomAnchorT - vr.start) / (vr.end - vr.start);
      }
      lastWheelTs = now;
      // 缩放进行中：悬浮线钉在锚点上，直观显示正在围绕哪个点缩放
      setPinT(zoomAnchorT);
      setPinUntil(now + 350);
      const factor = Math.pow(1.15, -e.deltaY / 120);
      let dur = (vr.end - vr.start) * factor;
      dur = Math.min(store.maxWindow, Math.max(store.minWindow, dur));
      const bounds = computeDataBounds(store.data, store.view);
      const r = bounds
        ? clampRange(
            zoomAnchorT! - zoomAnchorFrac * dur,
            zoomAnchorT! + (1 - zoomAnchorFrac) * dur,
            bounds,
            store.minWindow
          )
        : {
            start: zoomAnchorT! - zoomAnchorFrac * dur,
            end: zoomAnchorT! + (1 - zoomAnchorFrac) * dur,
          };
      setViewRange(r, false);
    }

    function onPointerDown(e: PointerEvent): void {
      if (e.button !== 0 || !store.viewRange) return;
      drag = { startX: e.clientX, startRange: { ...store.viewRange } };
      setMouseX(-1); // 拖拽平移时隐藏悬浮线，避免误导
      container.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent): void {
      if (!drag || !store.viewRange) return;
      const lay = opts.getLayout();
      if (!lay) return;
      const rect = svg.getBoundingClientRect();
      const innerW = rect.width - lay.plotLeft - M.right;
      const dur = drag.startRange.end - drag.startRange.start;
      const shift = ((drag.startX - e.clientX) / innerW) * dur;
      const bounds = computeDataBounds(store.data, store.view);
      const r = bounds
        ? clampRange(
            drag.startRange.start + shift,
            drag.startRange.end + shift,
            bounds,
            store.minWindow
          )
        : { start: drag.startRange.start + shift, end: drag.startRange.end + shift };
      setViewRange(r, false);
    }

    function onPointerEnd(): void {
      drag = null;
    }

    function onMouseMove(e: MouseEvent): void {
      if (drag) return;
      const rect = svg.getBoundingClientRect();
      setMouseX(e.clientX - rect.left);
      // 用户主动移动鼠标 → 立即解除缩放锚点钉住，指示线跟随鼠标
      setPinUntil(0);
    }

    function onMouseLeave(): void {
      setMouseX(-1);
    }

    function onDblClick(): void {
      resetView();
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('dblclick', onDblClick);
    onCleanup(() => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerEnd);
      container.removeEventListener('pointercancel', onPointerEnd);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('dblclick', onDblClick);
    });
  });

  return { mouseX, setMouseX, pinT, setPinT, pinUntil, setPinUntil };
}
