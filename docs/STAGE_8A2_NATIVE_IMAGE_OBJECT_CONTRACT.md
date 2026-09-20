# STAGE 8A-2 Native Image Object Contract

> Stage 8A-2 / C3-C4 深化取证 — 站点原生 `drawImg` Image Object 契约
> 依据：`runtime/reports/stage-8a2/c-native-drawimg-contract-1040459.json`（真机）+ `runtime/downloads/save-scan/*.js-v20260707017`（静态）
> 日期：2026-09-19

## 一、结论

| 判据 | 结论 |
|---|---|
| `C_DRAWIMG_CONTRACT` | **PASS**（五参数语义 + 两分支已实证） |
| `C_NATIVE_IMAGE_OBJECT` | **CONFIRMED**（原生 drawImg 2 参创建真实 image object，不再依赖 Ctrl+V） |
| `C_NATIVE_SERIALIZER` | **PASS**（ProductDataModel 3 参签名，ilAfter 0→1） |
| `H_NATIVE_IMAGE_SERIALIZER` | **TRUE**（bare→empty，native+fields→valid item） |
| `C_NATIVE_REGISTER` | **PASS**（drawImg 建图 + setItemListJson 闭环，drawText PASS） |
| `C_FIX` | **READY（Route A）** |

## 二、drawImg 五参数契约（C3-A）

源码：`CanvasDiy.prototype.drawImg = function(a,b,f,d,h)`（`CanvasDiy.js @144191`）

| 参数 | 语义 | 证据 |
|---|---|---|
| `a` | image URL（`data:image` / `assets/resource/...` / S3） | `a.replace("large","normal")`、`a.indexOf("data:image")` |
| `b` | 位置/尺寸/属性 config | `b.x/b.y/b.angle`、`b.factWidth/factHeight`、`b.isqrcode`、`b.enhancesize` |
| `f` | **product item**（`undefined`=新增图片路径） | `f.media.enhancesize`、`f.cutArea`；`LoadFromProductJsonCommand` 传 `drawImg(f,null,a,k.i$6)` |
| `d` | layer（当前在飞对象 moveTo） | `l.moveTo(d)` |
| `h` | container/group（掩码组插入场景） | `if(!h||h.hitB)` 分支 |

**photoupload 真实调用**（`photoupload.js`）：

```js
l.drawImg("assets/resource/imgs/large/" + b.filePath, {
  x: l.currentFactWidth / 4, y: l.currentFactHeight / 4,
  factWidth: b.width, factHeight: b.height, isqrcode: b.isqrcode
})
```

即：第三参 `undefined` → **新增图片路径**（Case A 就是 photoupload 真实入口形态）。

## 三、ua() 内部链路（C3-A/C3-B）

`ua(a,b,f,d,h,e,g)`（`CanvasDiy.js @137532`）是真正引擎，`fabric.Image.fromURL` 回调中：

**分支一：`void 0 != f`（已存 item 加载 / LoadFromProductJsonCommand）**
```js
P.createObjProductJsonDetail(l, f, e.canvas)  // media→business fields
l.mediaImgPath = a
// filters / shadow / rightsMaterial / markuuid 特判
```

**分支二：`f` undefined（新增图片 / photoupload / 1040459 新图）**
```js
l.set({originX:"left", originY:"top"})
l.mediaMediaType = m.IAMGE        // "image"
l.mediaImgPath = a
// b 位置/角度/scale/multiUuid/cmyk/gild 等
l.layerAlpha = l.getOpacity().toFixed(2)
l.isEdit = true
l.mediaIsBG = false
l.protoVisible = l.getVisible()
e.canvas.add(l).renderAll()
l.setCoords()
e.canvasObjInfo.canvasToProductObjArr.push(l)   // ← 注册
// b.XlayerNum 覆盖 / threeDTxetProperty 分支
l.uuid = C()                                     // ← 原生 UUID
// CreateLayerThumbnailCommand + SimpleCommandManager
...
e.checkObjsInProductJson(f)      // f=undefined → if(a) 跳过 → 不抛
```

**真机验证（EXP1）**：

```
objLen  8 → 9
regLen  0 → 1
itemListLen 0（drawImg 不写 itemList —— 与静态预测一致）
thrown null（checkObjsInProductJson(undefined) 短路安全）
```

新建对象完整字段（截断样本）：

| 分组 | 字段 | 值样 |
|---|---|---|
| IDENTITY | uuid / multiUuid | `06684998-...` / `4656e0f5-...`（原生 UUID） |
| GEOMETRY | width / height / scaleX / scaleY / left / top / angle / originX / originY / bigPicWidth / noCutWidth / lockUniScaling | 127 / 38.1 / 1 / 1 / 40 / 40 / 0 / left / top / 1000 / 127 / false |
| MEDIA | mediaMediaType / mediaImgPath / isqrcode / layerAlpha / isEdit / mediaIsBG / protoVisible | image / data:… / "0" / "1.00" / true / false / true |
| REGISTRY | inReg / inRegIdx | true / 0 |

## 四、checkObjsInProductJson 契约（C 根因触发点）

`checkObjsInProductJson(a)`（`CanvasDiy.js @97265`）：

```js
function(a, b) {
  if (a) {         // ← a falsy 整块跳过 —— drawImg 新增路径恰好传 undefined
    var h = this.canvasObjInfo.canvasToProductObjArr.length,
        e = currentCanvasNum - 1,
        g = p.pageList[e].content.itemList.length;   // itemList 长度
    p.pageList[e].content.itemList[g - 1].media/*…*/ // ← g=0 → itemList[-1] → undefined.media THROW
    ...
  }
}
```

**这是 C 根因的静态闭环证据**：
`drawText` 用**真 product item**（entry truthy）调用 → `checkObjsInProductJson(entry)` → 空 itemList `g=0` → `itemList[-1].media` → `undefined.media`。

## 五、与裸 Fabric Image 的字段差异（C3）

裸 `new fabric.Image()`（EXP3A）与原生对象差异：

| 字段 | 裸 fabric.Image | 原生 drawImg 对象 |
|---|---|---|
| `mediaMediaType` | **undefined** | `"image"` |
| `mediaImgPath` | **undefined** | URL |
| `layerAlpha` / `isEdit` / `mediaIsBG` / `protoVisible` | undefined | `"1.00"` / `true` / `false` / `true` |
| `noCutWidth` / `bigPicWidth` / `lockUniScaling` | undefined | 127 / 1000 / false |
| `uuid` / `multiUuid` | undefined | 原生 UUID |

**H_NATIVE_IMAGE_SERIALIZER 验证矩阵（真机）**：

| 输入 | ilBefore | ilAfter | item.media.mediaType |
|---|---|---|---|
| bare fabric.Image | 0 | **0** | —（被 filter 剔除） |
| bare + 补 native 字段（仅字段，不改 prototype） | 0 | **1** | `image` |
| 原生 drawImg(2 参) 对象 | 0 | **1** | `image` |

> 结论：serializer 识别的依据是 **business 字段（尤其 `mediaMediaType`）**，不是 prototype/class。因此"字段齐全的 canvas image"即可建立合法 itemList——这就是 Route A 的理论基础。

## 六、item schema（C4）

`setItemListJson` 产物 `itemList[0]`（ID 已截断，无敏感值）：

- **top.envelope**：`layer, isEdit, rightsMaterial, gildMaterial, media, topEnable, resourceType, maskEnable, isDisplay, printLocation, lowPixelFlag, visible, deleteState, location, visitLevel, selectEnabled, isDesign, isComposite, isPreview, isDesignShape, noCutWidth, markuuid, resouceCategoryId, materialDragType, rightType, zdsc, uuid, multiUuid, designableArea, pageNumLeftUuid, pageNumRightUuid`
- **media**：`isBG, imgPath, imgPathBlack, oldImgPath, highEditImgPath, enhancesize, pngStroke, pngStrokeWidth, mediaType, isqrcode, textChange, personflag, cmykSpecial, appointCmyk`（image 时另有 cutArea/filters/shadow 可选）
- **location**：`x, y, width, height, factWidth, factHeight, rotation`
- **printLocation**：`x, y, width, height, rotation`
- **layer**：`alpha`
- **identity**：`uuid`（保留 drawImg 产物 UUID）、`multiUuid`、`markuuid`、`zdsc`

## 七、闭环证明（C3-H）

1040459（`itemList=0`）：

```
drawImg(dataUrl, {x:40,y:40,...})        // EXP1 建真实 native image
    ↓
ProductDataModel.getInstance()
  .setItemListJson(canvasToProductObjArr, pageIdx, canvasDiy)   // EXP2: ilBefore=0 → ilAfter=1
    ↓
diy.drawText("闭环验证ZW", null, null, null, entry, 1)           // EXP4: ok=true（undefined.media 消除）
```

**C_ROOT_CAUSE（NATIVE_EMPTY_PAGE_CONTRACT）的完整闭环解决方案 = Route A**：
> Native `drawImg`（f=undefined）建真实 image object + `ProductDataModel.setItemListJson`（3 参正确签名）建立合法 itemList → `drawText` 的 `itemList[g-1]` 不再越界。

## 八、注意（已修正的认知）

1. **serializer 有两个同名实现**：
   - `ProductDataModel.setItemListJson(a,d,m)`（3 参，写 `pageList[d].content.itemList`）← **正确对象**
   - `ItemDataModel.setItemListJson(a,h,A,k)`（4 参，返回 `{itemList:g,...}`，不回写 pageList）← 此前 runner 误命中导致 ilAfter 恒 0
2. ProductDataModel 需 `getInstance()` 取实例（原型方法在实例上）；holder 扫描首个 `typeof m.setItemListJson==="function"` 会命中 ItemDataModel → 必须按 `fn.length===3` 且模块名匹配选择。
3. `drawItem` 是 itemList→canvas 渲染器（调用方先 concat），不是建立者 → **不用于 C-fix**（详见 `c-drawitem-contract.json`）。