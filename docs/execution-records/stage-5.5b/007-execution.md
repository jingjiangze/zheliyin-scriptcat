# 007 执行记录 — P4 Local-first / Baidu fallback / Credential / Privacy 真机矩阵

- 时间：2026-09-17
- 当前 branch：`demo`
- 关键 commit：`e8c8ae8 fix: native drawer baidu-mode ids ...` / `4473e8e test: p4 harness v3 ...` /（本轮）harness R4 PENDING 语义
- 执行目标：P4（指令 004）：Local-first、fallback（含 fallbackReason）、凭据与隐私，五行矩阵真机验证；Baidu 真实成功无凭据 → PENDING（§18 不虚构）。

## 发现的实现缺陷（P4 审计）与修复
**原生抽屉百度控件 id 与 bindOcrControls(suffix="-native") 查询约定不一致**（`zy-native-*` vs `zy-view-native`）→ 原生抽屉的识别方式/凭据保存/测试连接从未生效（P2-B 遗留；此前"保存成功"为测试假阳性）。修复：抽屉控件 id 统一为 `zy-*.native` 后缀形式（`zy-ocr-mode-native`/`zy-baidu-ak-native`/…），复用 bindOcrControls 单一来源。commit e8c8ae8。

## 测试工具迭代（测试 bug，非产品 bug）
1. GM 存储按脚本隔离 → 辅助"清理"脚本无效；场景顺序改为 R1(未配置)→R3(未配置)→R2(保存假key)→R5(已配置) 保证未配置态；运行前在 options 页 chrome.storage.local 删除 zyBaidu*/zyOcrMode 键。
2. Baidu 请求走 GM_xmlhttpRequest（扩展上下文）→ 页面 network 监听不可见 → Baidu 证据改以 [zy-ocr] console（FALLBACK/BAIDU_TOKEN_FAILED）为准。
3. Local 失败注入与 executor 真实结果存在竞态 → 改为就绪后持续覆盖失败值 2.5s。
4. 终态等待：中间状态（正在切换…）不截断。

## 测试命令
`node runtime/stage5-5b-p4.js`（Playwright + 真实 ScriptCat + 真实 diy.zheliyin.com，profile-usc3）

## 结果（P4-M 五行矩阵）
| 行 | Local | Baidu | 结果 | 证据 |
|---|---|---|---|---|
| R1 | PASS | 未配置 | **PASS** | 已生成 3 个文字；console 无 FALLBACK/BAIDU（Baidu=0）|
| R3 | FAIL | 未配置 | **PASS** | 明确提示「本地识别失败（LOCAL_OCR_FAILED:engine），百度云端未配置…」；console `baidu not configured for fallback` |
| R2 | PASS | 已配置(假key) | **PASS** | 保存成功（产品 UI 路径）；本地成功且 console 无 Baidu（Local-first 不偷偷调用）|
| R5 | FAIL | 已配置(假key→必失败) | **PASS** | console `FALLBACK] local LOCAL_OCR_FAILED:engine → baidu` + `baidu BAIDU_TOKEN_FAILED`；终态「百度 OCR 配置无效：unknown client id」；非"正在…"中间态（不死锁）|
| R4 | FAIL | 可用(真实 key) | **PENDING** | 需真实 AK/SK（凭据/额度/网络/地域），不虚构 PASS |

其他：
- P4-K 泄漏审计 PASS：console/status/pageErrors 均无 FAKE_AK/FAKE_SK/client_secret=（leaks=[]）；`baiduStatusInput=已保存（Key 不显示完整，仅存本机）。`
- 隐私提示：原生抽屉固定文案「本地 OCR：图片不上传第三方。/ 百度 OCR：图片会发送到百度 OCR 服务识别。」（语义完整）
- Credential UX：password 输入 + placeholder 掩码（maskKey），保存后不回显完整凭据

## 判定
LOCAL_SUCCESS + BAIDU=0（R1/R2）✓；Local failure→auto fallback✓；fallback→fallbackReason（LOCAL_OCR_FAILED）✓；Baidu→统一 OCRCandidate 边界（挂接前已统一，P3 保留）→ Mapper 路径（R4 PENDING 未走真实候选，候选统一由 candidate-normalizer 单测保障）✓；Baidu 未配置→明确提示✓；Baidu 失败→明确终态不死锁✓；AK/SK 不泄漏✓（R4 需真实凭据后再补 Textbox 真实验证）。
**P4 = PASS（R4 标 PENDING，待真实凭据）**

## 证据
`runtime/reports/stage5-5b-p4-report.json` = `docs/evidence/stage-5.5b/stage5-5b-p4-report.json`

## 下一步
P5：Geometry / Coordinate / Rotation / Multi-size（图片缩放/位置/旋转/Canvas 尺寸变化/OCR bbox→Canvas），完成后 P6 Duplicate / Rollback。