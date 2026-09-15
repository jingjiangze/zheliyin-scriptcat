# Stage 1 Completion Report

> 日期：2026-09-15 | 阶段：Stage 1（稳定核心 + 可测试边界 + 渐进式解耦）

## 1. 当前 commit

main HEAD：`b4e8e90`（Stage 1 commit 链顶端，推送本报告前置顶）。

## 2. 当前版本

userscript `@version` / `VERSION` = `0.3.0.0`（本阶段未改版本号；元数据新增一行 `@require`）。

## 3. 本阶段目标

在不破坏套版行为前提下：把字段核心纯函数变成**可观察、可测试**的稳定边界（§二十三 方向 B 与 E：Fields 边界 + 测试边界）。

## 4. 实际完成内容

- **单一事实来源模块** `extension/src/fields/field-core.js`：逐字平移 19 个纯函数 + `NAME_EXCLUDED_RE`（emptyFields/clean/unique/stripLabel 系列/行判定谓词/normalize/merge/rawIncludes/cleanMultiline/parseJsonFromText）。
- **三种运行形态接线**：userscript 经 `@require` 加载；扩展 manifest `js` 数组按序加载同一文件；exe 内嵌 `extension/` 目录天然包含。**零代码复制、零漂移**。
- **可执行单元测试**（无框架，Edge headless 运行）：`tests/field-core.test.js`（43 断言）+ `tests/run-tests.html` → **ALL-PASS 43/43**。
- **结构接线验证**：wiring-check 19/19 函数跨文件可解析（`wired-ok`）。
- 文档：`CHANGE_PROPOSAL.md`、`tests/TEST_REPORT.md`、本报告；CHANGELOG 记录。

## 5. 实际修改文件

- `zheliyin-card-assistant.user.js`（删除 19 个重复定义 + 加 1 行 `@require`）
- `extension/manifest.json`（js 数组 +1）
- `extension/assistant.js`（重新生成，消除重复定义）
- `CHANGELOG.md`

## 6. 新增文件

- `extension/src/fields/field-core.js`
- `tests/field-core.test.js`
- `tests/run-tests.html`
- `tests/TEST_REPORT.md`
- `CHANGE_PROPOSAL.md`

## 7. 删除文件

无。

## 8. 选择了哪个重构边界

Fields 核心纯函数边界（B）+ 可执行测试边界（E）。未做：Config 收口、AI Transport、Bridge 封装、State 隔离。

## 9. 为什么选择它

最大可测试收益 + 最低风险：纯函数逐字平移行为零变更；单一副本同时服务 ScriptCat/扩展/exe 三种形态；复用路径直接为未来 Editor/OCR 铺路。其余方向要么风险高于收益（AI Transport 涉及错误语义与脱敏），要么当前收益低（Config 已有 getConfig/saveConfig；Bridge 协议受保护）。

## 10. 哪些原计划没有执行

1. AI Transport 统一（aiClient）——未做
2. AI 错误分类 / Key 安全 / 诊断中心——未做（属 R1 原提案，但本 Stage 范围聚焦边界与测试）
3. Config 收口 zyBaseUrl 二义——未做
4. Bridge 最小封装 bridge.send——未做（协议受保护，评估后收益/风险不划算）
5. 真机 ScriptCat 验证、画布回归——未执行

## 11. 为什么没有执行

- AI Transport：§十三/§十四 明确「不要求本阶段完整重构」，且正确做法需先定义错误分类与脱敏语义，改动面大于本阶段范围约束（1~2 个边界）。
- 真机验证：本环境无登录态与 ScriptCat 实例；@require 加载依赖 raw.githubusercontent 可达性，需用户真机确认。
- Config/Bridge：均非当前最高价值切口；Bridge 协议为 Compatibility Contract，无风险收益则不动。

## 12. 保持不变的业务行为

Compatibility Contract 18 项全部保持；AI Prompt/Bridge 协议/字段规则/UI 交互/版本号均未触碰；移动函数与 Golden Master 逐字一致。

## 13. 测试列表

见 `tests/field-core.test.js`（43 断言）与 `tests/TEST_REPORT.md`：clean/unique/strip 系列/行判定（地址-主营混淆）/normalize 相对论/parseJsonFromText 五态/merge 语义（补空 vs 替换门槛）/追加语义。

## 14. 测试结果

UNIT：**PASS 43/43**（Edge headless 实测，`zy-tests: ALL-PASS (43)`）；结构接线：PASS（wired-ok）。

## 15. 回归结果

行为对照 Golden Master 逐字一致；5 项怪癖（补空不要求命中、微信客服→客服、公司简介不剥、单数兜底条件、stripTrailingDept 锚点）已断言锁定为契约，非回归。

## 16. 未验证项目（UNVERIFIED）

- ScriptCat 真实 `@require` 加载（网络可达性与沙箱作用域）
- 浏览器扩展真机加载（需 chrome://extensions 刷新验证）
- 画布套版回归 Case N–T、AI 链路 Case I–M（需 Mock/真机）

## 17. 已知问题

- @require 增加启动期网络依赖：若 raw.githubusercontent 不可达，脚本整体不加载（管理器有缓存，风险低但真实存在）。
- 本机无 git/Node，提交经 GitHub REST API，测试经 Edge headless（可复现，但非 CI 集成）。

## 18. 新发现的风险

- REG-RISK-002（新增）：mergeFields「补空不要求原文命中」允许 AI 在字段缺失时写入未见于原文的值（如凭空职位）。已锁定为现有契约，建议 Stage 2 立 CHANGE_PROPOSAL 决定是否收紧（收紧属行为变更，需真实页面回归）。
- @require 依赖（见 §17）。

## 19. 技术债

同 R0 清单（AI-RISK-001/002、DATA-RISK-001/002、BRIDGE-RISK-*、ARCH-RISK-*），另新增 REG-RISK-002、@require 网络依赖；历史中文 commit message 乱码不改。

## 20. 当前架构

```
userscript(metadata+编排+UI+AI+Bridge)
   │ @require
   ▼
field-core（纯函数唯一来源；扩展/exe 同源）
   ▼
页面 Bridge → 设计器
```

## 21. 当前距离 OCR 还有什么缺口

- Editor Adapter 抽象（业务直连 bridge/页面对象）
- TextObject 统一中间模型 + runId/zyFeature 标签
- 坐标转换（imagePixels→normalized→design→editor）
- 视觉/OCR 后端边界（本地引擎或 API，未锁死）
- Style 候选与 Confidence 体系

## 22. 建议下一阶段

Stage 2 优先：**AI Transport 统一 + 错误分类 + 脱敏 + Key 安全**（命中 AI-RISK-001/002 与 DATA-RISK-001，外壳层、不碰业务判定）；同时为 AI 链路建立本地 Mock 测试（补 Case I–M 证据）。

## 23. 为什么建议下一阶段做这个

AI 相关风险是全项目 P1 占比最高的可快速收敛项；已有 field-core 测试通道可复用为「记录/断言 AI 降级行为」；脱敏与错误分类不改变任何调用方语义，回滚成本低；且 AI 层收敛后，OCR（同走 AI 边界）可以安全叠加。

## 24. 是否建议继续

**建议继续进入 Stage 2**（以 AI Transport 为切口）。

## 25. Git commit

```
b4e8e90  test: add stage 1 test report (43/43 PASS)
77be68d  test: add headless test runner page
d028977  test: add field-core unit tests (43 asserts)
6241c3c  refactor: load field-core before assistant in extension
4fc8301  refactor: sync extension assistant with field-core
3ae7f75  refactor: wire field-core via @require and drop duplicated definitions
fc9edac  refactor: add pure field-core module
4b4680c  docs: add stage 1 change proposal
（随后补两 commit：docs: add stage 1 completion report；docs: record stage 1 in changelog）
```

## 26. Git tag

- 起点：`stage-1-baseline` → 4549201
- 终点：`stage-1-complete` → 本报告推送后的 main HEAD

## 27. 完成度

| 项 | 状态 |
|---|---|
| Fields 纯函数边界抽离 | PASS（逐字一致 + wired-ok） |
| 可执行单测 | PASS 43/43（Edge headless 证据） |
| 三种形态接线 | PARTIAL（代码侧 PASS；ScriptCat/扩展真机加载 UNVERIFIED） |
| 旧行为保持 | PASS（契约 18 项未触及；行为怪癖锁定） |
| 总体完成度 | 75% —— 代码与测试证据完整；真机验证列为 UNVERIFIED，需用户完成 |

## Stop

按 Stage 1 指令 §三十三：报告完成即**停止**，不自行进入 Stage 2，等待项目负责人审查与下一阶段指令。