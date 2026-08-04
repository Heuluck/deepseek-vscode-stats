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

export type ConnectorStyle = 'dashed' | 'solid' | 'none';

export interface PanelConfig {
  pollMinutes: number;
  statusBarShow: boolean;
  defaultColor: string;
  thresholds: Threshold[];
  rawRetentionDays: number;
  showTodaySpend: boolean;
  connectorStyle: ConnectorStyle;
  connectorColor: string;
}

/** webview init 消息 payload。 */
export interface InitPayload {
  snapshots: Snapshot[];
  daily: DayAgg[];
  current: Snapshot | null;
  config: PanelConfig;
  hasKey: boolean;
}

/** 图表数据点（viewPoints 归一化后的统一形态）。 */
export interface ChartPoint {
  t: number;
  total: number;
  toppedUp: number;
  granted: number;
  currency: string;
}
