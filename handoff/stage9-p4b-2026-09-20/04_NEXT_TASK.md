# 04 — Next Task：P4-B Commit 3（真机 A/B 矩阵）

> 只有完成 Commit 3（+Commit 4）后，才允许进入 P4-C（FS_MIN=10）与 P4-D（bounded loop 职责收敛）。禁止跨阶段。

## 目标

真实真机 A/B，回答：ImageInk target 是否让 EditorActualInk 更接近 ImageInk、位置误差是否同步改善、无新增 wrap/identity/page 回归。

## 矩阵（4 条件 × 每条件 ≥2 runs）

| 条件 | Baidu | Native | Font target |
| --- | --- | --- | --- |
| A1 | standard | textType=2 | OCR bbox |
| A2 | standard | textType=2 | ImageInk |
| B1 | accurate | textType=2 | OCR bbox |
| B2 | accurate | textType=2 | ImageInk |

名片样本：当前真机样本为 real-card-shengying.png 一张；如能获得 ≥3 张不同真实名片优先（4×2 单张可作 exploratory evidence，不能据此宣布 ImageInk 为默认生产模型）。

## 关键要求

1. **FULL_REAL_PIPELINE 标识**：必须走 真实 OCR→Native Truth→Baidu geometry→buildItemsFromOcr→ImageInk→solveFontSizeFusion→创建→Editor actual ink→几何/ink 测量；绝不允许构造假 items 直接 ocrCreate 后宣称“真机 A/B”。报告必须标识 `FULL_REAL_PIPELINE` 或 `BRIDGE_SYNTHETIC`，不得混淆。
2. **Fresh runtime**：三个实验参数在 userscript 初始化时读取 → 每个条件必须 新 page / 新 browser context / 完整 reload + 重新加载 userscript 后再跑。
3. 可复用 `runtime/stage9/e2e-front-back-isolation.js` 的页面/桥基础设施（cookie 注入范式、pageWorld 注入、switchSide、bridgeCall）。
4. 运行环境：env `ZY_STAGE9_COOKIE`（必需）、`ZY_BAIDU_AK`/`ZY_BAIDU_SK`（必需）、`ZY_BG_FILE`（可选，默认 real-card-shengying.png）；`ZY_STAGE9_FONT_INK_TARGET=1` 时开 ImageInk 条件。

## 每 block 证据字段

pageId / transactionId / imageFingerprint / side / blockIndex / scriptType / fontFamily / fontSize /
OCR bbox / ImageInk / targetWidth / advanceWidth / EditorActualInk / center error / width error /
height error / angle error / wrap status（forcedWrapDetected/renderedLineCount/targetLineCount）/ object identity。
**禁止记录 Cookie 值。**

## 每 block 指标

- `K2_after = EditorInkWidth / ImageInkWidth`（目标：更接近 1，非追求预设倍数）
- `K1_after = ImageInkWidth / OCRBBoxWidth`
- `K3_after = AdvanceWidth / ImageInkWidth`（观察 solver 是否产生系统性偏差）
- `abs(reconstructedFontSize - sourceFontSize)`（如源模板有真实字号）
- position：center/corner/left-top/angle error（验证字号改善是否带动位置改善）
- wrap：不许引入新错误换行

## 输出

- `runtime/reports/stage-9/font-target-ab-session.md`（或 json）+ Commit 3 = `test(stage-9): run font target A/B matrix`
- Commit 4 = `docs(stage-9): record P4-B image ink target evidence`（结论/fallback/失败原因/样本数/A1-A2-B1-B2 差值；结论只允许 CASE A 稳定改善 → 进 P4-C/P4-D；CASE B 部分改善 → 数据积累期；CASE C 无稳定改善 → 保留 flag 暂停启用并重定位 Font family/Advance/Editor rendering mismatch）

## 运行范式速查（此前已验证）

```
git push 前：node --check + 全量测试（见 07）+ generate-runtime-manifest.js
凭据注入：$env:ZY_STAGE9_COOKIE=... ; $env:ZY_BAIDU_AK=... ; $env:ZY_BAIDU_SK=...
执行：node runtime/stage9/<runner>.js
提交纪律：生产改动用 0.3.11.4x；evidence 独立 commit 不升版；每步 push stage + test（demo 需用户确认）