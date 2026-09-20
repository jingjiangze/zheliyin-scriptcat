# STAGE_8A2C_ROOT_CAUSE_ISOLATION_REPORT — Geometry 根因隔离

> 分支：stage-8a-2-rotation-policy-geometry；HEAD 见 git；test=0.3.11.2（本刀升级后 0.3.11.3）
> 原则（§一）：冻结 UI、零生产代码修改、一次一根因、证据可复现、禁止常数偏移/盲调 0.969/font 先行
> evidence：runtime/reports/stage-8a2/{background-position,direct-image-scale,canvas-88x57-create-failure}.json
> 等级：CONFIRMED（可重复实验支撑） / STRONG EVIDENCE / HYPOTHESIS / UNKNOWN

## 0. Production wiring 状态（§二 修正）

- `image-transform.js`：正式 userscript/manifest **未接线**；仅诊断 runner 注入。A 双轨已分别取证（TRANSFORM on/off）。
- evidence 三文件本次已全部入库（含补回 direct-image-scale.json；移除旧背景图同源误删风险）。

## A. 背景图向上偏移 — 双轨残差（§三~§五）

同图同 OCR（0/2/5/8/10°，scale1，bg left/top=0 画布左上，canvas 871.5×530.2，zoom 1.4525 仅显示）：

| angle | top ON(transform 已接线) | top OFF(生产等价) |
| --- | --- | --- |
| 0° | 23 | 23 |
| 2° | 11 | 45 |
| 5° | -13 | 29 |
| 8° | -37 | 13 |
| 10° | -52 | 3 |

- 判定：**两轨残差均随角度稳定变化（非常数偏移）→ A_ROOT_CAUSE = CONFIRMED：ROTATION_GEOMETRY（旋转后 textbox 中心 ≠ transformed OCR region 中心；锚定/映射组合偏差）**
- 双轨差异证明 image-transform 已实际影响运行链（§四 dual-track 达成）
- 注意：0° 基准 top≈23≈源 y30 正确 → 基础平移正确，偏差纯旋转相关

## B. 普通图片 500→700 — natural/display 链路（§六~§九）

显示尺寸矩阵（同源 1000×300，fabric width 路径 100~500）：textbox **恒定 493×85（fs=59，aCoords 494×86）**，与显示尺寸解耦。

- 判定：B_ROOT_CAUSE = CONFIRMED：**SIZE_MAPPING 缺显示归一化**（fs 仅由 OCR 输入 natural 行高决定；显示缩小 → 相对比例变大 → “500 图出 700 区域”机制）
- 717 vs 493 的关系：717≈493×1.455（Editor 渲染单位↔本地，8A-1 已证非 zoom）→ 标为 VIEWPORT_RENDERED_SIZE 分量，不并入 GEOMETRY 误差
- 未改 0.969；未加 displayScale（§八 禁止先行）——留待 Fix 阶段按证据引入归一化

## C. 88.5×57 创建失败 — 四象限 + 原生源码（§十~§十三）

- 四象限（1040459，页面世界直调 drawText，同 text/x/y/height/layerNum）：**A(248×493) B(1×493) C(248×200) D(1×200) 全部 PASS**
  → **否定 font.id 与 width 为 PRIMARY**（font 248 ≠ 无效；width 493 ≠ 越界拒绝）
- 原生源码特征（checkObjsInProductJson 反编译片段）：`p.pageList[e].content.itemList[g-1].media.mediaType==...` —— **失败点在 itemList[g-1] 未定义时读 .media → undefined.media**
- 与 252438 成功对照：同 entry 仅模板不同 → 失败 = **1040459 的 productJson.itemList 与画布对象不同步（模板初始化结构差异）**
- 判定：C_ROOT_CAUSE = CONFIRMED（失败点 itemList[g-1] undefined / 机制明确）；**精确触发条件（为何 g-1 缺失） = UNKNOWN**（需读 1040459 itemList 初始长度；下一阶段 Fix 前先取证）
- getEditorDefaultFontId 命名核查：fontLis=[]（1040459 无 .fontFamily li）→ #248 来自旧模板残留/首次页？→ **CONFIRMED：getEditorDefaultFontId 不可靠（空表→stale id）**，但非 C 失败根因

## 验收结论（§十七/§十八）

```
A = CONFIRMED（旋转几何残差，双轨可复现）
B = CONFIRMED（尺寸映射缺显示归一化，矩阵可复现）
C = CONFIRMED（失败点 itemList[g-1].media；触发条件 UNKNOWN）
GEOMETRY_READY = NO
```

允许进入 Fix 的条件：A/B 已满足；C 需先补「1040459 全链路失败时 itemList 长度 vs 画布对象数」取证（下一刀第一项）。

## 下一阶段单根因 Fix 顺序（每根因独立 commit → test → 升版 → 真机回归）

1. C-fix：drawText 前 productJson 同步/占位（先补证）
2. A-fix：旋转后 textbox 中心=transformed OCR region 中心（含 preserveRotation 概念，无 UI）
3. B-fix：显示/natural 归一化尺寸映射（替换 natural-only fs 推算，禁盲调 0.969）
4. 全量回归：92×56 / 88.5×57 / Background / Direct Image / Page / P0 → GEOMETRY_READY 判定