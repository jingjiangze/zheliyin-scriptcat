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
ScriptCat (panel)        BLOCKED [N/A] 门户页无登录态，编辑面板不存在属预期（非 FAIL）
Bridge marker            BLOCKED [N/A] 未进入编辑页，bridge 未安装属预期
Canvas                   BLOCKED [N/A] 未进入编辑页，canvas 不存在属预期
Apply / Rollback         BLOCKED [N/A] 未进入编辑页，跳过（可恢复原则）
```

Gate（冒烟模式）：**CONDITIONAL-GO**（failures=0；blocked=5 均为"无登录态/编辑态"环境项，非代码失败）。

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