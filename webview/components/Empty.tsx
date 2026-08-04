/** 空态覆盖层：加载中 / 未配置 Key / 无数据 / 范围内无数据。 */
import { createMemo, Show } from 'solid-js';
import { emptyInfo, setApiKey } from '../store';

export function Empty() {
  const info = createMemo(() => emptyInfo());

  return (
    <Show when={info()}>
      <div class="empty">
        <div class="empty-icon">
          <i class="codicon codicon-graph-line"></i>
        </div>
        <div class="empty-text">{info()!.msg}</div>
        <Show when={info()!.showAction}>
          <button class="btn primary" onClick={setApiKey}>
            设置 API Key
          </button>
        </Show>
      </div>
    </Show>
  );
}
