/** 头部：当前余额 / 充值·赠送 / 今日花费（可选，支持设置面板暂存预览）。
 * 多币种账户时余额并列展示（主币种在前）。 */
import { createMemo, Show } from 'solid-js';
import { spendPreview, store } from '../store';
import { fmtMoney } from '../logic/format';
import { activeCurrencies, mainCurrency } from '../logic/viewport';
import { todaySpendFromCache } from '../logic/todaySpend';
import type { Snapshot } from '../types';

export function Header() {
  const balance = createMemo(() => {
    const data = store.data;
    if (!data || !data.snapshots.length) return '--';
    // 每个币种取最新一条；只展示「曾有过余额」的币种（主币种在前）
    const activeSet = new Set(activeCurrencies(data));
    const byCur = new Map<string, Snapshot>();
    for (const s of data.snapshots) byCur.set(s.currency, s);
    let entries = [...byCur.entries()].filter(([cur]) => activeSet.has(cur));
    if (!entries.length) entries = [...byCur.entries()]; // 从未有钱：退而展示全部（如 ¥0.00）
    const main = mainCurrency(data);
    entries.sort((a, b) =>
      a[0] === main ? -1 : b[0] === main ? 1 : a[0] < b[0] ? -1 : 1
    );
    return entries.map(([cur, s]) => fmtMoney(s.total, cur)).join(' · ');
  });

  const meta = createMemo(() => {
    const data = store.data;
    const snaps = data?.snapshots || [];
    const main = mainCurrency(data);
    const cur = snaps.find((s) => s.currency === main) || snaps[snaps.length - 1];
    if (cur) {
      return `充值 ${fmtMoney(cur.toppedUp, cur.currency)} · 赠送 ${fmtMoney(
        cur.granted,
        cur.currency
      )}`;
    }
    return data && data.hasKey ? '等待数据…' : '未配置 API Key';
  });

  // 今日花费（可选）：设置面板打开时预览暂存值，否则用已保存配置
  const showSpend = createMemo(() =>
    spendPreview() !== null
      ? spendPreview()!
      : !!(store.config && store.config.showTodaySpend)
  );

  const spend = createMemo(() => {
    if (!showSpend()) return null;
    const data = store.data;
    const main = mainCurrency(data);
    // 今日花费缓存基于主币种构建，当前余额也取主币种的最新快照，保证口径一致
    const curSnap =
      (data?.snapshots || []).find((s) => s.currency === main) || data?.current || null;
    const info = todaySpendFromCache(store.todayCache, curSnap);
    if (!info) {
      return { value: '-', title: '数据不足或含充值，无法可靠估算今日花费' };
    }
    const currency = main || 'CNY';
    const boundary = store.config?.dayBoundary ?? 'local';
    return {
      value: `~${fmtMoney(info.spend, currency)}`,
      title: `估算：基于${info.source} ${fmtMoney(info.baseline, currency)} 推算（已按今日充值校正，${
        boundary === 'utc' ? 'UTC 日界' : '本地日界'
      }）`,
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
