# AI_RUNTIME_MAP.md — 运行环境与依赖地图

> 新 AI 上手前必读。所有路径基于 `D:\zheliyin-scriptcat`。

## 1. 核心路径

| 项 | 值 |
|---|---|
| WORKDIR | `D:\zheliyin-scriptcat` |
| EDITOR_URL | `https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do` |
| PROFILE_PATH（默认） | `D:\zheliyin-scriptcat\runtime\browser\profile-usc3` |
| 备选 PROFILE | `D:\zheliyin-scriptcat\runtime\browser\profile-p0-fresh` |
| CHROME_PATH | Playwright `channel:"chromium"`（系统已装 Chrome/Chromium）；扩展需 `--enable-unsafe-extension-debugging` |
| NODE | 18+（PowerShell 可 `node -v`） |
| PLAYWRIGHT | `playwright@1.63.0`（已安装于 `node_modules`） |

## 2. RUNTIME DEPENDENCIES

- `node_modules/`：**本机资源，`.gitignore` 排除，不入库**。需重装时：
  ```powershell
  npm install   # 依赖见 package.json：devDependencies playwright ^1.63.0（无其他运行时依赖）
  ```
- `runtime/browser/`：Playwright persistent profiles（含登录态/cookie；**~MB 级，不入库**，`runtime/browser/profile*` 在 `.gitignore`）。
  - 新 AI 换机器后需重新登录一次，然后仍用 MANAGED_PERSISTENT_PROFILE 复用。
- `runtime/vendor/`：静态包采集/工具目录（`.gitignore` 排除，不入库）；如缺失可重新采集（见 project-history 或历史 harness）。
- `runtime/fixtures/`、`runtime/p0/fixtures/`：测试图（如 `ocr-test.png`，黑字白底横排文字）。

## 3. 浏览器/Playwright 启动方式（runner 内部，勿手工起）

```js
browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: false,
  ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
  args: ["--disable-features=DisableLoadExtensionCommandLineSwitch",
         "--enable-unsafe-extension-debugging"],   // 允许真实 ScriptCat 扩展运行
  viewport: { width: 1440, height: 900 }
});
// 注入必须在任何 goto 之前：window.__p0Net 网络/console 仪表
await browser.addInitScript(...);
```

- **不依赖用户手动开浏览器**；persistent profile 自含登录态。
- remote debugging：runner 默认不主动开 CDP URL（`disc.cdpUrl` 为 null 亦可）；需要 live attach 时参考 `runtime/browser-parity-external.js` 或 `runtime/attach.js` 的历史用法。

## 4. 仪表化（instrumentation）能力

- 网络：`window.__p0Net.reqs`（fetch/XHR，页面主世界 hook，脱敏 `[REDACTED]`，上限 400 条）
- 响应：`fetchR` 记录 status+body（脱敏）
- 控制台：`logs/errors`
- DOM：`mutations` 计数
- 全部随 run-summary 落盘

## 5. 打印流程（https://diy.zheliyin.com 站点结构）

```text
编辑器文档(thirdDiyAdd.do)
 → 抽屉核稿闸门(hegaoOk)
 → 印刷 → 设计信息 modal → 订单号 → 获取信息 → 作品名 → 用户名 → 确定
 → 交稿层 → 提交稿件(submitUserDesign.do) → 核稿（搜索×4）
```

## 6. 登录

- 环境变量（**值绝不入库**）：`P0_LOGIN_USER`、`P0_LOGIN_PASS`
- 登录态来源：`MANAGED_PERSISTENT_PROFILE`（推荐）→ 自动恢复 → 手动登录（≤2 次）
- 手动登录要求“真填”：focus → select → native setter → input → change → click login

## 7. 证据/产物目录

| 目录 | 内容 | 是否入库 |
|---|---|---|
| `runtime/reports/p0/` | P0 运行证据（run-summary/proof/suspect/control/submit/manual-vs-script/session-parity/resume-state/debug-print）| 是（screenshots*/dsc.log/env-probe 除外） |
| `runtime/reports/p0/ocr-runtime/` | OCR 全链路证据（raw/textblocks/create-items/object-A/B/D + 截图）| 是 |
| `runtime/reports/stage-6-2-*.json` 等 | 各阶段真机证据（demo 线）| 是 |
| `runtime/reports/screenshots*` | 敏感截图 | 否（`.gitignore`） |
| `docs/evidence/`、`docs/execution-records/` | 执行记录/审计 | 是 |

## 8. 其他已发现资产（本机）

- `installer/`：一键安装器（GitHub Actions 构建 exe，未入库产物在 release）
- `.github/`：CI 工作流
- 历史版本归档：`project-history/`（userscript 历史版本、ui-audit 档案、MIGRATION_REPORT）

## 9. 已知外部 URL

- 测试安装：`https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/zheliyin-card-assistant.user.js`
- Demo 安装：`https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js`
- 站点：`https://diy.zheliyin.com`