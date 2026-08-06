/**
 * 常规设置组：轮询间隔 / 快照保留天数 / 今日花费（含同意弹层）。
 * consent 为该组局部状态，不提升到面板层。
 */
import { createSignal, Show } from 'solid-js';
import type { SetStoreFunction } from 'solid-js/store';
import type { StagedConfig } from '../../store';
import { SettingRow } from '../SettingRow';

interface Props {
  staged: StagedConfig;
  setStaged: SetStoreFunction<StagedConfig>;
}

export function GeneralGroup(props: Props) {
  const [consent, setConsent] = createSignal(false);

  return (
    <>
      <SettingRow label="查询间隔（分钟）" for="pollMinutesEl">
        <input
          type="number"
          id="pollMinutesEl"
          min="1"
          step="1"
          class="settings-number"
          value={props.staged?.pollMinutes}
          onChange={(e) => {
            const v = parseInt(e.currentTarget.value, 10);
            if (Number.isFinite(v) && v >= 1) props.setStaged('pollMinutes', v);
          }}
        />
      </SettingRow>
      <SettingRow label="分钟级快照保留（天）" for="rawRetentionEl">
        <input
          type="number"
          id="rawRetentionEl"
          min="1"
          step="1"
          class="settings-number"
          value={props.staged?.rawRetentionDays}
          onChange={(e) => {
            const v = parseInt(e.currentTarget.value, 10);
            if (Number.isFinite(v) && v >= 1) props.setStaged('rawRetentionDays', v);
          }}
        />
      </SettingRow>
      <SettingRow label="显示今日花费（估算）" for="showTodaySpendEl">
        <input
          id="showTodaySpendEl"
          type="checkbox"
          checked={props.staged?.showTodaySpend || consent()}
          onChange={(e) => {
            if (e.currentTarget.checked) {
              setConsent(true);
            } else {
              props.setStaged('showTodaySpend', false);
              setConsent(false);
            }
          }}
        />
      </SettingRow>
      <Show when={consent()}>
        <div class="settings-consent">
          <p class="settings-hint">
            今日花费为根据余额快照推算的估算值，可能因充值或数据断档而不准确。
          </p>
          <div class="row">
            <button
              class="btn primary"
              onClick={() => {
                props.setStaged('showTodaySpend', true);
                setConsent(false);
              }}
            >
              同意启用
            </button>
            <button
              class="btn"
              onClick={() => {
                props.setStaged('showTodaySpend', false);
                setConsent(false);
              }}
            >
              取消
            </button>
          </div>
        </div>
      </Show>
      <SettingRow
        label="今日花费日界"
        for="dayBoundaryEl"
        hint="DeepSeek 官方按 UTC 计算每日用量"
      >
        <select
          id="dayBoundaryEl"
          class="settings-select"
          value={props.staged?.dayBoundary ?? 'local'}
          onChange={(e) =>
            props.setStaged('dayBoundary', e.currentTarget.value as StagedConfig['dayBoundary'])
          }
        >
          <option value="local">本地时区</option>
          <option value="utc">UTC（与官方一致）</option>
        </select>
      </SettingRow>
    </>
  );
}
