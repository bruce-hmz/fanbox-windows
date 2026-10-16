'use strict';
// app.js:会话面板每行加「⚡ 接力」——跨 agent 续接任务
// 流程:选目标 agent → POST /api/handoff 生成交接纪要(用户最近原话+进展+改动文件)→ 在项目目录
// 用目标 agent 启动并让它先读纪要。源 agent 的原生续接(▶ 续上)保持不变。
const fs = require('fs');
const f = 'D:/codes/fanbox/public/app.js';
let s = fs.readFileSync(f, 'utf8');
function rep(from, to, label) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.error(`[FAIL] ${label} 命中 ${n} 次`); process.exitCode = 1; return; }
  s = s.replace(from, to);
  console.log('[ok]', label);
}

// 1) 会话行加接力按钮
rep(
  '<button class="ghost-btn mem-resume" data-i="${i}" title="在内嵌终端里接上这段会话的上下文继续">▶ 续上</button>',
  '<span class="mem-acts"><button class="ghost-btn mem-resume" data-i="${i}" title="在内嵌终端里接上这段会话的上下文继续(原 agent 原会话)">▶ 续上</button>' +
  '<button class="ghost-btn mem-handoff" data-i="${i}" title="生成任务交接纪要,换其他 agent 继续这个任务">⚡ 接力</button></span>',
  '会话行加接力按钮');

// 2) 接力按钮逻辑:插在续上绑定块之后(.mem-file 绑定之前)
rep(
  "  });\n  body.querySelectorAll('.mem-file').forEach((f) => {",
  "  });\n" +
  "  body.querySelectorAll('.mem-handoff').forEach((b) => {\n" +
  "    b.onclick = (ev) => {\n" +
  "      ev.preventDefault();\n" +
  "      const hs = d.sessions[Number(b.dataset.i)];\n" +
  "      // 候选 = 注册表里能吃命令行初始输入的 agent(排除桌面应用型与源 agent 自己)\n" +
  "      const cands = AGENT_REGISTRY.filter((a) => !a.app && a.id !== hs.agent);\n" +
  "      popupMenu(ev, cands.map((a) => ({\n" +
  "        label: '用 ' + a.label + ' 接力',\n" +
  "        fn: async () => {\n" +
  "          const r = await apiPost('/api/handoff', { path: dirPath, agent: hs.agent, id: hs.id }).catch(() => null);\n" +
  "          if (!r || !r.ok) { toast('生成交接纪要失败' + (r && r.error ? '：' + r.error : ''), true); return; }\n" +
  "          const prompt = '请先读取 ' + r.file + ' ,这是此前用 ' + hs.agent + ' 做的任务的交接纪要,按纪要继续完成任务';\n" +
  "          close();\n" +
  "          term.runInDir(dirPath, a.cmd + ' \"' + prompt + '\"', '交接纪要已生成,由 ' + a.label + ' 接力');\n" +
  "        },\n" +
  "      })));\n" +
  "    };\n" +
  "  });\n" +
  "  body.querySelectorAll('.mem-file').forEach((f) => {",
  '接力按钮逻辑');

fs.writeFileSync(f, s);
console.log(process.exitCode ? '有失败项！' : '接力 UI 补丁完成');
