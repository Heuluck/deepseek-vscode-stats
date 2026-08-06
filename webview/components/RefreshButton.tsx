/** 手动刷新按钮：三态图标（idle / 旋转中 / ok / fail），标题随状态变化。 */
import { createMemo } from 'solid-js';
import { checkNow, store } from '../store';

export function RefreshButton() {
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
