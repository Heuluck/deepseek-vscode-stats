/** 视图切换：余额模式 = 分时/分天/分月；消耗模式 = 小时/周/月（粒度）。 */
import { For, Show } from 'solid-js';
import { setConsGran, setView, store } from '../store';
import { t, type MessageKey } from '../i18n';
import { VIEWS, type ViewKey } from '../logic/viewport';
import type { ConsumptionGranularity } from '../logic/consumption';

/** 消耗模式粒度标签 key（周 = 按天聚合）。 */
const CONS_GRANS: Record<ConsumptionGranularity, { labelKey: MessageKey }> = {
  hour: { labelKey: 'tabs.hour' },
  day: { labelKey: 'tabs.week' },
  month: { labelKey: 'tabs.month' },
};

export function Tabs() {
  return (
    <div class="tabs" id="tabs">
      <Show
        when={store.chartMode === 'balance'}
        fallback={
          <For
            each={
              Object.entries(CONS_GRANS) as [
                ConsumptionGranularity,
                (typeof CONS_GRANS)[ConsumptionGranularity]
              ][]
            }
          >
            {([key, cfg]) => (
              <button
                class={'tab' + (key === store.consGran ? ' active' : '')}
                onClick={() => setConsGran(key)}
              >
                {t(cfg.labelKey)}
              </button>
            )}
          </For>
        }
      >
        <For each={Object.entries(VIEWS) as [ViewKey, (typeof VIEWS)[ViewKey]][]}>
          {([key, cfg]) => (
            <button class={'tab' + (key === store.view ? ' active' : '')} onClick={() => setView(key)}>
              {t(cfg.labelKey)}
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}
