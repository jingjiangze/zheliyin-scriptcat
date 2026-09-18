# P0 FONT PRINT — Root Cause Report（草稿，进行中）

> 状态：P0_FONT_PRINT = **FAIL**（未取得完整闭环证据，不得宣布 PASS）
> 分支：test | 最新 commit 见 git log
> 更新：2026-09-18（随 runtime 证据滚动更新）

---

## 一、FACT（已证实）

| # | 事实 | 证据来源 |
|---|------|---------|
| F1 | 编辑器正常 → 保存请求发出 → 点击印刷后弹「自动核稿失败提醒」可**稳定复现**（正文文案：生产文件与设计稿不一致…色差大/素材缺失或位移/文字换行或字体字号有误…去检查/标记正常） | r/probes v4/v5 + serial-diff + unlock12 系列 |
| F2 | 弹层触发**不依赖服务端提交成功**：`submitUserDesign.do` / `saveThirdUserDesign.do` 恒返回 `{"result":true,"loginState":"timeOut"}`，timeOut 下弹层仍出现 | p0-native-vs-manual / serial-diff / relogin-v2~v4 resp |
| F3 | 该 timeOut 与账号登录**解耦**：`siteWeb/jsj/userLogin.do`（账号 17606256193）返回 success:true，但提交接口仍 timeOut | relogin-v2/v3 resp |
| F4 | 自动登录可行：`.login-tab .register-area form` + `#userAccount/#userPassword` + `.btn-register`（文本"确定"） | relogin-v4 |
| F5 | 正确印刷流程 = 先点「核稿」生成核稿图（弹层"点击图片复制…"）→ 关闭 → 点「印刷」→ 填作品名/用户名 → 确定 | 用户确认 + relogin-v4 执行 |
| F6 | 印刷核稿页面需点「搜索」同步核稿结果；搜索按钮定位：`.icon.icon-search.inputorderno` / `.search-btn`（连点 3~5 次） | 用户确认 + v6/v7 定位 |
| F7 | 若弹「印刷稿件生成中，请耐心等待…」需确认/关闭后继续 | 用户确认 |
| F8 | **Manual vs Script 对象 schema 差异（typeof + 值）**：
- manual（`addText`→`drawText2`）：`topEnable=false(resourceType=1) maskEnable=false lowPixelFlag=false selectEnabled=true isDesign=true isComposite=true isPreview=true isDesignShape=false visitLevel=1000`（boolean 语义，与模板原生 shape 一致）
- script（`drawText`+entry）：`topEnable=1 resourceType=0 maskEnable=0 lowPixelFlag=0 selectEnabled=1 isDesign=1 isComposite=0 isPreview=0 isDesignShape=0 visitLevel=1`（number 整型，t4 修复补齐）
- font：manual `mediafontId=248 方正黑体简体 fontSize=18 fill=rgb(0,0,0) lineHeight=1.16`；script `mediafontId=556 思源黑体 Regular fontSize=24 fill=#000000 lineHeight=1.3` | case-font-schema（runtime/reports/p0/manual-vs-script-diff.json）
| F9 | 印刷提交 payload 序列化中，manual 对象 `uuid:"undefined"`、`lineIdType:"undefined"`（字符串）；script 对象 uuid=真实 | serial-diff（p0-serial-diff.json head） |
| F10 | 556 思源黑 Regular 在 `findAllFont.do`（287 字体）中合法存在且前端加载生效 | stage-7-3-font-inventory + getFontCss.do |

## 二、OBSERVATION（观察，未完全归因）

- 单脚本对象（整型版，id=556）→ 印刷链路一轮**不弹**失败（goto-check）；A+B（manual+script）→ **弹**。暗示触发与对象组合/某个对象特征相关，单对象是否触发不稳定。
- 自动化的「自动核稿失败提醒」在 search 同步未执行/未成功时出现；用户真机经验：搜索几次即可同步。
- `checkSensitiveWords.do` 通过（无敏感词），像素/安全线/电话检查未阻断印刷——排除这三项。
- 交稿弹层含「错字检查结果」（可展开详情），该处即核稿/错字判定落点。

## 三、HYPOTHESIS（假设，待验证）

- **H1（当前最强）**：脚本 textbox 的 Q() 序列化字段值域（`number 1/0` vs 原生 `boolean true/false`）或值组合（`isComposite:0/isPreview:0` vs 原生 true）导致生产端/核稿端判定「生产文件与设计稿不一致」→ 错字检查/核稿失败 → 印刷时该对象被视为不可生产/缺失。
- **H2**：manual 对象 `uuid=undefined`（serialized）被认为是无效素材（区别于 F1 的弹层运行）。
- **H3**：非思源黑导致（用户原始怀疑）——**仅 HYPOTHESIS**，F10 表明 556 合法，暂无支持证据。
- **H4**：核稿同步未完成即印刷 → 误报（用户经验：点搜索/刷新同步）。若 H4 成立，则「字体消失」可能是核稿比对陈旧，而非对象被删。

## 四、ROOT CAUSE

**未确定。** 待真机/自动化取得「红框对象 → 对应 payload 字段」差异后定论。

## 五、追踪的环节（lifecycle）

EDITOR → CANVAS → LAYER → SAVE(saveThirdUserDesign.do) → getImgInfos.do(服务端回写) → PROOF(搜索同步/错字检查) → PRINT(生产文件比对)。

各环节对象：exists/text/font/fontId/resource/schema 均需记录（object-lifecycle.json）。

## 六、产物

- runtime/reports/p0/run-summary.json（每次运行）
- runtime/reports/p0/proof-result.json（搜索同步记录）
- runtime/reports/p0/suspect-object.json（红框→对象映射）
- runtime/reports/p0/manual-vs-script-diff.json（schema diff，含 typeof）
- runtime/p0/runner.js（Fast Runtime Runner，--from-proof/--from-print/--from-check/--case-font-schema）

## 七、下一步

1. runner 全流程运行，获取 proof-result + suspect-object（红框指向）。
2. 若 search 同步后仍失败 → 单变量实验（H1 字段逐个 flip，最小集合）。
3. 根因明确前不修改生产代码；修复后 Save/Reload/Proof/Print + Front/Back/Multi-page 全回归。