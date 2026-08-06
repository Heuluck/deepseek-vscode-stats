/**
 * 共享的本地时区日期工具（extension 与 webview 共用）。
 * 过去 src/historyStore.ts（startOfLocalDay）与 webview/logic/format.ts（startOfDay）
 * 各有一份相同实现，存在漂移风险；统一从本文件导出。
 */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 按日界时区求某时刻的“天”起点（epoch ms）。
 * - 'local'：本地自然日 0 点（startOfDay）
 * - 'utc'：UTC 0 点（DeepSeek 官方每日用量口径）
 */
export function startOfDayAt(t: number, boundary: 'local' | 'utc'): number {
  if (boundary === 'utc') {
    return Math.floor(t / 86400e3) * 86400e3;
  }
  return startOfDay(t);
}
