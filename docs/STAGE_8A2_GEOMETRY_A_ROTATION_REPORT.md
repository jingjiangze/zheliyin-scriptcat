# STAGE 8A-2 Geometry A/B — Rotation Transform Contract 与 A 修复验收

> Stage 8A-2 Geometry 阶段（STEP 1-5）
> 依据：`runtime/reports/stage-8a2/geom-252438-*.json`（真机 0/2/5/8/10° ON/OFF 全矩阵）
> 日期：2026-09-19

## 一、结论

| 判据 | 结论 |
|---|---|
| `A_ROTATION_GEOMETRY` | **PASS**（生产接线 image-transform 后 expected==GT 全角度精确） |
| 修复方式 | 接线 `image-transform.js`（userscript @require + manifest js），启用 `buildItemsFromOcr` 旋转 AABB 分支 |
| 版本 | 0.3.11.12 → **0.3.11.13** |

## 二、252438 Golden Baseline（STEP 1，0°/scale1）

注入图（active-image 路径，left=60, top=60, w=1000×h=300, scale=1, angle=0）：

| 项 | 值 |
|---|---|
| naturalWidth/Height | 1000 / 300 |
| Fabric width/height | 1000 / 300（scale 1,1） |
| left/top | 60 / 60 |
| angle / originX / originY | 0 / left / top |
| canvasWidth/Height | 871.5 / 530.16 |
| viewportTransform | [1.4525, 0, 0, 1.4525, 0, 0] |
| zoom / retina | 1.4525 / 0.8 |
| currentFactWidth/Height | 600 / 365 |
| currentSize | 1.4525 |

OCR（local engine）→ 3 blocks；expected（buildItemsFromOcr）vs actual（textbox）**完全命中**：

| block | text | expected (L,T,W,H,fs) | actual (L,T,W,H,fs) |
|---|---|---|---|
| 0 | 大字标题实例文字 | 88, 83, 493, 85, 59 | 88, 83, 493, 85, 59 |
| 1 | 中号正文联系电话与邮箱地址 | 88, 167, 265, 33, 19 | 88, 167, 265, 33, 19 |
| 2 | 小字页脚版权备注行 | 87, 256, 115, 22, 11 | 87, 256, 115, 22, 11 |

## 三、Rotation Transform Contract（STEP 2-3）

**唯一数学合同（源图片 local bbox → canvas AABB）**：

```
cx = left + (w·sx)/2 ; cy = top + (h·sy)/2
对 bbox 四角 p：
  dx = (p.x − w/2)·sx ;  dy = (p.y − h/2)·sy
  px = cx + dx·cosθ − dy·sinθ
  py = cy + dx·sinθ + dy·cosθ
AABB = (minX, minY) → (maxX, maxY)
```

等价矩阵（fabric 风格 2D affine，buildItemsFromOcr 旋转分支与 image-transform.transformCorners 同构）：

```
M = [ cosθ·sx, sinθ·sx, −sinθ·sy, cosθ·sy, tx, ty ]
tx = cx − cosθ·sx·(w/2) + sinθ·sy·(h/2)
ty = cy − sinθ·sx·(w/2) − cosθ·sy·(h/2)
```

0° 修正：no-angle 分支 `left=px−4, top=py−4`（4px 设计内边距，exp==act 一致）。

## 四、ON vs OFF 实证（252438 active-image, scale1）

| angle | ON expected b0 | OFF expected b0 | GT b0 |
|---|---|---|---|
| 0° | 88, 83 | 88, 83 | 92, 87（-4 内边距） |
| 2° | 94.59, 70.74 | 253.5, 104.7 | **94.59, 70.74（d=0）** |
| 5° | 99.53, 46.68 | 259.4, 88.8 | **99.53, 46.68（d=0）** |
| 8° | 105.74, 23.06 | 266.2, 73.3 | **105.74, 23.06（d=0）** |
| 10° | 110.57, 7.60 | 271.1, 63.1 | **110.57, 7.60（d=0）** |

- **OFF（生产旧状态，image-transform 未接线）**：旋转分支 fallback 走 center 语义（origin=center），偏差 150px+。
- **ON（接线后）**：expected==GT 全角度精确（dL=dT=0），actual==expected（±0.5 四舍五入）。
- 0° OFF==ON（无旋转时等价），且 0° 的 -4 内边距两轨一致 → 修复不破坏零度基线。

## 五、修复内容（此刀仅 A，禁混 B）

```
zheliyin-card-assistant.user.js:
  + @require .../test/extension/src/editor/image-transform.js?v=0.3.11.13
  @version 0.3.11.13 ; const VERSION 0.3.11.13 ; @require cache bust 全升 0.3.11.13
extension/manifest.json:
  js 数组新增 "src/editor/image-transform.js"（在 page-bridge 之前）
  version / version_name 0.3.11.13
extension/assistant.js:
  const VERSION 0.3.11.13
```

不改 buildItemsFromOcr 逻辑本身：`typeof transformCorners === "function"` 检测已在位，接线后自动启用既有 AABB 分支（image-transform.js 有独立单测 22 项全绿）。

## 六、验收（STEP 4/5）

- 单测：image-transform / image-mapper / candidate-normalizer / textblock-fields **ALL PASS**
- 真机（生产等效：userscript 自带 @require，ZY_TRANSFORM=0 不再额外注入）0/2/5/8/10° × 3 blocks：
  - expected vs GT：全角度 d=0（0° -4 为设计内边距）
  - actual vs expected：≤0.5px（drawText 落位忠实）
- 结论：**A_ROTATION_GEOMETRY = PASS**（B 未动，待 STEP 6-8 独立处理）

## 七、遗留（不进本刀）

- OFF 对照（center fallback）仅在无 image-transform 时存在；接线后生产恒走 AABB 分支。
- backgroundImage 注入路径（旧报告 bg 残差 23/11/-13/-37/-52）本次未复现（未测 1040459 bg 矩阵，规格禁提前扩展 C/其它模板）——STEP 9 跨模板时再对拍。