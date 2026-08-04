/** 设置面板：编辑先进 staged 暂存，保存才提交配置；取消/关闭丢弃。 */
import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { applySavedConfig, setSpendPreview, stagedFromConfig, store, type StagedConfig } from '../store';
import { postMessage } from '../messaging';

interface SettingsProps {
  onClose: () => void;
}

export function Settings(props: SettingsProps) {
  const [colorOpen, setColorOpen] = createSignal(false);
  const [consent, setConsent] = createSignal(false);
  // 挂载时从当前配置初始化暂存；编辑只改本地 staged，保存才提交
  const [staged, setStaged] = createStore<StagedConfig>(stagedFromConfig(store.config));

  // 今日花费暂存预览同步给 Header
  createEffect(() => setSpendPreview(staged.showTodaySpend));
  onCleanup(() => setSpendPreview(null));

  // 外部（VS Code 设置）改动时刷新打开中的面板
  createEffect(
    on(
      () => store.config,
      () => {
        if (store.settingsOpen) setStaged(stagedFromConfig(store.config));
      }
    )
  );

  function close(): void {
    setSpendPreview(null);
    props.onClose();
  }

  function save(): void {
    const payload = {
      statusBarShow: staged.statusBarShow,
      defaultColor: staged.defaultColor,
      // staged 来自 createStore，元素是 proxy；map 成 plain object 再发送
      thresholds: staged.thresholds
        .map((t) => ({ below: t.below, color: t.color }))
        .sort((a, b) => a.below - b.below),
      pollMinutes: staged.pollMinutes,
      rawRetentionDays: staged.rawRetentionDays,
      showTodaySpend: staged.showTodaySpend,
    };
    // 乐观更新本地 config：config 回传是异步的，先让 Header/Footer 立即用新值，避免闪回旧值
    applySavedConfig(payload);
    postMessage({ type: 'saveSettings', payload });
    close();
  }

  function addThreshold(): void {
    setStaged('thresholds', (ts) => [...ts, { below: 100, color: '#ffb900' }]);
  }

  return (
    <div
      class="overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div class="settings-panel">
        <div class="settings-head">
          <span class="settings-title">DeepSeek Stats 设置</span>
          <button class="icon" title="关闭" onClick={close}>
            <i class="codicon codicon-close"></i>
          </button>
        </div>
        <div class="settings-body">
          <div class="settings-group">
            <div class="settings-label">状态栏</div>
            <label class="settings-row">
              <span>显示余额</span>
              <input
                type="checkbox"
                checked={staged?.statusBarShow}
                onChange={(e) => setStaged('statusBarShow', e.currentTarget.checked)}
              />
            </label>
            <button
              class={'settings-toggle' + (colorOpen() ? ' open' : '')}
              type="button"
              onClick={() => setColorOpen((o) => !o)}
            >
              <span>阈值颜色</span>
              <i class="codicon codicon-chevron-down"></i>
            </button>
            <div class={'settings-collapse' + (colorOpen() ? ' open' : '')}>
              <div class="settings-row">
                <span>默认颜色</span>
                <div class="settings-controls">
                  <input
                    type="color"
                    value={staged?.defaultColor || '#000000'}
                    disabled={!staged?.defaultColor}
                    onChange={(e) => {
                      setStaged('defaultColor', e.currentTarget.value);
                    }}
                  />
                  <label class="settings-inline">
                    <input
                      type="checkbox"
                      checked={!staged?.defaultColor}
                      onChange={(e) => {
                        const theme = e.currentTarget.checked;
                        setStaged('defaultColor', theme ? '' : '#000000');
                      }}
                    />
                    跟随主题
                  </label>
                </div>
              </div>
              <div class="threshold-head">
                <span>余额阈值（低于 → 颜色）</span>
                <button class="btn small" onClick={addThreshold}>
                  <i class="codicon codicon-add"></i>添加
                </button>
              </div>
              <div id="thresholdList">
                <For each={staged?.thresholds ?? []}>
                  {(t, i) => (
                    <div class="threshold-row">
                      <input
                        type="number"
                        class="threshold-below"
                        min="0"
                        step="0.01"
                        value={t.below}
                        onInput={(e) =>
                          setStaged('thresholds', i(), 'below', parseFloat(e.currentTarget.value))
                        }
                      />
                      <span class="sep">以下</span>
                      <input
                        type="color"
                        class="threshold-color"
                        value={t.color}
                        onChange={(e) => setStaged('thresholds', i(), 'color', e.currentTarget.value)}
                      />
                      <button
                        class="icon threshold-del"
                        title="删除该阈值"
                        onClick={() =>
                          setStaged('thresholds', (ts) => ts.filter((_, idx) => idx !== i()))
                        }
                      >
                        <i class="codicon codicon-trash"></i>
                      </button>
                    </div>
                  )}
                </For>
              </div>
              <p class="settings-hint">余额低于阈值（不含）时显示对应颜色。</p>
            </div>
          </div>

          <div class="settings-group">
            <div class="settings-label">常规</div>
            <div class="settings-row">
              <label for="pollMinutesEl">查询间隔（分钟）</label>
              <input
                type="number"
                id="pollMinutesEl"
                min="1"
                step="1"
                class="settings-number"
                value={staged?.pollMinutes}
                onChange={(e) => {
                  const v = parseInt(e.currentTarget.value, 10);
                  if (Number.isFinite(v) && v >= 1) setStaged('pollMinutes', v);
                }}
              />
            </div>
            <div class="settings-row">
              <label for="rawRetentionEl">分钟级快照保留（天）</label>
              <input
                type="number"
                id="rawRetentionEl"
                min="1"
                step="1"
                class="settings-number"
                value={staged?.rawRetentionDays}
                onChange={(e) => {
                  const v = parseInt(e.currentTarget.value, 10);
                  if (Number.isFinite(v) && v >= 1) setStaged('rawRetentionDays', v);
                }}
              />
            </div>
            <label class="settings-row">
              <span>显示今日花费（估算）</span>
              <input
                type="checkbox"
                checked={staged?.showTodaySpend || consent()}
                onChange={(e) => {
                  if (e.currentTarget.checked) {
                    setConsent(true);
                  } else {
                    setStaged('showTodaySpend', false);
                    setConsent(false);
                  }
                }}
              />
            </label>
            <Show when={consent()}>
              <div class="settings-consent">
                <p class="settings-hint">
                  今日花费为根据余额快照推算的估算值，可能因充值或数据断档而不准确。
                </p>
                <div class="row">
                  <button
                    class="btn primary"
                    onClick={() => {
                      setStaged('showTodaySpend', true);
                      setConsent(false);
                    }}
                  >
                    同意启用
                  </button>
                  <button
                    class="btn"
                    onClick={() => {
                      setStaged('showTodaySpend', false);
                      setConsent(false);
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <div class="settings-group">
            <div class="settings-label">API Key</div>
            <div class="settings-row">
              <span>{store.data && store.data.hasKey ? '已配置（存储于系统钥匙串）' : '未配置'}</span>
              <div class="settings-controls">
                <button class="btn" onClick={() => postMessage({ type: 'setApiKey' })}>
                  设置 / 更换
                </button>
                <button class="btn danger" onClick={() => postMessage({ type: 'clearApiKey' })}>
                  清除
                </button>
              </div>
            </div>
          </div>

          <div class="settings-group">
            <div class="settings-label">数据</div>
            <div class="settings-row">
              <span>历史快照（仅 VS Code 打开期间记录）</span>
              <button class="btn danger" onClick={() => postMessage({ type: 'clearHistory' })}>
                清除历史
              </button>
            </div>
          </div>

          <div class="settings-group">
            <div class="settings-label">其他</div>
            <div class="settings-row">
              <span>恢复默认设置</span>
              <button class="btn danger" onClick={() => postMessage({ type: 'resetSettings' })}>
                恢复默认
              </button>
            </div>
          </div>
        </div>
        <div class="settings-foot">
          <button class="btn" onClick={() => postMessage({ type: 'openNativeSettings' })}>
            <i class="codicon codicon-settings-gear"></i>打开 VS Code 设置
          </button>
          <button class="btn" onClick={close}>
            取消
          </button>
          <button class="btn primary" onClick={save}>
            <i class="codicon codicon-check"></i>保存
          </button>
        </div>
      </div>
    </div>
  );
}
