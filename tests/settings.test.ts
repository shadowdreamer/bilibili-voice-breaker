import { describe, expect, it } from 'vitest';
import { applyAction, DEFAULT_SETTINGS, normalizeSettings, parseUid, parseWhitelistBackup, targetVolume } from '../lib/settings';
import { getVideoRef } from '../lib/video';

describe('UP 主名单与音量策略', () => {
  it('导入先校验，合并保留备注，替换不改变音量与开关', () => {
    const settings = { ...DEFAULT_SETTINGS, enabled: false, whitelist: [{ uid: '123', name: '原备注' }] };
    const whitelist = parseWhitelistBackup(JSON.stringify({ format: 'bilibili-up-whitelist', version: 1,
      whitelist: [{ uid: '123', name: '新备注' }, { uid: '456', name: '新 UP' }, { uid: '456', name: '重复' }] }));
    expect(applyAction(settings, { type: 'import-whitelist', mode: 'merge', whitelist })).toEqual({ ...settings,
      whitelist: [{ uid: '123', name: '原备注' }, { uid: '456', name: '新 UP' }] });
    expect(applyAction(settings, { type: 'import-whitelist', mode: 'replace', whitelist })).toEqual({ ...settings, whitelist });
    expect(applyAction(settings, { type: 'import-whitelist', mode: 'replace', whitelist: [] })).toEqual({ ...settings, whitelist: [] });
    for (const text of ['bad', 'null', '{}', '{"format":"bilibili-up-whitelist","version":2,"whitelist":[]}'])
      expect(() => parseWhitelistBackup(text)).toThrow();
    for (const whitelist of [[{ uid: '0', name: '' }], [{ uid: 123, name: '' }], [{ uid: '123', name: 'x'.repeat(81) }], [null]])
      expect(() => applyAction(settings, { type: 'import-whitelist', mode: 'replace', whitelist: whitelist as any })).toThrow();
    expect(settings.whitelist).toEqual([{ uid: '123', name: '原备注' }]);
  });
  it('接受 UID 与官方空间链接，拒绝相似域名和无效 ID', () => {
    expect(parseUid(' 123456 ')).toBe('123456');
    expect(parseUid('https://space.bilibili.com/123456?spm_id_from=333')).toBe('123456');
    for (const text of ['0', '-1', '1.5', '123abc', 'https://space.bilibili.com.evil.com/12', 'https://space.bilibili.com/12/video', 'javascript:alert(1)'])
      expect(parseUid(text)).toBeNull();
  });
  it('损坏存储回退到安全默认值并去重', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ normalVolume: NaN, quietVolume: Infinity, whitelist: [null, { uid: '1', name: 'A' }, { uid: '1', name: 'B' }, { uid: '-1' }] }))
      .toEqual({ ...DEFAULT_SETTINGS, whitelist: [{ uid: '1', name: 'A' }] });
    expect(normalizeSettings({ normalVolume: .1, quietVolume: .5 }).quietVolume).toBe(.1);
  });
  it('只放行确认的 UID，未知 UP 主保持低音量', () => {
    const settings = applyAction(DEFAULT_SETTINGS, { type: 'add-creator', creator: { uid: '123', name: '测试' } });
    expect(targetVolume(settings, { uid: '123', name: '改名后' })).toBe(.7);
    expect(targetVolume(settings, { uid: '999', name: '测试' })).toBe(.01);
    expect(targetVolume(settings, null)).toBe(.01);
    expect(targetVolume({ ...settings, enabled: false }, null)).toBeNull();
    expect(targetVolume({ ...settings, quietVolume: 0 }, null)).toBe(0);
  });
  it('支持添加、更新和移除，不接受无效的音量', () => {
    const first = applyAction(DEFAULT_SETTINGS, { type: 'add-creator', creator: { uid: '123', name: 'A' } });
    const second = applyAction(first, { type: 'add-creator', creator: { uid: '123', name: 'B' } });
    expect(second.whitelist).toEqual([{ uid: '123', name: 'B' }]);
    expect(applyAction(second, { type: 'remove-creator', uid: '123' }).whitelist).toEqual([]);
    for (const quietVolume of [NaN, Infinity, -.1, 1.5, .8])
      expect(() => applyAction(first, { type: 'set-volumes', normalVolume: .7, quietVolume })).toThrow();
  });
});

describe('视频地址解析', () => {
  it('仅接受 B 站普通视频，忽略分 P 和追踪参数', () => {
    expect(getVideoRef('https://www.bilibili.com/video/BV1xx411c7mD/?p=2')?.key).toBe('BV1xx411c7mD');
    expect(getVideoRef('https://www.bilibili.com/video/av123/?p=3')).toEqual({ key: 'av123', param: 'aid', value: '123' });
    for (const url of ['https://www.bilibili.com/', 'https://live.bilibili.com/123', 'https://www.bilibili.com/bangumi/play/ep123', 'https://evil.com/video/av123', 'https://www.bilibili.com/video/BVbad'])
      expect(getVideoRef(url)).toBeNull();
  });
});
