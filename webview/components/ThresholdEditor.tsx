/**
 * 余额阈值编辑器：增删改阈值行（低于 → 颜色）。
 * 空输入/非法数值不写入（避免 NaN 污染配置）；纯受控，由父组件持有数据。
 */
import { For } from 'solid-js';
import type { Threshold } from '../types';
import { t } from '../i18n';

interface ThresholdEditorProps {
  thresholds: Threshold[];
  /** 提交更新后的完整阈值数组（父组件负责写入 staged）。 */
  onChange: (next: Threshold[]) => void;
}

export function ThresholdEditor(props: ThresholdEditorProps) {
  function add(): void {
    props.onChange([...props.thresholds, { below: 100, color: '#ffb900' }]);
  }

  function setBelow(i: number, v: number): void {
    props.onChange(props.thresholds.map((t, idx) => (idx === i ? { ...t, below: v } : t)));
  }

  function setColor(i: number, c: string): void {
    props.onChange(props.thresholds.map((t, idx) => (idx === i ? { ...t, color: c } : t)));
  }

  function remove(i: number): void {
    props.onChange(props.thresholds.filter((_, idx) => idx !== i));
  }

  return (
    <>
      <div class="threshold-head">
        <span>{t('threshold.title')}</span>
        <button class="btn small" onClick={add}>
          <i class="codicon codicon-add"></i>{t('threshold.add')}
        </button>
      </div>
      <div id="thresholdList">
        <For each={props.thresholds}>
          {(t2, i) => (
            <div class="threshold-row">
              <input
                type="number"
                class="threshold-below"
                min="0"
                step="0.01"
                value={t2.below}
                onInput={(e) => {
                  const v = parseFloat(e.currentTarget.value);
                  // 空输入/非法值不写入，避免 NaN 污染配置
                  if (Number.isFinite(v)) setBelow(i(), v);
                }}
              />
              <span class="sep">{t('threshold.below')}</span>
              <input
                type="color"
                class="threshold-color"
                value={t2.color}
                onChange={(e) => setColor(i(), e.currentTarget.value)}
              />
              <button
                class="icon threshold-del"
                title={t('threshold.delete')}
                onClick={() => remove(i())}
              >
                <i class="codicon codicon-trash"></i>
              </button>
            </div>
          )}
        </For>
      </div>
      <p class="settings-hint">{t('threshold.hint')}</p>
    </>
  );
}
