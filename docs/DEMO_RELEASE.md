# DEMO_RELEASE — Demo 发布清单（唯一 Demo 状态记录）

> 维护者：AI-2（Repository Governance 线）
> 本文件是**唯一的 Demo 发布状态记录**。Demo 的当前版本、对应 commit、交付物哈希、已知阻塞、真机状态，全部以本文件为准。
> 配套：`docs/DEMO_INSTALL.md`（安装与验收）、`docs/RELEASE_LINEAGE.md`（血缘）、`docs/BRANCH_POLICY.md`（分支与版本规则）

---

## 一、Demo Gate（四字段**独立**，不得压缩成一个 PASS）

每一次 Demo 状态判断，必须分别给出四个字段：

| 字段 | 含义 | 判定方式 |
|---|---|---|
| `DEMO_INSTALLABLE` | 用户能装上 | raw URL 200 + 元数据齐全 + `@require` 闭包自洽 + 人工安装动作 |
| `DEMO_UPDATEABLE` | 用户能更新 | `@updateURL`/`@downloadURL` 指向 demo；`@version` 单调递增；raw 可达 |
| `DEMO_FUNCTIONAL` | 功能真的能用 | **逐功能**判定，不看安装是否成功 |
| `DEMO_SAFE` | 隐私/凭据安全 | secret scan 通过；无真实图片/文字/凭据入库 |

> ❌ 禁止写成 `Demo = PASS`。四者经常不同：
> 例如 `Installable=PASS / Updateable=PASS / Functional=BLOCKED / Safe=PASS` 是完全合法的组合。

### 与「仓库状态」分离（同一条原则）

```text
ENGINE_TEST_PASS   ← 引擎/机制在测试环境能跑通
REAL_USER_PASS     ← 真实 ScriptCat 用户在真实页面完成闭环
```

**不得互相替代。** 本项目实例：`engine-in-editor` 已 `PASS`（机制层），但真实用户上传/粘贴图片 + 双击编辑仍是 `PENDING`。

---

## 二、记录规范

**只有满足以下之一才新增发布记录**（治理指令 §十一）：

```text
① 用户可安装
② 功能发生变化
③ 版本递增
```

纯诊断类 commit（`test:` / `probe:` / `audit:`）**不进发布表**。

每条记录必须含：

```text
Version | Commit | Date | Branch | Raw URL
主功能 | 已知阻塞 | 真机状态 | 四字段 Gate | 交付物 sha256
```

---

## 三、记录

### Demo v0.3.7.0 · 2026-09-17（当前）

| 项 | 值 |
|---|---|
| **Version** | `@version` = `0.3.7.0` |
| **Commit** | `7c1df21f85604899f88bf3862367754d7c5107d2`（tip；内容基线 `604f552795ef2bad9a6876705a5cd76e64376e36`） |
| **Date** | 2026-09-17 |
| **Branch** | `demo` |
| **Raw URL** | `https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js` |
| **userscript sha256（git = raw 实测）** | `b37018fece8c9ddfa3602b35a47e78da013726d3f9343c0c15bbca238d0033b2`（72705 bytes） |

> **`7c1df21` 为证据型提交**：新增 `docs/evidence/stage-5.6/` 与 `runtime/probe-gm-*.js` 共 16 文件（+966 −50），
> **userscript 字节未变**（sha256 与 `604f552` 完全相同）→ 发布交付物无变化，安装 URL 与用户侧行为均不变。
> 含 AI-1 执行记录 001：**OCR-only Demo 真机回归 22/22 PASS**（bg / active / early-click → 可编辑文本框；旧套版浮窗默认隐藏；`zyShowTemplatePanel=1` 恢复校验证明套版代码保留）。

**主功能（相对 v0.3.6.0 的增量）—— ⚠️ 这是一次产品范围变更**：

| 变更 | 说明 |
|---|---|
| **OCR-only Demo 模式（默认开启）** | `const OCR_ONLY_MODE = GM_getValue("zyShowTemplatePanel", "0") !== "1"`。默认**不再挂载旧套版浮窗**，Demo 主 UI 收敛为**原生右栏 OCR 抽屉** |
| **可恢复开关** | GM 值 `zyShowTemplatePanel="1"` 可恢复旧套版浮窗（豆包 / AI 设置 / 字段 / 正反面 / 诊断 / 更新提示） |
| **代码保留，仅停用挂载** | `renderPanel` 函数体与全部套版代码**完整保留**，非删除 |
| **初始化幂等提升** | `addStyles` / `installPageBridge` / `checkForUpdateSoon` 上提到 `init`，使 OCR 抽屉可独立工作（不依赖套版浮窗；`renderPanel` 内保留原调用作双保险） |
| **兜底** | `if (!OCR_ONLY_MODE || !nativeOk) renderPanel()` —— 原生右栏缺失（页面变体）时**仍挂载旧浮窗** |

**技术实现（AI-1）**：`45eb057`（OCR-only 模式 + 幂等提升 + 版本 0.3.7.0 同步）→ `604f552`（P5 OCR-only 真机 harness：bg/active/early-click 三场景 + OCR-only 默认断言 + refresh 不重复 + `zyShowTemplatePanel=1` 恢复校验 + rollback）→ `3481306`（P5 harness v2：改用官方 ScriptCat `serviceWorker/value/setScriptValues` 写值 API）→ `7c1df21`（证据归档 + 真机回归 22/22 PASS）。

**⚠️ 治理线判定的重要影响**：

```text
v0.3.6.0 及以前：Demo 默认能力 = 套版填层 + 图片识别（双功能）
v0.3.7.0 起    ：Demo 默认能力 = 仅图片识别（套版填层需手动开关恢复）
```

> 这意味着 **`DEMO_FUNCTIONAL` 的判定口径发生变化**：套版填层由「默认可用」变为「需开关」。
> 对**期待试用套版功能的用户**，这是一个**行为回退**（虽可恢复）。
> 治理线已如实登记，不视为缺陷（AI-1 依据用户指令 2026-09-17 主动收敛范围），但**必须在 `DEMO_INSTALL.md` 明确告知用户如何恢复**。

**已知阻塞**：

| 项 | 状态 |
|---|---|
| 识别质量（真实编辑器样本） | ⚠️ `PARTIAL` —— 词序/断行待改进，排入 Stage 5.9 |
| 真实用户上传/粘贴 + 双击编辑 | ⏳ `PENDING`（需人工真机，见 `docs/REAL_MACHINE_EVIDENCE.md`） |
| 百度真实链路（真 AK/SK） | ✅ `PASS`（AI-1 执行记录 008：真实百度 425ms → 3 个可编辑 textbox） |
| 旋转坐标映射 | ⏳ `PENDING`（`0ff2c69` 记录） |
| P5 OCR-only 真机（AI-1 侧） | ✅ AI-1 报告 harness PASS；**治理线未复跑**（需 Playwright + 真实编辑器） |

**真机状态**：

| 层级 | 状态 | 证据 |
|---|---|---|
| `ENGINE_TEST` | ✅ `PASS` | `tests/editor-object-model/run.js` —— **12 套件全 PASS**（AI-2 于 `604f552` 与 `7c1df21` 各复跑一次，`exit=0`） |
| `REAL_USER` | ⏳ `PENDING` | 尚未由真实用户完成「上传图片 → 点按钮 → 双击编辑 → 二次识别 → 更新」闭环。**注**：AI-1 的 22/22 属 ScriptCat 真实引擎自动化回归（`REAL_ENGINE`），**不等于**真实用户手工闭环（`REAL_USER`），二者不得互相替代 |

**四字段 Gate（AI-2 于 2026-09-17 对 `604f552` / `7c1df21` 实测复核）**：

```text
DEMO_INSTALLABLE = PASS   （raw 200；10 条依赖全部 200；@require 闭包全部指向 demo；元数据 PASS）
DEMO_UPDATEABLE  = PASS   （@updateURL/@downloadURL 指向 demo 且一致；@version 0.3.7.0 单调递增；raw 可达）
DEMO_FUNCTIONAL  = PARTIAL（图片识别 + 百度兜底 + 原生面板可用；套版填层默认停用需开关；识别质量与旋转映射待改进）
DEMO_SAFE        = PASS   （secret scan 通过；凭据 AES-GCM 加密落库；日志零图片/零凭据；真实图片未入库）
```

**本版本交付物校验（AI-2 实测）**：

| 检查 | 命令 | 结果 |
|---|---|---|
| 依赖闭包（结构） | `node runtime/check-demo-closure.js --ref 7c1df21 --expect-branch demo` | ✅ `PASS`（10 条全 `branch-consistent`） |
| 依赖闭包（联网） | 追加 `--net` | ✅ `PASS`（10 条全 HTTP `200`，`violations: []`） |
| 更新链 | `node runtime/check-demo-update.js --ref 7c1df21` | ✅ `PASS`（raw 200 / 72705 bytes / 0.3.7.0 ≥ 已记录 0.3.6.0） |
| 版本四处 | `manifest` / `assistant.js` / userscript | ✅ `0.3.7.0`（`manifest.version` = `0.3.7`） |
| 单元测试 | `node tests/editor-object-model/run.js` | ✅ **12/12 套件 `ALL PASS`，exit=0** |
| 密钥扫描 | `node .github/scripts/secret-scan.js` | ✅ `PASS`（0 error，1 项预存 warning） |
| raw 与 git 一致性 | sha256 比对 | ✅ raw = git(`604f552`) = git(`7c1df21`) = `b37018fe…`（72705 bytes） |

---

### （历史）Demo v0.3.6.0 · 2026-09-17

| 项 | 值 |
|---|---|
| **Version** | `@version` = `0.3.6.0` |
| **Commit** | `e0abcf0211f331fe589513cc60fbc5f02c4bca39` |
| **Date** | 2026-09-17 |
| **Branch** | `demo` |
| **Raw URL** | `https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js` |
| **userscript sha256（git = raw 实测）** | `d6ff947c9796c3fc66061abd52159f464ce5d5d615e2a80a048968d83729ef3b`（71859 bytes） |

**主功能（相对 v0.3.5.0 的增量）**：

| 能力 | 说明 |
|---|---|
| **本地优先 + 百度云端兜底** | OCR 模式 `auto/local/baidu`；`auto` 下本地失败才切云端（§47 local-first） |
| **百度云 OCR provider** | `extension/src/ocr/baidu-provider.js`（新建）—— token 缓存 30 天 + 110/111 失效重试；`/rest/2.0/ocr/v1/general` 标准含位置版；4M/4096px 等比压缩护栏；官方错误码 → 中文人话 |
| **凭据加密落库** | `extension/src/ocr/credential-crypto.js`（新建）—— AES-256-GCM（WebCrypto），密文格式 `v1:<iv>.<ct>`；旧明文自动迁移并清零；无 WebCrypto → 拒存 |
| **统一候选边界** | `extension/src/ocr/candidate-normalizer.js`（新建）—— 本地 executor 私有 `lines{x0,x1}` 与 provider 候选统一为 `OCRCandidate{bbox{x,y,w,h},coordinateSpace,imageSize}`（P3 审计解耦） |
| **网页原生右栏面板** | OCR 抽屉邻接 `.rightPageBar.rightBar` + 右栏工具按钮；`MutationObserver` 处理 SPA 重挂载；旧浮窗保留为 fallback（P2-B） |
| **画布访问改走 page-bridge** | 隔离世界读不到页面 world 的 requirejs `CanvasObjVO` → 新增只读桥 `getCanvasInfo`/`ocrPrepare`；早期点击进入「正在等待编辑器加载…」并 Promise 轮询（无固定 sleep） |

**技术实现（AI-1）**：`799e96d`（P1 静默失败修复 + PREPARING 状态机 + 120s 超时）→ `eedc243`（双 provider）→ `1680c81`（接入百度 + `@connect aip.baidubce.com`）→ `52e2c7a`（local-first 策略）→ `455d823`（凭据加密）→ `3a9c369`（候选边界统一）→ `8bc428a`（原生面板）→ `936dce4`（画布走桥）。

**已知阻塞**：

| 项 | 状态 |
|---|---|
| 识别质量（真实编辑器样本） | ⚠️ `PARTIAL` —— 词序/断行仍待改进，排入 Stage 5.9 |
| 真实用户上传/粘贴 + 双击编辑 | ⏳ `PENDING`（需人工真机，见 `docs/REAL_MACHINE_EVIDENCE.md`） |
| 百度真实链路（真 AK/SK） | ✅ `PASS`（AI-1 执行记录 008：真实百度 425ms → 3 个可编辑 textbox） |
| 旋转坐标映射 | ⏳ `PENDING`（`0ff2c69` 记录） |

**四字段 Gate（AI-2 于 2026-09-17 实测复核）**：

```text
DEMO_INSTALLABLE = PASS   （raw 200；10 条依赖全部 200；@require 闭包全部指向 demo；元数据 PASS）
DEMO_UPDATEABLE  = PASS   （@updateURL/@downloadURL 指向 demo 且一致；@version 0.3.6.0 单调递增；raw 可达）
DEMO_FUNCTIONAL  = PARTIAL（套版填层可用；本地 OCR + 百度兜底机制 PASS；识别质量与旋转映射待改进）
DEMO_SAFE        = PASS   （secret scan 通过；凭据 AES-GCM 加密落库；日志零图片/零凭据；真实图片未入库）
```

**本版本交付物校验（AI-2 实测）**：

| 检查 | 结果 |
|---|---|
| `runtime/check-demo-closure.js --ref e0abcf0 --expect-branch demo` | ✅ `PASS`（结构闭包，10 条全 `branch-consistent`） |
| `runtime/check-demo-closure.js --net` | ✅ `PASS`（10 条全 HTTP 200，`networkUnknown: []`，`violations: []`） |
| `runtime/check-demo-update.js --ref e0abcf0` | ✅ `PASS`（0.3.6.0 ≥ 已记录 0.3.5.0，单调性成立） |
| `.github/scripts/check-userscript.js`（demo 树，`GITHUB_REF_NAME=demo`） | ✅ `PASS`（四镜像一致；URL 分支集合 = `{demo}`） |
| `tests/editor-object-model/run.js` | ✅ 12/12 套件 `ALL PASS` |

**raw 与 git 一致性（关键）**：`@updateURL` 与 `@downloadURL` 的 raw 响应 sha256 **均为** `d6ff947c…`，与 git `e0abcf0` 中的 userscript **完全一致**（71859 bytes）→ **CDN 无滞后、无缓存错版**。

**`DEFECT-VER-01` 复现状态**：

```text
修复前（v0.3.5.0 f3ae3cb）：已由 AI-2 统一四处为 0.3.5.0
AI-1 在 1680c81 引入 v0.3.6.0 时自行保持四处一致：
  @version 0.3.6.0 / const VERSION 0.3.6.0 / assistant.js 0.3.6.0 / manifest.version_name 0.3.6.0
  manifest.version = 0.3.6（@version 前三段，符合约定）
v0.3.7.0（604f552 → 7c1df21）继续保持四处一致，manifest.version = 0.3.7
状态：  RESOLVED → 保持 RESOLVED（AI-2 于 e0abcf0 / 604f552 / 7c1df21 三次复验 PASS）
```

**AI-2 审计发现（本版本）**：

| 编号 | 级别 | 内容 | 状态 |
|---|---|---|---|
| `FINDING-SD-04` | 🟠 中（潜在） | `runtime/stage5-5a-scriptcat-ocr-smoke.js:249` 把 `out` 整体写盘，其中 `out.gm.img.dataUrl` 为**真实名片图片 base64**；报告路径 `runtime/reports/stage5-5a-real-scriptcat-ocr.json` **未被 `.gitignore` 覆盖**。<br>**实测现状**：`e0abcf0` 中该报告仅 2009 bytes，`ocrRaw={err,injectMode,amdHint}`（引擎装载失败，未走到取图），**当前无真实像素入库**。<br>**风险**：一旦引擎装载成功（Stage 5.5A-R2 已达成前置条件），下一次运行即会提交真实图片。 | ⏳ `OPEN`（已移交 `docs/AI1_HANDOFF.md`） |
| `FINDING-ROBUST-01` | 🟢 低 | `runtime/check-demo-closure.js` / `check-demo-update.js` 原以 `process.cwd()` 定位仓库，非仓库根调用时误报「找不到 demo 引用」 | ✅ 已修（AI-2，改用 `path.resolve(__dirname,"..")` + `git -C`） |
| `FINDING-SCOPE-01` | 🟢 低（提示） | v0.3.7.0 默认停用套版浮窗 → 对期待套版功能的试用者是**行为回退**（可用 `zyShowTemplatePanel=1` 恢复） | ✅ 已登记（`DEMO_INSTALL.md` 增恢复说明） |

---

### （历史）Demo v0.3.5.0 · 2026-09-16

| 项 | 值 |
|---|---|
| **Version** | `@version` = `0.3.5.0` |
| **Commit** | `f3ae3cb1d18198fc3ce04b7af99f90b08e7e5663`（元数据修复） |
| **上一版 commit** | `58337a8f553c350537138208d9320d83b4a64690`（功能首发） |
| **Date** | 2026-09-16 |
| **Branch** | `demo` |
| **Raw URL** | `https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js` |
| **userscript sha256（git）** | 以 f3ae3cb 中的文件为准；**raw 的 sha256 以实测为准**（CDN 刷新前后会不同，用 `runtime/check-demo-update.js` 取） |

**主功能**：新增 **「识别图片文字」** 按钮 —— 本地 Tesseract.js（chi_sim）识别选中图片的文字，按原图位置创建**可编辑** textbox。

**技术实现（AI-1）**：page-world OCR executor（UMD `module`/`exports` 遮蔽 + `new Function` + `sourceMappingURL` 换行修复）+ `ocrCreate` 桥（`extension/src/editor/page-bridge.js` +19 行）。

**已知阻塞**：

| 项 | 状态 |
|---|---|
| 识别质量（真实编辑器样本） | ⚠️ `PARTIAL` —— 3 行、词序乱（`个 时` / `如` / `NU`）；属已知项，排入 Stage 5.9 |
| 真实用户上传/粘贴 + 双击编辑 | ⏳ `PENDING`（需人工真机，见 `docs/REAL_MACHINE_EVIDENCE.md`） |
| 背景图片 / 百度兜底 / 网页原生面板 | ⏳ `TODO`（AI-1 后续） |

**真机状态**：

| 层级 | 状态 | 证据 |
|---|---|---|
| `ENGINE_TEST` | ✅ `PASS` | `runtime/reports/stage5-5a-executor-report.json` —— 15 步全 PASS、`errors: []`；首次 2969ms → 缓存 667/674ms |
| `REAL_USER` | ⏳ `PENDING` | 尚未由真实用户完成「上传图片 → 点按钮 → 双击编辑 → 二次识别 → 更新」闭环 |

**四字段 Gate**：

```text
DEMO_INSTALLABLE = PASS   （raw 200；元数据齐全；@require 闭包全部指向 demo；人工安装动作待复验）
DEMO_UPDATEABLE  = PASS   （@updateURL/@downloadURL 指向 demo；@version 0.3.5.0 单调递增；raw 可达）
DEMO_FUNCTIONAL  = PARTIAL（套版填层可用；图片识别机制 PASS，识别质量待改进）
DEMO_SAFE        = PASS   （secret scan 通过；无真实图片/文字/凭据入库）
```

**本版本包含的两个 commit**：

| commit | 性质 | 说明 |
|---|---|---|
| `58337a8` | feat | 「识别图片文字」按钮 + executor + `ocrCreate` 桥 + demo 元数据 |
| `f3ae3cb` | fix | **`DEFECT-VER-01` 修复**：统一 `const VERSION` / `assistant.js VERSION` / `manifest.version` / `version_name` 到权威源 `@version = 0.3.5.0`；README 版本表同步更正（原为 0.3.0.1） |

**`DEFECT-VER-01` 状态转移**：

```text
修复前：@version 0.3.5.0  vs  const VERSION / assistant / manifest = 0.3.0.1
        → 面板显示 0.3.0.1；更新检查以 @version 比较 → 每次误报「发现新版」
修复后：四处一致（0.3.5.0）；manifest.version = 0.3.5（前三段）
状态：  OPEN → RESOLVED（f3ae3cb）
```

---

### （历史）Demo v0.3.0.1 · 2026-09-16

| 项 | 值 |
|---|---|
| Version | `0.3.0.1` |
| Commit | `ceedbb55c8f5fb45507d5b2060e099ad081f012e` |
| Base | `7c412b8`（Stage 5.5A） |
| 说明 | AI-2 首次建立 `demo` 分支（从 AI-1 当前实现，**不是**从旧 `main`），修正 8 处指向 `main` 的 URL，并引入 demo build 版本计数 |
| 四字段 Gate | Installable=PASS / Updateable=PASS / Functional=PASS（仅套版填层）/ Safe=PASS |

> 保留此条仅作血缘记录。该版本自身 `@version` 与 `const VERSION` 是一致的（均 0.3.0.1）；
> 不一致是在 AI-1 的 `58337a8` 把 `@version` 改成 0.3.5.0 时引入的。

---

## 四、维护规则

1. **一版一条**或**一次可安装变更一条**，不覆盖历史。
2. `Version` 与 sha256 必须同时记录（版本号可能重名，sha256 才是无争议标识）。
3. 四字段 Gate 必须分开写；禁止 `Demo = PASS`。
4. `ENGINE_TEST` 与 `REAL_USER` 必须分开写；禁止互相替代。
5. 网络不可达时写 `DEPENDENCY_NETWORK_UNKNOWN`，**不得**据此写 FAIL（治理指令 §二十七）。
6. 修复类变更若**不改变** `@version`，作为**子条目**附在所属版本下，不新建版本行。
