# DeepSeek Stats

> Your DeepSeek balance — right in the VS Code status bar and chart panel.

[English](README.md) | **简体中文**

## 为什么用这个扩展？

不用再打开官网查余额。DeepSeek Stats 让你一眼看到：

- 状态栏常驻余额，按阈值自动变色
- 交互式趋势图（分时 / 分天 / 分月），悬停看明细、滚轮缩放、拖拽平移
- 消耗柱状图带充值校正——看清今天到底花了多少

## 功能

- **状态栏余额** — 常驻显示，阈值变色（默认 < ¥10 红色、< ¥50 黄色）
- **自动轮询** — VS Code 打开期间默认每 **1 分钟** 查询一次（可配置）
- **三种时间视图** — 分时（分钟级原始数据）/ 分天（按天聚合）/ 分月（按月聚合）
- **交互图表** — 悬停显示充值/赠送明细、滚轮缩放、拖拽平移、一键重置
- **消耗模式** — 余额/消耗一键切换，小时/周/月桶粒度，充值免疫
- **今日花费** — 已按充值校正；支持本地日界或 UTC 日界
- **多币种** — CNY/USD 双轴叠加，各按自己的刻度绘制，互不干扰
- **诚实断档** — VS Code 没开的时段**断线不连线**，绝不伪造中间数据（默认虚线连接）
- **国际化** — 跟随 VS Code 显示语言，或强制英文 / 简体中文
- **安全默认** — API Key 存 VS Code `SecretStorage`，快照存全局状态，**都不落在项目目录**

## 安装与使用

### 环境要求

- VS Code 1.85+
- [platform.deepseek.com](https://platform.deepseek.com) 申请的 DeepSeek API Key

### 安装

- 从 VS Code Marketplace 安装（`heuluck.deepseek-stats`）
- 或 `vsce package` 打包后从 VSIX 安装 / F5 启动开发宿主

### 使用

1. 设置 API Key：点击状态栏的「DeepSeek: 未配置」，或打开图表面板后点击右下角 **⚙ 设置** 配置
2. 状态栏出现余额
3. **点击余额**打开趋势图面板

> 不想配 Key？设置环境变量 `DEEPSEEK_API_KEY` 作为后备即可。

## 图表与视图

| | 说明 |
|---|---|
| **分时 / 分天 / 分月** | 分钟级原始数据 / 按天聚合 / 按月聚合 |
| **余额 / 消耗** | 余额曲线，或消耗柱状图（小时/周/月） |
| **双币种** | 主币种左轴、次币种右轴，叠加显示 |
| **交互** | 悬停明细、滚轮缩放、拖拽平移、一键重置 |

主币种优先选「当前有钱」的账户（人民币优先）；**从未有钱的账户不展示**，但「花光」的账户会保留曲线展示花光过程。「今日花费」只统计主币种。

## 设置项

| 设置 | 默认 | 说明 |
|---|---|---|
| `deepseek-stats.language` | `auto` | 界面语言：`auto` 跟随 VS Code / `en` 英文 / `zh-cn` 简体中文 |
| `deepseek-stats.pollIntervalMinutes` | `1` | 轮询间隔（分钟） |
| `deepseek-stats.statusBar.show` | `true` | 是否在状态栏显示余额 |
| `deepseek-stats.statusBar.defaultColor` | `""` | 状态栏默认颜色（留空跟随主题） |
| `deepseek-stats.statusBar.thresholds` | 见下 | 余额阈值 → 颜色映射 |
| `deepseek-stats.history.rawRetentionDays` | `7` | 分钟级快照保留天数 |
| `deepseek-stats.chart.connectorStyle` | `dashed` | 断点连接线：`dashed` / `dotted` / `solid` / `ignore` / `none` |
| `deepseek-stats.chart.connectorColor` | `""` | 断点连接线颜色（留空跟随主线条） |
| `deepseek-stats.chart.lineStyle` | `straight` | 主线条：`straight` 直线 / `smooth` 平滑曲线 |
| `deepseek-stats.dayBoundary` | `local` | 今日花费日界：`local` 本地 / `utc`（与官方用量口径一致） |

默认阈值：余额 < 10 红色 `#e51400`，< 50 黄色 `#ffb900`。

## 数据与隐私

- 唯一网络请求是官方接口 `GET https://api.deepseek.com/user/balance`
- 官方**没有历史用量 API**，趋势由本扩展自己记录——**只有 VS Code 打开期间才有数据点**
- 未打开的时间段在图上以连接线示意（可配），**绝不插值伪造**
- API Key 存 `SecretStorage`（系统钥匙串）；快照存 VS Code 全局状态，默认保留 7 天

## 开发

- 扩展侧 `tsc` 编译；webview 用 SolidJS + esbuild，产物 `media/chart.bundle.js`
- `npm run compile` 一并构建；改 webview 用 `npm run watch:webview`
- webview 源码在 `webview/`（TS + JSX），构建配置见 `build.mjs`

## License

MIT
