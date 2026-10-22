import type { Creator, Settings, SettingsAction } from './settings';
export type BackgroundRequest =
  | { type: 'get-settings' }
  | { type: 'update-settings'; action: SettingsAction }
  | { type: 'record-creator-volume'; uid: string; volume: number; videoKey: string }
  | { type: 'resolve-creator'; url: string };
export interface PageStatus {
  videoKey: string | null;
  supported: boolean;
  creator: Creator | null;
  resolving: boolean;
  error: string | null;
  volume: number | null;
}
export type Response<T> = { ok: true; data: T } | { ok: false; error: string };
export function unwrap<T>(response: Response<T>): T {
  if (!response?.ok) throw new Error(response?.error || '扩展连接失败，请刷新视频页面');
  return response.data;
}
export type SettingsResponse = Response<Settings>;
