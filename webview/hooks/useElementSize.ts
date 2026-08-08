/**
 * 可靠测量容器尺寸（余额曲线 / 消耗柱状图共用）。
 *
 * 背景：VS Code webview 里，当 webview 自身（iframe）尺寸变化时——打开/关闭底部
 * 面板、拖动面板分隔条、编辑器区域伸缩——内部元素的 ResizeObserver 可能不触发，
 * 导致图表尺寸信号停留在旧值。症状：
 *   - 容器被挤小但属性仍是大尺寸 → SVG 的 CSS 盒（100%）小于 viewport（属性）→
 *     无 viewBox 时内容被整体缩放：轴标签被压扁、图形失真、下半部分被裁切；
 *   - 打开时容器小、关闭底栏后容器变大但不重测 → 图表不展开、悬在半空。
 * window resize 事件在 iframe 视口变化时一定会触发，作为兜底与 RO 双保险。
 */
import { createSignal, onCleanup, onMount } from 'solid-js';

export interface ElementSize {
  w: number;
  h: number;
}

export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const [size, setSize] = createSignal<ElementSize>({ w: 0, h: 0 });
  let el: T | undefined;

  const measure = (): void => {
    if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
  };

  onMount(() => {
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // webview 宿主兜底：iframe 视口变化时 RO 可能漏触发，resize 一定触发
    window.addEventListener('resize', measure);
    // RO 初始回调是异步的；先同步量一次，避免首帧尺寸为 0
    measure();
    onCleanup(() => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    });
  });

  return {
    /** Solid ref 回调，绑定到被测量的容器元素（JSX ref 回调参数类型为 HTMLElement）。 */
    ref: (node: HTMLElement): void => {
      el = node as T;
    },
    /** 当前容器元素（供手势等外部读取）。 */
    getEl: (): T | undefined => el,
    size,
  };
}
