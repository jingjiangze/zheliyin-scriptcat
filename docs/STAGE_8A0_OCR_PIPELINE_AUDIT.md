# STAGE_8A0_OCR_PIPELINE_AUDIT — OCR 运行时真相审计

> 分支：`stage-8a-ocr-audit`（基于 test = 0.3.11.0）
> 依据：Stage 8A-0 规格。**零生产代码修改**：只读源码摘录 CODE FACT + 真机运行时取证。
> 证据：`runtime/reports/stage-8a0/*.json`（ocr-runtime-route / ocr-source-image / ocr-provider-route /
>   ocr-resolution-chain / ocr-coordinate-chain / ocr-code-facts）
> 判定原则（§六十三）：CODE FACT=代码事实；REAL=运行时事实；INFERENCE=推断；UNKNOWN=未证明。

---

## 一、十五问（§六十一）—— 逐条证据

| # | 问题 | 答复 | 类型 |
| --- | --- | --- | --- |
| 1 | OCR 识别的是截图还是图片元素？ | **图片元素 → 离屏 Canvas 重编码（非截图）**。extractImagePayload：`target._element/getElement()` → 离屏 canvas(自然尺寸) → `toDataURL('image/png')`。无 viewport/无 crop/无 downscale | CODE FACT |
| 2 | 图片真正来源是什么？ | active image → backgroundImage → first-image（`find(type==='image')`） | CODE FACT |
| 3 | 是不是用户上传原图？ | 取决于 element 的 naturalWidth/naturalHeight：**取的就是元素自然尺寸**，若网站上传/生成阶段已压缩则 natural 即压缩后尺寸 | CODE FACT / UNKNOWN(上传阶段) |
| 4 | 当前元素 natural 尺寸？ | 三模板（1065075/1040459/252438）**当前画布上无 fabric image 对象、无 backgroundImage** → 无 natural 可读（REAL）；模板需先注入图（7.8R 已知流程） | REAL |
| 5 | Editor 中显示尺寸？ | 画布 Fabric 尺寸各异：252438=**871.50×530.16**、1065075=871.50×530.16、1040459=**453.23×744.80（竖版）** —— 画布几何因模板而异（REAL） | REAL |
| 6 | OCR 输入尺寸？ | = element 自然尺寸（离屏 canvas 同尺寸重编码）；三模板当前无图 → 无 OCR 输入（IMAGE_UNAVAILABLE） | CODE FACT + REAL |
| 7 | 中间是否经过 Canvas？ | **是**：element → offscreen canvas(w×h) → toDataURL（IMAGE_SOURCE→RERENDER，§三十六 明示非截图） | CODE FACT |
| 8 | 是否发生 resize？ | 插件侧**不做** resize（canvas 取自然尺寸）；**仅百度侧**：side>4096px 或 base64>4M → resizeImage 等比压缩（BAIDU 限制触达时） | CODE FACT / UNKNOWN(本组未触达) |
| 9 | 是否发生 crop？ | **否**：extractImagePayload 无 crop 逻辑；背景图 left/top 缺省时仅做画布居中兜底（非 crop） | CODE FACT |
| 10 | 是否发生 re-encode？ | **是，但无损**：`toDataURL('image/png')` → PNG 重编码（无 JPEG 降质；base64 体积大）。百度侧触达上限时 resize 内部再编码 | CODE FACT |
| 11 | 百度接口？ | `aip.baidubce.com/rest/2.0/ocr/v1/general`（含位置标准版）；鉴权 token GET `/oauth/2.0/token`；传输=GM_xmlhttpRequest（插件自有 transport） | CODE FACT |
| 12 | 请求是网页原生还是插件调用？ | **插件调用**（BAIDU=PLUGIN_OWNED_CLOUD_OCR）；网页自身不参与；Alt+Q 未使用（FROZEN） | CODE FACT |
| 13 | Local OCR 从哪读图？ | runLocalOcr 使用与百度**同一 img.dataUrl**（同一对象引用）→ CODE FACT 输入相同；runtime hash（§十三 SHA-256）未取证 → UNKNOWN | CODE FACT / UNKNOWN |
| 14 | Baidu / Local 是否完全相同输入？ | CODE FACT：同一 `img` 对象（同一 dataUrl/width/height）；运行时双 hash 对照待加（UNKNOWN） | CODE FACT / UNKNOWN |
| 15 | OCR bbox 最终属于哪个坐标空间？ | **OCR_INPUT_PIXEL**（candidate-normalizer `coordinateSpace:"image-pixel"`，bbox 相对 OCR 输入图 = element 自然尺寸）；未在 OCR 层转 Editor 坐标（buildItemsFromOcr 才做 center 偏移映射） | CODE FACT(空间) / UNKNOWN(映射精确性待 Typography) |

## 二、OCR Route Matrix（§三十五）

| 项目 | 当前实际 | 类型 |
| --- | --- | --- |
| OCR Trigger | 插件按钮 → handleOcrImage | CODE FACT |
| Source | active/背景/首个 image object | CODE FACT |
| Source Resolution | element 自然尺寸（naturalWidth/Height 优先） | CODE FACT |
| Source Crop | 无 | CODE FACT |
| Source Resize | 插件无；Baidu 超限时等比压缩 | CODE FACT |
| OCR Provider | Baidu primary / Local fallback | CODE FACT + REAL(7.8R) |
| Baidu API | rest/2.0/ocr/v1/general | CODE FACT |
| Network Transport | GM_xmlhttpRequest（插件） | CODE FACT |
| Local Provider | Tesseract（chi_sim） | CODE FACT |
| Fallback | Baidu → Local（auto；同一输入） | CODE FACT |
| Website Alt+Q | NOT USED / FROZEN | — |
| Result Schema | Common OCR Result（id/sourceProvider/rawMeta…） | CODE FACT |
| Coordinate Space | image-pixel（OCR_INPUT_PIXEL） | CODE FACT |
| Page Ownership | pageId canvas:c0/c1（三 URL 均 REAL=canvas:c0 FRONT） | REAL |
| Editor Create | Native drawText（ocrCreate 消息，isDisplay=0） | CODE FACT + REAL(7.8R) |

## 三、「88.5×57 只识别部分」分层定位（§十六/§十七）

三模板 REAL 结论：**当前画布无 fabric image / 无 backgroundImage** → OCR 无输入（IMAGE_UNAVAILABLE），
不属于 Case A~E 任何「输入有图」场景 —— 需先由用户/流程注入图片再做分层归因（Case B OCR_PROBLEM vs D 显示问题）。

已确认的 REAL：1040459 画布 = **453.2×744.8（竖版）**，与 92×56 类（横版 871.5×530.2）画布几何不同
→ CanvasGeometry 必须按实际画布读取，禁止硬编码（§二十八/§三十八）。

## 四、「小字放大」根因定位（§五十 A~F）

| 环节 | 现状 | 类型 |
| --- | --- | --- |
| A. OCR bbox height 是否大错 | **UNKNOWN**（需挂载已知实尺图 + source text bbox 对照；下一轮注入审计） | UNKNOWN |
| B. TextBlock bbox height | = OCR bbox 原值（buildTextBlocks 不改 height；`bboxHeight=bbox.height`、`estimatedTextHeight=lineHeightMedian`） | CODE FACT |
| C. buildItemsFromOcr 是否改 height | 不改 bbox height；textbox height=`lineCount*fs*1.3+8`（由 fs 推算）——**fs 是放大主嫌疑** | CODE FACT |
| D. fontSize 是否二次放大 | `fs=round(avgLineH*sy/0.969)` clamp 10..160 —— **单一映射点**；0.969 为历史近似标定（IDEA：sy 语义=图片显示 scaleY=fabric scaleX/Y，注入图为 1；真实背景图可能≠1）| CODE FACT；放大是否发生=INFERENCE(待 A 实证) |
| E. Native drawText 是否再缩放 | ocrCreate 不传 scaleX/Y（fabric new 默认 1）→ 无二次缩放 | CODE FACT |
| F. scaleX/scaleY 默认非 1 | 默认 1（无 scale 字段）| CODE FACT |

主嫌疑（INFERENCE）：D —— `avgLineH*sy/0.969` 中 sy（图片显示 scale）与 0.969 系数的组合，
加上 Editor fontSize 单位 → 渲染高度映射未校准；**结论需 A（OCR bbox 真值）与 Typography 实测（Stage 8A）共同确认**，
禁止在 8A-0 直接改 fontSize/scaleY（§六十二-1）。

## 五、与后续阶段交接

- 依据 §五十六：**Stage 8A-0 具备进入 Typography 的前置**需：SOURCE_CONFIRMED（挂图审计）、
  NO_UNEXPECTED_RESIZE/CROP（本轮 CODE FACT 已证无）、BBOX_SPACE_CONFIRMED（image-pixel 已证）→
  尚差 source 实尺对照审计（A 环节）与 Baidu/Local 输入 hash 对照（§十三，可选小改动取证）。
- 建议下一小步（独立 commit）：为三 URL 注入**已知像素尺寸**测试图（复用 7.8R ensureImageOnPage），
  捕获 PREPARING kind/WxH + provider + blocks + created fs/textbox 尺寸，
  完成 A~F 实证与 OCR_PREVIEW（§五十一，诊断面板 bbox/text/height/sizeRatio/provider）。

## 六、验收对照（§五十五）

| 项 | 判定 | 证据 |
| --- | --- | --- |
| REAL_SOURCE_IDENTIFIED | 需挂图审计 | UNKNOWN（本组） |
| FULL_REQUIRED_REGION | 模板无图 | UNKNOWN |
| NO_UNEXPECTED_DOWNSCALE | 插件无 downscale（element natural 直读） | PASS（CODE FACT） |
| NO_UNEXPECTED_CROP | 无 crop 逻辑 | PASS（CODE FACT） |
| BAIDU_PRIMARY | general 接口 + GM transport（7.8R 13 轮 REAL） | PASS |
| FALLBACK_INPUT_SAME | 同一 img 对象 | PASS（CODE FACT）/ hash UNKNOWN |
| IMAGE_PIXEL_CONFIRMED | coordinateSpace=image-pixel | PASS（CODE FACT + 单测） |
| SOURCE_BBOX_PRESERVED | TextBlock bbox=OCR bbox 原值 | PASS（CODE FACT） |
| Typography 可独立定位 | A~F 链已定位主嫌疑 D | PASS（INFERENCE 待实证） |
| PageOwnership 无回归 | 三 URL pageId=canvas:c0（REAL） | PASS |
| P0 无回归 | ocrCreate isDisplay=0 结构未动 | PASS（CODE FACT + 7.8R REAL） |

## 七、风险与下一步（诚实清单）

1. 三模板无图 → 「仅识别部分」无法在本轮归因（Case A~E 需挂图后判定）。
2. Baidu/Local 输入 hash 对照未做（可选小改动；测试阶段允许，不涉及生产逻辑）。
3. fontSize 0.969/scaleY 校正是 Typography 阶段事项，**本阶段不改**。
4. 下一步建议：注入实尺审计图 → 完成 A~F 实证 + OCR Preview → 8A-0 CLOSED → Stage 8A Typography Calibration。