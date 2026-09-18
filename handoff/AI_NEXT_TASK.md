# AI_NEXT_TASK.md — 下一步工作起点

> 新 AI 从这份清单开始。所有状态基于 2026-09-18 交接取证的“当前真实状态”。

## 当前状态横幅

```text
BRANCH:        test (v0.3.10.2)
WORKDIR:       D:\zheliyin-scriptcat
P0:            OPEN
REAL_OCR_PASS: PENDING
isDisplay:     STRONG_CANDIDATE（非最终根因）
Save/Reload:   PENDING（需真实登录回填）
```

## 建议执行顺序

### ① 环境核验（首日，约 10 分钟）
```powershell
cd D:\zheliyin-scriptcat
git status                                    # 期望 clean
git rev-parse HEAD origin/test                # 期望相等
node tests/editor-object-model/run.js         # 期望 13 suites PASS
Select-String -Path zheliyin-card-assistant.user.js -Pattern "@version|@require.*\?v="  # 期望全 0.3.10.2
```

### ② P0 复验（不猜根因，先跑）
1. 用 `MANAGED_PERSISTENT_PROFILE`（`runtime/browser/profile-usc3`）启动：
   ```powershell
   node runtime/p0/runner.js --from-proof        # 若已有对象；否则全流程
   ```
2. 关注 `runtime/reports/p0/{run-summary,proof-result,suspect-object,submit-probe}.json`。
3. 若 `loginState:timeOut`：先解决会话（relogin / 缩短运行时 / 提交前检测），再谈闭环。

### ③ isDisplay=0 扩大样本
```powershell
node runtime/p0/runner.js --variant=display0     # 多次
```
- 目的：把 8/9 的样本扩到 ≥20，统计 producestate 分布；确认 1/9 的 `producestate:3` 是否偶发（网络/时序）而非系统性。
- 同时做一次 `--case-font-schema` 把 `isDisplay` 纳入 manual-vs-script 字段对照（当前 17 字段差异里没有 isDisplay —— 这是证据缺口，必须补）。

### ④ 核稿闸门观测修复
- `proof-result.json` 的 `beforeHegao/afterHegao=null`、`generatingHandled=0` —— 先修“观测/检测”，定位核稿弹窗触发时的真实请求/UI 特征，再判定成败。
- 规约：核稿流程 = 印刷 → 设计信息 modal → 订单 → 获取信息 → 作品名 → 用户名 → 确定 → 交稿 → 提交 → 核稿（搜索×4）。

### ⑤ 红框→对象映射（P0 根因锁定）
- `suspect-object.json` `located:false`：红框（`.text-error-check`）未映射到画布对象。
- 方法：按红框 bbox 与画布对象 bbox 求交候选；对候选做全字段 diff（含 isDisplay/resourceType/isComposite/isPreview/visitLevel/topEnable/lineHeight/font 系列）；输出结论表。

### ⑥ Save/Reload 回填（demo 线遗留）
- 需真实登录手动验证：OCR 创建 → 保存 → 刷新 → 对象是否恢复。命中后把结果回填 demo 线报告（PENDING→PASS/FAIL）。

### ⑦ 合流评估（可选）
- test 线 P0 的 drawText/字段策略与 demo 线 Stage 6.2 原生 drawText 管线（`extension/src/editor/page-bridge.js`）是否对齐；避免两线漂移。

## 铁律（延续）
- 小改动 → 验证 → 取证 → 独立 commit → push test；禁止 force push；不直接改 main。
- 失败先修观测链路，不猜根因；用户真机结果 > 旧 AI 结论。
- 凭据只用环境变量；证据入库前跑 secret 扫描。
- 每次运行前核对 @require 版本一致（防 ScriptCat 旧缓存）。