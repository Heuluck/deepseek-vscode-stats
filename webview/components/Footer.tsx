/** 页脚：数据说明 / 错误 / 状态页入口 / 设置入口。 */
import { createMemo } from 'solid-js';
import { openSettings, openStatusPage, store } from '../store';

export function Footer() {
  const info = createMemo(() => {
    const d = store.data;
    if (!d) return '';
    const count = (d.snapshots || []).length;
    const last = d.current;
    const lastStr = last
      ? `上次同步 ${new Date(last.t).toLocaleTimeString('zh-CN', { hour12: false })}`
      : '';
    return `仅记录 VS Code 打开期间的数据 · 轮询间隔 ${
      store.config ? store.config.pollMinutes : 1
    } 分钟 · 快照 ${count} 条 · ${lastStr}`;
  });

  return (
    <>
      <span>{info()}</span>
      <span class="footer-right">
        <span class="err">{store.lastError ? `⚠ ${store.lastError}` : ''}</span>
        <button class="btn" title="打开 DeepSeek 状态页" onClick={openStatusPage}>
          <i class="codicon codicon-pulse"></i>状态
        </button>
        <button class="btn" title="设置" onClick={openSettings}>
          <i class="codicon codicon-gear"></i>设置
        </button>
      </span>
    </>
  );
}
