/** 数据设置组：清除历史快照。 */
import { postMessage } from '../../messaging';
import { SettingRow } from '../SettingRow';

export function DataGroup() {
  return (
    <SettingRow label="历史快照（仅 VS Code 打开期间记录）">
      <button class="btn danger" onClick={() => postMessage({ type: 'clearHistory' })}>
        清除历史
      </button>
    </SettingRow>
  );
}
