/** 与扩展侧 src/historyStore.ts、src/config.ts 对齐的消息 / 数据模型。 */

export interface Snapshot {
  /** epoch ms */
  t: number;
  total: number;
  toppedUp: number;
  granted: number;
  currency: string;
  /** 账户当前是否可用（是否有余额可调用） */
  available: boolean;
}

export interface DayAgg {
  /** 本地时间当天 0 点对应的 epoch ms */
  day: number;
  total: number;
  toppedUp: number;
  granted: number;
  currency: string;
}

export interface Threshold {
  below: number;
  color: string;
}

export type ConnectorStyle = 'dashed' | 'dotted' | 'solid' | 'ignore' | 'none';

export type LineStyle = 'straight' | 'smooth';

/** 「今日花费」日界时区：本地自然日 或 UTC（与 DeepSeek 官方口径一致）。 */
export type DayBoundary = 'local' | 'utc';

export interface PanelConfig {
  pollMinutes: number;
  statusBarShow: boolean;
  defaultColor: string;
  thresholds: Threshold[];
  rawRetentionDays: number;
  showTodaySpend: boolean;
  connectorStyle: ConnectorStyle;
  connectorColor: string;
  lineStyle: LineStyle;
  dayBoundary: DayBoundary;
}

/** webview init 消息 payload。 */
export interface InitPayload {
  snapshots: Snapshot[];
  daily: DayAgg[];
  current: Snapshot | null;
  config: PanelConfig;
  hasKey: boolean;
  /** 图表 Y 轴最小跨度比例（webview 本地设置，存扩展 globalState，非 VS Code 设置；0 = 关闭）。 */
  yMinSpanRatio: number;
}

/** 图表数据点（viewPoints 归一化后的统一形态）。 */
export interface ChartPoint {
  t: number;
  total: number;
  toppedUp: number;
  granted: number;
  currency: string;
}

export interface TooltipRow {
  label: string;
  value: string;
}

/** 悬停信息（pointX/pointY 为图表坐标，相对 container 左上角；位置由 Tooltip 组件计算）。 */
export interface TooltipInfo {
  pointX: number;
  pointY: number;
  title: string;
  rows: TooltipRow[];
}

// ---------- 图表布局（由 Chart.tsx 的 layout memo 派生，拆分子组件共享） ----------

export interface XLabel {
  t: number;
  x: number;
  text: string;
  w: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface YLabel {
  v: number;
  y: number;
  text: string;
}

export interface Layout {
  xOf: (t: number) => number;
  yOf: (v: number) => number;
  yMin: number;
  yMax: number;
  currency: string;
  w: number;
  h: number;
  xStep: number;
  xTicks: number[];
  xLabels: XLabel[];
  yTicks: number[];
  yLabels: YLabel[];
  plotLeft: number;
  plotRight: number;
}
