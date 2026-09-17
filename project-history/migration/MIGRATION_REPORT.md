# Migration Report

## Source

原项目目录：

```text
C:\Users\Administrator\WorkBuddy\2026-09-16-12-13-35\zheliyin-scriptcat
```

（过去会话的工作副本；含已跟踪 + 未跟踪 + 敏感子目录）

## Destination

```text
D:\zheliyin-scriptcat
```

## Git

```text
Remote:  https://github.com/jingjiangze/zheliyin-scriptcat.git
Branch:  demo（开发分支；main=稳定版 0.3.0.0，stage-4.1-runtime-validation=开发中）
HEAD:    385374204255c2ac69f23f79f2272db584dd931d
         （== origin/demo，含 TAKEOVER_AUDIT.md；之前已 push 的 docs: add AI takeover audit）
Version: 0.3.8.8（userscript @version / const VERSION / manifest version_name 一致）
```

迁移方式：`git clone` 获取 GitHub 当前代码（§二十二 推荐做法），再仅复制本地独有历史资料到 `project-history/`。**迁移只 COPY，不 MOVE；原目录未做任何修改。**

## Migrated History

- Stage 1~6.2 报告/审计/证据：**已在 GitHub 仓库内**（clone 自带），无需复制：
  `STAGE_1_REPORT.md`~`STAGE_6.2` 相关（根目录 + `docs/` + `runtime/reports/*.json`）
- `project-history/ai-development/ui-audit/`（**GitHub demo 无此内容**，本地独有，已迁移：
  63 个文件，1.91MB，含基线快照/实验脚本/前后对比 md+json/补丁/10 张截图）
- `project-history/INDEX.md`：历史资料索引
- `project-history/migration/MIGRATION_REPORT.md`：本报告

## Excluded

```text
ui-audit/ui2-env/profile-ui2/    → 浏览器 profile：Cookies/IndexedDB/Session 数据（敏感，§十五/§十六）
ui-audit/**/*.log                → 临时运行日志（§十八 A）
ui-audit/ui2-env/.blobcache.json → 缓存（§十七）
*.db / *.db-journal / *.db-wal   → 缓存临时产物（§十七）
node_modules/ dist/ build/ 等    → 垃圾目录（本迁移源中不存在）（§十七）
本地仅存 git 分支 ai2-local-backup-* / 旧本地 demo 分支头 → 非工作树资料，git 历史以 GitHub 为基准（§八）
```

## Sensitive Files

已排除全部敏感内容，**迁移目标中无凭据/会话/个人信息**：

```text
扫描位置：ui-audit（排除 profile-ui2）
关键词：cookie|token|authorization|apikey|api_key|secret|password|session|credential|access_token|refresh_token
高信号凭据：eyJ(s) / AKLT / sk- / Bearer / AKIA — 无命中
结论：迁移后目标目录不含敏感文件
```

## Conflicts

```text
ui-audit 内容与主线（demo）无关：属并行开展的 UI 审计实验，未合入 demo →
在 INDEX.md 中标记为 Historical Note / UNVERIFIED，不据此修改代码（§三十五）
未发现「历史代码覆盖当前 GitHub 代码」的情况（迁移方向：GitHub → D:，历史资料只进 project-history/）
```

## Verification

```text
1. D:\zheliyin-scriptcat 为正确 Git 仓库（.git 存在，clone 自 GitHub）  → PASS
2. remote = jingjiangze/zheliyin-scriptcat                              → PASS
3. 当前 branch = demo（pull --ff-only origin demo，up to date）        → PASS
4. HEAD == origin/demo == 385374204255c2ac69f23f79f2272db584dd931d    → PASS
5. 版本 = 0.3.8.8（与 GitHub demo 开发分支一致）                        → PASS
6. 历史开发记录已迁移（ui-audit → project-history/ai-development/）     → PASS
7. Stage 1~6.2 可找到（GitHub 仓库内容 + INDEX.md 索引）               → PASS
8. AI 开发记录可找到（project-history/ai-development/ui-audit/）        → PASS
9. Native Text / drawText 调查可找到（docs/stage-6-2-* + 根 REPORTS）   → PASS
10. OCR / Geometry / TextBlock 调查可找到（docs/ + tests fixtures）     → PASS
11. 敏感信息：无（profile 未迁移，关键词扫描通过）                       → PASS
12. 旧代码覆盖当前代码：无（仅 project-history/ 新增）                  → PASS
13. 未提交垃圾文件：迁移后待 git status 复查（缓存/日志均已排除）       → 见 Git Status
14. GitHub 同步：push 后 HEAD == origin/demo 验证                        → 见 Git Status
```

## Git Status（本次迁移产生）

```text
新增（将提交）：
  project-history/INDEX.md
  project-history/ai-development/ui-audit/**（63 个文件）
  project-history/migration/MIGRATION_REPORT.md
不提交：
  （无缓存/日志/敏感/机器环境文件进入）
```

版本策略（§二十九）：本项目历史规则 = **docs-only 不升版本**（见 TAKEOVER_AUDIT.md「版本策略说明」，
证据：R0/Stage 3.1 保持 0.3.0.0；3f13f71 不升版，升版由独立 feat commit 承担）。本迁移为纯文档资料 → **不升版本**（0.3.8.8 不变）。

## Result

```text
PASS（迁移与验收全部通过；GitHub 同步见最终提交后的验证）
```