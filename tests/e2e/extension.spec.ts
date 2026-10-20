import { test, expect, chromium, type BrowserContext, type Worker, type Page } from '@playwright/test';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../../lib/settings';

const FIRST = 'BV1xx411c7mD';
const SECOND = 'BV1yy411c7mD';
let context: BrowserContext;
let worker: Worker;
let videoPage: Page;
let popup: Page;
let delayApi = 0;
let failApi = false;

test.beforeEach(async ({}, info) => {
  delayApi = 0;
  failApi = false;
  const extension = path.resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(info.outputPath('profile'), {
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  await context.route('https://www.bilibili.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><h1>本地播放器测试页</h1><script>const media = document.createElement("video"); media.id = "player"; media.volume = .42; document.body.append(media);</script></body></html>',
  }));
  await context.route('https://api.bilibili.com/**', async route => {
    const bvid = new URL(route.request().url()).searchParams.get('bvid');
    const wait = delayApi;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    await route.fulfill({ json: failApi ? { code: -412 } : { code: 0, data: { owner: bvid === FIRST ? { mid: 123, name: '喜欢的 UP 主' } : { mid: 999, name: '其他 UP 主' } } } });
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async settings => {
    await (globalThis as any).chrome.storage.local.set({ 'settings.v1': settings });
  }, DEFAULT_SETTINGS);
  videoPage = await context.newPage();
  await videoPage.goto(`https://www.bilibili.com/video/${FIRST}/`);
  const id = new URL(worker.url()).host;
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.locator('#enabled')).toBeEnabled();
});
test.afterEach(async () => { await context?.close(); });

const volume = () => videoPage.locator('video').evaluate((media: HTMLVideoElement) => media.volume);
async function activateVideo() {
  await worker.evaluate(async () => {
    const chrome = (globalThis as any).chrome;
    const tabs = await chrome.tabs.query({});
    // Content script hosts are sufficient to message tabs; URL access isn't needed by the popup.
    for (const tab of tabs) {
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: 'get-page-status' });
        if (status?.supported) { await chrome.tabs.update(tab.id, { active: true }); return; }
      } catch { /* Extension and blank tabs have no content script. */ }
    }
  });
}

async function openManager() {
  const pageOpened = context.waitForEvent('page');
  await popup.locator('#manage-whitelist').click();
  const manager = await pageOpened;
  await expect(manager).toHaveURL(/\/options\.html$/);
  await expect(manager.locator('#uid')).toBeEnabled();
  return manager;
}

test('白名单、设置持久化、播放器改音量与暂停恢复', async ({}, info) => {
  await expect.poll(volume).toBe(.01);
  await activateVideo();
  await expect(popup.locator('#creator-name')).toHaveText('喜欢的 UP 主');
  await expect(popup.locator('h1')).toHaveText('B站UP音量白名单');
  await expect(popup.locator('#creator-list')).toHaveCount(0);
  await expect(popup.locator('#uid')).toHaveCount(0);
  await popup.locator('main').screenshot({ path: info.outputPath('popup.png') });
  await popup.locator('#add-current').click();
  await expect.poll(volume).toBe(.7);
  await expect(popup.locator('#count')).toHaveText('1');
  await videoPage.locator('video').evaluate((media: HTMLVideoElement) => { media.volume = 1; media.muted = true; });
  await expect.poll(volume).toBe(.7);
  expect(await videoPage.locator('video').evaluate((media: HTMLVideoElement) => media.muted)).toBe(true);
  await popup.reload();
  await expect(popup.locator('#count')).toHaveText('1');
  await popup.locator('#enabled').uncheck();
  await expect.poll(volume).toBe(.42);
  await videoPage.locator('video').evaluate((media: HTMLVideoElement) => { media.volume = .55; });
  await expect.poll(volume).toBe(.55);
  // Wait longer than the maintenance interval to catch accidental repeated restoration.
  await expect(async () => {
    await new Promise(resolve => setTimeout(resolve, 650));
    expect(await volume()).toBe(.55);
  }).toPass();
  await popup.locator('#enabled').check();
  await expect.poll(volume).toBe(.7);
  const manager = await openManager();
  await expect(manager.locator('#count')).toHaveText('1');
  await manager.getByRole('button', { name: '移除 喜欢的 UP 主' }).click();
  await expect.poll(volume).toBe(.01);
  await expect(popup.locator('#count')).toHaveText('0');
  await manager.locator('#uid').fill('https://space.bilibili.com/123');
  await manager.locator('#creator-label').fill('喜欢的 UP 主');
  await manager.locator('#add-manual').click();
  await expect.poll(volume).toBe(.7);
  await expect(popup.locator('#count')).toHaveText('1');
  await expect(manager.locator('#creator-list li')).toHaveCount(1);
  await manager.screenshot({ path: info.outputPath('management.png'), fullPage: true });
});

test('SPA 切换先压低音量，丢弃过期 UP 主响应并接管新播放器', async () => {
  await activateVideo();
  await expect(popup.locator('#creator-name')).toHaveText('喜欢的 UP 主');
  await popup.locator('#add-current').click();
  await expect.poll(volume).toBe(.7);
  delayApi = 1200;
  const immediateVolume = await videoPage.evaluate(id => {
    history.pushState({}, '', `/video/${id}/`);
    return document.querySelector('video')!.volume;
  }, SECOND);
  expect(immediateVolume).toBe(.01);
  await expect.poll(volume).toBe(.01);
  await activateVideo();
  await expect(popup.locator('#creator-name')).toHaveText('其他 UP 主');
  expect(await volume()).toBe(.01);
  // Go to allowed author, then immediately away while its API response is outstanding.
  await videoPage.evaluate(id => history.pushState({}, '', `/video/${id}/`), FIRST);
  await activateVideo();
  await expect(popup.locator('#creator-name')).toHaveText('正在识别 UP 主…');
  await videoPage.evaluate(id => {
    history.pushState({}, '', `/video/${id}/`);
    document.querySelector('video')?.remove();
    const replacement = document.createElement('video');
    replacement.volume = .9;
    document.body.append(replacement);
  }, SECOND);
  await expect.poll(volume).toBe(.01);
  await expect(popup.locator('#creator-name')).toHaveText('其他 UP 主');
  expect(await volume()).toBe(.01);
  await videoPage.evaluate(() => history.pushState({}, '', '/'));
  await expect.poll(volume).toBe(.9);
});

test('API 失败仍压低，零音量与非法输入正常处理', async () => {
  failApi = true;
  await videoPage.goto(`https://www.bilibili.com/video/${SECOND}/`);
  await expect.poll(volume).toBe(.01);
  await activateVideo();
  await expect(popup.locator('#page-detail')).toContainText('暂时无法识别');
  await popup.locator('#quiet-volume').fill('0');
  await popup.locator('#quiet-volume').dispatchEvent('change');
  await expect.poll(volume).toBe(0);
  const manager = await openManager();
  await manager.locator('#uid').fill('https://evil.com/123');
  await manager.locator('#add-manual').click();
  await expect(manager.locator('#feedback')).toContainText('请输入有效 UID');
  await expect(manager.locator('#count')).toHaveText('0');
  await videoPage.evaluate(() => {
    document.querySelector('video')?.remove();
    document.body.append(document.createElement('bwp-video'));
  });
  await activateVideo();
  await expect(popup.locator('#badge')).toHaveText('未接管');
  await expect(popup.locator('#page-detail')).toContainText('特殊播放器');
});

test('管理页搜索、去重、持久化与窄屏布局', async ({}, info) => {
  const manager = await openManager();
  await expect(manager.locator('#empty')).toBeVisible();
  for (const [uid, name] of [['123', '喜欢的 UP 主'], ['456', '音乐收藏']]) {
    await manager.locator('#uid').fill(uid!);
    await manager.locator('#creator-label').fill(name!);
    await manager.locator('#add-manual').click();
    await expect(manager.locator('#uid')).toHaveValue('');
  }
  await expect(manager.locator('#count')).toHaveText('2');
  await expect(popup.locator('#count')).toHaveText('2');
  await manager.locator('#search').fill('音乐');
  await expect(manager.locator('#creator-list li')).toHaveCount(1);
  await manager.locator('#search').fill('不存在');
  await expect(manager.locator('#empty-title')).toHaveText('没有匹配的 UP 主');
  await manager.locator('#search').fill('123');
  await expect(manager.locator('#creator-list li')).toHaveCount(1);
  // Re-adding an existing UID without a remark must preserve its known name.
  await manager.locator('#uid').fill('123');
  await manager.locator('#add-manual').click();
  await expect(manager.locator('#uid')).toHaveValue('');
  await expect(manager.locator('#count')).toHaveText('2');
  await expect(manager.locator('#creator-list')).toContainText('喜欢的 UP 主');
  await manager.reload();
  await expect(manager.locator('#count')).toHaveText('2');
  await manager.screenshot({ path: info.outputPath('management.png'), fullPage: true });
  await manager.setViewportSize({ width: 390, height: 844 });
  expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await manager.screenshot({ path: info.outputPath('management-mobile.png'), fullPage: true });
  await manager.getByRole('button', { name: '移除 音乐收藏' }).click();
  await expect(manager.locator('#count')).toHaveText('1');
});
