/** API Key 设置组：显示配置状态 + 设置/更换/清除。 */
import { store } from '../../store';
import { postMessage } from '../../messaging';
import { SettingRow } from '../SettingRow';

export function ApiKeyGroup() {
  return (
    <SettingRow label={store.data && store.data.hasKey ? '已配置（安全存储）' : '未配置'}>
      <button class="btn" onClick={() => postMessage({ type: 'setApiKey' })}>
        设置 / 更换
      </button>
      <button class="btn danger" onClick={() => postMessage({ type: 'clearApiKey' })}>
        清除
      </button>
    </SettingRow>
  );
}
