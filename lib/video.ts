export interface VideoRef { key: string; param: 'bvid' | 'aid'; value: string }
export function getVideoRef(href: string): VideoRef | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || url.hostname !== 'www.bilibili.com') return null;
    const match = /^\/video\/(BV[0-9A-Za-z]{10}|av[1-9]\d*)\/?$/.exec(url.pathname);
    const id = match?.[1];
    if (!id) return null;
    return id.startsWith('BV') ? { key: id, param: 'bvid', value: id }
      : { key: id, param: 'aid', value: id.slice(2) };
  } catch { return null; }
}
