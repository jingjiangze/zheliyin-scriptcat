# TEST_PLAN.md — 回归测试计划（R0）

> 基线 = BEHAVIOR_BASELINE.md（Golden Master main `6c19b46`）。
> R0 只定义矩阵与夹具，**不执行**；R1 起按本节执行并把结果写入 `TEST_REPORT.md`（填写规则：仅允许 `PASS / FAIL / UNKNOWN`，禁止「看起来没问题」）。

## 1. 分级

- P0 契约用例：任何 FAIL 即阻止进入下一阶段。
- P1 主流程用例：以「迁移前后结果一致」为通过标准。
- P2 补充用例：允许记录差异但必须说明理由。

## 2. 回归矩阵（Case A–T）

| # | 场景 | 输入（夹具） | 预期 | 当前结果 | 风险 |
|---|---|---|---|---|---|
| A | 纯中文普通名片 | fixtures/basic-card.txt | 公司/姓名/职位/电话/微信/地址正确入正面；主营入反面；无多余项 | UNVERIFIED(R1) | REG |
| B | 中英文公司名 | english-company.txt | company_cn+company_en 均入正面且互不误判 | UNVERIFIED(R1) | REG |
| C | 多电话 | multi-phone.txt | phones 数组 ≥2 且无重复 | UNVERIFIED(R1) | REG |
| D | 多地址 | multi-address.txt | addresses 数组 ≥2；地址行贴「地址：」不混入主营 | UNVERIFIED(R1) | REG |
| E | 微信+邮箱+网址 | mixed-language.txt | 三类字段各就位；网址不被邮箱吞 | UNVERIFIED(R1) | REG |
| F | 地址与主营易混 | fixtures/（F 场景文本内联于 fixtures/front-back.txt 备注） | 主营不带"省/市/路"，地址不带业务词 | UNVERIFIED(R1) | REG |
| G | 只有正面文本 | fixtures/basic-card.txt（无反面段） | backText 为空；全部字段正面；不误造反面 | UNVERIFIED(R1) | REG |
| H | 明显反面内容 | fixtures/front-back.txt | 宣传段入 backText/back_extra | UNVERIFIED(R1) | REG |
| I | AI 正常 | 任意夹具 + 有效 Key | AI 结果仅补空/追加；本地值不被覆盖 | UNVERIFIED(R1) | AI |
| J | AI HTTP 失败（401/403/5xx） | 无效 Key | 回退本地 + 明确分类提示（R1 后含错误类型） | UNVERIFIED(R1) | AI |
| K | AI 超时 | 网络延迟模拟 | 30s 内回退本地 | UNVERIFIED(R1) | AI |
| L | AI 返回非法 JSON | 夹具+Mock 返回 | parseJsonFromText 容错或回退本地 | UNVERIFIED(R1) | AI |
| M | AI 返回空字段 | Mock 空 response | 结果=本地结果 | UNVERIFIED(R1) | AI |
| N | 模板已有足够文字层 | 真机模板 | 只改文本，不改样式/位置 | UNVERIFIED(R2真机) | REG |
| O | 模板文字层不足 | 真机模板 | 新建层克隆附近样式；仍可编辑 | UNVERIFIED(R2真机) | REG |
| P | 重复执行助手 | 连续 apply ×2 | 第二次不叠加重复层 | UNVERIFIED(R2真机) | BRIDGE |
| Q | 第二次清理上次生成层 | 同上 | removeAssistantExtras 清理富余助手层，模板层不动 | UNVERIFIED(R2真机) | REG |
| R | Canvas 尚未加载 | 早于设计器就绪点击 | 返回「未找到画布」，不崩溃 | UNVERIFIED(R2真机) | BRIDGE |
| S | Bridge 无响应 | CSP 拦截注入模拟 | 诊断中心提示桥接未注入 | UNVERIFIED(R2真机) | BRIDGE |
| T | 页面刷新/重进 | 刷新后重开面板 | 面板恢复位置；状态重置正常 | UNVERIFIED(R2真机) | UI |

## 3. 测试夹具（tests/fixtures/）

| 文件 | 内容要点 | 校验焦点 |
|---|---|---|
| `basic-card.txt` | 中文公司+姓名+职位+1电话+微信+地址+主营一句 | Case A/G/I/M |
| `multi-phone.txt` | 同人 2–3 个电话（微信、邮箱混杂） | Case C |
| `multi-address.txt` | 公司+2 地址+1 电话 | Case D/F |
| `front-back.txt` | 正面内容+「反面」显式段（主营范围+企业简介） | Case H/F |
| `english-company.txt` | 中英双语公司名+姓名+职位 | Case B |
| `mixed-language.txt` | 微信+邮箱+网址+英文地址 | Case E |

夹具数据全部为**合成的公开示例文本**（不包含任何真实客户/用户数据）。
执行方式（R1 起）：
1. 纯函数白盒：在浏览器控制台对已加载脚本内部函数白盒调用（不改主脚本）；或
2. 建立最小测试 harness（独立文件，dot-source 主脚本纯函数段——若允许 R2 提出 utils 后直接 Node 单测 normalize/merge/predicates）；或
3. AI 场景用 Mock（本地 stub GM_xmlhttpRequest）不消费真实 Key。

## 4. 真机用例（N–T）执行前提

- 需登录折立印设计器并在模板页操作；无法自动化时由人工按脚本核验，结果标注 `UNVERIFIED` 直到实测。

## 5. 输出

- 每次执行/阶段迁移后更新 `TEST_REPORT.md`（本阶段尚未创建，R1 首日创建）。
- 全部 P0 用例 PASS 是进入下一阶段（R2）的门禁。