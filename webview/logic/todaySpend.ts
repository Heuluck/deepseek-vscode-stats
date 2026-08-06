/** 今日花费估算（增量缓存版，从 media/chart.js 迁移，纯函数）。
 *  支持按日界时区（本地自然日 / UTC）计算「今日」。 */
import type { InitPayload, Snapshot, DayBoundary } from '../types';
import { startOfDayAt } from './format';

/**
 * 金额浮点容差：余额最小单位 0.01，此值远小于它，既能挡浮点噪声（1e-15 量级）
 * 误判成充值，又不会漏掉任何真实充值/消费。
 */
const EPS = 1e-6;

export interface TodaySpendInfo {
  spend: number;
  source: string;
  baseline: number;
}

/**
 * 今日花费增量缓存：只维护「基准余额 + 今日累计充值/赠送」。
 * - 扫描范围最多一天：build 只扫今日快照，advance 只扫新增（lastT 之后）快照。
 * - 已扫过的旧快照不重复扫，充值额累计在 recharge 里。
 * 充值/赠送的识别：余额只会因消费而下降、不会凭空增多，快照间 total 的每次正跳增
 * （含断档跨段）都认定是一次充值/赠送。数据不足时 build 返回 null，UI 显示 “-”。
 */
export interface TodaySpendCache {
  /** 缓存所属的日界起点（epoch ms，按 boundary 时区），跨天时重建 */
  day: number;
  /** 日界时区：'local' | 'utc'；切换时重建 */
  boundary: DayBoundary;
  /** 基准余额（昨日收盘，否则今日首条快照） */
  baseline: number;
  /** 基准来源描述（用于 UI title） */
  source: string;
  /** 今日累计充值/赠送（所有 total 正跳增之和） */
  recharge: number;
  /** 已处理到的最后一条快照时间；仅处理其后（t > lastT）的新快照 */
  lastT: number;
  /** 已处理到的最后一条快照 total，用于计算下一条的跳增 */
  prevTotal: number;
}

/**
 * 找到基准：昨日（日界当天）收盘余额，否则今日首条快照。
 * 直接从 snapshots 按日界取（snapshots 有精确时间戳，可任意日界切），
 * 不依赖 daily 的本地日键——否则 UTC 日界时昨日基准会错位。
 * 与原「daily[昨日].total」语义等价：昨日有快照则取其最后一条 total。
 */
function findBaseline(
  data: InitPayload,
  todayStart: number
): { baseline: number; source: string } | null {
  const yesterdayStart = todayStart - 86400e3;
  let prevTotal: number | null = null;
  for (const s of data.snapshots) {
    if (s.t >= todayStart) break; // 快照有序
    if (s.t >= yesterdayStart) prevTotal = s.total;
  }
  if (prevTotal !== null) {
    return { baseline: prevTotal, source: '昨日余额' };
  }
  const firstToday = data.snapshots.find((s) => s.t >= todayStart);
  if (firstToday) {
    return { baseline: firstToday.total, source: '今日首条快照' };
  }
  return null;
}

/**
 * 从基准余额起遍历今日快照，累加 total 正跳增。
 * 返回 [累计充值, 最后一条 total, 最后一条 t]（快照需按时间升序）。
 */
function scanToday(
  snapshots: Snapshot[],
  todayStart: number,
  baseline: number
): [recharge: number, prevTotal: number, lastT: number] {
  let recharge = 0;
  let prev = baseline;
  let lastT = 0;
  for (const s of snapshots) {
    if (s.t < todayStart) continue;
    const gain = s.total - prev;
    if (gain > EPS) recharge += gain;
    prev = s.total;
    lastT = s.t;
  }
  return [recharge, prev, lastT];
}

/**
 * 全量重建缓存（面板初始化 / 跨天时调用）。只扫描最多一天的快照。
 * now 可注入用于测试（默认 Date.now()）；boundary 为日界时区。
 * 仅当最后快照属于 now 所在日才构建——今天还没有快照（如刚开机未轮询）时
 * 返回 null，避免把昨天的消费标成“今日花费”。
 */
export function buildTodaySpendCache(
  data: InitPayload | null,
  now: number = Date.now(),
  boundary: DayBoundary = 'local'
): TodaySpendCache | null {
  if (!data || !data.snapshots.length) return null;
  const snapshots = data.snapshots;
  // 以最后一条快照的日界（按 boundary 时区）为准，保证与 advance 的跨天判定一致
  const todayStart = startOfDayAt(snapshots[snapshots.length - 1].t, boundary);
  if (todayStart !== startOfDayAt(now, boundary)) return null;
  const base = findBaseline(data, todayStart);
  if (!base) return null;
  const [recharge, prevTotal, lastT] = scanToday(snapshots, todayStart, base.baseline);
  return {
    day: todayStart,
    boundary,
    baseline: base.baseline,
    source: base.source,
    recharge,
    lastT,
    prevTotal,
  };
}

/**
 * 增量推进缓存（新快照到达时调用）。跨天、日界时区切换或缓存缺失时自动重建；
 * 否则只扫描 lastT 之后的新快照，把新增正跳增累加进 recharge。
 * now 透传给 build 用于跨天重建（默认 Date.now()）；boundary 为日界时区。
 */
export function advanceTodaySpendCache(
  cache: TodaySpendCache | null,
  data: InitPayload | null,
  now: number = Date.now(),
  boundary: DayBoundary = 'local'
): TodaySpendCache | null {
  if (!data || !data.snapshots.length) return cache;
  const snapshots = data.snapshots;
  const day = startOfDayAt(snapshots[snapshots.length - 1].t, boundary);
  // 跨天或日界时区切换时重建
  if (!cache || cache.day !== day || cache.boundary !== boundary) {
    return buildTodaySpendCache(data, now, boundary);
  }
  // 快照有序：从尾部回扫定位新增段起点，只处理 lastT 之后的新快照，不遍历旧数据
  let i = snapshots.length - 1;
  while (i >= 0 && snapshots[i].t > cache.lastT) i--;
  let { recharge, prevTotal } = cache;
  let lastT = cache.lastT;
  for (let j = i + 1; j < snapshots.length; j++) {
    const s = snapshots[j];
    const gain = s.total - prevTotal;
    if (gain > EPS) recharge += gain;
    prevTotal = s.total;
    lastT = s.t;
  }
  return { ...cache, recharge, lastT, prevTotal };
}

/** 从缓存算今日花费：基准 + 累计充值 − 当前余额。不可信（负值）时返回 null。 */
export function todaySpendFromCache(
  cache: TodaySpendCache | null,
  current: Snapshot | null
): TodaySpendInfo | null {
  if (!cache || !current) return null;
  const spend = cache.baseline + cache.recharge - current.total;
  if (!Number.isFinite(spend)) return null;
  if (spend < 0) {
    // 浮点容错：微负视为 0；明显为负说明数据异常，返回 null 让 UI 显示 “-”
    if (spend > -EPS) return { spend: 0, source: cache.source, baseline: cache.baseline };
    return null;
  }
  return { spend, source: cache.source, baseline: cache.baseline };
}
