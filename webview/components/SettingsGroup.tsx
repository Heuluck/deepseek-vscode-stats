/**
 * 设置面板分组壳：标题 + 图标 + 折叠头 + Collapse 内容。
 * 消除原 Settings.tsx 中 6 处重复的 group-head 模板。
 */
import type { JSX } from 'solid-js';
import { Collapse } from './Collapse';

interface SettingsGroupProps {
  title: string;
  /** codicon 图标名（不含 codicon- 前缀），如 'account'。 */
  icon: string;
  open: boolean;
  onToggle: () => void;
  children: JSX.Element;
}

export function SettingsGroup(props: SettingsGroupProps) {
  return (
    <div class="settings-group">
      <button
        class={'settings-group-head' + (props.open ? ' open' : '')}
        type="button"
        onClick={props.onToggle}
      >
        <span class="settings-group-title">
          <i class={`codicon codicon-${props.icon}`}></i>{props.title}
        </span>
        <i class="codicon codicon-chevron-down"></i>
      </button>
      <Collapse open={props.open}>{props.children}</Collapse>
    </div>
  );
}
