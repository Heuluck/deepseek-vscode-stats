/**
 * 扩展侧 i18n：语言由设置 `deepseek-stats.language` 驱动（'auto' 跟随 VS Code 显示语言）。
 * - 翻译数据源：仓库根目录 locales/*.json（与 webview 共用同一份文件，单一事实来源）。
 * - 为什么不用 vscode.l10n：vscode.l10n 固定跟随 VS Code 显示语言，无法按设置切换；
 *   本模块在设置驱动的前提下提供同等的 key 翻译能力。
 * - package.json 的静态文案（命令/设置描述等）走官方 package.nls.json 机制，不在此处。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type LanguageSetting = 'auto' | 'en' | 'zh-cn';
export type Locale = 'en' | 'zh-cn';

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const cache = new Map<Locale, Record<string, string>>();

/** 读取语言设置项（'auto' 默认）。 */
export function getLanguageSetting(): LanguageSetting {
  const v = vscode.workspace
    .getConfiguration('deepseek-stats')
    .get<string>('language', 'auto');
  return v === 'en' || v === 'zh-cn' ? v : 'auto';
}

/** 跟随 VS Code 显示语言的 locale（忽略语言设置项；供 webview「自动」档兜底）。 */
export function getVscodeLocale(): Locale {
  const lang = (vscode.env.language || 'en').toLowerCase();
  return lang.startsWith('zh') ? 'zh-cn' : 'en';
}

/** 解析最终生效的 locale：'auto' 时按 VS Code 显示语言归一化。 */
export function resolveLocale(): Locale {
  const setting = getLanguageSetting();
  return setting === 'auto' ? getVscodeLocale() : setting;
}

function loadMessages(locale: Locale): Record<string, string> {
  const cached = cache.get(locale);
  if (cached) return cached;
  let messages: Record<string, string> = {};
  try {
    const file = path.join(LOCALES_DIR, `${locale}.json`);
    messages = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  } catch (e) {
    console.error('[deepseek-stats] 加载语言包失败', locale, e);
  }
  cache.set(locale, messages);
  return messages;
}

/** 当前生效的 locale 码。 */
export function getLocale(): Locale {
  return resolveLocale();
}

/**
 * 按 key 取翻译；支持 {name} 占位符插值。缺 key 回退英文，再缺回退 key 本身。
 * 每次调用实时解析设置，语言切换后无需重启即可生效（状态栏/通知在下次刷新时更新）。
 */
export function t(
  key: string,
  params?: Record<string, string | number>
): string {
  const locale = resolveLocale();
  let msg = loadMessages(locale)[key] ?? (locale === 'en' ? key : loadMessages('en')[key] ?? key);
  if (params) {
    msg = msg.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in params ? String(params[name]) : m
    );
  }
  return msg;
}
