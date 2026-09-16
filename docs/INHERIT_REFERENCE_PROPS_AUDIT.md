# INHERIT_REFERENCE_PROPS_AUDIT

Stage 5.0 · 审计对象：`pageBridge.inheritReferenceProps()`（extension/src/editor/page-bridge.js:364-381）

> 结论先行：**保持现状（不改）**。复制范围偏宽是既有行为（Golden Master 一致，模板行为稳定），本阶段证据显示存在分类风险但不足以在无回归保护下修改 → 记为 **Deferred Finding**，5.1 依此推进最小白名单（§三十三 证据驱动）。

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
- **FINDING-C（identity 污染，最值得注意）**：`markuuid` 不在 skipBox → 新创建对象**继承 reference 的 markuuid**。证据：textbox markuuid 实测唯一且跨 reload 稳定（stage5-object-identity.json），若两个对象携带同一 markuuid（模板对象 + 助手新建副本），**对象级唯一性被破坏**，未来 OCR 定位/清理按 markuuid 判断会歧义。现行 removeAssistantExtras 用 zyCreatedByAssistant 清理不受此影响，但 5.1 若以 markuuid 为 PERSISTED_EDITOR_ID，需要求新建对象**清空/重置 markuuid**。
- **FINDING-D（字段漂移）**：继承后若模板升级改属性集，新对象复制旧字段形成漂移（次要）。

## 4. 结论与 Deferred 记录

- 保持现状 ⟶ **不改**。理由：① 模板套版行为稳定（16 项回归未触点继承逻辑）；② 无真实故障由 copy 引起；③ 最小白名单需要更大样本模板验证（本阶段只有 1 个真实模板）。
- **Deferred Risk（5.1 入队）**：
  1. `markuuid` 不应继承 —— 新建对象应生成自己的 markuuid 或置空（FINDING-C）；
  2. 缓存/测量类（`_`/`__`/`aCoords`/`oCoords`/`cache*`）应跳过 —— 建立 `evil-keys` 集合而非黑名单空泛；
  3. `__eventListeners` 跳过。
- **建议的最小 whitelist（供 5.1 参考，非本阶段代码）**：仅复制白名单业务/样式字段（markuuid 处理、media*、is*/layer*、location*、font*、fill、stroke 等约 25 字段），其余全部不复制；白名单列表须先在 ≥2 模板样本上验证后再替换现黑名单实现（§三十三：先审计→证据→最小 whitelist →若证据不足保持现状）。

## 5. 交叉引用

- page-bridge.js:364-381（inheritReferenceProps 实现）
- page-bridge.js:309-362（createTextObject 克隆+调用）
- runtime/reports/stage5-object-snapshot.json（141 属性实证）
- runtime/reports/stage5-object-identity.json（markuuid 唯一性/稳定性实证）