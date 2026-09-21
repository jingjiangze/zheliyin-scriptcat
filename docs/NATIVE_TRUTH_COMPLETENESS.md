# Native Truth Completeness Audit（OCR-P0.4）

> 阶段：OCR-P0.4 / P0.4-B · Version：0.3.11.53 · 日期：2026-09-21
> 目标：每次 OCR 输出完整性审计字段（nativeLines / geometryCandidates /
> matchedNative / unmatchedNative / matchedGeometry / unusedGeometry），
> 并区分「图片没交付」vs「Native 自身漏识别」两类漏识别。

---

## 1. 审计字段契约

每次 Native/Geometry 对齐后（`maybeApplyNativeTruth` → `alignNativeGeometry` + `evaluateCompleteness`）输出：

```json
{
  "nativeLines": 8,
  "geometryCandidates": 9,
  "matchedNative": 8,
  "unmatchedNative": 0,
  "matchedGeometry": 8,
  "unusedGeometry": 1,
  "oneToMany": 0,
  "manyToOne": 0,
  "statusCode": "NATIVE_OK"
}
```

| 字段 | 来源 | 含义 |
| --- | --- | --- |
| `nativeLines` | OCRTool.do `userData` 行数（textType=2 生产真值） | Native 识别了多少行 |
| `geometryCandidates` | Baidu(+Local) 候选数（仅几何） | 可用的位置候选 |
| `matchedNative` | aligner matchedNative 数 | 获得可靠 geometry 的 native 行 |
| `unmatchedNative` | aligner unmatchedNative 数 | Native 有、geometry 无 |
| `matchedGeometry` | 被匹配占用的 geometry | 消耗的几何候选 |
| `unusedGeometry` | 未被匹配的 geometry | 冗余几何候选 |
| `statusCode` | classifyNativeStatus | NATIVE_OK/EMPTY/… |

---

## 2. 门禁判定（evaluateCompleteness，OCR-P0.3-D/E）

```
matchedNative === nativeLines（且 >0）→ COMPLETE
matchedNative + unmatchedNative === nativeLines，且 unmatchedNative > 0
  → NATIVE_GEOMETRY_INCOMPLETE（本批不进入创建，OCR-P0.3-E）
matchedNative === 0 且 unmatchedNative > 0
  → NATIVE_GEOMETRY_UNRESOLVED（全部无几何，不创建、不伪造位置）
```

生产硬规则（§11/§12）：
- Native Text exists + Geometry exists = eligible
- Native Text exists + Geometry missing → `NATIVE_GEOMETRY_UNRESOLVED`，
  禁止用 Baidu 原文字段顶替、禁止随便居中/随机位置/固定偏移/固定纵向间距。
- 识别 N 行、仅 N-2 行有可靠几何 → `NATIVE_GEOMETRY_INCOMPLETE`，整批不创建
  —— 杜绝「识别 8 行、画布莫名 6 行、系统却显示成功」的部分成功假象。

---

## 3. 漏识别二元归因（OCR-P0.4-B）

`native=5 / geometry=9` 时，不只记录 `kept=5`，必须同时记录：

```json
{ "nativeLines": 5, "geometryCandidates": 9,
  "matchedNative": 5, "unmatchedNative": 0,
  "matchedGeometry": 5, "unusedGeometry": 4 }
```

辨析：
- `nativeLines > 0 且 geometryCandidates ≥ nativeLines` 但 `matchedNative < nativeLines`
  → Native 确有文字、geometry 足够 → 是 **对齐失败（纯 Native 文本错位/mismatch）** 或 **Native 漏识别**。
- `nativeLines == 0`（NATIVE_EMPTY）且 geometryCandidates > 0 → OCRTool 成功结构但无文字
  → **Native 自身漏识别**（与「图片未交付」无关）。图片交付状态由 IMAGE_PREP/payload 校验独立审计
  （见 docs/OCR_IMAGE_DELIVERY_AUDIT.md：decodedBytes === payloadBytes === File.size）。
- `statusCode: NATIVE_SESSION_EXPIRED / NATIVE_IMAGE_INVALID / NATIVE_HTTP_FAILED`
  → **请求未成功**，登记状态细分错误码（OCR-P0.2-C），不是「漏识别」也不是「empty」。

---

## 4. 实现位置

| 项 | 文件 |
| --- | --- |
| 多因素对齐（消除 index-only 配对） | extension/src/ocr/native-geometry-aligner.js |
| 完整性门禁 + 搜索链（word/local） | extension/src/ocr/native-completeness-gate.js |
| textType=2 唯一真值 + 状态细分 | extension/src/ocr/native-ocr-provider.js |
| 统一 Transaction（payloadBytes/自然尺寸） | extension/src/ocr/transaction-identity.js |
| 生产接线 | zheliyin-card-assistant.user.js（runNativeTruth ∥ runGeometryRecognition → 门禁 → buildItemsFromOcr） |

---

## 5. 回归说明

- 5 CASE 矩阵（runtime/stage9/ocr-p0-matrix.test.js，6/6 PASS）：
  A Baidu empty / B quality fail / C exception 下 Native 仍执行；
  D 8=8 COMPLETE；E 8-geo/5-text INCOMPLETE 本批不创建。
- 全量 stage9 回归 126/126 PASS。
- `ocrCreate` 冻结区 hash 未变（runtime/reports/stage-10/ocr-create-freeze.json）。
- 真机（Playwright runner）补测需可写会话（ZY_STAGE9_COOKIE / P0_LOGIN_USER/PASS），目前受阻于会话过期。