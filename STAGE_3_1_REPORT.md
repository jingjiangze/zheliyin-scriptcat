# Stage 3.1 Verification Report

> 日期：2026-09-15 | 阶段：Stage 3.1（Runtime Wiring 修复 + Stage 3 重新验收）

## 1. Stage Goal

证明「Source → page-bridge → userscript/extension → assistant → runtime」真正一致；修最小 wiring 问题；升级测试为生产入口检查；给 Final Verdict。**不进入 Stage 4 / Unified Object / OCR。**

## 2. Starting Commit

`eba5486`（stage-3-baseline，Stage 3 起点 tag 指向）。

## 3. Final Commit

本报告推送后的 main HEAD（见 §29）。

## 4. Current HEAD

`01f7bd6`（= stage-3-complete；Stage 3.1 修复前）。

## 5. Existing Stage 3 Tag

`stage-3-complete` → `01f7bd6`（**未移动、未覆盖**；按 §34/§60 保留，Stage 3.1 结束另建 `stage-3.1-complete`）。

## 6. Stage 3 Report vs Real Code（REPORT-VS-CODE，§32/§33）

| Stage 3 报告声称 | 实际代码 | 结论 |
|---|---|---|
| 一致性 PASS（6 文件 MATCH） | 复核：main==01f7bd6、6 文件 GitHub==本地 MD5 一致；tags 齐全 | 一致 |
| Editor 边界抽取 PASS（18/18） | `tests/editor-tests.html` 复跑 18/18 PASS | 一致 |
| 对象调查 13 项代码确认 | 已升级为证据分级（STATIC/HEADLESS/UNVERIFIED）；11 项 STATIC±HEADLESS、2 项 UNVERIFIED | 一致（更严） |
| 协议/标签未变 | `function pageBridge` 仅 page-bridge.js 一处；zyCreatedByAssistant/zyFieldKey 语义未变；协议表复核一致 | 一致 |
| wiring wired-ok（旧=仅 symbol） | 本阶段升级为生产入口检查后 5/5 PASS | 一致（已强化） |

## 7. Runtime Wiring Audit（§13/§42/§43）

运行一致性矩阵：

| 项目 | Source | Userscript | Extension | Test | 状态 |
|---|---|---|---|---|---|
| Field Core | ✓ field-core.js | ✓ @require#1 | ✓ manifest[1] | ✓ 43/43 | PASS |
| Config Core | ✓ config-core.js | ✓ @require#2 | ✓ manifest[2] | ✓ 15/15 | PASS |
| AI Client | ✓ ai-client.js | ✓ @require#3 | ✓ manifest[3] | ✓ 18/18 | PASS |
| Page Bridge | ✓ page-bridge.js | ✓ @require#4 | ✓ manifest[4] | ✓ editor 18/18 + wiring probe 往返 | PASS |
| Assistant | 由用户脚本主体生成 | ✓（userscript 本体） | ✓ manifest[5] | ✓ wiring w2/w3 | PASS |

## 8. Userscript Wiring（§6）

`@require` 4 行（field-core / config-core / ai-client / editor/page-bridge），位于 metadata；ScriptCat/Tampermonkey 按序拼接，assistant 主体在其后执行 → **assistant 运行前 pageBridge 必已定义**。

## 9. Extension Wiring（§7）

manifest content_scripts `js` 顺序 = gm-shim → field-core → config-core → ai-client → page-bridge → assistant（同一 isolated world 按序），pageBridge 先于 assistant 定义，依赖满足。

## 10. Assistant Wiring（§8/§9）

assistant.js 不含 inline pageBridge（`function pageBridge` 0 匹配）；`installPageBridge` 仅 `pageBridge.toString()` 引模块唯一实现注入页面；payload/postMessage 调用为 2 个业务发送点 + 1 个监听。

## 11. Page Bridge Source of Truth（§11/§10）

`extension/src/editor/page-bridge.js` 为**唯一**实现（grep：`function pageBridge` 仅 1 处；userscript/assistant 无定义、无 `const/let/var pageBridge` 副本）。toString 注入用的是已加载的唯一函数。

## 12. Duplicate Bridge Check（§10）

无重复：Source 1 份；generated（assistant）0 份；runtime 注入由唯一函数 toString 产生。无 legacy inline copy。

## 13. Editor Boundary Audit（§14/§16/§17）

- page-bridge.js = 现有 Editor 层（canvas 定位/文字层读写/匹配/克隆/清理/probe）。
- 耦合分类（§15）：A 当前必须存在（无）；B 可后续迁移（`buildItems`：fields→行文案 的键映射）；C 明显业务（`scoreObject` 内业务词启发式）。**本阶段只记录不拆**（§16：边界稳定，不建 5-6 个空壳模块）。
- 判定：page-bridge 介于「Editor 层」与「业务匹配」之间，`EDITOR-RISK-001`（P2，非阻塞）。

## 14. Direct Editor Access（§25）

- 业务路径：applyFieldsToPage / probeCanvas（2 处 postMessage，唯一出口）。
- 无 document.querySelector 触 canvas；UI/初始化/测试均不直接触碰编辑器内部对象。
- `DIRECT_EDITOR_ACCESS` 已收敛（与 Stage 3 结论一致）。

## 15. Bridge Protocol（§25–§27）

与 Stage 3 记录一致：apply/probe → applyResult/probeResult；source/type 兼容；无 requestId；当前串行、响应按 type 分流，无错配风险（`BRIDGE-RISK-001/002` 技术债保留）。错误分层：AI_ERROR（ai-client zyAi）已分离；BRIDGE_TIMEOUT 未实现（串行无需）→ NOT IMPLEMENTED（§25 诚实记录）。

## 16. Editor Capability Survey（§28）

`EDITOR_OBJECT_NOTES.md` 已升级证据级别：11 项 STATIC(±HEADLESS)、2 项 UNVERIFIED（rotation、图片层）。无静态推测冒充真机能力。

## 17. OCR Capability Readiness（§29/§30）

文字层读写（位置/宽高/字号/字体/颜色/粗细/斜体/行高/对齐/字距）STATIC+HEADLESS 成立，可承载后续 OCR 结果；rotation/图片层 需真机；坐标转换模块未实现（后续阶段）。**本阶段未实现 OCR。**

## 18. Tests（§36/§37/§50）

| 套件 | 结果 |
|---|---|
| field-core（Stage 1） | PASS 43/43 |
| config-core（Stage 2） | PASS 15/15 |
| ai（Stage 2） | PASS 18/18 |
| editor/bridge（Stage 3） | PASS 18/18 |
| wiring 生产入口（Stage 3.1 新增） | PASS 5/5 |

证据级别标注：以上均为 STATIC/HEADLESS；真实页面 = UNVERIFIED。

## 19. Real Page Verification

**UNVERIFIED**（无登录折立印环境；ScriptCat 真机未安装运行）。不为 headless PASS 贴 REAL 标签（§38/§39/§50）。

## 20. UNVERIFIED Items

ScriptCat 安装运行、扩展真机加载、设计器画布 apply、真实 AI、rotation/图片层枚举。

## 21. Risks（§52/§53）

- `EDITOR-RISK-001`（P2）：page-bridge 内 buildItems/scoreObject 业务耦合，非阻塞，属边界净化项。
- `CONSISTENCY-RISK-001`：无（本次全链路复核一致）。
- 新增风险：无。

## 22. Technical Debt（§54）

requestId/超时（BRIDGE-RISK-001/002，串行下无立即必要）、正式 Editor API、Unified Object、KEY-UI、rotation/图片层、坐标转换。均标注「为什么现在不做 / 什么条件下做」：进入多并发或 OCR 前无必要。

## 23. Architecture Diagram（§56，按真实代码）

```
Field Core ──┐
Config Core ─┼──> userscript(assistant) ──> installPageBridge(pageBridge.toString 注入)
AI Client  ──┘         │                         ↓
Editor (page-bridge.js)<────────── postMessage(apply/probe) ──> 页面画布(Zheliyin)
```

真实接线：所有业务逻辑在 assistant；页面侧唯一 Editor 实现为 page-bridge 模块；两者经兼容协议通信。

## 24. Changes Made（§35）

1. `extension/wiring-check.html`：由 symbol 检查升级为**生产入口检查**（模块可解析 → 桥接注入 → probe/apply 真实往返 → 失败不吞 → toString 唯一实现）；补 file:// origin 归一化（仅测试环境）。
2. `EDITOR_OBJECT_NOTES.md`：OCR 能力问卷加证据分级列。
3. `tests/TEST_REPORT.md`、`CHANGELOG.md`：记录 Stage 3.1。
4. 本报告。

**生产源码零修改**——审计确认接线自 Stage 3 起已一致，符合 §47 最小修改原则（不修无风险项）。

## 25. Why These Changes Were Minimal

wiring 唯一「问题」是 file:// 测试环境的 origin 投递，非生产缺陷；故只改测试、不给生产打补丁。源码不动 = 零回归面。

## 26. What Was Intentionally Not Changed

未移除 page-bridge 内业务耦合（§16）、未加 requestId、未建 Editor API、未实现 OCR/Unified Object/Key UI；未引入构建系统；未动旧 tag。

## 27. Stage 4 Readiness（§17/§18/§55）

- 业务逻辑/字段规范化/AI 请求/Editor 边界/Bridge/页面注入 六者归属已可一页说清（§23 图）。
- Editor 层可独立测试（editor 18/18），生产入口实证可注入（wiring probe 往返）。
- 建议条件：Stage 4 前完成真机三连验证（ScriptCat/扩展/画布）与 page-bridge 业务耦合净化提案。

## 28. Final Verdict

**PASS WITH TECHNICAL DEBT**

依据：生产入口一致（5/5）；Bridge 正确加载并可往返（wiring probe 实证）；全部测试 PASS；无高风险回归；非阻塞边界债务（EDITOR-RISK-001、BRIDGE-RISK-001/002、KEY-UI）按 §54 保留。真实页面/ScriptCat 仍 UNVERIFIED（不影响该判定，属环境限制而非缺陷）。

## 29. Commit History

```
（本阶段新增，推送后更新）
test: strengthen runtime wiring check to production-entry probe round-trip
docs: update editor object survey with evidence levels
docs: record stage 3.1 verification in test report / changelog
docs: add stage 3.1 verification report
最终 tag：stage-3.1-complete
```

## Stop

按 Stage 3.1 指令 §62：完成即**停止**，不进入 Stage 4，等待外部评审。