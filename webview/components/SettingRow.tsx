/**
 * 设置行：左侧主文字 + 可选解释文案（灰色小字，紧跟主文字），右侧控件。
 * 提供 for 时主文字渲染为 <label>，点击可聚焦/切换对应控件。
 * children 可为单个或多个控件，自动排成一行。
 */
import type { JSX } from 'solid-js';

interface SettingRowProps {
  label: string;
  /** 对应控件 id；提供时主文字渲染为 label */
  for?: string;
  /** 可选解释文案，紧随主文字 */
  hint?: string;
  /** 右侧控件 */
  children: JSX.Element;
}

export function SettingRow(props: SettingRowProps) {
  return (
    <div class="settings-row">
      <div class="settings-label-wrap">
        {props.for ? (
          <label class="settings-label-text" for={props.for}>
            {props.label}
          </label>
        ) : (
          <span class="settings-label-text">{props.label}</span>
        )}
        {props.hint ? <span class="settings-hint-inline">{props.hint}</span> : null}
      </div>
      <div class="settings-controls">{props.children}</div>
    </div>
  );
}
