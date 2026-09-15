# Stage 3.1 Independent Audit

> 独立第三方验收（非开发方自证）。审计日期：2026-09-15
> 证据来源：GitHub API（tags/commits/blobs）、本地源码全文扫描、headless 实测复跑、临时 mutation harness（已清理，未入库）。

## 1. Audit Scope

验证 Stage 3.1 下列声明：HEAD/tag 对应、生产源码零修改、pageBridge 唯一、wiring/field/config/AI/editor 测试有效性、生产入口成立、无测试自证、无重复实现、Stage 4 放行条件。

## 2. Audit Rules

证据优先级：源码 > 实际运行结果 > 测试代码 > 测试报告 > AI 自述。禁止修改生产/测试代码；禁止 commit/push/tag；发现即记录。

## 3. Git Evidence

- `stage-3.1-complete` → `4fac975b9e0eddf114b3672d6bb6b405ccef4180`（CONFIRMED）
- `stage-3-complete` → `01f7bd654c0a1fa1b503bb547317486b43d4baf1`（CONFIRMED）
- `stage-3-baseline` → `eba548625a92224e6dd35a9067011854741ff6c3`（CONFIRMED）
- Stage 3.1 新增 commit 仅 5 个：ae919d4(test)、9df6217(doc)、8163c43(doc)、d438121(doc)、4fac975(doc) —— 与报告一致，无隐藏 commit。

## 4. Tag Evidence

三个 tag 均直接指向 commit（轻量 tag，由 API `git/ref/tags/*.object.sha` 实测）。旧 tag（stage-3-complete / -baseline / r0-audit / v0.3.0 / stage-1/2）未被移动或覆盖（CONFIRMED）。

## 5. Production Source Diff

`stage-3-complete..stage-3.1-complete` 逐个 blob 比对（contents API ?ref=），8 个生产文件 **全部 UNCHANGED**：
zheliyin-card-assistant.user.js / extension/assistant.js / extension/manifest.json / field-core / config-core（重试核验排除 SSL 假阳性）/ ai-client / page-bridge / gm-shim。
→ **「生产源码零修改」声明 CONFIRMED**。Stage 3.1 仅含 TEST/DOC 文件。

## 6. Stage 3.1 Claims

原文：HEAD=4fac975；tag=stage-3.1-complete；Final Verdict=PASS WITH TECHNICAL DEBT；zero source modified；wiring 5/5、field 43/43、config 15/15、AI 18/18、editor 18/18；pageBridge 唯一；Stage 3 report 与代码一致。

## 7. Claim vs Evidence Matrix

| Claim | Evidence Required | Found | Verdict |
|---|---|---|---|
| wiring 5/5 | 真实运行链（加载→注入→probe 往返） | headless 复跑 `wired-ok (5)`；probe/apply 往返为真（页面监听来自 toString 注入副本） | 成立（限同 realm 单 window） |
| pageBridge 唯一 | 源码扫描 | `function pageBridge` 仅 page-bridge.js:16；无 const/let/var 副本 | 成立 |
| editor 18/18 | 真实执行 | 复跑 ALL-PASS；`case_(` 计数 19=18+1 定义行 | 成立 |
| field 43 / config 15 / AI 18 | 真实执行 | 复跑 43/15/18 ALL-PASS；计数 44/16/19（各含 1 定义行） | 成立（数量无虚报） |
| source zero-modified | git diff/blobs | 8/8 UNCHANGED | 成立 |
| production wiring | @require + manifest | 4×@require 顺序正确；manifest js 6 项按序 | 成立（代码级） |

## 8. Runtime Wiring Audit

`assistant 启动 → installPageBridge → pageBridge.toString() → 页面脚本 → message listener → probe 往返` 在 headless 普通页面实测成立（w2/w3）。**但**：headless 为页面主 realm；扩展内容脚本的 isolated world 可解析性、ScriptCat 拼接 realm、iframe/跨 window 行为均未实测 → 限「同 realm 单 window 成立」。

## 9. Userscript Audit

@require 4 行（field/config/ai/page-bridge）位于 metadata；ScriptCat/TM 按序拼接；顺序满足依赖。raw.githubusercontent main 引用为 RELEASE-RISK（无版本锁定，main 变则用户行为变——技术债）。

## 10. Extension Audit

manifest content_scripts `js` = gm-shim, field-core, config-core, ai-client, page-bridge, assistant；同一 isolated world 按序执行；pageBridge 先于 assistant。`assistant` 引用的 pageBridge 与注入副本同源（toString）。**isolated world 真机加载未验证（UNVERIFIED）**。

## 11. Assistant Audit

assistant.js 无 `function pageBridge`；仅 `installPageBridge` 内 `pageBridge.toString()` 引用；postMessage 2 发送点 + 1 内容侧监听。无字符串拼接实现等隐藏副本（AST/文本双扫描）。

## 12. Page Bridge Audit

page-bridge.js 为编辑器唯一实现（findCanvas/getTextObjects/pickObject/scoreObject/buildItems/createTextObject/cleanup/probe 全在其内）；`pageBridge.toString()` 注入的即该函数本体（无 wrapper/transpile 差异，源文件即源码函数）。

## 13. Duplicate Implementation Audit

`function pageBridge` 1 处；`pickObject/scoreObject/buildItems/addEventListener("message"` 均只在 page-bridge.js 出现（页面侧）与 userscript/assistant 内容侧监听各 1 处（realm 不同，非重复）。无「名字不同逻辑重复」的桥接。→ 无重复实现（CONFIRMED）。

## 14. Bridge Protocol Audit

| Message | Sender | Receiver | Payload | Response |
|---|---|---|---|---|
| probe | assistant | page | {} | probeResult{ok,href,canvases[]} |
| apply | assistant | page | {fields,side} | applyResult{ok,applied[]/message} |
双向 source 常量唯一；type 不冲突；当前串行，无 requestId（BRIDGE-RISK-001/002 技术债，串行下无立即必要）。

## 15. Security Boundary Audit

- 生产路径 postMessage targetOrigin 均为 `location.origin`（userscript L828/833、page-bridge L49）；`"*"` **仅存在于测试 wiring-check.html**（CONFIRMED，未进入生产）。
- event.data.source 白名单过滤；未校验 event.origin（同源单 window 场景可接受；跨 window/iframe 需真机确认——AUDIT-SECURITY-001, POSSIBLE）。
- 测试/报告无真实 secret（Key 均占位 test-key）。

## 16. Test Validity Audit

- wiring-check 加载真实模块与 assistant，probe 往返由**注入副本的监听器**应答 → 非「文件存在」级别，真实执行了生产注入路径（§15/§24 通过）。
- **环境偏差（AUDIT-TEST-001, LIKELY）**：wiring/editor harness 在普通页面 main world 运行；扩展 content-script isolated world / ScriptCat realm 未覆盖 → 生产入口「隔离世界可解析」仍 UNVERIFIED。
- file:// 的 postMessage "*" 归一化属测试环境适配，不掩盖生产逻辑（同源真实站点 targetOrigin=origin 语义与测试一致；跨源差异未测）。

## 17. Mutation Analysis

- Mutation A（删 @require page-bridge）：w1 `typeof window.pageBridge` 会 FAIL → 测试有效（对 userscript 运行链敏感）。
- Mutation B（manifest 删 page-bridge）：isolated world 下 assistant 引用 pageBridge 将 ReferenceError → 生效但**无测试覆盖该失败形态**（headless 非 isolated）→ 对 extension 链为「盲区」。
- Mutation C（删 installPageBridge）：w2 将 TIMEOUT → 有效。
- Mutation D（pageBridge 不监听）：w2 TIMEOUT → 有效。
- Mutation E（probeResult 格式错）：w3 断言结构 → 有效。
- Mutation F（assistant 自造假 pageBridge）：w5 仅查 toString 内容，无法识别「等价伪造」→ **测试盲区（AUDIT-TEST-002, CONFIRMED 局限）**；双重定义在共享作用域会直接覆盖，wiring 不检测覆盖源。

## 18. Test Environment Analysis

Edge headless（win）；无 node_modules/cache 依赖（纯 HTML+静态文件）；运行时间与预算充足；断言即时同步 + 2s/0.8s 超时，无过长掩盖。ENV-RISK：无 Node 运行时、无 CI，测试非自动化门禁（人工执行）。

## 19. Race / Timing Analysis

- 顺序：assistant 同步执行 → renderPanel → installPageBridge（同步注入）→ DOMContentLoaded 后测试注册监听 → probe。listener 注册先于 probe 发送（w2 在 await DOMContentLoaded 之后）→ 无 false-negative。3 次复跑 wiring/5 套全 PASS → 未见 flaky。
- 跨「注入-监听」无竞态（注入同步完成）。反向时序（probe 早于 bridge）会正确 TIMEOUT（正确失败）。

## 20. Duplicate Injection Analysis —— 关键发现（CONFIRMED, P1）

**实测**：临时 harness（同 realms 真实 assistant + 第二次 pageBridge()）→ 一次 probe 收到 **2 个 probeResult**（dup:1:2）。
机理（源码确认）：`installPageBridge` guard 为 `document.getElementById("zy-card-assistant-page-bridge")`，但注入后立即 `script.remove()` → id 永不存在 → **guard 永远失效**；`renderPanel()`（由「收起/展开」minimize 按钮等路径再次调用，见 bindPanel #zy-min-btn → renderPanel）会再次 installPageBridge → 注册第 2 个 message listener。
影响：一次 apply 被 N 个 listener 各执行一次 → 填层/清理互相叠加，**生成重复图层或清理误删风险**；probe 收到 N 个响应，未来 requestId 前响应错配风险叠加。
→ `AUDIT-BRIDGE-001`（CONFIRMED, P1；此前各报告将此列为未核查领域，审计前无测试覆盖）。

## 21. Error Path Audit

- 无 canvas → applyResult ok:false「未找到…」（w4/editor e9 覆盖）。
- 空字段/字段为空 → applyFields 提前返回 ok:false（代码确认）。
- 未知 message type → listener 忽略（代码确认，不崩溃）。
- 错误传播链：page → applyResult → content listener setStatus 显示；无 `catch{}` 吞错路径（结构化 zyAi 供 UI 摘要）。→ 无明显吞错（CONFIRMED）。

## 22. Editor Boundary Audit

page-bridge.js 实际承担：桥接（listener/post）+ 编辑器操作（canvas 定位/文字层 CRUD/清理/probe）+ 业务匹配（buildItems/scoreObject 引用公司/电话/微信等字段词）。边界「模块化」成立，但「业务耦合净化」未发生 → 属 §96 允许的 P2（EDITOR-RISK-001）。

## 23. Business Coupling Audit

page-bridge.js 内出现业务词（company_cn/name/phones/addresses 等构建项）与启发式（scoreObject 的 电话/微信/公司）。分级：A 必要（填层需 label 文本）C 明显业务（匹配启发式）。**是否阻碍 OCR**：OCR 若直入 bridge 需先经 TextObject 归一化 → 建议 Stage 4 前仅在 adapter 层引入中间模型，不强拆（P2→潜在 P1 取决于 Stage 4 设计）。

## 24. Editor Object Evidence Audit

EDITOR_OBJECT_NOTES 证据分级核实（源码对照）：位置/宽高/字号/字体/颜色/粗细/斜体/行高/对齐/字距 读写**均真实存在于源码**（getReferenceStyle/createTextObject/setObjectText）→ STATIC+部分 HEADLESS；rotation / 图片层 → **UNVERIFIED（不得视为能力）**；无「CSS 当编辑器能力」的混用（字段均来自对象属性而非 DOM/CSS）。默认值未冒充能力（CONFIRMED）。

## 25. OCR Readiness Audit

文字层读/写/建/删：READY（STATIC+HEADLESS）。rotation/图片层：UNKNOWN。坐标转换：未实现。错误/并发：串行够用。→ OCR 第一阶段「读文字/建层」可承载；「原位置恢复」需真机补 rotation/图片层证据。

## 26. Stage 4 Readiness Matrix

| 能力 | 状态 | 证据 | Stage 4 必要性 |
|---|---|---|---|
| Editor read | PARTIAL | STATIC+HEADLESS | 高（先固化 contract） |
| Editor apply | PARTIAL | HEADLESS | 高 |
| Bridge | PARTIAL | 单 realm 可靠；重复注入 P1 | **先修 P1** |
| Object discovery | PARTIAL（text→READY；image→UNKNOWN） | 源码 | 中 |
| Geometry / Style | BLOCKED | 无实现、rotation UNVERIFIED | 低（Stage 5+） |
| Error boundary | READY 基础 | zyAi/applyResult | 中 |

## 27. Risks

- `AUDIT-BRIDGE-001`（CONFIRMED, P1）：重复注入→多 listener→一次 apply 多次执行。
- `AUDIT-TEST-001`（LIKELY, P2）：headless 非 isolated world；扩展/ ScriptCat realm 未覆盖。
- `AUDIT-TEST-002`（CONFIRMED, P2）："等价伪造 pageBridge" 双重定义无法被 wiring 识别（Mutation F 盲区）。
- `AUDIT-SECURITY-001`（POSSIBLE, P2）：未校验 event.origin；跨 window 需真机核验。
- `RELEASE-RISK`（P2）：@require 依赖 main 分支无版本锁定。

## 28. Technical Debt

requestId/超时（串行下可延后）；page-bridge 业务耦合（P2→视 Stage 4 设计定级）；KEY-UI；@require 版本锁定；event.origin 校验；测试自动化（CI）。

## 29. UNVERIFIED Items

ScriptCat 真机安装运行；Chrome 扩展真机（isolated world）；设计器真实画布 apply/清理；rotation/图片层枚举；iframe/跨 window 桥接；真实 AI 往返。

## 30. Required Fixes Before Stage 4

1. **P0 前置：修复重复注入**（AUDIT-BRIDGE-001）：`installPageBridge` 的 guard 改为稳定标志（模块级/闭包布尔，而非会被 remove 的 DOM id）；并新增回归：一次性注入、重复 installPageBridge 后 probe 仍只收到 1 个响应。
2. **P1：扩展 isolated world 加载验证**（真机或至少 content-script world harness）。
3. **P1：补「重复定义 pageBridge」检测**或明确不检测的替代防护（涉及现实风险低，可记录）。

## 31. Recommended Stage 4 Scope

先做「Editor API 最小契约」而非 Unified Object：基于 page-bridge 固化 `readCanvas/readTextObjects/apply/removeGenerated` 薄封装 + 重复注入修复回归 + object snapshot（text-only）→ 为 OCR 提供中间模型边界。Unified Object/OCR 留 Stage 5+。前提：AUDIT-BRIDGE-001 修复并验证+真机三连（ScriptCat/扩展/画布）。

## 32. Final Verdict

**BLOCKED**

依据（§97）：存在 **CONFIRMED P1 运行时缺陷**（重复注入→多 listener，用户可达路径为「收起/展开」面板后再次触发），且现有 wiring 测试未覆盖该真实生产路径；扩展 isolated world 与真机行为 UNVERIFIED。以上符合「Bridge 核心路径存在错误风险」的 BLOCKED 判据。
（原先的「PASS WITH TECHNICAL DEBT」判定在未发现该缺陷的前提下成立；独立审计以实测证据推翻该结论。）

**STAGE_4_GATE: NO-GO**（P1 未清零；修复后复验可转为 GO WITH CONDITIONS）。

### 十个必答问题

1. Runtime Wiring 是否真实成立？**部分**：同 realm 单 window 成立（probe 往返实测）；隔离世界/iframe 未验证。
2. userscript 生产入口成立？**成立（代码级）**：@require 4 行顺依赖；真机 UNVERIFIED。
3. extension 生产入口成立？**成立（代码级，manifest 按序）**；isolated world 真机 UNVERIFIED。
4. assistant 是否使用唯一 pageBridge？**是**（删除后无副本，toString 同源）。
5. wiring 5/5 是否具真实价值？**是（注入链路真实往返）**；但不覆盖重复注入/隔离世界（盲区已列）。
6. 是否存在测试自证？**未发现刻意自证**；但 wiring 仅证明自身所选路径（非生产全路径），报告对「生产入口成立」的措辞过强（AUDIT-TEST-001）。
7. pageBridge 是否足以作为 Editor Boundary？**模块化足以**；业务耦合（P2）不阻塞，OCR 中间模型需在 Stage 4 adapter 层引入。
8. OCR 所需 Editor 能力哪些已确认？**text 读写/建删/样式 11 项 STATIC+HEADLESS**；rotation/图片层 UNVERIFIED。
9. Stage 4 当前最大风险？**重复注入缺陷未修 + 隔离世界/真机未验证**（修复后降为「边界耦合与真机验证」）。
10. 是否应进入 Stage 4？**否（NO-GO）**：先修 AUDIT-BRIDGE-001（P1）并补齐 isolated world/真机三连，再放行设计评审。

## Audit Stop

独立审计结束，未修改任何生产/测试代码，未 commit/push/tag；临时 harness 已清理。下一步由修复阶段决定。