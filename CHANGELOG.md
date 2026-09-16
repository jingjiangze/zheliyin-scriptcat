# CHANGELOG.md — 折立印名片套版助手

> 格式依据 Keep a Changelog 简化版。版本号与主脚本 `@version` 保持一致。

## [Unreleased]

### 仓库治理（第二轮，2026-09-16）— 并行开发的轨道治理，**零生产代码变更**
- 建立三轨模型并落文档：`docs/BRANCH_POLICY.md`（四条长期分支、写入规则、版本与 tag 规则、demo 元数据自洽硬要求、单向同步方向、发布标准）、`docs/RELEASE_LINEAGE.md`（四分支血缘表、三级溯源、`@require` 运行期依赖血缘、同步流程与冲突预案）。
- **新建 `demo` 分支**（从 AI-1 当前实现 `7c412b8` 建立，**不是**从旧 `main` 建立）。固定安装地址：`https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js`（原则上永不变，变的是分支内容）。
- **修复一个真实缺陷**：AI-1 分支的 userscript 把 `@require`×4 / `@updateURL` / `@downloadURL` 与脚本内 `UPDATE_URL` / `DOWNLOAD_URL` 共 **8 处**全部指向 `main`；而 `extension/src/editor/page-bridge.js` 在两分支不同（`main` sha256 `17141f7c…` vs AI-1 `793ba9e1…`，差异即 Stage 5.1 的 P1 `CREATION_IDENTITY_LEAK` 修复）。后果：① ScriptCat 安装该分支实际加载 `main` 的 page-bridge，P1 修复不生效；② demo 的更新地址指向 `main`，会把 demo 用户更新回稳定版。demo 分支已在 `0fa8303` 全部切到 `demo`，并端到端实测 page-bridge 实为 AI-1 版。
- demo 版本 `0.3.0.0` → `0.3.0.1`（第 4 段作 demo build 计数；理由：脚本内 `compareVersion` 按 `parseInt` 逐段比较，带后缀会歧义），并同步 4 处版本点（userscript `@version` 与 `VERSION`、`extension/assistant.js` `VERSION`、`manifest.json` `version_name`）。`@name` 保持不变以免被脚本管理器视为第二个脚本导致双面板。
- 新增文档：`docs/DEMO_INSTALL.md`（安装 + 三级独立验收字段）、`docs/DEMO_RELEASE.md`（发布清单，首条 Demo v0.3.0.1）、`docs/AGENT_SYNC_PROTOCOL.md`（双 AI 协作边界、开工发现流程、变化分类、**反模式：不要让仓库变成文档驱动代码**）、`docs/STAGE_GATE_POLICY.md`、`docs/REAL_MACHINE_EVIDENCE.md`、`docs/OCR_DEPENDENCY_POLICY.md`。
- `docs/CURRENT_STATUS.md` 新增「分支状态表」（Branch / HEAD / Purpose / Installable / Stable，从 Git 实时取数），并声明为**唯一总状态页**（禁止 `_2` / `_NEW` / `_FINAL` 变体）。
- `README.md` 安装章节改为三轨（稳定版 / Demo 版 / 手工安装并**保留**旧方式），新增「轨道总览」与「文档导航（按角色）」。
- 隐私再审计（第二轮，按 §二十九）：新增 `FINDING-SD-04`（OCR 驱动会把编辑器真实图片 base64 写入报告的**潜在**路径 —— 本次因引擎 BLOCKED 未触发，但 Stage 5.6 引擎装载成功即生效）、`FINDING-SD-05`（识别文本片段入库的潜在路径）。
- 新增轻量 CI（`.github/workflows/test.yml`）：userscript 元数据一致性检查 / Node 单元套件 / 语法与 JSON 校验 / secret scan，全部零依赖（无 npm install、无浏览器）。该 CI 的 secret scan 立刻抓到并修掉了治理文档自身写入明文账号的问题。
- **未执行**：不合并 `main`、不 rebase AI-1、不 force push、不改写 AI-1 历史、未补打任何 tag。

### 仓库治理（2026-09-16）— 文档/测试组织/版本治理，**零生产代码变更**
- 新增 9 份治理文档（`docs/`）：`REPOSITORY_MAP`（真实目录与调用链测绘）、`STAGE_INDEX`（R0→Stage 5.4→RUNTIME-8.3 索引）、`EVIDENCE_POLICY`（REAL/FIXTURE/SYNTHETIC/SMOKE/UNIT/INTEGRATION/BLOCKED/DEFERRED 八级定义）、`CURRENT_STATUS`、`TEST_MATRIX`、`REAL_OCR_DEMO_CONTRACT`（AI-1/AI-2 共享接口契约，含 GAP-1~GAP-7）、`DEVELOPMENT_RULES`、`PARALLEL_DEVELOPMENT`（职责边界与文件所有权）、`SENSITIVE_DATA_AUDIT`。
- 澄清历史表述：**Stage 5.3 的 Reconstruction PASS = FIXTURE_OCR 链路验证，不等于 Real OCR 已完成**；`NATIVE_OCR_RESULT_ACCESS = BLOCKED` 如实保留。
- 记录 `RUNTIME-8.2` 的「Chromium 不支持 userScripts」结论**已被 RUNTIME-8.3 撤回**（真实根因：Chrome 138+ 需开启 Allow User Scripts）；历史结论保留不删。
- 测试复跑确认：7 套件 **215 断言全部通过**（`editor-object-model` 110 / field 43 / config 15 / ai 18 / editor 18 / bridge-lifecycle 6 / wiring 5）。**未搬迁任何现有测试文件**。
- `.gitignore` 窄口径加固：补 CI 生成物（`installer/embedded.generated.ps1`、`installer/installer.combined.ps1`）、`.env*`、`*.pem/*.key/*.har`、`cookies//tokens/`、通用构建日志产物；明确禁止 `*.png/*.json/*.txt/*.js` 宽通配以免误伤夹具与证据。验证 `git check-ignore` 零误伤。
- `README.md` 规范化：修正标题版本 `v0.2.3.11` → `v0.3.0.0`（与 `@version` 一致，**不改代码版本号**）；新增 Current Status 章节，严格区分**正式能力 / 实验能力（未挂接生产）/ Real OCR（BLOCKED+DEFERRED）/ Fixture OCR**；原有 19 条功能说明与安装步骤完整保留。
- 版本一致性核对：`@version` = `VERSION` = `version_name` = `0.3.0.0` ✅；`package.json` `0.1.0` 属 runtime harness（`private:true`）无关；**未新增/未重打任何 tag**。
- 敏感信息扫描：无 API Key / Token / Cookie / 真实客户数据入库；1 项中低风险 finding（`runtime/autologin.js` 注释含真实账号）已记录并建议由实现线处置。
- Stage 4.1 / RUNTIME-0~8.3 / Stage 5.0~5.5 的逐阶段记录**不在本文件重复维护**，见 `docs/STAGE_INDEX.md` 与各阶段审计报告（避免双份记录漂移）。
- 治理文档已同步至 **Stage 5.5A** 基线（`7c412b8`）：`CURRENT_STATUS`（real OCR → PASS）、`STAGE_INDEX`（补 5.5 行）、`TEST_MATRIX`（8 套件 132 断言，合计 237）、`REPOSITORY_MAP`（补 OCR Provider 层）、`REAL_OCR_DEMO_CONTRACT`（补 provider 契约，关闭 GAP-1/2/5，GAP-8 探测为 BLOCKED）、`README`（Real OCR 章节重写并可读性告警）。
  补充：**区分 Demo 级与产品级** —— Stage 5.5 = `BASIC_REAL_OCR_DEMO` PASS（Demo 级）；Stage 5.5A = `BASIC_REAL_OCR_DEMO_PRODUCT` **BLOCKED**（引擎在编辑器页运行环境不可达）。两者不可互相替代。

### Stage 4.0（2026-09-15）— Bridge/Runtime 独立审计 + 最小加固（Stage 4 Gate=CONDITIONAL-GO）
- 修复 **AUDIT-BRIDGE-002（P1，跨 userscript 实例重复注入）**：`pageBridge()` 增加页面主世界稳定 marker（`window.__ZY_CARD_ASSISTANT_BRIDGE__`），同 window 内任何实例/热更新/重复执行只安装一次 listener；listener 注册成功后才落 marker（异常可重试）。
- 回归：bridge-lifecycle 6/6（新增 t6 跨实例用例，修复前 FAIL=2 个 listener；修复后 PASS）×3 稳定；Mutation（移除 marker）→ FAIL 2/6，还原后 ALL-PASS；wiring 5/5、field 43/43、config 15/15、AI 18/18、editor 18/18 全绿。
- 审计结论：P0=0、P1=0；P2 记录项 5（同 window 伪造消息 nonce 不引入、@connect * + 自定义 endpoint、@updateURL 指向 main、inheritReferenceProps 黑名单复制、requestId 预留）；UNVERIFIED：ScriptCat/扩展真机、iframe 拓扑、设计器画布。
- 详见 `docs/STAGE_4.0_AUDIT.md`；未实现 OCR / 未重写任何模块。

### Stage 3.2（2026-09-15）— Bridge 运行期修复 + 再审计（P1 关闭，Stage 4 Gate=CONDITIONAL-GO）
- 修复 AUDIT-BRIDGE-001（P1，独立审计实测 dup:1:2）：`installPageBridge` 防护由「会被 remove 的 DOM id」改为**稳定的闭包标志**（同一运行内只注入一次；注入失败允许重试）；`__ZY_DEBUG__`（仅 ?zydebug）新增 `installPageBridge` 导出。
- 新增 Bridge 生命周期回归（5/5 PASS ×3 稳定）：installPageBridge ×5 后 probe 仍恰 1；minimize 收起/展开 ×4（真实 UI 路径）仍恰 1；install×3+minimize×2 后 apply 恰 1（只执行一次）；t5 机制验证测试对重复注册敏感。Mutation A（移除 guard）→ 测试 FAIL 4/5，证明回归有效。
- 修复范围最小：仅 userscript 生命周期逻辑（约 12 行）+ 生成物同步；未改 Field/Config/AI/Editor/Bridge 协议/UI/标签/postMessage targetOrigin（仍 location.origin）。
- 再审计结论：P0=0、P1=0 → Final Verdict=PASS WITH TECHNICAL DEBT；Stage 4 Gate=CONDITIONAL-GO（前提：ScriptCat/扩展/设计器真机三连验证）。
- 详见 `STAGE_3_2_REPAIR_AND_REAUDIT.md`（Stage 3.1 独立审计报告保留原样）。

### Stage 3.1（2026-09-15）— Runtime Wiring 复核 + 生产入口检查（源码零修改）
- 复核：main/stage-3-complete/stage-3-baseline 对应关系；6 文件 GitHub==本地一致；`function pageBridge` 唯一定义于 `extension/src/editor/page-bridge.js`（Userscript @require 4 行 / Extension manifest 6 项按序加载 / assistant 无 inline copy）。
- 升级 `extension/wiring-check.html` 为生产入口检查（5/5 PASS）：模块可解析 → 桥接注入 → probe/apply 真实往返 → 失败不吞 → toString 唯一实现。
- `EDITOR_OBJECT_NOTES.md` OCR 能力问卷补充证据分级（STATIC/HEADLESS/UNVERIFIED）。
- Final Verdict：**PASS WITH TECHNICAL DEBT**（EDITOR-RISK-001 业务耦合 P2、BRIDGE-RISK-001/002、KEY-UI）；生产源码零修改（§47 最小原则）。
- 未动：旧 tag、Bridge 协议、标签语义、apply 行为、UI、版本号、OCR/Unified Object。

### Stage 3（2026-09-15）— 运行时一致性 + Bridge 特征化 + 最小 Editor 边界（行为零变更）
- 一致性核实：main HEAD 与 stage-2-complete 对齐；6 个核心文件 GitHub==本地逐字节一致；Stage 2「收口」在真实 main 中成立。
- 新增 `extension/src/editor/page-bridge.js`（Editor 边界唯一事实来源）：pageBridge 整段逐字抽取，注入方式不变；可独立于主脚本测试。
- 新增 Editor/Bridge 边界测试（canvas mock，18/18 PASS）：协议形状/Probe 只读/已有层只改文本样式不动/克隆样式/top 钳制/富余助手层清理/模板层保护/C1 阈值与空画布新建/both/无画布友好失败。
- 新增 `EDITOR_OBJECT_NOTES.md`：对象属性问卷（读写能力 13/13 代码确认，rotation/图片层待真机）。
- 未改：Bridge 协议/消息格式、标签语义、applyFields 全套行为、UI、版本号（0.3.0.0）。
- 待真机验证：ScriptCat @require（4 模块）、扩展刷新、设计器画布（UNVERIFIED）。

### Stage 2（2026-09-15）— Config 单一来源 + AI 边界稳定 + 失败回归（行为零变更）
- Config：新增 `extension/src/core/config-core.js` 单一事实来源；`getConfig` 统一解析并含历史 `zyBaseUrl` 一次性迁移（读优先级 zyArkBaseUrl > zyBaseUrl > 默认）；`saveConfig` 双 key 同步；`parseFields` 不再直接读 GM key。
- AI：新增 `extension/src/ai/ai-client.js`（统一请求/结构化错误模型 NETWORK/TIMEOUT/HTTP/INVALID_JSON/CONFIG + retryable 标记 + 脱敏 + 可注入 transport）；`splitSidesByDoubao/parseByDoubao` 改为薄封装，Prompt 逐字保留。
- 测试：config-core 15/15 PASS；ai 传输矩阵 10/10 + 业务级 fallback/merge 8/8 PASS；field-core 回归 43/43 PASS；wiring-check 通过。
- 增加 `#zydebug`（hash/query）诊断出口，供无头/浏览器回归调用内部引用。
- 未动：AI Prompt、Bridge 协议、字段业务规则、UI 交互、版本号（0.3.0.0）、retry（本阶段不引入，按 §十六 判定）。
- 待真机验证：ScriptCat `@require` 三模块加载、扩展刷新、画布套版、真实 AI 链路（UNVERIFIED）。

### Stage 1（2026-09-15）— 稳定核心 + 可测试边界（行为零变更）
- 新增 `extension/src/fields/field-core.js`：19 个字段核心纯函数单一事实来源（逐字平移，行为与 Golden Master 一致）。
- userscript 改为经 `@require` 加载 field-core，删除主体内重复定义；浏览器扩展 manifest 按序加载同一文件；exe 安装器内嵌目录天然包含。
- 新增无框架单元测试 `tests/field-core.test.js` + `tests/run-tests.html`，Edge headless 执行 **43/43 PASS**。
- 新增 `CHANGE_PROPOSAL.md`、`tests/TEST_REPORT.md`。
- 锁定 5 项 Golden Master 行为怪癖为行为契约（不修改，见 CHANGE_PROPOSAL）。
- 未动：AI Prompt / Bridge 协议 / 字段业务规则 / UI 交互 / 版本号（仍 0.3.0.0）。
- 待真机验证：ScriptCat `@require` 加载、画布套版、AI 链路（列为 UNVERIFIED）。

### R0（2026-09-15）— 只读审计与基线，无代码变更
- 新增 `ARCHITECTURE_AUDIT.md`：完整架构审计（仓库结构/逐函数地图/Config/AI/Bridge/Fields/State 地图、风险编号、上帝函数分析）。
- 新增 `BEHAVIOR_BASELINE.md`：Golden Master 快照（main `6c19b46`，tag `v0.3.0`）+ 兼容性契约 18 项。
- 新增 `DEPENDENCY_MAP.md`：依赖图与高扇出识别。
- 新增 `TEST_PLAN.md`：回归矩阵 Case A–T 与夹具定义。
- 新增 `REFACTOR_PLAN.md`：R1–R5 渐进式迁移计划与回滚策略。
- 新增 `tests/fixtures/`：6 份合成样例输入（basic-card / multi-phone / multi-address / front-back / english-company / mixed-language）。

## [0.3.0.0] — 2026-09-10

### 修复（相对 0.2.3.11）
- 新建文字图层改为「克隆参考图层」继承设计器类属性（可双击编辑、字体一致、不再与画布割裂）。
- 修复 `placeCreatedObject` 无参考对象时 top 被覆盖的问题（统一按布局钳制）。
- 收紧兜底选层：不再把字段写进任意未用图层。
- 多值字段每类最多 3 个图层项，超出并入末项；新层 top 钳制在画布内。
- 分面规则：免疫「纯中文 2–4 字行」把主营/反面词误判正面；姓名判定排除业务/区块词。
- 电话正则加前后边界断言，避免从 QQ 号/订单号长串误截。
- 微信扫描扩展到正反面全部行。
- 中文公司名候选择优（有限公司/集团结尾）并剥离尾部部门词。
- 反面主营多项拆分填入，不再拼成一条。
- baseUrl 改读已存配置；面板位置保存兼容。

### 新增
- 浏览器扩展版（`extension/`：manifest MV3 + gm-shim + assistant）免脚本猫。
- 一键安装器（`installer/installer.ps1`，GitHub Actions 自动构建 exe）。
- GitHub Actions 工作流 + v0.3.0 Release（含 exe 资产）。
- 更新提示改为面板内链接，替代被拦截的 alert/window.open。
- 内容脚本 `all_frames:true`（兼容 iframe 内运行的设计器）。
- 画布自检按钮（probe/probeResult）。

### 架构注记
- git 提交信息含 "v0.3.1" 字样但 `@version` 为 0.3.0.0——版本号语义待 R1 统一（见 ARCHITECTURE_AUDIT.md ARCH-RISK-002）。

## [0.2.3.11] — 2026-06-12

- 分面四步逻辑（显式标记→强正→强反→模糊）；分面后纠偏拉回中英文公司/联系/地址至正面。
- 本地规则优先、AI 仅补空；AI 不可用回退本地。
- 界面精简：识别并填正反面/追加信息/填正面/填反面。
- 多电话/地址/微信/邮箱/网址多行字段；界面不显示「电话1/电话2」。
- 清理助手生成但本轮不再需要的图层；保留模板原层；GitHub 更新提示。