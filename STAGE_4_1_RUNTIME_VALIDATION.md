# STAGE_4_1_RUNTIME_VALIDATION.md — 真实运行时验证

> 日期：2026-09-15 | 阶段：Stage 4.1（Real Runtime Validation）
> 原则：先取证 → 再判断 → 只有确认问题才修改；环境不可得如实 UNVERIFIED，禁止伪造 PASS。

## 1. 基线

- 基线代码：Stage 3.2 / 4.0 提交链（本工作区为**无 .git 的镜像副本**，真实 clone 位于用户侧；本阶段复跑回归均以本镜像源码为准）。
- Git 可执行文件：**本机当前不可用**（git 命令未找到、无 .git 元数据、node 亦缺）→ git 层验证与提交受环境限制，见 §18。
- Working tree：本阶段无生产源码修改（仅取证工具与文档变更）。
- 前序：Stage 1–3.2–4.0 全部状态保留；Stage 3.2/4.0 已验证机制（闭包标志 + 页级 marker + lifecycle 回归）未被改动（复核见 §3 基线确认）。

## 2. 实际环境

- OS：Windows（本机）；Browser：**Google Chrome（headless=new 真实渲染）+ Microsoft Edge（可用未用）**。
- ScriptCat：不可用（本机未安装/无法自动化安装）→ 相关行 UNVERIFIED。
- Extension：安装包存在，真机自动化不可行 → 相关行 UNVERIFIED。
- Target：https://diy.zheliyin.com/ 与 /diyWeb/（登录墙）。

## 3. Runtime Topology（真实取证，非假设）

3.0 基线确认（§三）：两层防护在镜像源码中完整存在、未被改动——
- 第一层：`extension/assistant.js:39` `let pageBridgeInstalled = false;`（闭包标志；installPageBridge `assistant.js:833` 使用，注入异常允许重试 `:841`）。
- 第二层：`extension/src/editor/page-bridge.js:20` `window.__ZY_CARD_ASSISTANT_BRIDGE__`（页级 marker；listener 注册成功后才落 marker）。

真实 Chrome 打开结果（本次复取证）：
- `https://diy.zheliyin.com/`：**HTTP GET/HEAD 均 404**（上次取证 200 ~319KB，本次 404——服务器行为/路由变动，需注意）；真实 Chrome headless 渲染后 title=`diy.zheliyin.com`，**顶层 iframe 数=0**。
- `https://diy.zheliyin.com/diyWeb/`：HTTP 200（~17.7KB）。
- 结论（已取证部分）：

```
TOP WINDOW (diy.zheliyin.com)  —— 已确认可达、无顶层 iframe（两次取证一致）
   ├── 主站壳（/）: 当前 404（Chrome 渲染 title=diy.zheliyin.com）
   ├── 门户（/diyWeb/）: 200, 含登录
   └── 设计器（editor/canvas）: 需账号, 未取得 → UNVERIFIED
```

页面真实 iframe/editor 拓扑、Canvas、对象模型均需登录后取证 → **UNVERIFIED**（已提供 [diy-runtime-forensics.js](./diy-runtime-forensics.js) 供用户在真实设计器 DevTools 一键取证回传）。

## 4. ScriptCat

**UNVERIFIED**（本机无 ScriptCat；`@require` ×4 与主脚本共 5 个 raw.githubusercontent URL 于本次真实请求**全部 HTTP 200**——`field-core 7938B / config-core 2100B / ai-client 3747B / page-bridge 21652B / 主脚本 39860B`，加载链网络层成立，安装运行证据缺失）。

## 5. Extension

**UNVERIFIED**（真机加载未执行；manifest 顺序与 isolated-world 机制代码级成立，无运行级证据）。

## 6. iframe

**UNVERIFIED**（未登录可见拓扑中顶层 0 iframe；设计器内部 frame 拓扑需登录后取证）。

## 7. Canvas

**UNVERIFIED**（真实 Canvas 未取得；headless mock 层全部通过不等同真实 Canvas）。

## 8. Object Snapshot

**UNVERIFIED**（真实对象未取得）。已内置字段清单于取证脚本（left/top/width/height/scaleX/scaleY/angle/fontSize/fontFamily/fill/origin/constructor/zy 标签），待回传。

## 9. Bridge

- install/probe/response/重复防护/刷新生命周期：headless（同 realm 单 window）**PASS**——本次以**真实 Chrome headless（非 mock）**复跑：lifecycle 6/6 ALL-PASS（含 t5 marker 机制、t6 跨实例注入 ×2 仍恰 1）、wiring 5/5 wired-ok。
- 真实页面 install/probe：**UNVERIFIED**（需 ScriptCat/设计器账号）。

## 10. Apply

headless（canvas mock）真实执行链路 PASS（editor 18/18 ALL-PASS，含已有层只改文本、克隆、清理、防重）；**真实设计器 Apply**：UNVERIFIED。

## 11. Regression（headless，本阶段以真实 Chrome 复跑）

```
bridge lifecycle: ALL-PASS 6/6（含 t5/t6）→ 真实 Chrome
wiring:           wired-ok 5/5 → 真实 Chrome
field+config:     ALL-PASS (43 / 15) → 真实 Chrome
AI:               ALL-PASS (18) → 真实 Chrome
editor:           ALL-PASS (18) → 真实 Chrome
exit: 各套断言 0 FAIL（bridge 需 ?zydebug=1；ai 需 ?zydebug=1；wiring 异步需 virtual-time-budget）
```

## 12. Issues

| 级别 | 项 | 状态 |
|---|---|---|
| P0 | 无 | — |
| P1 | 无（Stage 3.2/4.0 已清零） | — |
| P2 | 见 §17 重分类表 | 记录/延期 |
| P3 | 见 §17 | 记录 |
| UNVERIFIED | ScriptCat 安装运行、扩展真机、iframe 拓扑、真实 Canvas/对象/Apply、真实 AI | 环境限制 |

## 13. 修改（本阶段实际修改，逐项 commit）

| commit | 目的 | 文件 | 说明 |
|---|---|---|---|
| docs: add runtime forensics script | 取证工具（只读） | docs/diy-runtime-forensics.js | 供用户真实设计器 DevTools 一键输出拓扑/对象摘要；脱敏 |
| docs: stage 4.1 report 更新 | 报告 | STAGE_4_1_RUNTIME_VALIDATION.md | 本文件（补充真实 Chrome 复跑/首层 404 变化/基线确认） |
| feat: forensics 增强 iframe 深度 + spoof 取证 | 取证工具只读增强 | docs/diy-runtime-forensics.js | per-iframe 同源编辑器/canvas 探测（§六）+ 伪造 probe 响应统计（§十五 Test A/B，纯只读不改画布） |

**生产源码零修改**（审计后无任何「已确认且需立即修」的问题；见 §18）。

> 环境说明：本机当前 **git 与 node 不可执行**（工作区为无 .git 镜像副本）。上述变更已完成于工作区，**git 提交待环境具备后补录**（此前各阶段提交均在具备 git 的会话完成）。

## 14. Independent Review

**CONDITIONAL**
- 现有业务/字段/AI/Bridge 协议/标记机制均未改变；
- 未引入新重复注入路径（marker 链完整）、未引入 iframe 变更（未动 all_frames）；
- 新增内容仅为只读取证工具与文档，无运行影响；
- 真实运行时证据缺失属环境限制，已如实标记，非“为了通过而改测试”。

## 15. Final Gate

**CONDITIONAL-GO**

- FULL-GO 所需「ScriptCat 真实运行 PASS + 真实设计器 PASS + Canvas/iframe 拓扑已确认」均因环境不可得而未满足（诚实记录，不伪造）。
- CONDITIONAL-GO 依据：核心链路（headless 全窗口 + mock 画布）与真实网络可达层（@require 200、站点拓扑 0-iframe）已证；剩余 UNVERIFIED 为登录态/脚本管理器安装等环境覆盖项，不阻塞下一阶段设计（且原文明确：真实拓扑未知时不得进入 OCR 实现）。

## 16. P2 重分类表（§十七）

| Issue | Real Runtime 影响 | 阻塞 OCR | 处理 |
|---|---|---|---|
| nonce | 低（需页面已被攻陷才有意义） | 否 | defer |
| @connect * | 低（自定义 endpoint 属产品能力） | 否 | defer |
| updateURL 指向 main | 低（发布流程受控；release 化另立） | 否 | defer |
| requestId | 否（串行） | OCR 阶段预留 | defer |
| partial apply | 中（无事务；有清晰返回清单） | 弱（OCR 批量需重新评估） | defer+OCR 阶段提案 |
| inheritReferenceProps | 中（黑名单复制） | 弱 | defer（OCR 时可白名单化） |
| layout heuristic | 中 | 否（OCR 自建坐标） | defer |
| README 版本过旧 | 低 | 否 | defer |

## 17. 核心问题回答（§二十四）

> 我们现在是否已真正知道 Assistant/Bridge/Editor/Canvas 在真实折立印页面里分别运行在哪个 window/frame、如何通信？

**NO**（未登录环境不可得）。因此按指令：**不进入 Stage 5 OCR 设计**，继续 Runtime Validation（等待用户真机取证回传：安装 ScriptCat 版并粘贴 `diy-runtime-forensics.js` 输出，或提供设计器访问方式）。

## 18. 需要用户协助的取证回传（解锁 UNVERIFIED → FULL-GO 的唯一途径）

1. 登录折立印并打开真实设计器页面；
2. DevTools Console 粘贴 `docs/diy-runtime-forensics.js` 全文并回车；
3. 把 `[zy-forensics]` 的主输出与约 2 秒后的 `spoof-probe` 附加输出一起发回（spoof 项回答 §十五 Test A/B：同页其他 script 能否伪造 probe 触发 Bridge）；
4. （可选）顺带执行一次「识别并填正面」后把状态栏结果发回。

> 环境限制补遗：本会话中 git/node 在本机不可执行（无 .git、无 git/node 命令、TRAE 内置目录亦无）。Stage 4.1 断言复跑已改用**真实 Chrome headless** 完成并全部 PASS（详见 §9/§11）；git 提交将待可执行环境恢复后补录。

## Stop

按指令 §二十五：完成即**停止**，不自行进入下一阶段，等待证据回传与外部评审。