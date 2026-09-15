# Stage 3.2 Repair + Re-Audit

> 日期：2026-09-15 | 阶段：Stage 3.2（Bridge Runtime Repair + Independent Re-Audit + Stage 4 Gate）
> 本报告不覆盖 `STAGE_3_1_INDEPENDENT_AUDIT.md`（保留原样）。

## 1. Scope

针对 Stage 3.1 独立审计确认的 **P1 AUDIT-BRIDGE-001（Bridge 重复注入→多 listener）** 做最小修复；新增重复安装/重复 apply 回归；重新独立复验；给出 Stage 4 Gate。**不重写、不重构、不实现 OCR/Unified Object。**

## 2. Baseline

- 修复前 HEAD：`4fac975`（stage-3.1-complete）；本地工作区含本阶段拟改文件（未提交）。
- 触发路径（CONFIRMED）：`#zy-min-btn` → `renderPanel()` → `installPageBridge()`（其 DOM-id guard 因 `script.remove()` 永远失效）→ 再次注入/再注册 listener。

## 3. Stage 3.1 Findings（保持原审计结论）

BLOCKED / NO-GO；根因与触发路径同审计报告 §20/§30，此处不重复。

## 4. Root Cause

`installPageBridge` 用 `document.getElementById("zy-card-assistant-page-bridge")` 判重，但注入后立即 `script.remove()` → id 恒不存在 → 防护失效；`renderPanel` 可被 minimize 等路径多次调用 → listener 累积。

## 5. Repair（最小 diff）

`zheliyin-card-assistant.user.js` 仅两处：
1. IIFE 顶层新增 `let pageBridgeInstalled = false;`（同一次脚本运行内只注入一次；新加载重置由脚本生命周期天然保证）。
2. `installPageBridge` 改为：`if (pageBridgeInstalled) return;` + `try { appendChild; pageBridgeInstalled = true; } catch { pageBridgeInstalled = false; }`（失败允许重试）+ 保留 `script.remove()`。
3. `__ZY_DEBUG__`（仅 `?zydebug` 时启用）新增导出 `installPageBridge` 供回归调用。
4. `extension/assistant.js` 重新生成同步。
未改：manifest / field / config / ai / editor 逻辑 / UI / 协议 / 标签 / postMessage targetOrigin。

## 6. Production Diff

| 文件 | 分类 | 是否修改 | 风险 |
|---|---|---|---|
| zheliyin-card-assistant.user.js | PRODUCTION | ✓（~12 行） | 低（生命周期防重，行为=更少的重复执行） |
| extension/assistant.js | GENERATED | ✓（同步） | 低 |
| tests/bridge-lifecycle.{html,test.js} | TEST | 新增 | 低 |
| 其余生产文件（manifest/src/*/gm-shim） | PRODUCTION | ✗ | — |

## 7. Regression Tests

全量复跑：field 43/43、config 15/15、AI 18/18、editor 18/18、wiring 5/5 —— 全部 PASS（headless，证据见 TEST_REPORT 运行记录）。

## 8. Duplicate Install Test

`attemptReceive` 黑盒计数：send probe → 统计 probeResult 数。
- t1 基线：恰 1（PASS）
- t2 `installPageBridge()`×5：仍恰 1（PASS）——生命周期幂等
- t3 `minimize` 收起/展开×4（真实 UI 路径）：仍恰 1 ×3 次（PASS）

## 9. Duplicate Apply Test

- t4 `installPageBridge()`×3 + `minimize`×2 后，一次 apply → **恰 1 个 applyResult**（PASS）—— 单 listener → apply 只执行一次（此前多 listener 缺陷的直接后果被消除）。

## 10. Mutation Test

- Mutation A（临时移除 guard 后重新生成并跑）：**FAIL 4/5** → 证明回归测试对「防重失效」真实敏感（测试有效，非恒真）。
- Mutation B/C 由既有 wiring（probe 往返）/editor（apply 结果）套件覆盖其敏感性（headless 下链路真实执行）。
- 临时 Mutation 已还原，RESTORE 复跑 ALL-PASS (5)。

## 11. Bridge Protocol Audit

probe/apply/probeResult/applyResult 双向 source+type 常量唯一；无 requestId（串行模型，尊重原审计）；响应错配风险在单 listener 下归零。

## 12. postMessage Security

- 生产 targetOrigin 均为 `location.origin`（未改）；`"*"` 仅存在于测试 harness（file:// 适配）。
- Re-scanned：无新增 `"*"` 进入生产；event.source===window 校验保留。

## 13. Realm Analysis

修复用「assistant 运行 realm（content/脚本 realm）内的闭包标志」判重 —— 与注入所发生的 page realm 解耦；同一脚本运行内只注入一次，不依赖跨 realm 读写 window 属性（避免 §九 所述 content 标 page 读不到的陷阱）。ScriptCat 真机 realm 依旧 UNVERIFIED。

## 14. ScriptCat Gap

ScriptCat 安装运行、扩展 isolated world 真机加载：**UNVERIFIED**（环境不可得）。headless 普通页面与 ScriptCat 拼接 realm 的顺序一致性为代码级依据，非运行级证据。

## 15. Test Count Verification

lifecycle 5 项断言（t1–t5）来源清晰（5 个 case_）；全量计数与报告一致（43/15/18/18/5 各含 1 定义行 = 44/16/19/19/6 的 grep 计数，无虚报）。

## 16. Test Effectiveness

- 断言可失败（Mutation A 实证 FAIL）；
- 黑盒观察输出（响应计数）而非内部变量（无新增测试专用生产字段）；
- 就绪探针区分「环境时序」与「真实回归」（ENV-FAIL 单独标记，非静默 PASS）；
- 机制测试（t5）与生命周期测试（t2–t4）分层次，语义明确。

## 17. False Positive Review

修复前的 lifecycle 全 0 系测试时序竞态（assistant 在 DOMContentLoaded 注入而测试未等待）与 headless 对纯定时窗口不敏感所致——均已修正（150ms 就绪 + 收到即驱动 + 超时兜底），非生产问题。无测试放宽掩盖（计数语义保持“恰 1”）。

## 18. New Findings

- 无新增 P0/P1。
- 测试运行时注意点：headless 下建议以「就绪探针+resolve-once+超时兜底」模式编写桥接类断言（记录为测试经验，非缺陷）。

## 19. Remaining Risks

| 风险 | 级别 | 状态 |
|---|---|---|
| ScriptCat / isolated world 真机 | P2 | UNVERIFIED（环境限制） |
| 未校验 event.origin（AUDIT-SECURITY-001） | P2 | POSSIBLE；同源单 window 架构下 event.origin==location.origin，源校验已够；跨 window/iframe 后续阶段处理 |
| @require 依赖 main 分支（RELEASE-RISK） | P2 | 保留技术债 |
| page-bridge 业务耦合（EDITOR-RISK-001） | P2 | 保留技术债（Stage 4 设计时评估） |

## 20. Unverified Items

ScriptCat 真机、Chrome 扩展真机（isolated world）、真实设计器画布 apply、真实 AI、rotation/图片层枚举。

## 21. Required Follow-up

（均非本阶段阻塞）
1. 真机三连验证（ScriptCat/扩展/画布）——解锁 UNVERIFIED 项。
2. event.origin 强化与 iframe 场景策略（随 Editor API 阶段）。
3. 测试自动化（CI/Node）与 @require 版本锁定（RELEASE-RISK）。

## 22. Stage 4 Gate

**CONDITIONAL-GO**

依据：P0=0、P1=0；Bridge 重复注入已修复且重复安装/重复 apply 回归 PASS + Mutation A 有效 + 全量五套 PASS + 生产 targetOrigin=location.origin + bridge 唯一。条件：ScriptCat/扩展/设计器**真机三连验证**完成后方可进入 Stage 4 实现阶段；Stage 4 范围仍须按 Editor API Contract → Object Snapshot → Selection/Identity → OCR 接入边界设计 的顺序推进，不直接堆 OCR。

## 23. Final Verdict

**PASS WITH TECHNICAL DEBT**

（Stage 3.1 的 BLOCKED 因 P1 已修复并回归验证而解除；P2 技术债按 §21 记录。）

## Change Ledger

| 文件 | 修改 | 原因 | 是否生产 |
|---|---|---|---|
| zheliyin-card-assistant.user.js | ~12 行（标志+try/catch guard+导出） | duplicate bridge fix (AUDIT-BRIDGE-001) | YES |
| extension/assistant.js | 重新生成 | sync generated artifact | YES(generated) |
| tests/bridge-lifecycle.html | 新增 | regression harness | NO |
| tests/bridge-lifecycle.test.js | 新增 | regression asserts (t1–t5) | NO |
| STAGE_3_2_REPAIR_AND_REAUDIT.md | 新增 | report | NO |
未修改任何其它生产文件；未改既有测试断言；未删审计报告。

## Stop

按指令 §45：完成修复→回归→Mutation→diff→协议→安全→Gate→报告 后**停止**；不自行 commit/push/tag。是否提交由项目负责人决定。