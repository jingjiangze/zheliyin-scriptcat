# Commit 4 Audit — Native Anchor + ImageInk Geometry Recovery（只读审计）

- 审计时间：2026-09-21
- 基线：`2b3ef6b fix(ocr): restore userscript single-line corruption and seal sidecar CASE A/B/C`（test == stage-9-altq-baidu-reconstruction == 2b3ef6b）
- 性质：**只读**。本报告不改任何生产代码；实现从 Commit 4.1 开始。
- 结论标签：✅ 满足 / ⚠️ 有差距 / 🔴 缺口

---

## 一、审计范围与结论速览

| # | 文件 / 函数 | 职责 | 结论 |
|---|---|---|---|
| 1 | extension/src/editor/native-anchor-matcher.js | Native Anchor 多因子匹配（node 纯模块） | ⚠️ 与 page-bridge 镜像逻辑同源，但 userscript 生产接线**未调用**该模块 |
| 2 | extension/src/ocr/native-geometry-recovery.js | Recovery 搜索链（LINE→WORD→LOCAL；ANCHOR/INK 为预留插槽） | ⚠️ LOCAL 已接；ANCHOR/INK 未实现（记 unresolved，不猜测 —— 符合要求） |
| 3 | extension/src/ocr/native-completeness-gate.js | Completeness Gate + allowPartial（Partial Create 冻结语义） | ✅ |
| 4 | extension/src/ocr/native-geometry-aligner.js | Native/Geometry 多因素对齐（禁 index 配对；一对多/多对一） | ✅ |
| 5 | extension/src/editor/native-color.js | 前景主色提取（Image-Space 唯一坐标源） | ✅（与 geometry recovery 无关） |
| 6 | extension/src/editor/image-ink-target.js | 局部 Otsu 前景墨迹 bbox（IMAGE 像素系） | ✅ 可复用为 ImageInk recovery 基础；当前仅用于 typography/颜色区域 |
| 7 | extension/src/editor/text-fit.js | Typography 测量/求解（Stage 8B） | ✅ 不参与 geometry recovery（冻结） |
| 8 | extension/src/editor/text-fit-fusion.js | 字号融合证据（Stage 8D） | ✅ 不参与 geometry recovery（冻结） |
| 9 | extension/src/editor/page-bridge.js | 页面世界：Native Create（drawText）+ **Native Anchor Resolver 运行时镜像** + identity + 图层注册 + verifyNativeLayer10C | ⚠️ 冻结区（不动）；anchor 复用在创建阶段，未参与 recovery |
| 10 | userscript maybeApplyNativeTruth | Native Truth 主链：align → recovery(BAIDU/LOCAL) → gate | ⚠️ 见 §三/§六 |
| 11 | userscript buildItemsFromOcr | block→item（typography/颜色/geometry/containment/targetQuad） | ✅ |
| 12 | userscript Native Create 接线 | ocrCreate 消息 → page-bridge drawText | ✅ Native-only，无 mirror 生产路径 |

---

## 二、回答问题清单（任务书 §三）

### Q1. 当前 Native Anchor 输入来自哪里？
- **page-bridge ocrCreate 创建阶段**（page-bridge.js L184-185）：创建前一次性 `zyAnchorCollect(canvas, sourcePageId, sourceSide)`，收集**当前编辑页 canvas 上已有 textbox/i-text/text 对象**。
- 源 = canvas.getObjects() + aCoords 真值 + 原生字段（uuid/multiUuid/layerNum/fontSize/fontFamily/text）。
- **未进** maybeApplyNativeTruth 的 recovery 链：unmatchedNative 行不会用画布锚点补位 → 🔴 缺口（Commit 4 目标）。

### Q2. Anchor 的 identity 是什么？
- `o.uuid` / `o.multiUuid`（原生编辑器身份字段；page-bridge.js L138/L210/L259）。
- 创建后对象挂 `zyOcrObjectId = { transactionId, pageId, blockId, objectUuid }`（L210/L259）。
- `markuuid` 原生约束为空串（L768）。⚠️ 无「跨 refresh 持久 identity」验证；Commit 4-B 需补 editor-object-identity 测试。

### Q3. Anchor 的 bbox/center/angle 来源？
- bbox/center：`o.aCoords` 四角平均（L132-136），CANVAS_LOGICAL 系（fabric calcCoords，不含 viewportTransform）。
- visualWidth/Height：aCoords 边长（hypot）。
- **angle：未采集**（anchor 无 angle 因子）→ ⚠️ Commit 4 Anchor 的 rotation 兼容因子需从 aCoords 派生（translation-invariant edge vector）。

### Q4. ImageInk 输入是什么？
- image-ink-target.js：输入 `gray（Uint8Array）+ region{x,y,width,height}`（IMAGE 像素系，整型钳制）。
- userscript L1571-1583/1690-1692：block 级与 per-line 级 `inkMeasure` bridge 调用（page 世界对源图灰度取区域 Otsu），输出 inkWidth/inkHeight/inkBox/confidence。
- 当前用途：**typography 目标 + 颜色采样区域**；**未用于 geometry recovery 补位** → 🔴 缺口（Commit 4-C）。

### Q5. ImageInk 坐标系？
- **IMAGE_PIXEL（natural 系）**：region 来自 OCR bbox（图片像素）；输出 inkBox 同系。✅

### Q6. OCR bbox 坐标系？
- Baidu / LOCAL（tesseract）返回 bbox 均为**图片自然像素系**（Baidu 识别图 = 完整 dataUrl；本地喂同一 dataUrl）。
- userscript maybeApplyNativeTruth 的 geoBlocks/recovery imageBounds 均按 IMAGE 像素处理（L1062-1067 imageBounds={0,0,naturalW,naturalH}）。✅

### Q7. Canvas 坐标系？
- ocrPrepare geo.aCoords = CANVAS_LOGICAL（page-bridge L993-1005：setCoords 后四角，fabric 不含 viewportTransform/zoom）。
- geo 还含 left/top/width/height/scaleX/scaleY/angle（对象显示几何）、canvasWidth/Height。
- ✅ 与「自然→画布」唯一仿射由 buildImageTransform(aCoords) 建立（Commit 7），禁止 geo.scaleX/scaleY 当自然缩放真值（L1796 注释明确）。

### Q8. 是否存在自然尺寸 → viewport → canvas 的重复缩放？
- **现代路径（有 aCoords）**：一次变换 `buildImageTransform({naturalWidth/Height, width, height, aCoords})`（image-space.js）→ 无「viewport 中间层」→ 无重复缩放。⚠️ 注意：若不注入 viewport 状态，aCoords 与 CSS viewport 无耦合 —— 若有设备像素比相关的双缩放风险点在于**页面 CSS 缩放/zoom 与 fabric viewportTransform**，当前路径不消费 viewportTransform（校验两轮真机 effectiveScale=0.5849 与实际对象一致）。
- **旧路径（无 aCoords）**：left/top + scaleX/scaleY + angle 直接算 —— 单次变换，但依赖对象残值，属降级（Commit 7 后在生产正常命中 aCoords）。
- **结论**：✅ 无重复缩放；⚠️ 无显式 `coordinateSpace` 标注（Commit 4.1 要求）。

### Q9. 是否存在 rotation double-apply？
- 现代路径：quad↔quad，angle 由 targetQuad 派生（quadTextGeometry），不叠加对象 angle 公式 → 无 double-apply。✅
- 旧路径 L1814-1817 transformCorners 用 image angle（cos/sin）一次 → 无 double-apply；但**与 anchor 的 angle 未打通**（anchor 不携带 angle，见 Q3）。⚠️ Commit 4 旋转 case（15°/45°/105°）需在 geometry-space 层验证单一 affine。

### Q10. 是否存在 width/height 与 bbox 混用？
- fontSize：fusion（advance 主 / ink 高交叉 / ocrHeight 仅 sanity）—— 不直接用 bbox.height 定字号（✅）。`legacy-height-ratio` fallback 用 avgLineH×sy（仅老路径且标记 legacy）。
- boxHeight = lineCount×fs×lineBoxRatio+8（结构化，非 bbox.height）。
- ⚠️ 诊断字段 ocrBBox8d 仍记录 bbox 宽高（仅诊断、不驱动创建）→ 无生产混用；Commit 4 normal schema 需统一。

### Q11. recovery candidate 的 source/provider 当前有哪些？
- 模块（native-geometry-recovery.js L199-204）：
  `BAIDU_LINE` → `BAIDU_WORD` → `LOCAL` → `NATIVE_ANCHOR`（预留插槽）→ `IMAGE_INK`（预留插槽）。
- 接线（userscript L1060-1081 第一段；L1082-1113 LOCAL sidecar 第二段）：BAIDU_LINE/WORD 已接到；LOCAL 已接到；**ANCHOR 与 INK 未接** → 🔴（Commit 4 主体工作）。
- 每层输出含 source/method/score/evidence（✅ 可审计）。

### Q12. recovery 是否会重复占用已有 geometry？
- native-geometry-recovery.js gateCheck L257-272：occupiedGeometries 重叠>overlapMax(0.5) → OVERLAP_OCCUPIED reject；命中后占用（L307/L361/L398 push）。
- aligner matchedGeometry 作初始 occupied（userscript L1066）；LOCAL 段先并 geometryRecovered（L1090-1091）。
- ✅ 层内不重复占用；无「一个 bbox 两个 native 行」路径。

### Q13. recovery 是否可能跨 front/back page？
- 候选来源 = 本事务 blocks/img（同一 ocrTarget pageId/side）；native 来自同事务（pageId/transactionId/imageFingerprint 透传，userscript L1016-1019）。
- ⚠️ recovery 候选（Baidu/local bbox）本身**无显式 pageId/side 挂载**，隔离依赖「同事务 dataUrl/同 target」；Commit 4 需在 schema 显式化 page/side/canvas/tx 绑定（§十二要求）。

### Q14. recovery 是否可能跨 block？
- 不跨：recovery 逐 native 行独立（ns.forEach）。groupRows 按 lineIndex/y 聚类仅在**同一 native 行的词候选**内。✅

### Q15. recovery 是否可能改变 Native text？
- 不改变：recovered 仅 {native, geometry, source, ...}；`kept.text = native.rawText`（userscript L1121-1124）；validateNativeText 硬校验（L1145-1150）；Provider 禁写最终 text（模块头注释）。✅

### Q16. recovery 是否可能改变 Native object identity？
- recovery 阶段**不触碰对象**（纯数据）；创建时由 page-bridge 决定复用（anchor MATCH → 保留 identity）或新建（drawText → 新 uuid）。✅
- ⚠️ anchor recovery 若实现，需保证「anchor 命中的行 → 创建时复用该对象 identity」闭环（现有 zyAnchorMatch 已具备 MATCH→复用，✅ 语义可复用）。

---

## 三、坐标系统现状（Commit 4.1 输入）

| 实体 | 坐标空间 | 来源 |
|---|---|---|
| OCR bbox（Baidu/Local） | IMAGE_PIXEL（natural） | 识别图 = 完整 dataUrl |
| ImageInk region/inkBox | IMAGE_PIXEL | 源图解码（L1590-1595） |
| imageBounds（recovery） | IMAGE_PIXEL | naturalWidth/Height |
| aCoords（anchor/图片） | CANVAS_LOGICAL | setCoords 四角（fabric 不含 viewportTransform） |
| geo left/top/width/height/scale/angle | CANVAS_LOGICAL（对象显示几何） | ocrPrepare |
| targetQuad | CANVAS_LOGICAL（quad） | mapRectToCanvas(bbox, imgT) |
| editor object 位置 | CANVAS_LOGICAL（对象 left/top/angle） | drawText 后对象 |

**当前无统一 geometry schema、无 `coordinateSpace` 字段** → 🔴 Commit 4.1 必须建立 geometry-space.js（imageNaturalToViewport / viewportToCanvas / canvasToEditorObject / normalizeGeometry）。现有转换事实：
- natural→canvas 唯一仿射 = buildImageTransform(aCoords)（image-transform/image-space；Commit 7）。
- 注意：**不存在真实 "viewport 中间层"**（页面无缩放生产路径）；任务书允许四空间（IMAGE_NATURAL / IMAGE_VIEWPORT / CANVAS / EDITOR_OBJECT），本实现中 IMAGE_VIEWPORT 与 IMAGE_NATURAL 等价（1:1 dataUrl）。

## 四、Native Anchor 现状与 Commit 4 差距

- **现状锚点来源**：page-bridge 创建前 zyAnchorCollect（canvas textbox）；**用途仅创建时文本更新复用**（MATCH → setText → 保留身份/位置/样式）。
- **任务书目标**：Anchor **先在 geometry 层参与 recovery**（Native Anchor 优先定位）→ validation 后仍复用对象 identity 创建。
- **差距**：
  1. 🔴 recovery 链无 ANCHOR 候选（native-geometry-recovery 预留 source 常量但未接）；
  2. 🔴 userscript 无法访问画布 anchors（需 bridge 只读采集接口或复用 ocrPrepare 上下文）；
  3. ⚠️ candidate coordinate（canvas 系）与现有 recovery（image 系）需要 geometry-space 转换；
  4. ⚠️ anchor 无 angle 因子（Q3）；
  5. ⚠️ identity 持久性缺测试（Commit 4-B: runtime/editor-object-identity.js + 3 类测试）。

## 五、Native Create / 冻结区确认（本体不动）

- page-bridge ocrCreate：CanvasDiy.drawText → findOcrObject → verifyNativeLayer10C（失败整批回滚）→ zyOcrObjectId/zyOcrKey → 图层注册（canvasToProductObjArr）。冻结 ✅
- **禁止**：改 drawText 参数语义 / mirror fallback 生产路径（已移除）/ Unified Object / Font/Style Reconstruction（Stage 11 暂停）。
- buildItemsFromOcr：typography/颜色/containment/targetQuad 链路冻结 ✅（Commit 4 只在其 recovery 上游插 anchor/ink 候选 + schema 标注）。

## 六、Commit 4 实现前 Gap 清单（供 4.1-4.3 排期）

1. [P0] geometry-space.js：四种空间 normalize + 4 函数 + 单测（含 rotation 矩阵 / high-DPI / 非均匀缩放）。
2. [P0] native-anchor-recovery.js：多因素（normalized text / token-script / length / y-order / x-order / neighbor distance / size / angle）无单阈值；输出 {matched, anchor, score, factors, reason}。
3. [P1] anchor 采集接口（page-bridge 只读，不动冻结创建逻辑）—— 最小新增消息或复用 getTextInventory 扩展 identity/geometry/angle。
4. [P1] recovery 接线：unmatchedNative → NATIVE_ANCHOR（canvas→image 逆变换候选）→ IMAGE_INK（native+anchor/bbox region → inkBox，仍 IMAGE 系）→ 最终保持 text=Native。
5. [P1] editor-object-identity.js + 4 类单测；创建侧复用闭环（anchor 命中 → 同一 uuid 复用，已具备）。
6. [P1] occupancy/page isolation 显式字段（sourcePriority/coordinateSpace/pageId/side/tx）。
7. [P2] 真机 CASE 4-A~4-G。

---
*记录：LOCAL Real-Device Successful Recovery 任为 UNRESOLVED（Commit 3c 结论原样保留），不因本报告改写。*
