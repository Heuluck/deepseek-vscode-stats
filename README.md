# DeepSeek Stats

在 VS Code 中直接查看 DeepSeek 账户余额，不再需要打开官网。支持**分时 / 分天 / 分月**三种粒度的余额趋势图，可悬停查看明细、滚轮缩放、拖拽平移，界面完全跟随 VS Code 主题。

## 功能

- 状态栏常驻显示当前余额，可按阈值变色
- 自动轮询：VS Code 打开期间默认每 **1 分钟**查询一次余额（可配置）
- 三个视图：分时（分钟级原始数据）/ 分天（按天聚合）/ 分月（按月聚合）
- 交互图表：悬停显示充值/赠送明细、滚轮缩放、拖拽平移、一键重置
- 数据断档处理：VS Code 未打开的时间段**断线不连线**，绝不伪造中间数据
- 国际化：界面语言可在设置中切换（跟随 VS Code 或强制中/英文），扩展命令/设置描述、状态栏、图表面板全量翻译
- 存储：API Key 走 VS Code 加密存储（`SecretStorage`），历史快照存 VS Code 全局状态，**都不落在项目目录**

## 安装与使用

1. 克隆本仓库后在 VS Code 中打开，按 `F5` 启动扩展开发宿主；或 `npm install && npm run compile` 后用 `vsce package` 打包安装。
2. 首次使用需设置 API Key：点击状态栏的「DeepSeek: 未配置」，或在图表面板右上角点击 **API Key** 按钮。API Key 在 [platform.deepseek.com](https://platform.deepseek.com) 申请，与官网登录同一账户体系。
3. 状态栏出现余额后，**点击余额**即可打开趋势图面板。

> 也可以不配置 API Key，改为设置环境变量 `DEEPSEEK_API_KEY`（扩展会作为后备读取）。

## 开发

- 扩展侧用 `tsc` 编译；webview 用 SolidJS + esbuild，产物为 `media/chart.bundle.js`。
- `npm run compile` 会一并构建两者；改 webview 源码时可用 `npm run watch:webview` 增量重建。
- webview 源码在 `webview/`（TS + JSX），构建配置见 `build.mjs`。

## 设置项

| 设置 | 默认 | 说明 |
|---|---|---|
| `deepseek-stats.language` | `auto` | 界面语言：`auto` 跟随 VS Code 显示语言 / `en` 英文 / `zh-cn` 简体中文（设置名「语言 / Languages」） |
| `deepseek-stats.pollIntervalMinutes` | `1` | 轮询间隔（分钟） |
| `deepseek-stats.statusBar.show` | `true` | 是否在状态栏显示余额 |
| `deepseek-stats.statusBar.defaultColor` | `""` | 状态栏默认颜色（留空跟随主题） |
| `deepseek-stats.statusBar.thresholds` | 见下 | 余额阈值 → 颜色映射 |
| `deepseek-stats.history.rawRetentionDays` | `7` | 分钟级快照保留天数（分时视图数据来源） |
| `deepseek-stats.chart.connectorStyle` | `dashed` | 图表断点连接线样式：`dashed` 虚线 / `dotted` 点虚线 / `solid` 实线 / `ignore` 假装连续（当作正常数据段，含面积填充） / `none` 不连接 |
| `deepseek-stats.chart.connectorColor` | `""` | 断点连接线颜色（留空跟随主线条） |
| `deepseek-stats.chart.lineStyle` | `straight` | 图表主线条绘制方式：`straight` 直线 / `smooth` 平滑曲线 |

默认阈值：余额 < 10 显示红色 `#e51400`，< 50 显示黄色 `#ffb900`。

## 数据说明

- 余额数据来自官方接口 `GET https://api.deepseek.com/user/balance`。
- 接口会返回多个币种账户（人民币 / 美元）。余额曲线图会把多个币种**叠加在同一张图**：主币种用左轴，次币种用右轴，各按自己的 Y 轴刻度绘制；状态栏与面板头部余额并列展示。主币种在「当前有钱」的币种里优先选人民币；**从未有过余额的账户不展示**（全 0 无信息量），但「之前有钱、现已花光」的账户会保留（曲线展示花光过程）。消耗柱状图按币种**分组柱**（同桶 CNY/USD 两根并排，各用左右轴，不相加）；「今日花费」只统计主币种。
- 该接口只有**当前余额快照**，没有历史用量 API。因此趋势完全由扩展自己记录：**只有 VS Code 打开期间才有数据点**。
- 未打开 VS Code 的时间段在图上表现为**断档**：默认用虚线把缺口两端连起来（可在设置中改为点虚线、实线、假装连续或不连接）；放大到断档区间时仍可继续缩放/平移，图上以虚线连接线示意"此处无采样"。重新打开后的第一个点即为当时余额快照，时间戳记在打开时刻。

## 操作入口

| 入口 | 操作 |
|---|---|
| 状态栏余额 | 点击打开趋势图面板 |
| 状态栏「未配置」 | 点击设置 API Key |
| 图表面板右上角 **↗** | 在浏览器打开 DeepSeek 用量页（platform.deepseek.com/usage） |
| 图表面板 **重置** | 重置视图缩放范围 |
| 图表面板标签（分时 / 分天 / 分月） | 切换聚合粒度 |
| 图表面板范围按钮 | 切换时间范围 |
| 图表面板右下角 **⚙ 设置** | 打开设置页 |
| 图表面板内滚轮 / 拖拽 | 缩放 / 平移时间轴 |

> 设置页（半透明遮罩，点击背景关闭）提供：状态栏开关 / 默认颜色 / 余额阈值→颜色配置、图表断点连接线样式与颜色、设置 / 更换 / 清除 API Key、清除全部历史快照、恢复默认设置（危险操作均为红色按钮）。
