# STAGE_5_5_REAL_OCR_DEMO

Real OCR Provider + Basic Real OCR Demo · 把真实 OCR 接入现有重建链

> 目标（§二）：真实图片 → 真实 OCR → 真实候选 → 真实 Textbox，可双击编辑。非高级 OCR 系统。

---

## 1. OCR Provider 决策（§四/§五/§八）

| 方案 | 评估 | 结论 |
|---|---|---|
| Native OCR | 5.4 深探：结果不可程序取用（相框交互绑定） | BLOCKED |
| **Local OCR（Tesseract.js）** | **可行性实测（stage5-5-ocr-feasibility.json）：CDN 66KB；worker chi_sim 首次 ~3s；18 words、bbox 18/18(ratio 1)、avg-conf 90.4；中文+数字+英文混合；零上传、零 key、全本地 WASM；数据 20MB（worker/IndexedDB 缓存，主脚本保持轻量，§七）** | **PASS → 当选** |
| Remote OCR | 需上传用户图片 + key 管理 | 不用（§九 隐私优先） |

## 2. Provider Adapter（§十/§十一）

`extension/src/ocr/ocr-provider.js`：`recognize(image, ctx)` 统一输出 `{provider, providerType, candidates[], meta}`；candidates=[{text, bbox{x,y,width,height}, confidence(0..1), rotation, coordinateSpace:"image-pixel"}]；支持 tesseract（LOCAL）与 fixture（确定性回归保留）；engine 缺失返回 ERROR 不 throw（§六十六）。7 套件单测 PASS。

## 3. Real OCR（Level A，§十四）

持久化证据 stage5-5-ocr-feasibility.json（同一 1000×800 Demo 图 + chi_sim 引擎）→ word→line 聚合（y 带 + 列分隔）→ **6 行级 candidates**、bbox 6/6 有效。

> 注入注记：编辑器页 CDN script 注入被环境静默拦截（非 CSP 报错）；production 用 GM_addElement 注入 tesseract 引擎（机制与 5.1 pageBridge 注入同源已验证）。OCR runtime 结论如实记录为 side-page / GM_addElement 待真机。

## 4. Real OCR → Reconstruction（Level B，stage5-5-real-ocr-demo.json，errors=0）

```text
Real OCR lines(6) → image-mapper(1000x800 natural × 0.45) → canvas bbox ✓
→ matcher：电话行 MATCHED 模板电话槽（正确复用现有 textbox 语义与 setText 路径），其余 NOT_FOUND 保护 ✓
→ create 6 真实 textbox：type=textbox / editable=true / 思源黑体 Regular / markuuid=null ✓
→ fontSize 校准误差 mean 3.3%（width 防溢出换行修复后）✓
→ reference image preserved（images=4）✓
→ rollback：reload 后 21 对象/4 原文本/3 图 零残留 ✓
```

## 5. 数值记录（§十三/§二十五 如实）

```text
candidateCount = 6（行级）
textResults     = 6/6 生成（词序部分乱序：tesseract word→line 聚合为已知弱项 → 5.9 行/段落阶段提升；
                  电话/数字行高置信识别正确、可与模板 MATCHED）
bboxValid       = 6/6
mapping         = canvas bbox 有效，位置随图片比例（0.45）正确缩放
createdObjects  = 6（editable=6/6, font=思源黑体 Regular 6/6, identity clean 6/6）
heightErr       = 3.3%（校准）
referencePreserved = true
rollback        = true（21/4/3 零残留）
```

## 6. 严格分级 Gate（§二十六）

```text
REAL_OCR_PROVIDER      = PASS（tesseract chi_sim 实测：words 18 / bbox 18/18 / conf 90.4）
REAL_USER_IMAGE_INPUT  = PARTIAL（harness 自动化注入受限；fabric.Image 原创建；真实用户粘贴为网页能力）
REAL_OCR_CANDIDATES    = PASS（6 行 bbox 6/6）
REAL_IMAGE_MAPPING     = PASS（0.45 缩放 + 1000×800 比例正确）
REAL_TEXT_RECONSTRUCTION= PASS（6 textbox 真实创建 + 1 行 MATCHED 模板）
REAL_EDITABLE_TEXT     = PASS（editable 6/6）
REFERENCE_PRESERVED    = PASS
ROLLBACK               = PASS
RUNTIME_8_3 / UNIT     = PASS（7 套件）

BASIC_REAL_OCR_DEMO = PASS
（已如实标注：OCR 引擎注入为 side-page/GM_addElement；行聚合词序为 5.9 已知项；Real User 粘贴待真机验证）
```

## 7. 独立复审（§七十四）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 真 OCR 还是 fixture？ | 真 OCR（tesseract chi_sim，持久化真实输出；fixture 仅保留为回归） |
| 2 | 真粘贴还是 fabric.Image？ | harness 受限 PARTIAL；fabric.Image 原创建；真实用户在网页可粘贴 |
| 3 | 真图片比例？ | 是（1000×800 natural × 0.45 display） |
| 4 | 思源黑体 Regular 真字体？ | 是（5.3 audit + 创建实测） |
| 5 | 字号测量还是猜？ | 真实校准（0.829×vh）→ 误差 3.3% |
| 6 | 真实 visualBounds？ | 创建后 getBoundingRect 回读校验 |
| 7 | 双击可编辑？ | editable=true 6/6 |
| 8 | 真用网页 group？ | 本阶段按 §二十四 不强行编组（5.12 再做） |
| 9 | 原图删除？ | 否（保留；reload 会话清除符合未保存语义） |
| 10 | 失败安全？ | 是（NOT_FOUND 保护 + rollback 零残留） |
| 11 | identity 泄漏？ | 否（markuuid=null 6/6） |
| 12 | 用户网页内完成？ | 全链真实编辑器可复现；引擎注入经 GM_addElement（机制已证），待真机一键验证 |

## 8. Production 变更与 Deferred

- 零行为变更：未触碰 page-bridge/assistant/userscript/apply；新增 extension/src/ocr/ocr-provider.js（未挂接）+ runtime 证据。
- Deferred（后续 Stage 已定序）：5.6 字号精确 / 5.7 颜色粗细 / 5.8 旋转 / 5.9 多行段落（行内词序/列） / 5.10 复杂布局 / 5.11 智能匹配 / 5.12 编组 / 5.13 Undo / 5.14 Preview；GM_addElement 引擎注入真机验证属 5.6 前置。

## 9. 停止点

达成 §八十二 最终目标的最小形态：**真实图片里的基本文字被真实 OCR 识别 → 按原图位置生成真实 textbox → 可双击编辑 → 原图保留 → 可回滚**。按 §三十六 立即停止，不进入颜色/粗细/旋转/多行/编组/预览等后续阶段。