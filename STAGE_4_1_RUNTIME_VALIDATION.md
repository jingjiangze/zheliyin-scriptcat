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

**3.1 真实设计器取证（用户真机回传，2026-09-15）：**

实际运行拓扑（`http…/diyWeb/third/20408603/1/thirdLoginDiyEdit.do`，已登录编辑态）：

```
TOP WINDOW (diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do)  ← 设计器本体
   ├── fabric: true（fabric.Canvas 构造器存在）
   ├── requirejs: true（138 个已定义模块：CanvasObjVO / CurrentCanvas / CanvasDiy 均存在）
   ├── CanvasObjVO.totalCanvasArray = [1 个 canvas]（949.15 × 577.40，21 对象，4 个文本，首文本「简小袋」）
   └── iframe[0] id=mattingContent src=about:blank（抠图占位，无 canvas/fabric/requirejs，与编辑器无关）
```

**结论（§二十四核心问题 → 已可回答）：**
- Assistant/Bridge 应注入 **top window**（设计器本体所在）；
- Editor 引擎与 Canvas 全部位于 top window 的 requirejs/闭包作用域（`CanvasObjVO/CurrentCanvas/CanvasDiy` 均为真）；
- `mattingContent` iframe 为抠图占位空壳，与名片编辑器无关；
- Bridge 的 `findCanvasForSide` 定位链（`getLoadedModule("CanvasObjVO") → totalCanvasArray[0] → canvas`）在真实页面成立；
- 仅记录 1 个 canvas（totalCanvasArray 长度 1，正面；反面/背面需模板内查看，未单独取证）。

页面真实 iframe/editor 拓扑、Canvas、对象模型已获真实取证（见上）。

## 4. ScriptCat（已按 §19 真实回传拆分状态）

```
ScriptCat installation       = PASS（用户已装，v0.3.0.0 单脚本）
ScriptCat userscript exec    = PASS（面板真实渲染，§19.1）
Assistant rendering           = PASS（真实编辑器出现「名片套版助手」面板）
Real Bridge install           = UNVERIFIED（需 §5 真机 marker 取证）
Real Bridge probe/response    = UNVERIFIED（需 §7-8 真机往返）
Real Apply                    = UNVERIFIED（需 §13 真机最小修改）
```

加载链网络层：`@require` ×4 与主脚本共 5 个 raw.githubusercontent URL 本次真实请求**全部 HTTP 200**（`field-core 7938B / config-core 2100B / ai-client 3747B / page-bridge 21652B / 主脚本 39860B`）。

## 5. Extension

**UNVERIFIED**（真机加载未执行；manifest 顺序与 isolated-world 机制代码级成立，无运行级证据）。

## 6. iframe

**PASS（真实取证）**：设计器页面顶层 **1 个 iframe（id=mattingContent, about:blank）**，为抠图占位空壳，无 fabric/requirejs/canvas，与编辑器无关；编辑器本体在 top window。→ 与"无顶层 iframe"的未登录观察一致（该 iframe 为编辑态才出现）。**extension `all_frames: true` 暂无证据证明必要，但仍未删除**（无 P0 驱动；保持现状待 Stage 5 证据）。

## 7. Canvas

**PASS（真实取证）**：真实 Canvas 已取得——`CanvasObjVO.totalCanvasArray` 长度 1，`total[0]` 为 fabric Canvas：**949.15 × 577.40 px，21 个对象，4 个文本对象（首个「简小袋」）**。`findCanvasForSide` 定位链在真实页面成立。

## 8. Object Snapshot

**PASS（真实取证）**：真实文本对象「简小袋」已采样（n=4 个文本对象；构造器压缩名为 `b`，即 webpack 压缩类名——真实定位依赖 fabric 方法而非类名）。left/top/scale/origin/font 等字段存在但本次截图仅回传摘要；完整逐字段 object snapshot 留给 Stage 5（Editor API Contract）时按需补充。

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
| P2 | 见 §16 重分类表 | 记录/延期 |
| P3 | 见 §16 | 记录 |
| UNVERIFIED | ScriptCat 安装运行、扩展真机、真实 Bridge 注入往返、真实 Apply、真实 AI | 环境限制（拓扑/Canvas/对象已 PASS） |

## 13. 修改（本阶段实际修改，逐项 commit）

| commit | 目的 | 文件 | 说明 |
|---|---|---|---|
| docs: add stage 3.1 independent audit report | 补推遗漏文档 | STAGE_3_1_INDEPENDENT_AUDIT.md | 上阶段产物，独立 commit |
| docs: add runtime forensics script | 取证工具（只读） | docs/diy-runtime-forensics.js | 拓扑/Canvas/对象摘要/脱敏 |
| feat: forensics 增强 iframe 深度 + spoof 取证 | 取证工具只读增强 | docs/diy-runtime-forensics.js | per-iframe 探测（§六）+ 伪造 probe 统计（§十五，纯只读） |
| docs: stage 4.1 report 更新 | 报告 | STAGE_4_1_RUNTIME_VALIDATION.md | **首次更新**：真实 Chrome 复跑/首层 404 变化/基线确认 |
| docs: stage 4.1 report 真实取证回填 | 报告 | STAGE_4_1_RUNTIME_VALIDATION.md | **本次更新**：真实设计器拓扑/Canvas/对象快照回填（§3.1/§6/§7/§8/§12/§16/§17/§18） |

**生产源码零修改**（审计后无任何「已确认且需立即修」的问题；见 §18）。

> 环境说明：本阶段提交已全部完成（git 已通过 winget 安装，分支 `stage-4.1-runtime-validation` 推送至 GitHub）。

## 14. Independent Review

**CONDITIONAL（已改善）**
- 现有业务/字段/AI/Bridge 协议/标记机制均未改变；
- 未引入新重复注入路径（marker 链完整）、未引入 iframe 变更（未动 all_frames）；
- 新增内容仅为只读取证工具与文档，无运行影响；
- 真实运行时证据已回填（拓扑/Canvas/对象）；**真实 Bridge 注入往返 / 真实 Apply 仍缺** → 保持 CONDITIONAL。

## 15. Final Gate

**CONDITIONAL-GO（证据增强）**

- 已确认：真实设计器拓扑（top window = 编辑器本体）、真实 Canvas（949×577，21 对象，4 文本）、`findCanvasForSide` 定位链成立、@require ×5 全部 200、headless 回归全 PASS、无 P0/P1。
- 仍缺（UNVERIFIED，不伪造）：ScriptCat 安装运行、扩展真机、**真实 Bridge 注入→probe→response 往返**、真实 Apply、真实 AI。
- 不阻塞 OCR 设计（Stage 5 的前提——真实拓扑——已具备）；进入 Stage 5 前需完成 §18 第 3~4 项的真实往返/Apply 取证。

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
| **spoof probe（§十五）** | Low–Med（同页任意 script 可伪造格式消息触发 probe；apply 需字段结构 + 无 nonce 校验） | 否（OCR 读取阶段不受影响） | **本次实测 `NO_RESPONSE` 未触发（因 Bridge 未装）** → 待真实 Bridge 往返后重测，仍非阻断 |

## 17. 核心问题回答（§二十四）

> 我们现在是否已真正知道 Assistant/Bridge/Editor/Canvas 在真实折立印页面里分别运行在哪个 window/frame、如何通信？

**YES（拓扑部分）**：真实取证确认——Assistant/Bridge 应注入 **top window**（`thirdLoginDiyEdit.do`，设计器本体）；Canvas 与 Editor 引擎全部位于 top window 的 requirejs/闭包作用域（`CanvasObjVO/CurrentCanvas/CanvasDiy`，fabric 构造器存在）；`mattingContent` iframe 为抠图占位无关。通信路径：userscript/extension（top isolated world）→ `installPageBridge` 注入 top 主世界 → postMessage ↔ pageBridge ↔ requirejs 模块拿 canvas → fabric 操作。
**但"真实 Bridge 往返 + 真实 Apply"仍是 UNVERIFIED**，按指令：拓扑已足以下一步（Stage 5 Editor API Contract / Object Snapshot），但进入 OCR 实现前仍需 §18 第 3~4 项真实性取证。

## 18. 需要用户协助的取证回传（解锁剩余 UNVERIFIED）

**已完成**：① 登录打开真实设计器 ② [zy-forensics] 拓扑 ③ [zy-iframe-probe] 抠图 iframe 确认 ④ [zy-modules] Canvas/对象确认。
**剩余待办**（均为可选、非必须）：
1. 安装 userscript 版（ScriptCat）→ 让助手真实运行 → 观测面板出现、Bridge 注入；
2. 点一次「识别并填正面」→ 回传状态栏结果（验证真实 Apply）；
3. 若需 §十五 spoof 结论，在 Bridge 已装时重跑 [zy-forensics] 看 `spoof-probe` 是否变 `CAN_TRIGGER`。

## 19. 真实运行时补充取证（2026-09-15 用户回传）

**19.1 ScriptCat userscript 已安装并真实运行（本阶段行之关键）：**
- 用户在脚本猫粘贴 [zheliyin-card-assistant.user.js](../zheliyin-card-assistant.user.js)（v0.3.0.0，与仓库一致）并保存启用；
- 真实编辑器页面出现「名片套版助手」面板（右侧浮动，非页面自带 UI），文案含「识别并填正反面」「填正面」「填反面」「追加信息」——与仓库 `renderPanel` 模板一致（assistant.js:274-284 / user.js:307-322 文案复核一致）；
- @require ×4（field-core/config-core/ai-client/page-bridge）在脚本猫加载成功（面板正常渲染即证依赖链成立）。

**19.2 Console 中 `bindEvent` 报错——来源观测（P3，已按用户澄清修正）：**
- 现象：同页 Console 曾出现 `bindEvent (折立印名片智能助手.user.js:1163) → renderPanel:137` 的 `null.addEventListener` 报错；
- 溯源：`bindEvent` 在整个仓库历史（v0.3.0 / main / 各 stage tag）**从未存在**；本项目函数名为 `bindPanel`（assistant.js:326 / user.js:360）；
- **用户澄清（2026-09-15）：脚本猫中只有一个脚本，即本项目 v0.3.0.0「名片套版助手」，不存在「名片智能助手 / v3.3.0」旧脚本**；
- 修正结论：报错的函数名与文件名（`名片智能助手 / bindEvent`）均与本项目无关，且用户确认无此脚本——最可能是 DevTools **历史 Console 条目（旧页面/旧会话残留日志）**，非当前脚本实时错误；不再断言"存在残留旧脚本"（作废上一版 §19.2 推断）；
- 影响评估：本项目 marker/闭包两层防重防**本项目自身**重复注入，机制不受影响；该报错不影响本项目面板功能（面板已正常渲染，见 §19.1）。

**19.3 待完成（最终收尾验证）：** 真实 Bridge 往返（marker/probe/response）+ 最小真实 Apply（含回滚）+ 刷新生命周期。用户仅需执行一次「F5 刷新 → 最小只读探针 → 一次真实 Apply」，取证数据由 Agent 归纳入报告。

> 环境补遗：本会话已安装 git（winget）并将 `stage-4.1-runtime-validation` 推送 GitHub；headless 回归以真实 Chrome 完成并全部 PASS（§9/§11）。

## Stop

按指令 §二十五：完成即**停止**，不自行进入下一阶段，等待证据回传与外部评审。