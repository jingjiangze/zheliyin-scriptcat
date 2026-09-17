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

### Demo v0.3.5.0 · 2026-09-16

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
