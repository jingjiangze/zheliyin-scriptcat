# STAGE 10-B：Text Run / Mixed Typography Segmentation

- 日期：2026-09-21
- 基线：`6ee36bd` → 提交链 `e838cd4` → `05123f3` → `abb1ffd` → `9185697` → `0c98957`
- Version：`0.3.11.49` → 「0.3.11.50 → 0.3.11.51 → 0.3.11.52」
- 分支：stage == test == `0c98957`（每阶段独立 commit 且双分支同步）
- **结论：STAGE 10-B = PASS**（保守第一版：高置信 Split / 低置信回退，不破坏 Stage 9 链路）

---

## 1. 目标（规格 §一）

把一个 OCR Block 中「大字 + 小字」的混合排版拆分为多个 Text Run，每个 Run 独立生成
Native textbox（独立 fontSize/geometry/color），且 **Native OCR 文字真值全程不变**、
低置信强制回退 Single Textbox（宁可不拆，不要错拆，§十五）。

## 2. 交付链

| 阶段 | 交付 | 证据 | 版本 |
|---|---|---|---|
| 10-B.0 | Native Multi-Textbox 真机审计（A/B/C/D/PASS，E persisted BLOCKED 会话） | docs/STAGE_10B_NATIVE_MULTI_TEXTBOX_AUDIT.md | 不 bump |
| 10-B.1 | 纯模块 `extension/src/editor/text-run-model.js`（makeRun/runIdentity/textConservation/unionGeometry/blockFallback/assignRunColor）单测 31/31 | tests/editor-object-model/text-run-model.test.js | 0.3.11.50 |
| 10-B.2 | 纯模块 `extension/src/editor/text-run-segmentation.js`（detectMixedTypography/detectRunCandidates/scoreRunBoundary/mergeStableRuns/planRuns——conservative gate）单测 22/22 | tests/editor-object-model/text-run-segmentation.test.js | 0.3.11.51 |
| 10-B.3 | 真实图片 Mixed Typography Detection（8 case：T-R1..T-R9，旋转/非均匀）8/8 PASS | runtime/reports/stage-10/text-run-mixed-detect.json | 不 bump |
| 10-B.4/5 | 生产接线 `expandRunItems10B`（userscript buildItemsFromOcr 后置 expansion）+ page-bridge run key 区分 + Native Create/Measure | runtime/reports/stage-10/text-run-real.json | 0.3.11.52 |

## 3. 生产接线设计（10-B.4/5）

**hard rule：HIGH_CONFIDENCE → Split；MEDIUM/LOW → Single fallback（§十五）。**

- userscript `buildItemsFromOcr`：items 构造完成后调用 `expandRunItems10B(items)`
  - 仅当：多行 block 且 `zy8bLineQuads.length === perLineInkHeights.length >= 2`
  - 用 per-line ink 高度（IMAGE_PIXEL）构 spans → `planRuns`（conservative gate）
  - `FULL_RUN_SPLIT` 且 ≥2 runs → 每 run 独立 item（text 切片/独立 fontSize/独立 geometry（run 行 quad union）/fill 继承+独立 evidence）
  - 任何依赖缺失/异常 → 原样 single（zero behavior change）
- page-bridge：`zyOcrKey` 增加 `runKeyNat` 后缀（`-r{zyRunIndex}`），使同一 blockIndex 的多个 run textbox 拥有独立幂等 key（§二十三 Run Idempotence）
- fill：每个 run 独立持有，但**颜色差异须独立 image evidence**，不因 fontSize 不同自动换色（§二十九）

## 4. 真机矩阵（规格 §四十）

runtime/stage10/text-run-real.js —— bridge ocrCreate 真实创建 + 读回：

| Case | 内容 | 判定 | runCount | Native Create | 结果 |
|---|---|---|---|---|---|
| T-R1 | 单行同字号 | SINGLE | 1 | 1 textbox | PASS |
| T-R2 | 两行同字号 | SINGLE | 1 | 1 textbox | PASS |
| T-R3 | 大字+小字 | SPLIT | 2 | 2 textbox | PASS |
| T-R4 | 大字+小字+大字 | SPLIT | 3 | 3 textbox | PASS |
| T-R6 | 姓名大字+职位小字 | SPLIT | 2 | 2 textbox | PASS |
| T-R7 | 电话大字+邮箱小字 | SPLIT | 2 | 2 textbox | PASS |

Text Conservation：所有 SPLIT case `join(runs.text) === nativeText`（含跨行换行符，禁 trim）。
Geometry：run 位置来自既有 line-quad（IMAGE_PIXEL 系映射，未引入第二套坐标）。

## 5. 验收核对（规格 §五十）

- [x] Native OCR text 完全保持（charStart/charEnd 切片 + textConservation 硬门）
- [x] Baidu 仅提供 line/bbox evidence（本轮未使用 Baidu 字符级，行级 ink 来自 ImageInk）
- [x] Mixed Typography detection 有真实证据（T-R3..T-R9 mixed-candidate + bimodal ratio）
- [x] 高置信 Split（T-R3/4/6/7 均 SPLIT 且创建 2/3 textbox）
- [x] 低置信自动回退（T-R1/2 SINGLE；MEDIUM/LOW 不拆）
- [x] 相邻相同样式 Run 自动 merge（detectRunCandidates 行级先 merge；segment 单测 mrg-*）
- [x] 每 Run 独立 geometry/fontSize（run item 独立 left/top/width/fontSize）
- [x] 每 Run 独立 Native Create（page-bridge run key 区分）
- [x] Text Conservation / Geometry Conservation（union ≈ block 视觉区）
- [x] 幂等 key 独立（-r{runIndex} 后缀；anchor reuse 由原生多因子决定）
- [x] create → measure → verify 闭环（实际读回 runCount 与 fontSize）
- [x] 回归：Stage 9.9 Part A **28 PASS / 0 FAIL**（anchor/imageSpace×4/containment×4/typography T1-T7/pageIdentity/idempotence/P0×3）；native-color 30/30、text-run-model 31/31、text-run-segmentation 22/22
- [x] 不因中/英/数差异错误 Split（T-R5 语言弱先验不参与；只有视觉尺寸差异触发）
- [x] 不依赖语义模型（仅视觉 evidence + 顺序/几何/confidence）

## 6. 残余与限制（如实记录）

- **Native Multi-Textbox save/reload 持久化**：BLOCKED（会话限制，同 Stage 10-A G）；
  已由 10-B.0 证明能力层（同会话独立对象/样式/identity 全 PASS）。
- **单行内 run split（同一行混排）**：第一版不做（需要 Baidu 字符级 → Native 对齐，保留 Next）。
- **Mixed Color**：每个 run 持有 fill，但本轮不自动分色（需独立颜色 evidence，§二十九）。
- **MixedFontWeight/字重/字族**：本轮仅 fontSize（§四十六 第一版范围）。

## 7. Metrics

```
Mixed Typography Precision（T-R1..T-R7 真机 6/6 判定符合预期 + T-R8/T-R9 检测 8/8）
False Split        = 0（T-R1/T-R2 均正确保持 single）
Fallback Rate      = 2/6（T-R1/T-R2 走 single fallback，符合预期）
Zero-Break         = Stage 9.9 Part A 28 PASS / 0 FAIL
```

## 8. NEXT

```text
NEXT BLOCKER = 可写会话补测 Native Upload/保存持久化（解锁后做视觉 diff 真机闭环）
NEXT STAGE    = Stage 11 Style Reconstruction（fontWeight/fontStyle/lineHeight/charSpacing/stroke）
              （此前为 demo 晋级 0.3.11.52 → release audit → demo real install）
```

## 9. Git

每阶段独立 commit，stage/test 双分支同步，无 force push / reset / rebase：

```text
e838cd4 docs(stage-10): audit native multi-textbox capability (10-B.0)
05123f3 feat(stage-10): add text run model (10-B.1, 0.3.11.50)
abb1ffd feat(stage-10): add conservative text run segmentation (10-B.2, 0.3.11.51)
9185697 feat(stage-10): mixed typography real-image detection evidence (10-B.3)
0c98957 feat(stage-10): conservative text run production gate + native create/measure (10-B.4/5, 0.3.11.52)
```