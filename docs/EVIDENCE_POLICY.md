# EVIDENCE_POLICY — 证据等级规范

> 维护者：AI-2（Repository Governance 线）
> 适用：此后**所有** Stage 报告、Runtime 报告、审计结论、commit message 的 PASS/FAIL 表述。
> 目的：让「PASS」永远有确定含义，让 `fixture` 永远不能冒充 `real`。

---

## 0. 一条铁律

> **PASS 只能表示「在声明的证据等级下，声明的范围被验证通过」。**
> 不允许出现没有等级的 PASS、不允许用低等级证据描述高等级结论。

反例（本项目历史上**没有**出现，但必须永久禁止）：

```text
✗ OCR = PASS                             # 缺等级：fixture？real？provider？
✗ Stage 5.3 Reconstruction PASS          # 未说明 OCR 来源是 fixture
✗ Native OCR 可用                        # 实测为 BLOCKED
```

正例：

```text
✓ BASIC_RECONSTRUCTION = PASS（FIXTURE_OCR → mapper → matcher → native textbox）
✓ NATIVE_OCR_RESULT_ACCESS = BLOCKED（面板仅人工交互，结果值不可程序读取）
✓ REAL_SCRIPT_CAT_FULL = PASS（REAL：真实 ScriptCat + 真实编辑器 18 步 errors=0）
```

---

## 1. 八个标准等级

### REAL

**定义**：真实网页 + 真实对象 + 真实输入。所有要素均来自生产环境，无 mock、无注入替身。

**本仓库的 REAL 判定要求**：
- 真实浏览器（非 mock）+ 真实登录态编辑器页面（`diy.zheliyin.com`）
- 真实 fabric.Canvas 对象（非 canvas mock）
- 真实 ScriptCat 或同源 MV3 扩展作为注入载体
- 若使用「同源扩展」替代 ScriptCat，必须显式标注为 `REAL_EXTENSION_SAME_SOURCE`，**不得写成 REAL_SCRIPT_CAT**

**已知 REAL 项**：`runtime/reports/runtime8-full-chain-report.json` 全链 18 步；Stage 5.0 对象快照（21 对象全量属性）；Stage 5.3/5.4 真实编辑器 textbox 创建与回滚。

### FIXTURE

**定义**：人为构造的输入。真实链路照跑，但**输入不是真的**。

**本仓库的 FIXTURE 场景**：
- `OCRCandidate` 的 `text/bbox` 由脚本按已知绘制坐标直接给出（而非 OCR 引擎产出）→ 必须标 `FIXTURE_OCR`
- 编辑器对象夹具 `tests/fixtures/editor-object-textbox.json`、`editor-objects-52.json`（真实对象脱敏后固化为夹具）
- 文本夹具 `tests/fixtures/*.txt`（合成的公开示例文本）

**强制要求**：任何使用 fixture 作为 OCR 来源的报告，标题与 Gate 行必须写明 `FIXTURE_OCR`。撰写者不得因为"链路其余部分都是真的"而省略该标注。

### SYNTHETIC

**定义**：脚本**生成**的测试素材（图片、文本、几何数据）。

与 FIXTURE 的区别：FIXTURE 侧重"输入数据是造的"，SYNTHETIC 侧重"素材本体是程序画出来的"。

**本仓库的 SYNTHETIC 场景**：`tests/fixtures/ocr/test-card.png`（600×400 合成名片图，4 行文字）、Stage 5.3 在真实编辑器内绘制该图并作为 `fabric.Image` 引入。

> SYNTHETIC **不是缺陷**，它是 `REAL_IMAGE_INPUT` 受限时的合规替代；但必须同时标注 `REAL_IMAGE_INPUT = PARTIAL`。

### SMOKE

**定义**：只验证主链路能否走通，不覆盖分支/边界/失败路径。

**本仓库**：`runtime/check.js`（`npm run runtime:check`，无登录态冒烟）、`runtime/full.js`（冒烟全链，编辑态项标 BLOCKED）、`runtime/stage5-product-smoke.js`（11 步用户路径）。

**门槛**：SMOKE PASS **不能**作为阶段 Gate 的唯一依据；必须有 UNIT 或 INTEGRATION 补足。

### UNIT

**定义**：单模块，无浏览器、无网络、无 DOM/fabric。

**本仓库**：
- Node 直跑：`tests/editor-object-model/*.test.js`（6 套件，110 断言）
- headless 浏览器：`tests/field-core.test.js`(43)、`config-core.test.js`(15)、`ai.test.js`(18)、`editor-bridge.test.js`(18，canvas mock)、`bridge-lifecycle.test.js`(6)

### INTEGRATION

**定义**：多个真实模块组合，或模块与真实宿主边界组合。

**本仓库**：`extension/wiring-check.html`（生产入口接线 5/5：模块解析 → 桥接注入 → 真实 probe/apply 往返 → 失败不吞 → 实现唯一）、`tests/ai.test.js` 的业务级 fallback 断言、`runtime/runtime8-full-chain.js`（跨 5 层）。

### BLOCKED

**定义**：真实环境中**无法获得**必要信息；不是失败，也不是未做，而是"路径被环境堵死"。

**使用要求**：必须写明**堵点**与**已尝试的探测次数**，并在同段给出替代方案及其等级。

**本仓库当前 BLOCKED 项**：
- `NATIVE_OCR_RESULT_ACCESS`：折立印原生「文字识别(Alt+Q)」面板存在，但识别结果值不进入 DOM/网络/`postMessage`，必须人工与"相框"素材交互（Stage 5.3 探针 + Stage 5.4 四种深度 hook 实验后确认）
- `REAL_BRIDGE_INJECTION`（Stage 4.1 时期）：当时环境无 ScriptCat → 已于 `RUNTIME-8.3` **解锁为 REAL**
- 编辑器内真实「粘贴/拖拽图片」的自动化注入（Stage 5.4 三种注入方式均不被受理）→ 标 `PARTIAL` 并在真机侧视为可用

### DEFERRED

**定义**：已明确推迟，并说明推迟理由与目标阶段。

**使用要求**：每条 DEFERRED 必须写 `原因 + 目标阶段`，否则视为未处理的遗漏。

**本仓库当前 DEFERRED 项**（Example）：
- Local OCR provider（tesseract.js）接入 → 体积/中文质量/集成评估 → Stage 5.5
- 多行文本字号反推（需行数估计）→ 5.5
- 原生 OCR 相框交互深度适配 → 可行时复用
- 真实旋转图片重建（模板内无安全样本）→ 待样本
- multi-template 证据（当前仅 1 个可达模板）→ 待样本
- `inheritReferenceProps` 白名单化 → 需 ≥2 模板
- server-save persistence（当前只验证 reload stability）→ 待权限/流程
- 本地 OCR / 真实用户图片验证 → 5.5

---

## 2. 与仓库既有术语的映射（统一口径）

仓库历史文档使用过若干近义术语。**历史文档不删改**，新文档一律使用 §1 的八个标准等级。映射如下：

| 历史术语 | 出处 | 归入 | 说明 |
|---|---|---|---|
| `STATIC` | `EDITOR_OBJECT_NOTES.md` §6 | UNIT | 代码静态确认 |
| `HEADLESS` | `EDITOR_OBJECT_NOTES.md` §6 | UNIT / INTEGRATION | 无头浏览器（canvas mock）确认 |
| `REAL_PAGE` | `EDITOR_OBJECT_NOTES.md` §6 | REAL | 真机确认 |
| `UNVERIFIED` | `TEST_PLAN.md` / 各 Stage 报告 | **保留**（作第 9 个辅助标记） | 尚未执行；不得写作 FAIL，也不得当作 PASS |
| `PARTIAL` | Stage 4.1 / 5.1 / 5.4 | **保留**（作第 10 个辅助标记） | 部分成立；必须写明"哪部分成立、哪部分不成立" |
| `REAL_EDITOR` / `REAL_CANVAS` / `REAL_BRIDGE` / `REAL_APPLY` | RUNTIME 报告 | REAL（带层级后缀） | 建议保留后缀写法，信息量更高 |
| `REAL_SCRIPT_CAT` | `REAL_RUNTIME_GUIDE.md` | REAL | **仅**在真实 ScriptCat 管理器完成注入时可标 |
| `REAL_EXTENSION_SAME_SOURCE` | `REAL_RUNTIME_GUIDE.md` | REAL（载体降级） | 同源码 MV3 扩展作为载体；不得写成 REAL_SCRIPT_CAT |
| `CONDITIONAL-GO` / `GO` / `NO-GO` | 各 Stage Final Gate | Gate 门（与证据等级正交） | 见 §3 |
| `DUP_SIM`（禁止） | `RUNTIME_HARNESS_AUDIT.md` | 禁止项 | 禁止复制一份实现当替身验证 |
| `SITE_RUNTIME_CHANGE` | `REAL_RUNTIME_GUIDE.md` | BLOCKED 的成因之一 | 站点行为变更导致取证失效 |

---

## 3. Gate 与证据等级正交

Gate（`GO` / `CONDITIONAL-GO` / `NO-GO`）判断"能否进入下一阶段"，**不**代表所有项都是 REAL。

| Gate | 含义 | 必要条件 |
|---|---|---|
| `GO` | 可进入下一阶段 | NO P0 / NO P1；所有 REAL 项有真实证据；所有非 REAL 项有明确等级标注 |
| `CONDITIONAL-GO` | 可进入，但带明确前置 | 存在 BLOCKED / PARTIAL / DEFERRED 项，且每项都有替代方案 + 目标阶段 |
| `NO-GO` | 不可进入 | 存在未解决 P0/P1，或存在无等级标注的 PASS |

> 规则：**CONDITIONAL-GO 是合法且有价值的结论**。为了让 Gate 好看而把 BLOCKED 改写成 PASS，是本仓库最严重的违规。

---

## 4. 报告模板（强制片段）

任何阶段报告的 Final Report 段落必须包含：

```text
证据等级汇总
  REAL:          <项> = PASS/FAIL（证据文件路径）
  INTEGRATION:   <项> = PASS/FAIL（执行方式）
  UNIT:          <项> = PASS/FAIL（套件名 + 断言数）
  SMOKE:         <项> = PASS/FAIL
  FIXTURE:       <项> = PASS（必须写明"输入为 FIXTURE"）
  SYNTHETIC:     <项> = PASS（必须写明素材来源）
  BLOCKED:       <项> = BLOCKED（堵点 + 已尝试次数 + 替代方案等级）
  DEFERRED:      <项>（原因 + 目标阶段）
  UNVERIFIED:    <项>（原因）
  PARTIAL:       <项>（成立部分 / 不成立部分）

Production Changes: 零行为变更 | <逐文件清单 + commit>
Gate: GO | CONDITIONAL-GO | NO-GO
```

---

## 5. 撰写者自检清单

提交任何 PASS 前，逐条回答：

1. 这个 PASS 属于八个等级中的哪一个？写下来了吗？
2. 如果是 FIXTURE，标题/Gate 行有没有写 `FIXTURE_OCR` / `FIXTURE`？
3. 如果是 SYNTHETIC，有没有同时声明对应的真实输入项为 `PARTIAL`？
4. 有没有把"同源扩展"写成 `REAL_SCRIPT_CAT`？
5. BLOCKED 项有没有写堵点、尝试次数、替代方案等级？
6. DEFERRED 项有没有写原因 + 目标阶段？
7. 有没有为了凑齐 Gate 而把 BLOCKED/PARTIAL 改写成 PASS？（若有 → 直接 NO-GO）
8. 生产代码有没有被测试需求污染？（若有 → 该 PASS 作废）

---

## 6. 违规处理

| 违规 | 处理 |
|---|---|
| 无等级标注的 PASS | 该结论作废；补等级后重发，历史作废结论保留不删并标注「已作废」 |
| fixture 充当 real | 该结论作废；Gate 强制降为 `NO-GO` 直至重做 |
| 为凑 Gate 改写结论 | 记 P0；不得进入下一阶段 |
| 生产代码因测试而改 | 回滚该改动；Gate 降级 |
| 敏感数据入库 | 见 `docs/SENSITIVE_DATA_AUDIT.md` 处置流程 |
