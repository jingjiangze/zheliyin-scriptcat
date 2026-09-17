# 项目历史资料索引（project-history INDEX）

> 本索引由迁移任务（2026-09-17）生成。目的：让新 AI 在 `D:\zheliyin-scriptcat` 直接获知全部历史上下文的位置。
> 原则：**历史资料是上下文，不是事实。** 所有结论须对照当前 GitHub HEAD 重新验证。

---

## 1. 如何阅读本仓库

本仓库 = **GitHub 当前代码（demo 分支）+ 本地独有历史资料（project-history/）**。

- 代码与主线文档（README/CHANGELOG/STAGE_*_REPORT/ARCHITECTURE_AUDIT/docs/runtime/reports/tests）全部来自 GitHub 仓库本身，clone 即获得，与 `origin/demo` 完全一致。
- `project-history/ai-development/ui-audit/` 是**本地独有**历史资料（此前工作机 `C:\Users\Administrator\WorkBuddy\2026-09-16-12-13-35\zheliyin-scriptcat\ui-audit` 存在的 UI 审计实验记录），GitHub 上的 `demo` 分支**不包含**这些内容。

---

## 2. 主线历史资料（已在 GitHub，clone 自带）

### Stage 1~6.2 报告

| 项目 | 文件 | 用途 | 当前可信度 |
| --- | --- | --- | --- |
| Stage 1 | `STAGE_1_REPORT.md` | 字段核心模块化 | Historical Note（代码 @require 存在） |
| Stage 2 | `STAGE_2_REPORT.md` | Config/AI 边界 | Historical Note |
| Stage 3 | `STAGE_3_REPORT.md` | page-bridge 抽取 | Historical Note |
| Stage 3.1 | `STAGE_3_1_REPORT.md` / `STAGE_3_1_INDEPENDENT_AUDIT.md` | 独立审计 | Historical Note |
| Stage 3.2 | `STAGE_3_2_REPAIR_AND_REAUDIT.md` | 生命周期加固 | Historical Note |
| Stage 4 | `docs/`（stage-4 相关） | 重复注入修复 | Historical Note |
| Stage 4.1 | `STAGE_4_1_RUNTIME_VALIDATION.md` | runtime 验证 | Historical Note |
| Stage 5 | `docs/`（stage-5 系列） | 字段解析/OCR 管线 | Historical Note |
| Stage 5.6 | `docs/STAGE_5.6_*`（在 docs/ 下） | OCR-only Demo UI | Historical Note |
| Stage 6 | `docs/stage-6-*`（在 docs/ 下） | 镜像对象模型 | Historical Note |
| Stage 6.1 | `docs/stage-6.1-*`（在 docs/ 下） | TextBlock 层 | 单测已通过（tests 可重跑） |
| Stage 6.2 | `docs/stage-6-2-*` + `runtime/reports/stage-6-2-*.json` | Native Pipeline | Native/Layer/Undo VERIFIED；Save/Reload PENDING |
| 接管审计 | `TAKEOVER_AUDIT.md` | AI 接管独立审计 | 报告本身（2026-09-17） |

### 架构 / 审计 / 调查

| 文件 | 用途 |
| --- | --- |
| `ARCHITECTURE_AUDIT.md` | 架构审计 |
| `RUNTIME_HARNESS_AUDIT.md` | runtime harness 审计 |
| `REAL_RUNTIME_GUIDE.md` | 真机运行指南 |
| `EDITOR_OBJECT_NOTES.md` | Editor Object 调查 |
| `DEPENDENCY_MAP.md` / `BEHAVIOR_BASELINE.md` / `REFACTOR_PLAN.md` / `CHANGE_PROPOSAL.md` / `TEST_PLAN.md` | 行为基线/重构/变更/测试计划 |
| `CHANGELOG.md` | 版本记录 |
| `runtime/reports/*.json` | 真机运行时证据（git 跟踪） |
| `runtime/fixtures/` | 测试夹具 |
| `docs/evidence/`、`docs/execution-records/` | 阶段证据 / 执行记录 |

---

## 3. 本地独有资料（project-history/，GitHub demo 不含）

### ai-development/ui-audit/（上一 AI 会话的 UI 审计实验记录）

来源目录：`C:\Users\Administrator\WorkBuddy\2026-09-16-12-13-35\zheliyin-scriptcat\ui-audit`

本目录记录了一次针对 **userscript UI 注入行为**（UI2/UI3 右侧栏抽屉）的探索性审计，
**与 OCR/Native Text 主线并行、未合入 demo**。所有结论为 **Historical Note / UNVERIFIED**，
仅作上下文，新 AI 不得据此断言主线状态。

| 子目录/文件 | 用途 | 对应阶段 | 可信度 |
| --- | --- | --- | --- |
| `baseline-038/userscript-038.js` | 0.3.8.0 基线 userscript 快照 | 基线 | Historical Note |
| `ui2-env/inject-ui2*.js`、`verify-ui2.js`、`regress-ui2.js`、`push-ui2.js` 等 | UI2 实验注入/验证脚本 | UI 审计 | Historical Note |
| `ui2-env/ui2-before-after.md` / `.json` | UI2 前后对比结论 | UI 审计 | Historical Note |
| `ui2-env/ui3-before-after.md` / `.json` | UI3 前后对比结论 | UI 审计 | Historical Note |
| `ui2-env/ui3-native-probe.json` / `ui3-our-probe.json` | 原生 vs 我们的 probe 对比 | UI 审计 | Historical Note |
| `ui2-env/ui2-snap-*.json` | UI2 抽屉状态快照 | UI 审计 | Historical Note |
| `ui2-env/shot-*.png`（10 张） | 真机/注入截图证据 | UI 审计 | 截图证据（解释以 md/json 为准） |
| `ui2-patch/ui2-native.patch` + `userscript-0.3.8.0.*.js` | UI2 补丁（未合入） | UI 审计 | Historical Note |
| `ui3-patch/ui3-native.patch` + `userscript-0.3.8.0.*.js` | UI3 补丁（未合入） | UI 审计 | Historical Note |
| `ui2-env/modules/*.js` | 审计导出的模块快照 | UI 审计 | Historical Note |

> 注意：本目录**未包含** `profile-ui2/`（浏览器 profile，含 Cookies/IndexedDB 等会话数据）——
> 按迁移指令 §十五/§十六 判定为敏感内容，**已排除不迁移**；相关运行日志与缓存同样排除。
> 如后续需要，请回到原目录单独处理。

---

## 4. 迁移说明 / 排除项

| 项 | 处置 | 原因 |
| --- | --- | --- |
| `ui-audit/ui2-env/profile-ui2/` | 排除 | 浏览器 profile，含敏感会话数据（§十五/§十六） |
| `ui-audit/**/*.log` | 排除 | 临时运行日志（§十八 A） |
| `ui-audit/.blobcache.json`、`*.db*` | 排除 | 缓存/临时产物（§十七/§十八） |
| node_modules/dist/build 等 | 不在源中 | 垃圾目录（§十七） |
| 本地仅存 git 分支 `ai2-local-backup-*`、旧本地 `demo` 分支头 | 未迁移 | git 历史以 GitHub clone 为基准（§八/§九） |

## 5. 迁移报告

见 `project-history/migration/MIGRATION_REPORT.md`（§二十六 要求）。