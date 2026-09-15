# CHANGELOG.md — 折立印名片套版助手

> 格式依据 Keep a Changelog 简化版。版本号与主脚本 `@version` 保持一致。

## [Unreleased]

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