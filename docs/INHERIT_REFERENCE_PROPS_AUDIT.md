# INHERIT_REFERENCE_PROPS_AUDIT

Stage 5.0 · 审计对象：`pageBridge.inheritReferenceProps()`（extension/src/editor/page-bridge.js:364-381）

> 结论：**FINDING-C（markuuid identity 污染）已在 Stage 5.1 确认并最小修复**（fit: f301ba3）——skipBox 追加 identity/cache/事件/回退字段，探针重跑 CREATION_SAFETY=SAFE，RUNTIME-8.3 全链回归 PASS。白名单化（§三十三 证据驱动的最小 whitelist）仍为 Deferred：当前黑名单 + 聚焦跳过已验证足够，≥2 模板样本后再评估替换。

---

## 1. 现状（审计时逐字确认）

`createTextObject()`（page-bridge.js:309-362）克隆 reference 构造器后调用 `inheritReferenceProps(obj, reference)`：

```js
skipBox = Set(["canvas","_canvas","group","_group","ctx","_ctx","scene","_scene",
  "_cacheCanvas","_cacheContext","_cacheCanvasDimensions","clipPath","text","_text",
  "textLines","_textLines","lineWidths","_lineWidths","dirty","zyCreatedByAssistant","zyFieldKey"])
```

除 skipBox 外，`reference` **自身及其原型链上所有自有属性**都会拷贝到新对象（白名单式跳过，其余全收）。skipBox 覆盖了：canvas 双引用（_canvas/canvas）、缓存画布/上下文（_cacheCanvas）、文本缓存（_text/textLines/lineWidths 系）、脏标记、zy 助手标签。

## 2. 真实对象自有属性实证（141 属性，reports/stage5-object-snapshot.json front#4）

对照真实 textbox 141 个自有属性，按「复制风险」分类：

| 类别 | 代表字段（真实存在） | 是否被 skipBox 跳过 | 复制到新对象是否安全 |
|---|---|---|---|
| canvas/组引用 | canvas, group, _group, clipPath | ✅ 跳过 | — |
| 渲染缓存 | _cacheCanvas, _cacheContext, cacheWidth/Height, cacheTranslationX/Y | 仅 _cacheCanvas/_cacheContext 跳过 | ⚠️ cacheTranslationX/Y、cacheWidth/Height、aCoords、oCoords **会复制** → 新对象携带旧尺寸缓存 |
| 测量缓存 | __charBounds, __lineHeights, __lineWidths, _textLines, _unwrappedTextLines, _text | _text 跳过；__*/_textLines **未跳过** | ⚠️ 复制脏测量 → 需 initDimensions 纠正（apply 后在 placeCreatedObject 前已调用，属于自愈路径） |
| 交互状态 | _originalOriginX/Y, cursorOffsetCache, _lastPointer, __lastClickTime | 未跳过 | ⚠️ 交互运行时状态被复制，无业务影响但属噪声 |
| 事件 | __eventListeners | 未跳过 | ⚠️ 新对象继承 reference 的监听器引用（如模板对象的 click 处理会被带过去） |
| 文本派生 | textLines/lineWidths 已跳过；_styleMap(文本字符级样式) | **未跳过** | ⚠️ 若 reference 含字符级样式（_styleMap），新对象继承后 setText 可能残留字符样式索引 |
| **编辑器业务字段** | isDesign, isEdit, isLineText, layerNum, locationX/Y/W/H/Rotation, locationFactWidth/Height, media*, appointCmyk, markuuid, objType | 未跳过 | ✅（期望）新对象继承模板编辑器行为与媒体类型 —— 这是复制最重要的价值 |
| 普通样式几何 | left/top/width/height/fontSize/fill/fontFamily/... | 未跳过 | ✅ 期望继承（createTextObject 已显式传参，此处重复但幂等） |

## 3. 发现（Finding，带证据）

- **FINDING-A（缓存/测量噪声）**：cache*、aCoords、oCoords、__charBounds、_styleMap 等复制到新对象。证据：真实对象这些字段全部存在（snapshot ownKeys）。影响：新对象首帧渲染前需重算缓存 —— 现行 `setObjectText → initDimensions → setCoords` 路径会覆盖，属**自愈但不优雅**。
- **FINDING-B（事件引用）**：`__eventListeners` 若 reference 挂了模板交互（选中/编辑回调），新对象继承同一监听器，可能与模板对象共享回调上下文。证据：真实对象 __eventListeners 为 Object（snapshot front#4）。**风险中低**（当前观察模板文字层无自定义事件）。
- **FINDING-C（identity 污染，最值得注意）【已修复 5.1 → f301ba3】**：`markuuid` 不在 skipBox → 新创建对象**继承 reference 的 markuuid**。真实证据（stage5-creation-safety.json 修复前）：created.markuuid === reference.markuuid（AD4636D5…），同画布出现重复 markuuid → **对象级唯一性被破坏**。**5.1 修复**：inheritReferenceProps skipBox 追加 markuuid/uuid/__charBounds/__lineHeights/__lineWidths/_styleMap/__eventListeners/aCoords/oCoords/lastSafeText；修复后探针重跑 **creation identity-leak clean（created.markuuid=undefined）+ 零共享结构引用（leakRefs 全 false）+ CREATION_SAFETY=SAFE + RUNTIME-8.3 全链回归 errors=0**。
- **FINDING-D（字段漂移）**：继承后若模板升级改属性集，新对象复制旧字段形成漂移（次要）。

## 4. 结论与 Deferred 记录

- 保持现状的基线逻辑大部分成立（行为稳定），**唯 FINDING-C 确认 P1 已最小修复**（f301ba3）。
- **Deferred Risk（后续阶段）**：
  1. ~~markuuid 不应继承~~ → **已修复**（skipBox 追加；creation-safety 探针 SAFE）；
  2. **最小 whitelist 替换黑名单**：仅复制白名单业务/样式字段（media*、is*/layer*、location*、font*、fill、stroke 等约 25 字段），其余全部不复制 —— 需 ≥2 模板样本验证（§三十三）。
- **建议的最小 whitelist（供后续参考，非当前代码）**：仅复制业务/样式白名单（含 markuuid 处理、media*、is*/layer*、location*、font*、fill、stroke 等约 25 字段），其余全部不复制；须先在 ≥2 模板样本上验证后再替换现黑名单实现。

## 5. 交叉引用

- page-bridge.js:364-381（inheritReferenceProps 实现）
- page-bridge.js:309-362（createTextObject 克隆+调用）
- runtime/reports/stage5-object-snapshot.json（141 属性实证）
- runtime/reports/stage5-object-identity.json（markuuid 唯一性/稳定性实证）