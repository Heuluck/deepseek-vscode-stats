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

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
