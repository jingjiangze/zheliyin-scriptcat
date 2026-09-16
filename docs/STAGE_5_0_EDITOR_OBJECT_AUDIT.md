# STAGE_5_0_EDITOR_OBJECT_AUDIT

Editor Object Audit + Object Model 建设 · 真实折立印在线设计器对象层基础建设

> 原则：先审计 → 真实证据 → 建立模型 → 最小实现 → 真实 Runtime 回归 → 独立复审（§三）。
> 全部对象数据来自真实编辑器页面（https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do），
> 脱敏后进入仓库（§十八/§四十七）。

---

## 1. 证据链（本阶段新增 runtime 证据）

| 文件 | 内容 |
|---|---|
| runtime/reports/stage5-object-audit.json | canvas/类型/身份/旋转汇总 |
| runtime/reports/stage5-object-snapshot.json | 21 对象全量属性（脱敏） |
| runtime/reports/stage5-refresh-persistence.json | reload 持久化实测 |
| runtime/reports/stage5-object-identity.json | identity 唯一性/稳定性 |
| runtime/reports/stage5-object-mutation.json | setText mutation + rollback |
| tests/editor-object-model/ | 无浏览器单测（3 套件全 PASS） |

## 2. Real Editor / Real Canvas（§六十）

- REAL_EDITOR = **PASS**（真实登录态 + requirejs/fabric + CanvasObjVO 就绪）
- REAL_CANVAS = **PASS**（front 619.5 × 376.8625，21 对象；**back 画布不存在** — totalCanvasArray 长度 1，当前模板单面）

## 3. Object Type Inventory（§二十四，真实数据为准）

| type | 数量 | 说明 |
|---|---|---|
| textbox | 4 | **唯一文字层载体**（subType=text，mediaMediaType=text） |
| image | 3 | 背景/logo/二维码位图 |
| path | 3 | SVG 矢量素材 |
| group | 1 | SVG 组合 |
| rect | 2 | 线框/底图（1 底图 + 1 svg 尺寸框） |
| line | 8 | 参考辅助线（无业务字段，无 uuid） |

- 未发现 text/i-text/curvedtext/circle/polygon —— 不按 Fabric 文档臆造类型（§二十四）。
- 所有对象 constructor.name = `b`（压缩 class）→ **不依赖 ctor 判断类型**。

## 4. Text Object Model（§十九/§二十，4 个 textbox 实证）

- 通用样式：fontFamily(阿里普惠体Regular) / fontSize(31,15,*,*) / fontWeight / fontStyle / lineHeight(1.16,1.8,*) / charSpacing(0) / textAlign(left) / fill(#000000)。
- 编辑器专属：layerNum(4) / isDesign=true / isEdit=true / isLineText=true / isComposite=true / lastSafeText / locationX/Y/W/H/Rotation（=left/top/width/height 的镜像）/ locationFactWidth=10000。
- textbox 几何：left/top 以 origin left/top 记；**setText 后 width 不变、height 按行数自适应**（35.03→563.28 实测）；scale=1、angle=0（文字层无旋转样本）。
- 文字内容脱敏（textLen/hash 保留）；[REDACTED_TEXT] 进入 fixture。

## 5. 属性分类（§九/§十，EDITOR_OBJECT_PROPERTY_CLASSIFICATION）

以 141 属性实测 + refresh/mutation 实证，四类：A 稳定业务 / B 渲染几何 / C Fabric 运行时 / D 编辑器运行时 / E 自定义未知。

### A. Stable / Persisted（刷新后仍存在，业务对象）
`markuuid`(跨 reload 稳定+刷新一致) · `locationX/Y/Width/Height/Rotation`(刷新还原模板值) · `layerNum` · `mediaMediaType` · `isDesign/isEdit/isLineText/isComposite` · `fontFamily/fontSize/fontWeight/fontStyle/lineHeight/charSpacing` · `fill` · 文字内容 `text`（未保存修改 reload 还原，保存时才落库）
> 证据：refresh-persistence（geometry/style/text 全部还原、markuuid 不还原——保持）。

### B. Render / Geometry（显示位置尺寸变换，刷新按模板还原）
`left top width height scaleX scaleY angle skewX skewY originX originY` · `visible opacity flipX flipY`

### C. Fabric Runtime（仅为运行时存在/缓存）
`aCoords oCoords dirty _cacheCanvas _cacheContext cacheWidth/Height cacheTranslationX/Y _text _textLines _unwrappedTextLines __charBounds __lineHeights __lineWidths _styleMap cursorOffsetCache __eventListeners __lastClickTime _originalOriginX/Y _lastPointer`

### D. Editor Runtime（折立印编辑器额外维护的状态）
`isPreview isDisplay isWrapping deleteState lockScalingFlip lockUniScaling appointCmyk maskEnable lowPixelFlag _styleMap(编辑器文本样式)`

### E. Custom / Unknown（存在、用途待定）
`objType`(14/21) · `mediaImgPath`(12/21) · `mediaLineSpace`(4) · `mediaIsBold`(4) · `mediaIsItalic` · `mediaLinethrough` · `mediaIsBG` · `lineIdType` · `locationFactWidth/Height` · `__skipDimension` · `borderDashArray`

> 分类结论：**text / geometry / identity(markuuid) 是 OCR 真正需要的字段**；C/D 类不进入模型（object-model 白名单已排除，§二十六 纯数据）。

## 6. Identity（§十四~§十六，实测）

- **PERSISTED_EDITOR_ID = `markuuid`**：跨 reload 稳定（AD4636D5… 两次会话一致）；textbox 4/4 唯一；**SVG 组内共享**（3D84D06A… 出现在 image/path/group/rect 4 对象）→ 对象级唯一仅对独立文字/图形成立。
- **LOCAL_RUNTIME_ID = `uuid`**：会话级实例 id（三次会话三个值 + reload 重新生成）；全画布 12/12 唯一。仅会话内可作运行引用。
- `id`("图层_1")：SVG 图层名，组内重复。`array index`：z 序位次，插入/删除移位，均不可作持久 identity。
- mutation 稳定性：setText 前后 identity 零变化（markuuid/uuid/index 全不变）。
- **OBJECT_IDENTITY = VERIFIED**（文字层成立；未知/组对象降级 PARTIAL — Deferred）

## 7. Geometry（§二十二/§二十三）

- bbox ≠ width：有效边界 = width*scaleX × height*scaleY（实例：path index2 width=425.2 × scale 0.810 + angle=105）。
- **旋转样本存在**：path index2（REAL rotated sample）；文字层当前无旋转 → NO_REAL text-box rotated sample（记录不制造）。
- 坐标系：left/top = Canvas 逻辑坐标（origin left/top）；归一化用画布实际尺寸（619.5×376.86）计算。

## 8. Mutation Safety / Diff / Rollback（§三十四~§三十八）

- setText → **changedFields = [text, height]**（白名单 diff 只报这两个）；width/scale/angle/font* 全部稳定 → **SAFE_TEXT_MUTATION = PASS**。
- height 变化为 textbox 自动换行（OBJECT_MUTATION_SIDE_EFFECT 记录，非 bug，不修复）。
- restore → changedFields=[]（零残留）→ **ROLLBACK = PASS**。
- diff 基建：runtime/editor-object-diff.js（白名单 + 数值容差 + 分组），单测覆盖。

## 9. Production 变更

- **零行为变更**：未触碰 page-bridge.js / assistant.js / field-core / config-core / ai-client / apply 链（§四/§三十一）。
- 新增（基建）：extension/src/editor/object-model.js、object-adapter.js（就绪未挂接，5.1 按证据接入）。
- 新增（测试基建）：tests/editor-object-model/*（3 套件 47 断言全 PASS）、tests/fixtures/editor-object-textbox.json（真实脱敏）、runtime/editor-object-diff.js。

## 10. 独立复审（§五十九 10 问）

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | Object Identity 真稳定吗？ | markuuid 跨 reload 稳定（textbox 层 VERIFIED）；uuid 会话级 | identity/refresh report |
| 2 | Geometry 真是 Canvas 坐标吗？ | 是（origin left/top，775 逻辑坐标、位置定值） | snapshot geometry 字段 |
| 3 | width/height 是真实 bbox 吗？ | 否**（需乘 scaleX/Y；旋转按 angle 展开）** | path index2 105°/0.81 |
| 4 | scale 是否已计算？ | 未预乘（scaleX/Y 独立字段；textbox=1，path=0.81） | snapshot |
| 5 | angle 是否被正确处理？ | 记录原始 angle；有效 bbox 需三角函数（当前模板文字层 angle=0） | snapshot rotated |
| 6 | text mutation 是否产生副作用？ | 仅 text+height（已知 textbox auto-height，记录不修） | mutation report |
| 7 | refresh 后字段是否仍存在？ | markuuid 存；uuid 换；text/geometry 还原模板值 | refresh report |
| 8 | 哪些只是 Fabric runtime？ | C 类缓存/事件（aCoords/cache*/__*） | 141 属性分类 |
| 9 | 哪些是折立印业务字段？ | A/D 类（markuuid/location*/layerNum/media*/is*） | 分类表 |
| 10 | Model 有无吸收 Fabric 内部状态？ | 无 —— parseEditorObject 白名单只取已审计字段 | object-model 白名单 |

## 11. Final Report（§六十/§六十一）

```text
Real Editor:         PASS
Real Canvas:         PASS
Object Inventory:    PASS（6 类型 21 对象）
Object Identity:     VERIFIED（markuuid 跨会话稳定；uuid 会话级 — textbox 层完整）
Text Object Model:   PASS（4 textbox 全字段实证）
Geometry Model:      PASS（Canvas 坐标；bbox≠width 已证；angle 样本存在）
Object Diff:         PASS（白名单 diff + 数值容差 + 分组）
Mutation:            PASS（setText 仅 text+height）
Rollback:            PASS（零残留）
Production Changes:  零行为变更；新增 object-model/adapter（未挂接）+ 测试基建
Important Findings:
  - markuuid = 唯一跨会话持久 identity（textbox）；SVG 组内共享需分段处理
  - uuid = 会话级实例 id，不可持久（三次会话三条 uuid）
  - textbox setText 自动换行（height 自适应，width 固定）→ OCR 需重算高度 bbox
  - back 画布不存在（当前模板单面）→ apply side=back 语义需模板适配
  - inheritReferenceProps 复制 markuuid/cache/事件 → FINDING-A~D（保持现状，Deferred → 5.1 白名单）
  - REAL rotated sample 存在（path 105°）；文字层无旋转样本
Deferred Risks:
  - SVG 组对象 markuuid 共享 → 对象级唯一性 PARTIAL（非文字层）
  - inheritReferenceProps 宽复制 markuuid 污染（5.1 处理）
  - 仅 1 个真实模板样本（阅读面/更多模板需扩大审计样本）
Commits/Push: 见 Git 记录（stage-4.1-runtime-validation，各步独立 commit 已 push）
Gate:          GO
```

## 12. 下一步（不自启，等指示）

规格 §六十三：Stage 5.0 完成后**不要自行开始 OCR**；等待 5.1 规划（Object Identity/Geometry Hardening 或依据审计结果重规划）。