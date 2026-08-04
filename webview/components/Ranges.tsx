/** 当前视图的 range 预设按钮。 */
import { For } from 'solid-js';
import { setRange, store } from '../store';
import { VIEWS } from '../logic/viewport';

export function Ranges() {
  return (
    <div class="ranges" id="ranges">
      <For each={VIEWS[store.view].ranges}>
        {(r) => (
          <button
            class={'btn small' + (r.key === store.rangeKey ? ' primary' : '')}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        )}
      </For>
    </div>
  );
}
