import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DEFAULT_SETTINGS, normalizeSettings, SETTINGS_KEY, targetVolume, type Creator } from '../lib/settings';
import { getVideoRef } from '../lib/video';
import { unwrap, type PageStatus } from '../lib/messages';
import { VolumeController } from '../lib/volume-controller';

export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  runAt: 'document_start',
  main(ctx) {
    const controller = new VolumeController();
    let settings = { ...DEFAULT_SETTINGS };
    let creator: Creator | null = null;
    let currentKey: string | null = null;
    let generation = 0;
    let resolving = false;
    let error: string | null = null;
    let retryAt = 0;
    let settingsRevision = 0;

    const apply = () => {
      if (!currentKey || !settings.enabled) controller.restore();
      else controller.setTarget(targetVolume(settings, creator));
    };
    const resolve = async (url: string, token: number) => {
      resolving = true;
      error = null;
      try {
        const found = unwrap<Creator>(await browser.runtime.sendMessage({ type: 'resolve-creator', url }));
        if (ctx.isInvalid || token !== generation || getVideoRef(location.href)?.key !== currentKey) return;
        creator = found;
      } catch (cause) {
        if (ctx.isInvalid || token !== generation) return;
        error = cause instanceof Error ? cause.message : '识别失败';
        retryAt = Date.now() + 15000;
      } finally {
        if (ctx.isValid && token === generation) { resolving = false; apply(); }
      }
    };
    const scan = () => {
      if (ctx.isInvalid) return;
      const ref = getVideoRef(location.href);
      const key = ref?.key ?? null;
      if (key !== currentKey) {
        currentKey = key;
        generation++;
        creator = null;
        resolving = false;
        error = null;
        retryAt = 0;
      }
      apply();
      if (key && !creator && !resolving && Date.now() >= retryAt) void resolve(location.href, generation);
      if (key && settings.enabled) document.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => controller.attach(media));
      controller.prune();
    };
    // Mutation callbacks catch new players; locationchange clears old author state on SPA navigation.
    const observer = new MutationObserver(scan);
    observer.observe(document, { childList: true, subtree: true });
    ctx.addEventListener(window, 'wxt:locationchange', event => {
      // Navigation API fires before location.href changes. Revoke the previous
      // author's allowance synchronously, then resolve after the URL commits.
      const destination = getVideoRef(event.newUrl.href)?.key ?? null;
      if (destination !== currentKey) {
        generation++;
        currentKey = destination;
        creator = null;
        resolving = false;
        error = null;
        retryAt = 0;
        apply();
      }
      ctx.setTimeout(scan, 0);
    });
    ctx.addEventListener(document, 'play', scan, { capture: true });
    ctx.addEventListener(document, 'loadedmetadata', scan, { capture: true });
    ctx.setInterval(scan, 500);
    const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && SETTINGS_KEY in changes) {
        settingsRevision++;
        settings = normalizeSettings(changes[SETTINGS_KEY]?.newValue);
        scan();
      }
    };
    browser.storage.onChanged.addListener(onStorage);
    const onMessage = (message: { type?: string }, _sender: unknown, sendResponse: (status: PageStatus) => void) => {
      if (message?.type !== 'get-page-status') return;
      scan();
      const customPlayer = !!document.querySelector('bwp-video') && !document.querySelector('video');
      sendResponse({
        supported: !!currentKey, creator, resolving,
        error: customPlayer ? '此视频使用特殊播放器，暂未接管音量。请尝试在 B 站切换播放编码。' : error,
        volume: currentKey && !customPlayer ? targetVolume(settings, creator) : null,
      });
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.storage.onChanged.removeListener(onStorage);
      browser.runtime.onMessage.removeListener(onMessage);
      controller.destroy();
    });
    scan();
    void (async () => {
      const revision = settingsRevision;
      try {
        const response = await browser.runtime.sendMessage({ type: 'get-settings' });
        if (ctx.isInvalid || revision !== settingsRevision) return;
        settings = normalizeSettings(unwrap(response));
        scan();
      } catch { error = '读取设置失败，请刷新页面；暂时保持低音量'; }
    })();
  },
});
