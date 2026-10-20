import { createSettingsUi } from '../../lib/settings-ui';
import { parseUid } from '../../lib/settings';
import './style.css';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const uidInput = el<HTMLInputElement>('uid');
const nameInput = el<HTMLInputElement>('creator-label');
const search = el<HTMLInputElement>('search');
const ui = createSettingsUi(render, el('feedback'));

function render() {
  const { settings, ready, busy } = ui;
  for (const input of [uidInput, nameInput]) input.disabled = !ready || busy;
  el<HTMLButtonElement>('add-manual').disabled = !ready || busy;
  el('count').textContent = String(settings.whitelist.length);
  const query = search.value.trim().toLocaleLowerCase();
  const creators = settings.whitelist.filter(item => `${item.name} ${item.uid}`.toLocaleLowerCase().includes(query));
  const list = el('creator-list');
  list.replaceChildren();
  for (const creator of creators) {
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
search.addEventListener('input', render);
void ui.start();
