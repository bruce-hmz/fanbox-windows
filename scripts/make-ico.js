'use strict';
// 生成 build/icon.ico：用 Electron 的 nativeImage 把 icon-1024.png 缩到各尺寸 PNG，打包成 ICO。
// 运行：npx electron scripts/make-ico.js
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const src = path.join(__dirname, '..', 'build', 'icon-1024.png');
  const dst = path.join(__dirname, '..', 'build', 'icon.ico');
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngs = sizes.map((s) => {
    const img = nativeImage.createFromPath(src).resize({ width: s, height: s, quality: 'best' });
    if (img.isEmpty()) { console.error('源图读取失败:', src); app.exit(1); }
    return { s, png: img.toPNG() };
  });
  // ICO 打包：6 字节头 + 每尺寸 16 字节目录项 + PNG 数据（Windows Vista+ 支持内嵌 PNG）
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = 6 + entries.length;
  const blobs = [];
  pngs.forEach(({ s, png }, i) => {
    const e = i * 16;
    entries.writeUInt8(s >= 256 ? 0 : s, e);      // width（256 记 0）
    entries.writeUInt8(s >= 256 ? 0 : s, e + 1);  // height
    entries.writeUInt8(0, e + 2);                 // 调色板色数
    entries.writeUInt8(0, e + 3);                 // 保留
    entries.writeUInt16LE(1, e + 4);              // planes
    entries.writeUInt16LE(32, e + 6);             // bpp
    entries.writeUInt32LE(png.length, e + 8);     // 数据长度
    entries.writeUInt32LE(offset, e + 12);        // 数据偏移
    offset += png.length;
    blobs.push(png);
  });
  fs.writeFileSync(dst, Buffer.concat([header, entries, ...blobs]));
  console.log('icon.ico 已生成:', dst, fs.statSync(dst).size, 'bytes');
  app.exit(0);
});
