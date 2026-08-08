/** 应用根组件：布局 + 图表（Solid 声明式）+ 设置面板。 */
import { createEffect, onCleanup, Show } from 'solid-js';
import {
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
import { ErrorBanner } from './ErrorBanner';
import { Chart } from './Chart';
import { ChartBars } from './ChartBars';
import { Settings } from './Settings';
import { RefreshButton } from './RefreshButton';
import { t } from '../i18n';

export function App() {
  // 刷新反馈：结果（ok/fail）短暂显示后自动复原为普通刷新图标
  createEffect(() => {
    const r = store.refreshResult;
    if (!r) return;
    const t = setTimeout(() => clearRefreshFeedback(), 1800);
    onCleanup(() => clearTimeout(t));
  });

  return (
    <div id="app">
      <header>
        <Header />
        <div class="controls">
          {/* 消耗模式无缩放/平移，范围预设与重置只属于余额曲线 */}
          <Show when={store.chartMode === 'balance'}>
            <Ranges />
            <button class="btn" title={t('app.resetTitle')} onClick={resetView}>
              {t('app.reset')}
            </button>
          </Show>
          <Tabs />
          <RefreshButton />
          <button class="icon" title={t('app.openUsageTitle')} onClick={openUsage}>
            <i class="codicon codicon-link-external"></i>
          </button>
        </div>
      </header>
      <ErrorBanner />
      <Show when={store.chartMode === 'balance'} fallback={<ChartBars />}>
        <Chart />
      </Show>
      <footer>
        <Footer />
      </footer>
      <Show when={store.settingsOpen}>
        <Settings onClose={closeSettings} />
      </Show>
    </div>
  );
}
