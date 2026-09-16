# SENSITIVE_DATA_AUDIT — 敏感信息审计

> 维护者：AI-2（Repository Governance 线）
> 审计日期：2026-09-16
> 审计范围：`stage-4.1-runtime-validation` @ `7c412b8`（Stage 5.5A），全部 187 个跟踪文件
> 第二轮（2026-09-16）：针对 OCR / 隐私面再审计（用户指令 §二十九）→ 见 §8
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
| 内容形态 | 形如 `$env:ZY_USER="176****6193"`（**本审计文档已掩码**；真实值请直接查看该文件第 3 行）—— 一个真实手机号，符合折立印登录账号格式 |
| 严重度 | **中低** |
| 现实风险 | 该仓库为公开仓库。账号本身不构成登录（无密码、无 token），但：① 暴露账号与持有者的关联；② 为撞库/骚扰提供目标；③ 与同类服务的账号复用风险叠加 |
| 泄漏的**不是** | 密码、token、cookie、session —— 均未泄漏 |
| 文档卫生 | ⚠️ 本审计第一版曾在此处写入明文账号；已由 CI 的 secret-scan 捕获并改为掩码。**审计文档本身也必须遵守脱敏规范** |
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


## 8. OCR / 隐私专项再审计（2026-09-16 第二轮）

> 范围：用户指令 §二十九 —— `OCR image` / `OCR text` / `Tesseract cache` / `CDN requests` / `browser storage` / `logs`。
> 审查对象：AI-1 开发分支 `7c412b8` 的 OCR 相关实现与驱动脚本。

### 8.1 扫描结论

| 面 | 结论 | 依据 |
|---|---|---|
| **真实用户图片是否入库** | ✅ **当前未入库** | 全仓库跟踪的图片文件只有 1 个：`tests/fixtures/ocr/test-card.png`（程序绘制的合成图） |
| **真实用户文字是否入库** | ✅ **当前未入库** | 5 份 Stage 5.5/5.5A 报告中 `data:image/` / `dataUrl` / `base64` 命中数均为 **0**；报告中的文本均为合成数据（`13800138000`、`WeChat: abc123`、`测试公司` 等） |
| **截图是否入库** | ✅ 未入库 | 无跟踪的 screenshots 目录（`.gitignore` 已覆盖 `runtime/reports/screenshots*`） |
| **实现层是否写日志/存储** | ✅ 干净 | `extension/src/ocr/{ocr-provider,tesseract-loader,ocr-model,image-mapper}.js` 无 `console.*`、无 `localStorage`/`sessionStorage` 写入；唯一对外动作是加载 CDN 脚本（`s.src = url`） |
| **Tesseract 缓存** | ⚠️ 说明 | 语言数据缓存在**浏览器本地 IndexedDB**（`cacheMethod: "indexeddb"`），属客户端存储，**不入库、不回传**。约 20 MB |
| **CDN 请求** | ⚠️ 披露 | 首次使用会请求 `cdn.jsdelivr.net`（tesseract.js 66 KB + 语言数据）。**图片不上传**，但该请求会暴露「此 IP 正在使用本工具」；Referrer 可能带出页面 URL。已登记为 `OCR_DEPENDENCY_POLICY.md` 的 `DEP-4` |
| **模板占位文本残留** | ⚠️ 极低 | 模板自有示例文本（`简小袋`/`简小设`）出现在 10 份报告中 → 见既有 `FINDING-SD-03`，建议保留（有利于证明「确实是同一模板」） |

### 8.2 新发现（**潜在风险，本次未触发**）

#### FINDING-SD-04 【高价值·潜在】OCR 驱动会把编辑器**真实图片**的 base64 写入报告

| 项 | 内容 |
|---|---|
| 位置 | `runtime/stage5-5a-scriptcat-ocr-smoke.js`（在 AI-1 开发分支 `7c412b8`，**不在本治理分支**） |
| 链路 | ① `getFirstCanvasImage()` 取编辑器**第一张真实 image 对象** → `cv.toDataURL("image/png")` 得到 `img.dataUrl`；② `return { …, img: img, … }`（`img` 含 `dataUrl`）；③ `out.ocrRaw = ocr`（整对象进 `out`）；④ `fs.writeFileSync(… "reports/stage5-5a-real-scriptcat-ocr.json", JSON.stringify(out, …))` |
| 严重度 | **潜在高**（一旦触发即为真实图片入库） |
| **本次是否泄漏** | ❌ **否**。因引擎注入失败（`window.Tesseract not present after inline+define-hack`），执行在 ② 之前即 `return`；报告仅 2009 字节且无 `dataUrl` |
| 为什么必须登记 | **Stage 5.6 的 P1 前置目标，正是让引擎能在编辑器页装载。一旦成功，本路径立即生效，届时会把真实图片 base64 提交进公开仓库。** |
| 建议处置（**不由 AI-2 实施**） | 由 AI-1 在 `out.gm` / `out.ocrRaw` 落盘前剥离 `img.dataUrl`（仅保留 `naturalWidth`/`naturalHeight`/`obj` 几何字段）；或统一经脱敏器处理后再写报告。**独立 commit**。 |

#### FINDING-SD-05 【潜在】OCR 驱动把识别文本片段写入报告

| 项 | 内容 |
|---|---|
| 位置 | `runtime/stage5-5-real-ocr-demo.js` 的 `step(…, "text=" + JSON.stringify(lines.map((l) => l.text.slice(0, 14))))` |
| 严重度 | **潜在中**：当前跑的是**合成图**（`测试公司` / `深圳市南山区` …），无害；但同一 runner 若换为真实用户图片，会把真实文字前 14 字符写进公开报告 |
| 建议处置 | 同 SD-04：落盘前做 `[REDACTED]` + `textLen` + `textHash8` 处理（`tests/fixtures/ocr/redacted-card-01.json` 已是此格式，可作参考） |

### 8.3 与 `docs/REAL_MACHINE_EVIDENCE.md` 的关系

本节记录**已发生事实**；`docs/REAL_MACHINE_EVIDENCE.md` 是**此后所有真机取证必须遵守的规范**。
两者共同约束同一件事：**真实图片 / 真实文字 / 凭据 一律不得入库**。

### 8.4 处置优先级

| 优先级 | 项 | 归属 | 时机 |
|---|---|---|---|
| **高** | `FINDING-SD-04` 剥离 `img.dataUrl` | AI-1 | **Stage 5.6 引擎装载成功之前**（否则一成功就泄漏） |
| 中 | `FINDING-SD-05` 文本脱敏 | AI-1 | 用真实图片跑 demo 之前 |
| 低 | `FINDING-SD-01`（账号占位化） | AI-1 | 任意 |
| 不做 | `FINDING-SD-02/03` 重写历史 | — | 不建议（需 force push） |

---

## 9. 维护规则

1. 每次新增 `runtime/**` 脚本或证据报告后，执行 §7 的第 1/3/4 条。
2. 任何**真实**取证数据入库前必须脱敏（方法见 `docs/DEVELOPMENT_RULES.md` §6）。
3. 本文件只记录发现与建议；**不代替用户/AI-1 做处置决定**。
4. 发现**新**泄漏时：立即上报（不必等用户询问），但**不自行** rewrite history。
