/**
 * 图表设置组：线条样式 / 断点连接线 / 连接线颜色 / 纵向最小跨度。
 * yRatio 为面板级状态（保存时提交给扩展 globalState），由父组件持有并传入。
 */
import type { SetStoreFunction } from 'solid-js/store';
import type { StagedConfig } from '../../store';
import { t } from '../../i18n';
import { SettingRow } from '../SettingRow';

interface Props {
  staged: StagedConfig;
  setStaged: SetStoreFunction<StagedConfig>;
  yRatio: number;
  setYRatio: (v: number) => void;
}

export function ChartGroup(props: Props) {
  return (
    <>
      <SettingRow label={t('chartGroup.lineStyle')} for="lineStyleEl">
        <select
          id="lineStyleEl"
          class="settings-select"
          value={props.staged?.lineStyle ?? 'straight'}
          onChange={(e) =>
            props.setStaged('lineStyle', e.currentTarget.value as StagedConfig['lineStyle'])
          }
        >
          <option value="straight">{t('chartGroup.straight')}</option>
          <option value="smooth">{t('chartGroup.smooth')}</option>
        </select>
      </SettingRow>
      <SettingRow
        label={t('chartGroup.connectorStyle')}
        for="connectorStyleEl"
        hint={t('chartGroup.connectorStyleHint')}
      >
        <select
          id="connectorStyleEl"
          class="settings-select"
          value={props.staged?.connectorStyle ?? 'dashed'}
          onChange={(e) =>
            props.setStaged('connectorStyle', e.currentTarget.value as StagedConfig['connectorStyle'])
          }
        >
          <option value="dashed">{t('chartGroup.dashed')}</option>
          <option value="dotted">{t('chartGroup.dotted')}</option>
          <option value="solid">{t('chartGroup.solid')}</option>
          <option value="ignore">{t('chartGroup.ignore')}</option>
          <option value="none">{t('chartGroup.none')}</option>
        </select>
      </SettingRow>
      <SettingRow label={t('chartGroup.connectorColor')}>
        <input
          type="color"
          value={props.staged?.connectorColor || '#000000'}
          disabled={!props.staged?.connectorColor}
          onChange={(e) => props.setStaged('connectorColor', e.currentTarget.value)}
        />
        <label class="settings-inline">
          <input
            type="checkbox"
            checked={!props.staged?.connectorColor}
            onChange={(e) => {
              const theme = e.currentTarget.checked;
              props.setStaged('connectorColor', theme ? '' : '#000000');
            }}
          />
          {t('chartGroup.followMain')}
        </label>
      </SettingRow>
      <SettingRow
        label={t('chartGroup.minSpan')}
        for="yMinSpanRatioEl"
        hint={t('chartGroup.minSpanHint')}
      >
        <input
          type="number"
          id="yMinSpanRatioEl"
          min="0"
          max="1"
          step="0.05"
          class="settings-number"
          value={props.yRatio}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            if (Number.isFinite(v)) props.setYRatio(Math.min(1, Math.max(0, v)));
          }}
        />
      </SettingRow>
    </>
  );
}
