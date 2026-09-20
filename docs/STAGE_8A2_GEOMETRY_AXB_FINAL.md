# STAGE 8A-2 Geometry A×B 交叉回归与最终判定

> Stage 8A-2 Geometry 阶段（STEP 9-11）
> 依据：`runtime/reports/stage-8a2/geom-252438-axb-cross.json` + geom-88-* / geom-252438-* 全矩阵
> 日期：2026-09-19

## 一、最终判定

| 判据 | 结论 |
|---|---|
| `A_ROTATION_GEOMETRY` | **PASS**（image-transform 接线后 expected==GT==actual，0/2/5/8/10° 全命中） |
| `B_TEXT_SCALE` | **PASS**（fs 下限对齐站点 8 + visualWidth 视觉主导，scale 0.10~1.00 全命中） |
| `A×B` | **PASS**（0/5/10° × 0.25/0.50/1.00 全部 expected==actual） |
| 252438 | **PASS**（golden baseline + 全矩阵） |
| 1040459 | **PASS（几何层）**（expected 与 252438 同图完全一致；持久创建被 C 阻塞回滚——C-fix 独立刀已闭环，本刀禁扩展） |
| `GEOMETRY_READY` | **YES（A/B 维度）** |

## 二、STEP 10 交叉回归矩阵（252438 active-image）

9 组合 × 3 blocks（expected vs actual，dL/dT ≤0.5px、dFS=0、dW=0 全部命中）：

| angle \ scale | 0.25 | 0.50 | 1.00 |
|---|---|---|---|
| 0° | b0(64,63,fs15,w130) b1(64,84,8,114) b2(64,106,8,82) | b0(72,70,29,242) b1(72,112,9,136.5) b2(72,156,8,82) | b0(88,83,59,493) b1(88,167,19,265) b2(87,256,11,115) |
| 5° | b0(70,57,15,130) b1(69,78,8,114) b2(67,100,8,82) | b0(80,53,29,242) b1(78,95,9,136.5) b2(74,139,8,82) | b0(100,47,59,493) b1(96,130,19,267) b2(87,219,11,117) |
| 10° | b0(73,47,15,130) b1(71,68,8,114) b2(67,89,8,82) | b0(85,34,29,242) b1(81,75,9,138.5) b2(74,119,8,82) | b0(111,8,59,493) b1(103,90,19,265) b2(88,178,11,115) |

`A×B CROSS = PASS`（几何合同在 rotation×scale 全组合成立，A 修复未破坏 B、B 修复未重引 A）。

## 三、STEP 9 跨模板取证

- **252438**（86.5×54 名片类）：完整矩阵 PASS（上述）。
- **1040459**（88.5×57）：同注入图（1000×300 × scale1 0° / 10°）expected 与 252438 **完全一致**（buildItemsFromOcr 几何与模板无关）；canvas 契约不同（zoom=0.755、currentFactWidth 差异）但 buildItemsFromOcr 只消费 geo（left/top/width/height/scaleX/scaleY/angle）→ 跨模板合同成立。
- 1040459 actual 侧：创建即被 C 回滚（itemList=0 → drawText threw），runOcrRound 捕获到 b0 创建瞬间几何且与 expected 命中 → 几何层 PASS；**持久验收属 C-fix 刀**（NATIVE_EMPTY_PAGE_CONTRACT 已闭环于 C3-C4）。

## 四、A/B 修复总账（均已在 test / 0.3.11.13）

| commit | 内容 | 验收 |
|---|---|---|
| cd520f3 | A：生产接线 image-transform.js（userscript @require + manifest js） | rotation 0/2/5/8/10 expected==GT；单测 image-transform 22 项全绿 |
| ea98f9b | B：fs 下限 10→8（对齐站点）+ estimateTextLayout visualWidth 视觉主导 | scale 0.10~1.00 expected==actual；单测 +3 全绿 |

## 五、禁止事项复核

- 未改 Native 站点源码 ✓（image-transform/buildItemsFromOcr/estimateTextLayout 均本仓库代码）
- 未改 checkObjsInProductJson / OCR Provider / Page Ownership / Bridge protocol / C-fix / drawItem ✓
- 未混 A+B 于同一 commit ✓；未做单模板特判 ✓；未用 magic offset ✓（几何全由 transformCorners/视觉宽公式）
- 0.969 未盲调（实证 ratio 稳定，非根因）✓

## 六、遗留（不属于本刀）

1. 1040459 持久 OCR 创建验收：待 C-fix 生产接线（C3-C4 已证 Route A 可行）。
2. backgroundImage 注入路径（旧 bg 模式）未纳入旋转矩阵重测（规格限定 actcive-image）；STEP 9 跨模板已覆盖其几何等价性。