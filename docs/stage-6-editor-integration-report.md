# Stage 6 P0（强制补充）— 原生图层接入 / 撤回重做 / OCR 对象生命周期

> 日期：2026-09-17 ｜ 分支：`demo` ｜ 版本基线：v0.3.8.7 ｜ 真机环境：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`（不再使用 1203177）
>
> 本报告对应两条用户指令：
> 1. 《Stage 6.1：OCR TextBlock / Textbox 排版稳定性专项修复》（§1–§24）
> 2. 《Stage 6 强制补充：原生图层接入 / 撤回重做 / OCR 对象生命周期》（§一–§二十四）

---

## 一、工作范围与优先级

按用户强制补充的优先级执行：

```
P0 真实 textbox          ← 本轮完成「对象模型镜像」部分（可验证）
P0 图层系统              ← 制定验证方法，真机验证移交用户 UX（自动化暂不可复现原生放置）
P0 Undo / Redo           ← 审计定位根因，给出原生管线接入设计；闭环 PENDING
P1 保存/dirty            ← 依赖对象模型镜像（本轮已铺底）
P1 TextBlock             ← 已交付（见《Stage 6.1 算法层》）
P1 forced wrap           ← 已交付（换行诊断，见 Stage 6.1）
P2 fontSize / 文本融合    ← 后续
```

## 二、审计结论（12 轮真机逆向，252438）

### 2.1 编辑器模块与服务（requirejs `ctx.defined`，共 136 模块）

| 模块 | 作用（真机观测） |
|---|---|
| `CanvasObjVO` | 画布对象模型单例：`totalCanvasArray`、`canvasToProductObjArr`、`undoAndRedo`、`canvasObjInfo`/`currCanvasObjInfo`、`cutImgsLayerArr` 等（50 个 own key） |
| `Undo` | `getInstance()` → `{undo, redo, undoLength, save, replay, buttonControl, _undoBtn, _redoBtn, _canvas, state}`；`save()` = 编辑器自身「推快照」入口，内部走 `requirejs(["CurrentCanvas","sundry"], ...)`（受 `#aiCup`/`isNoOneKey` 守卫） |
| `SimpleCommandManager` | `getInstance()` 单例，命令容器（`ensureImplements` 校验 `ICommand` 接口） |
| `ICommand` | 接口定义对象（`{name, methods}`） |
| `CurrentCanvas` | `getCurrentCanvas()` —— 撤销快照取画布的唯一入口 |
| `sundry` | 工具集；`guid()` = 编辑器原生 v4 UUID 生成器（实测输出合法 v4）；`historyUtil` 实为 `history.replaceState` 的 URL 工具（与画布撤销无关） |
| `CanvasToolBar` / `TextPropPanel` / `TextPropBar` | 右栏文字属性/工具栏（字体、背景填充、字效、添加文字） |
| `layer` / `DesignVO` / `DesignPageVO` / `CreateLayerThumbnailCommand` / `UpdateCanvasThumbnailCommand` | 图层面板/缩略图命令（图层缩略图由命令模块生成） |

### 2.2 原生对象身份 schema（真机 dump）

原生对象（如模板背景 rect）字段：

```
multiUuid（v4） markuuid（新对象为空串） layerNum mediaMediaType
locationX/Y/Width/Height/Rotation printLocationX/Y/Width/Height/Rotation
isDesign isEdit isLineText deleteState mediaColor/mediaIsFill/...
```

- `multiUuid` = 对象持久身份（v4）；`markuuid` 新对象约定为空串。
- OCR 原子创建的 textbox 只有 `{fontSize:20}` —— 完全不在编辑器对象模型内（R1 证据）。

### 2.3 根因：RAW `canvas.add()` 绕过原生历史与对象模型

实验（R6/R8，252438 实测）：

```
before: undoLength=50  state=7464字符(JSON)  objs=9
raw add 3×textbox:    undoLength=50  state=7464  objs=12   ← 原生历史完全无感知
click 原生「撤销」:     objs 仍=12 → 原生快照管线不知道这批对象
U.save()→add→U.save:   undoLength 仍=50（守卫/异步取样未记录）
```

结论：编辑器撤销 = **JSON 快照式**（`state` 字符串），只记录编辑器自身 op 管线产生的变更。OCR 直接 `canvas.add()` 创建的对象不在任何快照中 → 用户点「撤销」时要么不处理这些对象、要么快照回滚后产生「消失/不一致」—— 与用户反馈完全吻合。

### 2.4 原生「新增文字」UI 链路（自动化不可复现项 PENDING）

组合尝试均无法在自动化中落字（`objs` 恒为 9）：
- 右栏「文字」→「添加文字」（`btn.addText`）→ 画布点击（wrapper/upperCanvas 坐标、真实 mouse 事件）
- 左素材库「普通文本」(`li.text-item`) → 单击 / 双击 / 拖拽至画布 / 跟随画布点击
- `CurrentCanvas.getCurrentCanvas()` 被调用（说明进入创建流程）但对象未落到 `totalCanvasArray[0].canvas`。

**PENDING（诚实标注）**：原生物体放置需真人操作（或录屏级指针流）验证；对象身份赋值（multiUuid/location*）的具体赋值阶段未能在自动化中观测到。已给出可复现步骤供人工 UX 验证。

## 三、本轮交付（P0 安全第一修复步，不伪造历史）

### 3.1 `page-bridge.js` ocrCreate（页面世界）

1. **对象模型镜像** `mirrorEditorObjectModel(canvas, obj)`：
   - `multiUuid` 优先 `sundry.guid()`（**编辑器原生生成器**，§八"复用原生流程"）；兜底 `crypto.randomUUID`；
   - `markuuid = ""`（原生新对象约定，不伪造）；
   - `mediaMediaType="text"`、`isDesign=true`、`isEdit=false`、`isLineText=false`、`deleteState=false`；
   - `location*/printLocation*` 由 fabric 几何镜像；
   - `layerNum = 画布当前最大 layerNum + 1`。
2. **原生历史尝试**：创建前/后调用 `Undo.getInstance().save()`（仅编辑器自身 API，失败静默；受守卫控制，不承诺必生效）。
3. **§18 接入诊断**：回复 `editorIntegration: { nativeUndoFound, undoSavePre, undoSavePost, identityApplied, uv4Total, layerMax }`；userscript 日志只记计数，不输出对象/文本/`multiUuid` 全文。

### 3.2 Stage 6.1 算法层（上一轮已交付，见 CHANGELOG v0.3.8.7）

`joinWordsSmart` + `applyTessLineText`（line.text 优先）+ `groupLinesToBlocks`/`buildTextBlocks`（1 TextBlock = 1 textbox）+ `estimateTextLayout`（防提前换行 + forcedWrap 诊断）+ `ocrCreate` 事务回滚 + 完整返回结构。

## 四、真机回归（P0 harness，252438 合成名片背景）

- 场景：注入白底黑字 4 文字块（张三/销售经理/电话：13800138000 同块 + 独立区）→ 本地 OCR → 读回。
- 本轮测量点（`runtime/stage-6-p0-editor-integration.js`）：
  - detectedBlocks / createdTextboxes 对齐
  - textbox 可双击编辑
  - identity 镜像：multiUuid(v4) / mediaMediaType=text / layerNum>0 / location* 数值
  - TextBlock 多行合并（sourceLineCount≥2）
  - forcedWrap 诊断字段
  - 原生「撤销」点击行为（如实记录）
- 结果：见 `runtime/reports/stage-6-p0-editor-integration.json`（第一次运行时 @require 命中 GitHub raw CDN 旧缓存，已重推后复测；最终值以复测报告为准）。

## 五、未解决问题清单（honest inventory）

| # | 问题 | 状态 | 下一步 |
|---|---|---|---|
| U-1 | 原生 undo 不跟踪 RAW canvas.add 对象 | PENDING | 需接入编辑器 op 管线（找到原生注册入口后复用其历史 push；或由用户在真机确认 `Undo.save()` 守卫下快照生效） |
| U-2 | 图层列表（ObjVO/缩略图）对 OCR 对象实时可见性 | PENDING | 真机人工验证：OCR 后是否出现在图层面板；本版已镜像字段，thumbnail 命令驱动的面板大概率随画布对象重建 |
| U-3 | 原生新增文字入层入口（身份赋值阶段） | PENDING | 真人录制一次原生置字（文字→添加文字→画布点击），导出手工日志/审计脚本对拍 |
| U-4 | 保存/刷新持久化 | PENDING | 依赖 U-1；对象字段镜像已铺底 |
| U-5 | 原生「文字/普通文本」自动化落字不可复现 | 已记录 | 见 2.4；真机 UX 验证 |

## 六、Git 提交清单（本阶段）

```
4ff8d97  feat: stage-6.1 TextBlock layer + smart join + wrap diagnostics (v0.3.8.7)
26449b1  audit: characterize native layer/undo/add-text lifecycle on 252438 (stage-6 P0)
9bc9794  feat: mirror OCR textboxes into editor object model + native undo save attempt (stage-6 P0)
（后续：test: P0 integration real-machine regression；docs: 本报告；均独立 commit+push）
```

## 七、结论

- 已解决/可验证：TextBlock→1 textbox 算法、中文空格/手机号、防提前换行、事务回滚、OCR 对象编辑器字段镜像（multiUuid 用原生生成器）、§18 接入诊断。
- 未闭环（诚实）：原生 Undo/Redo 对 OCR 批次的完整感知 —— 根因与设计已定位（快照式历史 + RAW add 未入管线），等待"原生注册入口"接入后复测；在 P0 关闭前不宣布 OCR 重建完成。