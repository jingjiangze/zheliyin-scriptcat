# STAGE 8A-2 C3-C4 Audit

> Stage 8A-2 / C3-C4 深化取证审计 —— drawImg 契约 / Native Image Object / Serializer / register 闭环
> 依赖前置：`docs/STAGE_8A2_NATIVE_IMAGE_OBJECT_CONTRACT.md`（字段级契约）+ 证据 JSON
> 日期：2026-09-19

## 一、目标回顾

验证两条 Native 链能否在 `1040459 itemList=0` 情况下闭合（不再盲试 UI / Ctrl+V）：

```
photoupload → CurrentCanvas.drawImg → CanvasDiy.drawImg
    → ua → fabric.Image.fromURL → Native business fields
    → canvas.add → canvasToProductObjArr → uuid → checkObjsInProductJson

Canvas objects → ProductDataModel.setItemListJson
    → filter mediaMediaType → Native serializer(Q/R) → page.content.itemList
```

## 二、取证方法

1. **静态**：`runtime/downloads/save-scan/*.js-v20260707017`（171 文件）大括号匹配抽取完整函数体（drawImg @144191 / ua @137532 / checkObjsInProductJson @97265 / setItemListJson / drawItem @63447 等）
2. **真机**：新增 `ZY_MODE=drawimg-contract`（挂在 geometry-diagnostic.js），1040459 fresh 页面，四段实验（EXP1-4）

## 三、逐条判据

### C3-A drawImg 五参数 → **PASS**

见契约文档 §二。关键实证：`photoupload` 真实调用即 **2 参数**（第三参 undefined = 新增图片路径），非"猜"。`LoadFromProductJsonCommand` 为 **4 参数**（第三参=item，第四参=layer）。`h` 为 container（掩码组场景）。

### C3-B drawImg 两种路径对拍 → **PASS**

| Case | 调用 | 结果（真机 EXP1） |
|---|---|---|
| A（Case A） | `drawImg(url, pos)`（f=undefined） | 建真实 native image（mediaMediaType=image / mediaImgPath / canvas.add / canvasToProductObjArr.push / uuid） |
| 尾部 check | `checkObjsInProductJson(f)` f=undefined | **不抛**（`if(a)` 短路；thrown=null） |
| itemList | — | 仍=0（drawImg 本身不写 itemList） |

### C3-C 合法 productItem 来源 → **确认**

- 新增图片：photoupload → drawImg(f=undefined) 原生建图（不伪造 item）
- 已存 item：LoadFromProductJsonCommand → `drawImg(url, null, item, layer)`（第三参真实 item 入口）
- itemList 建立：`ProductDataModel.setItemListJson`（3 参）→ `pageList[d].content.itemList[b]=e`

> 不再需要人工构造 fake productItem：`drawImg` 建图 → `setItemListJson` 即得合法 itemList。

### C3-D/C3-E H_NATIVE_IMAGE_SERIALIZER → **TRUE**

真机矩阵（EXP2/EXP3）：

| 输入 | ilBefore → ilAfter | itemList[0].media.mediaType |
|---|---|---|
| 原生 drawImg(2 参) image | 0 → **1** | `image` |
| bare fabric.Image | 0 → **0** | — |
| bare + 补 native 字段 | 0 → **1** | `image` |

结论：**只要 canvas 上存在带 `mediaMediaType=IMAGE` 等 Native business fields 的真实对象，`setItemListJson()` 即建立合法 itemList**（与用户假设一致）。

### C3-F 空 itemList 建图 + serializer + drawText → **PASS**

1040459 初始 itemList=0 → drawImg 建图（objLen 8→9, regLen 0→1）→ setItemListJson（ilAfter=1）→ drawText（**ok=true**，`undefined.media` 消除）。

### C3-G drawImg 自身空 itemList 抛错假设 → **排除**

`ua()` 尾部 `e.checkObjsInProductJson(f)`，f=undefined 时 `if(a)` 短路**不抛**。因此 drawImg 无需"先触发 Native 异常再 catch"的 workaround；Route A 的建图步骤天然安全。

### C3-H 闭环 → **PASS（C_ROOT_CAUSE 完整证明）**

```
drawImg(2arg) → setItemListJson(3arg, ProductDataModel.getInstance()) → itemList 0→1
    → drawText(entry truthy) → itemList[g-1] 不越界 → ok=true
```

### C4 item schema → **已记录**（见契约文档 §六与 `c-native-image-serializer.json`）

### C5 drawItem 二级验证 → **UNSAFE（不用于 C-fix）**

`ItemDataModel.drawItem(a,h,A)`（@63447）实为 itemList→canvas 渲染器：调用方先 `itemList.concat(...)` 再 `drawItem(itemList.length, items)`，内部重建 canvasToProductObjArr.layerNum 并按 mediaType 分派 drawImg/drawText/drawContainer…。判定：

```
DRAWITEM_SIDE_EFFECT = UNSAFE（重建对象、触发字体加载/异步分派、依赖已 concat 的 itemList）
```

## 四、最终状态

| 判据 | 状态 |
|---|---|
| `C_DRAWIMG_CONTRACT` | **PASS** |
| `C_NATIVE_IMAGE_OBJECT` | **CONFIRMED** |
| `C_NATIVE_SERIALIZER` | **PASS** |
| `C_NATIVE_REGISTER` | **PASS** |
| `C_FIX` | **READY**（Route A：Native drawImg 建图 + ProductDataModel.setItemListJson；Route B/C/D 不需要） |

**C-FIX 最小修复方案（Route A）**：
1. 空 itemList 页面先经站点原生 `drawImg(url, pos)`（f=undefined）同步一张真实图片（或复用画布既有原生图片对象）
2. `ProductDataModel.getInstance().setItemListJson(canvasToProductObjArr, pageIdx, canvasDiy)` 重建 itemList（site 原生 serializer，非伪造）
3. 之后 `drawText` 的 `itemList[g-1]` 不再越界

> ⚠️ 尚未生产实现；进入生产修改前需创建 `checkpoint-8a2-c-fix-before`，且满足 C8 硬约束（不改站点源码 / 不吞错误 / 不伪造 item / 不依赖模板 ID / 对 1040459 与 252438 双向验证）。本刀（C3-C4）= 纯 diagnostic/evidence，**不升版本**。

## 五、产出清单

| 产物 | 路径 |
|---|---|
| drawimg-contract 真机证据 | `runtime/reports/stage-8a2/c-native-drawimg-contract-1040459.json` |
| upload callgraph | `runtime/reports/stage-8a2/c-native-upload-callgraph.json` |
| image object contract | `runtime/reports/stage-8a2/c-native-image-object-contract.json` |
| serializer 证据 | `runtime/reports/stage-8a2/c-native-image-serializer.json` |
| drawItem 契约 | `runtime/reports/stage-8a2/c-drawitem-contract.json` |
| 静态抽取原始件 | `runtime/reports/stage-8a2/c3/c4/c5/c6/c7-extract.raw.txt` |
| 契约文档 | `docs/STAGE_8A2_NATIVE_IMAGE_OBJECT_CONTRACT.md`（本文件） |