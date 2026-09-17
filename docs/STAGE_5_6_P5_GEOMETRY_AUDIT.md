# Stage 5.6 — P5 Geometry：审计与坐标模型（P5-1，只读）

> 审计时点：2026-09-17；分支 `demo` HEAD `7c1df21`（Stage 5.6 OCR-only 交付后），working tree clean。
> 本审计只读生产代码，未修改任何文件。目标：找出当前「OCR bbox → Textbox 几何」实际坐标模型，确认旋转/缩放/位置/多尺寸现状，并定位真实缺陷候选（供 P5-2 矩阵验证、P5-3 最小修复）。

---

## 1. 实际几何链路（以代码为准）

```text
页面世界 page-bridge.extractImagePayload()        # extension/src/editor/page-bridge.js L110-140
  目标图：active image → backgroundImage → first image（buildOcrPrepare L142-151）
  输出 dataUrl(自然尺寸 w×h) + geometry{left,top,width,height,scaleX,scaleY,angle}

postMessage ocrPrepareResult
   ↓
隔离世界 handleOcrImage → unifyCandidates()          # candidate-normalizer.js L14-42
  统一 OCRCandidate {text, bbox{x,y,width,height}, confidence, coordinateSpace:"image-pixel", imageSize}
   ↓
buildItemsFromOcr()（Mapper）                        # zheliyin-card-assistant.user.js L888-922
  geo = ocrTarget.geo（来自 ocrPrepare）
  ↓
postMessage ocrCreate → page-bridge ocrCreate         # page-bridge.js L50-68
  createTextObject + obj.set({left,top,width,fontSize,fontFamily,textAlign,fill})  ← 不设 angle/origin
  ↓
真实可编辑 Textbox（axis-aligned）
```

**数据边界校验（P5-H）**：本地 executor lines（tesseract `bbox{x0,y0,x1,y1}`）与 Baidu 候选统一经 `unifyCandidates` → Mapper 只消费 `{x,y,width,height}` 统一字段，无原始 bbox 直达 Mapper 的旁路。**边界未绕过（静态确认）**。

---

## 2. Geometry Model（当前实际公式）

### 输入空间

| 符号 | 来源 | 说明 |
|---|---|---|
| `w, h` | `extractImagePayload` L113-114 | 自然尺寸（image pixel），`el.naturalWidth/naturalHeight`（缺省退 `target.width`） |
| `left, top` | L124-126 | fabric 对象 left/top；非有限时背景图取画布居中兜底 `(canvas.w − w·sx)/2` |
| `sx, sy` | L136 | `target.scaleX/scaleY`（缺省 1） |
| `θ` | L137 | `target.angle`（缺省 0） |
| `bbox{x,y,width,height}` | unifyCandidates | OCR bbox，image pixel 坐标，原点=导出图左上 |

### 变换（Mapper L893-903）

```text
image center on canvas:  cx = left + (w·sx)/2 ;  cy = top + (h·sy)/2
for each candidate:
  bw = bbox.width·sx ;  bh = bbox.height·sy           # 文本盒尺寸（未旋转展开）
  ux = bbox.x/w − 0.5 ;  uy = bbox.y/h − 0.5           # 归一化（image-local）
  dx = ux·w·sx ;  dy = uy·h·sy                          # 画布单位偏移（相对图像中心）
  px = cx + dx·cosθ − dy·sinθ                          # 旋转后的 bbox 左上角
  py = cy + dx·sinθ + dy·cosθ
  item = { text, left: px−4, top: py−4,
           width: max(60, bw+8),
           fontSize: max(10, round(bh)) }               # 高度不显式设，由 fontSize 推导
```

即：`C(P) = 图像中心 + R(θ)·((P−图像中心)_image_px ∘ s)`，其中 P 为 bbox 左上角点。

### 输出对象（page-bridge ocrCreate L61）

```text
obj.set({ left: it.left, top: it.top, width: it.width, fontSize: it.fontSize, ... })
```
- **不设置 `angle`**：产物 Textbox 恒为 axis-aligned，`originX/originY` 用 fabric 默认（left/top）。

---

## 3. 现状结论（逐项）

| 项 | 现状 | 说明 |
|---|---|---|
| 图像中心/归一化 | ✅ 正确 | 归一化→缩放→平移→旋转（关于图像中心），公式线性无损 |
| Scale（sx≠1/sy≠1） | ✅ 理论正确 | bw/bh/偏移全部乘 sx,sy；含非均匀缩放 |
| Position（left/top 偏移） | ✅ 理论正确 | cx/cy 随 left/top 平移 |
| 多尺寸 | ✅ 理论不变 | 全链路归一化，无固定像素偏差项；待实测 |
| **Rotation** | ❌ **明确缺陷候选** | ① 仅 bbox 左上角点旋转，**盒子尺寸不随旋转展开**（angle=90° 时 bw/bh 应互换）；② 输出 Textbox **不携带 angle**，在 θ≠0 时 axis-aligned 盒子与旋转文字区不重叠（θ=90° 偏移可达半个盒子宽）；L899 自注「旋转未展开（Demo 常量）」 |
| 背景图 left/top 兜底 | ⚠️ 依赖页面状态 | 居中兜底在页面世界完成，隔离世界假设 geometry 已就绪（P5-F 复核点） |
| 高度 | ⚠️ 近似 | 高度不显式设置，由 fontSize≈bh 推导（测量上界），P5 属次要项 |

---

## 4. P5-2 矩阵验证计划（真机 harness）

| 组 | 覆盖 | 单元格 |
|---|---|---|
| A 基础 | size 900×1200, scale 1, 居中, θ=0 | 1 |
| B 缩放 | 同 A，scale 0.5 / 2 | 2 |
| C 位置 | 同 A，left/top 左上 / 右下 / 居中 | 3 |
| D 旋转 | 同 A，θ=15/45/90 | 3 |
| E 多尺寸 | scale 1 居中 θ=0，500×500 / 2000×3000 | 2 |
| F/G 来源 | background-image（scale 0.7, left-top, θ=0）+ active-image（即全部 active 单元格） | 1+复用 |

- 每格：harness 自绘图像（已知文字位置）→ 注入画布 → 点原生 OCR → 读回 Textbox → `getCenterPoint()` 与**独立变换公式**（同上，直接由已知绘制矩形中心计算）比较 → 逐行误差 ≤ `tol = max(12, 0.04·w·sx)`px 判定 PASS；θ≠0 格同时校验 `textbox.angle == image.angle`。
- 预期：A/B/C/E/F 大概率 PASS；**D 旋转格预期 FAIL**（为 P5-3 最小修复提供证据）。

## 5. P5-3 最小修复候选（仅当 D 实测失败；不重写 Mapper）

1. Mapper（buildItemsFromOcr）：θ≠0 时输出 `angle: θ`、`origin: "center"` 与**旋转后中心**（`P_center = C(bbox中心)`），并给出旋转展开的盒尺寸（along/perp）。
2. page-bridge ocrCreate：接受可选 `angle`/`origin` 字段并 `obj.set({angle, originX:"center", originY:"center", left:centerX, top:centerY})`（fabric 绕中心旋转），θ≈0 路径保持不变（A/B/C/E/F 零回归）。
3. 仅两处小改动，不改 Provider/候选边界/UI。

## 6. 明确不在 P5 范围

- OCR 文字质量（错字/空格/language model）
- UI/DOM/原生抽屉/套版
- 重复防护 / 回滚 / 对象生命周期（P6）