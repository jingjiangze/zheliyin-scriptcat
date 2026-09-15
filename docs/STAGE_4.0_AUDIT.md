# STAGE_4.0_AUDIT.md — Bridge / Runtime Hardening 独立审计与加固

> 日期：2026-09-15 | 阶段：Stage 4.0（独立审计 + 最小加固）
> 纪律：先审计 → 实证 → 最小修复 → 回归 → Mutation → 逐项 commit → 放行判断。

## 1. 审计范围

Bridge 生命周期（跨实例）、ScriptCat/main-world/isolated-world、iframe、消息协议与安全边界、Editor 操作与幂等、AI Transport 安全复核、更新机制。目标：为 OCR 建立可靠 Runtime 基础，**不实现 OCR**。

## 2. 当前 HEAD

`0578132`（= Stage 3.2 提交链末端）。

## 3. Git 状态

- branch: main（remote）；工作区含本阶段拟改文件（未提交前逐项 commit）。
- tags：r0-audit / stage-1-{baseline,complete} / stage-2-{baseline,complete} / stage-3-{baseline,complete} / stage-3.1-complete / v0.3.0（Stage 3.2 未 tag）。
- 本阶段不 force push、不改历史。

## 4. 实际代码结构

```
userscript(assistant/UI/业务) @require ×4 → field/config/ai/page-bridge
page-bridge.js=页面侧 Editor 唯一实现（listener/paint/CRUD/probe），经 installPageBridge.toString() 注入 page 主世界
postMessage 协议：assistant→page(probe/apply) / page→assistant(probeResult/applyResult)
```

## 5. Stage 3.2 独立复核

- `fix: prevent duplicate pageBridge injection` 与 `bridge lifecycle 回归` 均已在 main（HEAD 上）(CONFIRMED)。
- 复核结论：**同一 userscript 生命周期内**防重成立（闭包标志），但**跨实例**防护缺失 → 触发本次 AUDIT-BRIDGE-002。

## 6. Bridge 生命周期审计

| 状态 | 允许 | 预期 | 实际 | 证据 |
|---|---|---|---|---|
| install ×1 | 是 | listener=1 | 1 | t1 PASS |
| install ×5（同实例） | 是（幂等） | 1 | 1 | t2 PASS |
| render/minimize ×4 | 是（幂等） | 1 | 1 | t3 PASS |
| 二次等价注入（跨实例） | 否 | 1 | **修复前=2/更多** | t6 修复前 FAIL |
| 页面刷新 | 是（重建） | 1 | 1（window 重置） | 逻辑 + headless |
| 升级热切换（旧 bridge 共存） | 一次性窗口 | 1（理想） | 可能 2（旧版无 marker） | 记录 P3 兼容限制 |

## 7. 跨实例审计（AUDIT-BRIDGE-002, P1，已修复）

- 问题：`pageBridge` 无页面级幂等；`installPageBridge` 的闭包标志每个 userscript 实例独立 → 热更新/开发重复执行/多实例脚本管理器的第二个实例会再次注入 → 同 window 累积 listener → apply 被执行 N 次。
- 证据：新增 `t6 跨实例注入流程 ×2`，修复前 FAIL（c6=2，第二次注入注册了第 2 个 listener）。
- 修复：`pageBridge()` 内使用**页面主世界稳定 marker** `window.__ZY_CARD_ASSISTANT_BRIDGE__ = {installed:true, ts}`，同 window 只安装一次；listener 注册成功后才落 marker（异常可重试）。
- 回归：t6 PASS；Mutation（移除 marker）→ FAIL 2/6（t5/t6）→ 还原 ALL-PASS(6)。

## 8. ScriptCat runtime 审计

主世界注入路径（userscript world → script injection → page main world）代码级成立（headless probe 往返实证）；**真实 ScriptCat 安装运行 = UNVERIFIED**（无环境）。

## 9. iframe 审计

- `all_frames: true` 已启用；**真实页面 frame 拓扑（editor 所在 window）未经真机验证 = UNVERIFIED**。
- 代码层面：同 window 消息经 `event.source===window` 隔离；跨 frame 未做桥接（若编辑器在 iframe，需后续阶段针对性验证/适配——记录，不猜测修改 all_frames）。

## 10. message protocol 审计

| Message | Sender | Receiver | Payload | Response |
|---|---|---|---|---|
| probe | assistant | page | {} | probeResult{ok,href,canvases[]} |
| apply | assistant | page | {fields,side} | applyResult{ok,applied[]/message} |

- source 常量唯一；type 不冲突；无 requestId（串行模型，P2 预留）。
- 未知/source 不符消息被忽略（不崩溃）；空 payload 由 `fields || {}` 兜底。

## 11. Editor 审计

- Canvas 缺失 → 明确失败消息（wiring/editor 覆盖）；部分失败 → applyFields 跳过失败项、返回已应用清单（半更新状态**明确可观测**，无静默吞错）。
- 幂等：重复 apply 由 removeAssistantExtras 清理富余助手层，不无限新增（editor/editor e6 + lifecycle t4 覆盖）。
- inheritReferenceProps 黑名单复制（非白名单）：skipBox 已排除内部/缓存/事件；**P2**（未来可白名单化，本阶段不改）。
- 布局 heuristic：top 已钳制；超长换行/小画布 **P2 Future Editor Layout**（不阻塞现有套版）。

## 12. AI Transport 安全复核

- `@connect *` + 可自定义 endpoint（P2）：用户可将 baseUrl 指向任意 host → API Key 会随 Authorization 头发往该 host。**保持自定义能力**（产品需求），记录为 P2：若未来需要可增加「自定义 endpoint 需显式确认」提示。
- zyAi 错误对象与错误文案已脱敏（不含 Key/Authorization）。

## 13. 测试真实性审计

- 全部断言可失败（Mutation 实证 multiple）；无 skip/only/todo/真假恒真；fixture 为独立合成数据，非复制生产实现；黑盒响应计数 + 就绪探针（ENV-FAIL 区分环境时序）。

## 14. Mutation Test

- Mutation A（移除 marker guard+赋值）→ lifecycle FAIL 2/6（t5/t6）→ 还原后再 ALL-PASS(6)（CONFIRMED）。

## 15. 问题清单（修复前）

| ID | Severity | 状态 | 说明 |
|---|---|---|---|
| AUDIT-BRIDGE-002 | P1 | FIXED | 跨实例重复注入（页级幂等 marker） |
| AUDIT-SEC-001 | P2 | 记录不改 | 同 window 伪造消息；origin 校验为同源 no-op，nonce 收益/成本不匹配当前风险（页面已被攻陷则无秘密可保）；保留 event.source 校验 |
| AUDIT-AI-001 | P2 | 记录不改 | @connect * + 自定义 endpoint 的 Key 外发面 |
| AUDIT-RELEASE-001 | P2 | 记录不改 | @updateURL 指向 main 分支（既有 RELEASE-RISK） |
| AUDIT-EDITOR-001 | P2 | 记录不改 | inheritReferenceProps 黑名单复制；~layout heuristic 越界 |
| AUDIT-PROTOCOL-001 | P2 | 记录不改 | 无 requestId（串行无需，OCR 阶段预留） |
| AUDIT-IFRAME-001 | P2 | UNVERIFIED | 真实 frame 拓扑未测 |

## 16. 修复清单（本阶段实际修改）

仅 `extension/src/editor/page-bridge.js`：页级幂等 marker（guard + 安装成功落标 + 注释）。无其它生产改动。

## 17. Git commit 清单（本阶段）

```
fix: make pageBridge idempotent across userscript instances (AUDIT-BRIDGE-002)
test: add cross-instance idempotency regression + update mechanism semantics
docs: add stage 4.0 audit report
docs: record stage 4.0 in changelog / test report
```

## 18. 回归测试结果（headless）

- bridge-lifecycle：**ALL-PASS 6/6 ×3 稳定**（含跨实例 t6）+ Mutation FAIL 验证
- wiring 5/5；field 43/43；config 15/15；AI 18/18；editor 18/18（全部 PASS）

## 19. 未验证项（UNVERIFIED）

ScriptCat 真实安装运行、扩展真机（isolated world）、真实设计器画布 apply、iframe/top 拓扑、真实 AI、rotation/图片层。

## 20. 最终放行

**CONDITIONAL-GO**

- P0 = 0
- P1 = 0（AUDIT-BRIDGE-002 已修复并经跨实例回归 + Mutation 验证）
- P2 = 5（见 §15 记录项，且不阻塞下一阶段基础；其中真机相关 UNVERIFIED 明确列出）
- FULL-GO 需要「真实 ScriptCat runtime 已验证 + 关键 iframe 行为已验证」，当前环境不可得 → 不满足。

## 21. 下一阶段建议

真机三连验证（ScriptCat/扩展/设计器画布）→ 确认 iframe/editor 实际拓扑后，再进入 Editor API Contract / Object Snapshot；OCR 接入边界设计随后。P2 项按需单独立项（nonce 仅当出现真实跨 window 威胁；自定义 endpoint 提示仅当用户要求）。