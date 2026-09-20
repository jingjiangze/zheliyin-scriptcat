# Stage 8B：OCR 坐标系合同（Coordinate Contract）审计

> 阶段：Stage 8B/8C OCR 自动重建核心重构 · STEP 1
> 分支：`stage-8b-ocr-reconstruction-engine`（基于 test 74a9e74，v0.3.11.13）
> 性质：纯证据/审计文档，无生产代码修改，不升版
> 目的：逐层标注从「源图片」到「Fabric 画布」到「站点业务字段」的每一个坐标系，
> 明确每个值的来源/派生/写回，为 STEP 2（image-space.js 真实 aCoords 仿射）与
> STEP 3（text-fit.js 浏览器实测）提供唯一数学契约基线。
> 本文所有结论均引用当前工作树真实代码（非记忆）。

---

## 0. 阅读前声明（本阶段的认知修正）

本阶段正式废弃两个旧假设（用户 Stage 8B 指令）：
1. **`left/top = 源 bbox 左上角猜中心`** —— 不可用。Fabric 对象的真实落点必须读
   `setCoords()` 之后的 `aCoords`（tl/tr/br/bl），不得从 `left/top/width/height/angle`
   反推四角后当作事实。
2. **`fontSize = avgLineH / 0.969` 不能作为生产唯一公式** —— 必须用浏览器
   `CanvasRenderingContext2D.measureText()` 实测
   （`actualBoundingBoxAscent/Descent/Left/Right/width`）求解。

验收口径升级：不再接受 `expected == actual` 即判 PASS；必须 Source Image + OCR 目标
几何 + 创建后 Fabric 实测对比 + overlay 图（漂移/字号/旋转/越界肉眼可见）。

---

## 1. 坐标系定义（7 层）

| 代号 | 名称 | 原点 | 单位 | 语义 |
|---|---|---|---|---|
| `IMAGE_PIXEL` | 源图像素 | 左上角(0,0) | 源图 raster px | OCR 输出的坐标空间（`candidate.coordinateSpace="image-pixel"`），尺寸 = naturalWidth×naturalHeight（`toDataURL` 导出画布同尺寸） |
| `IMAGE_LOCAL` | 图片对象局部系 | 对象局部左上(0,0) | 对象逻辑单位 | Fabric 对象在 scale/rotation/translation 之前的自身坐标系，尺寸 = 对象 `width × height`（逻辑）。**当前实现隐式假设 IMAGE_PIXEL == IMAGE_LOCAL（恒等）**，见 §5 F5 |
| `IMAGE_TRANSFORMED` | 图片显示四边形 | 与画布同 | 画布逻辑单位 | 源图经 scale/rotation→translation 后在画布上的显示位置（四个角） |
| `CANVAS_LOGICAL` | Fabric 画布逻辑系 | 画布左上(0,0) | fabric 逻辑单位 | `canvas.width/height`；对象 `left/top/scaleX/scaleY/angle/aCoords` 所在系；**这是创建对象的目标系** |
| `CANVAS_VIEWPORT` | 画布视口系 | 视口左上 | 视口 px | `viewportTransform` 缩放/平移后的显示位置（`P_viewport = P_canvas × viewportTransform`） |
| `CSS_PIXEL` | 屏幕 CSS 系 | 视口左上 | CSS px | 受 `zoom`（浏览器页面缩放）与 retina 影响的最终物理显示 |
| `NATIVE_BUSINESS` | 站点业务字段系 | 画布系同源 | 同 CANVAS_LOGICAL | `locationX/Y/Width/Height/locationRotation`、`media.font.pointSize`、`location.factWidth/factHeight` 等序列化字段；值取自 fabric 几何，但经 `Math.round()` 量化（见 §4 写回） |

**关键判定（8B 立场）**：创建对象只在 `CANVAS_LOGICAL` 系中进行；`CANVAS_VIEWPORT / CSS_PIXEL / DEVICE_PIXEL` 只影响肉眼显示与 overlay 验证，不进入创建数学。
（8A-2 真机：zoom=1.4525 / viewportTransform=[1.4525,0,0,1.4525,0,0] / retina=0.8 —— 均为显示系，见 §6。）

---

## 2. 数据流全链（真实代码，值级标注）

```
[页面世界 — page-bridge.js]                    [隔离世界 — user.js / ocr/*]
─────────────────────────────                 ─────────────────────────────
buildOcrPrepare() L602-614
  ├ active-image → extractImagePayload(active)        L609
  ├ background-image → extractImagePayload(bg)        L610
  └ first-image → extractImagePayload(first)          L611-612
```

### 2.1 目标图解析：`extractImagePayload(target, kind, canvas)`（page-bridge L570-600）

| 输出字段 | 来源（真实代码） | 坐标系 |
|---|---|---|
| `dataUrl` | element → canvas `naturalWidth×naturalHeight` → `toDataURL`（L573-581） | IMAGE_PIXEL 全尺寸 raster |
| `width / height` | `el.naturalWidth/naturalHeight`，缺省回落 `target.width/height`（L573-574） | IMAGE_PIXEL |
| `geometry.left` | `target.left`；`!isFinite → (canvas.width − w×(target.scaleX||1))/2`（L584-585） | CANVAS_LOGICAL |
| `geometry.top` | `target.top`；同上居中兜底（L586） | CANVAS_LOGICAL |
| `geometry.width / height` | `target.width / target.height`（L594-595） | IMAGE_LOCAL（对象逻辑） |
| `geometry.scaleX / scaleY` | `target.scaleX || 1`（L596） | 显示比例（无单位） |
| `geometry.angle` | `target.angle || 0`（L597） | 度 |

> ⚠ 一致性缺口：`dataUrl` raster 尺寸用 `natural`（`w` = naturalWidth），而
> `geometry` 显示尺寸用 `target.width × scaleX`。背景图居中兜底公式混用了
> `w`（natural）乘 `target.scaleX`（L585）—— 当 `target.width ≠ naturalWidth` 时
> display 尺寸计算自相矛盾（见 §5 F5）。

### 2.2 冻结：`handleOcrImage`（user.js L960-1024）

- `ocrTarget = { kind: prep.kind, geo: prep.geometry }`（L1009）—— 页面世界已解析，
  隔离世界不直读画布；随后冻结 `pageId/side`（L1013-1024，Page Ownership）。
- `img = { dataUrl, width: prep.width, height: prep.height }`（L1025）→ OCR
  （Baidu Cloud 或 LOCAL fallback）。OCR 输出在 **IMAGE_PIXEL**。

### 2.3 OCR 归一化链（candidate-normalizer.js，全部 IMAGE_PIXEL）

```
unifyCandidates (L49-88)     候选 {text, bbox{x,y,width,height}, center, rotation, coordinateSpace:"image-pixel", imageSize}
  ↓
groupWordsToLines (L164+)    字 → 逻辑行（y 中距/字高比/阅读序），tight bbox
  ↓
groupLinesToBlocks (L288+)   行 → TextBlock：bbox（块紧致包围盒）、lines[].bbox、
                             lineHeightMedian、center（中位数）
  ↓
buildTextBlocks (L471-509)   附加 provider/rawText/safeText/sanitize/safety/
                             sizeCluster/estimatedTextHeight；coordinateSpace:"image-pixel"
```

块内关键几何字段（消费方 buildItemsFromOcr）：
- `bbox`：块级紧致包围盒（IMAGE_PIXEL）—— 多行块时是整块 AABB，**不是单行**；
- `lines[].bbox`：每逻辑行的 bbox（`avgLineH` 取其中位数均值，L1103-1105）；
- `bbox.width/height` 未经任何显示缩放 —— **缩放发生在 Mapper（§2.4）**。

### 2.4 映射与创建：`buildItemsFromOcr`（user.js L1072-1162）

输入：`geo`（CANVAS_LOGICAL：left/top/scaleX/scaleY/angle + IMAGE_LOCAL：width/height）+ blocks（IMAGE_PIXEL）。

| 派生量 | 公式（真实代码） | 语义 |
|---|---|---|
| `w, h` | `geo.width, geo.height`（L1082） | 图片对象逻辑尺寸 |
| `sx, sy` | `geo.scaleX, geo.scaleY`（L1082） | 显示比例系数 |
| `cx, cy` | `left + (w·sx)/2, top + (h·sy)/2`（L1087） | 图片显示中心（CANVAS_LOGICAL） |
| `bw, bh` | `b.bbox.width·sx, b.bbox.height·sy`（L1101） | OCR 块视觉尺寸（已 ×scale） |
| `avgLineH` | blocks 各行 bbox.height 均值，缺省=bh（L1103-1105） | 视觉字高基准（IMAGE_PIXEL） |
| `fs` | `clamp(round(avgLineH·sy/0.969), 8, 160)`（L1107） | **fontSize（FONT_HEIGHT_RATIO=0.969，§5 F2）** |
| `textLines` | `srcText.split("\n")` 去空（L1110） | 逻辑行 |
| `layoutWidth` | `estimateTextLayout(textLines, fs, {minWidth:max(60,bw+8), maxWidth:4000, margin:max(10,round(fs·0.35)), visualWidth:bw})`（L1111-1113） | **textbox 宽（visualWidth 主导，§5 F3）** |
| `boxHeight` | `round(textLines.length·fs·1.3 + 8)`（L1140, FONT_LINE_HEIGHT=1.3） | **textbox 高（启发式，§5 F4）** |

#### θ=0 分支（L1135-1142）
```
ux = b.bbox.x / w − 0.5 ; uy = b.bbox.y / h − 0.5        // 源 bbox 左上角在图片中的归一化偏移
dx = ux·w·sx ; dy = uy·h·sy                                  // →CANVAS_LOGICAL 偏移
px = cx + dx·cos − dy·sin ; py = cy + dx·sin + dy·cos   // θ=0 → (cx+dx, cy+dy) = 源 bbox 左上角映射点
left = px − 4 ; top = py − 4                                  // ⚠ magic −4（§5 F1）
width = layoutWidth ; fontSize = fs ; height = boxHeight
```
**注意**：θ=0 时该分支映射的是 **源 bbox 左上角**；文字对象落点 = 左上角映射 − 4。
未使用自身 `width/height` 反推中心 → 当前对象中心 ≠ 源中心（偏差受 layoutWidth 影响）。

#### θ≠0 分支（L1144-1156）：Stage 8A-1 WRONG_ORIGIN fix（AABB 定位）
```
M = [cos·sx, sin·sx, −sin·sy, cos·sy,
     cx − cos·sx·(w/2) + sin·sy·(h/2),
     cy − sin·sx·(w/2) − cos·sy·(h/2)]                 // 8A-2 已接线（image-transform.js）
corners = transformCorners(源bbox{left,top,width,height}, M)   // 4 角 → CANVAS_LOGICAL
left = min(corners.x) ; top = min(corners.y)            // AABB 左上
angle = θ ; origin = "left"
```
**数学语义**（见 §3 合同）：源 bbox 四角先按 `(sx,sy)` 缩放、绕图片显示中心旋转 θ、
再平移至 `(cx,cy)`，取 AABB。该矩阵 = `T(cx,cy) ∘ R(θ) ∘ S(sx,sy) ∘ T(−w/2,−h/2)`。

### 2.5 创建与写回：page-bridge `ocrCreate`（L50-255）

Native-first（`diy.drawText` 存在时，L108-181）：

| 写回 | 代码 | 值来源 |
|---|---|---|
| entry.size | `Math.max(8, it.fontSize||14)`（L504） | mapper fs |
| entry.w / h | `max(20, it.width||60)` / `max(14, it.height || round(size·1.3+8))`（L505-506） | mapper layoutWidth / boxHeight |
| entry x / y | `Math.round(it.left/top)`（L508-509） | mapper left/top（**量化到整数 px**） |
| media.font.pointSize | entry.size | NATIVE_BUSINESS |
| location.factWidth/Height | w/h | 同上 int |
| layerNum | `layerNumBase + idx`（L122） | 图层序号 |
| 对象查找 | `findOcrObject` text+layerNum（L536-545） | 创建后核对 |

Mirror 降级路径（L182-255）：`createTextObject` + `mirrorEditorObjectModel`（L454-478）——
`locationX/Y = left/top`、`locationWidth/Height = width/height`、`locationRotation = angle`（L471-473），
`mediaMediaType="text"`、`multiUuid = sundry.guid()`。

> **8B 关键写回问题**：`left/top` 在写回 `locationX/Y` 前被 `Math.round()`（L508-509），
> 且 `locationWidth` 用 `it.width`（=layoutWidth，非实测度量）。STEP 4 的 Phase D
> （business field 同步）必须重新取证 Fabric↔Native 映射，替换当前直接抄写。

---

## 3. 唯一 Transform 合同（source → canvas）

### 3.1 合同声明

对任意源点 `P_src = (x, y)`（IMAGE_PIXEL/IMAGE_LOCAL，0≤x≤w，0≤y≤h）：

```
P_canvas = M_total · P_src

M_total = T(cx, cy) ∘ R(θ) ∘ S(sx, sy) ∘ T(−w/2, −h/2)

等价显式（与 image-transform.js transformPoint 同构，m=[a,b,c,d,tx,ty]）：
  a = cosθ·sx            b = sinθ·sx
  c = −sinθ·sy           d = cosθ·sy
  tx = cx − cosθ·sx·w/2 + sinθ·sy·h/2
  ty = cy − sinθ·sx·w/2 − cosθ·sy·h/2
  P_canvas.x = a·x + c·y + tx
  P_canvas.y = b·x + d·y + ty
```

**先缩放（局部 frame）再旋转（绕显示中心）**；`sx==sy`（名片模板常态均匀缩放）时
该矩阵与 Fabric 对象自身矩阵（`T(center)∘R∘S∘T(−w/2,−h/2)`，fabric 采用绕中心旋转、
缩放作用于局部系）逐项一致。

### 3.2 边界自检（sanity，θ=0）

| 源点 | 期望 | 合同结果 |
|---|---|---|
| (0,0) 源左上 | (left, top) | `tx=cx−sx·w/2=left`, `ty=cy−sy·h/2=top` ✓ |
| (w/2, h/2) 源中心 | (cx, cy) | `cx+0, cy+0` ✓ |
| (w, 0) 源右上 | (left+w·sx, top) | ✓ |
| (w, h) 源右下 | (left+w·sx, top+h·sy) | ✓ |

### 3.3 与 fabric 的关系与差异（8B STEP 2 必须实测的点）

1. 均匀缩放 + 任意旋转：合同矩阵 = fabric 对象矩阵，可直接用。
2. **非均匀缩放（sx≠sy）且旋转**：合同将缩放作用于「未旋转局部系」，fabric 的
   `calcTransformMatrix` 语义需以 `setCoords()` 后 `aCoords` 实测为准 —— **禁止**在
   8B 中靠该矩阵猜测非均匀旋转图；由 image-space.js 用 `aCoords.tl/tr/br/bl` 建立
   真实仿射（STEP 2）。
3. `aCoords` 是含 `scaleX/scaleY/left/top/angle` 的**最终渲染几何**；`left/top` 只是
   对象原点（可能非显示四角之一，尤其 origin≠left/top 与旋转时）。8B 一律以
   `setCoords()` 后的 `aCoords` 为真值，`left/top` 仅作顺带记录。

---

## 4. NATIVE_BUSINESS 写回契约（当前实现 → 8B 目标）

| 业务字段 | 当前来源 | 8B 目标写回 |
|---|---|---|
| `media.font.pointSize` | avgLineH·sy/0.969 钳制 | 实测 solveFontSize（STEP 3） |
| `location.width / location.factWidth` | layoutWidth（visualWidth 主导） | solveTextWidth 实测文本度量 |
| `location.height / location.factHeight` | lines·fs·1.3+8 | 实测视觉行高（multi-line 逐行） |
| `location.x / y` | round(mapper left/top) | 实测对象 aCoords AABB 左上（round 后写回，与原生字段量化一致） |
| `location.rotation` | mapper angle | 与 OCR/image 双旋转核对（STEP 4 Phase C） |
| `layerNum` | 当前最大层+1 | 沿用（不变） |

> 现状缺口：round() 量化在映射端（L508-509）而非写回端 —— 若创建与写回同一对象，
> round 前/后几何不一致会直接造成「Fabric 实测 ≠ location 字段」。8B Phase D 将统一
> 在写回端量化一次，且与 Fabric 实测共用同一份 aCoords 快照。

---

## 5. 现存近似点清单（8B 必须逐项替换/验证，禁止继续当 magic）

| 编号 | 位置 | 现值 | 问题 | 8B 处置 |
|---|---|---|---|---|
| F1 | user.js L1142 | θ=0: `left=px−4, top=py−4` | **magic −4 与对象自身宽高无关**；对象中心 ≠ 源中心 | image-space + compareTextGeometry 以 center 对齐 |
| F2 | user.js L1068/L1107 | `fs = avgLineH·sy/0.969` | 固定比例不跨字体/scale 稳定（visualHeight/fs 漂移） | text-fit.js measureText 二分实测 solveFontSize |
| F3 | candidate-normalizer L520-527 L554-558 | 字符宽度估算（CJK=fs, 空格=0.32fs…）+ visualWidth 兜底 | 估算非实测；宽字重/中英混排漂移 | solveTextWidth（actualBoundingBoxLeft/Right） |
| F4 | user.js L1140 | `boxHeight = lines·fs·1.3+8` | 固定行高系数；多行块整块只给一个 box | 逐行视觉行高 + line-space 取证 |
| F5 | page-bridge L573-586 | naturalWidth 与 target.width 混用；背景图居中兜底 | `target.width≠naturalWidth` 时 display 尺寸矛盾 | image-space.js 以 aCoords 为真，弃 target.width 猜测 |
| F6 | buildOcrPrepare L608-612 | active→bg→first 三级回退，kind 无双关 | 目标图变更后 geo 冻结 | 沿用冻结，kind 进入 image-space route adapter |
| F7 | user.js L1157-1161 | transformCorners 缺失回退 center/origin 分支 | 死代码风险（@require 恒加载） | 删除或标 deprecated，统一走 aCoords |

---

## 6. 真机 anchor（8A-2 已采集，供 STEP 2/5 复查）

252438 active-image golden：
```
natural 1000×300     zoom=1.4525     retina=0.8     currentSize=1.4525
viewportTransform = [1.4525,0,0,1.4525,0,0]
currentFactWidth=600 / Height=365      canvas = 871.5×530.16
```
1040459：zoom=0.755，currentFact 不同（背景图 route 代表性样本）。

> anchor 只用于验证显示系与 overlay；创建数学只看 CANVAS_LOGICAL（§1 判定）。

---

## 7. 8B 后续步骤接口契约预览（STEP 2/3 入口）

- `image-space.js`：`getImageRuntimeGeometry(imageObject, canvas)` —— `setCoords()` 后读
  `aCoords.tl/tr/br/bl`，把 natural/逻辑四角 `(0,0)(W,0)(W,H)(0,H)` 映射为唯一仿射
  `P_canvas = T_img · P_local`；`mapImagePoint/Rect/QuadToCanvas`；三 route adapter
  （active/background/first）统一输出 `{kind, element, naturalWidth, naturalHeight,
  sourceWidth, sourceHeight, imageQuad, imageTransform, coordinateContract}`；
  `validateQuadInsideCanvas`（越界>20% / center 出界 → GEOMETRY_INVALID 禁创建）。
- `text-fit.js`：`measureFont` / `measureTextGlyphBounds`（context.measureText
  ActualBoundingBox*）；`solveFontSize`（二分 8~160，heightError≤2px / widthError≤3px）；
  `solveTextWidth`；`fitTextObject`；`compareTextGeometry(targetQuad vs obj.aCoords) →
  {centerError,widthError,heightError,angleError,cornerError,aabbError,score}`；
  visualWidth vs layoutWidth 分离；lineCount>1 逐行几何。

---

## 8. 结论

1. 当前创建链路只在 **IMAGE_PIXEL → CANVAS_LOGICAL** 两层做映射，且**未经过 aCoords**；
   `left/top` 是对象原点猜测，不是真实显示四角 —— 与 F1 的 −4 offset 叠加，导致中心/
   AABB 对齐不可验证。这是 STEP 2 的根因靶点。
2. fontSize/layoutWidth/boxHeight 三条尺寸链全部是**启发式**（F2/F3/F4），无浏览器实测
   锚点 —— 这是 STEP 3 的根因靶点。
3. viewport/zoom/retina 属于显示系，创建数学不应掺入；仅 overlay 视觉验收需要。
4. 写回字段在映射端 round() 量化，与 Fabric 实测存在**一刻画布不一致**风险 ——
   STEP 4 Phase D 统一量化点。

状态：`STEP1_COORDINATE_CONTRACT = DONE`（纯文档；下一动作 STEP 2 image-space.js）。