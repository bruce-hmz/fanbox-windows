# FanBox Windows 版移植说明

上游 [alchaincyf/fanbox](https://github.com/alchaincyf/fanbox) v2.16.1（macOS 原生）的 Windows 移植。
本文件记录改了什么、为什么、以及如何重新打包。

## 打包

```bash
npm install                      # 建议挂 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dist:win                 # 产物: dist/FanBox-Setup-2.16.1.exe + dist/FanBox-Portable-2.16.1.exe
```

环境变量（国内）：

```
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 关键改动

| 领域 | mac 原实现 | Windows 方案 |
|---|---|---|
| 终端 pty | node-pty（需 electron-rebuild + VS 构建链） | `@lydell/node-pty` 1.2.0-beta.15（NAPI 预编译，Node/Electron 通用，免编译）；main.js 里先试新包再回退原包 |
| 缩略图 | sips（图）/ qlmanage QuickLook（视频/PDF） | 常驻 PowerShell 工作器：Shell 缩略图工厂（`IShellItemImageFactory`，视频/PDF/图片真缩略图）+ System.Drawing 兜底；stdin/stdout 按行 JSON 通信，路径走 base64 防编码坑 |
| Agent hooks | curl + shell 语法（`>/dev/null 2>&1`、`$VAR`） | `node fanbox-hook.js` 转发器（cmd/bash 通吃，零 shell 语法依赖）；codex notify 用 `codex-notify.js`（.sh 在 Windows 拉不起来），路径一律正斜杠 |
| 桌面应用 agent（ZCode/WorkBuddy）探测 | `open -Ra`（LaunchServices） | 开始菜单快捷方式（ProgramData+AppData 递归）→ 卸载表 DisplayName → PATH，一批应用共用一个 PowerShell 进程；只查 App Paths 注册表会把已装的全误报「未装」 |
| 桌面应用 agent 拉起 | `open -a X` | PowerShell 单行：开始菜单找 `X*.lnk` → `Invoke-Item`；前端 `openAppCmd()` 按 `fanboxEnv.platform` 生成 |
| agent 探测 | `/bin/zsh -lc command -v` | `where`；桌面应用探测走 `App Paths` 注册表 + `where` |
| 删除 | osascript → Finder | PowerShell `Microsoft.VisualBasic.FileIO` → 回收站（上游已有，保留） |
| 在终端打开 | open -a Terminal | 优先 `wt.exe`（Windows Terminal），回退 cmd |
| 系统代理读取 | scutil --proxy | 注册表 `Internet Settings`（ProxyEnable/ProxyServer） |
| 标题栏 | hiddenInset + 红绿灯 | `titleBarStyle: hidden` + `titleBarOverlay`（系统三键），CSS `.platform-win #topbar` 右侧留位 |
| 剪贴板复制文件 | osascript | PowerShell `-STA` + `Clipboard::SetFileDropList` |
| 终端 cwd 探测 | lsof | Windows 无手段，取启动目录（`pidCwd` Map） |
| 应用内更新 | GitHub Releases（只发 mac 包） | Windows 版禁用（手动检查弹说明对话框） |
| 微信 ClawBot | POSIX 登录 shell 拉无头 agent | 暂不移植：挂同接口桩，界面显示未连接 |
| 快捷键文案 | ⌘K / ⌘B / ⌘⇧M | Ctrl K / Ctrl B / Ctrl+Shift+M（`i18n-dict.js` 键值同步改）；⌘⇧M 的判定改为接受 Ctrl |
| 字体 | SF Pro / SF Mono | 补 Cascadia Mono / Consolas 回退 |

## 打包踩坑记录（Windows 无管理员/开发者模式）

1. **winCodeSign 解压失败**：`winCodeSign-2.6.0.7z` 内含两个 darwin 符号链接，7za 建链接需要特权，
   electron-builder 重试 4 次全挂。解法：手动下载同版本 7z（npmmirror 有），用自带 7za 解压
   （symlink 两个子项报错可忽略），预置到
   `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`，
   app-builder 探到该目录即跳过下载解压。
2. `build.nsis` 里不能放 `portable` 字段——`portable` 是与 `nsis` 平级的顶层 target 配置。
3. Electron 起的 pty 别信 `process.env.SHELL`：从 Git Bash 启动时它是 `/usr/bin/bash`（Windows 上不存在），
   只认 `FANBOX_SHELL` 覆盖，默认 `powershell.exe`。
4. **沙箱 preload 里不能 `require('os')`**：Electron ≥20 渲染层默认沙箱，preload 只能 require electron
   内置模块。一旦抛错，整个 `fanboxEnv` 桥消失（isDesktopApp/ctlToken 全没），后果是
   `platform-win` 类加不上 → 三键 overlay 避让失效 + 写接口 401。home 路径改走
   `additionalArguments`（`--fanbox-home=`），preload 从 argv 解析。
5. **三键 overlay 底色要跟主题走**：`titleBarOverlay` 初始色写死后，浅色皮肤（档案/暖白）上是一块黑疤。
   渲染层 `applyTheme` 末尾读 `#topbar` 计算样式，经 `win:overlay` IPC 调 `win.setTitleBarOverlay`
   动态换色（底色=--bg-2，符号色=--text-dim）。

## 鼠标“隐形线”修复（WCO 命中区滞留）

症状：鼠标突然被一条隐形竖线挡住、点击右侧无效但键盘正常。根因是 Electron 的
Window Controls Overlay（titleBarOverlay）在窗口最大化/还原/全屏切换后，命中测试区域可能滞留旧坐标，
形成一条吞鼠标事件的幽灵条带。修复：main.js createWindow 里监听 maximize/unmaximize/enter-full-screen/
leave-full-screen，触发时用 getTitleBarOverlay() 的当前参数 setTitleBarOverlay() 强制重建命中区域。
若修复后仍复现，优先排查企业 DLP（Esafenet 等）的光标限制或第三方窗口遮挡。

## 实时速率（v2.16.1-win 新增，参考 DSH token-meter）

侧栏「Agent 用量」顶部新增实时条：**输出 token（≈tok/s，真实生成速度）· 调用次数 · 上下文量（含缓存读）** + 近 10 分钟每分钟输出柱状图 + 在跑会话名。口径教训：把输入/缓存读/输出加总当「速率」会虚高一到两个数量级（实测某分钟总量 186k、真实输出仅 839），agent 场景下 95%+ 是上下文重发，必须分桶展示。
实现：`/api/agent-rate`（server.js `agentRate()`）复用会话日志的增量尾读器，按滑动窗口聚合，1s 缓存；前端面板展开时 2s 轮询。
参考 DeepSeek Harness（deepseek-ai/deepseek-harness 的 packages/llm/token-meter）：它有流式 chunk 可用所以显示每回合 tok/s + 首 token 延迟；
FanBox 的 agent 是外部 CLI 拿不到流，等价口径 = 会话 jsonl 实时追加事件的滑动窗口。

## 终端标签关闭增强（v2.16.1-win 新增）

标签多时关闭按钮难点中：① 中键点击直接关 ② 右键菜单（关闭/关闭其他/全部关闭/复制路径）
③ 滚轮横滚标签栏（原 overflow 隐藏滚动条，右侧标签只能最大化窗口才够得着——根因）
④ >5 个标签进入拥挤模式（收窄内边距，✕ 热区扩大到约 18px）。

## 拖窗体验增强（v2.16.1-win 新增）

原设计只有品牌区和顶栏空隙能拖窗口，且 chrome 区没禁选字（想拖窗一按就选中面包屑/标签文字）。修复：
① 顶栏/品牌区/终端头/预览头全部 user-select:none；② 终端头、预览头空白处新增可拖区域（标签/按钮保持 no-drag 可点）；③ Windows 下收掉侧栏顶部给 mac 红绿灯预留的 40px 死区（三键在右上用不着），品牌行上移到顶，左上角整块可拖——OS 级 WM_NCHITTEST 实测原死区 (60,8)/(60,28) 均返回 HTCAPTION。
注意项目注释里的已知坑：drag 区域是 OS 级遮罩、不认 z-index，压在它上面的弹层点击会被吞——
因此标签右键菜单用 popupMenuAt 锚到标签底沿下方，保证菜单项全部落在终端头之下（真鼠标点击已验证 3→2）。
双击顶栏/终端头空白处 = 系统级最大化/还原（Windows 标准行为）。

## 项目级会话管理:跨 agent 接力(v2.16.1-win 新增)

底栏「项目记忆」每条会话两个动作:**▶ 续上**(原 agent 原生 resume,上游已有)+ **⚡ 接力**(本版新增):
从源会话日志提取交接纪要(用户最近原话 + 助手最后进展 + 改动文件;claude/codex 读尾部 256KB 富提取,
其余 agent 用面板元数据),落 ~/.fanbox/handoffs/(留 30 份),目标 agent 在项目目录以
<agent> "请先读取 <纪要路径>…" 启动接续任务。会话上下文锁在各家私有存储里,跨家续接的
唯一正道就是纪要搬运,不是伪造成「同一个会话」。

## 已知降级

- HEIC/HEIF 缩略图与转码不可用（原走 sips；Windows 无系统级 HEIC 解码时回退图标）。
- 终端内 `cd` 后的实时 cwd 探测不可用（取启动目录）。
- 微信遥控、合盖继续干活（pmset）、截图直通车（macOS 截图事件监听）不可用。
- 未代码签名：SmartScreen 首次运行会提示「仍要运行」。
