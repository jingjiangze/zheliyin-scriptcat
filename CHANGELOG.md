# CHANGELOG.md — 折立印名片套版助手

> 格式依据 Keep a Changelog 简化版。版本号与主脚本 `@version` 保持一致。

## [Unreleased]

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