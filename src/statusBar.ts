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
  private latest: Snapshot[] = [];

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

  /** 一次轮询可能产出多币种快照：主账户（CNY 优先）决定阈值变色，其余币种并列展示。 */
  update(snaps: Snapshot[]): void {
    if (!snaps.length) return;
    this.latest = snaps;
    if (!getShowStatusBar()) {
      this.item.hide();
      return;
    }
    // 主币种：当前有钱的优先（CNY 优先），全没钱则退回 CNY，再退回第一条
    const withMoney = snaps.filter((s) => s.total > 0);
    const main =
      withMoney.find((s) => s.currency === 'CNY') ||
      withMoney[0] ||
      snaps.find((s) => s.currency === 'CNY') ||
      snaps[0];
    // 其余只展示当前有钱的（避免状态栏塞一堆 0 余额账户）
    const others = snaps.filter((s) => s !== main && s.total > 0);
    const d = new Date(main.t);
    const date = d.toLocaleDateString('zh-CN');
    const time = d.toLocaleTimeString('zh-CN', { hour12: false });
    const parts = [fmtMoney(main.total, main.currency), ...others.map((s) => fmtMoney(s.total, s.currency))];
    this.item.text = `$(graph-line) ${parts.join(' · ')}`;
    this.item.command = 'deepseek-stats.openChart';
    this.item.tooltip = [
      `DeepSeek 余额（${date} ${time}）`,
      ...snaps.map((s) => `总余额（${s.currency}）：${fmtMoney(s.total, s.currency)}`),
      ...snaps.map((s) => `充值（${s.currency}）：${fmtMoney(s.toppedUp, s.currency)}`),
      ...snaps.map((s) => `赠送（${s.currency}）：${fmtMoney(s.granted, s.currency)}`),
      main.available ? '账户可用' : '账户余额不足',
      '点击打开趋势图',
    ].join('\n');
    this.applyColor(main.total);
    this.item.show();
  }

  refresh(): void {
    if (this.latest.length) {
      this.update(this.latest);
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
