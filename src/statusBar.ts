import * as vscode from 'vscode';
import { getDefaultColor, getShowStatusBar, getThresholds } from './config';
import type { Snapshot } from './historyStore';

export function fmtMoney(n: number, currency: string): string {
  const s = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `;
  return `${s}${Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 状态栏余额显示：点击打开图表；支持按阈值变色 + 默认颜色配置。 */
export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private current: Snapshot | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'deepseek-stats.openChart';
    this.item.show();
  }

  showLoading(): void {
    if (!getShowStatusBar()) {
      this.item.hide();
      return;
    }
    this.item.text = '$(loading~spin) DeepSeek 查询中…';
    this.item.tooltip = '正在查询 DeepSeek 余额';
    this.item.color = undefined;
    this.item.show();
  }

  showNoKey(): void {
    if (!getShowStatusBar()) {
      this.item.hide();
      return;
    }
    this.item.text = '$(key) DeepSeek: 未配置';
    this.item.tooltip = 'DeepSeek Stats：尚未配置 API Key，点击设置';
    this.item.command = 'deepseek-stats.setApiKey';
    this.item.color = undefined;
    this.item.show();
  }

  showError(err: string): void {
    if (!getShowStatusBar()) {
      this.item.hide();
      return;
    }
    const msg = String(err || '未知错误');
    this.item.text = '$(warning) DeepSeek 查询失败';
    this.item.tooltip = `DeepSeek Stats 查询失败：${msg}`;
    this.item.color = undefined;
    this.item.show();
  }

  update(s: Snapshot): void {
    this.current = s;
    if (!getShowStatusBar()) {
      this.item.hide();
      return;
    }
    const d = new Date(s.t);
    const date = d.toLocaleDateString('zh-CN');
    const time = d.toLocaleTimeString('zh-CN', { hour12: false });
    this.item.text = `$(graph-line) ${fmtMoney(s.total, s.currency)}`;
    this.item.command = 'deepseek-stats.openChart';
    this.item.tooltip = [
      `DeepSeek 余额（${date} ${time}）`,
      `总余额：${fmtMoney(s.total, s.currency)}`,
      `充值：${fmtMoney(s.toppedUp, s.currency)}`,
      `赠送：${fmtMoney(s.granted, s.currency)}`,
      s.available ? '账户可用' : '账户余额不足',
      '点击打开趋势图',
    ].join('\n');
    this.applyColor(s.total);
    this.item.show();
  }

  refresh(): void {
    if (this.current) {
      this.update(this.current);
    } else {
      this.showLoading();
    }
  }

  dispose(): void {
    this.item.dispose();
  }

  private applyColor(total: number): void {
    let color: string | undefined = getDefaultColor() || undefined;
    for (const t of getThresholds()) {
      if (total < t.below) {
        color = t.color;
        break;
      }
    }
    this.item.color = color;
  }
}
