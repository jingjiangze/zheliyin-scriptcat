# REAL_RUNTIME_GUIDE.md — Playwright Real Runtime Harness 使用指南

> 本次 Stage 4.1 Final 配套：把"人工 DevTools 探针"替换为可重复的真实浏览器工程基础设施。
> 证据等级规范见 RUNTIME_HARNESS_AUDIT.md §二十七；禁止把 BLOCKED/MOCK 写成 REAL PASS。

## 依赖

```bash
# Windows 本机（已装）
node -v      # v24.19.0
npm -v       # 11.17.0
npx playwright --version   # 1.63.0（浏览器已通过 npx playwright install chromium 安装）
```

系统 Chrome/Edge 会被优先复用（`runtime/browser-launcher.js#resolveBrowserPath`），无需自带 Chromium。

## 初始化 profile（仅首次）

```bash
node runtime/full.js --expect-editor --headed
```

第一次运行会**打开有头浏览器**（dedicated profile，`runtime/browser/profile-full/`）：
1. 浏览器内打开编辑器 URL；
2. 出现登录页 → **人工完成一次登录**（验证码/2FA 场景属于允许的人工介入 §59）；
3. 登录后进入编辑器，本命令继续完成全量断言：
   `Browser → ScriptCat(extension 载体) → Panel → Bridge(marker/probe) → Canvas → Apply/Rollback`；
4. 结果写入 `runtime/reports/runtime-report.json`，失败自动截图到 `runtime/reports/screenshots/`。

> profile 含登录态 → 已入 `.gitignore`，**禁止提交**。
> 之后运行 `--expect-editor`（可加 `--headed` 或省略走 headless）会自动复用登录态。

## 命令

```bash
npm run runtime:check      # 冒烟：浏览器启动 + 门户可达 + 健康探针（无登录态）
npm run runtime:full       # 冒烟全链路：编辑态项标 BLOCKED，gate=CONDITIONAL-GO 属预期
node runtime/full.js --expect-editor            # 全量：需 profile 已登录编辑器
node runtime/full.js --expect-editor --headed   # 有头运行（便于观察/首次登录）
node runtime/attach.js --port 9222              # 附加当前已开浏览器诊断（需 Chrome 带 --remote-debugging-port）
```

## 分级输出说明

- `--expect-editor` 未登录 / 未到编辑态 → 相关层标 `BLOCKED`，**不判 FAIL**；
- 有真实证据的层单独标记证据等级：
  - `HEADLESS_REAL_BROWSER`（本机 headless 真实 Chrome）
  - `REAL_LOGGED_IN_EDITOR` / `REAL_BRIDGE` / `REAL_CANVAS` / `REAL_APPLY`
  - `REAL_SCRIPT_CAT`：仅当真实 ScriptCat 管理器完成注入时标记；当前 dedicated 环境以**本项目 MV3 extension**（同 `extension/src/*` 生产源码）为载体，属 `REAL_EXTENSION_SAME_SOURCE`，如实标注，不冒充 ScriptCat。

## 处理失败

1. 看 `runtime/reports/runtime-report.json` 中 `failures` 层名；
2. 按层定位：navigation / scriptcat-panel / bridge-marker / bridge-probe / canvas / apply；
3. 区分：产品 bug？测试 bug？环境（未登录）问题？站点变化（`SITE_RUNTIME_CHANGE`）？——只修真正属于代码的问题（§44）；
4. 修改生产代码前必须记录 finding、独立 commit、完整回归、push（§61）。

## 安全

- 报告自动脱敏（`COOKIE/TOKEN/PERSONAL_DATA_REDACTED`）；禁止输出 cookie/session/账号/二维码内容；
- profile、storage-state、screenshots 不入库（`.gitignore` 已配置）。