/** 数据设置组：清除历史快照。 */
import { postMessage } from '../../messaging';
import { t } from '../../i18n';
import { SettingRow } from '../SettingRow';

export function DataGroup() {
  return (
    <SettingRow label={t('data.historyLabel')}>
      <button class="btn danger" onClick={() => postMessage({ type: 'clearHistory' })}>
        {t('data.clearHistory')}
      </button>
    </SettingRow>
  );
}
