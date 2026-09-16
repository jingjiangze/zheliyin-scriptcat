# REAL_MACHINE_EVIDENCE — 真机证据规范

> 维护者：AI-2（Repository Governance 线）
> 适用：所有来自**真实设备 / 真实账号 / 真实页面**的取证产物。
> 配套：`docs/SENSITIVE_DATA_AUDIT.md`（已发生的审计）、`docs/EVIDENCE_POLICY.md`（证据等级）

---

## 1. 绝对禁止入库

```text
✗ 真实名片（客户原图 / 扫描件 / 照片）
✗ 真实手机号
✗ 真实微信号 / 二维码（含二维码图片，二维码本身即可解码出账号）
✗ 真实姓名 + 职位 + 公司的组合（可识别到具体个人）
✗ Cookie / Session / Storage dump
✗ Token / API Key / Authorization 头
✗ 浏览器 profile 目录
✗ 含上述内容的全屏截图
✗ 网络抓包原文（HAR / curl 输出含 Cookie）
```

> **二维码是二级敏感信息**：即使原图"只是一张图"，二维码可被直接解码。真实名片上的二维码必须打码或替换。

---

## 2. 允许入库（脱敏后）

```text
✓ synthetic card        程序绘制的合成名片图（如 tests/fixtures/ocr/test-card.png）
✓ redacted screenshot   打码后的截图（且打码需覆盖二维码 / 号码 / 姓名）
✓ anonymized result     只保留结构的结果（[REDACTED_*] + textLen + textHash8）
✓ schema / sample metadata
✓ 占位账号（13800138000 等保留号段 / 明显的假数据）
```

### 2.1 脱敏方法（本仓库既有约定）

| 原值 | 脱敏后 | 保留什么 |
|---|---|---|
| 客户姓名 | `[REDACTED_NAME]` | 长度（`textLen`）+ 哈希（`textHash8`） |
| 手机号 | `[REDACTED_PHONE]` 或 `13800138000` | 位置 / 尺寸 / 置信度 |
| 地址 | `[REDACTED_ADDRESS]` | bbox |
| 引擎输出 | 只保留结构字段 | `confidence` / `bbox` 数值 |

**参考实现**：`tests/fixtures/ocr/redacted-card-01.json`（真实画布区域 + `[REDACTED_*]` 文本）、`runtime/browser-launcher.js` 的 `redactText()`。

### 2.2 合成素材的优先使用

真实素材不可得时，**优先造合成素材**（而不是降低脱敏标准）：

```text
SYNTHETIC 600×400 测试图（Stage 5.3）
SYNTHETIC 1000×800 / 6 行 Demo 图（Stage 5.5）
```

> 使用 `SYNTHETIC` 时**必须同时声明**对应的真实输入项为 `PARTIAL`（见 `docs/EVIDENCE_POLICY.md`）。

---

## 3. 取证前的自检（每次提交真机产物前）

```bash
# ① 手机号（真实号段）
grep -rnoE "\b1[3-9][0-9]{9}\b" <新增文件> | grep -v 13800138000

# ② 凭据
grep -rnoiE "(cookie|set-cookie|authorization|bearer|token|api[_-]?key|secret)" <新增文件>

# ③ 大二进制 / 图片是否含可识别内容
file <新增文件>

# ④ 是否误加了 profile / session / 抓包
git status --porcelain
```

**任一项命中 → 停止提交，先脱敏。**

---

## 4. 真机证据的标准记录格式

每条真机证据必须能回答「在哪台机器、什么环境、怎么跑的、结果是什么」：

```text
环境:   Windows 11 / Chrome <version> / ScriptCat <version>
页面:   https://diy.zheliyin.com/diyWeb/... （模板 ID 可保留；不含个人可识别信息）
runner: <脚本路径>
report: <runtime/reports/*.json>
commit: <hash>
结果:   PASS / BLOCKED（分型） / PARTIAL
人工项: 若为人工观察，写明"人工观察，非自动化"
```

---

## 5. 官方安装 / 账号相关

- **禁止**把登录账号写进仓库任何位置（含注释、使用说明、示例命令）。
  本项目已发现的实例见 `docs/SENSITIVE_DATA_AUDIT.md` `FINDING-SD-01`（`runtime/autologin.js` 注释中的真实账号，已记录，建议由实现线占位化）。
- 凭据**只经环境变量**（`ZY_USER` / `ZY_PASS`），不写文件、不入库。
- 登录态复用依赖持久化 profile —— **profile 目录必须被 `.gitignore` 覆盖**（已覆盖：`runtime/browser/`）。

---

## 6. 截图规范

| 场景 | 要求 |
|---|---|
| 需要展示 UI | 只截面板 / 局部，避免全屏 |
| 画布内容 | 使用合成模板或已打码模板 |
| 含电话号码 | 打码到不可复原（不是简单模糊） |
| 含二维码 | 覆盖或替换 |
| 含浏览器地址栏 | 检查是否含 token / session 参数 |

---

## 7. 违规处理

**已入库的敏感数据**：

1. **不删除历史**（历史即证据）→ 在 `docs/SENSITIVE_DATA_AUDIT.md` 记录为 finding。
2. 评估风险等级，给出处置建议（脱敏 / 替换 / 保留）。
3. **不做 rewrite history**（会需要 force push，违反 `docs/DEVELOPMENT_RULES.md` §1 第 5 条）。
4. 若为**致命**泄漏（真实客户数据 / 凭据）：立即上报维护者，并建议轮换凭据。

---

## 8. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-09-16 | 初版：禁止/允许清单、脱敏方法、取证自检、记录格式、截图规范、违规处理 |
