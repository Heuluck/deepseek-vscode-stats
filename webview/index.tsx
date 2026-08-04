/* DeepSeek Stats — Webview 入口（SolidJS） */
import { render } from 'solid-js/web';
import { initMessaging, postMessage } from './messaging';
import {
  init,
  onConfig,
  onError,
  onSettingsReset,
  onSnapshot,
  onTheme,
} from './store';
import { App } from './components/App';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();
initMessaging(vscode);

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;
  if (msg.type === 'init') {
    init(msg.payload);
  } else if (msg.type === 'snapshot') {
    onSnapshot(msg.payload);
  } else if (msg.type === 'config') {
    onConfig(msg.payload);
  } else if (msg.type === 'settingsReset') {
    onSettingsReset();
  } else if (msg.type === 'theme') {
    onTheme();
  } else if (msg.type === 'error') {
    onError(msg.payload && msg.payload.message);
  }
});

render(() => <App />, document.getElementById('app')!);

// 通知扩展端 Webview 已就绪（防止 init 消息在监听器挂载前丢失）
postMessage({ type: 'ready' });
