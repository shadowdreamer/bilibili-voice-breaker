import { browser } from 'wxt/browser';
import { createSettingsUi } from '../../lib/settings-ui';
import type { PageStatus } from '../../lib/messages';
import './style.css';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const enabled = el<HTMLInputElement>('enabled');
const normal = el<HTMLInputElement>('normal-volume');
const quiet = el<HTMLInputElement>('quiet-volume');
const addCurrent = el<HTMLButtonElement>('add-current');
const ui = createSettingsUi(render, el('feedback'));
let status: PageStatus | null = null;

function renderStatus() {
  const { settings, ready, busy } = ui;
  const creator = status?.creator;
  const entry = creator ? settings.whitelist.find(item => item.uid === creator.uid) : undefined;
  const allowed = !!entry;
  normal.disabled = !ready || busy || !allowed;
  normal.value = String(Math.round((entry?.volume ?? .7) * 100));
  el('normal-value').textContent = `${normal.value}%`;
  el('creator-name').textContent = creator?.name || (status?.supported ? '正在识别 UP 主…' : '打开一个 B 站视频');
  el('page-detail').textContent = status?.supported
    ? status.error || (creator ? `UID ${creator.uid}` : '识别期间保持非白名单音量。')
    : '在 B 站普通视频页打开面板。';
  const badge = el('badge');
  badge.textContent = !ready ? '读取中' : !status?.supported ? '等待视频' : status.volume === null && settings.enabled ? '未接管' : allowed ? '白名单' : '非白名单';
  badge.dataset.state = allowed ? 'enabled' : 'neutral';
  const state = el('enabled-state');
  state.textContent = !ready ? '读取中' : settings.enabled ? '已启用' : '已暂停';
  state.dataset.state = ready && settings.enabled ? 'enabled' : 'neutral';
  addCurrent.disabled = !ready || busy || !creator;
  addCurrent.textContent = allowed ? '− 移除白名单' : '＋ 加入白名单';
}
function render() {
  const { settings, ready, busy } = ui;
  enabled.checked = settings.enabled;
  quiet.value = String(Math.round(settings.quietVolume * 100));
  for (const input of [enabled, normal, quiet]) input.disabled = !ready || busy;
  el('normal-value').textContent = `${normal.value}%`;
  el('quiet-value').textContent = `${quiet.value}%`;
  el('count').textContent = String(settings.whitelist.length);
  renderStatus();
}
enabled.addEventListener('change', () => void ui.update({ type: 'set-enabled', enabled: enabled.checked }));
normal.addEventListener('input', () => {
  const uid = status?.creator?.uid;
  if (uid && ui.settings.whitelist.some(item => item.uid === uid)) ui.updateLive({ type: 'set-creator-volume', uid, volume: Number(normal.value) / 100 });
});
quiet.addEventListener('input', () => ui.updateLive({ type: 'set-quiet-volume', volume: Number(quiet.value) / 100 }));
addCurrent.addEventListener('click', () => {
  const creator = status?.creator;
  if (!creator) return;
  const allowed = ui.settings.whitelist.some(item => item.uid === creator.uid);
  if (allowed) void ui.update({ type: 'remove-creator', uid: creator.uid }, '已移除白名单');
  else void ui.update({ type: 'add-creator', creator }, '已加入白名单');
});
el('manage-whitelist').addEventListener('click', async () => {
  try { await browser.runtime.openOptionsPage(); }
  catch { ui.tell('打开管理页面失败，请重试。', true); }
});
let refreshing = false;
async function refreshStatus() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    status = tab?.id === undefined ? null : await browser.tabs.sendMessage(tab.id, { type: 'get-page-status' });
  } catch { status = null; }
  finally { refreshing = false; renderStatus(); }
}
void ui.start();
void refreshStatus();
setInterval(() => void refreshStatus(), 1000);
