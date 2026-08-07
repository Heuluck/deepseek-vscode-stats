/** 设置面板：编辑先进 staged 暂存，保存才提交配置；取消/关闭丢弃。
 *  各设置分组已拆为 settings/ 下的独立组件，本文件只负责状态编排与组装。 */
import { createEffect, createSignal, on, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
  applySavedConfig,
  setSpendPreview,
  setYMinSpanRatio,
  stagedFromConfig,
  store,
  type StagedConfig,
} from '../store';
import { postMessage } from '../messaging';
import { t } from '../i18n';
import { SettingsGroup } from './SettingsGroup';
import { StatusBarGroup } from './settings/StatusBarGroup';
import { ChartGroup } from './settings/ChartGroup';
import { GeneralGroup } from './settings/GeneralGroup';
import { ApiKeyGroup } from './settings/ApiKeyGroup';
import { DataGroup } from './settings/DataGroup';
import { MiscGroup } from './settings/MiscGroup';

interface SettingsProps {
  onClose: () => void;
}

export function Settings(props: SettingsProps) {
  // 分组折叠：设置类默认展开，操作类默认收起
  const [groupsOpen, setGroupsOpen] = createStore<Record<string, boolean>>({
    statusBar: true,
    chart: true,
    general: true,
    apiKey: false,
    data: false,
    misc: false,
  });
  // 挂载时从当前配置初始化暂存；编辑只改本地 staged，保存才提交
  const [staged, setStaged] = createStore<StagedConfig>(stagedFromConfig(store.config));
  // 图表 Y 轴最小跨度比例：webview 本地设置（不写入 VS Code 设置），保存时才提交
  const [yRatio, setYRatio] = createSignal<number>(store.yMinSpanRatio ?? 0.2);

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
        .filter((t) => Number.isFinite(t.below))
        .map((t) => ({ below: t.below, color: t.color }))
        .sort((a, b) => a.below - b.below),
      pollMinutes: staged.pollMinutes,
      rawRetentionDays: staged.rawRetentionDays,
      showTodaySpend: staged.showTodaySpend,
      connectorStyle: staged.connectorStyle,
      connectorColor: staged.connectorColor,
      lineStyle: staged.lineStyle,
      dayBoundary: staged.dayBoundary,
    };
    // 乐观更新本地 config：config 回传是异步的，先让 Header/Footer 立即用新值，避免闪回旧值
    applySavedConfig(payload);
    postMessage({ type: 'saveSettings', payload });
    // 图表 UI 设置（非 VS Code 设置）：Y 轴最小跨度比例，存扩展 globalState
    const ratio = Math.min(1, Math.max(0, yRatio()));
    setYMinSpanRatio(ratio);
    postMessage({ type: 'setYMinSpanRatio', payload: { ratio } });
    close();
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
          <span class="settings-title">{t('settings.title')}</span>
          <button class="icon" title={t('settings.close')} onClick={close}>
            <i class="codicon codicon-close"></i>
          </button>
        </div>
        <div class="settings-body">
          <SettingsGroup
            title={t('settings.group.statusBar')}
            icon="account"
            open={groupsOpen.statusBar}
            onToggle={() => setGroupsOpen('statusBar', (o) => !o)}
          >
            <StatusBarGroup staged={staged} setStaged={setStaged} />
          </SettingsGroup>

          <SettingsGroup
            title={t('settings.group.chart')}
            icon="graph-line"
            open={groupsOpen.chart}
            onToggle={() => setGroupsOpen('chart', (o) => !o)}
          >
            <ChartGroup
              staged={staged}
              setStaged={setStaged}
              yRatio={yRatio()}
              setYRatio={setYRatio}
            />
          </SettingsGroup>

          <SettingsGroup
            title={t('settings.group.general')}
            icon="gear"
            open={groupsOpen.general}
            onToggle={() => setGroupsOpen('general', (o) => !o)}
          >
            <GeneralGroup staged={staged} setStaged={setStaged} />
          </SettingsGroup>

          <SettingsGroup
            title={t('settings.group.apiKey')}
            icon="key"
            open={groupsOpen.apiKey}
            onToggle={() => setGroupsOpen('apiKey', (o) => !o)}
          >
            <ApiKeyGroup />
          </SettingsGroup>

          <SettingsGroup
            title={t('settings.group.data')}
            icon="database"
            open={groupsOpen.data}
            onToggle={() => setGroupsOpen('data', (o) => !o)}
          >
            <DataGroup />
          </SettingsGroup>

          <SettingsGroup
            title={t('settings.group.misc')}
            icon="ellipsis"
            open={groupsOpen.misc}
            onToggle={() => setGroupsOpen('misc', (o) => !o)}
          >
            <MiscGroup />
          </SettingsGroup>
        </div>
        <div class="settings-foot">
          <button class="btn" onClick={() => postMessage({ type: 'openNativeSettings' })}>
            <i class="codicon codicon-settings-gear"></i>{t('settings.openNative')}
          </button>
          <button class="btn" onClick={close}>
            {t('settings.cancel')}
          </button>
          <button class="btn primary" onClick={save}>
            <i class="codicon codicon-check"></i>{t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
