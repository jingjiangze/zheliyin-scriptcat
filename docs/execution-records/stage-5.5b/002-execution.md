# 002 执行记录 — 桥接根因修复与首轮回归（canvas 未就绪 → background-image 打通）

- 时间：2026-09-16
- 当前 branch：`demo`
- 关键 commit：`936dce4 fix: route ocr canvas access through page-bridge ...` / `49c7956 test: fix p1 diag ...`
- 执行目标：按 001-execution 的根因结论实施修复——隔离世界读不到 requirejs CanvasObjVO，OCR 画布访问全部改走 page-bridge；并含用户指令 §8（waitForCanvasReady 非固定 sleep）、§9（过早点击有明确 UI 状态）。

## 修改文件
- `extension/src/editor/page-bridge.js`：新增只读消息 `getCanvasInfo`（画布自检）与 `ocrPrepare`（目标图 active→背景图→首图解析 + element→toDataURL + 显示几何，含背景图居中兜底）；均不修改画布。
- `zheliyin-card-assistant.user.js`：删除隔离世界直读画布代码（resolveOcrTarget/extractImageDataUrl/getCanvasForSide）；新增 `bridgeCall()` 与 `waitForCanvasReady()`（Promise + 400ms 轮询真实 ready 信号，上限 30s）；`handleOcrImage` 改 async 桥驱动（过早点击 →「正在等待编辑器加载…」→ ready 自动继续）；`buildItemsFromOcr` 几何改自 `ocrPrepare.geometry`。
- `runtime/stage5-5b-p1-diagnose.js`：v2 重写（清理历史脚本消除双面板竞争 + 时序记录 + 场景 A 背景图/B 选中图/C 过早点击）。

## 测试命令
`node runtime/stage5-5b-p1-diagnose.js`（Playwright + 真实 ScriptCat + 真实 diy.zheliyin.com，profile-usc3）

## 首轮（v2）结果与失败
| 步骤 | v2 首轮 | 说明 |
|---|---|---|
| cleanup-old-scripts | removed=0（不阻塞，转为尽力而为） | getAllScripts 结构宽松匹配后重启 OK |
| panel-render / canvas-ready | PASS：panel@2207ms / canvas@3274ms | 时序证据 §6 |
| ui-ocr-btn-present | PASS：panels=1、ocrBtn=true | |
| scenario-A-bg-set | PASS：backgroundImage 900×1200，left/top=0 | §11 |
| **CANVAS_READY（桥）** | **PASS：`w=619.5x376.8625 objs=21 bg=true active=null`** | isolated world 经桥取到画布 |
| **ocrPrepare（桥）** | **PASS：`kind=background-image 900x1200 dataUrl=113330 chars`** | **§11 达成：背景图+无选中 → background-image（不是 IMAGE_UNAVAILABLE）** |
| LOCAL_LOADING | PASS：tesseract 引擎 66695 字符下载完成 | |
| 进程 | FATAL（测试脚本 bug） | `clickAndWait` 的 `seen.some(s => s.replace)` 中 s 是对象非字符串 → TypeError。**归类：测试 bug**，非实现 bug。已修复（读取 `x.s`）+ 重跑 |

## 修复（测试）
- `seen` 存 `{t, s}` 对象后，去重比较改用 `x.s.replace(...)`。
- cleanup 改用宽松正则匹配整个脚本对象 JSON，失败不计入 errors（尽力而为）。

## 重新测试
- v2.1 已在后台执行（场景 A/B/C + 时序 + 控制台证据）→ 结果见下一条执行记录 003。

## 待办
- P2 原生面板 DOM 审计（`runtime/stage5-5b-p2-panel-audit.js`，profile 释放后运行）。
- P3 Native Panel→Local→Textbox 真实 UI 触发闭环。
- 版本一致性、Demo URL 实存验证、Demo update 验证（§32-§34）。