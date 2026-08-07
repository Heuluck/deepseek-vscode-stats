/* DeepSeek Stats — Webview 入口（SolidJS） */
import { render } from 'solid-js/web';
import { initMessaging, postMessage } from './messaging';
import { setLocale } from './i18n';
import {
  init,
  onConfig,
  onError,
  onSettingsReset,
  onSnapshots,
  onTheme,
} from './store';
import { App } from './components/App';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();
initMessaging(vscode);

// 初始 locale 由扩展注入 HTML（meta[name="deepseek-stats:locale"]），首帧即用正确语言渲染
const localeMeta = document.querySelector('meta[name="deepseek-stats:locale"]');
setLocale(localeMeta ? localeMeta.getAttribute('content') : 'en');

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;
  if (msg.type === 'init') {
    init(msg.payload);
  } else if (msg.type === 'snapshots') {
    onSnapshots(msg.payload);
  } else if (msg.type === 'config') {
    onConfig(msg.payload);
  } else if (msg.type === 'settingsReset') {
    onSettingsReset();
  } else if (msg.type === 'theme') {
    onTheme();
  } else if (msg.type === 'error') {
    onError(msg.payload && msg.payload.message);
  } else if (msg.type === 'i18n') {
    // 语言设置变更：locale 变化驱动所有使用 t() 的组件重渲染
    setLocale(msg.payload && msg.payload.locale);
  }
});

render(() => <App />, document.getElementById('app')!);

// 通知扩展端 Webview 已就绪（防止 init 消息在监听器挂载前丢失）
postMessage({ type: 'ready' });
