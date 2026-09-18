# AI_WORKFLOW.md — Git 工作方式与执行节奏

> 本文描述本项目**实际使用**的工作方式（双线验证后的合并基线）。

## 1. 分支模型

```
main                           稳定版（禁止直接修改；仅受托合入）
  └── demo                      OCR-only Demo / Stage 6.x（v0.3.8.8，已归档交付）
        └── test  👈 新 AI 默认工作线（v0.3.10.2，P0 真机）
              └── ai2-repo-governance    治理/审计辅助分支
```

规则：
- **默认在 `test` 分支工作**。
- **不直接修改 `main`**；合入走仓库正常流程。
- **禁止 force push**；禁止改写已推送历史。
- 每个功能性修改必须**独立 commit**；关键取证结果/报告/运行脚本修改也要独立 commit 并 push。
- 代码必须是**完整交付单元**：代码 + 测试 + 证据，禁止只交代码。

## 2. 执行节奏（小步前进）

```text
test
 ↓
修改一个小问题（单一目的）
 ↓
本地验证（单测 / harness / 语法检查）
 ↓
取证（reports/*.json + 截图，必要时 console 日志）
 ↓
独立 commit（fix:/feat:/test:/audit:/docs: 前缀，信息描述单一目的）
 ↓
git push origin test
 ↓
记录结果（execution-record / CHANGELOG）
```

- 禁止用模糊 commit 信息（如 “update”“final”）；使用 `fix: xxx (真实原因)` 风格。
- 失败时先修“观察/测量链路”（instrumentation、断言、证据采集），**不得直接猜根因**（§一.11）。
- 用户真机结果优先级 > 旧 AI 结论；旧报告结论未经重新验证不得沿用（§一.12/13）。

## 3. commit 类型约定（仓库惯例）

| 前缀 | 用途 | 示例 |
|---|---|---|
| `feat:` | 功能/能力 | `feat: real OCR runtime runner` |
| `fix:` | 修 bug | `fix: 同步 @require 缓存版本 0.3.10.1->0.3.10.2` |
| `test:` | 测试/harness/runner | `test: 核稿闸门 + proofSurfaces let 修复` |
| `audit:` | 审计/逆向/特征化 | `audit: characterize native layer/undo/add-text lifecycle` |
| `docs:` | 文档/证据/报告 | `docs: add complete ai workflow handoff` |

## 4. 什么东西进哪一层

- **生产代码**：`zheliyin-card-assistant.user.js`、`extension/`（src/* modules、assistant.js、manifest.json、gm-shim.js）
- **runtime/：** Playwright harness / 探针 / runner / fixtures / reports（证据 json/png）—— 提交，但 `.gitignore` 排除 profile*/vendor/screenshots 等敏感/大文件
- **docs/**：阶段审计报告、execution-records、evidence 目录
- **tests/**：无框架单测（node tests/editor-object-model/run.js）+ HTML 浏览器套件
- **handoff/**：AI 交接文档（本次新增）
- **project-history/**：历史版本/审计档案归档（只读参考）

## 5. 版本一致性与缓存纪律（关键！）

ScriptCat 的 `@require` 按 **URL（含 ?v=）缓存**模块：
- 升版时 **userscript `@version` + 全部 `@require ?v=` + `const VERSION` + manifest `version_name` + README + CHANGELOG** 必须同步。
- 版本号变化才能强制 ScriptCat 拉新模块；否则真机继续加载旧 `page-bridge.js`（历史根因：0.3.8.3 之前 BRIDGE_NO_REPLY 就是旧缓存）。
- 每次运行前核对：`Select-String -Path zheliyin-card-assistant.user.js -Pattern "@version|@require.*\?v=|const VERSION"`（当前应全部 = 0.3.10.2）。
- P0 纪律：**不允许 runner 自己 `drawText()` 伪造 OCR 成功**；必须驱动真实网页 OCR UI（`#zy-native-ocr-btn`）。

## 6. 登录/凭据纪律（安全）

- 凭据只从环境变量读取：`P0_LOGIN_USER` / `P0_LOGIN_PASS`（runner 内 `process.env`）。
- **禁止**把用户名/密码/cookie/session/token/API Key/Cloudflare 凭据写入仓库、报告、截图文件名。
- run-summary 已内置脱敏（`[REDACTED]` 替换 token/password/secret/cookie/authorization 值）。
- 证据入库前跑一遍 secret 扫描（本次交接对 `runtime/reports/p0/` 全量扫描，干净）。

## 7. 日常验证方法

1. 语法：`node --check <脚本>`
2. 单测：`node tests/editor-object-model/run.js`（13 suites；新增逻辑必须有对应单测/Fixture）
3. 真机：runner / harness 在**固定 URL**（252438 模板）运行，产物进 `runtime/reports/`
4. 重要性：真机证据 > harness 证据 > 单测 > 旧报告（§一.12/13）