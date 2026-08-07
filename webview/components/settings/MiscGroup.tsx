/** 其他设置组：恢复默认设置。 */
import { postMessage } from '../../messaging';
import { t } from '../../i18n';
import { SettingRow } from '../SettingRow';

export function MiscGroup() {
  return (
    <SettingRow label={t('misc.resetLabel')}>
      <button class="btn danger" onClick={() => postMessage({ type: 'resetSettings' })}>
        {t('misc.reset')}
      </button>
    </SettingRow>
  );
}
