# CHANGELOG.md — 折立印名片套版助手

> 格式依据 Keep a Changelog 简化版。版本号与主脚本 `@version` 保持一致。

## [Unreleased]

### Stage 5.6 P0 hotfix（2026-09-17）— v0.3.8.1：BRIDGE_NO_REPLY 分级二段（真机第 2 轮反馈）
- 真机确认失败分支为 `BRIDGE_NO_REPLY`（抽屉已出现、非早点击、同 thirdDiyAdd.do 入口）：失败时重试注入桥一次，并区分根因——`pageBridge` 模块缺失（@require 下载失败 → 提示重装/换扩展版）vs 桥注入但无响应（画布在 iframe → 提示刷新/重新安装/检查脚本启用）。
- init 增加 `[zy-ocr][INIT]` 依赖加载状态日志（无敏感信息），便于远程定位。
- 版本统一 0.3.8.1（userscript/manifest/assistant/README/DEMO_REAL_MACHINE_TEST）。

### Stage 5.6 P5（2026-09-17）— v0.3.8.0：几何矩阵验证 + 旋转最小修复（P5-D）
- P5-2 真机几何矩阵（runtime/stage5-6-p5-geometry.js，10 格）：A 基础 / B 缩放 0.5/2 / C 位置 / E 多尺寸 500/2000 / F 背景图全部 PASS（角点误差 ≤22px）；旋转 D(15/45/90°) FAIL（textbox 未携带角度 + 轴对齐盒与旋转文字区不重合，误差随 θ 增至 222px）。
- P5-3 最小修复（仅两处，不重写 Mapper）：`buildItemsFromOcr` 对 θ≠0 输出旋转中心+角度+center 原点；page-bridge `ocrCreate` 应用 angle/originX/Y=center。θ=0 路径零改动。修复后矩阵复跑验证。
- 版本统一 0.3.8.0（userscript/manifest/assistant/README/DEMO_REAL_MACHINE_TEST）。

### Stage 5.6 hotfix（2026-09-17）— v0.3.7.1：画布就绪提示分级 + 超时加长（P0 真机反馈）
- 真机反馈「编辑器画布长时间未就绪（30 秒）」：`waitForCanvasReady` 从 30s→60s，并将失败原因分级（BRIDGE_NO_REPLY=桥未注入/画布在 iframe vs CANVAS_NOT_FOUND=编辑器还没加载出画布），给出可操作自查提示（刷新页/确认在设计编辑页/扩展「允许用户脚本」）。
- 版本统一 0.3.7.1（userscript/manifest/assistant/README/DEMO_REAL_MACHINE_TEST）。

### Stage 5.6（2026-09-17）— OCR-only Demo：最小停用套版助手 UI（交付B）
- Demo 主 UI 切换为原生右栏「图片文字识别」抽屉：默认不再挂载旧套版浮窗 `#zy-card-assistant`（renderPanel/套版字段/正反面/诊断等代码完整保留，仅停用挂载入口）。
- 初始化调整（最小改动）：`addStyles`/`installPageBridge`/`checkForUpdateSoon` 前置到 `initZheliyin`（三者均幂等，renderPanel 内保留原调用），`OCR_ONLY_MODE = GM_getValue("zyShowTemplatePanel","0") !== "1"` 决定是否挂载浮窗；原生右栏缺失的页面变体自动回退浮窗兜底。
- 恢复开关：脚本存储 `zyShowTemplatePanel="1"` 可恢复套版浮窗（含豆包 AI 设置/字段网格/正反面套版/诊断/更新提示）。
- 版本统一 0.3.7.0（userscript @version / const VERSION / manifest / assistant / README / DEMO_REAL_MACHINE_TEST）。
- 审计：`docs/STAGE_5_6_OCR_ONLY_DEMO_AUDIT.md`（UI 结构/依赖矩阵/停用方案/风险/最小修改）；指令归档 `docs/ai-instructions/stage-5.6/001-ocr-demo.md`。
- 回归：单测保绿 + 真机 ScriptCat 三场景（背景图/选中图/早点击）Native OCR 主链 → 可编辑 Textbox；套版代码保留（静态 + 开关恢复动态验证）。
- 未改动：field-core/config-core/ai-client/page-bridge/baidu-provider/fallback-policy/candidate-normalizer/credential-crypto/OCR 主链。

### Stage 5.5B（2026-09-16）— OCR 产品化（云端备用 + 面板工具化，进行中）
- 修复「识别图片文字点按钮无反应」双重根因：① `bindPanel` 绑定已移除的 `#zy-probe` → 提前 TypeError → OCR 按钮未绑定（恢复诊断按钮 + 防御性绑定）；② 隔离世界读不到 requirejs `CanvasObjVO` → 直读画布返回 null。② 按既有桥机制根治：`page-bridge.js` 新增只读消息 `getCanvasInfo` / `ocrPrepare`（页面世界解析目标图 active→背景图→首图 + element→toDataURL + 显示几何），userscript 改 `waitForCanvasReady`（Promise 轮询真实 ready 信号，非固定 sleep）+ 过早点击显式「正在等待编辑器加载…」状态。
- 新增百度云 OCR（用户已确认选型：百度通用文字识别 + 保留本地）：`extension/src/ocr/baidu-provider.js`（2026-06 官方文档核对：`/rest/2.0/ocr/v1/general` 标准含位置版；token 30 天缓存 + 110/111 自动刷新；≤4M/≤4096px 压缩保护；错误码人话映射）+ 面板「识别方式」（自动/仅本地/百度云端）+「百度云 OCR」AK/SK 脱敏存储/测试连接；`fallback-policy.js` local-first 决策矩阵。
- 版本统一 0.3.6.0（userscript @version / const VERSION / manifest / assistant / README）。
- 测试：单测 10 套件全 PASS（新增 baidu-provider 18 项、fallback-policy 14 项）；真机 ScriptCat 诊断：TIMELINE panel@2207ms canvas@3274ms；CANVAS_READY（桥）+ ocrPrepare `background-image 900×1200` 打通；LOCAL_LOADING 引擎已加载（场景 A/B/C 全量回归执行中）。
- 归档：用户指令 `docs/ai-instructions/stage-5.5b/001-p1-p8-closeout.md`（全文）、执行记录 `docs/execution-records/stage-5.5b/001/002`、证据 `docs/evidence/stage-5.5b/`。
- 待办：P2 原生面板 DOM 审计 → P3 Native Panel→Local→Textbox → P6 背景图三态验收 → P7 真机人工验收 → P8 报告与 GATE 逐项。

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