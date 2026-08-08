/** 页脚：数据说明 / 错误 / 图表模式切换 / 状态页入口 / 设置入口。 */
import { createMemo } from 'solid-js';
import { openSettings, openStatusPage, setChartMode, store } from '../store';
import { getLocale, t } from '../i18n';

export function Footer() {
  const info = createMemo(() => {
    const d = store.data;
    if (!d) return '';
    const count = (d.snapshots || []).length;
    const last = d.current;
    const lastStr = last
      ? t('footer.lastSync', {
          time: new Date(last.t).toLocaleTimeString(
            getLocale() === 'zh-cn' ? 'zh-CN' : 'en-US',
            { hour12: false }
          ),
        })
      : '';
    return t('footer.info', {
      minutes: store.config ? store.config.pollMinutes : 1,
      count,
      last: lastStr,
    });
  });

  return (
    <>
      <span>{info()}</span>
      <span class="footer-right">
        {/* 图表模式切换：余额曲线 / 消耗柱状图（状态按钮左侧） */}
        <div class="tabs" title={t('footer.chartModeTitle')}>
          <button
            class={'tab' + (store.chartMode === 'balance' ? ' active' : '')}
            onClick={() => setChartMode('balance')}
          >
            {t('footer.balance')}
          </button>
          <button
            class={'tab' + (store.chartMode === 'spend' ? ' active' : '')}
            onClick={() => setChartMode('spend')}
          >
            {t('footer.spend')}
          </button>
        </div>
        <button class="btn" title={t('footer.statusPageTitle')} onClick={openStatusPage}>
          <i class="codicon codicon-pulse"></i>{t('footer.status')}
        </button>
        <button class="btn" title={t('footer.settings')} onClick={openSettings}>
          <i class="codicon codicon-gear"></i>{t('footer.settings')}
        </button>
      </span>
    </>
  );
}
