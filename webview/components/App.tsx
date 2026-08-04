/** 应用根组件：布局 + 引擎挂载 + 响应式自动重绘。 */
import { createEffect, createMemo, on, onCleanup, onMount, Show } from 'solid-js';
import { createChartEngine } from '../engine/chartEngine';
import {
  checkNow,
  clearRefreshFeedback,
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
        connectorStyle: store.config?.connectorStyle ?? 'dashed',
        connectorColor: store.config?.connectorColor ?? '',
        lineStyle: store.config?.lineStyle ?? 'straight',
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
            store.config,
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

  // 刷新反馈：结果（ok/fail）短暂显示后自动复原为普通刷新图标
  createEffect(() => {
    const r = store.refreshResult;
    if (!r) return;
    const t = setTimeout(() => clearRefreshFeedback(), 1800);
    onCleanup(() => clearTimeout(t));
  });

  const refreshIcon = createMemo(() => {
    if (store.refreshing) return 'codicon-refresh spinning';
    if (store.refreshResult === 'ok') return 'codicon-check';
    if (store.refreshResult === 'fail') return 'codicon-error';
    return 'codicon-refresh';
  });

  const refreshTitle = createMemo(() => {
    if (store.refreshing) return '查询中…';
    if (store.refreshResult === 'ok') return '刷新成功';
    if (store.refreshResult === 'fail') return `刷新失败：${store.lastError || '请查看底部错误提示'}`;
    return '立即查询余额';
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
          <button
            class={`icon${store.refreshing ? ' refreshing' : ''}${
              store.refreshResult === 'ok' ? ' ok' : ''
            }${store.refreshResult === 'fail' ? ' fail' : ''}`}
            title={refreshTitle()}
            onClick={checkNow}
            disabled={store.refreshing}
          >
            <i class={`codicon ${refreshIcon()}`}></i>
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
