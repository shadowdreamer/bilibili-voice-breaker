import { createSettingsUi } from '../../lib/settings-ui';
import { parseUid, parseWhitelistBackup, type WhitelistCreator } from '../../lib/settings';
import './style.css';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const uidInput = el<HTMLInputElement>('uid');
const nameInput = el<HTMLInputElement>('creator-label');
const search = el<HTMLInputElement>('search');
const ui = createSettingsUi(render, el('feedback'));
const importMode = el<HTMLSelectElement>('import-mode');
const importFile = el<HTMLInputElement>('import-file');
const PAGE_SIZE = 50;
let page = 1;
let pendingImport: WhitelistCreator[] | null = null;
let readingFile = false;

function render() {
  const { settings, ready, busy } = ui;
  for (const input of [uidInput, nameInput]) input.disabled = !ready || busy;
  el<HTMLButtonElement>('add-manual').disabled = !ready || busy;
  for (const id of ['export-whitelist', 'choose-import']) el<HTMLButtonElement>(id).disabled = !ready || busy || readingFile;
  importMode.disabled = !ready || busy || readingFile;
  el<HTMLButtonElement>('confirm-import').disabled = !ready || busy || readingFile || pendingImport === null;
  el('count').textContent = String(settings.whitelist.length);
  const query = search.value.trim().toLocaleLowerCase();
  const creators = settings.whitelist.filter(item => `${item.name} ${item.uid}`.toLocaleLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  page = Math.min(page, pages);
  el('page-info').textContent = `第 ${page} / ${pages} 页 · 共 ${creators.length} 位 · 每页 ${PAGE_SIZE} 位`;
  el<HTMLButtonElement>('previous-page').disabled = page <= 1;
  el<HTMLButtonElement>('next-page').disabled = page >= pages;
  const list = el('creator-list');
  list.replaceChildren();
  for (const creator of creators.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)) {
    const row = document.createElement('li');
    const identity = document.createElement('div');
    identity.className = 'identity';
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = creator.name ? Array.from(creator.name)[0]! : 'UP';
    const link = document.createElement('a');
    link.href = `https://space.bilibili.com/${creator.uid}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = creator.name || `UP 主 ${creator.uid}`;
    const mobileUid = document.createElement('small');
    mobileUid.textContent = `UID ${creator.uid}`;
    link.append(mobileUid);
    identity.append(avatar, link);
    const savedVolume = document.createElement('span');
    savedVolume.className = 'saved-volume';
    savedVolume.textContent = `${Math.round((creator.volume ?? .7) * 100)}%`;
    savedVolume.title = '该 UP 主的记忆音量';
    identity.append(savedVolume);
    const uid = document.createElement('span');
    uid.className = 'uid-column';
    uid.textContent = creator.uid;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '移除';
    remove.setAttribute('aria-label', `移除 ${creator.name || creator.uid}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => void ui.update({ type: 'remove-creator', uid: creator.uid }, '已移出白名单'));
    row.append(identity, uid, remove);
    list.append(row);
  }
  el('empty').hidden = creators.length > 0;
  el('empty-title').textContent = !ready ? '正在读取白名单…' : settings.whitelist.length ? '没有匹配的 UP 主' : '白名单还是空的';
  el('empty-detail').textContent = settings.whitelist.length ? '试试其他名称或 UID。' : '在上方添加 UP 主，或在视频弹窗中一键加入。';
}
el<HTMLFormElement>('add-form').addEventListener('submit', async event => {
  event.preventDefault();
  const uid = parseUid(uidInput.value);
  if (!uid) { ui.tell('请输入有效 UID 或 https://space.bilibili.com/ 开头的个人空间链接', true); return; }
  const existing = ui.settings.whitelist.find(item => item.uid === uid);
  const name = nameInput.value.trim() || existing?.name || '';
  if (await ui.update({ type: 'add-creator', creator: { uid, name } }, existing ? '已更新该 UP 主' : '已加入白名单')) {
    uidInput.value = '';
    nameInput.value = '';
    search.value = '';
    render();
    uidInput.focus();
  }
});
search.addEventListener('input', () => { page = 1; render(); });
el('previous-page').addEventListener('click', () => { page = Math.max(1, page - 1); render(); });
el('next-page').addEventListener('click', () => { page++; render(); });
el('export-whitelist').addEventListener('click', () => {
  const backup = { format: 'bilibili-up-whitelist', version: 1, whitelist: ui.settings.whitelist };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bilibili-up-whitelist-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
el('choose-import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  pendingImport = null;
  readingFile = true;
  el('import-preview').textContent = '正在读取文件…';
  render();
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
    pendingImport = parseWhitelistBackup(await file.text());
    el('import-preview').textContent = `已读取 ${pendingImport.length} 位 UP 主，请选择方式后确认导入。替换会清空原白名单。`;
  } catch (error) {
    el('import-preview').textContent = '文件未导入，请重新选择。';
    ui.tell(error instanceof Error ? error.message : '读取文件失败', true);
  } finally { readingFile = false; importFile.value = ''; render(); }
});
el('confirm-import').addEventListener('click', async () => {
  if (pendingImport === null) return;
  const mode = importMode.value === 'replace' ? 'replace' : 'merge';
  if (await ui.update({ type: 'import-whitelist', mode, whitelist: pendingImport }, mode === 'replace' ? '已替换白名单' : '已合并白名单')) {
    pendingImport = null;
    page = 1;
    search.value = '';
    el('import-preview').textContent = '导入完成，成员音量随白名单保存。';
    render();
  }
});
void ui.start();
