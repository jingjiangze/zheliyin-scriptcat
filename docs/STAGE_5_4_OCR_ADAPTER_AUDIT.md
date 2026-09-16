# STAGE_5_4_OCR_ADAPTER_AUDIT

Native OCR Result Access + Real Image Input + Reconstruction Accuracy · 把重建推向真实 OCR 边界

> 原则：Native 能用就不用自己的；本轮系统验证原生边界后如实分级（§八十四）。

---

## 1. Native OCR Deep Probe（P2, 4 实验预算）

runtimes/stage5-4-native-ocr-deep-probe.js（hook fetch/XHR/postMessage/WebSocket + panel 内「识别内容」动作 + 12s 观察）：

- 实测：OCR 面板要求「**先选中相框，将图片拖放到选中的相框中**」—— 折立印 OCR 绑定"相框"素材交互；
- 选中图片（setActiveObject）+ 打开 panel + 触发识别后：**无网络请求、无 postMessage、canvas 21→21、无结果行（剔除"生成结果"按钮噪声后为空）**
- 结论：**NATIVE_OCR_RESULT_ACCESS = BLOCKED**（§八 三要素未聚齐，不写 PASS）

## 2. Native Image Input（P3）

runtimes/stage5-4-native-image-input.js：三种注入（构造 ClipboardEvent / CDP 剪贴板+Ctrl+V / input[type=file] setInputFiles）均未在 harness 下产生 canvas image 对象 —— 编辑器对非可信/区域绑定的图片输入事件不响应，属 automation limitation（真实用户粘贴/拖拽为真实现象）。**NATIVE_IMAGE_INPUT = PARTIAL**；fabric.Image 原创建为已验证回退（5.3）。ImageSource 审计保留（natural 尺寸 vs canvas 逻辑尺寸区分）。

## 3. Font Calibration（P8, 真实测量）

runtimes/stage5-4-font-calibration.js：真实编辑器创建「思源黑体 Regular」textbox（fontSize 12..72；short/mid/long 三文本类）逐次测量 visualBounds：

| 指标 | 值 |
|---|---|
| 单行样本（20） ratio visualHeight/fontSize | min 1.181 / max 2.537（大字号 6 字换行） |
| **short 单行 ratioMean** | **1.206** |
| **反推公式** | **fontSize = 0.829 × visualHeight**（short 单行） |
| 多行（long） | 高度随行数增长，不做单行反推（需行数估计，deferred） |

## 4. Real Product Flow（P15, errors=0）

runtimes/stage5-4-real-product-flow.js（真实编辑器 + fabric.Image 600×400@0.5 参考图 + fixture OCR[本源由 ground-truth 绘制坐标提供]）：

```text
REAL_IMAGE → 归一化 → image-mapper → Canvas bbox
→ fontSize = 0.829×visualHeight（校准代替猜测）            FONT_SIZE ✓
→ matcher 4/4 NOT_FOUND（模板保护，无误写）               OBJECT_MATCHER ✓
→ create 4 真 textbox（type=textbox / editable / 思源黑体 Regular / markuuid=null）  REAL_TEXTBOX ✓
→ 回读 visualBounds：mean height error = 5.03%（校准有效性实证）  FONT_SIZE_ACCURACY ✓
→ fabric.Group 编组/解组 → 成员独立                           REAL_GROUP ✓
→ Reference Image 保留（images=4）                            REFERENCE_IMAGE ✓
→ reload → 21 对象 / 4 原文本 / 3 图 零残留                  REAL_ROLLBACK ✓
```

## 5. OCR Adapter 决策（§十二~§十六）

- **Native OCR**：BLOCKED（相框交互绑定 + 结果不可程序取用）
- **Local OCR（tesseract.js 评估）**：记录评估 —— 依赖体积大（WASM+中文语言包 ~20MB）、production userscript 集成重 → **本阶段不引入，记为 Deferred（5.5 决策点）**；不把用户图片外传（§十三 优先本地原则）
- **Fixture OCR**：保留为确定性回归（§十六）；本阶段重建链 OCR 来源 = fixture（ground-truth 绘制坐标 → OCRCandidate），**明确标注 FIXTURE_OCR**（§五十九 不冒充 REAL_OCR）

## 6. Gate（§七十五/§七十六）

```text
NATIVE OCR result access:  BLOCKED（§八 如实）
REAL_IMAGE_INPUT:          PARTIAL（harness 自动化受限；fabric.Image 验证回退）
IMAGE_COORDINATE/SCALE:    PASS
TEXTBOX / TEXT_EDITABLE:   PASS
FONT / FONT_SIZE:          PASS（校准后 5.03% 误差）
GROUP / UNGROUP:           PASS
REFERENCE_IMAGE:           PASS
ROLLBACK:                  PASS
RUNTIME_8_3:               PASS（page-bridge 未改）
UNIT:                      6 套件 PASS
NO_P0 / NO_P1

总 Gate: CONDITIONAL-GO
（要素齐全：Local OCR 未接入（评估 deferred）+ OCR 来源为 fixture 且明确标注；
  Native OCR inaccessible、Local OCR evaluated-not-wired —— §七十六 允许，如实记录）
```

## 7. 独立复审（§七十四 12 问）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 真 OCR 还是 fixture？ | fixture（native 深探 4 实验后 BLOCKED；明确标注 FIXTURE_OCR） |
| 2 | 真粘贴还是 fabric.Image？ | harness 下 native 输入注入不受理 → PARTIAL + fabric.Image 回退（用户真实操作可用） |
| 3 | 真图片比例？ | 是（600 natural × 0.5 scale × mapper 实测；SOURCE_PIXEL vs DISPLAY_LOGICAL 区分） |
| 4 | 思源黑体 Regular 是网页真实字体？ | 是（5.3 native audit + 5.4 创建实测） |
| 5 | 字号测量还是猜？ | 真实测量（12-72 校准表；反推公式实证 5.03% 误差） |
| 6 | 用真实 visualBounds？ | 是（创建后 getBoundingRect 回读校验） |
| 7 | 能双击修改？ | 是（type=textbox + editable=true；fabric 编辑语义） |
| 8 | 真用网页 group？ | 是（fabric.Group 原生，编组/解组） |
| 9 | 原图删除？ | 否（识别流程内保留；reload 会话清除符合未保存语义） |
| 10 | 失败安全？ | 是（NOT_FOUND 不误写模板；rollback 零残留） |
| 11 | 新对象 identity 泄漏？ | 否（markuuid=null 4/4） |
| 12 | 用户在网页内完成？ | 是（整链在真实编辑器执行；OCR 来源待 5.5 接入真实 provider 后全自动） |

## 8. Production 变更

- **零行为变更**：未触碰 page-bridge/assistant/userscript/apply；新增 runtime 审计与报告（全部脱敏）。
- Deferred 记录：
  - Local OCR（tesseract.js 等）接入决策 → 5.5（含体积/中文质量/集成评估）
  - Native OCR 相框交互深度适配（可行时优先复用，§八十）
  - 多行文本字号反推（行数估计）
  - native 图片输入自动化（用户真机验证优先）

## 9. 停止点

停在「真实图片→真实 textbox→校准字号→可编辑→编组→参考图→回滚」全链成立。**不进入完整设计稿重建/SVG 矢量化/复杂艺术字**；下一阶段（5.5：Local/Native OCR provider 真接 + 真实用户图片验证）待授权。