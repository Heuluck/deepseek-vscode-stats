# DeepSeek Stats

> Your DeepSeek balance — right in the VS Code status bar and chart panel.

**English** | [简体中文](README.zh-CN.md)

## Why this extension?

Stop opening platform.deepseek.com to check your balance. DeepSeek Stats keeps it one glance away:

- Balance always in the status bar, color-coded by thresholds
- Interactive trend charts (hourly / daily / monthly) with hover details, zoom & pan
- A recharge-corrected spend bar chart — see what you actually burned today

## Features

- **Status bar balance** — always visible, threshold colors (default: < ¥10 red, < ¥50 yellow)
- **Auto polling** — checks every 1 minute while VS Code is open (configurable)
- **Three time views** — hourly (raw minute data) / daily (aggregated) / monthly (aggregated)
- **Interactive charts** — hover for top-up/grant details, mouse-wheel zoom, drag to pan, one-click reset
- **Spend mode** — switch between balance line and consumption bar chart; hour / week / month buckets; recharge-immune
- **Today's spend** — corrected for recharges; honors your local day boundary or UTC (matches the official usage report). Off by default — enable it in Settings
- **Multi-currency** — CNY & USD overlaid on dual axes, each scaled to its own Y-axis
- **Honest gaps** — VS Code closed? The chart breaks instead of fabricating data (dashed connector by default)
- **i18n** — follows VS Code display language, or force English / 简体中文
- **Secure by default** — API key in VS Code `SecretStorage`, snapshots in global state, never in your project folder

## Getting Started

### Prerequisites

- VS Code 1.85+
- A DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com)

### Installation

- From the VS Code Marketplace: `heuluck.deepseek-stats`
- Or build it yourself: `vsce package`, then install from the VSIX / press `F5` in the dev host

### Usage

1. Set your API key: click **"DeepSeek: Not configured"** in the status bar, or open the panel and configure it in **⚙ Settings** (bottom-right)
2. The status bar shows your balance
3. **Click the balance** to open the trend panel

> No API key? Set the `DEEPSEEK_API_KEY` environment variable as a fallback.

## Charts & Views

| | Description |
|---|---|
| **Hourly / Daily / Monthly** | raw minute data / aggregated by day / aggregated by month |
| **Balance / Spend** | balance line chart, or consumption bar chart (hour / week / month) |
| **Dual currency** | main currency on the left axis, secondary on the right, overlaid |
| **Interaction** | hover details, wheel zoom, drag pan, one-click reset |

The main currency prefers an account that currently has a balance (CNY first); accounts that never had a balance are hidden, but accounts that ran dry keep their curve to show how it happened. "Today's spend" counts the main currency only.

## Settings

| Setting | Default | Description |
|---|---|---|
| `deepseek-stats.language` | `auto` | UI language: `auto` (follows VS Code) / `en` / `zh-cn` |
| `deepseek-stats.pollIntervalMinutes` | `1` | Poll interval (minutes) |
| `deepseek-stats.statusBar.show` | `true` | Show balance in the status bar |
| `deepseek-stats.statusBar.defaultColor` | `""` | Status bar default color (empty = follow theme) |
| `deepseek-stats.statusBar.thresholds` | see below | Balance thresholds → color mapping |
| `deepseek-stats.history.rawRetentionDays` | `7` | Days to keep minute-level snapshots |
| `deepseek-stats.chart.connectorStyle` | `dashed` | Gap connector: `dashed` / `dotted` / `solid` / `ignore` / `none` |
| `deepseek-stats.chart.connectorColor` | `""` | Connector color (empty = follow main line) |
| `deepseek-stats.chart.lineStyle` | `straight` | Main line: `straight` / `smooth` |
| `deepseek-stats.showTodaySpend` | `false` | Show today's spend at the top of the panel (estimate; may be inaccurate with top-ups or gaps) |
| `deepseek-stats.dayBoundary` | `local` | Day boundary for today's spend: `local` / `utc` |

Default thresholds: balance < 10 → red `#e51400`, < 50 → yellow `#ffb900`.

## Data & Privacy

- The only network call is the official endpoint `GET https://api.deepseek.com/user/balance`
- DeepSeek has **no historical-usage API** — trends are recorded by this extension itself, so data points exist only while VS Code is open
- Closed periods render as connectors (configurable) — **never interpolated or fabricated**
- API key lives in `SecretStorage` (OS keychain); snapshots live in VS Code global state, kept for 7 days by default

## Development

- Extension side compiles with `tsc`; webview uses SolidJS + esbuild → `media/chart.bundle.js`
- `npm run compile` builds both; use `npm run watch:webview` while editing the webview
- Webview source lives in `webview/` (TS + JSX); build config is `build.mjs`

## License

MIT
