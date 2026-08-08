import * as vscode from 'vscode';
import { getLanguageSetting, type LanguageSetting } from './i18n';

export interface Threshold {
  below: number;
  color: string;
}

export function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('deepseek-stats');
}

export function getPollIntervalMinutes(): number {
  const v = getConfig().get<number>('pollIntervalMinutes', 1);
  return Math.max(1, Math.round(v || 1));
}

export function getShowStatusBar(): boolean {
  return getConfig().get<boolean>('statusBar.show', true);
}

export function getDefaultColor(): string {
  return (getConfig().get<string>('statusBar.defaultColor', '') || '').trim();
}

export function getThresholds(): Threshold[] {
  const raw = getConfig().get<Threshold[]>('statusBar.thresholds', []);
  return (raw || [])
    .filter((t) => t && typeof t.below === 'number' && typeof t.color === 'string' && t.color)
    .sort((a, b) => a.below - b.below);
}

export function getRawRetentionDays(): number {
  const v = getConfig().get<number>('history.rawRetentionDays', 7);
  return Math.max(1, Math.round(v || 7));
}

export function getShowTodaySpend(): boolean {
  return getConfig().get<boolean>('showTodaySpend', false);
}

export type ConnectorStyle = 'dashed' | 'dotted' | 'solid' | 'ignore' | 'none';

export function getConnectorStyle(): ConnectorStyle {
  const v = getConfig().get<string>('chart.connectorStyle', 'dashed');
  return v === 'dotted' || v === 'solid' || v === 'ignore' || v === 'none' ? v : 'dashed';
}

export function getConnectorColor(): string {
  return (getConfig().get<string>('chart.connectorColor', '') || '').trim();
}

export type LineStyle = 'straight' | 'smooth';

export function getLineStyle(): LineStyle {
  const v = getConfig().get<string>('chart.lineStyle', 'straight');
  return v === 'smooth' ? v : 'straight';
}

/** 「今日花费」日界时区：本地自然日 或 UTC（与 DeepSeek 官方口径一致）。 */
export type DayBoundary = 'local' | 'utc';

export function getDayBoundary(): DayBoundary {
  const v = getConfig().get<string>('dayBoundary', 'local');
  return v === 'utc' ? 'utc' : 'local';
}

/** 下发给设置面板的完整配置快照。 */
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
  language: LanguageSetting;
}

export function getPanelConfig(): PanelConfig {
  return {
    pollMinutes: getPollIntervalMinutes(),
    statusBarShow: getShowStatusBar(),
    defaultColor: getDefaultColor(),
    thresholds: getThresholds(),
    rawRetentionDays: getRawRetentionDays(),
    showTodaySpend: getShowTodaySpend(),
    connectorStyle: getConnectorStyle(),
    connectorColor: getConnectorColor(),
    lineStyle: getLineStyle(),
    dayBoundary: getDayBoundary(),
    language: getLanguageSetting(),
  };
}
