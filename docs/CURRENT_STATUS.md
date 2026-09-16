# CURRENT_STATUS — 当前状态总览

> 维护者：AI-2（Repository Governance 线）
> 基线：分支 `stage-4.1-runtime-validation` @ `3becf04`（2026-09-16）
> **本页只陈述已有证据支持的状态。没有证据的一律写 `TODO`，不预判。**
> 状态取值：`PASS` / `PARTIAL` / `BLOCKED` / `TODO` / `DEFERRED` / `UNVERIFIED`
> 等级取值见 `docs/EVIDENCE_POLICY.md`

---

## 1. 能力状态一览（主表）

| 功能 | 状态 | 证据等级 | 证据出处 | 说明 |
|---|---|---|---|---|
| ScriptCat injection | **PASS** | REAL | `runtime/reports/runtime8-full-chain-report.json` | 真实 ScriptCat 扩展 + 真实编辑器，全链 18 步 `errors=0` |
| page bridge | **PASS** | REAL | `runtime/reports/verify-gm-bridge-report.json` | `GM_addElement` 注入生产 `page-bridge.js`（sha256 校验，未复制第二份），probe 1↔1 / 5↔5，跨实例重复 ×3 仍恰 1 |
| editor object audit | **PASS** | REAL | `runtime/reports/stage5-object-snapshot.json` `stage5-object-audit.json` | 21 对象 / 6 类型全量属性；`OBJECT_IDENTITY = VERIFIED`（textbox 层） |
| object matcher | **PASS** | UNIT + REAL | `runtime/reports/stage5-matcher.json` | 单测 22 断言；真实编辑器自匹配 4/4（score 0.807）；偏移 +180px → NOT_FOUND |
| image mapper | **PASS** | UNIT | `tests/editor-object-model/image-mapper.test.js` | scale 0.5/1/2 + rot45 AABB + 归一化往返 + 非法输入，10 断言 |
| fixture reconstruction | **PASS** | **FIXTURE** | `runtime/reports/stage5-3-reconstruction.json` `stage5-4-product-flow.json` | **输入为 FIXTURE_OCR**（bbox 来自合成图已知绘制坐标）；链路本身在真实编辑器执行 |
| native OCR access | **BLOCKED** | REAL（探测结论） | `runtime/reports/stage5-3-native-ocr*.json` `stage5-4-native-ocr.json` | 原生「文字识别(Alt+Q)」面板存在，但绑定"相框"素材交互；Stage 5.4 四种深度 hook 实验后：无网络请求、无 postMessage、canvas 无变化、结果值不进 DOM |
| real OCR | **TODO** | — | — | 依赖上游；Local OCR（tesseract.js）已评估但**未接入** → `DEFERRED → Stage 5.5` |
| real image input | **PARTIAL** | REAL / SYNTHETIC | `runtime/reports/stage5-3-image-transform.json` `stage5-4-real-image-input.json` | **真机**粘贴/拖拽可用；**harness 自动化**三种注入（ClipboardEvent / CDP+Ctrl+V / setInputFiles）均不被受理 → 记录为 automation limitation；`fabric.Image` 原创建为已验证回退（SYNTHETIC 600×400 图） |
| real editable textbox | **PASS** | REAL | `stage5-3-reconstruction.json` `stage5-4-product-flow.json` | 真实编辑器内创建 `type=textbox` / `editable=true` / `markuuid=null`（identity clean），4/4 |
| grouping | **PASS** | REAL | `runtime/reports/stage5-3-grouping.json` | `fabric.Group` 原生编组 → destroy 解组 → 成员独立 |
| rollback | **PASS** | REAL | `stage5-4-product-flow.json` `stage5-object-mutation.json` | 创建后清理 + reload → 21 对象 / 4 原文本 / 3 图，零残留；`setText` mutation diff 仅 `[text,height]`，restore 后 diff `[]` |
| product flow | **PASS** | REAL | `runtime/reports/stage5-product-smoke.json` `stage5-4-product-flow.json` | Stage 5.2 PRODUCT_SMOKE 11 步（用户 UI 路径）；Stage 5.4 REAL_PRODUCT_FLOW 全链 `errors=0` |
| font / fontSize | **PASS** | REAL | `runtime/reports/stage5-4-font-calibration.json` | 「思源黑体 Regular」实测存在于网页字体面板；校准公式 `fontSize = 0.829 × visualHeight`（short 单行），重建回读 **mean height error = 5.03%** |
| creation safety | **PASS** | REAL | `runtime/reports/stage5-creation-safety.json` | Stage 5.1 修复 P1 `CREATION_IDENTITY_LEAK`（`f301ba3`）后重跑 SAFE，零共享结构引用 |
| object identity | **PASS** | REAL | `runtime/reports/stage5-identity-matrix.json` | `markuuid` 跨 3 会话稳定（textbox 4/4 唯一）；`uuid` 会话级（12/12 互异） |
| reference image safety | **PASS** | REAL | `stage5-3-reconstruction.json` | 识别流程内保留原图（`images=4`） |
| legacy product chain | **PASS** | REAL | `stage5-product-smoke.json` | 面板 → 粘贴 → 识别 → apply 4 个 textbox → reload 恢复，无助手报错 |
| multi-template | **PARTIAL** | REAL（单样本） | `runtime/reports/stage5-multi-template.json` | 当前账号仅 1 个可达模板；差异型显式标 `UNKNOWN`，未推广 |
| real rotated text reconstruction | **TODO** | — | `stage5-1-final-gate.json` | 模板内无安全的旋转**文字**样本（有旋转 path 样本）→ `DEFERRED` |
| server-save persistence | **TODO** | — | — | 只验证了 reload stability，未验证服务端保存 → `DEFERRED` |
| full card reconstruction / SVG 矢量化 | **DEFERRED** | — | `docs/STAGE_5_4_OCR_ADAPTER_AUDIT.md` §9 | 明确停止点，未启动 |

---

## 2. 一个关键区分：**「验证通过」≠「已上生产」**

这是本仓库最容易误读的地方，单独列出。

| 模块 | 有单测 | 被 Stage 5 链使用 | **生产路径是否调用** |
|---|---|---|---|
| `extension/src/fields/field-core.js` | ✅ | — | ✅ **是**（`@require`） |
| `extension/src/core/config-core.js` | ✅ | — | ✅ **是** |
| `extension/src/ai/ai-client.js` | ✅ | — | ✅ **是** |
| `extension/src/editor/page-bridge.js` | ✅ | ✅ | ✅ **是** |
| `extension/src/editor/object-model.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/editor/object-adapter.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/editor/object-matcher.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/ocr-model.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/image-mapper.js` | ✅ | ✅ | ❌ 否（**未挂接**） |

> **含义**：Stage 5.x 的对象/OCR 能力**目前只存在于审计链（`runtime/stage5-*.js`）中**。用户在浏览器里正常使用助手时，走的是 legacy 产品链，**不会触发** OCR / matcher / mapper。
> 因此各阶段报告统一声明的「**零行为变更**」是成立的 —— 也正因如此，**不能把 Stage 5.x 的 PASS 理解为"产品已具备 OCR 能力"**。

---

## 3. Gate 现状

```text
分支:        stage-4.1-runtime-validation @ 3becf04
最后阶段:    Stage 5.4 (Native OCR Result Access + Real Image Input + Reconstruction Accuracy)
Gate:        CONDITIONAL-GO
P0:          0
P1:          0（Stage 5.1 的 CREATION_IDENTITY_LEAK 已修复并回归）
下一阶段:    Stage 5.5（Local / Native OCR provider 真实接入 + 真实用户图片验证）
             —— 已定义，未授权启动
```

**CONDITIONAL-GO 的条件项**（按 `docs/EVIDENCE_POLICY.md` §3，均为已登记项，非缺陷）：

| 条件 | 状态 | 目标 |
|---|---|---|
| Local OCR provider（tesseract.js）接入 | 已评估未接入（体积 ~20MB / 中文质量 / 集成成本） | Stage 5.5 决策点 |
| Native OCR 结果程序化读取 | BLOCKED（相框交互绑定） | 可行时优先复用 |
| OCR 来源为 fixture | 已明确标注 `FIXTURE_OCR` | Stage 5.5 换真实 provider |
| 多行文本字号反推 | DEFERRED（需行数估计） | Stage 5.5 |
| native 图片输入自动化 | PARTIAL（harness 限制） | 真机验证优先 |
| multi-template 证据 | PARTIAL（单模板） | 待样本 |

---

## 4. 两个分支的关系（**必读**）

| | `main` | `stage-4.1-runtime-validation` |
|---|---|---|
| HEAD | `7446faa` | `3becf04` |
| 最后阶段 | Stage 4.0 | **Stage 5.4** |
| 跟踪文件 | 44 | **173** |
| 关系 | 是后者的**严格祖先** | 领先 58 commit / 落后 0（**可快进合并**） |

> ⚠️ **GitHub 默认展示的是 `main`**，它**不包含**任何 Stage 5.x / RUNTIME-8.x / OCR / object-model 代码。
> 任何人从默认分支阅读本仓库，都会得到一个"只有 Stage 4.0"的错误印象。
> 这是当前仓库**最大的信息结构风险**，处置建议见 `docs/PARALLEL_DEVELOPMENT.md` §5。

---

## 5. 测试现状速览

| 层 | 套件 | 结果 | 执行方式 |
|---|---|---|---|
| UNIT | `tests/editor-object-model/` 6 套件 | **110 断言 ALL PASS**（2026-09-16 由治理线复跑确认） | `node tests/editor-object-model/run.js` |
| UNIT | `field-core` 43 / `config-core` 15 / `ai` 18 / `editor-bridge` 18 | PASS（历史报告） | headless 浏览器 |
| INTEGRATION | `bridge-lifecycle` 6/6 ×3 稳定；`wiring-check` 5/5 | PASS（历史报告） | headless 浏览器 |
| REAL | `npm run runtime:scriptcat` 全链 18 步 | PASS，`errors=0`（历史报告） | Playwright + 真实 ScriptCat |

明细与复现命令见 `docs/TEST_MATRIX.md`。

---

## 6. 维护规则

1. 本页**只写有证据的状态**。无证据 → `TODO`；有堵点 → `BLOCKED`；已登记推迟 → `DEFERRED`。
2. 每个 `PASS` 必须给出**证据等级**与**证据文件路径**。
3. 不得为让本表好看而改写 `BLOCKED` / `PARTIAL`。
4. 生产挂接状态变化时（§2 表），必须同步更新本页与 `README.md` 的 Current Status。
5. 更新本页不修改任何实现代码。
