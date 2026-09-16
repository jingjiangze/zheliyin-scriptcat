# 折立印名片套版助手 v0.3.0.0

> 版本以主脚本 `@version` 为准（当前 `0.3.0.0`）。历史标题 `v0.2.3.11` 已过时，本次修正。
> 能力状态与证据等级见 [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md)。

## 项目用途

在折立印在线设计器页面上运行的**用户脚本 / 浏览器扩展**：把客户资料（公司、姓名、职位、电话、微信、邮箱、网址、地址、主营范围）解析为结构化字段，并填入设计器画布。

产品契约：**优先复用模板已有文字图层，只改文字；不足时才新建图层。**

## 功能

- 优先填入画布已有文字图层。
- 已有文字图层只改文字，不强制改字号、位置和样式。
- 只有已有文字图层不够时，才新建文字图层。
- 新建文字图层尽量继承附近已有文字图层的字体、颜色、字号、行高和位置节奏。
- 多电话、多地址、微信、邮箱、网址会识别为多行字段。
- 画面文字不会出现“电话1、电话2、地址1、地址2”，只显示“电话：...”和“地址：...”。
- 正面优先填公司、姓名、职位、电话、微信、邮箱、网址、地址。
- 字段区分为正面内容和反面内容。
- 反面可填主营范围和反面补充内容，避免把主营范围挤到地址或联系信息里。
- 本地规则优先分类，AI 只辅助补充，不允许覆盖本地地址和主营范围判断。
- 界面精简为常用操作：识别并填正反面、追加信息、填正面、填反面。
- 先把整段客户文字粗分成“正面文本 / 反面文本”，再显示出来让你手动微调。
- AI 先辅助区分正反面，再按分区内容提取字段；AI 不可用时会回退到本地分面规则。
- 脚本元数据已指向 `jingjiangze/zheliyin-scriptcat`，并在检测到新版本时弹窗打开新版安装地址。
- 分面后会再次纠偏，把中英文公司名、联系方式、地址、姓名职位优先拉回正面。
- 分面逻辑改为四步：先识别前面强特征行，再识别反面强特征行，再归类模糊行，最后再做字段抽取。
- 会清理助手自己生成但本次不再需要的多余文字图层，不删除模板原有文字。
- 保留追加信息和 GitHub 更新提示。
- 不包含“默认布局”“留白布局”“扫描图层”等按钮。

## 安装

**三种安装轨道，按需选择。** 旧的「手工粘贴」方式**保留未删除**（见下方）。

| 轨道 | 版本 | 适合 | 来源 |
|---|---|---|---|
| **稳定版** | `0.3.0.0` | 日常使用 | `main` 分支 |
| **Demo 版** | `0.3.5.0` | 试用最新实现（实验性，含图片识别按钮） | `demo` 分支 |
| 手工 / 扩展 / 安装器 | — | 离线或特殊环境 | 见下方各节 |

### 稳定版安装（推荐）

安装地址（脚本猫打开即装）：

```text
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js
```

1. 安装 [ScriptCat](https://scriptcat.org/)
2. 打开上面的地址 → 点「安装」
3. 打开折立印设计器页面（需登录）

### Demo 版安装（实验性）

固定安装地址（**装一次即可**，以后由 ScriptCat 自动更新，地址不变）：

```text
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
```

> ⚠️ **这是实验版本**。真实版本号见 `@version`（当前 `0.3.5.0`）；面板内「版本：」显示脚本内 `VERSION`，**当前两者不一致（`0.3.0.1`）**，属已知缺陷 `DEFECT-VER-01`（见 [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) §3）。
> **当前能力**：新增 **「识别图片文字」按钮**（本地 Tesseract，图片不上传）；套版填层等既有功能正常。识别质量仍在改进（Stage 5.9）。
> 详细说明见 [`docs/DEMO_INSTALL.md`](docs/DEMO_INSTALL.md)，发布记录见 [`docs/DEMO_RELEASE.md`](docs/DEMO_RELEASE.md)。

### 手工安装（原有方式，保留）

1. 打开脚本猫。
2. 新建脚本。
3. 粘贴 `zheliyin-card-assistant.user.js` 全部内容并保存。
4. 打开折立印设计器页面使用。

> 主脚本通过 `@require` 从本仓库加载 4 个模块（`field-core` / `config-core` / `ai-client` / `page-bridge`），需要能访问 `raw.githubusercontent.com`。

### 浏览器扩展（MV3）

加载 `extension/` 目录为未打包扩展（`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序）。

### 一键安装器

`installer/installer.ps1`（GitHub Actions 会为 `v*` tag 自动构建 `exe` 并发布 Release）。
## 使用

1. 打开折立印设计器页面（需登录）。
2. 右侧出现「名片套版助手」面板。
3. 粘贴客户资料 → 点击「识别并填正反面」。
4. 若需微调，直接编辑面板里的「正面文本 / 反面文本」，再点「填正面」「填反面」。

无 AI Key 时全程本地规则可运行；填写 AI Key 后 AI 仅做辅助补充。

## Current Status

> 严格区分「正式能力」与「实验能力」。实验能力**不等于**稳定生产能力。
> ⚠️ **关于图片识别：目前你在浏览器里还用不上它** —— OCR 引擎无法在编辑器页运行环境中加载（详见下方 Real OCR 章节）。
> 完整表格、证据等级与证据文件路径见 [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md)。

### 正式能力（生产路径生效，可日常使用）

| 能力 | 状态 | 证据等级 |
|---|---|---|
| 脚本猫 / 扩展注入 + 面板运行 | ✅ PASS | REAL |
| 页面桥接（probe / apply） | ✅ PASS | REAL |
| 本地字段规则（分面 / 抽取 / 合并） | ✅ PASS | REAL |
| AI 辅助 + 失败回退本地 | ✅ PASS | UNIT + INTEGRATION |
| 填层：已有层只改文字 / 不足才新建 / 清理多余助手层 | ✅ PASS | REAL |
| 画布自检（probe） | ✅ PASS | REAL |

**当前限制**：仅验证于**单一真实模板**（multi-template 为 `PARTIAL`）；`line` / 生成层标签语义仍有 P2 技术债（见 `ARCHITECTURE_AUDIT.md`）。

### 实验能力（代码在仓库、有测试，但**生产路径不调用**）

> ⚠️ 以下模块**未挂接**主脚本。用户正常使用时**不会触发**它们。
> 它们目前只在 `runtime/stage5-*.js` 审计脚本里被驱动。

| 模块 | 作用 | 状态 |
|---|---|---|
| `extension/src/editor/object-model.js` | 编辑器对象 → 纯数据模型 | 已实现·未挂接 |
| `extension/src/editor/object-adapter.js` | 只读读取 + 最小 `setText` | 已实现·未挂接 |
| `extension/src/editor/object-matcher.js` | 确定性对象匹配 | 已实现·未挂接 |
| `extension/src/ocr/ocr-model.js` | OCR 候选纯数据模型 | 已实现·未挂接 |
| `extension/src/ocr/ocr-provider.js` | 统一 OCR provider 接口（tesseract LOCAL + fixture） | 已实现·未挂接 |
| `extension/src/ocr/tesseract-loader.js` | tesseract 引擎懒加载（`GM_addElement` + chi_sim + IndexedDB 缓存） | 已实现·未挂接 |
| `extension/src/ocr/image-mapper.js` | 图片坐标 → Canvas 坐标 | 已实现·未挂接 |

### Real OCR

> **已在 Demo 分支可用（实验性）。** 状态：`REAL_OCR_PROVIDER = PASS`（本地）；`engine-in-editor` **由 `BLOCKED` 转为 `PASS`**（Stage 5.5A-R2 突破）；原生路径仍 `BLOCKED`。

- **本地 OCR 已选定并实测通过**：Tesseract.js（WASM，本地运行）—— `chi_sim` 模型，实测 18 words / bbox 18/18 / 平均置信度 **90.4** / 首跑约 3s / **零上传、零 key、全本地**。
- **原生「文字识别（Alt+Q）」仍不可用**：结果值无法程序化读取（面板绑定"相框"素材交互，无网络请求、无 postMessage、结果值不进 DOM）。

**因此**：仓库里已具备真实 OCR 能力并有真实证据，但**尚未挂接到助手面板**，你正常使用助手时不会触发它。

> ✅ **产品化突破（Stage 5.5A-R2）：`engine-in-editor = PASS`**（原 `BLOCKED` 已解决）
> 改用 **page-world OCR executor**（UMD `module`/`exports` 遮蔽 + `new Function` + `sourceMappingURL` 换行修复）。
> 真实编辑器实测 **15 步全 PASS、`errors: []`**；首次 2969ms → 缓存命中 **667/674ms**（IndexedDB 生效）；
> 链路：选中图片 → 识别 → mapper → matcher → **创建 3 个真 textbox**（editable / 思源黑体 Regular / `markuuid=null`）→ 参考图保留 → rollback 21/4/3。
>
> ⚠️ **不要把「机制跑通」当成「识别准确」**：真实编辑器样本上识别文本为 `个 时` / `如` / `NU`（3 行、词序乱），识别质量仍属**已知待改进项**（Stage 5.6 / 5.9）。

### Basic Real OCR Demo（真实 OCR → 可编辑文字）

> 🟡 **已有真实证据，但属实验能力（未挂接产品）。**

Stage 5.5 已验证这条链路成立：

```text
真实 OCR（tesseract chi_sim，6 行候选）
→ image-mapper（1000×800 natural × 0.45）
→ matcher（电话行 MATCHED，复用模板已有槽位；其余 NOT_FOUND 保护）
→ 创建 6 个真 textbox（editable / 思源黑体 Regular / markuuid=null）
→ 字号误差 3.3% → 参考图保留 → rollback 21/4/3 零残留
BASIC_REAL_OCR_DEMO = PASS（errors=0）
```

仍待解决：引擎注入方式（`GM_addElement`）需**真机一键验证**；行内词序质量（→ Stage 5.9）。

### Fixture OCR（历史链路验证）

> ⚠️ Stage 5.3 / 5.4 的演示链路 OCR 来源是 **fixture**，**不是真实 OCR**。

含义：`text` 与 `bbox` 由脚本按合成图的**已知绘制坐标**直接给出，再由 `image-mapper` → `object-matcher` → 在真实编辑器里创建真 `textbox`。链路本身（坐标映射 / 匹配 / 原生文字重建 / 编组 / 回滚）都是真实的。

> 之所以保留这一节：防止把 Stage 5.3 的 `Reconstruction PASS` 误读为"已支持图片识别"。**Stage 5.5 才引入了真实 OCR。**

## 当前限制

- **OCR / 文字重建尚未接入助手面板**：能力已在仓库并具真实证据，但生产路径不调用。
- 真实用户在网页内粘贴/拖拽图片的行为尚未在产品内验证（harness 自动化受限）。
- 引擎注入方式（`GM_addElement`）待真机一键验证。
- 仅验证单一真实模板；`back` 画布在该模板中不存在。
- 真实旋转**文字**对象无样本，旋转文字重建未验证（→ Stage 5.8）。
- 多行文本字号未覆盖（→ Stage 5.6 / 5.9）。
- 无用户可感知的"撤销"入口（→ Stage 5.13）。
- `parseFields` 为上帝函数（7 种外部依赖耦合），无单测，回归靠集成测试兜底。
- 扩展版 `all_frames: true` 暂无证据证明必要（保留待证）。

## 开发

```bash
# 单元测试（零依赖，无需浏览器 / 无需网络）
node tests/editor-object-model/run.js          # 8 套件 132 断言

# 浏览器套件（headless 打开对应 html，需 ?zydebug=1 的见括号）
#   tests/run-tests.html            field 43 + config 15
#   tests/ai-tests.html?zydebug=1   ai 18
#   tests/editor-tests.html         editor 18
#   tests/bridge-lifecycle.html?zydebug=1   bridge lifecycle 6
#   extension/wiring-check.html     生产入口接线 5

# 真实运行时（需 Node + Playwright + 已登录 profile）
npm run runtime:check        # 冒烟：浏览器启动 + 门户可达
npm run runtime:full         # 全链冒烟（未登录时编辑态项标 BLOCKED 属预期）
npm run runtime:scriptcat    # 真实 ScriptCat 全链（18 步）

# Stage 5.x 真实取证（逐个直接运行）
node runtime/stage5-5-real-ocr-demo.js
```

开发前请先读：

- [`docs/DEVELOPMENT_RULES.md`](docs/DEVELOPMENT_RULES.md) — 十条红线与提交流程
- [`docs/PARALLEL_DEVELOPMENT.md`](docs/PARALLEL_DEVELOPMENT.md) — 文件所有权与协作边界
- [`BEHAVIOR_BASELINE.md`](BEHAVIOR_BASELINE.md) — 不可变业务契约（18 项）
- [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) — 渐进式重构计划（**仅设计，未落地**）

## 阶段状态

### 轨道总览

| 轨道 | 分支 | HEAD | 版本 | 说明 |
|---|---|---|---|---|
| 稳定版 | `main` | `7446faa` | `0.3.0.0` | Stage 4.0；GitHub 默认分支 |
| **Demo（实验性）** | `demo` | `58337a8` | `0.3.5.0` | 真实用户试用；固定 raw 安装地址；**含图片识别按钮** |
| 开发中 | `stage-4.1-runtime-validation` | `7c412b8` | — | Stage 5.5A；AI-1 持续开发 |
| 治理 | `ai2-repo-governance` | — | — | 文档 / 规范 / 契约 |

> ⚠️ **GitHub 默认分支 `main` 只到 Stage 4.0**（落后开发线 66 个提交），不包含 Stage 5.x / RUNTIME-8.x / OCR 相关代码与证据。
> **想试用最新实现 → 装 Demo；想读最新代码 → 切到开发分支。**
>
> ⚠️ **不要直接安装开发分支的脚本**：它的 `@require` / `@updateURL` 仍指向 `main`，会加载 `main` 的 `page-bridge.js`（不含 Stage 5.1 的 P1 identity 修复）。Demo 分支已修正并实测验证。

当前结论：**引擎装载已突破（`engine-in-editor = PASS`）**，Demo 内可跑通图片识别；识别**质量**待提升（Stage 5.6 / 5.9）。

已定序路线：5.6 字号精确 → 5.7 颜色/粗细 → 5.8 旋转 → 5.9 多行/段落 → 5.10 复杂布局 → 5.11 智能匹配 → 5.12 编组 → 5.13 Undo → 5.14 Preview。

### 文档导航（按角色）

| 我是谁 | 该看什么 |
|---|---|
| 普通用户 | [安装](#安装) · [`docs/DEMO_INSTALL.md`](docs/DEMO_INSTALL.md) |
| 想了解当前能力 | [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) |
| 开发者 | [`docs/REPOSITORY_MAP.md`](docs/REPOSITORY_MAP.md) · [`docs/STAGE_INDEX.md`](docs/STAGE_INDEX.md) · [`BEHAVIOR_BASELINE.md`](BEHAVIOR_BASELINE.md) |
| 参与协作的 AI | [`docs/AGENT_SYNC_PROTOCOL.md`](docs/AGENT_SYNC_PROTOCOL.md) · [`docs/STAGE_GATE_POLICY.md`](docs/STAGE_GATE_POLICY.md) · [`docs/EVIDENCE_POLICY.md`](docs/EVIDENCE_POLICY.md) |
| 负责发布 / 分支 | [`docs/BRANCH_POLICY.md`](docs/BRANCH_POLICY.md) · [`docs/RELEASE_LINEAGE.md`](docs/RELEASE_LINEAGE.md) · [`docs/DEMO_RELEASE.md`](docs/DEMO_RELEASE.md) |
| 凭据 / 隐私 | [`docs/SENSITIVE_DATA_AUDIT.md`](docs/SENSITIVE_DATA_AUDIT.md) · [`docs/REAL_MACHINE_EVIDENCE.md`](docs/REAL_MACHINE_EVIDENCE.md) |
| OCR 相关 | [`docs/REAL_OCR_DEMO_CONTRACT.md`](docs/REAL_OCR_DEMO_CONTRACT.md) · [`docs/OCR_DEPENDENCY_POLICY.md`](docs/OCR_DEPENDENCY_POLICY.md) |
| 测试 | [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md) |

## GitHub

<https://github.com/jingjiangze/zheliyin-scriptcat>

脚本元数据已指向该仓库，检测到新版本时会在面板内给出更新链接。
