# SESSION PARITY REPORT — P0 FONT PRINT

> 分支 test | HEAD 见 git log | 2026-09-18
> 目标：回答「为什么 Agent 会话 submitUserDesign.do 得 loginState:timeOut，用户真机会话可继续走交稿/核稿」。
> 敏感规则：本报告只记录字段**名称**，不含 cookie value / token / password。

## 1. 会话来源

| 项 | 值 |
|---|---|
| SESSION_SOURCE | MANAGED_PERSISTENT_PROFILE（`-adopt-session` 未发现可调试浏览器） |
| CDP URL | 未发现（P0_CDP_URL 未设置；默认端口 9222-9231 均无调试端点） |
| AUTH_CONFIGURED | true（凭据仅经环境变量注入，未入库） |

## 2. 环境指纹（MANAGED，脱敏）

| 项 | 值 |
|---|---|
| 登录浮层可见 | false（编辑页可匿名打开） |
| cookie 名称数 | 4 |
| localStorage 条目数 | 80 |
| sessionStorage 条目数 | 0 |

cookie 名称（脱敏仅名称）：略（详见 runtime/reports/p0/session-parity.json，只含 name/domain/path/secure）。

## 3. submitUserDesign.do 探测（多轮稳定）

| 会话 | 请求 | 响应 |
|---|---|---|
| MANAGED (profile-usc3，旧登录态) | POST /third/submitUserDesign.do | `{"result":true,"loginState":"timeOut"}` |
| MANAGED (全新 profile + 账号 17606256193 登录) | 同上 | `{"result":true,"loginState":"timeOut"}` |
| MANAGED (清 cookie 匿名) | 同上 | `{"result":true,"loginState":"timeOut"}` |
| REAL（用户真机） | 未接管（无 CDP），已知可继续交稿/核稿 | — |

## 4. 维度分析

| 维度 | 结论 |
|---|---|
| 页面账号登录 | **排除**：匿名/登录/全新 profile 三种状态 timeOut 一致；编辑页本身可匿名打开并完成 drawText |
| 账号身份 | **排除**：17606256193（真机号）全新 profile 仍 timeOut |
| 浏览器 profile 缓存 | **待验证**：接管真机浏览器（CDP）后才能对比其 cookie/存储/全局量 |
| 进入路径 / 商户上下文 | **高度怀疑**：真机进入 URL 链可能携带订单/商户参数（thirdOrderNo/orderId/accessToken 等），此判定的鉴权依据尚未定位 |
| 前置请求链 | **待验证**：REAL 前置请求序列 vs MANAGED 的差异需 CDP 抓取 |

## 5. 结论

- `loginState:"timeOut"` 是**会话上下文差异**导致，**不是产品缺陷**，也不可据此宣布 P0 根因。
- 已排除：登录态、账号身份。
- 待验证：进入 URL 链、cookie/存储状态、前置 API 序列 —— 必须通过 Real Session Adoption（connectOverCDP 接管真机浏览器）后对比。

## 6. 下一步

1. 用户以调试模式启动已登录 Chrome → Agent connectOverCDP 接管 → 执行 `--session-parity`（REAL vs MANAGED 指纹对比）+ `--submit-probe`（REAL 提交响应）。
2. REAL 若 submitUserDesign 非 timeOut → 完整链路（交稿/搜索同步/检查页/红框）自动执行，进入 Root Cause 判定。
3. 若进入路径是差异源 → 记录 REAL 进入 URL（脱敏 query 名）并复刻到 MANAGED 会话验证。