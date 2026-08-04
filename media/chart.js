/* DeepSeek Stats — 余额趋势图（Webview 端） */
(() => {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ---------- 视图配置 ----------
  const VIEWS = {
    hourly: {
      label: '分时',
      ranges: [
        { key: '1h', label: '1 小时', ms: 3600e3 },
        { key: '6h', label: '6 小时', ms: 6 * 3600e3 },
        { key: '24h', label: '24 小时', ms: 24 * 3600e3 },
        { key: '7d', label: '7 天', ms: 7 * 86400e3 },
      ],
      defaultRange: '6h',
      tickLabel: 'time',
    },
    daily: {
      label: '分天',
      ranges: [
        { key: '7d', label: '7 天', ms: 7 * 86400e3 },
        { key: '30d', label: '30 天', ms: 30 * 86400e3 },
        { key: '90d', label: '90 天', ms: 90 * 86400e3 },
        { key: 'all', label: '全部', ms: Infinity },
      ],
      defaultRange: '30d',
      tickLabel: 'day',
    },
    monthly: {
      label: '分月',
      ranges: [
        { key: '6m', label: '6 个月', ms: 6 * 30 * 86400e3 },
        { key: '12m', label: '12 个月', ms: 12 * 30 * 86400e3 },
        { key: 'all', label: '全部', ms: Infinity },
      ],
      defaultRange: '12m',
      tickLabel: 'month',
    },
  };

  const M = { top: 16, right: 18, bottom: 30, left: 66 };
  const TIME_STEPS = [
    60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 6 * 3600e3, 12 * 3600e3,
    24 * 3600e3, 2 * 86400e3, 7 * 86400e3, 14 * 86400e3, 30 * 86400e3, 60 * 86400e3,
    90 * 86400e3, 180 * 86400e3, 365 * 86400e3,
  ];

  const state = {
    data: null, // { snapshots, daily, current, pollMinutes, hasKey }
    view: 'hourly',
    rangeKey: null,
    followLive: true,
    viewRange: null, // { start, end }
    maxWindow: 0,
    minWindow: 60e3,
    last: null, // 上一次渲染的缩放上下文 { xOf, yOf, pts, vr, currency, width, height }
    mouseX: -1, // 当前鼠标在图表内的 x 像素坐标（悬停用）
    pinT: null, // 缩放手势期间悬浮线钉住的数据时刻（即缩放锚点）
    pinUntil: 0, // 钉住截止时间（毫秒时间戳）
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const tabsEl = $('tabs');
  const rangesEl = $('ranges');
  const resetBtn = $('resetBtn');
  const usageBtn = $('usageBtn');
  const chartWrap = $('chartWrap');
  const svg = $('chart');
  const tooltip = $('tooltip');
  const emptyEl = $('empty');
  const emptyText = $('emptyText');
  const emptyAction = $('emptyAction');
  const footerInfo = $('footerInfo');
  const footerErr = $('footerErr');
  const settingsBtn = $('settingsBtn');
  const settingsOverlay = $('settingsOverlay');
  const settingsClose = $('settingsClose');
  const keyStatus = $('keyStatus');
  const setKeyBtn = $('setKeyBtn');
  const clearKeyBtn = $('clearKeyBtn');
  const clearHistoryBtn = $('clearHistoryBtn');
  const resetSettingsBtn = $('resetSettingsBtn');
  const ns = 'http://www.w3.org/2000/svg';

  // ---------- 工具 ----------
  const sym = (c) => (c === 'CNY' ? '¥' : c === 'USD' ? '$' : `${c || ''} `);
  const fmtMoney = (n, currency) =>
    `${sym(currency)}${Number(n).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const pad = (n) => String(n).padStart(2, '0');
  const fmtClock = (t) => {
    const d = new Date(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtDay = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtDayShort = (t) => {
    const d = new Date(t);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtMonth = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };

  function currentViewCfg() {
    return VIEWS[state.view];
  }

  function currentRangeMs() {
    const cfg = currentViewCfg();
    const r = cfg.ranges.find((x) => x.key === state.rangeKey) || cfg.ranges[0];
    return r ? r.ms : Infinity;
  }

  function startOfDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // ---------- 数据 ----------
  function viewPoints() {
    const d = state.data;
    if (!d) return [];
    if (state.view === 'hourly') {
      return d.snapshots.slice().sort((a, b) => a.t - b.t);
    }
    if (state.view === 'daily') {
      return d.daily
        .slice()
        .sort((a, b) => a.day - b.day)
        .map((x) => ({
          t: x.day,
          total: x.total,
          toppedUp: x.toppedUp,
          granted: x.granted,
          currency: x.currency,
        }));
    }
    // monthly：按自然月聚合，取当月最后一条
    const byMonth = new Map();
    for (const x of d.daily) {
      const m = startOfDay(new Date(x.day).setDate(1));
      byMonth.set(m, x);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, x]) => ({
        t,
        total: x.total,
        toppedUp: x.toppedUp,
        granted: x.granted,
        currency: x.currency,
      }));
  }

  function computeDataBounds() {
    const pts = viewPoints();
    if (!pts.length) return null;
    return { minT: pts[0].t, maxT: pts[pts.length - 1].t };
  }

  function getPts() {
    const pts = viewPoints();
    if (!state.viewRange) return pts;
    return pts.filter((p) => p.t >= state.viewRange.start && p.t <= state.viewRange.end);
  }

  function resetViewRange() {
    const bounds = computeDataBounds();
    if (!bounds) {
      state.viewRange = null;
      return;
    }
    const ms = currentRangeMs();
    const span = Math.max(bounds.maxT - bounds.minT, 60e3);
    state.maxWindow = Math.max(ms === Infinity ? span : ms, span);
    // 最小可缩放的窗口宽度：分时下限 15 分钟，分天 6 小时，分月 7 天
    state.minWindow =
      state.view === 'hourly' ? 15 * 60e3 : state.view === 'daily' ? 6 * 3600e3 : 7 * 86400e3;
    let start;
    let end;
    if (ms === Infinity) {
      const padAmt = span * 0.03;
      start = bounds.minT - padAmt;
      end = bounds.maxT + padAmt;
    } else {
      end = bounds.maxT;
      start = end - ms;
      if (start < bounds.minT) {
        start = bounds.minT;
        end = start + ms;
      }
    }
    state.viewRange = { start, end };
    state.followLive = true;
  }

  function clampRange(start, end) {
    const bounds = computeDataBounds();
    if (!bounds) return { start, end };
    let dur = end - start;
    if (dur < state.minWindow) {
      end = start + state.minWindow;
      dur = end - start;
    }
    const hi = bounds.maxT + (bounds.maxT - bounds.minT) * 0.05;
    let s = Math.max(bounds.minT, Math.min(start, hi - dur));
    let e = s + dur;
    if (e > hi) {
      e = hi;
      s = e - dur;
    }
    if (s < bounds.minT) {
      s = bounds.minT;
      e = s + dur;
    }
    return { start: s, end: e };
  }

  function onNewData() {
    const bounds = computeDataBounds();
    if (!bounds) return;
    if (!state.viewRange) {
      resetViewRange();
    } else if (state.followLive && currentRangeMs() !== Infinity) {
      // 始终以预设窗口宽度为基准滑动，避免区间被缩放等状态污染
      const end = bounds.maxT;
      const start = Math.max(bounds.minT, end - currentRangeMs());
      state.viewRange = { start, end };
    }
    renderAll();
  }

  function upsertDailyLocal(s) {
    const day = startOfDay(s.t);
    const list = state.data.daily;
    const ex = list.find((d) => d.day === day);
    if (ex) {
      ex.total = s.total;
      ex.toppedUp = s.toppedUp;
      ex.granted = s.granted;
      ex.currency = s.currency;
    } else {
      list.push({
        day,
        total: s.total,
        toppedUp: s.toppedUp,
        granted: s.granted,
        currency: s.currency,
      });
      list.sort((a, b) => a.day - b.day);
    }
  }

  // ---------- 刻度 ----------
  function niceTicks(min, max, count) {
    const span = max - min;
    if (span <= 0) return [min];
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
      out.push(Number(v.toFixed(10)));
    }
    return out;
  }

  function niceTimeStep(dur) {
    const target = dur / 8;
    for (const s of TIME_STEPS) {
      if (s >= target) return s;
    }
    return 365 * 86400e3;
  }

  function fmtAxisTime(t, step) {
    if (state.view === 'monthly' || step >= 30 * 86400e3) return fmtMonth(t);
    if (state.view === 'daily' || step >= 24 * 3600e3) return fmtDayShort(t);
    return fmtClock(t);
  }

  // ---------- 降采样 & 断线 ----------
  function decimate(pts, max) {
    if (pts.length <= max) return pts;
    const out = [];
    const bucket = Math.ceil(pts.length / max);
    for (let i = 0; i < pts.length; i += bucket) {
      const slice = pts.slice(i, i + bucket);
      let minP = slice[0];
      let maxP = slice[0];
      for (const p of slice) {
        if (p.total < minP.total) minP = p;
        if (p.total > maxP.total) maxP = p;
      }
      out.push(slice[0]);
      if (minP !== slice[0] && minP !== slice[slice.length - 1]) out.push(minP);
      if (maxP !== slice[0] && maxP !== slice[slice.length - 1] && maxP !== minP) out.push(maxP);
      out.push(slice[slice.length - 1]);
    }
    return out;
  }

  function medianDt(pts) {
    if (pts.length < 2) return 0;
    const ds = [];
    for (let i = 1; i < pts.length; i++) ds.push(pts[i].t - pts[i - 1].t);
    ds.sort((a, b) => a - b);
    return ds[Math.floor(ds.length / 2)];
  }

  /** 断线阈值：分时视图依赖实际轮询间隔（轮询间隔大时阈值相应放大）。 */
  function effectiveGapMs(pts) {
    if (state.view === 'hourly') {
      return Math.max(10 * 60e3, medianDt(pts) * 3);
    }
    return state.view === 'daily' ? 2 * 86400e3 : 60 * 86400e3;
  }

  function buildSegments(pts, gapMs) {
    const segs = [];
    let cur = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].t - pts[i - 1].t > gapMs) {
        segs.push(cur);
        cur = [];
      }
      cur.push(pts[i]);
    }
    if (cur.length) segs.push(cur);
    return segs;
  }

  // ---------- SVG 辅助 ----------
  function line(parent, x1, y1, x2, y2, cls) {
    const e = document.createElementNS(ns, 'line');
    e.setAttribute('x1', x1);
    e.setAttribute('y1', y1);
    e.setAttribute('x2', x2);
    e.setAttribute('y2', y2);
    e.setAttribute('class', cls);
    parent.appendChild(e);
  }

  function text(parent, x, y, str, anchor, dy) {
    const e = document.createElementNS(ns, 'text');
    e.setAttribute('x', x);
    e.setAttribute('y', y);
    e.setAttribute('text-anchor', anchor || 'start');
    if (dy) e.setAttribute('dominant-baseline', dy);
    e.textContent = str;
    parent.appendChild(e);
  }

  // ---------- 渲染 ----------
  function hideEmpty() {
    emptyEl.classList.add('hidden');
  }

  function drawEmpty(msg, showAction) {
    emptyText.textContent = msg;
    emptyAction.style.display = showAction ? 'inline-block' : 'none';
    emptyEl.classList.remove('hidden');
    svg.innerHTML = '';
    state.last = null;
    tooltip.classList.add('hidden');
  }

  function render() {
    const pts = getPts();
    const bounds = computeDataBounds();
    const d = state.data;

    if (!d) {
      drawEmpty('加载中…', false);
      return;
    }
    if (!bounds || pts.length === 0) {
      const total = (d.snapshots || []).length + (d.daily || []).length;
      if (total === 0) {
        drawEmpty(d.hasKey ? '等待首次查询结果…' : '未配置 API Key', !d.hasKey);
      } else {
        drawEmpty('所选范围内暂无数据', false);
      }
      return;
    }
    hideEmpty();

    const width = chartWrap.clientWidth;
    const height = chartWrap.clientHeight;
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.innerHTML = '';

    const innerW = width - M.left - M.right;
    const innerH = height - M.top - M.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    const vr = state.viewRange || { start: pts[0].t, end: pts[pts.length - 1].t };
    const t0 = vr.start;
    const t1 = vr.end;
    const xOf = (t) => M.left + ((t - t0) / (t1 - t0)) * innerW;

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of pts) {
      if (p.total < yMin) yMin = p.total;
      if (p.total > yMax) yMax = p.total;
    }
    let padY = (yMax - yMin) * 0.08 || Math.max(1, Math.abs(yMax) * 0.05);
    if (padY === 0) padY = 1;
    yMin -= padY;
    yMax += padY;
    const yOf = (v) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const currency = pts[0].currency || 'CNY';

    // 网格 + Y 轴
    const gY = document.createElementNS(ns, 'g');
    gY.setAttribute('class', 'axis');
    svg.appendChild(gY);
    for (const v of niceTicks(yMin, yMax, 5)) {
      const y = yOf(v);
      line(gY, M.left, y, width - M.right, y, 'grid');
      text(gY, M.left - 8, y, fmtAxisMoney(v, currency), 'end', 'middle');
    }

    // X 轴
    const dur = t1 - t0;
    const step = niceTimeStep(dur);
    const gX = document.createElementNS(ns, 'g');
    gX.setAttribute('class', 'axis');
    svg.appendChild(gX);
    const first = Math.ceil(t0 / step) * step;
    for (let t = first; t <= t1; t += step) {
      const x = xOf(t);
      line(gX, x, M.top, x, height - M.bottom, 'grid');
      text(gX, x, height - M.bottom + 16, fmtAxisTime(t, step), 'middle', 'hanging');
    }

    // 折线（断线分段）+ 面积
    const decimated = decimate(pts, 4000);
    const gapMs = effectiveGapMs(decimated);
    const segments = buildSegments(decimated, gapMs);
    const baseY = yOf(yMin);
    for (const seg of segments) {
      if (seg.length >= 2) {
        const dPath = seg
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.total).toFixed(1)}`)
          .join(' ');
        const area = document.createElementNS(ns, 'path');
        area.setAttribute(
          'd',
          `${dPath} L${xOf(seg[seg.length - 1].t).toFixed(1)},${baseY.toFixed(1)} L${xOf(seg[0].t).toFixed(1)},${baseY.toFixed(1)} Z`
        );
        area.setAttribute('class', 'area');
        svg.appendChild(area);
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', dPath);
        path.setAttribute('class', 'line');
        svg.appendChild(path);
      } else {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', xOf(seg[0].t));
        c.setAttribute('cy', yOf(seg[0].total));
        c.setAttribute('r', 3);
        c.setAttribute('class', 'line isolated');
        svg.appendChild(c);
      }
    }

    state.last = { xOf, yOf, pts, vr, currency, width, height };
    drawHover();
  }

  function fmtAxisMoney(v, currency) {
    return `${sym(currency)}${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
  }

  // ---------- 悬停 ----------
  function drawHover() {
    svg.querySelectorAll('.crosshair,.hover-dot').forEach((n) => n.remove());
    if (!state.last || !state.last.pts.length) {
      tooltip.classList.add('hidden');
      return;
    }
    const { xOf, yOf, pts, currency } = state.last;
    const pinned = state.pinT !== null && Date.now() < state.pinUntil;
    let idx = -1;
    let best = Infinity;
    if (pinned) {
      // 缩放手势中：悬浮线钉在缩放锚点上（标记放大位置）
      for (let i = 0; i < pts.length; i++) {
        const dx = Math.abs(pts[i].t - state.pinT);
        if (dx < best) {
          best = dx;
          idx = i;
        }
      }
    } else if (state.mouseX >= 0) {
      // 平常：跟随鼠标
      for (let i = 0; i < pts.length; i++) {
        const dx = Math.abs(xOf(pts[i].t) - state.mouseX);
        if (dx < best) {
          best = dx;
          idx = i;
        }
      }
      if (best > 80) idx = -1;
    }
    if (idx < 0) {
      tooltip.classList.add('hidden');
      return;
    }
    const p = pts[idx];
    const x = xOf(p.t);
    const y = yOf(p.total);

    const c = document.createElementNS(ns, 'line');
    c.setAttribute('class', 'crosshair');
    c.setAttribute('x1', x);
    c.setAttribute('y1', M.top);
    c.setAttribute('x2', x);
    c.setAttribute('y2', chartWrap.clientHeight - M.bottom);
    svg.appendChild(c);

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'hover-dot');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r', 4);
    svg.appendChild(dot);

    tooltip.innerHTML = '';
    const time = document.createElement('div');
    time.className = 'tt-time';
    time.textContent =
      state.view === 'monthly'
        ? fmtMonth(p.t)
        : state.view === 'daily'
        ? fmtDay(p.t)
        : fmtDayShort(p.t) + ' ' + fmtClock(p.t);
    tooltip.appendChild(time);
    tooltip.appendChild(ttRow('总余额', fmtMoney(p.total, currency)));
    tooltip.appendChild(ttRow('充值', fmtMoney(p.toppedUp, currency)));
    tooltip.appendChild(ttRow('赠送', fmtMoney(p.granted, currency)));
    tooltip.classList.remove('hidden');

    const wrap = chartWrap.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let tx = x + 14;
    if (tx + tw > wrap.width - 8) tx = x - tw - 14;
    if (tx < 8) tx = 8;
    let ty = y - th - 12;
    if (ty < 8) ty = y + 14;
    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ty}px`;
  }

  function ttRow(label, val) {
    const r = document.createElement('div');
    r.className = 'tt-row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('b');
    v.textContent = val;
    r.appendChild(l);
    r.appendChild(v);
    return r;
  }

  // ---------- 头部 / 页脚 ----------
  function renderHeader() {
    const d = state.data;
    const cur = d && d.current;
    const total = $('curTotal');
    const meta = $('curMeta');
    if (cur) {
      total.textContent = fmtMoney(cur.total, cur.currency);
      meta.textContent = `充值 ${fmtMoney(cur.toppedUp, cur.currency)} · 赠送 ${fmtMoney(
        cur.granted,
        cur.currency
      )} · ${cur.available ? '可用' : '余额不足'}`;
    } else {
      total.textContent = '--';
      meta.textContent = d && d.hasKey ? '等待数据…' : '未配置 API Key';
    }
  }

  function updateKeyStatus() {
    const d = state.data;
    keyStatus.textContent = d && d.hasKey ? '已配置（存储于系统钥匙串）' : '未配置';
  }

  function renderFooter() {
    const d = state.data;
    if (!d) {
      footerInfo.textContent = '';
      footerErr.textContent = '';
      return;
    }
    const count = (d.snapshots || []).length;
    const last = d.current;
    const lastStr = last
      ? `上次同步 ${new Date(last.t).toLocaleTimeString('zh-CN', { hour12: false })}`
      : '';
    footerInfo.textContent = `仅记录 VS Code 打开期间的数据 · 轮询间隔 ${
      d.pollMinutes || 1
    } 分钟 · 快照 ${count} 条 · ${lastStr}`;
    footerErr.textContent = state.lastError ? `⚠ ${state.lastError}` : '';
  }

  function renderAll() {
    renderHeader();
    renderTabs();
    renderRanges();
    render();
    renderFooter();
  }

  // ---------- 控件 ----------
  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const [key, cfg] of Object.entries(VIEWS)) {
      const b = document.createElement('button');
      b.className = 'tab' + (key === state.view ? ' active' : '');
      b.textContent = cfg.label;
      b.addEventListener('click', () => {
        if (state.view === key) return;
        state.view = key;
        state.rangeKey = cfg.defaultRange;
        resetViewRange();
        renderAll();
      });
      tabsEl.appendChild(b);
    }
  }

  function renderRanges() {
    rangesEl.innerHTML = '';
    const cfg = currentViewCfg();
    for (const r of cfg.ranges) {
      const b = document.createElement('button');
      b.className = 'btn small' + (r.key === state.rangeKey ? ' primary' : '');
      b.textContent = r.label;
      b.addEventListener('click', () => {
        if (state.rangeKey === r.key) return;
        state.rangeKey = r.key;
        resetViewRange();
        renderAll();
      });
      rangesEl.appendChild(b);
    }
  }

  // ---------- 交互：缩放 / 平移 / 悬停 ----------
  // 滚轮缩放：缩放量与该事件 delta 成正比（连续滚动逐事件平滑）。
  // 一次缩放手势（相邻滚动间隔 < 300ms）在开始时锁定锚点：
  // 整段手势都围绕“最开始选中的那一段”缩放（吸附到最近的悬浮点），
  // 而不是每个事件都重新按当前鼠标位置取锚点。
  let zoomAnchorT = null;
  let zoomAnchorFrac = 0;
  let lastWheelTs = 0;
  chartWrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (!state.last || !state.viewRange) return;
      const now = Date.now();
      const rect = svg.getBoundingClientRect();
      const innerW = rect.width - M.left - M.right;
      if (innerW <= 0) return;
      const mx = e.clientX - rect.left;
      const vr = state.viewRange;
      const tCursor = vr.start + ((mx - M.left) / innerW) * (vr.end - vr.start);
      if (now - lastWheelTs > 300) {
        // 手势开始：锚点吸附到最近的可见数据点（与悬浮线所指一致）
        const pts = state.last.pts;
        let best = Infinity;
        let bt = tCursor;
        for (const p of pts) {
          const dx = Math.abs(p.t - tCursor);
          if (dx < best) {
            best = dx;
            bt = p.t;
          }
        }
        const snapLimit = (vr.end - vr.start) * 0.15;
        zoomAnchorT = best <= snapLimit ? bt : tCursor;
        zoomAnchorFrac = (zoomAnchorT - vr.start) / (vr.end - vr.start);
      }
      lastWheelTs = now;
      // 缩放进行中：悬浮线钉在锚点上，直观显示正在围绕哪个点缩放
      state.pinT = zoomAnchorT;
      state.pinUntil = now + 350;
      const factor = Math.pow(1.15, -e.deltaY / 120);
      let dur = (vr.end - vr.start) * factor;
      dur = Math.min(state.maxWindow, Math.max(state.minWindow, dur));
      const r = clampRange(
        zoomAnchorT - zoomAnchorFrac * dur,
        zoomAnchorT + (1 - zoomAnchorFrac) * dur
      );
      state.viewRange = r;
      state.followLive = false;
      render();
    },
    { passive: false }
  );

  let drag = null;
  chartWrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !state.viewRange) return;
    drag = { startX: e.clientX, startRange: { ...state.viewRange } };
    state.mouseX = -1; // 拖拽平移时隐藏悬浮线，避免误导
    chartWrap.setPointerCapture(e.pointerId);
  });
  chartWrap.addEventListener('pointermove', (e) => {
    if (!drag || !state.viewRange) return;
    const rect = svg.getBoundingClientRect();
    const innerW = rect.width - M.left - M.right;
    const dur = drag.startRange.end - drag.startRange.start;
    const shift = ((drag.startX - e.clientX) / innerW) * dur;
    const r = clampRange(drag.startRange.start + shift, drag.startRange.end + shift);
    state.viewRange = r;
    state.followLive = false;
    render();
  });
  chartWrap.addEventListener('pointerup', () => {
    drag = null;
  });
  chartWrap.addEventListener('pointercancel', () => {
    drag = null;
  });

  chartWrap.addEventListener('mousemove', (e) => {
    if (drag) return;
    const rect = svg.getBoundingClientRect();
    state.mouseX = e.clientX - rect.left;
    drawHover();
  });
  chartWrap.addEventListener('mouseleave', () => {
    state.mouseX = -1;
    drawHover();
  });

  // 双击图表重置视图范围（误缩放后一键恢复）
  chartWrap.addEventListener('dblclick', () => {
    resetViewRange();
    renderAll();
  });

  resetBtn.addEventListener('click', () => {
    resetViewRange();
    renderAll();
  });
  usageBtn.addEventListener('click', () => vscode.postMessage({ type: 'openUsage' }));
  emptyAction.addEventListener('click', () => vscode.postMessage({ type: 'setApiKey' }));

  // 设置页
  settingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
  settingsClose.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
  setKeyBtn.addEventListener('click', () => vscode.postMessage({ type: 'setApiKey' }));
  clearKeyBtn.addEventListener('click', () => vscode.postMessage({ type: 'clearApiKey' }));
  clearHistoryBtn.addEventListener('click', () => vscode.postMessage({ type: 'clearHistory' }));
  resetSettingsBtn.addEventListener('click', () => vscode.postMessage({ type: 'resetSettings' }));

  // ---------- 消息 ----------
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || !msg.type) return;
    if (msg.type === 'init') {
      state.data = msg.payload;
      state.lastError = undefined;
      if (!state.rangeKey) state.rangeKey = currentViewCfg().defaultRange;
      resetViewRange();
      renderAll();
      updateKeyStatus();
    } else if (msg.type === 'snapshot') {
      if (!state.data) return;
      const s = msg.payload;
      state.data.snapshots.push(s);
      state.data.current = s;
      upsertDailyLocal(s);
      onNewData();
    } else if (msg.type === 'config') {
      if (state.data) state.data.pollMinutes = msg.payload.pollMinutes;
      renderFooter();
    } else if (msg.type === 'theme') {
      render();
    } else if (msg.type === 'error') {
      state.lastError = msg.payload && msg.payload.message;
      renderFooter();
    }
  });

  // ---------- 自适应 ----------
  const ro = new ResizeObserver(() => {
    if (state.data) render();
  });
  ro.observe(chartWrap);

  // 首帧
  renderAll();

  // 通知扩展端 Webview 已就绪，触发一次数据下发（防止 init 消息在监听器挂载前丢失）
  vscode.postMessage({ type: 'ready' });
})();
