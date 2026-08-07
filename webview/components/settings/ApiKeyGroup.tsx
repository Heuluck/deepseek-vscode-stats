/** API Key 设置组：显示配置状态 + 设置/更换/清除。 */
import { store } from '../../store';
import { postMessage } from '../../messaging';
import { t } from '../../i18n';
import { SettingRow } from '../SettingRow';

export function ApiKeyGroup() {
  return (
    <SettingRow label={store.data && store.data.hasKey ? t('apiKey.configured') : t('apiKey.notConfigured')}>
      <button class="btn" onClick={() => postMessage({ type: 'setApiKey' })}>
        {t('apiKey.setChange')}
      </button>
      <button class="btn danger" onClick={() => postMessage({ type: 'clearApiKey' })}>
        {t('apiKey.clear')}
      </button>
    </SettingRow>
  );
}
