# Browser Parity Runtime Baseline Report

- Date: 2026-09-18
- Baseline: `test` HEAD `25af82c` (v0.3.9.0)
- Target editor: `https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`
- Type: 双端运行时对照（只读探针 + 最小可撤销 Native E2E），无生产代码改动

## 结论先行（使用边界）

> 在 Agent 内置浏览器（Electron 内核、独立会话）能停留在 252438 编辑器页面之前，
> **本项目编辑器侧开发默认使用 External Chrome**；Agent 浏览器只用于不依赖编辑器
> 运行时对象的外围验证。两套浏览器在「编辑器运行时层」当前**不可互换**。

| 场景 | Agent 内置浏览器 | External Chrome |
|---|---|---|
| 编辑器页面到达 | ✗ 被重定向到另一设计 | ✓ 稳定停在 252438 |
| CanvasObjVO / CanvasDiy / resolver | ✗ 未暴露 | ✓ 全部可用 |
| page-bridge RPC | ✗ 未安装 | ✓ probe/getCanvasInfo/ocrPrepare 正常 |
| Native drawText 创建 | ✗ 不可达 | ✓ 已验证 |
| Undo / Redo | ✗ 不可达 | ✓ 已验证 |
| Save / Reload | ✗ 不可达 | ⚠ PENDING（真实登录阻断） |

---

## 1. Agent 内置浏览器环境

- 引擎：**Electron 39（UA: `TRAESOLOCN/1.107.1 Chrome/142.0.7444.235 Electron/39.2.7`）** —— 不是项目外测用的标准 Chrome。
- 访问 252438 目标 URL 后**自动重定向**到另一个设计：
  `https://diy.zheliyin.com/diyWeb/third/20422507/23d9131914934ec386a592931e599fec/0/1/thirdDiyEdit.do`
  （`thirdDiyEdit.do` ≠ 目标的 `thirdDiyAdd.do`；设计 ID 20422507 ≠ 252438）。
- 重定向页：title「智能设计定制未来」、`readyState=complete`、`fabric=true`、`requirejs=true`；
  但 `CanvasObjVO`（requirejs defs 内）**未暴露**，`totalCanvasArray` 不可读。
- bridge：无法在 Agent 会话中安装（首次探针尝试注入失败，出现伪造 marker 的情况，结果不可信，按 UNVERIFIED 处理）。

## 2. External Chrome 环境

- 引擎：Chrome 153（UA `Chrome/153.0.0.0`），persistent profile `runtime/browser/profile-usc3`（已登录 252438 会话，profile 不入 Git）。
- 稳定停留在 252438 编辑器；编辑器运行时对象完整可用。

## 3. Runtime topology 对照

| 检查项 | Agent | External |
|---|---|---|
| 最终 URL 与目标一致 | ✗（重定向 20422507/thirdDiyEdit.do） | ✓（252438/thirdDiyAdd.do） |
| fabric | ✓ | ✓ |
| requirejs | ✓ | ✓ |
| CanvasObjVO | ✗（defs 未含） | ✓ |
| CurrentCanvas | 未验证 | ✓ |
| CanvasDiy | 未验证 | ✓ |
| canvasCount（totalCanvasArray） | ✗ 不可读 | 1 |
| 首画布对象数 | ✗ 不可读 | 9 |
| bridge marker | ✗（未真正安装） | ✓ |

## 4. Editor runtime 对照

External（证据：`runtime/reports/browser-parity-external.json`）：
- `totalCanvasArrayLength=1`、`currentCanvasNum=1`、`canvasPagesNum=0`
- `frontImgPathStr=true`、`backImgPathStr=true`（正/背底图业务字段存在）
- `objectCount=9`、`textboxCount=0`、类型分布 `{rect:1, line:8}`
- `hasDrawText=true`、`hasCanvasObjInfo=true`、`layerArrLen=1`
- 画布 619.5×376.86

Agent：因重定向 + CanvasObjVO 未暴露，编辑器运行时层 **UNVERIFIED**。

## 5. Bridge 对照

External（同一桥协议，生产 `page-bridge.js` 经 addInitScript 注入）：
- `probe` → ok，front/back 均 found，ctor=`b`，textObjects=0
- `getCanvasInfo` → ok（objs=9, textTotal=0, imageTotal=0, bgImage=false）
- `ocrPrepare` → `ok=false code=IMAGE_UNAVAILABLE`（模板无图片，符合预期，只读未改动画布）

Agent：bridge 未安装成功 → **UNVERIFIED**（阻断原因=会话重定向，非桥代码本身）。

## 6. CurrentPage 对照

- External：`currentCanvasNum=1`，resolver 依据 `currentCanvas-identity/currentCanvasNum` 可判定当前页（既有 7.1 证据 `runtime/reports/stage-7.1-runtime-forensics.json`）。
- Agent：不可判定（CanvasObjVO 未暴露）。

## 7. OCR 对照

- External：`ocrPrepare` 链路可达（目标图解析 + resolver 当前页判定），本次模板无图片返回 IMAGE_UNAVAILABLE 为预期只读结果；Cloud/Local 策略判定属既有 7.2 单测范畴（VM 沙箱），与浏览器环境无关。
- Agent：OCR 目标准备链路 **UNVERIFIED**。

## 8. Native Create 对照

External（parity-native-probe + 既有 3 对象测试 `stage-6-2-ocr-create-native-test.json`）：
- ocrCreate → `mode=native`、createdCount=1（标记文字 `PARITY-PROBE-*`）
- 对象进入当前画布、注册进 `canvasObjInfo.canvasToProductObjArr`、带 `multiUuid`，类型 `textbox`
- 最小可撤销闭环全部通过（见下节）

Agent：不可达 → **UNVERIFIED**。

## 9. Undo 对照

External：
- parity probe：`.undo`（jQuery visible + trigger，复用既有已验证方式）点击 2 次 → 对象移除，画布 10→9、图层 2→1，`undoRemoved=true`
- 既有 3 对象测试：Create→Layer→Undo×2→Redo×2→编辑边界钩子→清理，全部 PASS（metrics 全 true）

Agent：不可达 → **UNVERIFIED**。

## 10. Save / Reload

- External：`stage-6-2-save-reload-probe2.json` —— 点保存仅触发订单前置检查 `IfDiyOrderidExit.do`（无写库请求），刷新/清缓存后对象均不恢复。
  **结论 PENDING**：服务端持久化需真实登录账号在编辑器内保存；自动化无登录 profile 无法确认（红线：不伪造登录、不改业务代码绕过订单校验）。
- Agent：不可达 → N/A。

## 11. 实际差异清单

1. 引擎：Electron 39（Chrome 142 core）vs Chrome 153 —— 渲染/运行时基线不同。
2. 会话：同 URL 在 Agent 中被重定向到不同设计 → 编辑器运行时对象不可复现。
3. Agent 浏览器 `browser_evaluate` 对「异步 IIFE 返回对象」支持不佳（返回 undefined，需改写为单表达式返回 JSON.stringify）—— 工具链限制，影响未来 Agent 侧探针写法。

## 12. 差异分级

- **BLOCKER**
  - 会话重定向：Agent 无法停留在 252438 编辑器页面
  - CanvasObjVO / CurrentCanvas / CanvasDiy 在 Agent 中不可达（编辑器运行时层不可复现）
  - bridge 无法在 Agent 会话安装/验证
  - 引擎不同（Electron vs Chrome）
- **WARNING**
  - Agent `browser_evaluate` 异步对象返回限制（探针写法需兼容）
- **IGNORE**
  - UA 字符串本身、随机 uuid、时间戳、对象地址

## 13. 以后哪些测试只跑 Agent

- 不依赖真实编辑器 session 的外围逻辑：userscript/extension 纯 JS 单测（VM 沙箱）、字段解析、AI 客户端、config/field-core、OCR 模块单测（candidate/fallback/baidu 在 VM 内，与浏览器无关）。
- 简单 DOM/UI 行为（非编辑器页）。

## 14. 哪些场景必须 External Chrome

- 进入真实编辑器（252438 或同会话设计页）
- CanvasObjVO / CurrentCanvas / CanvasDiy / Current Page Resolver
- page-bridge RPC（probe / getCanvasInfo / ocrPrepare / ocrCreate / apply）
- Native drawText 创建、图层、Undo/Redo
- Save / Reload、登录态、GM/ScriptCat 环境、extension injection
- 任何涉及编辑器运行时对象的生产改动回归

## 证据文件

- `runtime/parity-core-probe.js` / `runtime/parity-native-probe.js` —— 双端共用探针表达式（逐字节一致）
- `runtime/browser-parity-external.js` —— External 侧 runner（复用 profile-usc3 + addInitScript 注入生产 bridge）
- `runtime/reports/browser-parity-external.json` —— External 侧完整探针证据
- `runtime/reports/stage-6-2-ocr-create-native-test.json` —— 3 对象 Native E2E（External）
- `runtime/reports/stage-6-2-save-reload-probe2.json` —— Save/Reload PENDING 证据（External）
- `runtime/reports/stage-7.1-runtime-forensics.json` —— 7.1 Current Page 真机取证（External）

## 遗留

- Stage 7 验证报告（`docs/stage-7-validation-report.md`）尚未产出，待后续提交补齐。
- **第二轮（Session Alignment）结论已定：`AGENT_SESSION_ALIGNMENT = BLOCKED`** ——
  Agent 会话（已合法登录）访问 252438 恒定重定向 `20422507/thirdDiyEdit.do`，原因为账号/设计权限的
  会话绑定（与 Electron 无关）；Agent 侧 252438 编辑器运行时层仍不可对照。
  详细证据与 CDP 接管调查见 `docs/AGENT_BROWSER_CDP_REPORT.md`。
- 待 Agent 获得有 252438 权限的账号会话后，可重跑双端 core/native 探针，补全编辑器运行时层对照。
