/** 应用根组件：布局 + 图表（Solid 声明式）+ 设置面板。 */
import { createEffect, createMemo, onCleanup, Show } from 'solid-js';
import {
  checkNow,
  clearRefreshFeedback,
  closeSettings,
  openUsage,
  resetView,
  store,
} from '../store';
import { Header } from './Header';
import { Tabs } from './Tabs';
import { Ranges } from './Ranges';
import { Footer } from './Footer';
import { Chart } from './Chart';
import { Settings } from './Settings';

export function App() {
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
      <Chart />
      <footer>
        <Footer />
      </footer>
      <Show when={store.settingsOpen}>
        <Settings onClose={closeSettings} />
      </Show>
    </div>
  );
}
