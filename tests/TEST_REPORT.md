# TEST_REPORT.md — 测试报告（Stage 1 + Stage 2）

> 执行方式：本机 Edge headless（`--headless=new --dump-dom`）作为 JS 运行环境；无框架断言（浏览器/Node 双跑兼容）。
> Stage 2 日期：2026-09-15 | Baseline：main (tag `stage-2-baseline`)

## 测试层级与结果（累计）

| 层级 | 模块 | 结果 | 证据 |
|---|---|---|---|
| STATIC | 全部 | PASS | wiring-check：field/config/ai 模块 + assistant 三形态接线，函数与常量跨文件可解析（`wired-ok`） |
| UNIT | field-core | **PASS 43/43** | `run-tests.html` → `field:ALL-PASS (43)` |
| UNIT | config-core | **PASS 15/15** | `run-tests.html` → `config:ALL-PASS (15)`（默认值/完整/部分/历史 key/优先级/迁移闭环/保存重读） |
| UNIT+INTEGRATION | ai（传输矩阵） | **PASS 10/10** | `ai-tests.html`：200 合法/非法 JSON、429、500、timeout、network、空响应、缺 choices/message/content、endpoint 与脱敏断言 |
| INTEGRATION | 业务级 fallback/merge | **PASS 8/8** | `ai-tests.html`：AI 429→本地；AI 空结果→本地；AI 正常→merge 与 reference 一致且 title/name 生效；parse 非法 JSON→本地；追加信息保留；每场景队列消费干净 |
| BROWSER / REAL PAGE | 扩展真机、设计器画布 | 未执行（需登录与 Chrome 加载） | UNVERIFIED（TEST_PLAN Case N–T） |
| MANUAL | ScriptCat @require 真机 | 未执行（依赖 raw.githubusercontent 可达性） | UNVERIFIED |

## Stage 2 单元覆盖明细

- config-core（15）：默认/完整/部分/历史 zyBaseUrl 回退与 usedLegacy/优先级（ark>legacy>default）/模型回退/双 key 同步/迁移闭环幂等/保存重读。
- ai-client 传输级（10+m）：合法 JSON、非法 JSON、429(可重试)、500(可重试)、timeout(可重试)、network(可重试)、空 body、缺 choices/message/content（OK，内容判定交业务）、endpoint 记录、错误消息脱敏（不含 Key/Auth）。
- 业务级（8）：见上。

## AI fallback 矩阵（§二十一 验证核心：业务最终状态）

| 场景 | 业务最终状态 |
|---|---|
| split 429 → | 本地规则（fields == parseByRulesFromSides(splitFrontBackText(raw))）✅ |
| split '{}' + parse '{}' → | 本地规则 ✅ |
| split 正常 + parse 非法 JSON → | 本地规则 ✅ |
| split+parse 正常 → | mergeFields(AI分面规则, AI 字段, raw)，title 由 AI 补全且命中；phones/addresses/business 均须命中原文或过谓词 ✅ |
| 追加信息（AI 失败） → | 既有业务字段保留 + 新行合并 ✅ |

## 已知怪癖（契约锁定，见 CHANGE_PROPOSAL.md）

1. mergeFields 补空不要求 AI 值命中原文（Stage 1 锁定，Stage 2 未改）
2. normalize 数组项过 stripLabel（"微信客服"→"客服"）
3. stripBackExtraLabel 不剥"公司简介："
4. 复数 key 优先于单数兜底
5. AI 分面返回单行（缺换行）时，单行整行可能被当作微信行——AI 正常返回多行为真实形态，测试以单行为准记录行为（非回归）

## 结论

Stage 2 的 Config 边界（15/15）与 AI 边界（传输 10/10 + 业务 8/8 共 18/18）均有可复现证据；field-core 回归 43/43 无退化。真机项（ScriptCat @require、扩展、设计器）保持 UNVERIFIED。