# STAGE_GATE_POLICY — 阶段门禁标准

> 维护者：AI-2（Repository Governance 线）
> 适用：本仓库所有阶段（Stage）的开启、验收与关闭。
> 配套：`docs/EVIDENCE_POLICY.md`（证据等级）、`docs/DEVELOPMENT_RULES.md`（提交纪律）

---

## 1. 四个结论词（互斥，必须选其一）

| 结论 | 含义 | 使用条件 |
|---|---|---|
| **`PASS`** | 所有核心验收条件**真实满足** | 每条 PASS 都有证据等级 + 证据文件 + commit |
| **`CONDITIONAL`**（含 `CONDITIONAL-GO`） | 部分核心条件满足，存在**明确登记的限制** | 每个未满足项都写明：堵点 / 替代方案及其等级 / 目标阶段 |
| **`BLOCKED`** | 核心目标**无法完成** | 写明堵点类型（见 §3）与已尝试次数；**不是失败，也不是未做** |
| **`DEFERRED`** | **主动**留待后续 | 写明原因 + 目标阶段 |

**禁止**：`基本完成`、`快好了`、`应该没问题`、`大概可用`、无等级标注的 PASS。
**禁止**：为了让门禁好看，把 `BLOCKED` / `CONDITIONAL` 改写成 `PASS`。

---

## 2. 一条不可逾越的规则

> ### `FIXTURE PASS` **永远不能**转成 `REAL PASS`，除非有真实证据。

| 情形 | 允许 | 禁止 |
|---|---|---|
| 用人为构造的候选跑通链路 | `BASIC_RECONSTRUCTION = PASS（FIXTURE_OCR）` | `REAL_OCR = PASS` |
| 用合成图验证坐标映射 | `IMAGE_MAPPING = PASS（SYNTHETIC）` | `REAL_IMAGE_INPUT = PASS` |
| 用 canvas mock 验证桥接 | `INTEGRATION = PASS` | `REAL_BRIDGE = PASS` |
| 用同源扩展替代 ScriptCat | `REAL_EXTENSION_SAME_SOURCE = PASS` | `REAL_SCRIPT_CAT = PASS` |

> 本项目实例（正确做法）：Stage 5.3 明确写 `Gate A OCR: REAL_OCR = BLOCKED(PANEL_ONLY) → 依 §八十 OCRAdapter(fixture)=PASS（诚实标注）`。
> 这条**同时标注 BLOCKED 与 FIXTURE PASS** 的写法，是本仓库的合格范例，应继续沿用。

---

## 3. `BLOCKED` 必须分型（本仓库实践）

不同型的 BLOCKED，工作量差一个数量级。**混为一谈会严重误判。**

| 分型 | 含义 | 典型解法 | 本项目实例 |
|---|---|---|---|
| `AUTOMATION` | 自动化手段受限；**真人操作可能可行** | 真机人工验证 | Playwright 粘贴图片注入不被受理（`REAL_USER_IMAGE_INPUT`） |
| `PRODUCT` / `BROWSER-ENV` | **产品运行环境本身**堵死，与自动化无关 | 工程改造 | `engine-in-editor`：CSP `script-src` 拦外链 + requirejs AMD 吸收 UMD → OCR 引擎无法在编辑器页暴露全局 |
| `PANEL-ONLY` | 能力存在，但结果值不对外暴露 | 需换路径或放弃原生能力 | 原生「文字识别(Alt+Q)」结果不可程序读取 |

> 判断口径：**若换成人类手动操作就能拿到结果 → `AUTOMATION`；否则 → `PRODUCT`。**

---

## 4. 阶段关闭机制

一个阶段可以**只用一个 commit**，也可以用多个。**commit 服务于可回滚与可审计，不服务于数量。**

关闭前必须齐备五要素（缺一项不得关闭）：

```text
[ ] code      —— 本阶段的实现（或明确"本阶段零代码变更"）
[ ] test      —— 覆盖本阶段目标的测试（UNIT / INTEGRATION / REAL，须标等级）
[ ] evidence  —— 可复现的证据产物（runner + report + commit 三件套）
[ ] review    —— 独立复审（逐项问答，不是自评列表）
[ ] status    —— 状态结论（PASS / CONDITIONAL / BLOCKED / DEFERRED）+ 停止点说明
```

**不要求**凑 commit 数量。一个精心组织的 commit 优于五个碎 commit。

---

## 5. 停止点（Stop Point）

每个阶段报告**必须**包含「停止点」——本阶段到哪为止、**不进入什么**。

历史上每个 Stage 5.x 报告都做到了，继续执行。示例：

```text
Stage 5.4 §9：停在「真实图片→真实 textbox→可编辑→编组→回滚」全链成立。
不进入完整设计稿重建 / SVG 矢量化 / 复杂艺术字。
```

**未获授权不得自启下一阶段。**

---

## 6. 与「用户可安装性」的关系（独立门禁）

**「GitHub 有源码」≠「用户能装上」≠「功能能用」。** 这是三个独立字段，不得互相替代：

| 字段 | 含义 | 判定方式 |
|---|---|---|
| `USER_INSTALLABLE` | 用户能装上 | 走通安装步骤，面板出现 |
| `USER_UPDATEABLE` | 用户能更新 | `@updateURL` 可达且指向正确分支；版本号递增 |
| `REAL_FEATURE_USABLE` | 功能真的能用 | **逐功能**判定，不看安装是否成功 |

**典型误判**：`USER_INSTALLABLE = PASS` 被当成 `REAL_FEATURE_USABLE = PASS`。
本项目实例：Demo 能装上（PASS），但图片识别不可用（`BLOCKED`）—— 两者同时成立。

> Stage 门禁里若涉及用户交付（Demo / Release），**必须同时给出这三个字段**。

---

## 7. 阶段报告的必备片段

```text
证据等级汇总
  REAL:        <项> = PASS / BLOCKED / …（证据文件路径）
  INTEGRATION: <项> = …
  UNIT:        <项> = PASS（套件名 + 断言数）
  SMOKE:       <项> = …
  FIXTURE:     <项> = PASS（必须写明"输入为 FIXTURE"）
  SYNTHETIC:   <项> = PASS（必须写明素材来源）
  BLOCKED:     <项> = BLOCKED（分型：AUTOMATION / PRODUCT / PANEL-ONLY + 已尝试次数 + 替代方案）
  DEFERRED:    <项>（原因 + 目标阶段）
  UNVERIFIED:  <项>（原因）
  PARTIAL:     <项>（成立部分 / 不成立部分）

Production Changes:  零行为变更 | <逐文件清单 + commit>
用户可安装性:        USER_INSTALLABLE = ? / USER_UPDATEABLE = ? / REAL_FEATURE_USABLE = ?
Gate:                PASS | CONDITIONAL | BLOCKED | DEFERRED
停止点:              <本阶段到哪为止，不进入什么>
```

---

## 8. 违规处理

| 违规 | 处理 |
|---|---|
| 无证据等级的 PASS | 结论作废；补等级后重发；历史作废结论保留并标「已作废」 |
| fixture 冒充 real | 结论作废；Gate 强制降为 `BLOCKED` 直至重做 |
| 为凑 Gate 改写结论 | 记 P0；不得进入下一阶段 |
| 生产代码因测试需求而改 | 回滚该改动；Gate 降级 |
| 无停止点的阶段报告 | 视为未完成，不得关闭阶段 |

---

## 9. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-09-16 | 初版：四结论词、fixture≠real 硬规则、BLOCKED 三分型、阶段关闭五要素、停止点、可安装性三字段 |
