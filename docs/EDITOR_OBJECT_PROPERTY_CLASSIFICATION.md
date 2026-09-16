# EDITOR_OBJECT_PROPERTY_CLASSIFICATION

Stage 5.1 Closure · 真实对象属性分类（数据源：runtime/reports/stage5-object-snapshot.json，21 对象；refresh-persistence / identity 实测补充）

> 规则：不得凭 Fabric 文档补字段（§六.1）。分类仅基于真实样本快照 + reload/identity 实测。

**对象类型分布（实测）**：rect ×2 · image ×3 · path ×3 · group ×1 · textbox ×4 · line ×8

**术语（§六.2/§六.3）**：
- `markuuid` → **Stable / Persisted Candidate**（跨 reload 稳定；textbox 子集 4/4 唯一；**SVG/group 子对象共享，不是 universal persistent id**）
- `uuid` → **Session Runtime Identity**（会话内唯一、mutation 稳定、reload/跨会话重新生成）
- `reload stability`（已证）≠ `server-save persistence`（未验证，禁止混写）

---

## A. Stable / Persisted Candidate（刷新后保持，业务对象级）

| field | observedCount | objectTypes | persistenceObservation | runtimeOrBusiness | notes |
|---|---|---|---|---|---|
| markuuid | 13 | rect2 image3 path3 group1 textbox4 | reload 后保持（跨会话一致） | business | textbox 4/4 唯一；SVG 组 3D84D06A… 共享 → 分组 id |
| text | 4（原型字段，非实例自有） | textbox4 | 未保存修改 reload 还原模板值（reload stability） | business | server-save 未验证 |
| locationX/Y/Width/Height/Rotation | 13 | 非 line | reload 还原模板值 | business | = left/top/width/height 镜像 |
| layerNum | 13 | 非 line | reload 还原 | business | 图层排序 |
| mediaMediaType | 13 | 非 line | reload 还原 | business | text/image/svg/shape 分类 |
| isDesign | 13 | 非 line | reload 还原 | business | 模板设计标志 |
| isEdit | 13 | 非 line | reload 还原 | business | 可编辑标志 |
| isLineText | 4 | textbox4 | reload 还原 | business | textbox 专属 |
| fontFamily/fontSize/fontWeight/fontStyle/lineHeight/charSpacing | 4 | textbox4 | reload 还原 | business | 文字样式 |
| lastSafeText | 4 | textbox4 | - | editor runtime | 编辑回滚快照（中文编辑回退用） |
| fill | 16 | 非 group 全 | reload 还原 | business | 颜色 |

## B. Render / Geometry（显示位置/尺寸/变换）

| field | observedCount | objectTypes | persistenceObservation | runtimeOrBusiness | notes |
|---|---|---|---|---|---|
| left/top/width/height | 21 | 全部 | reload 还原模板值 | render | Canvas 逻辑坐标 |
| scaleX/scaleY/angle/skewX/skewY | 13 | 非 line 大部分 | reload 还原 | render | path 有 scale≠1、angle=105 样本 |
| originX/originY | 21 | 全部 | reload 还原 | render | left/top 基准 |
| visible | 9 | line8+rect1 | reload 还原 | render | |
| opacity | 13 | 非 line 12 + line4?（实测13：rect2 image3 path3 group1 line4） | reload 还原 | render | |
| flipX/flipY | 12 | 非 line | reload 还原 | render | 镜像 |

## C. Fabric Runtime（仅页面内运行时/缓存，无持久意义）

| field | observedCount | objectTypes | notes |
|---|---|---|---|
| aCoords | 21 | 全部 | 世界坐标四角缓存 |
| oCoords | 17 | 非 line 部分 | 变换后的控制点 |
| dirty | 21 | 全部 | 脏标记 |
| _cacheCanvas/_cacheContext | 17 | 大部分 | 离屏渲染缓存 |
| cacheWidth/Height/cacheTranslationX/Y | 17/14 | 大部分 | 缓存尺寸/平移 |
| __charBounds/__lineHeights/__lineWidths/_textLines/_unwrappedTextLines | 4 | textbox4 | 文本度量缓存 |
| _styleMap | 4 | textbox4 | 字符级样式 |
| __eventListeners | 4 | textbox4 | 事件监听（复制风险见 inheritReferenceProps audit FINDING-B） |
| cursorOffsetCache/_lastPointer/__lastClickTime | 14 | 大部分 | 交互瞬态 |
| _originalOriginX/Y | 13 | 非 line | 编辑器旋转/镜像前的 origin 记录（fabric 内部，但编辑器依赖） |

## D. Editor Runtime（折立印编辑器维护的状态）

| field | observedCount | objectTypes | notes |
|---|---|---|---|
| isPreview/isDisplay | 13 | 非 line | 预览/显示状态 |
| deleteState/isWrapping | 4 | textbox4 | 删除态/换行态 |
| lockScalingFlip | 12 | 非 line | 锁定等比缩放 |
| appointCmyk | 13 | 非 line | 印刷色（空串默认） |
| locationFactWidth/Height | 13 | 非 line | 素材原始尺寸因子（svg=实际尺寸，text=10000） |
| maskEnable/lowPixelFlag | 13 | 非 line | 蒙版/低清标志 |

## E. Custom / Unknown（存在、用途未定）

| field | observedCount | objectTypes | notes |
|---|---|---|---|
| objType | 14 | rect2 path3 group1 line8 | 字符串；line 全有 —— 用途待查（可能"参考线"标记） |
| mediaImgPath | 12 | 非 line 大部分 | 素材路径（多为空串/“ ”） |
| mediaLineSpace/mediaIsBold/mediaIsItalic/mediaLinethrough | 4 | textbox4 | 编辑器文字样式镜像（与 lineHeight/fontWeight 并行） |
| mediaIsBG | 13 | 非 line | 是否背景 |
| lineIdType/mediaLineIdType | 13 | 非 line | 值为 "undefined" 字符串，用途未知 |

---

## 结论（Closure）

- **文字层（textbox）身份策略已建立**：`markuuid`（Stable/Persisted Candidate，4/4 唯一）+ `uuid`（Session Runtime）+ `arrayIndex`（z 序，不作身份）。
- **SVG/group 为组级 identity（markuuid 组共享）**；line 无身份字段（参考线）→ 每类型分别处理（§十 允许不同策略）。
- **C 类全部不进入 Object Model**（object-model 白名单已排除）。
- **server-save persistence 未验证**：任何"保存→reload→同值"结论需后续阶段实测，本表只给 reload stability 结论。