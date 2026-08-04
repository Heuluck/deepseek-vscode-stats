# Webview 迁移到 SolidJS —— 执行方案

> **实施状态：已完成（2026-08-04）。** 各阶段验证结果见文末「实施记录」。

> 目标：根治「手动 DOM + 分散渲染」架构导致的反复 bug（config 回传不重渲染头部、hidden 被 flex 覆盖、刷新重置视图等）。
> 核心思路：**Solid 管 UI 层，命令式 SVG 引擎整块保留**。Solid 的响应式保证"状态一变，该更新的 UI 自动更新"，引擎只负责把数据 + 视口画出来。

---

## 1. 目标架构

```
src/                    # 扩展侧（几乎不动）
  panel.ts              # 只改一行：JS_URI → media/chart.bundle.js

webview/                # 新增：webview 源码（TS + JSX）
  index.tsx             # 入口：acquireVsCodeApi、消息 dispatch、渲染 <App/>
  store.ts              # createStore 单一状态源 + actions
  logic/
    viewport.ts         # computeDataBounds / resetViewRange / onNewData / upsertDailyLocal
    todaySpend.ts       # computeTodaySpend（估算降级逻辑）
    format.ts           # fmtMoney / fmtClock / fmtDay / fmtMonth / sym / pad / startOfDay
  engine/
    chartEngine.ts      # 命令式 SVG 引擎：render() 全量重绘 + 内部手势状态
  components/
    App.tsx             # 组装 header/main/footer + 设置 overlay
    Header.tsx          # 当前余额 / 今日花费 / meta
    Tabs.tsx            # 分时 / 分天 / 分月
    Ranges.tsx          # 各视图的 range 预设按钮
    Footer.tsx          # 快照数 / 轮询间隔 / 上次同步 / 错误
    Empty.tsx           # 空态（加载中 / 无 key / 无数据）
    Settings.tsx        # 设置面板（staged 流程 + <For> 阈值行）
    Tooltip.tsx         # 悬浮提示
  messaging.ts          # postMessage / 消息类型定义

media/
  chart.bundle.js       # esbuild 构建产物（webview 实际加载的文件）
  chart.css             # 不变，类名继续复用
  webview.html          # {{JS_URI}} 指向 chart.bundle.js
  codicons/             # 不变

build.mjs               # esbuild 构建脚本
webview/tsconfig.json   # webview 独立 TS 配置（JSX → solid）
```

## 2. 状态设计（核心决策）

所有跨组件状态收进一个 Solid store，这是根治"漏调用 renderXxx"的关键：

```ts
interface AppState {
  data: InitPayload | null       // { snapshots, daily, current, hasKey }
  config: PanelConfig | null
  view: 'hourly' | 'daily' | 'monthly'
  rangeKey: string | null
  followLive: boolean            // 是否缩放过（false = 已缩放，不滑动）
  viewRange: { start: number; end: number } | null
  lastError?: string
}
```

**高频手势内部状态不进 store**（留在引擎模块级变量）：`last`（缩放上下文）、`mouseX`、`pinT`、`pinUntil`、`zoomAnchorT`。它们只服务引擎本身，进 store 只会拖慢渲染。

**自动重绘的挂钩**（替代手动 `renderAll()`）：

```ts
createEffect(on(
  () => [store.data, store.view, store.rangeKey, store.viewRange, themeTick],
  () => engine.render()
));
```

图表相关状态变化 → 引擎自动重绘；UI 组件各自响应自己的状态。引擎的视口变化（缩放/平移）通过 `onViewChange` 回调回写 store，形成闭环。

## 3. 图表引擎接口（命令式，保留现有实现）

```ts
interface EngineDeps {
  svg: SVGSVGElement
  container: HTMLElement          // chartWrap
  getState: () => EngineState     // 从 store 派生：data/view/viewRange/config
  onHover?: (info: TooltipInfo | null) => void
  onViewChange?: (vr: { start: number; end: number }, followLive: boolean) => void
}

function createChartEngine(deps: EngineDeps): {
  render(): void     // 全量重绘（数据/视口/主题变化时调用）
  dispose(): void    // 解绑 wheel/pointer/mouse/ResizeObserver
}
```

- 从现有 `chart.js` **原样搬入**：`render()`、`decimate`、`medianDt`、`effectiveGapMs`、`buildSegments`、`niceTicks`、`niceTimeStep`、SVG helpers、缩放/平移/悬停/双击状态机。
- 只改输入方式：`state.xxx` → `getState().xxx`；DOM 事件挂在 `container` 上，由引擎在 `createChartEngine` 内部绑定。
- 悬停信息（tooltip 文本）通过 `onHover` 回调写成轻量 signal，避免高频事件穿透 Solid 组件树。

## 4. 构建链

新增依赖：`solid-js`；devDeps：`esbuild`、`esbuild-plugin-solid`。

`build.mjs`（esbuild，IIFE + nonce 友好）：

```js
import { build } from 'esbuild';
import solid from 'esbuild-plugin-solid';

const watch = process.argv.includes('--watch');
build({
  entryPoints: ['webview/index.tsx'],
  bundle: true,
  outfile: 'media/chart.bundle.js',
  format: 'iife',                // <script src> 直接加载，CSP nonce 不变
  plugins: [solid()],
  jsx: 'preserve',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: !watch,
  sourcemap: true,
  target: 'chrome120',           // 对齐 VS Code 1.85 内置 Chromium
}).catch(() => process.exit(1));
```

`webview/tsconfig.json`：`jsx: preserve` + `jsxImportSource: solid-js` + `moduleResolution: bundler`。
**根 `tsconfig.json` 必须 `exclude: ["webview"]`**，避免 tsc 与 esbuild 双轨冲突。

package.json scripts：

```json
"build:webview": "node build.mjs",
"watch:webview": "node build.mjs --watch",
"compile": "tsc -p ./ && node build.mjs",
"vscode:prepublish": "npm run compile"
```

## 5. 分阶段执行（每步可验证、可回滚）

### 阶段 0：搭构建链（约半天）
1. 装依赖，建 `webview/tsconfig.json`、`build.mjs`，根 tsconfig exclude webview。
2. `webview/index.tsx` 写最小可运行 Solid 组件（渲染一个占位 div）。
3. `panel.ts` 的 JS_URI 改指 `chart.bundle.js`；`webview.html` 的 script 指向 bundle。
4. **验证**：F5 打开面板看到占位内容；`pnpm run compile` 通过；CSP nonce 正常。
   - 风险点：IIFE vs ESM、nonce、codicon 路径。

### 阶段 1：抽纯函数层（约半天，纯搬运）
- `format.ts` / `viewport.ts` / `todaySpend.ts`：把 `fmtMoney`、`computeDataBounds`、`resetViewRange`、`onNewData`、`upsertDailyLocal`、`computeTodaySpend` 等原样搬出（`state.xxx` 改为参数/store 访问）。
- **验证**：编译通过，逻辑与旧代码逐行对拍（尤其 `chart-bugs.md` 里的 followLive 滑动窗口行为）。

### 阶段 2：抽图表引擎（约 1 天，纯搬运 + 接口化）
- `engine/chartEngine.ts`：SVG 渲染 + 手势状态机全部搬入，暴露 `createChartEngine`。
- 在最小 Solid 壳里喂假数据跑通，与旧版渲染截图对拍（缩放锚点、断线、降采样、货币格式）。
- **验证**：假数据下新引擎渲染结果与旧版一致。

### 阶段 3：Solid 化 UI（约 1–2 天，重写）
- `store.ts` + 全部组件 + 消息 dispatch 接入。
- 设置面板用 `<For>` 渲染阈值行，staged 用组件本地 signal，**仅保存时 commit 到 store + postMessage**。
- 用 `<Show>` 条件渲染替代 `hidden` class（根治 flex 覆盖 hidden 的 bug）。
- **验证**：跑完整回归清单（见下）。

### 阶段 4：清理与收尾（约半天）
- 删除旧 `media/chart.js`，清理死代码，核对 CSS 类名。
- `vsce package` 确认 bundle 在包内；验证发布产物下的 CSP。

## 6. 回归清单（阶段 3/4 必须全过）

1. 首屏：加载中 → 数据渲染；三种空态（无 key / 无数据 / 范围内无数据）。
2. 头部：余额、充值/赠送、今日花费（同意流程；**config 回传后头部自动更新**）。
3. 视图切换：分时/分天/分月 + 各自 range 预设。
4. 图表：滚轮缩放（锚点锁定）、拖拽平移、悬停 tooltip、双击重置、重置按钮。
5. 刷新：followLive 右缘扩展、**不重置视图**（`chart-bugs.md` 的坑）。
6. 断线、降采样、货币符号（CNY/USD）。
7. 设置面板：打开/关闭、staged 暂存、保存/取消、阈值增删、默认颜色、今日花费同意。
8. 主题切换（`theme` 消息 → 重绘）。
9. 错误提示（footerErr）。
10. 字体加载后 reflow 的坐标稳定性（`debugging.md` 经验：必要时加 rAF 轮询校正）。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 图表引擎行为回归 | 引擎只搬不改，阶段 2 用假数据对拍；`chart-bugs.md` 的 followLive 行为单独测 |
| CSP / nonce 加载失败 | 保持 IIFE + 现有 nonce 机制，阶段 0 就验证 |
| staged 暂存流程出错 | staged 只在 Settings 组件内部，commit 时才动 store + postMessage |
| 高频手势拖慢 UI | 引擎直接改 SVG DOM，不经 Solid 树；hover 只写轻量 signal |
| 双编译轨冲突 | 根 tsconfig exclude webview，webview 完全由 esbuild 编译 |

## 8. 工作量预估

| 阶段 | 时间 | 性质 |
|---|---|---|
| 0 构建链 | 0.5 天 | 新增 |
| 1 纯函数层 | 0.5 天 | 搬运 |
| 2 图表引擎 | 1 天 | 搬运 + 接口化 |
| 3 Solid UI | 1–2 天 | 重写 |
| 4 清理收尾 | 0.5 天 | 清理 |

总计约 3.5–4.5 天。阶段 0–2 无行为变化风险；真正的重写风险集中在阶段 3（UI 层），但恰好是 bug 重灾区，重写收益最大。

---

## 实施记录（2026-08-04）

- **阶段 0**：esbuild + solid 构建链完成，`media/chart.bundle.js`（IIFE，nonce/CSP 不变），`compile` 串接构建。
- **阶段 1**：纯函数层迁移完成（`webview/logic/format|viewport|todaySpend`），类型检查通过。
- **阶段 2**：图表引擎 `webview/engine/chartEngine.ts` 完成。浏览器假数据对拍：初始渲染与滚轮缩放后的 `path.line`/`path.area` `d` 属性、坐标刻度、tooltip 内容与旧 `chart.js` **逐字节一致**。
- **阶段 3**：Solid UI 完成（`store.ts` + 8 个组件）。浏览器模拟 webview 验证：
  - `init`/`snapshot`/`config` 消息驱动正确；config 回传后 Header 自动更新（修复原 bug 1）
  - snapshot 后 followLive=false 不重置视图（修复原 bug 3）；视图切换/range 切换正常
  - 设置面板 staged 流程、阈值增删、今日花费同意、`saveSettings` 消息内容正确
  - `<Show>` 条件渲染替代 hidden（修复原 bug 2）；三种空态正确
- **阶段 4**：删除旧 `media/chart.js`；sourcemap 进 `.gitignore`（`.vscodeignore` 已排除 `**/*.map`，bundle 随发布打包）；README 补开发说明。
- **待真实环境验证**（浏览器模拟无法覆盖）：VS Code F5 下的 CSP nonce、主题变量、codicon 字体、acquireVsCodeApi 真身。
- **决策**：字体 reflow 的 rAF 轮询校正**未加**——本 webview 的交互全部事件驱动 + 实时 `getBoundingClientRect`，且 codicon 字体引起的布局变化可被 ResizeObserver 捕捉，无长驻缓存坐标，风险可控（回归清单第 10 项人工检查兜底）。
