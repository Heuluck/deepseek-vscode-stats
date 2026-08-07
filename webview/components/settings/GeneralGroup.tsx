/**
 * 常规设置组：轮询间隔 / 快照保留天数 / 今日花费（含同意弹层）。
 * consent 为该组局部状态，不提升到面板层。
 */
import { createSignal, Show } from 'solid-js';
import type { SetStoreFunction } from 'solid-js/store';
import type { StagedConfig } from '../../store';
import { t } from '../../i18n';
import { SettingRow } from '../SettingRow';

interface Props {
  staged: StagedConfig;
  setStaged: SetStoreFunction<StagedConfig>;
}

export function GeneralGroup(props: Props) {
  const [consent, setConsent] = createSignal(false);

  return (
    <>
      <SettingRow label={t('general.pollInterval')} for="pollMinutesEl">
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
      <SettingRow label={t('general.rawRetention')} for="rawRetentionEl">
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
      <SettingRow label={t('general.showTodaySpend')} for="showTodaySpendEl">
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
            {t('general.consent')}
          </p>
          <div class="row">
            <button
              class="btn primary"
              onClick={() => {
                props.setStaged('showTodaySpend', true);
                setConsent(false);
              }}
            >
              {t('general.consentOk')}
            </button>
            <button
              class="btn"
              onClick={() => {
                props.setStaged('showTodaySpend', false);
                setConsent(false);
              }}
            >
              {t('general.consentCancel')}
            </button>
          </div>
        </div>
      </Show>
      <SettingRow
        label={t('general.dayBoundary')}
        for="dayBoundaryEl"
        hint={t('general.dayBoundaryHint')}
      >
        <select
          id="dayBoundaryEl"
          class="settings-select"
          value={props.staged?.dayBoundary ?? 'local'}
          onChange={(e) =>
            props.setStaged('dayBoundary', e.currentTarget.value as StagedConfig['dayBoundary'])
          }
        >
          <option value="local">{t('general.dayBoundaryLocal')}</option>
          <option value="utc">{t('general.dayBoundaryUtc')}</option>
        </select>
      </SettingRow>
    </>
  );
}
