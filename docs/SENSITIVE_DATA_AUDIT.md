# SENSITIVE_DATA_AUDIT — 敏感信息审计

> 维护者：AI-2（Repository Governance 线）
> 审计日期：2026-09-16
> 审计范围：`stage-4.1-runtime-validation` @ `3becf04`，全部 173 个跟踪文件
> 性质：**只读审计**。本次**未修改任何实现文件**（处置建议见 §5，需用户/AI-1 决定）
> 时点说明：本审计为 **`3becf04`（Stage 5.4，173 跟踪文件）时点的快照**。此后仓库增至 Stage 5.5A（187 文件）；新增文件（`ocr-provider.js`、`tesseract-loader.js`、`runtime/stage5-5*`、`stage5-5a*`）已按 §7 复核方式扫描，**未发现新增敏感信息**。

---

## 1. 审计方法

对全仓库（排除 `node_modules`）执行定向扫描：

| 扫描项 | 模式 |
|---|---|
| API Key 形态 | `ark-…` / `sk-…` / 40+ 位随机串（排除 sha256/base64 哈希） |
| 认证头 | `Bearer <token>` / `Authorization:` |
| 凭据赋值 | `(ark\|sk\|api[_-]?key\|token\|secret) = "<16+ 字符>"` |
| Cookie / Session | `cookie` / `set-cookie` / `storageState` / `*.session` |
| 个人数据 | 11 位手机号 `\b1[3-9]\d{9}\b` |
| 站点标识 | 折立印 URL 与模板 ID |
| 未脱敏文本 | 模板真实占位文本 |

---

## 2. 结论摘要

| 类别 | 结果 |
|---|---|
| **API Key / Token / Authorization** | ✅ **未发现泄漏**（0 处） |
| **Cookie / Session / storage dump** | ✅ **未发现入库**（`runtime/reports/runtime8-independent-review.json:64` 的 "cookie" 仅为一句"未验证 headless 会话 cookie 解密"的说明文字） |
| **凭据处理机制** | ✅ **正确**：`runtime/autologin*.js` 凭据只经环境变量 `ZY_USER` / `ZY_PASS`，不写文件、不入库；`runtime/browser-launcher.js` 有 `redactText()` 统一脱敏 |
| **`.gitignore` 敏感产物覆盖** | ✅ **基本到位**（profile / screenshots / session / cookies 文件已排除），**有 3 处缺口** → §4 |
| **真实账号** | ⚠️ **1 处**（`FINDING-SD-01`） |
| **账号关联标识** | ⚠️ 2 组模板 ID 公开（`FINDING-SD-02`） |
| **真实客户数据** | ✅ **未发现**。夹具全部为合成/脱敏（`tests/fixtures/` 6 份为合成公开示例；`[REDACTED_*]` 出现于 10 个文件） |
| **模板真实文本** | ⚠️ 轻微（`FINDING-SD-03`） |

---

## 3. Findings

### FINDING-SD-01 — 真实登录账号出现在使用说明注释中

| 项 | 内容 |
|---|---|
| 位置 | `runtime/autologin.js` 第 3 行（文件头使用说明） |
| 内容形态 | `$env:ZY_USER="17606256193"` —— 一个真实手机号，符合折立印登录账号格式 |
| 严重度 | **中低** |
| 现实风险 | 该仓库为公开仓库。账号本身不构成登录（无密码、无 token），但：① 暴露账号与持有者的关联；② 为撞库/骚扰提供目标；③ 与同类服务的账号复用风险叠加 |
| 泄漏的**不是** | 密码、token、cookie、session —— 均未泄漏 |
| 机制评价 | **凭据处理本身是正确的**：脚本只从环境变量读取，注释里的值只是"示例写法"，但示例用了真值 |
| 建议处置 | 将该示例替换为占位账号（如 `$env:ZY_USER="13800138000"`）。**建议由 AI-1 执行**（属其文件所有权范围） |
| 本次动作 | **仅记录，未修改**（遵守 `docs/PARALLEL_DEVELOPMENT.md` §2.1 / §6） |

### FINDING-SD-02 — 账号关联的模板 ID 公开

| 项 | 内容 |
|---|---|
| 内容 | `third/1203177/2114747/999`（29 处）、`third/20408603/1`（12 处） |
| 位置 | `zheliyin-card-assistant.user.js`、`docs/*.md`、`runtime/*.js`、`runtime/reports/*.json` |
| 严重度 | **低** |
| 现实风险 | 模板 ID 是折立印设计器 URL 的一部分。单独持有无法访问（仍需登录态），但可推断账号的模板资产规模，且便于他人推测出设计器入口结构 |
| 建议处置 | 若要进一步收紧，可在**未来新增**文档中使用占位 ID（如 `third/<TENANT>/<TEMPLATE>/999`）。**不建议**为此重写历史 41 处引用（成本高、收益低，且历史证据的可追溯性会下降） |
| 本次动作 | **仅记录** |

### FINDING-SD-03 — 模板真实占位文本残留

| 项 | 内容 |
|---|---|
| 内容 | `简小袋` / `简小设`（模板自身的示例文字） |
| 位置 | 16 个文件（`RUNTIME_HARNESS_AUDIT.md`、`STAGE_4_1_RUNTIME_VALIDATION.md`、`runtime/reports/*.json` 等） |
| 严重度 | **极低** |
| 现实风险 | 这是**站点模板自带的示例文本**，不是客户数据、不是个人信息。保留它有利于证据可复核（证明"确实是同一个模板"） |
| 建议处置 | **建议保留** |
| 本次动作 | **不处理** |

---

## 4. `.gitignore` 覆盖评审

### 4.1 现行规则（已生效，评价：良好）

```text
*.zip
.DS_Store
Thumbs.db

# runtime harness —— 敏感/临时产物禁止入库
node_modules/
runtime/browser/profile*/
runtime/reports/screenshots*
runtime/reports/dsc.log
runtime/reports/env-probe.txt
runtime/vendor/
storage-state/
*.session
.cookies
[rR]untime[-_]profile/
playwright-profile/
```

**做对的地方**：profile 目录、截图、session、cookies 文件都已排除；这正是 `RUNTIME_HARNESS_AUDIT.md` §3 明确要求的（"profile 含登录态 → 必须 gitignore，禁止入库"）。

### 4.2 识别的缺口

| # | 缺口 | 依据 | 风险 |
|---|---|---|---|
| **G-1** | **CI 生成物未排除**：`installer/embedded.generated.ps1`、`installer/installer.combined.ps1` | `.github/workflows/build-exe.yml` 在仓库工作区内 `Set-Content` 写入这两个文件 | **实**。本地跑一遍构建就会产生未跟踪文件，误 `git add` 后会把 base64 内嵌载荷提交进仓库 |
| **G-2** | 无 `.env` / `.env.*` | 项目目前用环境变量传凭据（`ZY_USER`/`ZY_PASS`）。一旦有人图方便写 `.env`，会被直接提交 | **实**。属典型事故点 |
| **G-3** | 无 `*.har` / 无 `cookies/`、`tokens/` 目录规则 | Playwright 抓包/HAR 会包含完整请求头与 Cookie | 中 |
| **G-4** | 无通用日志/临时/构建产物规则（`*.log` `logs/` `dist/` `build/` `cache/` `*.tmp` `*.bak`） | — | 低（当前项目无这些产物，属预防性） |
| **G-5** | 无 `*.pem` / `*.key` | — | 低（预防性） |
| **G-6** | 无 `.vscode/` / `.idea/` | 本地设置可能含路径/凭据 | 低 |
| **G-7** | `runtime/browser/profile*/` 只覆盖 `profile*` 命名；若将来出现 `runtime/browser/<其它名>/` 仍会被跟踪 | — | 低 |

### 4.3 本次处置

已按缺口加固（见对应 `chore: harden gitignore` commit）。加固原则：

> **只做窄口径补充，绝不使用宽通配。**

**明确未添加的高危宽通配**（加了会误伤必要夹具）：

```text
✗ *.png     —— 会忽略 tests/fixtures/ocr/test-card.png（SYNTHETIC 测试图，必须入库）
✗ *.json    —— 会忽略 runtime/reports/*.json（42 份证据，必须入库）与 tests/fixtures/*.json
✗ *.txt     —— 会忽略 tests/fixtures/*.txt（6 份文本夹具，必须入库）
✗ *.js      —— 会忽略全部源码
```

**验证方式**：加固后执行 `git ls-files | git check-ignore --stdin`，确认**没有任何已跟踪文件**被新规则命中。

---

## 5. 处置建议（按优先级，**均未执行**）

| 优先级 | 项 | 归属 | 动作 |
|---|---|---|---|
| 高 | `FINDING-SD-01` 真实账号占位化 | **AI-1** | 把 `runtime/autologin.js` 第 3 行示例账号改为占位号；独立 commit（`fix: redact example account in autologin usage comment`） |
| 已办 | `.gitignore` 加固 | AI-2 | 本次治理已执行（`chore: harden gitignore`） |
| 中 | 新增文档统一使用占位模板 ID | AI-1 + AI-2 | 仅对**新增**内容生效；不重写历史 |
| 低 | 在 `REAL_RUNTIME_GUIDE.md` 增加一条"凭据卫生"检查项 | AI-1 | 提醒示例不要用真值 |
| 不做 | 重写历史以清除 `FINDING-SD-02/03` | — | **不建议**：需 force push（违反 `docs/DEVELOPMENT_RULES.md` §1 第 5 条），且收益极低 |

---

## 6. 审计时点的正面确认（供后续复核）

```text
✅ 未发现任何 API Key / Token / Bearer 头入库
✅ 未发现 Cookie / Session / browser storage dump 入库
✅ 未发现真实客户数据入库
✅ 凭据走环境变量，代码内无硬编码密码
✅ 夹具全部为合成或脱敏（REDACTED + textLen/hash）
✅ runtime/reports/*.json 全程脱敏输出
✅ .gitignore 已覆盖 profile / screenshots / session / cookies
```

---

## 7. 复核方式（可重复执行）

```bash
# 1) Key / Token / 认证头
grep -rnoiE "(ark-|sk-)[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9_.-]{16,}" \
  --include="*.js" --include="*.json" --include="*.md" . | grep -v node_modules

# 2) 凭据赋值
grep -rnoiE "(password|passwd|pwd|api[_-]?key|token|secret)[\"']?\s*[:=]\s*[\"'][^\"']{8,}[\"']" \
  --include="*.js" --include="*.json" . | grep -v node_modules

# 3) 手机号
grep -rnoE "\b1[3-9][0-9]{9}\b" --include="*.js" --include="*.json" --include="*.txt" --include="*.md" . \
  | grep -v node_modules | awk -F: '{print $1" :: "$3}' | sort -u

# 4) 忽略规则是否误伤已跟踪文件（输出必须为空）
git ls-files | git check-ignore --stdin

# 5) 被忽略的未跟踪产物
git status --ignored --porcelain
```

---

## 8. 维护规则

1. 每次新增 `runtime/**` 脚本或证据报告后，执行 §7 的第 1/3/4 条。
2. 任何**真实**取证数据入库前必须脱敏（方法见 `docs/DEVELOPMENT_RULES.md` §6）。
3. 本文件只记录发现与建议；**不代替用户/AI-1 做处置决定**。
4. 发现**新**泄漏时：立即上报（不必等用户询问），但**不自行** rewrite history。
