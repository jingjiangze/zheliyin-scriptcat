# STAGE 9 P4-D：fontSize height-first 修复证据报告

> 分支：`stage-9-altq-baidu-reconstruction`
> 目标：优先解决「图片原文字大小 vs OCR 重建 textbox 字号明显不一致」
> 顺序：① fontSize（本轮）→ ② actual ink height → ③ width/wrap → ④ position（后置）
> 真机：ScriptCat 可见浏览器 + 真实 DIY 编辑器 + Native textType=2 + 真实名片 real-card-shengying.png
> 证据：runtime/reports/stage-9/p4d-height-first-a1.json（A1 standard × 1 run，FULL_REAL_PIPELINE）
> 凭据：仅运行时 env，报告零泄漏

## 一、修改内容（4 个 commit，均 push）

| commit | 内容 |
|---|---|
| `22cee1c` | Step2：buildItemsFromOcr 接入 sourceInkHeight（image ink height ×sy → canvas px），ink 预取无条件，diagnostics 增加 sourceInkHeight/sourceInkWidth |
| `7145c1e` | Step3：text-fit-fusion.js 高度优先 —— ink 第一优先（FONT_HEIGHT_RATIO=0.969 复用），advance 降为兜底；单测同步（8/8）|
| `119e3c9` | Step4：page-bridge ocrCreate/ocrAdjust 回复携带 Editor Actual Ink；runGeometryCalibration ink-gap ±1 闭环（≤4 轮）；evidence window.__zyStage9CalibrationEvidence |
| `0cd08ad` | Step4b：TDZ 修复 + ink 4 轮不收敛改为「保留+备注」（§14 禁全局 multiplier）；runner 记录 sourceInkHeight/fontSizeSource/calibration；A1 证据入库 |

## 二、A1 真机结果（Java 卡片「客户经理」中文字块 + 电话行）

### 修改前（P4-B A1 width-based，commit ceca3f6）

| 字段 | 客户经理 | Tel.: 0757-88809856 |
|---|---|---|
| fontSize | 43（advance 决定） | 27（advance 决定） |
| targetWidth | 185（OCR_BBOX） | 278（OCR_BBOX） |
| sourceInkHeight | 53 | 34 |

（修改前未做 Actual Ink 校准，editorInkH 未逐块记录；由 K5≈0.93 估计 editorInkH≈40 / 25）

### 修改后（P4-D A1 height-first，commit 0cd08ad）

| 字段 | 客户经理 | Tel.: 0757-88809856 |
|---|---|---|
| fontSize | 55 | 37 |
| fontSizeSource | ink-height-primary | ink-height-primary |
| sourceInkHeight | 53 | 34 |
| editorInkHeight(after) | 52 | 30 |
| 高度误差 after | **-1（≈2%，收敛）** | **-4（12%，测量量子化饱和）** |
| 校准轮数 | 0（直接命中） | 2（35→36→37） |
| editorInkWidth | 218 | 338 |
| advanceWidth | 220 | 338.59 |
| textboxWidth | 185 | 278 |
| wrap（rendered） | 1（单行，false wrap） | 1（单行，false wrap） |
| 备注 | STYLE_MISMATCH（仅备注） | FONT_MODEL + CALIBRATION_MODEL_FAILURE（仅备注，对象保留） |

## 三、结论（仅记录事实 + 方向建议）

1. **主中文块高度修复成功**：`客户经理` sourceInkH=53 → editorInkH=52，直接命中，无校准循环。修改前 fs43（advance 推导）下 editorInkH≈40，明显小于源图 53 —— 与本轮目标（fontSize 偏小）一致，已修正。
2. **fontSize 由高度驱动**：fs = sourceInkHeight / FONT_HEIGHT_RATIO(0.969)，A1 两块的 fontSizeSource 均为 ink-height-primary，width 不再决定字号。
3. **英文/数字行残差**：Tel 行 editorInkH 在 fs 35→37 时 ink 实测 29→30 封顶（canvas 量子化 + latin 小写字形 ink 矮），±1 无法再收，4 轮上限 → 按 §14 记录 CALIBRATION_MODEL_FAILURE（备注保留，不删对象，不加全局 multiplier）。
4. **width/wrap 正常**：两边实测 editorInkWidth ≈ advanceWidth（218≈220、338≈339）；单行无 wrap。
5. **建议**：①对 long latin 行的 ink 测量量子化可在 P4-D 二期引入「测量精度感知停止」（当 fs±1 不再改变 ink 实测时视为收敛）；②高度已验证，下一步再进入 width 与 position 的逐项验证。**未**创建新 calibration loop、**未**引入新倍率、**未**改动 Native Truth / Page Identity / FrontBack / Bridge 协议 / Stage1-8D 稳定模块。

## 四、回归

- Stage 9 单测 95/95；text-fit-fusion 8/8；tests/editor-object-model text-fit ALL PASS；node --check ×5 OK。
- 既有 stage-8d 17 项历史失败（candidate-normalizer 10 / merge-guard 2 / merge-golden-word 2 / textblock-fields 3）未触及、未修复（按 Stage 9 约束），与本轮改动无关。

## 五、P4-D 二期：measurement plateau（commit 4f3899f，已同步 test）

**改动**：runGeometryCalibration 新增最小停止条件 —— fontSize ±1 后实测 ink 高度不再变化（|Δ|≤0.5px）且已有 ≥1 步 → `MEASUREMENT_PLATEAU`，立即停止并保留对象（取代误判 CALIBRATION_MODEL_FAILURE/无意义反复调字号）。未新建 loop，仍 ≤4 轮。

**A1 真机结果（p4d-plateau-a1.json，FULL_REAL_PIPELINE）**

| 字段 | 客户经理 | Tel.: 0757-88809856 |
|---|---|---|
| fontSize | 55（unchanged） | **36**（35→36 后 ink 30 不再变化 → 停止；此前版本会继续到 37） |
| fontSizeSource | ink-height-primary | ink-height-primary |
| sourceInkHeight | 53 | 34 |
| editorInkHeight | 52 | 30 |
| heightError | -1 | -4 |
| calibrationRounds | 0 | 1（plateau 提前停） |
| measurementPlateau | - | **true** |
| editorInkWidth≈advanceWidth | 218≈220 | 329≈329.4（width 与 advance 自洽） |
| wrap | 1（false） | 1（false） |

结论：CJK 主块保持收敛不回退旧 43；英文/数字行在测量平台点停止，不再无意义 ±1 反复调整；对象保留、无拒绝。