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
| **real OCR（provider）** | **PASS** | REAL | `runtime/reports/stage5-5-ocr-feasibility.json` `stage5-5-real-ocr-demo.json` | **本地 tesseract.js 已接入并实测**：chi_sim，18 words / bbox 18/18 / avg-conf **90.4** / 首跑 ~3s / **零上传、零 key、全本地 WASM**。原生路径仍 BLOCKED，本地路径为已选定替代 |
| **real OCR → 重建（demo 级）** | **PASS** | REAL | `runtime/reports/stage5-5-final-gate.json` | `BASIC_REAL_OCR_DEMO = PASS`：真实 OCR 6 行候选 → mapper(1000×800 natural × 0.45) → matcher（**电话行 MATCHED 复用模板槽**，其余 NOT_FOUND 保护）→ 6 个真 textbox → 字号误差 **3.3%** → 参考图保留 → rollback 21/4/3 零残留，`errors=0` |
| real image input | **PARTIAL** | REAL / SYNTHETIC | `runtime/reports/stage5-3-image-transform.json` `stage5-4-real-image-input.json` | **真机**粘贴/拖拽可用；**harness 自动化**三种注入（ClipboardEvent / CDP+Ctrl+V / setInputFiles）均不被受理 → 记录为 automation limitation；另有 Stage 5.5 注记：编辑器页 CDN script 注入被环境静默拦截 → 生产改走 `GM_addElement`（机制已证，**待真机一键验证**） |
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
| `extension/src/ocr/ocr-provider.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/tesseract-loader.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/image-mapper.js` | ✅ | ✅ | ❌ 否（**未挂接**） |

> **含义**：Stage 5.x 的对象/OCR 能力**目前只存在于审计链（`runtime/stage5-*.js`）中**。用户在浏览器里正常使用助手时，走的是 legacy 产品链，**不会触发** OCR / matcher / mapper。
> 因此各阶段报告统一声明的「**零行为变更**」是成立的 —— 也正因如此，**不能把 Stage 5.x 的 PASS 理解为"产品已具备 OCR 能力"**。

---

## 3. Gate 现状

```text
分支:        stage-4.1-runtime-validation @ 4cb0819
最后阶段:    Stage 5.5 (Real OCR Provider + Basic Real OCR Demo)
Gate:        GO
P0:          0
P1:          0（Stage 5.1 的 CREATION_IDENTITY_LEAK 已修复并回归）
下一阶段:    Stage 5.6（字号精确）—— 前置：GM_addElement 引擎注入真机验证
已定序路线:  5.6 字号精确 → 5.7 颜色/粗细 → 5.8 旋转 → 5.9 多行/段落 → 5.10 复杂布局
             → 5.11 智能匹配 → 5.12 编组 → 5.13 Undo → 5.14 Preview
```

**Stage 5.5 遗留条件项**（按 `docs/EVIDENCE_POLICY.md` §3 如实登记）：

| 条件 | 状态 | 目标 |
|---|---|---|
| 引擎注入为 `GM_addElement` / side-page（非页面内直接注入） | 机制已证，**待真机一键验证** | Stage 5.6 前置 |
| 行聚合词序质量（tesseract 原生 lines 已优先，词序仍为已知弱项） | 已记录 | Stage 5.9 多行/段落 |
| 真实用户在网页内粘贴图片 | 待真机验证 | — |
| `ocr-provider.js` / `tesseract-loader.js` 未挂接生产 | 与 5.0–5.4 同 | 产品化阶段 |
| multi-template 证据 | `PARTIAL`（单模板） | 待样本 |

---

## 4. 两个分支的关系（**必读**）

| | `main` | `stage-4.1-runtime-validation` |
|---|---|---|
| HEAD | `7446faa` | `4cb0819` |
| 最后阶段 | Stage 4.0 | **Stage 5.5** |
| 跟踪文件 | 44 | **183** |
| 关系 | 是后者的**严格祖先** | 领先 64 commit / 落后 0（**可快进合并**） |

> ⚠️ **GitHub 默认展示的是 `main`**，它**不包含**任何 Stage 5.x / RUNTIME-8.x / OCR / object-model / ocr-provider 代码。
> 任何人从默认分支阅读本仓库，都会得到一个"只有 Stage 4.0"的错误印象。
> 这是当前仓库**最大的信息结构风险**，处置建议见 `docs/PARALLEL_DEVELOPMENT.md` §5。

---

## 5. 测试现状速览

| 层 | 套件 | 结果 | 执行方式 |
|---|---|---|---|
| UNIT | `tests/editor-object-model/` 8 套件 | **132 断言 ALL PASS**（2026-09-16 由治理线复跑确认） | `node tests/editor-object-model/run.js` |
| UNIT | `field-core` 43 / `config-core` 15 / `ai` 18 / `editor-bridge` 18 | PASS（2026-09-16 治理线复跑确认） | headless 浏览器 |
| INTEGRATION | `bridge-lifecycle` 6/6；`wiring-check` 5/5 | PASS（2026-09-16 治理线复跑确认） | headless 浏览器 |
| REAL | `npm run runtime:scriptcat` 全链 18 步 | PASS，`errors=0`（历史报告，治理线未复跑） | Playwright + 真实 ScriptCat |
| REAL | Stage 5.5 `BASIC_REAL_OCR_DEMO` | PASS，`errors=0`（历史报告，治理线未复跑） | Playwright + 真实编辑器 + tesseract |

明细与复现命令见 `docs/TEST_MATRIX.md`。

---

## 6. 维护规则

1. 本页**只写有证据的状态**。无证据 → `TODO`；有堵点 → `BLOCKED`；已登记推迟 → `DEFERRED`。
2. 每个 `PASS` 必须给出**证据等级**与**证据文件路径**。
3. 不得为让本表好看而改写 `BLOCKED` / `PARTIAL`。
4. 生产挂接状态变化时（§2 表），必须同步更新本页与 `README.md` 的 Current Status。
5. 更新本页不修改任何实现代码。
