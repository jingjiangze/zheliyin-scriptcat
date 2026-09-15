# TEST_REPORT.md — 测试报告（Stage 1）

> 执行方式：本机 Edge headless（`--headless=new --dump-dom`）作为 JS 运行环境；测试代码为无框架断言（浏览器/Node 双跑兼容）。
> 日期：2026-09-15 | Baseline：main (tag `stage-1-baseline`)

## 测试层级与结果

| 层级 | 结果 | 证据 |
|---|---|---|
| STATIC | PASS | 移动函数与 Golden Master 逐字一致；wiring-check 19/19 函数跨文件可解析（`wired-ok`） |
| UNIT（field-core） | **PASS 43/43** | 无头 Edge 执行 `tests/run-tests.html` → `zy-tests: ALL-PASS (43)` |
| INTEGRATION（AI 失败路径） | 未在本环境执行（无真实 AI 服务/Mock） | UNVERIFIED（见 TEST_PLAN Case I–M，Stage 2 建议建 Mock harness） |
| BROWSER / REAL PAGE | 未执行（需登录折立印设计器） | UNVERIFIED（TEST_PLAN Case N–T） |
| MANUAL（ScriptCat @require 真机加载） | 未执行 | UNVERIFIED —— @require 依赖 raw.githubusercontent 可达性，需真机确认 |

## UNIT 用例覆盖（43 条）

- clean 边界（4）｜unique 去重（2）｜stripLabel 系列 + 已知怪癖断言（5）
- 行判定：isAddressLine/isBusinessLine/isBackExtraLine/isNameExcluded + 地址-主营混淆（8）
- normalizeFields：清洗/复数单数兜底/business 剔重/back_extra 去重（含怪癖）（5）
- rawIncludes（2）｜cleanMultiline（1）｜parseJsonFromText 五态（5）
- mergeTwoFields 追加语义（3）｜mergeFields 本地优先/补空/替换门槛/拒绝虚构（8）

## 回归对照（Golden Master 行为）

- 本地优先、AI 只补空（补空不要求命中原文、替换要求命中）→ 断言锁定
- 主营/地址双向防串 → isAddressLine × isBusinessLine 组合断言
- 多值去重、界面无序号字段（无 UI 断言，属真机）→ 代码不变

## 已知怪癖（锁定为行为契约，未修改，见 CHANGE_PROPOSAL）

1. mergeFields 补空不要求原文命中；仅替换要求命中
2. normalize 数组项过 stripLabel（"微信客服"→"客服"）
3. stripBackExtraLabel 只剥裸"简介："，不剥"公司简介："
4. 复数 key 存在时忽略单数兜底
5. stripTrailingDept 需以公司关键词作锚点才剥

## 结论

Stage 1 引入的 `field-core` 纯函数模块**可独立测试且行为与 Golden Master 一致**；全部断言 PASS。真实页面（ScriptCat 加载、画布套版、AI 链路）需真机/Mock 验证，列为 UNVERIFIED。