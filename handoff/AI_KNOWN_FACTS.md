# AI_KNOWN_FACTS.md — 经核查的真实事实（含 Editor Object Inventory）

> 所有事实来自本交接的直查/取证；标注证据来源。

## 1. 版本与缓存（§十六，已核验）

- `test` 分支 userscript：`@version 0.3.10.2` = `const VERSION "0.3.10.2"` = manifest `version_name` = **9 处** `@require ?v=0.3.10.2`（field-core/config-core/ai-client/page-bridge/baidu-provider/fallback-policy/candidate-normalizer/credential-crypto/**ocr-quality**）。
- **0.3.10.1 残留 = 0 处**（本次全文件扫描）。此前 0.3.10.1→0.3.10.2 已由 `0b16a99` 修复。
- 建议真机运行前建立运行时 version proof（例如在 run-summary 记录 `scriptVersion/pageBridgeVersion`），以证明“真机到底跑哪版 bridge”。

## 2. Editor 对象模型事实（§十）

- **当前真实文字对象类型是 `textbox`，不是 `text`**（`manual-vs-script-diff.json` manual.type="textbox"；demo 线 stage6 证据同）。
- 真机 textbox 均存在 `uuid`（如 `c7f460b7-2181-4b00-a11a-69d0daff1bcb`）。
- 部分 path/rect 存在**重复的 `id = "图层_1"`** → **该 id 不得作为唯一身份**；身份用 `uuid`/fabric object 引用。
- `CanvasObjVO.totalCanvasArray` 按页存 canvas；`canvasObjInfo.canvasToProductObjArr` = 图层注册数组（持久化/历史前提）。
- 撤销机制 = **JSON 快照式**（`Undo.getInstance().save()` push 快照到 `undoAndRedo.undo[pageIdx]`，去重、上限 50）；RAW `canvas.add()` 不被原生历史跟踪。
- 原生新增文字调用链（demo 线真机 hook 证据）：`Undo.save → CanvasDiy.drawText(text,fontSize,left,top,mediaJson,layerNum) → createObjProductJsonDetail → canvas.add → checkObjsInProductJson(图层注册) → Undo.save`。
- 旋转：theta≠0 时 Mapper 输出旋转中心+angle+center 原点（demo 线 P5-D 最小修复，真机 err≤7.2px）。
- 正反面：`side: front/back`；`pageIdx = vo.currentCanvasNum - 1`。

## 3. 手工 Native textbox vs 脚本生成 textbox 的字段差异（`manual-vs-script-diff.json`）

手工 Native（编辑器 UI 真实创建）：`topEnable=false`、`resourceType=1`、`isComposite=true`、`isPreview=true`、`isDesign=true`、`selectEnabled=true`、`visitLevel=1000`、`lineHeight=1.16`、fontFamily=方正黑体简体、mediafontId=248、fill=`rgb(0,0,0)`、uuid & multiUuid 均为标准 v4。

脚本生成（脚本默认）：`topEnable=1`、`resourceType=0`、`isComposite=0`、`isPreview=0`、`isDesign=1`、`selectEnabled=1`、`visitLevel=1`、`lineHeight=1.3`、fontFamily=思源黑体 Regular、mediafontId=556、fill=`#000000`、multiUuid 形如 `p0cf642300`。

共 17 个字段差异；**isDisplay 未在该次对照中出现**（说明对照时脚本对象 isDisplay 默认 1 且 manual 未显式列出 isDisplay）——单变量实验走 `--variant=display0` 另行验证。

## 4. isDisplay 单变量实验（§十二，候选结论）

- `control-result.json`（mode=`VARIANT:display0`）：9 次 previews → 8 次 `success:true, producestate:1`，**1 次 `success:false, producestate:3`**。
- 结论：`isDisplay=0` 方向通过（多数 producestate=1），**但非 100% 稳定** → 定性 **STRONG_CANDIDATE，不是最终根因**；需扩大样本 + 把 isDisplay 纳入 manual-vs-script 系统对照。

## 5. P0 运行事实（最近一轮 2026-09-18）

- `run-summary.json`：`authConfigured:true`、`sessionSource:"MANAGED_PERSISTENT_PROFILE"`；网络序正常（RAS 公钥→captcha→FormatCard→模板→字体→previewCheck→checkSensitiveWords…）。
- `proof-result.json`：4 次 `search-btn` 点击（`reqDelta:2`），`beforeHegao/afterHegao:null`、`generatingHandled:0` → **核稿请求特征未被观测到**。
- `submit-probe.json`：`submitUserDesign.do` → `{"result":true,"loginState":"timeOut"}` → **提交瞬间登录态过期**。
- `suspect-object.json`：红框定位 `located:false`；DOM 层仅捕获 `.text-error-check`（x140,y559,w1170,h19.6，likely:true）。
- `ocr-runtime/`：OCR 全链路证据齐全（ocr-raw→textblocks→create-items→object-A-create→object-B-after-reload→object-D-before-proof + 前后截图）。

## 6. 仓库拓扑（§二，已核验）

- remote：`https://github.com/jingjiangze/zheliyin-scriptcat.git`
- 分支（fetch 后）：`main`=6840170、`demo`=e5cadf5、`test`=c2b940d、`stage-4.1-runtime-validation`=e9235af、`ai2-repo-governance`=b24c930。
- tag：`r0-audit`、`stage-1-baseline/complete`、`stage-2-baseline/complete`、`stage-3-baseline/complete`、`stage-3.1-complete`、`v0.3.0`。
- 最旧重要分支历史在 `project-history/INDEX.md` + `TAKEOVER_AUDIT.md` 有归档索引。

## 7. 目录事实

- `runtime/` 顶层：`browser/ fixtures/ reports/ vendor/` + 大量 harness js。
- `runtime/p0/`：`runner.js`(59KB)、`ocr-real-runner.js`(35KB)、`ocr-boot-probe.js`、`debug-print.js`、`session-adopt.js` + `fixtures/ocr-test.png`。
- `extension/src/editor/`：`page-bridge.js / object-model.js / object-adapter.js / object-matcher.js`。
- 测试：`tests/editor-object-model/*.test.js + run.js`（13 suites）、HTML 套件（ai-tests.html 等，历史）。