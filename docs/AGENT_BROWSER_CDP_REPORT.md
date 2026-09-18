# Agent Browser CDP 接管调查报告

- Date: 2026-09-18
- Baseline: `test` HEAD `25af82c`（v0.3.9.0）
- 仓库：`jingjiangze/zheliyin-scriptcat`
- 本轮性质：纯调查，**生产代码修改 = 0**（未触碰 OCR / 生产逻辑 / runtime 现有探针）
- 结论：**AGENT_CDP = UNAVAILABLE**

## 结论先行

Agent 内置浏览器（TRAE SOLO CN，Electron 39）**未暴露任何 CDP endpoint**：

- 16 个 `TRAE SOLO CN.exe` 子进程的启动参数中**均无**
  `--remote-debugging-port=` / `--remote-debugging-address=` / `--remote-debugging-pipe=`；
- 全系统扫描（含 Google Chrome / Microsoft Edge）**无任何进程**携带 remote-debugging 参数；
- TRAE 唯一本地监听端口 `127.0.0.1:51000`（PID 30776，NativeExtensionService 内部服务）
  非 CDP：`/json/version` 返回「服务器提交了协议冲突」，不是 DevTools JSON 端点；
- 常见 CDP 端口 `9222 / 9223 / 9229 / 9333 / 51001 / 51002` 全部无监听。

因此 Playwright `chromium.connectOverCDP()` 接管 **不可行**。
且本任务红线禁止：重启 Agent Browser、修改 TRAE 安装包 / 签名、注入第三方程序、绕过安全机制，
故不做进一步尝试，直接记录并转向第二方案评估。

---

## 1. Agent Browser 是什么内核

- **Electron 39.2.7**（Chromium 142.0.7444.235）
- UA：`TRAESOLOCN/1.107.1 Chrome/142.0.7444.235 Electron/39.2.7`
- 主进程 EXE：`D:\Work UP\TRAE SOLO CN\TRAE SOLO CN.exe`
- 子进程族：gpu / network / monitor / audio / crashpad / bdms / native-extension×2 /
  node(shared/fileWatcher/extensionHost×3) / renderer×2（app 内嵌浏览器运行在 Electron webview，
  不是独立可调试的 Chromium 进程树）

## 2. 是否发现 CDP

**否**。

- 所有 TRAE 进程命令行无 remote-debugging 三参数；
- extensionHost 子进程（PID 47260 / 45676 / 27796）带 `--experimental-network-inspection --inspect-port=0`，
  这是 VSCode 扩展宿主的 **Node.js（V8）inspector**（端口随机），用于 Node 进程调试，
  **不是页面 CDP**，且不对外暴露 WebContents 控制能力。

## 3. CDP endpoint

**无**。唯一 TRAE 监听端口：

```
127.0.0.1:51000  (PID 30776, NativeExtensionService)
```

`http://127.0.0.1:51000/json/version` → 非 HTTP 协议响应（协议冲突），非 DevTools endpoint。

## 4. Playwright connectOverCDP 是否成功

**未执行**（无 endpoint 可连）。在无 `--remote-debugging-port` 的前提下不可行。

## 5-8. screenshot / click / evaluate / DOM（经 CDP）

**全部不可行**（无 CDP 通道）。Agent 内置浏览器目前只可通过 TRAE 自身的 browser_use
原生工具链（navigate / evaluate / screenshot / click）黑盒控制，而非 Playwright 直连。

## 9-11. 当前编辑器 / CanvasObjVO / CanvasDiy 可达性（CDP 视角）

经 CDP：**不可达**（无通道）。

补充（TRAE 原生链路，非 CDP）：Agent 内嵌浏览器能正常打开页面并执行 JS，
上一轮证据表明可停留在 20422507 编辑器，且 requirejs defs 内 `CanvasObjVO` 可达
（`totalCanvasArrayLen=2`、`currentCanvasNum=1`、`drawText` 存在）——
但这是 TRAE 工具链能力，与 CDP 无关，且 252438 上下文不可达（见 §Session Alignment）。

## 12. 与 External Chrome 的实际差异

| 维度 | Agent 内置浏览器 | External Chrome |
|---|---|---|
| 引擎 | Electron 39 / Chrome 142 | Chrome 153 |
| 控制链路 | TRAE browser_use 原生工具链（黑盒） | Playwright + persistent profile（白盒） |
| CDP | 无 | 无（Playwright 协议层，非页面 CDP） |
| 252438 编辑器 | 恒定重定向 20422507 | 稳定停留 |
| CanvasObjVO/CanvasDiy | 仅 20422507 上下文可达 | 252438 上下文完整可用 |
| page-bridge RPC | 未验证（252438 不可达） | probe/getCanvasInfo/ocrPrepare 正常 |
| Native drawText / Undo | 不可达 | 已验证 |

## 13. 哪些测试以后可交给 Agent Browser

- 不依赖真实编辑器 session 的外围逻辑：userscript/extension 纯 JS 单测（VM 沙箱）、
  字段解析、AI 客户端、config/field-core、OCR 模块单测（candidate/fallback/baidu，VM 内，与浏览器无关）；
- 简单 DOM / UI 行为（非编辑器页）：URL 到达性、DOM 结构、点击、截图。

## 14. 哪些仍然必须 External Chrome

- 进入真实编辑器（252438 或同会话设计页）
- CanvasObjVO / CurrentCanvas / CanvasDiy / Current Page Resolver
- page-bridge RPC（probe / getCanvasInfo / ocrPrepare / ocrCreate / apply）
- Native drawText 创建、图层、Undo/Redo
- Save / Reload、登录态、GM/ScriptCat 环境、extension injection
- 任何涉及编辑器运行时对象的生产改动回归

---

## Session Alignment 结论（Browser Parity 第二轮）

`AGENT_SESSION_ALIGNMENT = BLOCKED`

- 原因：**账号/设计权限的会话绑定**。252438 权限属于 External profile 的账号会话；
  Agent 会话（已合法登录）访问 252438 恒定重定向到 `20422507/thirdDiyEdit.do`，无法停留在目标编辑器。
- 与 Electron 无关：Agent 内 20422507 编辑器运行时正常（CanvasObjVO/CanvasDiy/drawText 可达）。
- 无需用户再登录：Agent 已处于合法登录态（能进入编辑器、非登录页）。
- 唯一解锁途径：提供**有 252438 权限的账号**在 Agent 浏览器内正常登录
  （用户未提供；禁止复制 External Cookie / Token，禁止伪造身份）。

## 第二方案评估（CDP 失败后的路径）

`Agent Native Browser Automation + External Playwright + 统一 BrowserAdapter`

- Agent 侧：继续使用 TRAE 内置 browser_use 工具链（navigate / evaluate / screenshot / click），
  定位为**黑盒视觉/UI 浏览器**；
- External 侧：Playwright + persistent profile 不变，定位为**白盒编辑器运行时浏览器**；
- 统一 BrowserAdapter：定义 `navigate/reload/click/fill/wait/waitForSelector/screenshot/evaluate/url/title`，
  让同一场景逻辑以 `--browser agent|external` 双端运行（本次未实现，属后续独立工作）；
- 注意：Editor Runtime 类场景（EDITOR_RUNTIME / BRIDGE / NATIVE_TEXT）在 Session Alignment=BLOCKED
  解除前只能跑 External；Agent 承担 OPEN_EDITOR（非 252438 上下文）与 OCR_UI 外围。

## 证据文件

- 进程扫描：16× `TRAE SOLO CN.exe`（PID 7424/42580/18368/26756/28020/42476/30776/23292/35172/11872/41164/26420/47260/45676/27796/47836），
  命令行（脱敏）均无 remote-debugging 参数；
- 全系统扫描：chrome.exe / msedge.exe 无 remote-debugging 参数；
- 端口探测：51000 → `/json/version` 协议冲突（非 CDP）；9222/9223/9229/9333/51001/51002 → 无监听；
- 相关既有报告：`docs/BROWSER_PARITY_REPORT.md`（第一轮 Runtime Baseline）、
  `runtime/reports/browser-parity-external.json`（External 全绿证据）。

## 遗留

- 若未来 TRAE 提供 `--remote-debugging-port` 或官方 CDP 开关，可重试本报告 §4-8；
- BrowserAdapter 统一场景框架可作为独立后续工作，前提是 Agent 可进入 252438 上下文；
- Stage 7 验证报告（`docs/stage-7-validation-report.md`）仍未产出。
