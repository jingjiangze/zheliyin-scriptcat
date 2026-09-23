# 01 — Repository State（真实 Git 状态）

生成时间：2026-09-20（Asia/Hong_Kong）

## 摘要

| 项 | 值 |
| --- | --- |
| repository | `jingjiangze/zheliyin-scriptcat` |
| current branch | `stage-9-altq-baidu-reconstruction` |
| HEAD SHA | `a37b35f` |
| version | `0.3.11.40` |
| remote | `https://github.com/jingjiangze/zheliyin-scriptcat.git`（credential.helper=manager） |
| test branch HEAD | `a37b35f`（本地 + origin 一致） |
| demo branch HEAD | `61cd248`（0.3.11.35，未动） |
| main | `6840170` |
| working tree | **clean**（无未提交修改、无 untracked 在工作区） |
| latest Stage 9 commit | `a37b35f` |

## `git status --short --branch`（原文）

```
## stage-9-altq-baidu-reconstruction
```

（无其余行 = 干净）

## `git branch -avv`（节选，Stage 相关）

```
  demo                61cd248 [origin/demo] chore(release): demo 晋级 0.3.11.35 ...
* stage-9-altq-baidu-reconstruction  a37b35f feat(stage-9): add optional image ink typography target (P4-B commit2, 0.3.11.40)
  test                a37b35f [origin/test] feat(stage-9): ... (P4-B commit2, 0.3.11.40)
  remotes/origin/demo 61cd248
  remotes/origin/stage-9-altq-baidu-reconstruction a37b35f
  remotes/origin/test a37b35f
```

## `git show --stat`（关键提交）

- `391e92e`（P4-A）：+`runtime/reports/stage-9/font-calibration-audit.json`（841 行）、+`runtime/stage9/font-calibration-audit.js`；合计 1008 insertions。
- `a37b35f`（P4-B C2）：`extension/assistant.js`、`extension/manifest.json`、`extension/src/editor/page-bridge.js`、`runtime/runtime-manifest.json`、`zheliyin-card-assistant.user.js`；193 insertions / 83 deletions。

## `git log --oneline --decorate -30`（Stage 9 序列，已核对）

见 `06_COMMIT_HISTORY.md`（SHA 完整）。

## 一致性检查

- `git diff --check`：无输出 ✅
- `git diff --cached --check`：无输出 ✅
- a37b35f 之后是否存在本地未提交修改：**否**
- 是否存在未跟踪 runtime/docs/report 文件阻塞提交：**否**（handoff 新建文件将独立提交）