/** 其他设置组：恢复默认设置。 */
import { postMessage } from '../../messaging';
import { SettingRow } from '../SettingRow';

export function MiscGroup() {
  return (
    <SettingRow label="恢复默认设置">
      <button class="btn danger" onClick={() => postMessage({ type: 'resetSettings' })}>
        恢复默认
      </button>
    </SettingRow>
  );
}
