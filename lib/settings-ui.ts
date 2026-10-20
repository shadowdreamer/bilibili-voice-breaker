import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, normalizeSettings, SETTINGS_KEY, type Settings, type SettingsAction } from './settings';
import { unwrap } from './messages';

/** Persistent state shared by popup and management page. */
export function createSettingsUi(render: () => void, feedback: HTMLElement) {
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let ready = false;
  let busy = false;
  let revision = 0;
  function tell(message: string, error = false) {
    feedback.textContent = message;
    feedback.dataset.error = String(error);
  }
  return {
    get settings() { return settings; },
    get ready() { return ready; },
    get busy() { return busy; },
    tell,
    async update(action: SettingsAction, success = '设置已保存') {
      if (!ready || busy) return false;
      busy = true;
      render();
      try {
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
