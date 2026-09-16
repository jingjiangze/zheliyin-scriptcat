# AGENT_SYNC_PROTOCOL — 双 AI 并行协作协议

> 维护者：AI-2（Repository Governance 线）
> 适用：本仓库同时由 **AI-1（实现线）** 与 **AI-2（治理线）** 并行推进时。
> 配套：`docs/BRANCH_POLICY.md`、`docs/DEVELOPMENT_RULES.md`、`docs/EVIDENCE_POLICY.md`

---

## 1. 两条线的职责

| | **AI-1** | **AI-2** |
|---|---|---|
| 角色 | Demo implementation | Repository governance |
| 写入范围 | `extension/**`、`runtime/**`、`tests/**`、`installer/**`、`zheliyin-card-assistant.user.js` | `docs/**`、`README.md`、`CHANGELOG.md`、`.github/**`、`.gitignore` |
| 分支 | `stage-4.1-runtime-validation` | `ai2-repo-governance` |
| 产出 | 实现、取证脚本、证据报告、阶段审计 | 规范、契约、状态、血缘、发布清单 |
| 节奏 | 快速迭代，允许频繁提交 | 只在**状态/接口/用户可见/Gate/发布**变化时同步 |

**AI-2 可以**：review、audit、verify、document（读代码、跑测试、核对证据、写文档）。
**AI-2 默认不可以**：直接修改 AI-1 的实现文件。

---

## 2. 唯一例外：致命安全问题

AI-2 **唯一**可以直接修改 AI-1 实现的场景：

```text
存在明确且致命的 安全 / 隐私 泄漏
（例：真实客户数据入库、凭据入库、真实图片入库）
```

即便如此，也必须：

1. **先记录**（写入 `docs/SENSITIVE_DATA_AUDIT.md`）
2. **单独 commit**（message 带 `security:` 前缀 + finding ID + 明确说明"越界原因"）
3. **在报告中显式声明这是越界例外**

> 非致命的问题（账号出现在注释里、模板 ID 公开等）→ **只记录，不修改**，交由 AI-1 或维护者处置。

---

## 3. 每次开工的发现流程（必做）

```bash
# ① 同步
git fetch --all --prune

# ② 看 AI-1 最近动了什么
git log --all --since="24 hours ago" --oneline --decorate

# ③ 看我上次同步到哪
git rev-parse origin/ai2-repo-governance
cat docs/CURRENT_STATUS.md | head -6      # 头部写着"基线 @ <commit>"

# ④ 从上次同步点列出 AI-1 的新提交
git log --oneline <last-doc-baseline>..origin/stage-4.1-runtime-validation

# ⑤ 看变更面（判断有没有接口/文件级变化）
git diff --stat <last-doc-baseline> origin/stage-4.1-runtime-validation
git diff --name-status <last-doc-baseline> origin/stage-4.1-runtime-validation
```

然后逐项判断（见 §4）：**只同步真正需要同步的**。

### 3.1 变化分类

| 变化类型 | 例 | 要不要同步文档 |
|---|---|---|
| **新阶段 / Gate 变化** | 新 Stage、`BLOCKED`→`PASS` | ✅ 必须（CURRENT_STATUS / STAGE_INDEX / CHANGELOG / README / DEMO_RELEASE） |
| **公共接口变化** | `recognize()` 签名、`OCRCandidate` 字段、`match()` 返回 | ✅ 必须（REAL_OCR_DEMO_CONTRACT） |
| **用户可见功能变化** | 新按钮、新行为、版本可感知 | ✅ 必须（README / DEMO_INSTALL / DEMO_RELEASE） |
| **测试集变化** | 新增套件、断言数变化 | ✅（TEST_MATRIX） |
| **依赖变化** | 新增 CDN / WASM / 缓存 | ✅（OCR_DEPENDENCY_POLICY） |
| **新增/删除文件** | 新模块、新驱动脚本 | ✅（REPOSITORY_MAP） |
| 内部重构、无外显变化 | 变量改名、加注释、调内部常量 | ❌ **不同步** |
| 纯测试微调（断言数不变） | 修 typo | ❌ **不同步** |
| 一次性调试脚本 | `probe-xxx.js` | ❌ 不同步（只在 REPOSITORY_MAP 汇总层体现） |

---

## 4. 反模式：不要让仓库变成「文档驱动代码」

**这是上一阶段暴露的问题**：AI-1 每推一个 commit，AI-2 就改动 10 份文档 → 仓库里 docs commit 数量逼近 code commit，噪音超过价值。

**规则**：

```text
AI-1 每个代码 commit  ≠  AI-2 必须写一份文档

只有以下五类变化才同步正式文档：
  ① 阶段状态变化
  ② 公共接口变化
  ③ 用户可见功能变化
  ④ Gate 变化
  ⑤ Demo 版本变化
```

**其余一律批量滞后同步**：攒到下一个「同步点」一次性处理，并在文档头部写清基线 commit。

> 判断口径：**如果一个 commit 不改变任何人对外部行为的理解，它就不需要文档。**
> 反过来，如果它改变了「用户能做什么 / 别人怎么接 / 状态是什么」，就必须写。

**同步点**的定义：一次治理线批量更新，覆盖一段时间内 AI-1 的全部相关变化。每份受影响的文档头部写明：

```text
> 基线：<branch> @ <short-sha>（<Stage>，<date>）
> 修订：@ <old-sha> …；@ <new-sha> …
```

---

## 5. 冲突处理

### 5.1 AI-1 正在写同一个文件

```bash
git status      # 看到不属于自己的改动
git diff        # 确认内容
```

**立即停止对该文件的任何操作。** 禁止：

```text
✗ git reset --hard
✗ git checkout -- <file>
✗ git checkout <branch>
✗ 覆盖
```

等 AI-1 commit 后再同步。**工作区出现你不认识的改动 = 另一条线的工作。**

### 5.2 push 被拒（non-fast-forward）

```bash
git fetch origin
git pull --rebase      # 或 git merge origin/<branch>
# 禁止 --force
```

### 5.3 两边改了同一个文件（同分支）

按 `docs/RELEASE_LINEAGE.md` §6 的冲突预案处理。原则：

- **代码以 AI-1 为准**
- **文档以 AI-2 为准**
- **demo 元数据是叠加层**：AI-1 更新代码后，demo 需重新套用元数据（不是反向覆盖代码）

---

## 6. 分支纪律（简版）

```text
AI-1 → development      （自主频繁提交）
AI-2 → governance       （仅文档）
AI-1 → demo             （由 AI-2 在验证后同步；AI-1 不直接写 demo）
demo → main             （维护者决定；AI-2 不执行）
```

**AI-2 绝不**：merge 到 main、rebase AI-1、force push、改写 AI-1 历史、删除 Stage 历史。

---

## 7. 证据要求

任何写进文档的 `PASS` 必须能追到三件东西（用户指令 §四十二）：

```text
runner    （怎么跑的：脚本路径 / 命令）
report    （结果落在哪：runtime/reports/*.json）
commit    （哪次提交：hash）
```

三者缺一 → 写 `UNKNOWN`，**不得推断**。

**AI-2 引用 AI-1 的结论时**：

- 优先引用 AI-1 的**原始报告文件**，不转述
- 若 AI-2 自己复跑了，标注「治理线复跑确认」并给命令
- 若未复跑，标注「历史报告，治理线未复跑」

---

## 8. 每轮交付的统一报告格式

AI-2 完成一轮必须输出（用户指令 §四十三）：

```text
Repository:      jingjiangze/zheliyin-scriptcat
Branch:          ai2-repo-governance
HEAD:            <sha>

Main current:    <sha>  （稳定线）
AI-1 current:    <sha>  （开发线）
AI-2 current:    <sha>  （治理线）
Demo current:    <sha>  （真机试用线）
Demo URL:        https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js

Code changes by AI-2:   无（仅文档）/ 或列明例外
Docs changes:           <新增/修改清单>
Tests:                  <复跑结论>

Sync status:            <文档基线 → AI-1 最新>
Conflict:               无 / <说明>
Release status:         <demo 是否可发 / main 是否可提 candidate>
```

---

## 9. 完成即停

治理基础建立完成后，**不要继续做无价值的文档扩张**。

下一次动作的触发条件：

```text
AI-1 出现新的真实功能，或 Gate 状态变化
→ 按 §3 流程做增量同步
```

否则保持静默。**文档的价值在于准确，不在于数量。**

---

## 10. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-09-16 | 初版：职责边界、致命安全例外、开工发现流程、变化分类表、反模式与同步点、冲突处理、证据要求、统一报告格式 |
