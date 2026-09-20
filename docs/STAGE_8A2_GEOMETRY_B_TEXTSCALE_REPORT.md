# STAGE 8A-2 Geometry B — Text Scale 取证与修复

> Stage 8A-2 Geometry 阶段（STEP 6-8）
> 依据：`runtime/reports/stage-8a2/geom-252438-active-a0-s{0.10,0.25,0.50,0.75,1.00}-off.json`（真机 scale 矩阵）
> 日期：2026-09-19

## 一、结论

| 判据 | 结论 |
|---|---|
| `B_TEXT_SCALE` | **PASS**（fs 下限对齐站点 8 + textbox width 视觉宽主导后，expected==actual 全档一致） |
| 修复方式 | ① buildItemsFromOcr fs 下限 10→8（与站点原生 CheckTextBox 最小字号保护对齐）② `estimateTextLayout` 增 `visualWidth` 视觉优先 ③ page-bridge fs 下限对齐 8 |
| 版本 | 0.3.11.13（与 A 同版本，B 独立 commit） |

## 二、B 真机矩阵（252438 active-image, angle=0, image 1000×300 scale 注入）

| scale | display | b0 fs/width | b1 fs/width | b2 fs/width |
|---|---|---|---|---|
| 0.10 | 100×30 | 8 / 74 | 8 / 114 | 8 / 82 |
| 0.25 | 250×75 | 15 / 130 | 8 / 114 | 8 / 82 |
| 0.50 | 500×150 | 29 / 242 | 9 / 136.5 | 8 / 82 |
| 0.75 | 750×225 | 44 / 367 | 14 / 200.75 | 10 / 100 |
| 1.00 | 1000×300 | 59 / 493 | 19 / 265 | 11 / 115 |

expected（buildItemsFromOcr）== actual（textbox）**全档一致**（含 low scale）。

## 三、根因（STEP 6-7 实证）

1. **fontSize 链路基本正确**：`fs = round(avgLineH×sy / 0.969)`，ratio(fs/visLineH) 跨 scale 稳定 ≈ 1.03~1.05（0.969 合同成立，**非根因，未改 0.969**）。
2. **fs 下限错位**：旧下限 10 大于站点原生最小字号保护（真机 0.10 档 drawText 把 fs<8 抬到 8）→ expected(6)≠actual(8) 失配，且低 scale 时 fs 被钳在 10 使 textbox 恒宽。对齐站点 → 8。
3. **textbox width 失真**：`estimateTextLayout` 以「字符估算宽 wMax（=字符数×fs）」撑宽为主，低 scale 时 fs 钳制放大估算 → b1/b2 width 恒 140/100 不随 scale。修复：`visualWidth`（OCR bbox 视觉宽 bw）= bbox.width×sx 主导，字符估算仅作 §11 防换行兜底。

## 四、修复内容（B 独立 commit，未混 A）

```
zheliyin-card-assistant.user.js:
  fs = Math.max(8, ...)（下限 10→8，注释说明对齐站点）
  estimateTextLayout(...) 传 visualWidth: bw
extension/src/ocr/candidate-normalizer.js:
  estimateTextLayout 新增 visualWidth 选项（视觉优先 + 防换行兜底），未传时行为与旧版完全一致
extension/src/editor/page-bridge.js:
  buildTextMediaEntry size 下限 8（与 buildItemsFromOcr 对齐）
tests/editor-object-model/candidate-normalizer.test.js:
  + b-visual-floor-dominant / b-visual-follow-when-estimate-inflated / b-legacy-no-visualWidth
```

## 五、验收

- 单测：candidate-normalizer（含 3 个 B 新用例）ALL PASS；textblock-fields ALL PASS
- 真机：0.10/0.25/0.50/0.75/1.00 × 3 blocks **expected==actual 全命中**（fs 与 width）
- textbox width 随 scale 缩放恢复（原恒 140/100 → 114/136/200/265）
- A 未受影响（0° golden baseline 不变；rotation 矩阵在 B 改动后仍应复验——STEP 10 交叉回归）

## 六、遗留

- 0.10 档 fs=8（站点最小）而视觉行高≈5.7：站点不允许更小字号，接受为平台硬约束（非脚本可改）。
- width 非线性（114→136→200→265）符合「视觉宽+防换行兜底」语义，非 magic。