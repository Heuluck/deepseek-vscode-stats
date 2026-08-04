# DeepSeek Stats

在 VS Code 中直接查看 DeepSeek 账户余额，不再需要打开官网。支持**分时 / 分天 / 分月**三种粒度的余额趋势图，可悬停查看明细、滚轮缩放、拖拽平移，界面完全跟随 VS Code 主题。

## 功能

- 状态栏常驻显示当前余额，可按阈值变色（可配置默认颜色）
- 自动轮询：VS Code 打开期间默认每 **1 分钟**查询一次余额（可配置）
- 三个视图：分时（分钟级原始数据）/ 分天（按天聚合）/ 分月（按月聚合）
- 交互图表：悬停显示充值/赠送明细、滚轮缩放、拖拽平移、一键重置
- 数据断档处理：VS Code 未打开的时间段**断线不连线**，绝不伪造中间数据
- 存储：API Key 走 VS Code 加密存储（`SecretStorage`），历史快照存 VS Code 全局状态，**都不落在项目目录**

## 安装与使用

1. 克隆本仓库后在 VS Code 中打开，按 `F5` 启动扩展开发宿主；或 `npm install && npm run compile` 后用 `vsce package` 打包安装。
2. 首次使用需设置 API Key：点击状态栏的「DeepSeek: 未配置」，或在图表面板右上角点击 **API Key** 按钮。API Key 在 [platform.deepseek.com](https://platform.deepseek.com) 申请，与官网登录同一账户体系。
3. 状态栏出现余额后，**点击余额**即可打开趋势图面板。

> 也可以不配置 API Key，改为设置环境变量 `DEEPSEEK_API_KEY`（扩展会作为后备读取）。

## 设置项

| 设置 | 默认 | 说明 |
|---|---|---|
| `deepseekStats.pollIntervalMinutes` | `1` | 轮询间隔（分钟） |
| `deepseekStats.statusBar.show` | `true` | 是否在状态栏显示余额 |
| `deepseekStats.statusBar.defaultColor` | `""` | 状态栏默认颜色（留空跟随主题） |
| `deepseekStats.statusBar.thresholds` | 见下 | 余额阈值 → 颜色映射 |
| `deepseekStats.history.rawRetentionDays` | `7` | 分钟级快照保留天数（分时视图数据来源） |

默认阈值：余额 < 10 显示红色 `#e51400`，< 50 显示黄色 `#ffb900`。

## 数据说明

- 余额数据来自官方接口 `GET https://api.deepseek.com/user/balance`。
- 该接口只有**当前余额快照**，没有历史用量 API。因此趋势完全由扩展自己记录：**只有 VS Code 打开期间才有数据点**。
- 未打开 VS Code 的时间段在图上表现为断线（不连线），重新打开后的第一个点即为当时余额快照，时间戳记在打开时刻。

## 操作入口（全部在 UI 上，无命令面板条目）

| 入口 | 操作 |
|---|---|
| 状态栏余额 | 点击打开趋势图面板 |
| 状态栏「未配置」 | 点击设置 API Key |
| 图表面板右上角 **API Key** | 设置 / 更换 API Key |
| 图表面板右上角 **重置** | 重置视图缩放范围 |
| 图表面板标签（分时 / 分天 / 分月） | 切换聚合粒度 |
| 图表面板范围按钮 | 切换时间范围 |
| 图表面板内滚轮 / 拖拽 | 缩放 / 平移时间轴 |

> 图表面板右上角的 **API Key** 按钮可设置 / 更换 / 清除 API Key；**清除历史** 按钮可清空全部余额快照。
