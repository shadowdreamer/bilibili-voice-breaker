import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { applyAction, normalizeSettings, SETTINGS_KEY } from '../lib/settings';
import { getVideoRef } from '../lib/video';
import type { BackgroundRequest } from '../lib/messages';

export default defineBackground(() => {
  let writeQueue: Promise<unknown> = Promise.resolve();
  const read = async () => normalizeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
  browser.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;
    if (!['get-settings', 'update-settings', 'resolve-creator'].includes(message?.type)) return;
    const run = async () => {
      if (message.type === 'get-settings') { await writeQueue; return read(); }
      if (message.type === 'update-settings') {
        // Content pages may read settings, but only extension UI may change them.
        if (!sender.url?.startsWith(browser.runtime.getURL('/'))) throw new Error('请通过扩展面板更改设置');
        const previous = writeQueue;
        const task = (async () => {
          await previous;
          const next = applyAction(await read(), message.action);
          await browser.storage.local.set({ [SETTINGS_KEY]: next });
          return next;
        })();
        writeQueue = (async () => { try { await task; } catch { /* Keep later writes usable. */ } })();
        return task;
      }
      const ref = getVideoRef(message.url);
      if (!ref || !sender.tab || !getVideoRef(sender.url ?? '')) throw new Error('不支持的视频地址');
      const url = new URL('https://api.bilibili.com/x/web-interface/view');
      url.searchParams.set(ref.param, ref.value);
      const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('UP 主识别失败，暂时保持低音量');
      const json = await response.json();
      const owner = json?.data?.owner;
      if (json?.code !== 0 || !owner || !/^[1-9]\d*$/.test(String(owner.mid)) || typeof owner.name !== 'string')
        throw new Error('暂时无法识别 UP 主，保持低音量');
      return { uid: String(owner.mid), name: owner.name.slice(0, 80) };
    };
    void (async () => {
      try { sendResponse({ ok: true, data: await run() }); }
      catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : '操作失败' }); }
    })();
    return true;
  });
});
