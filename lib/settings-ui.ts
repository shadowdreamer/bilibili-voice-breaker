import { browser } from 'wxt/browser';
import { applyAction, DEFAULT_SETTINGS, normalizeSettings, SETTINGS_KEY, type Settings, type SettingsAction } from './settings';
import { unwrap } from './messages';

/** Persistent state shared by popup and management page. */
export function createSettingsUi(render: () => void, feedback: HTMLElement) {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let ready = false;
  let busy = false;
  let revision = 0;
  let liveQueue: Promise<unknown> = Promise.resolve();
  const pending: { action: SettingsAction }[] = [];
  function tell(message: string, error = false) {
    feedback.textContent = message;
    feedback.dataset.error = String(error);
  }
  return {
    get settings() { return pending.reduce((current, item) => applyAction(current, item.action), settings); },
    get ready() { return ready; },
    get busy() { return busy; },
    tell,
    updateLive(action: SettingsAction) {
      if (!ready || busy) return;
      const item = { action };
      pending.push(item);
      render();
      liveQueue = liveQueue.then(async () => {
        const initialRevision = revision;
        try {
          const response = unwrap<Settings>(await browser.runtime.sendMessage({ type: 'update-settings', action }));
          if (revision === initialRevision) settings = response;
          tell('音量已保存');
        } catch (error) { tell(error instanceof Error ? error.message : '音量保存失败，请重试', true); }
        finally { pending.splice(pending.indexOf(item), 1); render(); }
      });
    },
    async update(action: SettingsAction, success = '设置已保存') {
      if (!ready || busy) return false;
      busy = true;
      render();
      try {
        await liveQueue;
        settings = unwrap<Settings>(await browser.runtime.sendMessage({ type: 'update-settings', action }));
        tell(success);
        return true;
      } catch (error) {
        tell(error instanceof Error ? error.message : '保存失败，请重试', true);
        return false;
      } finally { busy = false; render(); }
    },
    async start() {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && SETTINGS_KEY in changes) {
          revision++;
          settings = normalizeSettings(changes[SETTINGS_KEY]?.newValue);
          render();
        }
      });
      const initialRevision = revision;
      try {
        const response = await browser.runtime.sendMessage({ type: 'get-settings' });
        if (revision === initialRevision) settings = normalizeSettings(unwrap(response));
        ready = true;
        render();
      } catch (error) {
        tell(`读取失败：${error instanceof Error ? error.message : '连接失败'}。请重新打开页面。`, true);
      }
    },
  };
}
