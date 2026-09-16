# PARALLEL_DEVELOPMENT — 并行开发边界与协作协议

> 维护者：AI-2（Repository Governance 线）
> 基线：`stage-4.1-runtime-validation` @ `4cb0819`（Stage 5.5，2026-09-16）
> 性质：**协作规范 + 事实记录**。本文件描述两条工作线的职责边界、共享面、汇合方式与冲突处置。

---

## 1. 两条工作线

| | **AI-1** | **AI-2** |
|---|---|---|
| 代号 | Demo implementation | Repository governance |
| 目标 | 让「真实图片 → OCR → 文字位置映射 → 可编辑 Textbox」真正跑通 | 让仓库在快速迭代下仍保有清晰历史、测试证据、接口契约、可维护结构 |
| 产出 | `extension/src/**` 实现、`runtime/stage5-*.js` 取证脚本、`runtime/reports/*.json` 证据 | `docs/**`、`README.md`、`CHANGELOG.md`、`.github/**`、测试组织、`.gitignore` |
| 写入范围 | 实现文件 | 文档与治理文件 |
| 阶段报告 | 各 `STAGE_*.md` / `docs/STAGE_5_x_*.md` 的**技术结论** | 索引类、规范类、契约类文档 |
| Gate 结论权 | 提供证据与 Gate 建议 | 校验证据等级是否合规、结论是否诚实 |

> 两条线**不是上下级**，是分工。AI-2 不替 AI-1 修实现，AI-1 不改 AI-2 的契约。

---

## 2. 文件所有权地图

### 2.1 AI-1 主责（AI-2 **不修改**）

```text
extension/src/ai/ai-client.js
extension/src/core/config-core.js
extension/src/editor/page-bridge.js
extension/src/editor/object-model.js
extension/src/editor/object-adapter.js
extension/src/editor/object-matcher.js
extension/src/ocr/ocr-model.js
extension/src/ocr/image-mapper.js
extension/assistant.js
extension/gm-shim.js
extension/manifest.json
zheliyin-card-assistant.user.js
runtime/**                （全部取证脚本与报告）
installer/**
```

### 2.2 AI-2 主责

```text
docs/**                   （治理类文档；*阶段技术审计文档* 仍归 AI-1）
README.md
CHANGELOG.md
.github/**
.gitignore
package.json              （仅在确有必要时：scripts / metadata）
tests/**                  （仅组织与登记；不修改测试逻辑）
```

### 2.3 边界说明（易混点）

| 文件 | 归谁 | 说明 |
|---|---|---|
| `docs/STAGE_5_x_*.md` | **AI-1** | 阶段技术审计，含真实实验数据；AI-2 不改内容，只在索引/契约文档中引用 |
| `docs/CURRENT_STATUS.md`、`STAGE_INDEX.md`、`EVIDENCE_POLICY.md`、`TEST_MATRIX.md`、`REAL_OCR_DEMO_CONTRACT.md`、`DEVELOPMENT_RULES.md`、`PARALLEL_DEVELOPMENT.md`、`SENSITIVE_DATA_AUDIT.md` | **AI-2** | 治理文档 |
| `tests/*.test.js` 内容 | **AI-1** | 测试逻辑；AI-2 只登记到 `TEST_MATRIX.md` |

---

## 3. 唯一共享面（四条）

两条线**只通过以下四个接口交互**。除此之外不得互相依赖内部实现。

| # | 共享面 | 定义位置 | 变更方式 |
|---|---|---|---|
| 1 | `OCRCandidate` 结构 | `docs/REAL_OCR_DEMO_CONTRACT.md` §3 | AI-1 提出 → AI-2 更新契约 |
| 2 | 坐标映射契约（四级坐标空间） | 同上 §4 | 同上 |
| 3 | Textbox 输出契约（type/editable/position/font/identity） | 同上 §5 | 同上 |
| 4 | 证据等级定义 | `docs/EVIDENCE_POLICY.md` §1 | AI-2 定义，双方遵守 |

**明确不共享**：正在修改的实现文件、内部私有函数签名、临时调试脚本。

> 共享面已包含契约草案要求的全部四项（`OCRCandidate` / 坐标映射 / Textbox 输出 / 证据定义），**无需新增共享项**。

---

## 4. 通过 Git commit 汇合

```text
AI-1:  feat/test/fix commit  ──┐
                               ├──→ 同一仓库，同一分支或各自分支，最终合并
AI-2:  docs/chore commit     ──┘
```

### 4.1 Commit 分离要求

- 一个逻辑任务一个 commit，**禁止**把两条线的改动混进同一个 commit。
- AI-2 的 commit 前缀固定使用 `docs:` / `chore:`；AI-1 使用 `feat:` / `test:` / `fix:` / `refactor:`。
- 通过 `git log --oneline --author` 或前缀即可区分来源。

### 4.2 本仓库实际做法（沿袭 AI-1 已有约定）

AI-1 已有约定（见各 Stage 报告 "Commits/Push" 段）：

```text
全部已 push origin/stage-4.1-runtime-validation（无 force/squash）
各步独立 commit
```

AI-2 沿袭同一约定：**独立 commit + 不 force + 不 squash**。

---

## 5. ⚠️ 当前最重要的结构风险：默认分支落后

这是本次治理发现的**最高优先级协作问题**。

### 5.1 事实

| | `main`（GitHub 默认分支） | `stage-4.1-runtime-validation` |
|---|---|---|
| HEAD | `7446faa` | `4cb0819` |
| 最后阶段 | Stage 4.0 | **Stage 5.5** |
| 跟踪文件 | 44 | **183** |
| 关系 | 严格祖先 | 领先 64 / 落后 0（**可快进**） |

### 5.2 后果

1. **任何从 GitHub 默认页阅读仓库的人（包括未来的 AI、协作者、评审者）都看不到 Stage 5.x 的全部成果**——看不到 `extension/src/ocr/`（4 个文件）、`object-matcher.js`、`runtime/` 的 45 份证据报告。
2. 会得出「这个仓库只有 Stage 4.0」的错误结论，进而**重复劳动或误判进度**。
3. 本次治理的文档（`docs/` 下的治理文件）描述的是 Stage 5.5 状态，若只存在于分支上，同样会被默认分支的读者忽略。

### 5.3 可选处置（**需用户决策，AI-2 不擅自执行**）

| 方案 | 做法 | 风险 |
|---|---|---|
| **A. 快进合并**（推荐） | 将 `stage-4.1-runtime-validation` 合并/快进到 `main` | 低；两个分支无分叉。但会把 Stage 5.x 的**未挂接**代码带上默认分支，需在 README 说清"未挂接" |
| **B. 改默认分支** | 把 GitHub 默认分支改为 `stage-4.1-runtime-validation` | 低；不动 `main`。但分支名带阶段号，长期不合适 |
| **C. 保持现状 + 在 main 补指针** | 在 `main` 的 README 顶部加一段"当前开发分支为 stage-4.1-runtime-validation" | 最低风险；但两处 README 会分叉 |
| **D. 暂不处理** | 等 Stage 5.5 完成后再统一合并 | 风险持续累积 |

> **AI-2 不擅自执行任何一种。** 合并默认分支属"敏感操作"（`docs/DEVELOPMENT_RULES.md` §9），必须由用户决定。
> 本次治理的做法是：**在治理分支上提交，等待用户决定合并目标**。

---

## 6. 冲突处置协议

| 场景 | 处置 |
|---|---|
| AI-2 发现 AI-1 的实现文件有问题 | **记录 + 报告**，写入对应审计文档；**不直接修改**。仅当发现**致命安全问题**时立即上报，仍不抢改（除非用户明确授权） |
| AI-1 需要改契约 | 通过 commit message 说明需要变更的条目（如 `GAP-1`），由 AI-2 更新 `docs/REAL_OCR_DEMO_CONTRACT.md` |
| 双方同时改了同一文件 | **不 force push**。先 `git fetch` + `git log` 判断谁先；后来的用 `pull --rebase` 重放，必要时人工合并 |
| push 被拒绝（non-fast-forward） | `git pull --rebase` 后重试。**禁止** `--force` |
| AI-1 有未提交的本地改动，AI-2 需要 push | AI-2 **使用独立分支**，不污染 AI-1 的工作分支（本次治理即采用此方式） |
| 发现对方提交里含敏感数据 | 按 `docs/SENSITIVE_DATA_AUDIT.md` 流程上报，不自行 rewrite history |

---

## 7. 开工前检查清单（两条线通用）

```text
[ ] git branch --show-current        —— 我在哪个分支？
[ ] git log --oneline -5             —— 最近谁提交了什么？
[ ] git status                       —— 有没有我没预期的改动？（可能是另一条线的未提交工作）
[ ] git fetch origin && git status -sb —— 远端有没有新提交？
[ ] 确认要改的文件在§2属于我
[ ] 若不确定，先看 docs/CURRENT_STATUS.md 了解当前能力状态
```

> 特别提示（对应外部指令的「禁止覆盖」要求）：**工作区出现你不认识的未提交改动时，一律视为另一条线的工作，不 reset、不 checkout、不删除。**

---

## 8. 事实记录：本次治理开工时的仓库状态

为便于后续追溯，记录 AI-2 开工时（2026-09-16）的真实观测：

| 检查项 | 结果 |
|---|---|
| 工作区状态（`main`） | **clean**（无未提交改动） |
| 工作区状态（`stage-4.1-runtime-validation`） | **clean** |
| 是否存在另一条线**未提交**的改动 | **未发现** |
| 远端分支 | `main`、`stage-4.1-runtime-validation`（2 个） |
| 是否有本地未推送提交 | 无 |
| 实际 `extension/src/` 内容 | 9 个文件（`ai` 1 / `core` 1 / `editor` 4 / `fields` 1 / `ocr` 2） |
| 是否存在指令假设的 `bridge/` `object/` `mapper/` `matcher/` 目录 | **不存在** |

> 这些事实与外部治理指令的假设有出入。指令本身要求「以仓库真实目录为准，不要机械创建不存在的结构」，本次治理即按此执行。

### 8.1 治理期间 AI-1 的并行推进（真实发生的协作案例）

治理工作进行中（同日），AI-1 向 `stage-4.1-runtime-validation` 推送了 **Stage 5.5**（3 → 6 个 commit）：

| 提交 | 内容 |
|---|---|
| `1ea948b` | 本地 OCR 可行性实测 PASS（tesseract.js，`LOCAL_OCR DECIDED`） |
| `131658e` | 真实 OCR provider adapter + 单测 |
| `0707035` | `BASIC_REAL_OCR_DEMO PASS` 真实链路验证 |
| `7ef1aed` | Stage 5.5 审计报告 + 严格分级 Gate |
| `03f2167` | production tesseract 懒加载器 + 单测 |
| `4cb0819` | 候选改为优先取引擎原生 `data.lines` |

**两个可验证的结论**：

1. **「用独立分支」的决定被证明正确**。若当时直接提交到 `stage-4.1-runtime-validation`，两边会同时推进同一分支；AI-1 的 6 个提交与 AI-2 的文档提交会交错，push 竞争与 rebase 成本都会上升。分开后双方推送均为**普通 fast-forward，零冲突、零 force push**。
2. **治理文档必须跟随实现更新**。Stage 5.5 使 `docs/CURRENT_STATUS.md` 的「real OCR = TODO」、`docs/STAGE_INDEX.md` 的「当前 HEAD = 5.4」、`docs/TEST_MATRIX.md` 的「6 套件 110 断言」、`docs/REAL_OCR_DEMO_CONTRACT.md` 的 GAP-1/2/5 **立即过时**。治理线随即在 `4cb0819` 基线上做了一轮同步更新（详见对应 `docs: update ... for stage5.5` 系列 commit）。

> 这正是本协议要解决的问题：**实现线可以快速迭代，治理线负责让它可被理解。** 两条线各自独立提交，通过 Git 汇合。

---

## 9. 本文件的维护

1. 由治理线维护。角色划分变化（例如新增第三条线）时必须更新 §1/§2。
2. §5 的默认分支问题一旦解决，必须更新该节并标注解决方式与 commit。
3. §8 为**时点记录**，不随后续变化改写；新时点另起一节追加。
