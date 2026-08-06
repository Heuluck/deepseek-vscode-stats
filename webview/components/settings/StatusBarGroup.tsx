/**
 * 状态栏设置组：显示余额开关 + 默认颜色 + 阈值颜色编辑。
 * colorOpen 为该组局部状态，不提升到面板层。
 */
import { createSignal } from 'solid-js';
import type { SetStoreFunction } from 'solid-js/store';
import type { StagedConfig } from '../../store';
import { Collapse } from '../Collapse';
import { SettingRow } from '../SettingRow';
import { ThresholdEditor } from '../ThresholdEditor';

interface Props {
  staged: StagedConfig;
  setStaged: SetStoreFunction<StagedConfig>;
}

export function StatusBarGroup(props: Props) {
  const [colorOpen, setColorOpen] = createSignal(false);

  return (
    <>
      <SettingRow label="显示余额" for="statusBarShowEl">
        <input
          id="statusBarShowEl"
          type="checkbox"
          checked={props.staged?.statusBarShow}
          onChange={(e) => props.setStaged('statusBarShow', e.currentTarget.checked)}
        />
      </SettingRow>
      <button
        class={'settings-toggle' + (colorOpen() ? ' open' : '')}
        type="button"
        onClick={() => setColorOpen((o) => !o)}
      >
        <span>阈值颜色</span>
        <i class="codicon codicon-chevron-down"></i>
      </button>
      <Collapse open={colorOpen()}>
        <SettingRow label="默认颜色">
          <input
            type="color"
            value={props.staged?.defaultColor || '#000000'}
            disabled={!props.staged?.defaultColor}
            onChange={(e) => props.setStaged('defaultColor', e.currentTarget.value)}
          />
          <label class="settings-inline">
            <input
              type="checkbox"
              checked={!props.staged?.defaultColor}
              onChange={(e) => {
                const theme = e.currentTarget.checked;
                props.setStaged('defaultColor', theme ? '' : '#000000');
              }}
            />
            跟随主题
          </label>
        </SettingRow>
        <ThresholdEditor
          thresholds={props.staged?.thresholds ?? []}
          onChange={(next) => props.setStaged('thresholds', next)}
        />
      </Collapse>
    </>
  );
}
