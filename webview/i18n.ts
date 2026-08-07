/**
 * webview 侧 i18n：与扩展侧共用 locales/*.json（经 esbuild 打包进 bundle）。
 * - locale 存在 Solid signal 中：组件渲染时调用 t() 会订阅 locale，切换语言自动重渲染。
 * - 初始 locale 由扩展注入 HTML（meta[name="deepseek-stats:locale"]），保证首帧即正确语言；
 *   运行中语言设置变化由扩展发 {type:'i18n'} 消息热更新。
 */
import { createSignal } from 'solid-js';
import en from '../locales/en.json';
import zhCn from '../locales/zh-cn.json';

export type Locale = 'en' | 'zh-cn';
export type MessageKey = keyof typeof en;

const DICTS: Record<Locale, Record<MessageKey, string>> = {
  en: en as Record<MessageKey, string>,
  'zh-cn': zhCn as Record<MessageKey, string>,
};

const [locale, setLocaleSignal] = createSignal<Locale>('en');

/** 归一化任意语言标识（含 VS Code 的语言包名，如 zh-CN / zh-tw）。 */
function normalizeLocale(l: string | undefined | null): Locale {
  const lang = (l || '').toLowerCase();
  return lang.startsWith('zh') ? 'zh-cn' : 'en';
}

/** 设置当前语言（首帧由 HTML 注入数据初始化，运行中由 i18n 消息更新）。 */
export function setLocale(l: string | undefined | null): void {
  setLocaleSignal(normalizeLocale(l));
}

export function getLocale(): Locale {
  return locale();
}

/**
 * 按 key 取翻译；支持 {name} 占位符插值。
 * 缺 key 回退英文，再缺回退 key 本身（与扩展侧 i18n 行为一致）。
 */
export function t(
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const cur = locale();
  let msg: string =
    DICTS[cur][key] ?? DICTS.en[key] ?? (key as string);
  if (params) {
    msg = msg.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in params ? String(params[name]) : m
    );
  }
  return msg;
}
