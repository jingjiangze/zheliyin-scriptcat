# Stage 9 P4-B Agent Handoff — 交接包总览

- 交接日期：2026-09-20
- 分支：`stage-9-altq-baidu-reconstruction`
- HEAD：`a37b35f`（P4-B Commit 2，0.3.11.40）
- test 分支：`a37b35f`（与 prod 同步）；demo 分支：`61cd248`（0.3.11.35，未动）
- 工作树：干净（`git status --short` 无输出；`git diff --check` 无输出）

## 本交接包包含

| 文件 | 内容 |
| --- | --- |
| 01_REPO_STATE.md | 真实 Git 状态（命令原文保存） |
| 02_STAGE9_CONTEXT.md | Stage 9 总目标 / Native / Baidu / P4-A / P4-B 全上下文 |
| 03_DECISION_LOG.md | 关键设计决策与禁止事项 |
| 04_NEXT_TASK.md | 下一步 = P4-B Commit 3（真机 A/B 矩阵，勿提前做 P4-C/P4-D） |
| 05_FILE_MANIFEST.txt | Stage 9 文件清单（PATH/STATUS/ROLE/SOURCE_COMMIT/REQUIRED） |
| 06_COMMIT_HISTORY.md | Stage 9 提交历史（SHA 逐条核对） |
| 07_TEST_STATUS.md | 本机实时测试结果（重新执行记录） |
| 08_RUNTIME_EVIDENCE_INDEX.md | runtime/reports 全部 Stage 9 证据索引（含复制进本包的 5 份） |
| 09_SECRET_ENV_NAMES.md | 运行所需环境变量名（不存值） |
| 10_KNOWN_RISKS.md | 已知风险清单 |
| reports/ | 5 份核心真机证据 JSON 副本（原文件保留在 runtime/reports） |
| specs/ | 规格来源说明与执行序提炼（原文在会话附件，未复制全文） |

## 铁律（新 Agent 必须遵守）

1. Native OCR = 文字最终真值（`textbox.text === native.rawText`），Baidu/Local/AI 不得覆盖。
2. Native 默认 `textType=2`（手写体优先，失败/空才回退 `textType=1`）——用户实测确定的策略，不得擅改。
3. `zyStage9FontInkTarget` 默认必须保持 `0`（OCR bbox target）；P4-B 是实验链路，非默认模型。
4. 禁止任何固定乘数（K2/K3/K4 不得变成 global multiplier）。
5. 正反面硬隔离（PAGE_IDENTITY_CHANGED → STOP）。
6. 不 force push；不改写历史；不删除/覆盖既有证据。