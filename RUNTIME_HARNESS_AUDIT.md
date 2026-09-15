# RUNTIME_HARNESS_AUDIT.md — Playwright Real Runtime Harness 可行性审计

> 日期：2026-09-15 | 阶段：RUNTIME-0（只审计，不改生产代码）
> 原则：以现有仓库真实代码/真实运行结果/真实 Git 历史为准，不凭推测。

## 1. 为什么用 Playwright

- 项目目标是驱动**真实浏览器 + 真实 ScriptCat + 真实 userscript + 真实 diy.zheliyin.com 编辑器**；
- Playwright（Node）原生支持 `launchPersistentContext`（持久化 profile → 一次登录后续复用）、`context.addInitScript`、`page.evaluate` 执行页面主世界脚本、`waitForFunction` 免 sleep 同步、对 **Chrome/Edge/Chromium** 一键支持（Windows）；
- 相比 Selenium：无需 WebDriver 二进制，安装简单（`npx playwright install`），内置等待语义，避免 `sleep` 硬同步；
- 相比裸 CDP：无需手写 WS 协议；且支持 attach 到已开的浏览器（`connectOverCDP`）。

## 2. 为什么不是 Selenium

- 无 WebDriver Server 依赖、跨浏览器驱动一致、维护成本更低；
- 本项目已有 headless Chrome 回归（tests/*.html via Chrome headless）作为 base，Playwright 可无缝替换该启动方式且更强。

## 3. 为什么要 persistent profile

- 真实登录态（验证码/2FA/Cloudflare）无法安全自动化 → 首次人工登录一次，之后 `launchPersistentContext(userDataDir)` 复现 session；
- profile 目录含 cookie/session → **必须 gitignore，禁止入库**。

## 4. 为什么要 attach

- 现状用户已在真实 Chrome 登录并运行 ScriptCat + 面板；`runtime:attach`（`connectOverCDP`）可对"当前已打开的浏览器"自动诊断，减少用户手工打开 DevTools/粘贴探针；
- attach 仅作为现场诊断工具，不作为唯一测试环境（正式回归走 dedicated runtime）。

## 5. ScriptCat 如何进入测试环境

优先级（§十一）：
1. **第一优先**：Dedicated Runtime 内真实安装 ScriptCat extension + 真实 userscript。ScriptCat 为 Chrome extension（`--load-extension` 可加载）或 stores 官方包；
2. 若 Playwright 无法直接管理 ScriptCat（extension 加载限制）：**真实加载本项目 MV3 extension**（`manifest.json`，`--load-extension` + fixed profile），同一份 `extension/src/*` 源码、同一 `assistant.js`——仍是**真生产代码**，唯一差异是注入载体（extension 而非 ScriptCat）；
3. 若都不行：controlled fixture，并**强制标记 `REAL_SCRIPT_CAT=false`**，不得冒充。

## 6. 真实 Canvas 如何验证

- 已在 Stage 4.1 人工取证：top window `requirejs` 138 模块、`CanvasObjVO/CurrentCanvas/CanvasDiy` 存在、`totalCanvasArray len=1`（949.15×577.40，21 对象，4 文本，首文本「简小袋」）、`fabric.Canvas` 构造器存在、`mattingContent` iframe 为无关占位；
- Harness 用**语义探测**（window globals + RequireJS `req.s.contexts._.defined` + fabric API），不依赖固定 className/webpack hash；
- RUNTIME-4 自动读 Canvas 尺寸/对象数/文本对象数并与 Stage 4.1 基准对照。

## 7. 环境现状（本机实测）

| 项 | 状态 |
|---|---|
| OS | Windows |
| Chrome | 152.0.7977.83（`C:\Program Files\Google\Chrome\Application\chrome.exe`） |
| Edge | 153.0.4234.32 |
| Node.js | **未安装**（winget 可用 → 计划 `winget install OpenJS.NodeJS.LTS`） |
| Python | 未安装 |
| CDP 端口 | 无（用户浏览器未开 remote-debugging → attach 需用户一次启动或后续配 port） |
| npm/package.json | 项目根**无 package.json**（tests 为独立 .html 自承跑）→ 需新增运行时 package.json（仅 runtime 依赖） |
| 现有回归 | `tests/*.html` 由真实 Chrome headless 直跑（上一阶段 ALL-PASS），保留不动 |

## 8. 安全与隐私约束

- `cookie / token / session / 完整 localStorage / 账号密码 / 二维码 / 完整个人信息` **禁止入库**；
- 报告自动脱敏：`COOKIE_REDACTED / TOKEN_REDACTED / PERSONAL_DATA_REDACTED / TEST_RUNTIME_VALUE`；
- `.gitignore` 至少追加：`runtime-profile/ playwright-profile/ storage-state/ *.session .cookies screenshots-private/ runtime/browser/profile/`；
- evolve：`runtime/reports/` 只存脱敏报告 + 必要截图（失败场景），避免仓库膨胀。

## 9. 已知风险

| 风险 | 说明 | 对策 |
|---|---|---|
| ScriptCat 为商店 extension，Playwright 加载受限 | MVP 先用 `--load-extension` 加载本项目 **extension**（同一生产源码）验证全链路；ScriptCat 专用验证作为后续 RUNTIME 扩展并**如实标记证据等级** | 分阶段，不阻塞 |
| 登录态不可自动获取 | 首次人工登录（`USER ACTION REQUIRED`，最小动作）→ persistent profile 复现 | persistent profile |
| 线上站点 DOM/JS 变化 | 不直接修改项目适配；记录 `SITE_RUNTIME_CHANGE`，先判"我方坏 vs 平台变" | 分层定位 |
| 自证陷阱 | 禁止测试代码自载生产代码、自注册 Bridge、自建 Canvas 冒充 editor | 证据等级强制标注 §二十七 |
| 证据等级混淆 | MOCK vs HEADLESS_REAL_BROWSER vs REAL_LOGGED_IN_EDITOR vs REAL_SCRIPT_CAT vs REAL_BRIDGE vs REAL_CANVAS vs REAL_APPLY 必须逐项写明 | 报告模板内置 |

## 10. 无法自动化的事项（如实）

- 首次登录、验证码、2FA、Cloudflare challenge —— 需一次人工完成；
- ScriptCat **商店版**在 dedicated 浏览器内的安装（若 `--load-extension` 对商店打包格式不适用）—— 如实标记 `REAL_SCRIPT_CAT=false` 或降级为 extension 载体验证；
- 用户个人电脑上"当前正在运行的浏览器"自动附加 —— 需用户配合启动时带 `--remote-debugging-port`（一次性动作）。

## 11. 实施计划（分阶段）

```
RUNTIME-0  Audit（本文件）                              → commit
RUNTIME-1  browser harness（launcher + persistent profile + navigation + health） → commit
RUNTIME-2  scriptcat runtime（userscript/panel 自动验证；版本受限时 extension 兜底） → commit
RUNTIME-3  bridge runtime（probe helper + exactly-one + 跨实例重复 + 畸形消息）  → commit
RUNTIME-4  canvas runtime（discovery + snapshot + introspection）                → commit
RUNTIME-5  safe apply/rollback（真实 Canvas 最小修改 + 恢复 + 回归）              → commit
RUNTIME-6  attach mode（连接当前浏览器诊断）                                    → commit
RUNTIME-7  统一报告 RUNTIME_VALIDATION_REPORT.md + runtime-report.json + Gate    → commit
```

命令约定（于根目录新增 package.json，仅 runtime 依赖）：

```json
"scripts": {
  "runtime:check": "node runtime/check.js",
  "runtime:full": "node runtime/full.js",
  "runtime:attach": "node runtime/attach.js"
}
```

## 12. 结论

**可行（CONDITIONAL）**：
- 真实浏览器（Chrome 152）本机可用；
- Playwright 可在 Windows 安装（需先装 Node LTS via winget）；
- 生产源码零改动前提下，可先以「本项目 MV3 extension + persistent profile」驱动真实编辑器验证 Bridge/Canvas/Apply；ScriptCat 造成的不确定性独立标记；
- 全部自主完成，除「首次登录 + ScriptCat 商店安装限制」外不请求用户人工探针。

**不阻塞项**：真实 AI 本阶段不测（§二十四）；CI 不强上（§三十三，Windows local 优先）。