# DEMO_RELEASE — Demo 发布清单

> 维护者：AI-2（Repository Governance 线）
> 规则：**每次 Demo 更新必须新增一条记录**，且必须填写完整字段。
> 配套：`docs/DEMO_INSTALL.md`（安装与验收）、`docs/RELEASE_LINEAGE.md`（血缘）、`docs/BRANCH_POLICY.md`（§4 版本规则）

---

## 记录模板（复制使用）

```text
### Demo v<@version>  ·  <日期>

| 项 | 值 |
|---|---|
| Version（@version = VERSION = manifest version_name） | |
| Demo HEAD（分支 commit） | |
| Base（对应的 AI-1 commit 与 Stage） | |
| userscript sha256 | |
| 固定安装 URL | https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js |

**用户可见变化**（无则明确写「无」）：

**OCR 状态**：PASS / BLOCKED / PARTIAL / 未挂接

**真机状态**：PASS / PENDING / N/A（区分「已验证」与「待人工」）

**已知问题 / 限制**：

**安装 / 更新验收**：USER_INSTALLABLE = ? / USER_UPDATEABLE = ? / REAL_FEATURE_USABLE = ?

**本次同步的 AI-1 commit**：
```

---

## 记录

### Demo v0.3.5.0 · 2026-09-16（AI-1 发布，治理线补记）

| 项 | 值 |
|---|---|
| Version | `@version` = `0.3.5.0`；⚠️ 但 `const VERSION` = `assistant.js VERSION` = `manifest version_name` = `0.3.0.1`（**不一致**，见 `DEFECT-VER-01`） |
| Demo HEAD | `58337a8f553c350537138208d9320d83b4a64690` |
| Base | `e9235af`（AI-1 开发分支，**Stage 5.5A-R2**） |
| 固定安装 URL | `https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js` |

**用户可见变化（首次真正有功能）**：新增 **「识别图片文字」按钮** + page-world OCR executor + `ocrCreate` 桥。

**OCR 状态（状态转移）**：

```text
engine-in-editor       : BLOCKED  →  PASS   ← 状态转移（Stage 5.5A-R2）
BASIC_REAL_OCR_DEMO_PRODUCT : BLOCKED → 可用（Demo 内可点按钮跑通）
识别质量（真实样本）    : PARTIAL（3 行、词序乱 → Stage 5.9）
```

**真机状态**：AI-1 已在真实编辑器实测（`runtime/reports/stage5-5a-executor-report.json`，15 步全 PASS、`errors: []`）：
`executor-umd-load` / `ocr-first`(674ms) / `ocr-cached`(667ms) / `mapper` / `matcher` / `create-editable` / `reference-preserved` / `rollback` 全 PASS，创建 3 个真 textbox（editable / 思源黑体 Regular / `markuuid=null`），rollback 21/4/3 零残留。

**已知问题**：
1. **`DEFECT-VER-01`**：`@version` 与脚本内 `VERSION` 不一致（0.3.5.0 vs 0.3.0.1）→ 面板显示 0.3.0.1；更新检查用 `@version` 比较 → **会每次提示「发现新版」，属用户可见缺陷**。详见 `docs/CURRENT_STATUS.md` §3。
2. 识别质量在真实编辑器样本上偏弱（3 行、词序乱）；样本是编辑器现有图片而非名片。
3. `docs/DEMO_INSTALL.md` 在 demo 与治理分支各有一份（内容不同）→ 见 `docs/DEMO_INSTALL.md` §7 的合并口径。

**本次同步的 AI-1 commit**：`0cccfd1`（executor 突破）、`58337a8`（demo 功能 + 元数据）、`e9235af`（开发分支同内容）

---

### Demo v0.3.0.1 · 2026-09-16

| 项 | 值 |
|---|---|
| Version | `0.3.0.1` |
| Demo HEAD | `ceedbb55c8f5fb45507d5b2060e099ad081f012e` |
| Base | `7c412b8`（AI-1 开发分支，**Stage 5.5A**） |
| userscript sha256 | `39d79b0e42a2ad85ef77c44834772de705f8fbf656893a20ef16b237ad3b8a94` |
| 交付物大小 | 39880 bytes |
| 固定安装 URL | `https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js` |

**首次建立**：本条目是 `demo` 分支的第一次发布，由 AI-2 从 AI-1 的当前可运行版本 `7c412b8` 建立（**不是**从旧 `main` 建立）。

**用户可见变化**：**无**（首次建立，功能与稳定版 `0.3.0.0` 一致）。
> 但运行期代码**有差异**：demo 的 `page-bridge.js` 是 AI-1 版（`793ba9e1…`），含 Stage 5.1 的 P1 `CREATION_IDENTITY_LEAK` 修复；稳定版为 `17141f7c…`，**不含**该修复。
> 这一差异是 `demo` 分支存在的核心理由（详见 `docs/DEMO_INSTALL.md` §3）。

**OCR 状态**：

```text
REAL_OCR_PROVIDER（本地 tesseract chi_sim 引擎能力）  = PASS   （side-page 实测）
OCR → 重建链路（mapper / matcher / textbox / rollback） = PASS   （Stage 5.5 demo 全链）
engine-in-editor（编辑器页引擎可达）                   = BLOCKED（CSP + requirejs AMD）
BASIC_REAL_OCR_DEMO_PRODUCT                           = BLOCKED
→ 结论：图片识别在产品内不可用
```

**真机状态**：

| 项 | 状态 |
|---|---|
| 交付物 URL 可达（HTTP 200） | ✅ PASS（自动验证，2026-09-16） |
| 4 个 `@require` 依赖可达 | ✅ PASS（全部 200，自动验证） |
| `page-bridge` = AI-1 版（P1 修复在生效） | ✅ PASS（sha256 实测 `793ba9e1…`） |
| ScriptCat 真实安装动作 | ⏳ **PENDING**（需人工） |
| 真实页面加载 + 面板出现 | ⏳ **PENDING**（需人工） |
| 粘贴 → 识别 → 填层真实落层 | ⏳ **PENDING**（需人工） |

**已知问题 / 限制**：

1. **图片识别（OCR）不可用** —— 引擎无法在编辑器页运行环境加载（`BLOCKED`，产品环境限制）。
2. 对象模型 / matcher / image-mapper / OCR provider **均未挂接生产** —— 正常使用不会触发。
3. README 标题仍为旧文案 `v0.2.3.11`（Demo 真实版本见横幅表格 `0.3.0.1`）。
4. 仅验证单一真实模板；旋转文字 / 多行字号未覆盖。

**安装 / 更新验收**：

```text
USER_INSTALLABLE     = PASS（自动可验证部分通过；人工安装动作 PENDING）
USER_UPDATEABLE      = PASS（@updateURL/@downloadURL 与脚本内 UPDATE_URL/DOWNLOAD_URL 均指向 demo）
REAL_FEATURE_USABLE  = 部分（套版填层可用；图片识别 BLOCKED）
```

**本次同步的 AI-1 commit**：`7c412b8`（Stage 5.5A 产品化审计）

**本条目对应的 demo 分支 commit**：

| commit | 说明 |
|---|---|
| `0fa8303` | chore(demo): retarget userscript metadata to demo branch |
| `ceedbb5` | docs(demo): add demo branch banner with fixed install URL |

---

## 维护规则

1. **一版一条**，不合并、不覆盖历史条目（历史即证据）。
2. `Version` 与 sha256 **必须同时记录** —— 版本号可能重名（demo 与 main 曾同为 `0.3.0.0`），sha256 才是无争议标识。
3. `OCR 状态` 必须区分 `PASS` / `BLOCKED` / `PARTIAL` / `未挂接`，**禁止写「基本可用」「快好了」**。
4. `真机状态` 必须区分 **已验证** 与 **待人工**；未跑过的一律 `PENDING`，不得推断。
5. 禁止把 `BLOCKED` 的 Demo 描述成稳定版（`docs/BRANCH_POLICY.md` §3.2）。
