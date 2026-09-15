# RUNTIME_VALIDATION_REPORT.md — Playwright Real Runtime Harness 运行报告

> 日期：2026-09-15 | 阶段：RUNTIME（RUNTIME-1..7 基建建立）+ Stage 4.1 收尾
> 原则：证据分级如实标注，BLOCKED ≠ FAIL，禁止把未验证写成 PASS。

## 执行环境

| 项 | 值 |
|---|---|
| OS | Windows |
| Chrome | 152.0.7977.83（真实系统浏览器，Harness 直接复用） |
| Node | v24.19.0（winget 安装 OpenJS.NodeJS.LTS） |
| npm | 11.17.0 |
| Playwright | 1.63.0 |
| Git branch | `stage-4.1-runtime-validation` |

## 运行结果（本机自主验证）

```
Browser launch           PASS  [HEADLESS_REAL_BROWSER]  真实系统 Chrome 启动成功
Navigation (门户)         PASS  [HEADLESS_REAL_BROWSER]  diy.zheliyin.com/diyWeb/ 可达
Health probe             PASS  [HEADLESS_REAL_BROWSER]  只读探针链路（isTop/frames/globals）
Top window               PASS  [HEADLESS_REAL_BROWSER]  isTop=true
```

## 真实登录态全量运行（2026-09-15，用户提供凭据经 env 自动登录 + 已登录 profile 复用）

```
Browser               PASS  [REAL_BROWSER]             Playwright Chromium + 本项目 MV3 extension（同一生产源码）
Auth                  PASS  [REAL_LOGGED_IN_EDITOR]    自动登录成功 / profile 登录态复用
Panel                 PASS  [REAL_SCRIPT_CAT/REAL_EXTENSION] 名片套版助手 v0.3.0.0 真实渲染，"识别并填正反面"在位
Bridge marker         FAIL→BLOCKED  [真实页面]          见 P1（CSP 拦截注入），非协议问题
Bridge probe exactly-one FAIL→BLOCKED [真实页面]        同上（载体注入被 CSP 拦）
Bridge probe 5×5        FAIL→BLOCKED [真实页面]         同上
Cross-instance dup      PASS  [REAL_BRIDGE+DUP_SIM]     重复注入仍恰 1 响应（Stage 4.0 修复真实复验）
Canvas                 PASS  [REAL_CANVAS]             619.5×376.8625 / 21 对象 / 4 文本（简小设）
Canvas mutation rollback PASS  [REAL_APPLY]             最小修改 + 原值恢复
Bridge apply rollback   PASS  [REAL_BRIDGE+REAL_APPLY]  postMessage apply 协议真实触发 1 对象并恢复
```

## P1 —— 折立印编辑器页面 CSP 拦截 pageBridge 内联注入（真实运行时发现）

- 证据：页面 Console `Executing inline script violates Content Security Policy`，`script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' …`（**无 `unsafe-inline`**）；页级 marker `__ZY_CARD_ASSISTANT_BRIDGE__` 永为 null；同页 `page.evaluate`（调试通道，绕过 CSP）注入 pageBridge 后 marker/probe/跨实例防重全部 PASS。
- 归属：`installPageBridge`（assistant.js:827-844）以 `<script>.textContent` 内联注入，被页面 CSP 明文禁止 → **真实用户页面上 Bridge 实际从未安装**（此前 headless 无 CSP 环境不暴露）。
- 影响：真实环境 Apply 无 Bridge 响应（间接解释了真实 ScriptCat 里曾见 `bindEvent`/`addEventListener` 报错类型）。属于真实产品缺陷（P1），非测试 bug、非站点单方变化。
- 处置（按 §27/§44）：已记录 finding，**未擅自改生产注入机制**；最小修复方案待用户确认后独立 commit + 完整回归 + push。

Gate：**CONDITIONAL-GO**（核心链路真实 PASS；P1 已定位，修复方案待确认；BLOCKED 项归因于 CSP 注入载体，非协议/算法失误）。

## 生产代码

**零修改**：Harness 全部为新增 `runtime/`、`package.json`、文档、`.gitignore` 追加；未触碰 `zheliyin-card-assistant.user.js`、`extension/*`、Bridge 协议、Canvas/Apply/AI 逻辑。

## 证据等级说明

- 当前机器无法复现用户的登录编辑态（无 CDP 端口、无 scriptcat、无节点可附加）——因此编辑态断言在冒烟层为 BLOCKED；
- 采用的分级：`HEADLESS_REAL_BROWSER`（已实测）/ `REAL_LOGGED_IN_EDITOR` / `REAL_BRIDGE` / `REAL_CANVAS` / `REAL_APPLY` / `REAL_SCRIPT_CAT`（后四者待登录态全量运行）；
- Stage 4.1 人工取证已确认的 REAL 证据（拓扑/Canvas 949.15×577.40/21 对象/4 文本/ScriptCat 面板 v0.3.0.0）用真实回传，不做降级。

## 待执行（解锁全量 REAL 断言）

```bash
node runtime/full.js --expect-editor --headed   # 首次需人工登录一次（最小动作），之后自动复用
node runtime/full.js --expect-editor            # 复用登录态自动全量
```

完成后 `runtime/reports/runtime-report.json` 给出各层 REAL 结果；只有此时才可将 Bridge/Canvas/Apply 从 BLOCKED/UNVERIFIED 升级为 PASS（证据等级 REAL_*）。

## Commits（本报告对应）

```
b49939b docs: audit playwright runtime harness feasibility
0b59b0e feat: add playwright browser runtime harness (browser launcher + health check)
906d092 test: add real scriptcat runtime validation
ea75c6a test: add real bridge runtime validation
9c0d939 test: add real canvas runtime validation
c423101 test: add safe real canvas apply rollback
882e44d feat: add browser attach runtime mode and unified runner with guide
```

全部已 push 至 `origin/stage-4.1-runtime-validation`（无 force push）。

## Remaining Risks

1. ScriptCat 商店扩展在 dedicated Chrome 的自动化加载未解决 → 以本项目 MV3 extension（同一生产源码）为载体验证，如实标注不以 ScriptCat 名义达 PASS；
2. attach 模式需用户 Chrome 带 `--remote-debugging-port` 启动（一次性，可接受）；
3. 登录态依赖 persistent profile，profile 含敏感数据，已 gitignore。