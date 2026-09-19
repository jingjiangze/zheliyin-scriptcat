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

## D2-C 原生注册机制取证（本刀，REAL）

252438 clean-page 对照（直接 drawText + OCR 链，itemList push/splice 临时 wrapper）：

```
pre:       itemListLen=1（模板自带 1 条 schema 完整条目） objLen=9  regLen=1
directDraw: ok → objLen=10  regLen=2  itemListLen 仍=1
ilCap:      []（drawText 路径从未触发 itemList.push/splice/unshift）
ocrIlCap:   []（OCR→drawText 路径同样不写 itemList）
itemKeys:   maskEnable/isPreview/media/layer/uuid/multiUuid/…（item schema 全字段）
```

**机制结论（STRONG EVIDENCE）**：
1. `checkObjsInProductJson` 读取的是 `itemList[g-1]`（g=itemList.length），即**上一个已存在条目**；
2. **drawText 自身从不向 itemList 写入新条目**；itemList 由**模板加载期原生初始化**填充；
3. 252438 模板自带 1 条 → g-1=0 有效 → 成功；1040459 空页 itemList=0 → g-1=-1 → 失败。

**待补（D2-C1 Case D，下一步）**：点击编辑器原生「新增文字」按钮（不经助手），观察空页 itemList 是否/如何被初始化 → 定位应复用的原生注册机制。
**当前 C-fix 方案 = UNKNOWN（未满足 §9 验收：未找到可复用原生注册函数前不实施，禁 itemList.push({})/吞异常）**。

## D2-C1 Case D 结果（本刀，REAL，native-add-text-1040459.json）

```
按钮: #mText「文字」（LI.toggle 工具栏项）—— click 仅切换模式，不创建对象
timeline(0~5s): itemListLen=1 obj=9 reg=1 全程不变；mutations=[]；created=[]
before: itemListLen=1（sig=完整 item schema）  ← fresh 加载后 itemList 非空！
```

**结论**：
- 原生「文字」按钮非一键新增（需再点画布）→ 未捕获 itemList 写入机制 → **C_NATIVE_INIT = UNKNOWN**；
- **新矛盾线索**：本次 fresh 加载 1040459 itemList=1，而 D1 失败快照 itemList=0 —— 差异环节位于**注入图之后**（D1 流程：注入图→OCR；本次：未注入）→ 疑点：注入裸 fabric.Image（未注册 productItem）可能触发 productJson/itemList 重置或不同步 → **下一步优先取证：注入图前后 itemList 变化**（若确认，C-fix 方向=注入图需同步注册或改用编辑器原生上传路径）。

## D2-C1.5 itemList-lifecycle（本刀，部分 REAL / HYPOTHESIS）

```
T0 fresh:     itemList=1  obj=9  reg=1  txt=0
T4 ctor(no-add): itemList=1  obj=9  reg=1
T5 canvas.add:  itemList=1  obj=10 reg=1   ← 纯 fabric add 不改变 itemList
T6~T9:          （runner 中断未采集；OCR 段未执行——HYPOTHESIS 未闭合）
```

**结论（本刀）**：
- **纯 `new fabric.Image + canvas.add` 不清零 itemList** → 「注入即 1→0」假设被否定（CONFIRMED 该环节无重置）；
- 待重跑补齐 T6-T9（runner 曾中断）。

## D2-C1.5R 三实验补证（本刀，REAL，三实验各自 fresh）

```
A 纯 fabric： A0 itemList=0（id=4） → ctor 0 → add 0（obj 8→9）     全程 0
B injectImg： B0 0 → 注入 0（obj 8→9 reg 0→1）→ B+3s 稳定 0         全程 0
C OCR 链：    C0 0 → 注入 0 → click 0 → drawText throw（undefined.media）→ 0
experiments 一致性：A0/B0/C0 的 ProductVO.itemList 均为 0、itemListId 恒=4
diy deviceState: canvasObjInfo 无 productPageList/productJson.pageList（diyIl=null）
```

**最终根因（更新结论，覆盖旧「fresh=1 / 1→0」叙述）**：

1. **1040459 空模板 ProductVO.itemList 恒为 0（三 fresh 一致，id 恒同）**；此前 Case D 观测的 itemList=1 属**跨会话不稳定状态**（模板初始化偶发），非稳定事实 → **「1→0 转换」不存在**；
2. drawText 在 itemList=0 时进入 checkObjsInProductJson → g=0 → g-1=-1 → undefined.media（每次稳定复现）；
3. 根因定性：**NATIVE_EMPTY_PAGE_CONTRACT** —— 空模板页 itemList 无预置条目 + drawText 路径不注册 productItem + checkObjs 越界读取；
4. 252438 成功=其 itemList≥1（模板自带条目，g-1≥0）；「更新产品 itemList 的机制」=模板加载期原生初始化（drawText 不参与）。

```
C_ROOT_CAUSE = CONFIRMED（NATIVE_EMPTY_PAGE：checkObjs g-1=-1 于 itemList=0）
C_FIX = NOT_READY（仍需定位可复用的 itemList 初始化/注册原生 API）
C_NATIVE_INIT = UNKNOWN
```

## D2-C 静态源码取证（本刀，REAL，native-CanvasDiy.js 402KB）

**发现（决定性）**：
1. CanvasDiy.js **全篇不存在 `content.itemList = [...]` 运行期赋值** → **itemList 完全由「模板数据（服务端模板 JSON）」决定**：252438 模板自带 1 条、1040459 空模板 0 条 —— 「空模板 itemList=0」是**数据事实而非运行期状态丢失**；
2. 存在**原生注册机制候选 `ea.drawItem(index, array)`**（粘贴对象路径 L643-644：`b=pageList[w].content.itemList.length; ... ea.drawItem(b,f)`）→ 该函数按 index 将「真实对象数组」注册进 productJson/图层链路，可让 checkObjs 的 g-1 指向有效条目；
3. 其它 itemList 引用均为读取/过滤（isCupPreview splice 等），无“创建”入口。

**C-fix 设计（STRONG EVIDENCE 方向，待小证后实施）**：
- OCR 前，若当前页 `ProductVO.itemList.length === 0`：将**现有真实画布对象**经站点序列化（canvasObj→product item schema，同 252438 自带条目结构）→ 调原生 `ea.drawItem(0, [item])` 注册 → 之后 drawText 的 `checkObjs g-1=0` 读到该真实 item.media → 不再越界；
- **非伪造**（注册的是画布真实图片对象）、**复用原生机制**（drawItem）、不 push({})、不改站点；
- 待小证：drawItem 精确签名/副作用（是否引起对象重复渲染）、序列化函数名（CanvasDiy 内 createObjProductJsonDetail 或等效）—— 下一刀先做 30 分钟级最小静态验证 + 1040459 单点真机复测后，`C_FIX=READY` 才能落生产。

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