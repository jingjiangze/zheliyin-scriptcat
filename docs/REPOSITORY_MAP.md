# REPOSITORY_MAP — 仓库地图

> 维护者：AI-2（Repository Governance 线）
> 生成依据：真实 Git 仓库 `jingjiangze/zheliyin-scriptcat`，基线 `stage-4.1-runtime-validation` @ `3becf04`（2026-09-16）
> 性质：**只读测绘 + 文档**。本文件不修改任何实现代码，也不定义新接口。
> 证据等级术语统一见 `docs/EVIDENCE_POLICY.md`。

---

## 0. 本文档的定位（先读这一段）

本文件描述**仓库当前真实的目录与调用链**，不描述设想中的架构。

> ⚠️ **重要差异声明**：外部治理指令描述的目录结构为
> `extension/src/ocr/**  bridge/**  object/**  mapper/**  matcher/**  editor/**`
> 与 12 个 Stage（含 Stage 5.0–5.4）。
> 真实仓库的目录是
> `extension/src/{ai,core,editor,fields,ocr}/`（**没有** `bridge/` `object/` `mapper/` `matcher/` 四个独立目录），
> 且 Stage 5.x 不在默认分支 `main` 上（详见 §8）。
> 本文档**以仓库真实结构为准**，不创建不存在的目录。

---

## 1. 项目目的

**折立印名片套版助手**（Zheliyin Card Layout Assistant）。

一个运行在折立印在线设计器页面（`diy.zheliyin.com`）上的**用户脚本/浏览器扩展**：把客户资料（公司、姓名、职位、电话、微信、邮箱、网址、地址、主营范围）解析成结构化字段，再按「优先复用模板已有文字图层、不足才新建」的产品契约填进设计器画布。

- 主脚本版本：`0.3.0.0`（`@version` 与 `const VERSION` 一致）
- 运行载体：ScriptCat 用户脚本 **或** MV3 浏览器扩展（二选一，同源码）

---

## 2. 入口（真实）

| 入口 | 文件 | 说明 |
|---|---|---|
| 用户脚本入口 | `zheliyin-card-assistant.user.js` | ScriptCat 直接安装的单文件入口（metadata + 组装） |
| 扩展入口 | `extension/manifest.json` | MV3；js 数组按序加载 `gm-shim.js` → `assistant.js` |
| 扩展主体 | `extension/assistant.js` | 主脚本主体（去 metadata 的等价物；由 PowerShell 从 userscript 同步生成） |
| 安装器 | `installer/installer.ps1` | ps2exe 打包一键安装器；CI 会注入 `extension/**` 的 base64 载荷 |
| CI | `.github/workflows/build-exe.yml` | push `main` 或 tag `v*` 时构建 exe 并发 Release |

`extension/src/**` 六个模块通过 **同一份源码、两种加载方式** 被引用：
- 用户脚本：`@require` 从 raw.githubusercontent 拉取（`RUNTIME-8.3` 实测 ×5 全部 HTTP 200）
- 扩展：manifest 按序加载
- 测试：Node `require` 直接加载

> 这是本仓库最重要的结构约定：**同一文件三种加载形态**（userscript / extension / node test），改动任一模块必须同时满足三者。

---

## 3. 真实运行时链路

### 3.1 完整链路（含真实证据标注）

```text
┌─ 载体 ───────────────────────────────────────────────────────────────┐
│ ScriptCat 用户脚本  或   MV3 浏览器扩展(extension/)                   │  REAL (RUNTIME-8.3)
│   （运行在页面 isolated world）                                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ installPageBridge() 注入 <script> 到页面主世界
                                │ 双层防重：闭包标志 + window.__ZY_CARD_ASSISTANT_BRIDGE__
                                ▼
┌─ page world 桥接 ────────────────────────────────────────────────────┐
│ extension/src/editor/page-bridge.js  (pageBridge / post / applyFields)│  REAL (RUNTIME-8.3)
│   协议：{source:'zy-card-assistant', type:'probe'|'apply'}            │
│        ↔ {source:'zy-card-assistant-page', probeResult|applyResult}   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 进入折立印设计器页面（**top window**）
                                ▼
┌─ 折立印页面 ─────────────────────────────────────────────────────────┐
│ top window = thirdLoginDiyEdit.do / thirdDiyAdd.do                    │  REAL (Stage 4.1)
│   requirejs（138 个模块：CanvasObjVO / CurrentCanvas / CanvasDiy）     │
│   iframe[0] id=mattingContent → about:blank（抠图占位，与编辑器无关） │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ findCanvasForSide()
                                │   getLoadedModule('CanvasObjVO') → totalCanvasArray[0]
                                ▼
┌─ Canvas / Fabric ────────────────────────────────────────────────────┐
│ fabric.Canvas（实测 619.5×376.8625，21 对象；当前模板仅 1 个 canvas）  │  REAL (Stage 5.0)
│   对象类型实测 6 种：textbox 4 / image 3 / path 3 / group 1 / rect 2 / line 8
│   ⚠ 所有对象 constructor.name === 'b'（webpack 压缩）→ 禁止按类名判型
└───────────────────────────────┬──────────────────────────────────────┘
                                │
        ┌───────────────────────┴────────────────────────┐
        │                                                │
        ▼ A. 产品链路（在生产，用户可见）                 ▼ B. 对象/OCR 链路（Stage 5，尚未挂接生产）
┌──────────────────────────────┐          ┌────────────────────────────────────────┐
│ legacy applyFields           │          │ object-adapter.js  （读 + 最小 setText）│
│   pickObject / scoreObject   │          │        ↓                               │
│   → setObjectText（只改文本） │          │ object-model.js    （纯数据模型/白名单）│
│   → createTextObject（克隆）  │          │        ↓                               │
│   → removeAssistantExtras    │          │ ocr-model.js       （OCRCandidate 纯数据）│
│   → placeCreatedObject       │          │        ↓                               │
└──────────────────────────────┘          │ image-mapper.js    （图片局部→Canvas AABB）│
                                           │        ↓                               │
                                           │ object-matcher.js  （确定性匹配，无 AI）│
                                           │        ↓                               │
                                           │ 创建真 textbox / fabric.Group           │
                                           └────────────────────────────────────────┘
```

### 3.2 与外部指令所画链路的逐项对照

| 指令链路节点 | 仓库真实对应物 | 状态 |
|---|---|---|
| ScriptCat | ScriptCat 扩展（真实安装运行已验证）或 MV3 扩展 | ✅ 已实现·REAL |
| userscript | `zheliyin-card-assistant.user.js` | ✅ 已实现·REAL |
| page-world bridge | `extension/src/editor/page-bridge.js` | ✅ 已实现·REAL |
| Zheliyin page | `diy.zheliyin.com`（top window + requirejs） | ✅ 已取证·REAL |
| Canvas / Fabric | `CanvasObjVO.totalCanvasArray[0]` | ✅ 已取证·REAL |
| Object Adapter | `extension/src/editor/object-adapter.js` | ✅ 已实现·**未挂接生产** |
| Object Model | `extension/src/editor/object-model.js` | ✅ 已实现·**未挂接生产** |
| OCR | `extension/src/ocr/ocr-model.js`（候选模型）+ 原生 OCR 入口（**结果不可程序读取**） | ⚠️ 模型有 / provider **BLOCKED** |
| Mapper | `extension/src/ocr/image-mapper.js` | ✅ 已实现·**未挂接生产** |
| Matcher | `extension/src/editor/object-matcher.js` | ✅ 已实现·**未挂接生产** |
| Textbox | fabric `textbox` 创建 + `fabric.Group` 编组 | ✅ 已验证·**仅 harness** |

> 指令中的 `extension/src/bridge/**`、`src/object/**`、`src/mapper/**`、`src/matcher/**` **在仓库中不存在**，对应能力实际位于 `extension/src/editor/` 与 `extension/src/ocr/`。本文档不新建这些目录。

---

## 4. 分层职责表

### 4.1 生产源码（`extension/src/**`）

| 文件 | 层 | 职责 | 加载形态 | 生产挂接 |
|---|---|---|---|---|
| `extension/src/fields/field-core.js` | 领域 | 19 个字段纯函数：分面谓词、抽取器、标签剥离、merge/normalize | 三形态 | ✅ 已挂接 |
| `extension/src/core/config-core.js` | 配置 | `getConfig/saveConfig` 单一事实来源 + 历史 `zyBaseUrl` 迁移 | 三形态 | ✅ 已挂接 |
| `extension/src/ai/ai-client.js` | 集成 | AI 统一传输 + 结构化错误（NETWORK/TIMEOUT/HTTP/INVALID_JSON/CONFIG） | 三形态 | ✅ 已挂接 |
| `extension/src/editor/page-bridge.js` | 编辑器边界 | 页面主世界桥接：probe / apply / 选层 / 建层 / 清理 | 三形态 | ✅ 已挂接 |
| `extension/src/editor/object-model.js` | 数据模型 | 真实编辑器对象 → 纯数据模型（白名单，禁持 raw 引用） | Node + 浏览器 | ⛔ 未挂接（就绪） |
| `extension/src/editor/object-adapter.js` | 适配器 | 只读读取 + 最小 `setText`；`zyGetVisualBounds` 优先 fabric AABB | Node + 浏览器 | ⛔ 未挂接（就绪） |
| `extension/src/editor/object-matcher.js` | 决策 | 确定性匹配 MATCHED/AMBIGUOUS/NOT_FOUND/ERROR（O(n)，无 AI） | Node + 浏览器 | ⛔ 未挂接（就绪） |
| `extension/src/ocr/ocr-model.js` | 数据模型 | `OCRCandidate` 纯数据 + `isUsable` 校验；provider 无关 | Node + 浏览器 | ⛔ 未挂接（就绪） |
| `extension/src/ocr/image-mapper.js` | 数学 | 图片局部坐标 → Canvas 全局 AABB（scale pre-multiply + 中心旋转） | Node + 浏览器 | ⛔ 未挂接（就绪） |
| `extension/gm-shim.js` | 宿主兼容 | GM_* → localStorage/fetch 兼容层 | 扩展 | ✅ 已挂接 |
| `extension/assistant.js` | 组装 | 主脚本主体（由 userscript 同步生成） | 扩展 | ✅ 已挂接 |
| `extension/wiring-check.html` | 自检 | 生产入口接线检查（5/5） | 浏览器手工 | — |

> **「未挂接」的准确含义**：文件已在仓库、已有单测，但主脚本生产路径**不会调用**它。因此它们的存在**不改变任何用户可见行为**（各阶段报告统一声明 `零行为变更`）。这一点最容易被误读，已在 `docs/CURRENT_STATUS.md` 显式标注。

### 4.2 测试（`tests/**`）

| 路径 | 类型 | 说明 |
|---|---|---|
| `tests/editor-object-model/run.js` | 运行器 | Node 聚合运行 6 个套件 |
| `tests/editor-object-model/*.test.js` | UNIT | object-model / object-adapter / object-diff / object-matcher / ocr-model / image-mapper |
| `tests/field-core.test.js` | UNIT | 43 断言 |
| `tests/config-core.test.js` | UNIT | 15 断言 |
| `tests/ai.test.js` | UNIT+INTEGRATION | 传输矩阵 + 业务 fallback，18 断言 |
| `tests/bridge-lifecycle.test.js` | INTEGRATION | 注入幂等/生命周期，6 用例 ×3 稳定性 |
| `tests/editor-bridge.test.js` | INTEGRATION | canvas mock 下的 apply 行为，18 断言 |
| `tests/*.html` | 浏览器 runner | headless 执行（`?zydebug=1` 打开内部引用） |
| `tests/fixtures/**` | FIXTURE | 6 份合成文本夹具 + 编辑器对象夹具 + OCR 夹具 + 合成测试图 |

### 4.3 运行时取证（`runtime/**`，非生产）

| 分组 | 内容 |
|---|---|
| 基础设施 | `browser-launcher.js` `check.js` `full.js` `attach.js` `scriptcat.js` `bridge.js` `canvas.js` `apply.js` |
| ScriptCat 接入 | `scriptcat-adapter.js` `install-scriptcat*.js` `probe-scriptcat-*.js` `enable-allow-user-scripts*.js` `vendor-sync.js` |
| RUNTIME-8 全链 | `runtime8-full-chain.js` `verify-gm-*.js` `verify-min-user-script.js` |
| Stage 5 审计 | `stage5-*.js` `stage5-3-*.js` `stage5-4-*.js` `editor-object-diff.js` `editor-object-identity.js` |
| 凭据入口 | `autologin.js` / `autologin3.js`（**凭据只经环境变量**，不入库——但见 `docs/SENSITIVE_DATA_AUDIT.md`） |
| 证据归档 | `runtime/reports/*.json`（42 份，全部脱敏） |

### 4.4 文档

| 位置 | 内容 |
|---|---|
| 仓库根 | R0 六份（`ARCHITECTURE_AUDIT` `BEHAVIOR_BASELINE` `DEPENDENCY_MAP` `TEST_PLAN` `REFACTOR_PLAN` `CHANGELOG`）+ `STAGE_REPORT_R0` / `STAGE_1_REPORT` / `STAGE_2_REPORT` / `STAGE_3_REPORT` / `STAGE_3_1_REPORT` / `STAGE_3_1_INDEPENDENT_AUDIT` / `STAGE_3_2_REPAIR_AND_REAUDIT` / `STAGE_4_1_RUNTIME_VALIDATION` / `RUNTIME_HARNESS_AUDIT` / `REAL_RUNTIME_GUIDE` / `CHANGE_PROPOSAL` / `EDITOR_OBJECT_NOTES` |
| `docs/` | `STAGE_4.0_AUDIT`、`STAGE_5_0..5_4` 五份阶段审计、`EDITOR_OBJECT_MODEL`、`EDITOR_OBJECT_PROPERTY_CLASSIFICATION`、`INHERIT_REFERENCE_PROPS_AUDIT`、`diy-runtime-forensics.js` |
| `docs/`（本次治理新增） | `REPOSITORY_MAP` / `STAGE_INDEX` / `EVIDENCE_POLICY` / `CURRENT_STATUS` / `TEST_MATRIX` / `DEVELOPMENT_RULES` / `PARALLEL_DEVELOPMENT` / `SENSITIVE_DATA_AUDIT` / `REAL_OCR_DEMO_CONTRACT` |

---

## 5. 两条数据链（务必区分）

### A. 产品链（legacy，生产中真实生效）

```text
面板输入 → parseFields（上帝函数）
  ├ 分面：splitSidesByDoubao(AI) ──失败──> splitFrontBackText(本地)
  ├ 抽取：parseByRulesFromSides(本地) → parseByDoubao(AI) → mergeFields
  └ 输出：applyFieldsToPage → postMessage → pageBridge.applyFields
                                              → pickObject/scoreObject
                                              → setObjectText / createTextObject
                                              → removeAssistantExtras
```

### B. 对象/OCR 链（Stage 5 审计链，**尚未接入产品**）

```text
EditorObject[]（object-adapter 读取）
   ↓ object-model 归一为纯数据
OCRCandidate（ocr-model；当前来源 = FIXTURE）
   ↓ image-mapper 坐标映射
object-matcher.match() → MATCHED / AMBIGUOUS / NOT_FOUND / ERROR
   ↓ （需显式"用户确认"策略）
创建真 textbox → fabric.Group 编组/解组 → rollback
```

> **两条链目前不交叉。** B 链只在 `runtime/stage5-*.js` 里被驱动，生产 `assistant.js` / `page-bridge.js` 不引用 B 链模块。这是 `Stage 5.x` 全部标 `零行为变更` 的原因。

---

## 6. 状态标记速查

| 标记 | 含义 |
|---|---|
| **REAL** | 真实网页 + 真实对象 + 真实输入下取得 |
| **FIXTURE** | 人为构造的候选/夹具 |
| **SYNTHETIC** | 脚本生成的测试图片/文本 |
| **SMOKE** | 只验主链路 |
| **UNIT / INTEGRATION** | 单模块 / 多模块真实组合 |
| **BLOCKED** | 真实环境拿不到必要信息 |
| **DEFERRED** | 已明确推迟 |
| **UNVERIFIED** | 尚未执行（不等于失败） |
| **未挂接** | 代码在仓库且有单测，但生产路径不调用 |

完整定义见 `docs/EVIDENCE_POLICY.md`。

---

## 7. 维护规则（本文件）

1. 本文件只在**目录/链路发生真实变化**时更新，不随每次 commit 变动。
2. 更新时必须核对：`git ls-files`、`extension/src` 实际文件、`package.json` scripts。
3. 不描述设想架构；设想放 `REFACTOR_PLAN.md`，且必须明确标注「仅设计·未落地」。
4. 若发现本文件与仓库不一致，**以仓库为准**并立即修订本文件。

## 8. 基线说明

| 项 | 值 |
|---|---|
| 测绘分支 | `stage-4.1-runtime-validation` |
| 测绘 commit | `3becf04` |
| 默认分支 `main` HEAD | `7446faa`（Stage 4.0） |
| 两者关系 | `main` 是 `stage-4.1` 的严格祖先（领先 58 commit / 落后 0，可快进） |
| 跟踪文件数 | 173 |
