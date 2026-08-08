/** 消耗面板「估算」一次性提示：首次打开消耗面板时弹出，确认后不再出现。
 *  复用 .overlay 遮罩；须点「知道了」关闭（不点遮罩，避免没看清就关掉）。 */
import { Show } from 'solid-js';
import { dismissSpendWarning, store } from '../store';
import { t } from '../i18n';

export function SpendWarning() {
  return (
    <Show when={store.spendWarningOpen}>
      <div class="overlay">
        <div class="modal">
          <div class="modal-head">
            <span class="modal-title">{t('spend.estimate.title')}</span>
          </div>
          <p class="modal-message">{t('spend.estimate.message')}</p>
          <div class="modal-actions">
            <button class="btn primary" onClick={dismissSpendWarning}>
              {t('spend.estimate.ok')}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
