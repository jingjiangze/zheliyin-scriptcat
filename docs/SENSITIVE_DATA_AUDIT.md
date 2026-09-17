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
| 为什么必须登记 | ~~Stage 5.6 的 P1 前置目标，正是让引擎能在编辑器页装载~~ → **该前置已于 Stage 5.5A-R2 完成** |
| ⚠️ **风险已升级为「紧迫」** | **`engine-in-editor` 已于 `e9235af` 转为 `PASS`** —— 即 ② 之后的代码路径**现已可达**。该 smoke 脚本（`runtime/stage5-5a-scriptcat-ocr-smoke.js` 第 163/166/249 行）仍在树中且未被修改，**再跑一次就可能把真实编辑器图片的 base64 写入报告并提交**。
> **建议 AI-1 在下次运行该脚本前先剥离 `img.dataUrl`**（优先于任何其他 OCR 工作）。 |
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
| **最高（已升级）** | `FINDING-SD-04` 剥离 `img.dataUrl` | AI-1 | **立即** —— 引擎装载已于 Stage 5.5A-R2 成功，风险窗口已打开（该 smoke 脚本仍在树中且未修） |
| 中 | `FINDING-SD-05` 文本脱敏 | AI-1 | 用真实图片跑 demo 之前 |
| 低 | `FINDING-SD-01`（账号占位化） | AI-1 | 任意 |
| 不做 | `FINDING-SD-02/03` 重写历史 | — | 不建议（需 force push） |

---

## 10. 第三轮审计 —— 百度云 OCR / 凭据 / 隐私（2026-09-17，对象：demo `e0abcf0` v0.3.6.0）

> 范围：用户指令 §十八（百度 AK/SK）、§十九（OCR 图片隐私）、§二十（云 OCR 请求边界）。
> 审查对象：`demo` @ `e0abcf0`（v0.3.6.0）。方法：全树正则扫描 + 逐文件读源码 + 结构可达性分析。

### 10.1 §十八 —— 百度 AK/SK 审计

| 检查项 | 结论 | 依据 |
|---|---|---|
| 仓库中是否存在硬编码真实密钥 | ✅ **无** | 全树扫描 `(api[_-]?key|secret|token|ak|sk)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']` 仅 2 处命中，且均为**假值**：`runtime/stage5-5b-p4.js:23-24` 的 `FAKE_AK = "AK-FAKE-4P4-123456"` / `FAKE_SK = "SK-FAKE-4P4-654321"` |
| 凭据读取方式 | ✅ 运行时注入 | `baidu-provider.js` 的 `getConfig: () => ({ apiKey, secretKey })`，provider 自身**不接触任何存储 API**（依赖注入） |
| 凭据落盘形态 | ✅ **加密** | `credential-crypto.js`：AES-256-GCM（WebCrypto）；格式 `v1:<iv(base64)>.<ct(base64)>`；IV 每次加密随机；KEK 32B 随机存 `zyBaiduCryptoKek` |
| 明文是否被清除 | ✅ 是 | 旧键 `zyBaiduAk`/`zyBaiduSk` 在迁移后立即 `GM_setValue(..., "")` 清零（userscript L521-531、L544-545） |
| 无 `crypto.subtle` 时 | ✅ **拒存** | `saveBaiduConfigPlain` 首行返回 `{ok:false, message:"当前环境不支持加密存储（WebCrypto 不可用），为保护凭据未保存"}` |
| 是否可能被误解密 | ✅ 安全降级 | `decryptSecret` 对损坏/KEK 不匹配一律 `catch → null`，**不抛错、不带密文进日志** |
| UI 是否掩码 | ✅ 是 | `maskKey(v) = v.slice(0,4) + "•••" + "(" + v.length + "位)"`；输入框 `type="password"`；placeholder 用掩码 |
| token 缓存 | ⚠️ 披露 | `zyBaiduToken` + `zyBaiduTokenExpiryAt`（30 天）明文存 GM；**access_token 是短期凭据**，泄漏面小于 AK/SK；不写日志 |
| 诚实边界（AI-1 已自述） | ✅ 已登记 | `credential-crypto.js` 头注释明确：KEK 与密文**同存本机** → 属"客户端可访问凭据"，**不声称绝对安全**；口令派生 KEK 列为后续项。**该自述诚实，认可** |

**§十八结论：`PASS`**（无硬编码密钥；凭据 AES-GCM 加密落库；无 WebCrypto 拒存；UI 掩码；诚实声明边界）。

### 10.2 §十九 —— OCR 图片隐私审计

| 数据面 | 是否出网/落盘 | 结论 |
|---|---|---|
| `canvas.toDataURL` | 仅内存 | 命中 26 处：15 处在 `runtime/stage5-*.js`（诊断）；生产路径 3 处（`page-bridge.js:121`、`tesseract-loader.js:87/92`、userscript `:738/740`）。**均只在内存流转，不写 GM、不写日志** |
| `GM_setValue` 含图片 | ✅ **无** | 全树 `GM_setValue` 仅用于：配置、`zyBaiduAkEnc`/`zyBaiduSkEnc`（密文）、`zyBaiduCryptoKek`、`zyBaiduToken`、UI 状态。**无任何图片键** |
| `console.*` 含图片/文字 | ✅ **无** | `ocrLog(stage,msg)` 是唯一 OCR 日志出口（userscript `:656`），调用点全部只传**阶段名 + 计数 + 耗时 + 错误码**。例：`"lines=" + n + " elapsed=" + ms + "ms"`。**无 dataUrl、无识别文本、无凭据** |
| 识别文本是否入库 | ✅ 未入库 | 报告中的文本为合成/已脱敏（`stage5-5a-...` 把重建对象文本硬编码为 `"[R]"`，L193） |
| 真实图片是否入库 | ✅ 未入库 | 见 §10.3 对 `FINDING-SD-04` 的**实测复核** |
| IndexedDB 语言缓存 | ⚠️ 说明 | `chi_sim` 训练数据（约 20MB）存浏览器 IndexedDB，**不良性出网、不入库** |
| 百度请求体 | ⚠️ 披露 | 图片 base64 经 `encodeURIComponent` 作为 `image=` 表单域 POST 到 `aip.baidubce.com`（仅 `auto` 模式的兜底路径） |

**§十九结论：`PASS`**（生产路径无图片写入存储/日志；识别文本未入库）。

### 10.3 §二十 —— 云 OCR 请求边界审计

| 检查项 | 结论 | 依据 |
|---|---|---|
| 上传内容是否为**所选单张图片** | ✅ **是** | `page-bridge.js:extractImagePayload(target,...)` 对**单个** `target` 元素 `drawImage` → `toDataURL`；上游 `waitForOcrTarget` 按优先级 `active → background → first image` 选**一个**目标。**不截整画布、不截网页** |
| 是否上传编辑器状态 / 画布全量 | ✅ **否** | 请求体只有 `image=<base64>`；无对象列表、无几何、无 UUID、无模板信息 |
| 是否上传识别结果或用户输入 | ✅ **否** | 响应侧只取 `words_result[]`；请求侧无回传 |
| 允许的云端主机 | ✅ 收敛 | `@connect aip.baidubce.com`（OCR）+ 既有 `ark.cn-beijing.volces.com`（AI 文本）+ `raw.githubusercontent.com`/`github.com`/`cdn.jsdelivr.net`（依赖）。`@connect *` 仍存在（**建议后续收敛**，见 §11） |
| 触发时机是否 local-first | ✅ **是（结构验证）** | `decideFallback` 仅在 `maybeBaiduFallback` 内被调用；`maybeBaiduFallback` 仅在 **4 处失败分支**被调用（userscript `:867` `LOCAL_OCR_FAILED` / `:871` `LOCAL_OCR_PARSE_FAIL` / `:872` `LOCAL_OCR_TIMEOUT` / `:906` `LOCAL_OCR_EMPTY`）。**本地成功路径没有任何调用点** → `LOCAL_FIRST` 成立 |
| 非 auto 模式是否可能外传 | ✅ **否** | `decideFallback` 第 28 行：`if (mode !== "auto") return { action: "stop" }` —— `local`/`baidu` 显式模式下永不触发兜底 |
| 未配置凭据时 | ✅ **不发网络请求** | `baiduEnabled=false` → `{action:"notify-config"}`（只提示，不发请求） |
| 输入类错误是否会外传 | ✅ **否** | `IMAGE_UNAVAILABLE` / `CROSS_ORIGIN_IMAGE` 等 **不在** `FALLBACK_ABLE` 白名单 → `action:"stop"` |
| 压缩护栏 | ✅ 有 | >4M 或 >4096px → 先等比压缩；仍超限 → `BAIDU_IMAGE_TOO_LARGE`，**不发送** |

**§二十结论：`PASS`**（仅上传所选单张图片；local-first 结构成立；非 auto 模式不外传；未配置不发请求）。

### 10.4 `FINDING-SD-04` 实测复核（**结论修正**）

对 `demo` @ `e0abcf0` 实际取 `runtime/reports/stage5-5a-real-scriptcat-ocr.json` 并解析：

```text
文件字节 : 2009
base64 图像 dataUrl 命中 : 0 处
顶层 keys : ts, stage, steps, errors, csp, ocrRaw
ocrRaw    : { err, injectMode, amdHint }      ← 引擎装载失败，未走到 getFirstCanvasImage()
gm        : 不存在
```

| 项 | 原判定（§8.2） | **本次复核** |
|---|---|---|
| 是否已泄漏 | 否（引擎失败） | ✅ **否，确认** |
| 风险等级 | 高（潜在） | 🟠 **中（潜在）** —— 降一级，理由：AI-1 已把 OCR 路径整体迁到 `runtime/stage5-5b-p1-diagnose.js` 等**新驱动**，该 smoke 脚本是 **5.5A 时代产物**，是否再被运行取决于 AI-1 流程；但**脚本仍在树中、仍未脱敏、报告仍未被 `.gitignore` 覆盖** |
| 处置 | 建议剥离 `img.dataUrl` | ⏳ **仍建议**（未实施）。附：`runtime/reports/stage5-5a-real-scriptcat-ocr.json` 应加入 `.gitignore` 兜底 |

> **保留 OPEN 的理由**：只要该脚本可执行且报告路径不被忽略，"引擎装载成功 → 真实图片入库"这条链路就是**可达**的。
> 治理线的职责是**登记 + 移交**，不是替 AI-1 改实现（用户指令明确 AI-2 只审不改）。

---

## 11. 待收敛项（本机与仓库级，非阻断）

| 编号 | 内容 | 建议 |
|---|---|---|
| `RISK-CONNECT-01` | userscript 仍保留 `@connect *`（在 `aip.baidubce.com` 等具名项之后） | 收敛为具名主机白名单，去掉 `*`。避免"任何主机都能被 GM_xmlhttpRequest 访问"的默认面 |
| `RISK-TOKEN-01` | `zyBaiduToken`（access_token）明文存 GM | 可与 AK/SK 走同一套 AES-GCM；优先级低（30 天短期凭据，且不写日志） |
| `RISK-KEK-01` | KEK 与密文同存本机 | AI-1 已自述为已知边界；若要提升，需口令派生（PBKDF2/scrypt）KEK。**不作为阻断** |

---

## 12. 维护规则

1. 每次新增 `runtime/**` 脚本或证据报告后，执行 §7 的第 1/3/4 条。
2. 任何**真实**取证数据入库前必须脱敏（方法见 `docs/DEVELOPMENT_RULES.md` §6）。
3. 本文件只记录发现与建议；**不代替用户/AI-1 做处置决定**。
4. 发现**新**泄漏时：立即上报（不必等用户询问），但**不自行** rewrite history。
5. 审计须**分层给结论**：`§十八 AK/SK` / `§十九 图片隐私` / `§二十 请求边界` 各自独立判 `PASS/FAIL`，不合并成一句「安全」。
6. 判定"未泄漏"必须给出**实测依据**（如报告字节数 + 命中数），不得仅凭"设计上应该不会"。
