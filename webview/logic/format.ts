/** 纯格式化工具（从 media/chart.js 原样迁移，无状态依赖）。 */

export function sym(c: string): string {
  return c === 'CNY' ? '¥' : c === 'USD' ? '$' : `${c || ''} `;
}

export function fmtMoney(n: number, currency: string): string {
  return `${sym(currency)}${Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtAxisMoney(v: number, currency: string): string {
  return `${sym(currency)}${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtClock(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDayShort(t: number): string {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtMonth(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// 与扩展侧共用同一实现（src/shared/dates.ts），避免本地时区逻辑两处漂移
// （此前 webview 与 historyStore 各有一份 startOfDay/startOfLocalDay）
export { startOfDay, startOfDayAt } from '../../src/shared/dates';
