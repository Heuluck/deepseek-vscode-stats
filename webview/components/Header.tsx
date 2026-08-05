/** 头部：当前余额 / 充值·赠送 / 今日花费（可选，支持设置面板暂存预览）。 */
import { createMemo, Show } from 'solid-js';
import { spendPreview, store } from '../store';
import { fmtMoney } from '../logic/format';
import { todaySpendFromCache } from '../logic/todaySpend';

export function Header() {
  const balance = createMemo(() => {
    const cur = store.data && store.data.current;
    return cur ? fmtMoney(cur.total, cur.currency) : '--';
  });

  const meta = createMemo(() => {
    const cur = store.data && store.data.current;
    if (cur) {
      return `充值 ${fmtMoney(cur.toppedUp, cur.currency)} · 赠送 ${fmtMoney(
        cur.granted,
        cur.currency
      )}`;
    }
    return store.data && store.data.hasKey ? '等待数据…' : '未配置 API Key';
  });

  // 今日花费（可选）：设置面板打开时预览暂存值，否则用已保存配置
  const showSpend = createMemo(() =>
    spendPreview() !== null
      ? spendPreview()!
      : !!(store.config && store.config.showTodaySpend)
  );

  const spend = createMemo(() => {
    if (!showSpend()) return null;
    const info = todaySpendFromCache(
      store.todayCache,
      (store.data && store.data.current) || null
    );
    if (!info) {
      return { value: '-', title: '数据不足或含充值，无法可靠估算今日花费' };
    }
    const currency =
      (store.data && store.data.current && store.data.current.currency) || 'CNY';
    return {
      value: `~${fmtMoney(info.spend, currency)}`,
      title: `估算：基于${info.source} ¥${info.baseline} 推算（已按今日充值校正）`,
    };
  });

  return (
    <div class="head-left">
      <div class="stats">
        <div class="stat">
          <span class="stat-label">当前余额</span>
          <span class="stat-value">{balance()}</span>
        </div>
        <Show when={spend()}>
          <div class="stat" title={spend()!.title}>
            <span class="stat-label">今日花费</span>
            <span class="stat-value">{spend()!.value}</span>
          </div>
        </Show>
      </div>
      <div class="current-meta">
        <span class="meta">{meta()}</span>
      </div>
    </div>
  );
}
