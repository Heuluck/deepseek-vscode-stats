/** 与扩展侧 src/extension.ts 对齐的消息契约。 */
import type {
  ConnectorStyle,
  DayBoundary,
  InitPayload,
  LineStyle,
  PanelConfig,
  Snapshot,
  Threshold,
} from './types';

/** 扩展 → webview。 */
export type ExtensionToWebview =
  | { type: 'init'; payload: InitPayload }
  | { type: 'snapshot'; payload: Snapshot }
  | { type: 'config'; payload: PanelConfig }
  | { type: 'settingsReset' }
  | { type: 'theme' }
  | { type: 'error'; payload: { message: string } };

export interface SaveSettingsPayload {
  statusBarShow: boolean;
  defaultColor: string;
  thresholds: Threshold[];
  pollMinutes: number;
  rawRetentionDays: number;
  showTodaySpend: boolean;
  connectorStyle: ConnectorStyle;
  connectorColor: string;
  lineStyle: LineStyle;
  dayBoundary: DayBoundary;
}

/** webview → 扩展。 */
export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'checkNow' }
  | { type: 'openUsage' }
  | { type: 'openStatusPage' }
  | { type: 'setApiKey' }
  | { type: 'clearApiKey' }
  | { type: 'clearHistory' }
  | { type: 'resetSettings' }
  | { type: 'openNativeSettings' }
  | { type: 'saveSettings'; payload: SaveSettingsPayload }
  | { type: 'setYMinSpanRatio'; payload: { ratio: number } };

interface VsCodeApi {
  postMessage(msg: unknown): void;
}

let api: VsCodeApi | null = null;

export function initMessaging(vsCodeApi: VsCodeApi): void {
  api = vsCodeApi;
}

export function postMessage(msg: WebviewToExtension): void {
  // Solid store 的 proxy 对象无法被 postMessage 结构化克隆，统一转成 plain data
  api?.postMessage(JSON.parse(JSON.stringify(msg)));
}
