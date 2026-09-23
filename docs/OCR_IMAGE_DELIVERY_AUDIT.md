# OCR Image Delivery Audit（OCR-P0.1）

> 阶段：OCR-P0.1 / P0.1-B · Version：0.3.11.53 · 日期：2026-09-21
> 目标：证明「发给 Native OCR 的图片」= 当前选中图片的**完整像素数据**，Baidu 与 Native 使用**完全相同**的 dataUrl。

---

## 1. 结论摘要

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 不裁剪（不 crop） | PASS | `extractImagePayload` 等尺寸 canvas `drawImage(el,0,0)`（page-bridge.js） |
| 不缩放（不 resize） | PASS | `cv.width = el.naturalWidth; cv.height = el.naturalHeight`，canvas 与源图自然尺寸一致 |
| 不 JPEG 压缩 | PASS | 导出统一 `cv.toDataURL("image/png")` |
| 不改变 orientation | PASS | 仅 `drawImage` 原样绘制，无 EXIF 翻转处理介入 |
| 不改变自然尺寸 | PASS | `naturalWidth/naturalHeight` 原样透传（IMAGE_PREP） |
| Baidu 与 Native 同一 dataUrl | PASS | `ocrPrepare` 单次产出 `dataUrl`，`handleOcrImage` 同一 `img.dataUrl` 供双 Provider |

---

## 2. 图片提取链路（IMAGE_PREP 诊断）

### 2.1 目标解析优先级（`buildOcrPrepare`, page-bridge.js）

```
active-image（画布选中图片）
  → background-image（画布背景图）
  → first-image（画布首张 image 对象）
```

### 2.2 提取实现（`extractImagePayload`, page-bridge.js）

```js
const el = target._element || (target.getElement && target.getElement());
let w = el.naturalWidth || el.width || target.width;
let h = el.naturalHeight || el.height || target.height;
const cv = document.createElement("canvas");
cv.width = w; cv.height = h;          // ← 等尺寸，禁缩放
const c2 = cv.getContext("2d");
c2.drawImage(el, 0, 0);               // ← 全像素原样，禁裁剪
dataUrl = cv.toDataURL("image/png");  // ← PNG 无损，禁 JPEG
```

六个「不改变」全部由源代码结构保证，无任何裁剪/缩放/压缩分支。

### 2.3 IMAGE_PREP 只读诊断字段（新增）

每次 OCR 开始（`ocrPrepareResult`）产出：

```json
{
  "imagePrep": {
    "kind": "active-image|background-image|first-image",
    "naturalWidth": 1063,
    "naturalHeight": 638,
    "dataUrlMime": "image/png",
    "decodedBytes": 123456,
    "dataUrlChars": 164000,
    "fingerprint": "img-...-164000",
    "sourceElementType": "IMG",
    "transformPolicy": "pass-through",
    "sameDataUrlForAllProviders": true
  }
}
```

字段语义：

| 字段 | 含义 | 用于证明 |
| --- | --- | --- |
| `kind` | 图片来源（选中/背景/首图） | 目标解析优先级正确 |
| `naturalWidth/Height` | 源图自然尺寸 | 尺寸未变（不缩放、不改变自然尺寸） |
| `dataUrlMime` | `image/png`（统一导出格式） | 不 JPEG 压缩 |
| `decodedBytes` | base64 解码后的真实字节数 | 完整像素数据（未截断） |
| `dataUrlChars` | dataURL 字符长度 | 与指纹 `-length` 后缀关联 |
| `fingerprint` | FNV-1a + 长度（与 transaction-identity.js 一致） | 同图同指纹，事务关联 |
| `sourceElementType` | 源元素类型（IMG 等） | 提取源有效 |
| `transformPolicy` | `pass-through` | 零变换（不裁剪/缩放/压印） |

---

## 3. Native Payload 校验（OCR-P0.1-B）

### 3.1 `buildFormPayload()`（native-ocr-provider.js）

dataURL → File → FormData，同时产出 **payload 诊断** 并执行 **完整性硬校验**：

```json
{
  "diagnostics": {
    "mime": "image/png",
    "filename": "native-ocr.png",
    "blobSize": 123456,
    "fileSize": 123456,
    "textType": "2",
    "decodedBytes": 123456,
    "transformPolicy": "pass-through"
  },
  "errorCode": null
}
```

### 3.2 硬校验：`File.size === decoded dataURL bytes`

```js
if (decodedBytes >= 0 && typeof file.size === "number" && file.size !== decodedBytes) {
  return { ok: false, errorCode: "IMAGE_PAYLOAD_MISMATCH", ... };  // 拒绝发送
}
```

- `decodedBytes` = `atob(base64).length`（解码字节数）
- `file.size` = 由 Blob 构造的 `File` 实际字节数
- 二者不等 → 说明 payload 截断/损坏 → **`IMAGE_PAYLOAD_MISMATCH`，不允许静默发送**
- 新增错误码：`IMAGE_PAYLOAD_MISMATCH`

### 3.3 单测（native-ocr-provider.test.js，16/16 PASS）

| 用例 | 断言 |
| --- | --- |
| dataURL → diagnostics（mime/filename/textType/decodedBytes） | `file.size === decodedBytes` |
| File.size === decodedBytes（AAA= padding 正确解码） | 等式成立 |
| 非法入参 → `IMAGE_INVALID` formData=null | 拒绝构建 |
| recognize 对 payload 失败透传 `errorCode` + diagnostics | `errorCode=IMAGE_INVALID`、`payload.mime` 存在 |

---

## 4. 六项保证的代码锚点

| 保证 | 锚点（page-bridge.js / native-ocr-provider.js） |
| --- | --- |
| 不裁剪 | `extractImagePayload`: `c2.drawImage(el, 0, 0)` |
| 不缩放 | `extractImagePayload`: `cv.width = w; cv.height = h`（w/h = naturalWidth/Height） |
| 不 JPEG 压缩 | `extractImagePayload`: `cv.toDataURL("image/png")` |
| 不改变 orientation | `extractImagePayload`: 无任何 exif/旋转变换 |
| 不改变自然尺寸 | `imagePrep.naturalWidth/Height` 原样透传 |
| Baidu 与 Native 同一 dataUrl | `ocrPrepare` 单次产出 → `runBaiduOcr` / Native 共用 `img.dataUrl` |

---

## 5. 回归说明

- 本阶段**未修改** `ocrCreate` / `drawText` / Native Layer 创建路径（冻结取证见 `runtime/reports/stage-10/ocr-create-freeze.json`）。
- 后续 OCR-P0.2 将把 Native OCR 从 Baidu 门控解耦，保证 Baidu=0 / quality FAIL / candidate gate FAIL 时 Native OCR 照常执行（此审计确保届时 Native 收到的正是同一份完整图片）。