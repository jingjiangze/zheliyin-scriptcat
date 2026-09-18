# AI_VERIFIED_RESULTS.md — 已验证结果（按验证强度标注）

> 强度标注：**[代码]** 代码/单测直查；**[真机]** 真实页面取证（可重复）；**[历史]** 仓库历史证据（本轮未重跑）。

## 1. Stage 历史与 tag（§九）

| tag / 里程碑 | 说明 |
|---|---|
| `r0-audit` | 仓库基线审计 |
| `stage-1-baseline` / `stage-1-complete` | Stage 1 字段核心模块化（field-core） |
| `stage-2-baseline` / `stage-2-complete` | Stage 2 Config/AI 边界（config-core/ai-client） |
| `stage-3-baseline` / `stage-3-complete` / `stage-3.1-complete` | Stage 3 page-bridge 抽取 + 3.1 独立审计 |
| `stage-3.2`（docs，commit 0578132 等） | 3.2 修复与再审计 |
| `stage-4.0`（master 7446faa / main docs） | 4.0 生命周期结果 |
| `stage-4.1-runtime-validation`（分支 e9235af） | 引擎内 OCR executor 突破（UMD shading + new Function），识别 2969ms→667ms（indexeddb 缓存） |
| `v0.3.0` | 稳定版基线 tag |
| demo 线 0.3.8.0→0.3.8.8 | Stage 5.6 / 6 / 6.1 / 6.2 系列（CHANGELOG 有逐版本记录） |

## 2. demo 线（v0.3.8.x，OCR-only Demo）关键验证

- **[真机] 22/22 全场景回归**（stage-5.6，commit 3481306/7c1df21，execution-record 001）：背景图/选中图/早点击 → 可编辑 textbox。
- **[真机] 几何矩阵**（P5，commit e941e6d，execution-record 002）：theta=0/15/45/90，旋转最小修复后 err≤7.2px。
- **[真机] Stage 6.1 TextBlock 层**（v0.3.8.7）：多行合并为一个 textbox、防提前换行、中文无字间距、TextBlock coverage/creation coverage 指标输出。
- **[真机] Stage 6.2 原生绘制管线**（v0.3.8.8，证据 reports/stage-6-2-ocr-create-native-test.json）：e2e `mode:"native"`、3 blocks==3 created、canvasTextCount==layerTextCount、undo/redo 闭环（含 §二十 历史边界：undo1 撤后续编辑→undo2 撤批次→redo 恢复）、template intact、hook 对拍 R3 PASS。
- **[历史] Save/Reload 持久化 = PENDING**（demo 线）：自动化无登录 profile 下保存仅触发前置检查、无内容写库请求；需真实登录手动回填验证。

## 3. test 线（v0.3.10.x，P0）关键验证

- **[真机证据] isDisplay=0 单变量**（`control-result.json`，mode `VARIANT:display0`）：8/9 previews `success:true producestate:1`；1/9 `producestate:3`。→ 方向通过、非最终根因（带 11.1% 失败率）。
- **[真机证据] 手工 vs 脚本对象对照**（`manual-vs-script-diff.json`）：17 字段差异清单（含 resourceType/isComposite/isPreview/visitLevel/topEnable/lineHeight/font 系列）。
- **[真机证据] OCR 全链路**（`runtime/reports/p0/ocr-runtime/`）：ocr-raw.json → ocr-textblocks.json → ocr-create-items.json → ocr-object-A-create.json → ocr-object-B-after-reload.json → ocr-object-D-before-proof.json + 前后截图（对象创建与 reload 后存在性有证据）。
- **[真机证据] 登录态复用**（`session-parity.json` / `run-summary.json`）：`MANAGED_PERSISTENT_PROFILE` 被 runner 成功加载（authConfigured:true）。
- **[真机证据] 核稿/印刷链路**（`proof-result.json` / `submit-probe.json`）：到达印刷提交步骤，但 `loginState:timeOut` → 真机闭环未完成 = P0 OPEN。
- **[代码] 单测**：`node tests/editor-object-model/run.js` → 13 suites ALL PASS（回到 D:\ 当场重跑确认；ocr-quality 14 passing 等）。
- **[代码] 版本一致性**：test 分支 0.3.10.2 全对齐（9 模块 @require），0.3.10.1 残留 0。

## 4. 汇总表：验证强度

| 项 | 强度 | 状态 |
|---|---|---|
| TextBlock 拆分/合并严格规则 | 真机(demo) + 单测 | PASS |
| OCR 原生 drawText 管线 + 图层/撤销闭环 | 真机(demo) | PASS |
| OCR-only Demo 22/22 | 真机(demo) | PASS |
| isDisplay=0 单变量 | 真机(test) | 8/9 PASS → CANDIDATE |
| P0 印刷→核稿闭环 | 真机(test) | **OPEN**（loginState:timeOut） |
| Save/Reload 持久化 | 自动化无登录 | PENDING |
| manual-vs-script 字段差异 | 真机(test) | 已取证（17 字段） |
| 单测 13 suites | 本机 | PASS |
| @require cache-buster 0.3.10.2 | 代码 | PASS（0 残留）|