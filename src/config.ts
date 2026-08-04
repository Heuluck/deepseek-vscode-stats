import * as vscode from 'vscode';

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

/** 下发给设置面板的完整配置快照。 */
export interface PanelConfig {
  pollMinutes: number;
  statusBarShow: boolean;
  defaultColor: string;
  thresholds: Threshold[];
  rawRetentionDays: number;
}

export function getPanelConfig(): PanelConfig {
  return {
    pollMinutes: getPollIntervalMinutes(),
    statusBarShow: getShowStatusBar(),
    defaultColor: getDefaultColor(),
    thresholds: getThresholds(),
    rawRetentionDays: getRawRetentionDays(),
  };
}
