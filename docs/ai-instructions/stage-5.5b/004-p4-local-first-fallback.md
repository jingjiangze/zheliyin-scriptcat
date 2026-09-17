# 004 P4：Local-first / Baidu Fallback / Privacy / Credential UX（用户指令归档）

> 来源：用户 2026-09-17 会话指令。原文结构完整保留。执行见 `docs/execution-records/stage-5.5b/`。

## 轮次前提
已完成 P1、P2-B，P3 已完成 Provider/候选数据边界最小修复并真实回归。本轮不做：Duplicate Protection / Rollback / 旋转坐标 / 字体样式恢复 / OCR 精度 / 大规模 UI 重构。

## 一、第一原则：先核对当前真实仓库
不按旧报告修改。核查 branch/HEAD/origin/working tree/最近 P3 commit/userscript/OCR Provider/fallback-policy/Native UI/Baidu Provider/candidate-normalizer/最新 execution record/evidence。确认 P3 代码已存在、无未交付修改；与旧报告不一致时以真实状态为准并记录差异。

## 二、核心目标
Local 成功 → 完成（绝不偷偷调 Baidu）；Local 失败 → fallbackReason → Baidu → OCRCandidate → 现有 Mapper → 现有 Textbox。

## 三、P4-A：先审计现有 fallback 决策逻辑
检查 fallback-policy / getOcrMode / runBaiduOcr / createBaiduProvider / Local error handling；确认支持状态（auto/local/baidu；Local success/failure、Baidu unavailable/failure）。不重新设计状态机。

## 四、P4-B：真实验证 Local-first
真实 ScriptCat + 真实页面，正常可识别图片：Native Panel → OCR → Local SUCCESS；结合 console/network/provider logs/token request/OCR request 验证 **Baidu request = 0** → 结论 LOCAL_SUCCESS + BAIDU_REQUEST=0。

## 五、P4-C：明确 Local failure 场景
可控可识别地构造失败（模拟 engine init 失败 / executor 返回失败 / provider exception / harness 注入），不得破坏真实环境。

## 六、P4-D：验证自动 fallback
Local failure → fallback decision → fallbackReason → Baidu provider。至少确认 provider=baidu 且 fallbackReason 非空；不得"Local 失败→无提示→直接结束"。

## 七、P4-E：FallbackReason 有意义
用 ENGINE_LOAD_FAILED / OCR_FAILED / TIMEOUT / INVALID_RESULT 等实际原因，命名遵循仓库现有错误模型（不另造一套）。目标：能回答"为什么从 Local 切到 Baidu"。

## 八、P4-F：fallback 后走统一 OCR 数据边界
Baidu → OCRCandidate → 现有 buildItemsFromOcr/mapper → Textbox；不得出现 Local/Baidu 各一套 mapper，不得重建 x0/x1 私有格式（P3 边界必须保留）。

## 九、P4-G：fallback 后真实 Textbox
不得只验证"Baidu OCR request=200"。验证 Textbox 创建成功/类型正确/可编辑/基础位置合理；失败需区分 Provider/Candidate/Mapper/Editor 问题。

## 十、P4-H：Baidu 不可用行为
Local FAIL + Baidu 未配置 → 明确提示；不得无限重试或卡在"正在识别…"。

## 十一、P4-I：Baidu 自身失败
Local FAIL → fallback → Baidu request failed：错误返回、UI 状态结束、不留 running、有可理解原因、AK/SK 不打进日志。不要求复杂自动重试。

## 十二、P4-J / 十三：Credential UX 最低要求
AK/SK 属"客户端可访问凭据"，不得出现"绝对安全/安全隐藏/服务器不可见"等表述。检查 AK/SK 是否进入 Git/普通日志/error message/DOM 明文；UI 用 **** 掩码；保存后再打开不要求重新显示完整凭据。

## 十四：Privacy UX
Local：图片仅在本地 OCR，不发送第三方；Baidu：图片会发送到百度 OCR 服务。语义完整，文案可随 UI 调整。

## 十五、P4-K：日志与敏感信息审计
console.log/error、status message、fallbackReason、provider error 均不得输出 AK/SK/完整 access token/含凭据的 request URL；可记录 provider=baidu、fallbackReason=...。

## 十六、P4-L：不要顺手重构 Provider
即使看到重复也先判断是否影响 P4；只修阻碍（Local-first/fallback/reason/credential UX/privacy），不做大规模重构。

## 十七、P4-M：测试矩阵
| Local | Baidu | 预期 |
|---|---|---|
| PASS | 未配置 | Local 成功，Baidu=0 |
| PASS | 已配置 | Local 成功，Baidu=0 |
| FAIL | 未配置 | 明确提示 Baidu 未配置 |
| FAIL | 可用 | 自动 fallback → Baidu → Textbox |
| FAIL | 失败 | 明确失败原因，不卡死 |
1/2 行证 Local-first；4 行证 fallback；3/5 行证失败处理。

## 十八、P4-N：真实与测试环境区分
harness 可模拟 Local/Baidu 失败；必须至少有一次真实 ScriptCat+真实折立印+真实 Local success，以及一次能实际进入 fallback 的真实闭环。真实 Baidu 受凭据/网络/额度/地域/第三方状态影响时，明确写 PENDING/BLOCKED，不虚构 PASS。

## 十九、P4-O：本轮不解决
旋转坐标/多尺寸精准映射/Duplicate/Rollback/字体恢复/字号估算/样式恢复/复杂多行/高级 OCR accuracy；不得因 fallback 后字体不像原图而提前进入 Style/Reconstruction。

## 二十-二十一：阶段状态与下一步
期望：P1-P4 全 PASS，OCR 输入边界+执行 Provider+数据边界+输出 Editor+失败 Provider 闭环；之后进入 P5 Geometry/Coordinate/Rotation/Multi-size（比 OCR 文本识别率更重要）。

## 二十二、Git 强制交付
一轮一目标、真实验证、证据、独立 commit、立即 push、确认 remote；P4 子任务（fallback-policy 修复/credential UI/privacy 文案/测试工具修复）按逻辑边界分别交付；禁止 force push。

## 二十三、本轮结束条件
至少证明：Local success→Baidu=0；Local failure→自动 fallback；fallback→fallbackReason；Baidu→统一 OCRCandidate；Baidu 结果→Mapper→可编辑 Textbox；Baidu 未配置→明确提示；Baidu 失败→明确结束不死循环；AK/SK 不泄漏；Privacy notice 明确。无法真实验证的标 PENDING（不得用静态分析代替真实行为证据）。

## 二十四、最终判断标准
目标不是"把百度 OCR 做出来"，而是让 OCR 在 Local 成功/失败、Baidu 可用/不可用各状态下清晰、可预测、可恢复；保持 Provider→OCRCandidate→Mapper→Editor 统一边界。达标后再进 Geometry/Duplicate/Rollback。

---
归档时间：2026-09-17。