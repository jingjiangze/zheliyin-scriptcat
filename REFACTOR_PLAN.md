# REFACTOR_PLAN.md — 渐进式重构计划（R0 产物，仅设计）

> 目标：保持旧行为（BEHAVIOR_BASELINE.md §2 契约 18 项）不变，逐边界抽离模块，最终支撑图片 OCR 能力。
> 方法：Controlled / Strangler Refactor。每个阶段单独 commit、单独可回滚、需通过 TEST_PLAN.md 门禁。

---

## 0. 目标架构（仅设计，不落地）

```
src/
  core/      utils.js  constants.js  storage.gm.js(仅包装 GM_*)
  config/    config.js（get/set/migrate + CONFIG_VERSION）
  fields/    model.js  normalize.js  parser.js  predicates.js  split.js  merge.js
  ai/        aiClient.js  errors.js  prompts/{splitSides.v3,extractFields.v4,imageText.v1}
  editor/    bridgeClient.js  adapter.js  coordinate.js（OCR 阶段）
  features/  cardFill.js  （后续：imageText.js）
  ui/        panel.js  diagnostics.js  logger.js
主文件 zheliyin-card-assistant.user.js = 组装入口（metadata + 依赖引用）
```

约束：不引入构建工具链；拆文件后主脚本通过拼接分发（保持 ScriptCat 单文件可装），或维持「userscript 即源、构建脚本合成」两条路线（先验证拼装后再定）。

## 1. R0（当前已完成）

只读审计 + 6 份文档（ARCHITECTURE_AUDIT / BEHAVIOR_BASELINE / DEPENDENCY_MAP / TEST_PLAN / REFACTOR_PLAN / CHANGELOG）+ Golden Master 快照（main `6c19b46`）。
禁止项全部保持未执行。

## 2. R1 — 最小、可回滚、低风险工程修复

范围（**不拆业务模块，不动 prompt 内容，不改 bridge 协议**）：
1. AI 错误分类：401/403/429/5xx/timeout/network/malformed JSON/empty 分类枚举 + 用户可见摘要（**不放完整响应体**）。
2. 日志规范：引入脱敏 logger 包装（Key/Authorization 一律 `***`），UI 提示与调试分离。
3. AI Key 安全：设置项收口（面板 key 输入改掩码展示、提供「测试连接」「清除 Key」）。
4. 配置键兼容：登记 CONFIG_KEY 映射表（zyArkBaseUrl vs zyBaseUrl 语义），不迁移、只打标。
5. 非破坏性诊断：诊断中心（页面匹配/设计器加载/canvas/文字层与图片层数/bridge 状态/AI 配置/版本；一键复制；不含 Key/Cookie/Token）。
6. 测试夹具落地 + TEST_REPORT.md 首版执行（Case A–M 纯逻辑 + 状态）。

验收：契约 18 项无回归；Case A–M PASS；错误文案区分度可见。
回滚：单 PR/分支，任一 FAIL 即 revert；改动集中在 aiClient 外壳与 logger，不触碰业务判定。

## 3. R2 — 开始拆（每次只迁移一个边界）

顺序：Config → Fields → AI Client。
1. `src/core/*`：clean/unique/clamp/escapeHtml/compareVersion/parseJsonFromText/常量（纯平移，行为零变更，可先独立合并）。
2. `src/config/config.js`：`{ get, set, migrate }`，内部仍是 GM_* 兼容层；引入 `CONFIG_VERSION=v1` 与迁移骨架（**不触发**）。
3. `src/fields/*`：谓词/分面/抽取/merge/normalize 原样平移（测试先行：先把谓词 fixture 跑绿再搬）。
4. `src/ai/aiClient.js` + `src/ai/prompts/*`：三处请求收敛为 `aiClient.chat()`；prompt 文本原样提出并标记版本；错误分类复用 R1。

验收：单测绿（fixtures）+ 浏览器真机 A/O/Q 无差异。
回滚：每一子步独立 commit（`refactor: extract config layer` 等），可逐 commit revert。

## 4. R3 — 拆 Bridge / Editor Adapter / Generated Layer

1. `src/editor/bridgeClient.js`：封装 postMessage（requestId/timestamp；**新消息兼容旧 type**），业务层不再裸调 postMessage。
2. `src/editor/adapter.js`：`{ getTextObjects, getImageObjects, createTextObject, updateTextObject, deleteTextObject(助手层), getCanvasInfo, removeGeneratedObjects }`，内部调用 bridge；禁止业务层直接碰 canvas 对象。
3. `src/editor/coordinate.js`（预留）：imagePixels→normalized→design→editor（OCR 阶段启用，本阶段只建空壳签名）。

验收：apply/probe 回归（Case N/P/Q/R/S/T）；`BRIDGE-RISK-001/002/003/004` 逐个关闭并复测。
回滚：bridgeClient 保持原 postMessage 协议，切回旧路径只需替换一行引用。

## 5. R4 — Run / TextObject / Feature Layer

1. `runId`（例 `20260915-085900-abc123`）+ 批量操作上下文（feature/created/updated/removed），记录到 `state.lastRun`（不持久化，或经 config 存储诊断）。
2. TextObject 标准化中间模型（id/content/source/bbox/polygon/rotation/direction/style(含 fontFamily/fontSize/fontWeight/color/lineHeight/letterSpacing)/confidence/metadata），**不直接操作页面**。
3. 生成层标签增强：保留 `zyCreatedByAssistant/zyFieldKey`，新增只读 `zyFeature/zyRunId/zySource`；清理条件收敛 `zyGenerated===true && zyFeature∈当前 feature`。
4. `safeMode` 配置（不删模板对象/AI 低置信不自动应用/建层前预览/失败即停）默认关闭。

验收：清理逻辑只增标签不改语义；重复执行/撤销原型可用。
回滚：标签为附加属性，旧版不识别即忽略，无风险。

## 6. R5 — 图片 OCR（「图片拆字」第一阶段）

范围（**第一阶段禁止**：擦除原文字、AI 重绘背景、直接操纵设计器）：
1. 选图 → OCR（本地引擎或受控 API，由 aiClient 扩展 `imageText` prompt）→ TextObject[]（content/bbox/polygon/rotation/direction/confidence，尽量 color/fontSize/fontWeight）。
2. 坐标经 `coordinate.js` 转换后才进 adapter。
3. UI：识别结果预览（内容/置信度/位置/颜色/字号/字体候选），低置信标「需要确认」；支持 全部应用/应用选中/取消/重新识别；默认处理模式=识别+创建文字；模式3（识别+清除原文字）待背景修复能力后再开放。
4. 字体：类别候选（黑/宋/楷/圆/手写/英文衬线/无衬线）→ 字体库候选 → 渲染尺寸 → bbox 拟合，取最接近候选；不声称 100% 还原。
5. 事务化：一次图片拆字 = 一个 runId 事务，可整体撤销。

验收：本地图片夹具（image-text）→ TextObject 中间结果稳定；画布文字可编辑；模板原图未动。

## 7. Git 与回滚纪律

- 每阶段独立 commit；禁止 R0+R1+R2 混提。
- 推荐 commit 前缀：`docs:` / `test:` / `refactor:` / `fix:` / `feat:`，含具体模块名。
- 提交前必查：`git diff/status`、语法检查、metadata、契约回归、test 结果；每个 commit 用自己的 reason 记录 PASS/FAIL/UNKNOWN。
- 回滚原则：迁移 = 新增接口 → 旧实现改调新接口 → 测试 → Golden Master 对比 → 删旧实现；任一环 FAIL 回退该 commit。

## 8. 「第一刀切在哪里」结论

**第一刀 = R1 中的「AI 错误分类 + 脱敏日志 + Key 掩码」三位一体小改动。**
理由：
1. 命中风险最高项（AI-RISK-002 用户把 Key 问题当成反馈；DATA-RISK-001 Key 明文）；
2. 完全不动业务判定/分面/merge/apply —— 满足「与业务解耦」最小面；
3. 收益直接可感知（错误提示能区分 401/429/超时），且可由 Case J/K/L/M 自动回归；
4. 回滚成本最低（外壳层，单 commit revert）。
次要候选（可并行）：纯工具函数平移（utils/constants 零行为变更）。

## 9. 是否具备渐进式重构条件

**结论：YES（具备）。**
依据：Golden Master 已锁定（main `6c19b46` + v0.3.0）；契约 18 项已文档化；依赖/风险/迁移边界已登记；回归矩阵已定义；每阶段回滚方式明确。
前置条件：本机/仓库需可靠 git 工作流与可复现的测试执行环境（建议 R1 首日建 Node 或 harness），否则进度回退到「文档驱动 + 真机人工核对」模式。