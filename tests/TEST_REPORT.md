# TEST_REPORT.md — 测试报告（Stage 1 + 2 + 3 + 3.1）

> 执行方式：本机 Edge headless（`--headless=new --dump-dom`）作为 JS 运行环境；无框架断言（浏览器/Node 双跑兼容）。
> Stage 3.1 日期：2026-09-15 | Baseline：main (tag `stage-3-baseline`)

## 测试层级与结果（累计）

| 层级 | 模块 | 结果 | 证据 |
|---|---|---|---|
| STATIC+INTEGRATION | runtime wiring（生产入口） | **PASS 5/5** | `wiring-check.html`：pageBridge 全局可解析/注入桥接真实 probe 往返/probeResult 结构/apply 无画布显式失败/toString 唯一实现（file:// origin 归一化仅测试环境） |
| UNIT | field-core | **PASS 43/43** | `run-tests.html` |
| UNIT | config-core | **PASS 15/15** | `run-tests.html` |
| UNIT+INTEGRATION | ai（传输矩阵+业务级） | **PASS 18/18** | `ai-tests.html?zydebug=1` |
| UNIT+INTEGRATION | editor/bridge（canvas mock） | **PASS 18/18** | `editor-tests.html` |
| BROWSER / REAL PAGE | 扩展真机、设计器画布 | 未执行 | UNVERIFIED |
| MANUAL | ScriptCat @require（4 模块）真机 | 未执行 | UNVERIFIED |

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