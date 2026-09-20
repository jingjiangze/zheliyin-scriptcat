# Stage 9 P2-A：Native OCR 主链接线审计 + SOURCE-vs-RECONSTRUCTION 基准

日期：2026-09-20（Stage 9 多层几何校准 §五十三 第一步——只审计，不改生产）
分支/HEAD：`stage-9-altq-baidu-reconstruction` @ 10022cf

---

## 1. 主链数据流现状（审计结论）

| 环节 | 代码位置 | 现状 |
|---|---|---|
| OCR 主入口 | userscript `maybeLocalFallback` / Cloud 分支 | Baidu Provider（Cloud）或 Tesseract Worker（Local） |
| 候选归一化 | `unifyCandidates`（candidate-normalizer.js） | Local 打标 `sourceProvider=LOCAL`；Baidu=`BAIDU` |
| Gate | `runCandidateGate`（ocr-candidate-gate.js） | 逐块+set 级校验 |
| 行→块 | `buildTextBlocks` / `groupLinesToBlocks` | Stage 8D 已加固 |
| 创建 | `buildItemsFromOcr`（userscript L1115+） | **最终 `text = b.safeText || b.text`（Provider/Ocr 文本）** |
| 字体 | `solveFontSizeFusion` + `estimateTextLayout` | fusion（advance 主）+ layoutWidth 防换行 |
| Ink | `ink-measure.js`（runner 取证） | Actual Editor Ink 三层已建立 |

**核心审计发现**：
1. **Native OCR（uploadOCR.do）尚未接入主链** —— Editor 最终文字仍来自 Baidu/Tesseract 候选 text（L830/L933→L1290 text 源），违反 Stage 9「Native rawText = 最终 Editor text」规则。接入点：OCR 主入口（gate 前/后）先用 `native-ocr-provider.recognize` 得到 texts，再经 `text-geometry-matcher` 与几何源（Local/Baidu）对齐成 TextRegion，最后 buildItemsFromOcr 消费 TextRegion.text。
2. `altq-provider` 已按新定位保持为「未证实 UI 入口探测」，不做可用性伪造（§十九）。
3. 运行时几何源 = Local Tesseract（Baidu 云端在 page-world 受 CORS 限制，本轮 runtimes 未启用云端）——基准以 Local（主链实际几何源）为 Source 层；Baidu 层契约已就绪（layout-provider），云端回归另行接线。

## 2. SOURCE-vs-RECONSTRUCTION 基准（方法）

- 输入：v23 真机报告（real-card 895×577，10 创建块，含创建后 quad/ink）。
- Source OCR bbox：创建块 `aCoords` 的 AABB（A0 场景 canvas≈image px，作为 OCR 源区域近似）。
- Image Ink（新层，§六）：背景图原素 → 脱屏 canvas → 块区域（外扩 12px）灰度 → **Otsu 阈值** → 暗像素投影 ink bbox + density。
- Editor Ink：`ink-measure.js` 实测（textbox 渲染墨迹）。
- 误差定义（§二十五）：
  - sourceGeometryError = OCR 块 bbox vs Image Ink（center/width/height）
  - reconstructionError = Editor Ink vs Image Ink（width/height；ink 无中心记录故位置重建单列）
  - finalError = Editor Ink vs Image Ink（同 reconstructionError 口径）

## 3. 基准数字

| 块 | 文本(截) | fs | OCR块 w×h | ImageInk w×h (density) | EditorInk w×h | srcErr center/w/h | reconErr w / w% / h% |
|---|---|---|---|---|---|---|---|
| 0 | 出 | 89 | 121×102 | 145×101 (0.135) | 68×81 | 12.7 / 24 / 0.6 | 77 / 53.1% / 19.8% |
| 1 | 天住 | 37 | 190×43 | 176×53 (0.211) | 71×34 | 0.1 / 14 / 10.2 | 105 / 59.7% / 35.8% |
| 2 | 轿 CO 天 住 出 sre | 21 | 206×25 | 171×38 (0.155) | 184×20 | 29.5 / 35 / 13.3 | 13 / 7.6% / 47.4% |
| 3 | 轿 CO 天 住 出 sre | 55 | 529×63 | 372×88 (0.302) | 480×51 | 90.5 / 157 / 24.9 | 108 / 29.0% / 42.0% |
| 4 | Telephone: +86 | 28 | 407×33 | 360×40 (0.117) | 373×26 | 0.6 / 47 / 7.4 | 13 / 3.6% / 35.0% |
| 5 | 阅梧回盈\n器洛明 | 107 | 507×267 | 531×292 (0.225) | 422×226 | 0.5 / 24 / 25.0 | 109 / 20.5% / 22.6% |
| 6 | 回册佛山盛包装制品限 | 41 | 702×47 | 707×72 (0.289) | 405×39 | 9.5 / 5 / 24.7 | 302 / 42.7% / 45.8% |
| 9 | 多 | 36 | 181×42 | 173×66 (0.425) | 30×33 | 2.0 / 8 / 24.3 | 143 / 82.7% / 50.0% |
| 11 | 器 洛 Tel.: 0757 | 53 | 794×133 | 798×157 (0.241) | 715×112 | 10.0 / 4 / 24.2 | 83 / 10.4% / 28.7% |
| 15 | 由 | 20 | 61×24 | 54×40 (0.270) | 16×17 | 16.0 / 7 / 16.4 | 38 / 70.4% / 57.5% |

```text
SOURCE 层 MAE：center 17.14px | width 32.5px | height 17.09px
RECON  层 MAE：width 99.1px（~380%） | height 30.8px（~20-50%/块）
```

## 4. 两问答案（§五十三）

**问题 A：OCR bbox 与真实文字区域差多少？**
→ 多数块中心误差 <10px（0.1/0.5/0.6/2.0/9.5/10.0），可认为源定位基本可用；
MAE 17.14px 主要由 2 个噪点块拉高（块3 center 90.5/width 157、块2 center 29.5）——即「OCR 噪点大块」是 main source 误差来源，属 **SOURCE_GEOMETRY（+LINE_SPLIT 噪点）**。
（说明：本几何源为 Local OCR；Baidu 云端未参与本轮。）

**问题 B：target 正确前提下 Editor 重建差多少？**
→ 宽度为**主导误差**：碎片/单字段块 widthPct 42~83%（块9 82.7%、块15 70.4%、块1 59.7%、块0 53.1%、块6 42.7%）——textbox 保留 OCR 视觉宽（防换行策略）+ fs 求解后 ink 未填满所致；整行块（4/2/11）widthPct 3.6~10.4% 良好。
→ 高度系统性偏大 20~50%（line-box 模型 vs ink 墨迹语义，即既有 STYLE_MISMATCH 来源）。

## 5. 结论与归因（§五十二）

```text
attribution = RECONSTRUCTION_PRIMARY（宽度为主）
细分：
- LINE_SPLIT/FONT（碎片块宽没填满）       —— 重建主因
- HEIGHT 模型（line-box vs ink）          —— 重建系统性
- SOURCE_GEOMETRY（2 个噪点块 块2/块3）   —— 源层次要；Gate 过滤后源层 center MAE≈6px
```

下一轮优化优先级（按 §四十一 规则）：
1. **重建层**：碎片块 textbox 宽度不再无条件保留 OCR 视觉宽（改为 ink/目标宽驱动 + 防换行硬约束），min-fs=10 时优先扩宽而非缩字。
2. **源层**：噪点大块门（块2/块3 这类 PDF/QR 噪点）+ ImageInk 一致性校验进入 Gate。
3. Line split 决策（KEEP_SEPARATE 默认）与「明确同块才 \n 合并」。

## 6. 安全与边界

- 本审计未修改生产代码/主链/版本（0.3.11.32 未动）；纯 evidence。
- ImageInk 口径：区域外扩 12px、Otsu 全局阈值；QR/图形密集区会产生包含噪点的 ink bbox（已在 density 列暴露），仅用于基准诊断。