/** 应用根组件：布局 + 引擎挂载 + 响应式自动重绘。 */
import { createEffect, on, onCleanup, onMount, Show } from 'solid-js';
import { createChartEngine } from '../engine/chartEngine';
import {
  checkNow,
  closeSettings,
  openUsage,
  resetView,
  setTooltipInfo,
  setViewRange,
  store,
} from '../store';
import { Header } from './Header';
import { Tabs } from './Tabs';
import { Ranges } from './Ranges';
import { Footer } from './Footer';
import { Empty } from './Empty';
import { Tooltip } from './Tooltip';
import { Settings } from './Settings';

export function App() {
  let wrapRef: HTMLElement | undefined;
  let svgRef: SVGSVGElement | undefined;

  onMount(() => {
    const engine = createChartEngine({
      svg: svgRef!,
      container: wrapRef!,
      getState: () => ({
        data: store.data,
        view: store.view,
        viewRange: store.viewRange,
        maxWindow: store.maxWindow,
        minWindow: store.minWindow,
      }),
      onHover: (info) => setTooltipInfo(info),
      onViewChange: (vr, followLive) => setViewRange(vr, followLive),
      onReset: () => resetView(),
    });

    // 自动重绘：图表相关状态变化 → 引擎重绘（替代手动 renderAll）
    createEffect(
      on(
        () =>
          [
            store.data,
            store.view,
            store.rangeKey,
            store.viewRange,
            store.themeTick,
          ] as const,
        () => engine.render(),
        { defer: true }
      )
    );

    onCleanup(() => engine.dispose());
  });

  return (
    <div id="app">
      <header>
        <Header />
        <div class="controls">
          <Ranges />
          <Tabs />
          <button class="btn" title="重置视图范围" onClick={resetView}>
            重置
          </button>
          <button class="icon" title="立即查询余额" onClick={checkNow}>
            <i class="codicon codicon-refresh"></i>
          </button>
          <button class="icon" title="在浏览器打开 DeepSeek 用量页" onClick={openUsage}>
            <i class="codicon codicon-link-external"></i>
          </button>
        </div>
      </header>
      <main id="chartWrap" ref={wrapRef}>
        <svg id="chart" width="0" height="0" ref={svgRef}></svg>
        <Tooltip />
        <Empty />
      </main>
      <footer>
        <Footer />
      </footer>
      <Show when={store.settingsOpen}>
        <Settings onClose={closeSettings} />
      </Show>
    </div>
  );
}
