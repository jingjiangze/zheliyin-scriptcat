# Stage 6.2 强制纠偏 — Native Pipeline 报告

> 分支：`demo` ｜ 真实测试环境：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`
> 本文件覆盖 §一~§二十八 的强制纠偏交付，含真实 252438 证据（报告 JSON 见 `runtime/reports/`）。

---

## 0. 基线确认

- HEAD @ 本阶段起点：`ee47859`（上一轮 s62-1/s62-2 TextBlock 拆分交付）
- 全部真机测试使用固定 URL，浏览器持久化 profile：`runtime/browser/profile-usc3`
- 证据归档：
  - `runtime/reports/stage-6-2-bundle-dump.json`（168 个真实 bundle 采集清单）
  - `runtime/reports/stage-6-2-native-probe.json`（hook 对拍探针 R3 结果）
  - `runtime/reports/stage-6-2-ocr-create-native-test.json`（生产 bridge 端到端）
  - `runtime/reports/stage-6-2-save-reload-probe.json`（P1 首测，**已标注被 v2 推翻**）
  - `runtime/reports/stage-6-2-save-reload-probe2.json`（P1 决定性复测）
  - `runtime/reports/stage-6-2-cleanup-persisted.json`（服务端残留清理验证）

---

## 1. 问题 A：OCR 文字全部挤在一个 TextBlock（§三~§十一）

### 1.1 根因与修复

`groupLinesToBlocks()` 旧默认 `maxGapPx=240 / gapRatioMax=1.6 / heightRatioMax=2.4` 属"宽松合并"策略，
会把同一区带的多个视觉区域连续吞并，最终 N lines → 1 block。

修复（commit `ee47859`，本阶段前置）：

- **拆分优先于合并**：先假定每个 logical line 是独立区域，只有五条件**同时**满足才合并（强关系合并）：
  1. 左边界高度一致：`abs(xA - xB) <= 0.5 * medianLineHeight`
  2. 行距合理：`verticalGap <= 1.25 * medianLineHeight`
  3. 较强 horizontal overlap：`overlapRatioMin >= 0.5`
  4. 尺寸关系合理：`heightRatioMax <= 2.0`（允许标题大字+正文小字，不允许仅距离近就合并）
  5. 不跨明显空白区（行距超阈 → 两个 block）
- 参数落地：`gapRatioMax=1.25`、`maxGapPx=1.5×medianLineHeight`、`leftAlignTolRatio=0.5`、`heightRatioMax=2.0`
- 左右两列绝对禁止合并：horizontal overlap 条件天然切断并列块（真实名片/两列布局回归实证）
- 可视化诊断：每 block 输出 `{blockIndex, lineCount, lines[{text,x,y,width,height}], bbox, mergeReasons}`
- 回归单测：`tests/editor-object-model/candidate-normalizer.test.js` 追加 14 项拆分场景 **全部 PASS**
  （真实名片 3 blocks、左右两列 2 blocks、mergeReasons、lineGeometry、blank-line 分隔等）

### 1.2 验收指标

- `detectedBlocks`（TextBlock 数）== `createdCount`（textbox 数）— 端到端实证 `3 == 3` ✓

---

## 2. 问题 B：没有进入 DIY 原生编辑管线（§十二~§十七）

### 2.1 原生新增文字真实入口（静态逆向 + 真机 hook 对拍实证）

静态逆向（168 个真实 bundle，`runtime/vendor/252438/`，gitignored）定位：

```
CanvasDiy.drawText(a, b, c, d, e, f)          // r165 OneKeyCanvasDiy
  a=文本 | b=fontSize | c=left | d=top | e=media JSON | f=layerNum
```

真机 R3 探针（`stage-6-2-native-probe.js`，hook 于页面主世界实时记录）捕获**真实调用顺序**（§十四）：

```
T1 手工路径（文本参数）            T2 media 路径（生产 OCR 同路径）
Undo.save()                        Undo.save()
→ drawText(文本,16,120,130)        → drawText(media条目, layerNum=2)
→ canvas.add(9→10)                 → createObjProductJsonDetail(mediaType=text)
→ checkObjsInProductJson(layer→2)  → canvas.add(10→11)
→ Undo.save()                      → checkObjsInProductJson(layer→3)
                                   → Undo.save()
```

关键事实（证据：`stage-6-2-native-probe.json` p1~p4）：

- **图层注册**：`canvasObjInfo.canvasToProductObjArr.push(g)`（drawText→checkObjsInProductJson 链内完成）
- **原生 uuid**：`g.uuid = y()`（UUID v4）
- **身份/样式/location 字段注入**：`createObjProductJsonDetail`（r124，TEXT 分支）→ media JSON 驱动；
  `setLeft/setTop/setWidth/setHeight/setAngle(locationRotation)` 用 `location*` 落位
- **撤销/重做闭环**：T1 原生撤销点击 → 对象从 canvas+layer 移除，模板保留（undo 2→1/redo 0→1）；
  重做点击 → 同一对象恢复 ✓

### 2.2 Native vs OCR 对象字段对拍（§十六）

探针 T1（手建，纯文本参数）与 T2（media 路径）逐字段差异（均可查 `p2_t1_fields` / `p4_t2_media.vals`）：

| 字段 | T1 手建（无 media） | T2 media 路径（= 生产 OCR 路径） |
| --- | --- | --- |
| multiUuid / uuid | 原生生成 | 原生生成（$17：由原生流程负责） |
| layerNum | **absent** | **2**（drawText 第 6 参） |
| location*/printLocation* | 空字符串 | **精确数字**（来自 media.location） |
| isEdit / isDisplay | true / false | 1 / 1 |
| mediaText / mediafontPointSize / mediafontColor / mediafontId | 空 | **有值**（媒体 JSON 真实注入） |

结论：手工路径（T1）缺少 layerNum/location*，与既有"字段镜像"能力同层（Level 2）；
**生产 OCR 走 media 路径（T2）后对象字段 = 原生新增文字对象字段**（同一 `createObjProductJsonDetail` 出口）。

### 2.3 生产 bridge Native-first（§十七：OCR 只给 text/position/size/style）

`extension/src/editor/page-bridge.js` 的 `ocrCreate` 增加 Native-first 分支：

1. `getCanvasDiyForSide("front")` 定位 `CanvasDiy` 包装
2. 创建前 `Undo.getInstance().save()`（原生快照，历史边界前置）
3. 每个 TextBlock → `buildTextMediaEntry(it, layerNum, fontId)` 构造最小 TEXT media
   （text/pointSize/fontColor/id/isHorizontal/gravity/charSpace/lineSpace/location/printLocation/layerNum/isEdit/isDisplay/deleteState/visitLevel）
   —— **身份字段（multiUuid/layerNum/location*）交给原生流程，OCR 不伪造**
4. `diy.drawText(text, null, null, null, entry, layerNum)` → 原生全链（createObjProductJsonDetail → canvas.add → 图层注册 → uuid → checkObjsInProductJson）
5. 任一 block 失败 → 全量回滚（canvas + 图层数组），`failedBlockIndex` 上报
6. 创建后再次 `U.save()`（批次成为单个原生历史步）
7. 原生路径不可用时回退既有 mirror 路径并 `editorIntegration.mode="mirror"` 显式标明

---

## 3. 端到端验证（生产 bridge，真实 252438）

`runtime/stage-6-2-ocr-create-native-test.js`：注入生产 pageBridge → postMessage `ocrCreate`（3 个测试块）
→ 断言（完整数据见 `stage-6-2-ocr-create-native-test.json`）：

### 3.1 Geometry / Layer（§二十四）

```
ocrCreateResult: ok=true, detectedBlocks=3, createdCount=3, mode="native"
postCreate: canvas 9→12, layer 1→4
            textObjs=3  ==  layerTextObjs=3      ← canvasTextCount == layerTextCount ✓
            identity: 3/3 layerIdx>=0（全部注册进图层数组）, layerNum 1/2/3
            uuid 全原生 v4；fontSize 28/22/18、left/top 与输入一致
```

### 3.2 History（§十八/§十九/§二十）

| 步骤 | canvas | layer | ocrOnCanvas | ocrInLayer | undoLen | redoLen | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OCR 批次后 | 12 | 4 | 3 | 3 | 2 | 0 | 批次=1 个原生历史步 |
| 模拟用户编辑（张三→张三-编辑 + U.save） | 12 | 4 | 2(+编辑) | 同 | 3 | 0 | 编辑=独立历史步 |
| **Undo#1** | 12 | 4 | 3 | 3 | 2 | 1 | **先撤编辑**（张三-编辑→张三），批次保留 ✓ §二十 |
| **Undo#2** | **9** | **1** | 0 | 0 | 1 | 2 | **撤批次**，模板(9 对象/1 图层)保留 ✓ §十八 |
| **Redo#1** | **12** | **4** | 3 | 3 | 2 | 1 | **恢复同一批对象**（canvas+图层+身份+位置+字号）✓ §十九 |
| Redo#2 | 12 | 4 | 2(+编辑重放) | - | 3 | 0 | 编辑按原生语义重放 ✓ |

清理后基线恢复：canvas=9、layer=1、undo/redo=(1,0)，`templateIntact=true` ✓

### 3.3 硬性验收（§二十四）

```
createdTextboxes == textBlocks        → PASS（3==3）
canvasTextCount  == layerTextCount    → PASS（3==3，层注册一致）
undoBefore/undoAfterOCR/undoAfter/redoAfter → 真实数据见 3.2 表（未写死 PASS）
nativeObjectFields / ocrObjectFields / diff → 见 §2.2 对拍表（非空 PASS 声明）
```

### 3.4 分层结论（§二十五，禁止将 Level 2 写成 Level 5）

| Level | 内容 | 结论 |
| --- | --- | --- |
| 1 | Canvas 可渲染 | **PASS**（canvas 对象存在、requestRenderAll 正常） |
| 2 | Editor Object 字段齐全 | **PASS**（native media 路径，字段=T2 对拍集） |
| 3 | Layer 注册成功 | **PASS**（canvasToProductObjArr 全部含 3 对象，layerTextCount==canvasTextCount） |
| 4 | History 注册成功 | **PASS**（createCustomJson 遍历图层数组 → 快照包含 OCR 对象 → 撤销/重做实证） |
| 5 | Undo/Redo 成功 | **PASS**（原生按钮实证：撤批次保模板 / 重做恢复同一批 / 编辑边界先撤编辑） |
| 6 | Save/Reload | **PENDING**（见 §4，按 §二十六 记录限制） |

---

## 4. Save/Reload（P1，§二十二/§二十六）

### 4.1 首测（v1，`stage-6-2-save-reload-probe.js`）

真实点击"保存"（`LI.save`）→ XHR `third/IfDiyOrderidExit.do` 200 → 刷新后 2 个对象恢复（canvas 11）。
**但未做站点数据隔离，恢复来源可能为本地草稿缓存 → 报告已标注 `superseded`（被 v2 推翻）。**

### 4.2 决定性复测（v2，`stage-6-2-save-reload-probe2.js`）

- 接受保存确认弹窗、全量网络钩（fetch + jQuery.ajax + XHR）
- 保存点击后**仅捕获到保存前置检查** `jq.post third/IfDiyOrderidExit.do?designId=`（无内容写库请求）
- 刷新 → 对象**未恢复**（canvas 9，layer 1，probe 0）
- `Storage.clearDataForOrigin` 清站点数据后再刷新 → 同样**未恢复**

**结论（诚实清单）**：
- `reload stability`（未保存状态下刷新）：**not-persistent**（无真实保存则不恢复）
- `server-save persistence`：**PENDING** —— 自动化无登录 profile 无法完成真实内容保存
  （保存流程被"订单检查"前置拦截，可能存在登录/权限门槛；红线：不在自动化中伪造登录/保存）
- 手动验证指引：真实登录账号在编辑器内 保存 → 刷新，确认对象/图层/身份恢复；完成后回填本报告
- 服务端卫生：v1 可能写入的探针对象已通过 `stage-6-2-cleanup-persisted.js` 写回清理并验证
  `SERVER-CLEAN`（canvas 9/layer 1/probe 0）

---

## 5. Git 记录（§二十七）

| commit | 内容 |
| --- | --- |
| `ee47859` | fix: tighten OCR textblock segmentation（s62-1/2，本阶段前置） |
| （本阶段系列） | audit: trace native text creation operation |
| | feat: route OCR creation through native text operation |
| | test: verify OCR native layer undo redo + save/reload probes |
| | docs: stage-6.2 native pipeline report + execution record |

不 force push；每轮真实 252438 证据随 commit 同步 push。

---

## 6. 最终状态（§二十六 完成条件逐项）

| 条件 | 状态 |
| --- | --- |
| P0 TextBlock 正确拆分 | **PASS**（§1，14 项拆分回归） |
| P0 一视觉区域一 textbox | **PASS**（created==blocks 实证） |
| P0 Canvas object 正常 | **PASS**（Level 1） |
| P0 Layer 正常 | **PASS**（Level 3，layerText==canvasText） |
| P0 Native operation 已确认 | **PASS**（真实调用链 hook 证据，§2.1） |
| P0 Undo 正常 | **PASS**（§3.2/Level 5） |
| P0 Redo 正常 | **PASS**（§3.2/Level 5） |
| P1 Save/Reload 已验证或明确记录限制 | **PENDING + 限制已记录**（§4.2） |

**阶段停止条件满足**：Native operation / Undo / Layer 均有真实证据（非 PENDING）；
仅 P1 Save/Reload 按 §二十六"已验证或明确记录限制"列为 PENDING，待真实登录验证回填。