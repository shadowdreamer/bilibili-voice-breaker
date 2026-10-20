import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

export default defineConfig({
  hooks: {
    'build:publicAssets': (wxt, files) => {
      files.push({ absoluteSrc: resolve(wxt.config.root, 'LICENSE'), relativeDest: 'LICENSE' });
    },
  },
  manifest: {
    name: 'B站UP音量白名单',
    description: '白名单 UP 主正常播放，其余 UP 主自动降低音量。',
    permissions: ['storage'],
    host_permissions: ['https://api.bilibili.com/*'],
    minimum_chrome_version: '120',
    icons,
    action: { default_title: 'B站UP音量白名单', default_icon: icons },
  },
});
