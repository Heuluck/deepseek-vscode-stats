/**
 * 可复用折叠容器：展开/收起带平滑高度动画。
 * 实现：CSS grid-template-rows 0fr → 1fr 过渡，无需 JS 测量内容高度，
 * 内容增减也不会破坏动画（动画只跟随 open 状态）。
 */
import type { JSX } from 'solid-js';

interface CollapseProps {
  open: boolean;
  children: JSX.Element;
}

export function Collapse(props: CollapseProps) {
  return (
    <div class={'collapse' + (props.open ? ' open' : '')}>
      <div class="collapse-inner">{props.children}</div>
    </div>
  );
}
