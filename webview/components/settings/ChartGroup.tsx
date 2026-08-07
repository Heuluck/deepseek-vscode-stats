/**
 * 图表设置组：线条样式 / 断点连接线 / 连接线颜色 / 纵向最小跨度。
 * yRatio 为面板级状态（保存时提交给扩展 globalState），由父组件持有并传入。
 */
import type { SetStoreFunction } from 'solid-js/store';
import type { StagedConfig } from '../../store';
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
      <SettingRow label="线条样式" for="lineStyleEl">
        <select
          id="lineStyleEl"
          class="settings-select"
          value={props.staged?.lineStyle ?? 'straight'}
          onChange={(e) =>
            props.setStaged('lineStyle', e.currentTarget.value as StagedConfig['lineStyle'])
          }
        >
          <option value="straight">直线</option>
          <option value="smooth">曲线</option>
        </select>
      </SettingRow>
      <SettingRow
        label="断点连接线"
        for="connectorStyleEl"
        hint="轮询断档时用连接线补齐缺口"
      >
        <select
          id="connectorStyleEl"
          class="settings-select"
          value={props.staged?.connectorStyle ?? 'dashed'}
          onChange={(e) =>
            props.setStaged('connectorStyle', e.currentTarget.value as StagedConfig['connectorStyle'])
          }
        >
          <option value="dashed">虚线</option>
          <option value="dotted">点虚线</option>
          <option value="solid">实线</option>
          <option value="ignore">假装连续</option>
          <option value="none">不连接</option>
        </select>
      </SettingRow>
      <SettingRow label="连接线颜色">
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
          跟随主色
        </label>
      </SettingRow>
      <SettingRow
        label="纵向最小跨度"
        for="yMinSpanRatioEl"
        hint="限制曲线纵向放大；0 为完全自适应"
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
