/** 轴 / 刻度工具（纯逻辑，与渲染解耦）。 */
import type { ViewKey } from './viewport';
import { fmtClock, fmtDayShort, fmtMonth } from './format';

/** 绘图区边距。 */
export const M = { top: 16, right: 18, bottom: 30, left: 66 };

const TIME_STEPS = [
  60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 6 * 3600e3, 12 * 3600e3,
  24 * 3600e3, 2 * 86400e3, 7 * 86400e3, 14 * 86400e3, 30 * 86400e3, 60 * 86400e3,
  90 * 86400e3, 180 * 86400e3, 365 * 86400e3,
];

/** Y 轴 nice ticks。 */
export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/** X 轴时间步长。 */
export function niceTimeStep(dur: number): number {
  const target = dur / 8;
  for (const s of TIME_STEPS) {
    if (s >= target) return s;
  }
  return 365 * 86400e3;
}

/** X 轴刻度标签。 */
export function fmtAxisTime(t: number, step: number, view: ViewKey): string {
  if (view === 'monthly' || step >= 30 * 86400e3) return fmtMonth(t);
  if (view === 'daily' || step >= 24 * 3600e3) return fmtDayShort(t);
  return fmtClock(t);
}

/** 估算文本渲染宽度（用于轴标签防重叠；ASCII 约 0.55em，宽字符约 1em）。 */
export function estimateTextWidth(text: string, fontSize = 11): number {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55;
  }
  return Math.max(28, w + 4);
}

/** Y 轴最小跨度约束：限制纵向放大倍数，避免小波动被画成陡崖。
 *  域跨度不足最大值的 ratio 倍时向下扩展、锚定上限（顶部刻度 = 真实峰值）；
 *  被 0 基线挡住仍不足时抬上限兜底。ratio <= 0 表示关闭约束。 */
export function enforceMinSpan(
  yMin: number,
  yMax: number,
  ratio: number
): { yMin: number; yMax: number } {
  if (!(ratio > 0) || !isFinite(yMax) || yMax <= 0) return { yMin, yMax };
  const minSpan = yMax * ratio;
  if (yMax - yMin >= minSpan) return { yMin, yMax };
  const nyMin = Math.max(0, yMax - minSpan);
  if (yMax - nyMin >= minSpan) return { yMin: nyMin, yMax };
  return { yMin: nyMin, yMax: nyMin + minSpan };
}
