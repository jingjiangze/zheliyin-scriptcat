# EDITOR_OBJECT_MODEL

Stage 5.0 · 折立印真实编辑器对象数据模型规范

> 模型仅由**真实对象审计（stage5-object-snapshot.json）+ refresh/mutation 实测**提炼，先有真实数据、后有模型（§四十四），不是照搬 Fabric/Object 文档。

---

## 1. 模型来源（证据索引）

| 证据 | 文件 |
|---|---|
| 真实对象全量属性采样（21 对象 / 6 类型 / 141 属性 x textbox） | runtime/reports/stage5-object-snapshot.json |
| 属性覆盖率/类型分布/旋转样本 | runtime/reports/stage5-object-audit.json |
| refresh 持久化（markuuid 稳定 / uuid 会话级 / text 未保存改刷新还原） | runtime/reports/stage5-refresh-persistence.json |
| mutation（setText 仅改 text+height / rollback 零残留） | runtime/reports/stage5-object-mutation.json |
| identity（uuid 全画布唯一·会话级 / markuuid textbox 唯一·稳定 / SVG 组共享） | runtime/reports/stage5-object-identity.json |

## 2. EditorObject（纯数据）

实现：`extension/src/editor/object-model.js`（`parseEditorObject(raw, side, index)`）

```js
{
  identity: { side, index, runtimeId, persistedId, identityKind, markuuid, uuid, type, subType, kind, isText },
  geometry: { left, top, width, height, scaleX, scaleY, angle, skewX, skewY, originX, originY, coordinateSpace },
  style:    { fontFamily, fontSize, fontWeight, fontStyle, lineHeight, charSpacing, textAlign, fill, stroke, strokeWidth },
  content:  { text, textLen },           // 仅 kind=text
  transform:{ visible, opacity, flipX, flipY },
  interaction:{ selectable, evented },
  editor:   { layerNum, locationX, locationY, locationWidth, locationHeight, locationRotation, mediaMediaType },
  runtimeFlags:{ isDesign, isEdit, isLineText, isComposite, isPreview, isDisplay, lastSafeText }
}
```
- `identity.identityKind`（§5.1 分型，不强行统一）：text/image/graphic → `persisted-candidate`；group → `group-shared`；line → `none`。
- `geometry.coordinateSpace`：`canvas`（顶层对象默认，实测）；group child 由上层标记 `group-local`（§5.1 实测 group child 坐标相对组原点为负偏移）。

约束：
- **纯数据**：不含 raw Fabric 对象引用，JSON.stringify 可序列化（assertPureData 测试保障）。
- **确定性**：无 AI、无 DOM 依赖；输入裸对象 → 输出纯数据（§五十二）。
- 未知/缺省字段一律 `null`（zyNum/zyStr 归一），不做类型欺骗。

## 3. Identity 语义（实测结论）

| 候选 | 实测 | 用途 |
|---|---|---|
| `markuuid`（= persistedId） | 跨 reload 稳定；textbox 4/4 唯一；SVG 组内共享 | **Stable / Persisted Candidate（text/image/graphic 层成立；group 共享；非 universal）** |
| `uuid`（= runtimeId） | 会话级实例 id（每次 reload/会话重新生成）；全画布 12/12 唯一 | Session Runtime Identity（会话内引用） |
| `id`（"图层_1"） | SVG 图层名，组内重复 | 不可作 identity |
| array `index` | fabric 渲染 z 序位次，插入/删除即移位 | 仅当前快照内枚举用 |

规则：跨会话定位优先 persistedId（markuuid，仅对 identityKind=persisted-candidate 类型）；同会话定位可用 runtimeId（uuid）或 index；**不得**将 uuid/index 声明为持久身份（§四十八）。术语（§5.1）：reload stability（已证，3 会话）≠ server-save persistence（未验证）。

## 4. Geometry 语义（§二十一~§二十三）

- 记录的 left/top/width/height/scaleX/scaleY/angle 为 **Canvas 坐标系真实值**（originX/Y=left/top；refresh 后与模板一致，已验证）。
- **bbox ≠ width**：有效视觉边界 = `width*scaleX × height*scaleY`，旋转对象需按 angle 展开（真实样本：path index2 angle=105, scale=0.81；实测其 fabric AABB = 220.29×378.74，而 effective = 344.56×127.49 —— AABB 必须用 `zyGetVisualBounds(raw)`（fabric getBoundingRect，含 angle/stroke））。
- **stroke 外扩 AABB**：rect 600×365 的 getBoundingRect = 620.5×377.9（含 stroke/边框外扩；textbox 同理）。
- **line 几何**：width=|x2-x1|、height=|y2-y1|（8/8 实测），非 bbox 语义 —— Model 对 line 不当作 OCR 目标。
- **group child 坐标为 group-local**（实测 child left=-40.35/-69.35 相对组原点 277.16），渲染世界坐标 = group 变换 + child 本地坐标。
- **textbox 高度随文本自动换行**：setText 长文本 → width 不变、height 增长（实测 35.03→563.28）；OCR 原位重建需按新文本重算高度 bbox（§三十八）。

## 5. 未来 OCR 对接（§五十/§五十三）

```text
OCR(text, bbox, confidence) → Normalizer(x/canvasW, y/canvasH, w/canvasW, h/canvasH)
  → Object Matcher（按 normalized rect + markuuid/文字特征匹配 EditorObject）
  → Adapter.zyWriteText(raw, text)（纯 text mutation，重算高度）
```

- OCR bbox 是**像素/比例坐标**；EditorObject.geometry 是 **Canvas 逻辑坐标**（与设计尺寸/缩放有关）→ 归一化必须按画布实际 width/height（619.5×376.86 实测），OCR 像素坐标不得直接用于对象匹配（coordinate.js 原则，future 阶段）。
- `content.textLen`/hash 用于脱敏与匹配；`render log` 用 diff（runtime/editor-object-diff.js）输出 changedFields。

## 6. 本阶段未做

- create/delete 对象（§二十八：READ → SET TEXT → 最后 CREATE/DELETE）
- Object Matcher / Normalizer（5.1+）
- 保存/提交（§三十九 in-memory only）
- 模型迁移接入现有 applyFields/pickObject（§三十一 保持现状）