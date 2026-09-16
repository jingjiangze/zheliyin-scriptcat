# 001 执行记录 — P1 根因确认（画布未就绪 / canvas not ready）

- 时间：2026-09-16
- 当前 branch：`demo`
- 当前 commit（本记录时）：`4e075ed docs: stage5.5b real machine test checklist + product report skeleton; test: fix p1 diag report scoping`
- 执行目标：调查真实 editor 中「识别图片文字」点击后提示「画布未就绪，请等待模板加载完成」的根因（用户指令 §6-§9：先调查时序，不直接改 OCR）。

## 背景（已归档历史）
- Stage 5.5A-R2 已证明：页面世界 executor 内 Tesseract 可运行（首次 2969ms / 缓存 667ms），识别→重建→回滚 PASS。
- 历史"点按钮无反应"根因（5.5B P1 首轮）：`bindPanel()` 绑定模板中不存在的 `#zy-probe` → 提前抛 TypeError → `#zy-ocr-btn` 从未绑定。已修复（恢复诊断按钮 + 防御性绑定，commit c129853）。
- 修复后真机新现象（本次调查对象）：点击后出现明确状态「画布未就绪」，console `[zy-ocr][ERROR] canvas not ready` —— 说明按钮已绑定、handleOcrImage 已执行，是 `getCanvasForSide("front")` 返回 null。

## 测试命令
`node runtime/stage5-5b-p1-diagnose.js`（Playwright + 真实 ScriptCat + 真实 diy.zheliyin.com 编辑器，profile-usc3）

## 证据（完整见 docs/evidence/stage-5.5b/stage5-5b-p1-diagnose-report-v3.json）
| 检查点 | 结果 |
|---|---|
| install-userscript | PASS（status=1） |
| panel+canvas-ready（main world 轮询） | PASS：canvas 619.5×376.86 / 21 对象 / 3 image / panel 存在 |
| ui-ocr-btn-present | PASS：panels=1、ocrBtn=true、probeBtn=true、statusNode=true |
| scenario-A-bg-set（main world） | PASS：backgroundImage 设置成功，element=IMG，naturalWidth=900，left/top=0 |
| **scenario-A-reacted（点击，#zy-ocr-btn）** | **FAIL：status=[「画布未就绪，请等待模板加载完成」]** |
| scenario-B（选中图点击） | FAIL：同样「画布未就绪」 |
| console | `[zy-ocr][ERROR] canvas not ready` ×3 |
| pageErrors | `window.closeSocket is not a function`、`Mismatched anonymous define() module`（编辑器自身/AMD 噪音，与本问题弱相关） |

## 根因分析（结论）
- 同一时刻、同一表达式（`req.s.contexts._.defined.CanvasObjVO … totalCanvasArray[0].canvas`）：
  - **main world（Playwright evaluate）→ 可见，返回真实 canvas**
  - **isolated world（ScriptCat 用户脚本沙箱）getCanvasForSide() → null**
- 即：**画布对象本身一直存在，不是"编辑器未加载完"的时序问题**；真正问题是 **隔离世界无法看到页面世界 requirejs 模块注册表里注入的 CanvasObjVO 条目**。这与 5.5A 已记载的既定事实一致：「isolated world 读不到 page world 新注入全局 → 必须走 postMessage/DOM attr 桥」。
- 现有设计已经为页面世界能力搭了桥：`pageBridge`（probe / apply / ocrCreate 均通过 `window.postMessage` 在页面世界执行）。因此正确修法不是修 OCR 核心，而是**把"取画布/取目标图"也走 page-bridge，由页面世界返回**（新增 `getCanvasInfo` / `ocrPrepare` 两个只读消息），并同步实现用户指令要求的 `waitForCanvasReady`（事件/轮询 Promise，非固定 sleep）与情况 B「正在等待编辑器加载…」UI 状态。

## 失败归类
- 实现 bug（隔离世界取不到画布 → 集成层缺桥），**不是** OCR 核心 bug，**不是**测试 bug。

## 修复计划（后续执行记录跟进）
1. `page-bridge.js` 新增消息：`getCanvasInfo`（只读自检：尺寸/对象数/textTotal/bgImage/active）与 `ocrPrepare`（解析目标图 active→background→first，页面世界提取 element→toDataURL，返回 kind/dataUrl/宽高/几何）。
2. userscript：`waitForCanvasReady()`（Promise + 400ms 轮询，上限 ~30s，非固定 sleep）；handleOcrImage 改为 bridge 驱动；buildItemsFromOcr 几何来自 ocrPrepare 返回，不再直读 isolate world 对象。
3. 诊断脚本改为：情况 A（正常加载）+ 情况 B（过早点击 → 「正在等待编辑器加载…」→ 自动继续）。
4. 重跑真机诊断，逐项记录。

## 下一步
见 002-execution.md（bridge 实施与回归）。