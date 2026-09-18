# P0 FONT PRINT — Root Cause Report

> 状态：P0_FONT_PRINT = **PASS（managed 服务端证明）**；真机 REAL 会话最终确认待用户验证
> 分支：test（含生产修复 9081201） | 更新：2026-09-18（本轮突破）
> 结论先行：**根因 = OCR 文本对象 `isDisplay=1`（原生对象为 false）。** 置 `isDisplay=0` 后服务端核稿稳定通过。

---

## 一、FACT（已证实）

| # | 事实 | 证据来源 |
|---|------|---------|
| F1 | 点击印刷后弹「自动核稿失败提醒」可稳定复现（文案：生产文件与设计稿不一致…素材缺失或位移、文字换行或字体字号有误） | runner 多轮 + 服务端 resp |
| F2 | `submitUserDesign.do` 首发恒 `{"result":true,"loginState":"timeOut"}`；该 timeOut 与账号登录解耦（F3） | net resp |
| F3 | `userLogin.do` 成功与提交 timeOut 解耦 | relogin-v2~v4 |
| F4 | 登录浮层自动填充 env 凭据 + 点击「确定」可登录 | ensureLogin 修复后 login-clicked ok:true |
| F5 | 正确流程 = 先点「核稿」（验证弹层）→ 订单号输 1 → 点「印刷」→ 设计信息作品名/用户名 → 确定 → 交稿 → 搜索同步 | 用户确认 + runner 已验证（hegao-verify ok） |
| F6 | 印刷核稿页需点「搜索」（`.icon.icon-search.inputorderno`/`.search-btn`）同步核稿结果 | 用户确认 + v6/v7 |
| F7 | 「印刷稿件生成中」弹层需确认/关闭 | 用户确认 |
| F8 | Manual(addText) vs Script(drawText) schema 差异（typeof+值）：详见表 2 | case-font-schema + 服务端 getImgInfos 快照 |
| F9 | 服务端 `getImgInfos.do` 回写：脚本文本对象**未丢失**（uuid=d7c4de10，font id=556 完整存在）→ 排除「对象被删」 | 2026-09-18 getImgInfos capture |
| F10 | 556 思源黑 Regular 在 findAllFont.do（287 字体）合法 | stage-7-3-font-inventory |
| F11 | 服务端核稿可直接在 managed 会话验证（imgPreviewSearch.do → producestate/errInfo），无需 REAL 会话；站点侧会在 submit timeOut 后自动重登录（~40s） | 本轮多轮 net resp |
| F12 | **服务端单变量核稿实验矩阵（font 固定 556, 其余字段脚本默认）**：

| 变量 | 改动 | imgPreviewSearch 判定 |
|---|---|---|
| （旧默认） | isDisplay=1 | 9× ERR_AUTO_CHECK（第1页） |
| resource1 | resourceType 0→1 | 1× ps1 + 8× ERR（FAIL） |
| composite1 | isComposite 0→1 | 1× ps1 + 7× ERR（FAIL） |
| preview1 | isPreview 0→1 | 1× ps1 + 6× ERR（FAIL） |
| display0 | **isDisplay 1→0** | **1× ps3(生成中) + 8× ps1 success（PASS）** |
| （修复后默认） | isDisplay=0 | 1× ps3 + 8× ps1 success（**PASS**，0 ERR） | | runner --variant=* 前台实验（control-result.json） |

## 六、环境准入（自动化 vs 真机）

- 自动化可达：编辑器、drawText 创建、核稿（验证+重试）、订单号、印刷、设计信息、确定、登录浮层检测、站点自动恢复等待（≤30s）→ 手动登录重建全流程（≤2 次）、交稿、搜索同步、服务端核稿判定（imgPreviewSearch）、去检查、canvas 红框扫描。
- 自动化不可达（仍未取）：真实交稿终态确认、红框对象级定位（check 页无 canvas，服务端 ErrItemUUID 恒空）。
- 结论：**managed 会话已足以判定根因与验证修复**；真机 REAL 会话仅剩最终人工确认。

## 六之二、REAL vs MANAGED 会话结果（2026-09-18）

| 状态 | 值 |
|---|---|
| SESSION_SOURCE | MANAGED_PERSISTENT_PROFILE（`--adopt-session` → CDP_NOT_AVAILABLE） |
| REAL_SESSION_RESULT | NOT_ADOPTED（无调试 Chrome） |
| MANAGED_SESSION_RESULT | 站点自愈后可到达核稿：submit 首发 timeOut → 自动重登录 → 二发成功 → imgPreviewSearch 判定 |
| USER_LOGIN | PASS（env 凭据自动登录成功） |
| SUBMIT_AUTH | 首发 timeOut；**站点自动重登录/手动登录后可提交**（不再视为硬闸门） |
| PROOF_PAGE | **REACHABLE（managed）** |
| OCR_TEXT_PROOF | **PASS（managed 服务端，修复后）** |

## P0 判定（本节起）

- **OCR_TEXT_PROOF = PASS**：服务端核稿 8× `success/producestate:1`，0 次 ERR_AUTO_CHECK，无「自动核稿失败」弹层（修复后）。
- **ROOT CAUSE 已定（服务端单变量证明）**；生产修复已提交 test（9081201）。
- 待办：真机（REAL 会话 or 用户实际运行 test 分支脚本）最终确认同判 PASS。

## 二、OBSERVATION（已归因）

- 所有「值反向」都被单独排除（resourceType/isComposite/isPreview）；**唯一决定成败的是 isDisplay**。
- 原生对象（addText/模板 shape）isDisplay=false，脚本置 1 → 生产/设计比对触发 ERR_AUTO_CHECK（第1页）。
- 服务端 ErrItemUUID/errShotScreens 恒空——服务端不给对象级定位，故必须用单变量实验定位。

## 三、HYPOTHESIS（已判定）

- **H1 → 证实并收窄为 isDisplay**：字段值域 demo 系列其余项均被单独实验排除（H1.1 关）。
- H2（uuid=undefined 无效素材）**排除**：模板 shape 服务端 uuid 即 "undefined" 且正常通过。
- H3（字体 556 非法）**排除**：font 固定 556 下 display0 通过。
- H4（核稿同步时机）排除：同轮多次搜索判定稳定。

## 四、ROOT CAUSE（已确定）

**`isDisplay=1`**。脚本 drawText entry 及 post-create 字段将文本对象置 `isDisplay=1`，而原生对象为 `false/0`。服务端核稿将第 1 页判为「生产文件与设计稿不一致」（ERR_AUTO_CHECK）。修复：`extension/src/editor/page-bridge.js` `buildTextMediaEntry` `isDisplay:1 → 0`（v0.3.10.2）。

## 五、追踪环节（lifecycle）

EDITOR → CANVAS → 核稿(前端) → SAVE(submitUserDesign.do) → getImgInfos.do(服务端回写 object 完整) → PROOF(imgPreviewSearch.do) → PASS/FAIL 判定。对象全程存在；失败点 = 生产/设计比对（isDisplay）。

## 六、产物

- runtime/reports/p0/run-summary.json（含 getImgInfos 服务端快照 + imgPreviewSearch 判定）
- runtime/reports/p0/control-result.json（单变量实验矩阵，mode=EMPTY_TEMPLATE/MANUAL_TEXT/VARIANT:*）
- runtime/p0/runner.js（--control-empty/--control-manual/--variant=*；核稿验证重试；登录浮层→站点自愈>手动登录重建）
- docs/P0_FONT_PRINT_ROOT_CAUSE_REPORT.md（本报告）| docs/SESSION_PARITY_REPORT.md

## 七、下一步

1. 用户以 test 分支（v0.3.10.2）真机跑一遍 OCR→核稿→印刷：确认无「自动核稿失败」且文字正常显示。
2. 确认后合并 test → demo → main（按项目 git 流程；勿 force push）。
3. 回归：正反面/多页/Save-Reload/Print 全回归。