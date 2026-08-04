/** 视图切换：分时 / 分天 / 分月。 */
import { For } from 'solid-js';
import { setView, store } from '../store';
import { VIEWS, type ViewKey } from '../logic/viewport';

export function Tabs() {
  return (
    <div class="tabs" id="tabs">
      <For each={Object.entries(VIEWS) as [ViewKey, (typeof VIEWS)[ViewKey]][]}>
        {([key, cfg]) => (
          <button class={'tab' + (key === store.view ? ' active' : '')} onClick={() => setView(key)}>
            {cfg.label}
          </button>
        )}
      </For>
    </div>
  );
}
