import * as vscode from 'vscode';
import { getRawRetentionDays } from './config';

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

/**
 * 历史快照存储：全部放在 VS Code 全局状态（globalState）中，不落在项目目录。
 * - 原始分钟级快照只保留最近 N 天（分时视图数据来源），更早的滚动聚合进按天记录。
 * - 按天记录保留最近约 3 年。
 */
export class HistoryStore {
  private snapshots: Snapshot[] = [];
  private daily: DayAgg[] = [];

  constructor(private memento: vscode.Memento) {
    this.snapshots = (memento.get<Snapshot[]>('snapshots', []) || [])
      .filter((s) => s && typeof s.t === 'number' && typeof s.total === 'number')
      .sort((a, b) => a.t - b.t);
    this.daily = (memento.get<DayAgg[]>('daily', []) || [])
      .filter((d) => d && typeof d.day === 'number' && typeof d.total === 'number')
      .sort((a, b) => a.day - b.day);
    this.prune();
  }

  append(s: Snapshot): void {
    this.snapshots.push(s);
    this.upsertDaily(s);
    this.prune();
    void this.persist();
  }

  getSnapshots(): Snapshot[] {
    return this.snapshots.slice();
  }

  getDaily(): DayAgg[] {
    return this.daily.slice();
  }

  getLatest(): Snapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  clear(): void {
    this.snapshots = [];
    this.daily = [];
    void this.persist();
  }

  private upsertDaily(s: Snapshot): void {
    const day = startOfLocalDay(s.t);
    const existing = this.daily.find((d) => d.day === day);
    if (existing) {
      existing.total = s.total;
      existing.toppedUp = s.toppedUp;
      existing.granted = s.granted;
      existing.currency = s.currency;
    } else {
      this.daily.push({
        day,
        total: s.total,
        toppedUp: s.toppedUp,
        granted: s.granted,
        currency: s.currency,
      });
      this.daily.sort((a, b) => a.day - b.day);
    }
  }

  private prune(): void {
    const retentionMs = getRawRetentionDays() * 24 * 3600 * 1000;
    const cutoff = Date.now() - retentionMs;
    const keep = this.snapshots.filter((s) => s.t >= cutoff);
    // 至少保留最近一条，避免清空
    if (keep.length === 0 && this.snapshots.length > 0) {
      keep.push(this.snapshots[this.snapshots.length - 1]);
    }
    this.snapshots = keep;
    // 按天记录封顶约 3 年
    if (this.daily.length > 1100) {
      this.daily = this.daily.slice(this.daily.length - 1100);
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.memento.update('snapshots', this.snapshots);
      await this.memento.update('daily', this.daily);
    } catch (e) {
      console.error('[deepseek-stats] 保存历史失败', e);
    }
  }
}

export function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
