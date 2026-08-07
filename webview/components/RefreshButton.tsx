/** 手动刷新按钮：三态图标（idle / 旋转中 / ok / fail），标题随状态变化。 */
import { createMemo } from 'solid-js';
import { checkNow, store } from '../store';
import { t } from '../i18n';

export function RefreshButton() {
  const refreshIcon = createMemo(() => {
    if (store.refreshing) return 'codicon-refresh spinning';
    if (store.refreshResult === 'ok') return 'codicon-check';
    if (store.refreshResult === 'fail') return 'codicon-error';
    return 'codicon-refresh';
  });

  const refreshTitle = createMemo(() => {
    if (store.refreshing) return t('refresh.loading');
    if (store.refreshResult === 'ok') return t('refresh.ok');
    if (store.refreshResult === 'fail')
      return t('refresh.fail', {
        error: store.lastError || t('refresh.failFallback'),
      });
    return t('refresh.idle');
  });

  return (
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
  );
}
