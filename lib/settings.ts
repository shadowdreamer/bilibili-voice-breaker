export const SETTINGS_KEY = 'settings.v1';
export interface Creator { uid: string; name: string }
export interface WhitelistCreator extends Creator { volume?: number }
export interface Settings {
  enabled: boolean;
  quietVolume: number;
  whitelist: WhitelistCreator[];
}
export const DEFAULT_SETTINGS: Settings = {
  enabled: true, quietVolume: 0.01, whitelist: [],
};

export function parseUid(input: string): string | null {
  const text = input.trim();
  if (/^[1-9]\d{0,19}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.hostname !== 'space.bilibili.com') return null;
    const match = /^\/([1-9]\d{0,19})\/?$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch { return null; }
}

const volume = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export function normalizeSettings(input: unknown): Settings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const whitelist: WhitelistCreator[] = [];
  if (Array.isArray(raw.whitelist)) {
    for (const item of raw.whitelist) {
      if (!item || typeof item !== 'object' || typeof item.uid !== 'string') continue;
      const uid = parseUid(item.uid);
      if (uid && !whitelist.some(creator => creator.uid === uid)) {
        whitelist.push({ uid, name: typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '', volume: volume(item.volume, .7) });
      }
    }
  }
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    quietVolume: volume(raw.quietVolume, DEFAULT_SETTINGS.quietVolume),
    whitelist,
  };
}

export type SettingsAction =
  | { type: 'import-whitelist'; mode: 'merge' | 'replace'; whitelist: WhitelistCreator[] }
  | { type: 'set-creator-volume'; uid: string; volume: number }
  | { type: 'set-quiet-volume'; volume: number }
  | { type: 'set-enabled'; enabled: boolean }
  | { type: 'add-creator'; creator: Creator }
  | { type: 'remove-creator'; uid: string };

export function applyAction(settings: Settings, action: SettingsAction): Settings {
  switch (action.type) {
    case 'set-creator-volume':
      if (!validVolume(action.volume) || !parseUid(action.uid)) throw new Error('UP 主音量无效');
      return { ...settings, whitelist: settings.whitelist.map(item => item.uid === action.uid ? { ...item, volume: action.volume } : item) };
    case 'set-quiet-volume':
      if (!validVolume(action.volume)) throw new Error('音量无效');
      return { ...settings, quietVolume: action.volume };
    case 'import-whitelist': {
      if (action.mode !== 'merge' && action.mode !== 'replace') throw new Error('导入方式无效');
      const imported = validateWhitelist(action.whitelist);
      const whitelist = new Map((action.mode === 'merge' ? settings.whitelist : []).map(item => [item.uid, item]));
      // Existing remarks take precedence when merging a backup.
      for (const creator of imported) if (!whitelist.has(creator.uid)) whitelist.set(creator.uid, creator);
      return { ...settings, whitelist: [...whitelist.values()] };
    }
    case 'set-enabled':
      if (typeof action.enabled !== 'boolean') throw new Error('开关值无效');
      return { ...settings, enabled: action.enabled };
    case 'add-creator': {
      const uid = typeof action.creator?.uid === 'string' ? parseUid(action.creator.uid) : null;
      if (!uid) throw new Error('请输入有效的 UID 或 B 站个人空间链接');
      const creator = { uid, name: String(action.creator.name ?? '').trim().slice(0, 80), volume: settings.whitelist.find(item => item.uid === uid)?.volume ?? .7 };
      return { ...settings, whitelist: [...settings.whitelist.filter(item => item.uid !== uid), creator] };
    }
    case 'remove-creator': return { ...settings, whitelist: settings.whitelist.filter(item => item.uid !== action.uid) };
    default: throw new Error('未知操作');
  }
}

const validVolume = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export function validateWhitelist(input: unknown): WhitelistCreator[] {
  if (!Array.isArray(input) || input.length > 10000) throw new Error('白名单必须为数组，最多 10000 位 UP 主');
  const creators = new Map<string, WhitelistCreator>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || typeof item.uid !== 'string' ||
        !/^[1-9]\d{0,19}$/.test(item.uid) || typeof item.name !== 'string' || item.name.length > 80 ||
        (item.volume !== undefined && !validVolume(item.volume)))
      throw new Error('白名单格式无效：每项需包含有效的字符串 UID 和不超过 80 字的名称');
    if (!creators.has(item.uid)) creators.set(item.uid, { uid: item.uid, name: item.name.trim(), volume: item.volume ?? .7 });
  }
  return [...creators.values()];
}

export function parseWhitelistBackup(text: string): WhitelistCreator[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON'); }
  if (!data || typeof data !== 'object' || !('format' in data) || data.format !== 'bilibili-up-whitelist' ||
      !('version' in data) || data.version !== 1 || !('whitelist' in data))
    throw new Error('请选择本扩展导出的白名单文件（版本 1）');
  return validateWhitelist(data.whitelist);
}

export function targetVolume(settings: Settings, creator: Creator | null): number | null {
  if (!settings.enabled) return null;
  const allowed = creator ? settings.whitelist.find(item => item.uid === creator.uid) : undefined;
  return allowed ? allowed.volume ?? .7 : settings.quietVolume;
}
