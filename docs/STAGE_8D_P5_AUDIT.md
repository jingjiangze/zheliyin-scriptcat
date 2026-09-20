# Stage 8D P5 审计（Orientation / Font Source）— 先审计、证据结论、最小修改建议

日期：2026-09-20（P4 PASS 之后）

## 0. P4 结论（承接）

- v19 真机：回册佛山盛包装制品限/多 拆分成功；3+ 行巨块=0；created 10/10；rejected 0；noted 10（STYLE_MISMATCH 仅备注）；P4 PASS。
- stage-8d / test = `2aa1d02`（生产）、evidence `12ef10c`/`8afd4c2`；版本 0.3.11.30。

## 1. 真实 OCR orientation 现状

| 项 | 现状 | 证据 |
|---|---|---|
| 图片/背景旋转角 | `geo.angle`（page-bridge extractImagePayload → aCoords 仿射）消费于 buildItemsFromOcr §14 旋转模型 + image-space 映射 | v19 创建对象 quad 角度≈0（真实名片背景 A0 场景） |
| OCR 行级 rotation | Local Tesseract 不产 rotation（null）；`aggregateLineCandidates` rotation=null | RAW_WORDS8D 无 angle 字段 |
| textbox orientation | 由 item.angle=geo.angle 决定（图片旋转跟随）；行自身旋转无来源 | buildItemsFromOcr `angle` 分支 |
| classifyTextAngle | 已实现于 ocr-candidate-gate（HORIZONTAL/IMAGE_ROTATION/TEXT_ROTATION/PHOTO_PERSPECTIVE/OCR_NOISE，单测通过）但**未接线** | gate 模块导出；userscript 未引用 |

结论：orientation 目前=「图片旋转跟随」单一模型；行级旋转/透视无输入信号 → 暂不新增判别（无数据源），classifyTextAngle 留作 Gate 层备用。**本阶段不修改 orientation 逻辑**（避免无证据改动）。

## 2. 字体来源 fallback 现状 vs 8D §27/§28

| 来源层 | 现状 | 差距 |
|---|---|---|
| FONT_REAL_TEMPLATE | ✓ StyleCandidate 取模板真实 textbox fontFamily（8B）；`fontFamilySource:"template"` | 有打标 |
| FONT_SITE_DEFAULT | 无（模板内无站点默认字体 feature 检测） | 缺失层 |
| FONT_SYSTEM_MATCH | 无（不做系统字体可用性匹配） | 缺失层 |
| FONT_FALLBACK | ✓ fontFamilyCandidate=null → "sans-serif"；fontMismatch flag 置真；userscript `zy8bFontMismatch` | 有打标 |
| FONT_SPECIAL_STYLE | 无检测标记；§28 建议姓名/特殊字体 ⬅ | 缺失（STYLE_DEFERRED 未定） |

真机证据（v19）：created 10 全部 noted `TYPOGRAPHY_FAIL: width, category STYLE_MISMATCH` —— 真实名片无模板字体可采样（背景图 route），fallback sans-serif 渲染宽度 vs OCR 真实字体宽度差异 → width 保留。**这是字体 mismatch 的真实度量证据，非回归**。

## 3. 尺寸四层关系（OCR bbox / canvas textbox / 渲染 ink / 用户视觉）

| 层 | 定义 | 现状 |
|---|---|---|
| ocrBBox | OCR 检测区域（padding 产物） | §十二 已分离字段 |
| textVisualTarget | advance 宽 / ink 高目标 | fusion 已消费 advance（solveFontSizeFusion）；inkHeight 证据**未接入**（无源图墨迹测量） |
| textLayoutTarget | textbox layoutWidth/boxHeight | estimateTextLayout 已用；boxHeight=`lines*fs*1.3+8`（§13 模型，outer） |
| rendered ink | 创建后真实墨迹 | **P6 measureRenderedInk 未实现**（页面 world fabric → 离屏 canvas → alpha bbox） |

证据：v19 created 字号=advance 求解（fs 41/36/28…，STYLE_MISMATCH 有宽度差但字号合理）；「回册佛山盛包装制品限」fs=41（源图 40px 级 ✓ 可信）。

## 4. P5 最小修改建议（下一轮执行，改动收敛为诊断层）

1. **字体来源四层枚举**（打标诊断，不改创建行为）：`fontFamilySource` 扩展 → FONT_REAL_TEMPLATE / FONT_SITE_DEFAULT / FONT_SYSTEM_MATCH / FONT_FALLBACK + `specialStyle: true|false`（模板无字体 + 单一长字符串 + 字号大 → 标记，供 P5.2）。
2. **FONT_SPECIAL_STYLE 标记**（§28）：仅打标 `STYLE_DEFERRED` 诊断（**本轮不改变创建行为** —— 防止真实名片 10 个保留块被 defer 导致回退；Style Reconstruction 归 Stage 9）。
3. 不动 orientation（无输入信号）。
4. 接线 `classifyTextAngle` 到 item 诊断（当 OCR 提供 rotation 时分类）。

## 5. 验收口径（P5）

- 打标层证据：v20 真机 diagnostics 出现 fontFamilySource=四层 + specialStyle 字段
- 行为零回归：created/rejected/noted 与 v19 一致
- 单测：fusion/gate 全绿；新增来源解析单测

## 6. 下一步

P5 实现（打标层）→ v20 真机 → P6 Ink（measureRenderedInk + Source/Target/Actual）→ P7 Overlay → P8 Final E2E → Gate。