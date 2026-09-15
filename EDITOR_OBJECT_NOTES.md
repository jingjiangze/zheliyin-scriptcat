# EDITOR_OBJECT_NOTES.md — 编辑器对象属性调查（Stage 3，来自真实代码）

> 来源：`extension/src/editor/page-bridge.js`（页面侧编辑器唯一实现，与 Golden Master 逐字一致）。
> 性质：**只读调查，不假设**；标注「代码确认」= 现有代码确实读写该字段，「需真机确认」= 字段源自 fabric/站点约定，代码未直接验证。

## 1. 对象识别（isTextObject，代码确认）

- `obj.type ∈ {text, textbox, i-text, curvedtext}` 或
- `obj.text != null && typeof obj.set === "function"` 或
- `mediaMediaType / media.mediaType` 含 "text"

## 2. 创建时写入的属性（createTextObject / placeCreatedObject，代码确认）

| 属性 | 来源 | 说明 |
|---|---|---|
| left / top | 参考层或被钳制的布局（width*0.1 / height*0.12 + index*step） | 定位 |
| width | 参考层 width 或 布局 contentWidth(0.8*width) | 尺寸 |
| fontSize / fill / fontFamily / fontWeight / fontStyle / lineHeight / textAlign / charSpacing | 参考层（getReferenceStyle） | 样式 |
| editable = true | 固定 | 可编辑 |
| text | setObjectText 写入 | 内容 |
| dirty = true + initDimensions() + setCoords() | setObjectText/placeCreatedObject | 渲染失效 |

## 3. 读取的属性（getReferenceStyle 默认值，代码确认）

left=32 / top=32 / width=240 / height=20 / fontSize=16 / fill="#1f2937" / fontFamily="Microsoft YaHei, Arial" / fontWeight=normal / fontStyle=normal / lineHeight=1.25 / textAlign=left / charSpacing=0

## 4. 克隆继承（inheritReferenceProps，代码确认）

新对象复制参考对象（含原型链）全部自有属性，跳过内部/画布引用/文本缓存（canvas/_canvas/group/ctx/_cacheCanvas/clipPath/text/dirty 等）。设计器自定义元数据（media、字体 ID 等）会一并继承 → 未来 TextObject 的 metadata 可直接依赖。

## 5. Probe 已可观察（buildProbeResult，代码确认）

每侧面布：`found / ctor / width / height / textObjects 数量`；未读 rotation/图片层。

## 6. OCR 能力问卷（§二十九，逐项回答）

| 能力 | 结论 | 依据 |
|---|---|---|
| 读文字对象位置 (x/y) | ✅ 代码确认 | getReferenceStyle 读 left/top；排序用 top/left |
| 读宽高 | ✅ 代码确认 | width/height |
| 读字号 | ✅ 代码确认 | fontSize |
| 读字体 | ✅ 代码确认 | fontFamily |
| 读颜色 | ✅ 代码确认 | fill |
| 读粗细/斜体 | ✅ 代码确认 | fontWeight / fontStyle |
| 读行高/对齐/字距 | ✅ 代码确认 | lineHeight / textAlign / charSpacing |
| 读旋转 | ⚠️ 需真机确认 | fabric 对象惯例含 rotation，当前代码未读写 |
| 读对象层级 | ⚠️ 依赖 getObjects() 顺序 | 代码按 top/left 排序，原生顺序未消费 |
| 创建文字对象 | ✅ 代码确认 | createTextObject（克隆优先，fabric 兜底） |
| 修改已有文字对象 | ✅ 代码确认 | setObjectText / placeCreatedObject |
| 删除指定生成对象 | ✅ 代码确认 | removeAssistantExtras（按 zyCreatedByAssistant 标签） |
| 读图片层数量 | ⚠️ 待扩展 | 现有 isTextObject 相反分支可复用，尚未实现 |

## 7. 稳定性判定（§二十七）

- **稳定字段**：text/type/fontSize/fill/fontFamily/fontWeight/lineHeight/textAlign/charSpacing/left/top/width/height（读取与写入均有代码证据）
- **模板来源对象**：无 zyCreatedByAssistant 标签的对象；**助手对象**：zyCreatedByAssistant === true
- **创建时必须**：text + 样式（可继承）；可选自定义元数据（经 clone 继承）

## 8. 结论

现有编辑器能力足以支撑 OCR 第一版的「读位置/读字号/读颜色/建文字层/改文字层/删生成层」；rotation 与图片层枚举为真机待确认项。坐标转换（canvas 像素 → 设计器坐标）仍是后续独立模块，本阶段未涉及。