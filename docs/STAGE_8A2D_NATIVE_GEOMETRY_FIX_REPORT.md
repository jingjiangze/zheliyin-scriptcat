# STAGE_8A2D_NATIVE_GEOMETRY_FIX_REPORT — 阶段 D1（C Trigger Audit）

> 分支 stage-8a-2-rotation-policy-geometry；严格顺序 §37：D1 →（C trigger confirmed）→ D2 C-fix …

## 1. Repository State
- branch: stage-8a-2-rotation-policy-geometry；HEAD/test 以 git 为准；version 0.3.11.3（本刀证据+代码后升 0.3.11.4）；working tree clean

## 2. D1：C Trigger Audit（88.5×57 创建失败触发条件）

### 方法（§3~§9）
1040459 完整 OCR 链路 × 2（立即 / 等8s）；drawText 失败瞬时 `findProductState()` 快照（require 模块扫描找 ProductVO）。

### 结果（REAL，canvas-88x57-create-failure.json）

```
delay=0 :
  drawText(block0) → throw undefined.media
  snapshot: holderKey=mod:ProductVO  itemListLen=0  objLen=10  cc=null

delay=8000 :
  block0 → throw（同）；block1 → throw（同）
  snapshot: itemListLen=0  objLen=10/11
```

### 判定

```
C_TRIGGER = CONFIRMED

1040459:
  currentCanvasNum = 1
  ProductVO.pageList[0].content.itemList.length = 0   ← 空（模板无自带对象）
  canvas.getObjects().length = 10（含注入图/模板对象）
  drawText 进入 checkObjsInProductJson → g = itemList.length = 0
  g-1 = -1 → itemList[-1] === undefined → undefined.media → 抛错 → block0 失败 → 全量回滚

时序（立即 vs 8s）= 均失败 → 排除 INIT_TIMING（§7）
对照（推断，252438 早年成功路径）：其 itemList 非空 → g-1 ≥ 0 → 读取既有对象 .media → 成功
```

- 失败点：站点 `CanvasDiy.checkObjsInProductJson` 的 `productPageList[e].content.itemList[g-1].media`
- 触发条件：**ProductVO.itemList 为空（空模板页）时 drawText 的 productJson 同步未发生**（canvasToProductObjArr 已 push、itemList 未同步 → 两数组不同步）
- 已排除：font.id（四象限全 PASS）、width（四象限全 PASS）、时序

### D2 前置（下一步，勿跳步）
- 取证 252438 成功时 ProductVO.itemList 的内容/来源（模板自带 vs 初始化 API），确认可用原生同步机制；
- 依据（§11：优先原生机制）确定 C-minimal-fix（禁止 itemList.push({}) / 吞异常 / 改站点源码）；
- C-fix → 88.5×57 block0 PASS + 252438 无回归 → commit/push dev / FF test / 升版 / 真机回归。

## 3. 结论
```
A = CONFIRMED（上阶段双轨残差）
B = CONFIRMED（上阶段尺寸解耦）
C_TRIGGER = CONFIRMED（本刀：itemList 空 + g-1=-1）
GEOMETRY_READY = NO
```