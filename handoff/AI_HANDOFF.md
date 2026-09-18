# AI_HANDOFF.md — 完整交接报告（2026-09-18）

> 本目录是 AI 接管 `jingjiangze/zheliyin-scriptcat` 的完整交接。
> 全部内容来自**实际运行/取证**，无编造结论；每条关键事实尽量附证据文件路径。
> 交接基线：`test` 分支（v0.3.10.2，P0 真机工作线）；`demo` 分支（v0.3.8.8，OCR Demo / Stage 6.x 线）为旁证参考；`main` 为稳定版（不修改）。

---

## 1. 项目现在是什么状态？

两条开发线并行，均已推送 GitHub（remote=`https://github.com/jingjiangze/zheliyin-scriptcat.git`）：

| 分支 | 版本 | HEAD | 内容 |
|---|---|---|---|
| `test`（默认工作线） | 0.3.10.2 | `c2b940d` | P0 真机 Runner 全链路（runtime/p0/runner.js 等）+ isDisplay 单变量实验 + 全部证据（runtime/reports/p0/） |
| `demo` | 0.3.8.8 | `e5cadf5` | OCR-only Demo 主界面 + Stage 5.6/6.x；含 TAKEOVER_AUDIT.md、project-history/（历史归档） |
| `main` | 0.3.0.0（README v0.3.8.x 行） | `6840170` | 稳定版轨道，**禁止直接修改**（仅 docs commit 记录） |
| `stage-4.1-runtime-validation` | — | `e9235af` | 引擎内 OCR executor（历史突破线），已归档 |
| `ai2-repo-governance` | — | `b24c930` | AI2 治理/审计工作分支 |

- `test` 分支当前工作区：`D:\zheliyin-scriptcat`（working tree clean 前的未提交证据见 §20，本次交接已归档提交）。
- P0 尚未解决（见 §4）。版本一致性：`@version`/`const VERSION`/9 处 `@require ?v=`/manifest `version_name` 全部 = 0.3.10.2，**无 0.3.10.1 残留**（已逐行核验，证据见 `handoff/AI_KNOWN_FACTS.md`）。

## 2. test 当前 HEAD 是什么？

- `test`：`c2b940d470577163e190e1f1625563a62559b10c`
- 最近 5 个提交（均属 P0 工作线）：
  - `c2b940d` test: 对齐历史脚本流程 — 不传图不点上传（消除换图弹窗），OCR 源=真实「当前图片」，抽屉先开、核稿闸门、let proofSurfaces
  - `70b875f` test: 核稿闸门 + proofSurfaces let 修复（印刷前必须确认核稿弹窗 hegaoOk，否则 FAILED_STAGE=HEGAO 截停）
  - `d684e5b` test: OCR 前先打开抽屉（handleOcrImage 检查 ocrPanelClosed）
  - `8472290` test: fix userscript injection — install 后 about:blank 再开编辑器文档；UI 未现 reload 重试
  - `82a0a44` test: real OCR runtime runner（ScriptCat 真实链路，固定图 fixtures/ocr-test.png，真实 #zy-native-ocr-btn）

## 3. main 是什么？

- `6840170`（docs: clarify install tracks），稳定版轨道。**规则：不直接改 main、不 force push**；需要时只从 test 完工后按仓库流程合入。
- 历史版本行：main 稳定版为 0.3.0.0 语义（README 版本表），demo/test 为实验/开发版。

## 4. 当前真正未解决的问题是什么？

**P0 = OPEN**，两症状（真机最新反馈）：
- 印刷后「自动核稿失败」；且「识别后无文字」类问题仍偶现。

直接证据（`runtime/reports/p0/`，最近运行 2026-09-18T03:04~05:00 UTC）：
- `submit-probe.json`：`submitUserDesign.do` 返回 `{"result":true,"loginState":"timeOut"}` → **印刷提交时登录态已过期**（核稿/印刷验证被会话踢出）。
- `proof-result.json`：4 次搜索点击 `reqDelta=2`，但 `beforeHegao/afterHegao=null`、`generatingHandled=0` → 核稿弹窗的请求特征未被捕获到（闸门检测盲区）。
- `suspect-object.json`：`located:false, mapped:null`，红框候选仅 `text-error-check`（x140,y559,w1170,h19.6）→ **红框未能映射到具体画布对象**，字段级根因尚未锁定。
- `control-result.json`（VARIANT:display0）：9 次 previews 中 8 次 `producestate:1` 成功、1 次 `producestate:3` 失败 → `isDisplay=0` 单向实验通过**但不排除其他字段**。
- `manual-vs-script-diff.json`：手工 Native textbox 与脚本生成 textbox 存在 17 个字段差异（font/visitLevel/isComposite/isPreview/topEnable 等），isDisplay 未在其中被对照 — 说明还需把 isDisplay 纳入系统对照。

## 5. 哪些结论已经实验验证（PASS）？

- **TextBlock 拆分/合并、Textbox 创建时序（demo 线 Stage 6.x）**：编辑器原生管线真机 hook 链 `Undo.save → drawText → createObjProductJsonDetail → canvas.add → checkObjsInProductJson → Undo.save`；`createdTextboxes==detectedBlocks`、`canvasTextCount==layerTextCount`、undo/redo 闭环（证据 `runtime/reports/stage-6-2-ocr-create-native-test.json`，demo 分支）
- **OCR-only Demo 22/22 真机回归**（stage-5.6，demo 分支 commit 3481306/7c1df21）
- **单测 13 suites 全 PASS**：`node tests/editor-object-model/run.js`（本次在 D:\ 已重跑确认；candidate-normalizer/credential-crypto/ocr-quality 等 14 passing 等）
- **isDisplay=0 单变量**：`control-result.json` 8/9 previews `success:true, producestate:1`
- **@require cache-buster 一致性**：9 模块 `?v=0.3.10.2` 全部一致（无 0.3.10.1 残留）
- **登录态持久化**：`sessionSource: MANAGED_PERSISTENT_PROFILE` 可被 runner 自主加载（`session-parity.json`）

## 6. 哪些结论只是候选（STRONG_CANDIDATE / 未定论）？

- **isDisplay=0 = STRONG_CANDIDATE**（非最终根因）：display0 实验存在 1/9 失败（producestate=3），且 serveable 未被系统对照。
- **P0 根因 = OPEN**：红框→对象映射 located=false，未锁定单一字段。
- **Save/Reload 持久化（demo 线）**：PENDING（自动化无登录时后端未写入内容库，需真实登录手动回填验证）。
- **全场 5 个搜索核稿**：proof-result 显示 `beforeHegao/afterHegao=null`（检测规则未确认）。

## 7. 旧 AI 平时怎么运行 Runner？

```powershell
cd D:\zheliyin-scriptcat
node runtime/p0/runner.js                 # 全流程
node runtime/p0/runner.js --from-proof    # 从核稿阶段开始
node runtime/p0/runner.js --from-print    # 从印刷阶段开始
node runtime/p0/runner.js --from-check    # 直接从「去检查」+红框定位
node runtime/p0/runner.js --case-font-schema  # A/B 对象 schema 对照（不印刷）
node runtime/p0/runner.js --variant=display0  # 单变量实验（e.g. isDisplay=0）
node runtime/p0/runner.js --submit-probe --control-empty --control-manual --relogin ...
```
- 更多命令见 `handoff/AI_COMMANDS.md`。

## 8. Chrome 怎么启动？

- **不手工启动**。runner 用 Playwright persistent context 自带启动：
  - `chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless:false, ignoreDefaultArgs:["--enable-automation","--disable-extensions"], args:["--disable-features=DisableLoadExtensionCommandLineSwitch","--enable-unsafe-extension-debugging"], viewport:{1440,900} })`
  - PROFILE 默认 `D:\zheliyin-scriptcat\runtime\browser\profile-usc3`（env `P0_PROFILE` 覆盖）。
  - `--enable-unsafe-extension-debugging` = 允许加载真实 ScriptCat 扩展。
- 备选 profile：`runtime/browser/profile-p0-fresh`（干净登录态）。

## 9. Playwright 怎么启动？

- 系统已装：`playwright@1.63.0`（`node_modules` 存在，`package.json` devDependencies `playwright ^1.63.0`）。
- 初始化脚本注入：`browser.addInitScript` 在**任何 goto 之前**安装 `window.__p0Net`（fetch/XHR/JSON.stringify/console/error 全量截获 + 脱敏）。
- 关键 URL：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`（252438 真机模板；240603 已废弃）。

## 10. OCR 怎么触发？

- 真实 UI 触发（P0 纪律：**不允许 runner 自己 drawText 伪造 OCR 成功**）：
  1. 打开编辑器文档（goto + reload，历史 stage5-5a/p5 同路径，不传图不点上传）
  2. 打开抽屉：`#zy-native-ocr-btn`（handleOcrImage 检查 ocrPanelClosed，未开则先开）
  3. OCR 源 = 真实「当前图片」→ 后台图 → 首图
  4. 观测非侵入 `ocrCreate/ocrCreateResult` 消息
- 证据落盘：`runtime/reports/p0/ocr-runtime/`（ocr-raw.json / ocr-textblocks.json / ocr-create-items.json / ocr-object-A-create.json / ocr-object-B-after-reload.json / 前后截图）

## 11. 印刷怎么操作？

```text
OCR 创建对象 → 打开抽屉核稿闸门(hegaoOk，未确认=FAILED_STAGE:HEGAO 截停)
→ 点击印刷 → 设计信息 modal → 订单号 → 获取信息 → 作品名 → 用户名 → 确定
→ 交稿层 → 提交稿件(submitUserDesign.do) → 核稿(搜索×4 自动核稿判定)
```
- 不是 `print → proof` 的假定流程；每一阶段可 resume（`resume-state.json`）。

## 12. 登录怎么处理？

- **偏好：MANAGED_PERSISTENT_PROFILE**（持久化 profile 已登录，runner 直接复用）。
- 登录浮层出现时：站点自动恢复优先 → 手动登录重建（≤2 次重试）。
- 手动登录必须“真填”：focus → select → native setter → input → change → click login；**登录可能导致原流程丢失 → 重建印刷流程**。
- 凭据：环境变量 `P0_LOGIN_USER` / `P0_LOGIN_PASS`（**禁止硬编码；值绝不入库**，`runtime/p0/runner.js` L24-26 仅读取）。
- 已知坑：会话会过期（`loginState:timeOut`）→ relogin / re-adopt（`--relogin` / `--adopt-session`）。

## 13. 失败在哪里看证据？

- 网络/console/DOM：每次运行 `runtime/reports/p0/run-summary.json`（`phases.net`、`phases` 全字段、events/errors）
- 印刷核稿：`proof-result.json`
- 红框定位：`suspect-object.json`（+ 截图 `ocr-boot.png` / `ocr-runtime/*.png`）
- 对象对照：`manual-vs-script-diff.json` / `debug-print.json`
- 提交：`submit-probe.json`、`control-result.json`
- OCR 全链条：`ocr-runtime/`
- 断点续跑：`resume-state.json`（stage + page.url）
- 浏览器 console 实时：run-summary `phases.logs/errors`；DOM 变化计数 `mutations`

## 14. 重要脚本有哪些？

| 脚本 | 作用 |
|---|---|
| `runtime/p0/runner.js` | P0 快跑 Runner（全流程 + --from-* 断点 + --variant 单变量 + 仪表化） |
| `runtime/p0/ocr-real-runner.js` | 真实 OCR 链路 Runner（ScriptCat 真实链路） |
| `runtime/p0/ocr-boot-probe.js` | OCR 引导探针（截 OCR 前后状态） |
| `runtime/p0/debug-print.js` | 对象模型 debug print（脚本 vs 手工对照源） |
| `runtime/p0/session-adopt.js` | 会话收养（复用持久化 profile 登录态） |
| `tests/editor-object-model/run.js` | 单测（13 suites） |
| `runtime/*.js`（stage5-*, stage6-*, stage7-3-*, probe-*…） | 各阶段真机 harness 与探针（历史保留） |

## 15. 重要文件有哪些？

- 生产：`zheliyin-card-assistant.user.js`、`extension/src/editor/page-bridge.js`、`extension/src/editor/object-model.js`、`extension/src/editor/object-adapter.js`、`extension/src/editor/object-matcher.js`、`extension/assistant.js`、`extension/manifest.json`、`extension/src/{fields,core,ai,ocr}/*`
- 文档：`TAKEOVER_AUDIT.md`、`project-history/INDEX.md`、`docs/`（stage-5.6/6/6.2 审计与执行记录）、`CHANGELOG.md`、根 `README.md`
- 证据：`runtime/reports/p0/`、`runtime/reports/stage-6-2-*.json`、`runtime/reports/` 其余阶段报告
- `handoff/`（本目录）

## 16. 哪些坑不能重复踩？

见 `handoff/AI_KNOWN_FAILURES.md`。核心 5 条：evaluate 闭包、offsetParent 判 modal、印刷非直连交稿、登录必须真填、proofWait 用 `let`。

## 17. 下一步应该从哪里继续？

见 `handoff/AI_NEXT_TASK.md`。摘要：
1. 先在真机用 `--from-proof`（或 `--relogin` 后满流程）复验 **isDisplay=0**（`--variant=display0`）多轮，扩大样本（当前 8/9）。
2. 修复/确认核稿闸门检测（`beforeHegao` 为何 null），让“自动核稿失败”可判定。
3. 会话保持策略（loginState:timeOut 拦截），或提交前 relogin。
4. 红框→对象映射（located:false）定位字段差异，输出 **P0 最终根因**。
5. 每步「小改动→验证→取证→独立 commit→push test」。

---

## 18. 交付/迁移说明（§二十）

- **进入 Git**：本 `handoff/` 全套文档 + AI2 最后运行证据（`runtime/reports/p0/*`、ocr-runtime、fixtures、截图）。
- **只在 D:\ 本机、不入库**：`runtime/browser/profile*`（登录态/缓存，`.gitignore` 已排除）、`runtime/vendor/`、`node_modules`、`storage-state/`、`*.session`、`.cookies`、`runtime/reports/screenshots*`。
- **安全原因不入库**：`P0_LOGIN_USER`/`P0_LOGIN_PASS` 等凭据值（仅环境变量）；runner 日志已脱敏（`[REDACTED]` 替换 token/password 等）。
- **历史归档**：`project-history/`（含 userscript 历史版本、ui-audit 档案），`TAKEOVER_AUDIT.md`。

---

## 19. 版本一致性最终核验（§十六）

- `@version 0.3.10.2` == `const VERSION = "0.3.10.2"` == manifest `version_name` == 9 处 `@require ?v=0.3.10.2`。**0.3.10.1 残留 = 0 处**。
- 建议新会话每次运行前执行：
  `Select-String -Path zheliyin-card-assistant.user.js -Pattern "@version|@require.*\?v=|const VERSION"` 核对单一版本。
- 若以后升版：userscript（@version/@require×9/VERSION）+ manifest version_name + README + CHANGELOG 必须同步；@require 版本号变化才能强制 ScriptCat 拉新模块（旧模块按 URL 缓存）。

## 20. 本次交接的 git 变更（本目录提交后）

- `test:` 归档 P0 最新真实运行证据（ocr-boot、display0 control、manual-vs-script、proof/suspect/submit、ocr-runtime）——包含原工作区未提交的 5 个修改 + 未跟踪新证据，已审阅无敏感明文后提交。
- `docs:` 新增 `handoff/` 全套交接文档（本文件 + AI_WORKFLOW/AI_COMMANDS/AI_RUNTIME_MAP/AI_KNOWN_FACTS/AI_KNOWN_FAILURES/AI_VERIFIED_RESULTS/AI_NEXT_TASK）。
- push：`git push origin test`（不碰 main、不 force push）。