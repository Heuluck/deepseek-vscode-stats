/** 错误横幅：header 与图表之间独立一行完整展示，不参与 footer 布局（刷新成功后自动消失）。 */
import { Show } from 'solid-js';
import { store } from '../store';

export function ErrorBanner() {
  return (
    <Show when={store.lastError}>
      <div class="error-banner">
        <i class="codicon codicon-error"></i>
        <span>{store.lastError}</span>
      </div>
    </Show>
  );
}
