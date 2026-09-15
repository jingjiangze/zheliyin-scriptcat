# CHANGE_PROPOSAL — Stage 1：Fields 核心纯函数边界 + 测试边界

> 提案日期：2026-09-15 | 状态：已实施（本文件为执行前决策记录）

## 问题
`zheliyin-card-assistant.user.js`（约 1300 行）中，`normalizeFields/mergeFields/mergeTwoFields/parseJsonFromText/清洗与行判定谓词` 等纯业务函数与 UI/AI/Bridge 同处一个 IIFE，导致：这些核心逻辑不可独立测试、任何 UI 改动都可能误碰字段逻辑、未来 OCR 无法复用。

## 目标
把「字段核心纯函数」从主脚本中**逐字平移**为独立模块，作为多种运行形态（ScriptCat / 扩展 / exe）共用的**单一事实来源**；并为这些函数建立可执行单元测试（43 例，无框架）。

## 当前实现
- 19 个纯函数 + `NAME_EXCLUDED_RE` 内嵌在 userscript IIFE 中（Golden Master main `6c19b46` 原样）。
- AI 分面/抽字、UI 渲染、Bridge 均直接调用这些函数。

## 拟议方案
1. 新建 `extension/src/fields/field-core.js`：只含纯函数（无 DOM/window/GM_*/AI），逐字复制。
2. userscript 增加 `// @require .../main/extension/src/fields/field-core.js`（ScriptCat/Tampermonkey 在主体前拼接执行，作用域共享），并删除主体内已平移的定义。
3. 浏览器扩展：manifest `js` 数组按序加入 `src/fields/field-core.js`（同一结构，无 @require 依赖）。
4. exe 安装器：Actions 内嵌 `extension/` 目录，天然包含该文件，无需改构建逻辑。
5. 测试：`tests/field-core.test.js`（无框架断言，浏览器/Node 双跑）+ `tests/run-tests.html`，用本机 Edge headless 执行作为可复现证据。

## 为什么选择
- 收益最高的两个边界（§二十三 B+E）：纯函数可测性 + 未来 Editor/OCR 直接复用该模块。
- 风险最低：函数逐字平移，行为零变更；不动 AI/Prompt/Bridge/UI 交互。
- 单一副本：三种运行形态共用一份文件，不产生代码漂移。

## 替代方案
- @require 引仓库 `src/`（不在 extension/ 内）→ 会与扩展内嵌目录不一致，产生两份。**否决**。
- 保留原样、只加测试 → 无法达成本阶段「边界清晰」目标。**否决**。
- 立即建全套 `src/` 多模块 + 构建工具 → 违反 Stage 1「1~2 个边界」与不引入构建体系。**否决**。

## 影响范围
- 修改：`zheliyin-card-assistant.user.js`（删除 19 函数定义 + 增 1 行 @require）、`extension/manifest.json`（js 数组 +1）、`extension/assistant.js`（重新生成，去重定义）。
- 新增：`extension/src/fields/field-core.js`、`tests/field-core.test.js`、`tests/run-tests.html`。
- 不改：版本号、AI Prompt、Bridge 协议、字段业务规则、UI 交互。

## 测试方案
- 结构：wiring-check（三个文件加载顺序下 19 个函数全部可解析）。
- 单测：43 断言（clean/unique/剥离/行判定/normalize/rawIncludes/cleanMultiline/parseJsonFromText/merge 语义/追加语义/地址-主营混淆）。
- 全程 Edge headless 执行，输出 ALL-PASS/Fail 计数。

## 回滚方案
- 回滚 A（低风险）：`git revert` 单个 refactor commit 即可恢复主脚本原样（@require 移除 + 定义恢复）。
- 回滚 B：仓库 tag `stage-1-baseline`（Stage 1 起点）与 `r0-audit`（Stage 0 终点）均可 `git checkout` 还原整段产物。

## 已确认的真实行为怪癖（测试断言锁定，不改）
实际执行中发现以下 Golden Master 原行为（与直觉不同但为既有语义，测试已断言锁定）：
1. `mergeFields` 补空字段不要求 AI 值命中原文；**仅替换已有值**要求命中。
2. `normalize` 数组项会过 `stripLabel`（如"微信客服"→"客服"）。
3. `stripBackExtraLabel` 不剥"公司简介："前缀（仅裸"简介："）。
4. 单数 key（phone）仅在复数 key（phones）为空时兜底。
以上均记为行为契约，如未来需要修正须单独立项。