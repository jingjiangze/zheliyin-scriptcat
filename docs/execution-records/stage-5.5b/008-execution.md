# 008 执行记录 — P4 补验：凭据加密（AES-GCM）+ 真实百度 R4 闭环（矩阵 5/5 PASS）

- 时间：2026-09-17
- 当前 branch：`demo`
- 关键 commit：`455d823 feat: encrypt baidu credentials at rest ...` / `3cf7188 test: p4 harness R4-real path ...` / `8936a02 docs(evidence): execution record 007 ...`
- 执行目标（用户指令「百度 api 需要加密」+ 004-P4 §十八）：① 百度 AK/SK 加密落库（明文不进 GM/日志/DOM/Git）；② 用真实 Key 完成 P4-M 第 4 行（Local FAIL → 自动 fallback → 真实 Baidu → OCRCandidate → Mapper → 可编辑 Textbox），使 P4 从「R4 PENDING」转为全 PASS。

## 凭据加密实现（extension/src/ocr/credential-crypto.js，@require，单测 9 行）
- AES-256-GCM（WebCrypto）；KEK = 随机 32B（crypto.getRandomValues）存 GM `zyBaiduCryptoKek`；密文格式 `v1:<iv>.<ct>`，每次加密新 IV。
- 保存（bindOcrControls 共用）经 `saveBaiduConfigPlain` 加密后写 `zyBaiduAkEnc/zyBaiduSkEnc` 并清明文旧键；读取经 `loadBaiduConfig`（init 预载，解密缓存 `baiduCfgCache`）；兼容旧明文自动迁移+清除。
- WebCrypto 不可用时拒绝保存（不落明文）。诚实边界写明：KEK 与密文同机，仍属"客户端可访问凭据"，不声称绝对安全（004-§12/13）。
- 泄漏检查更新：P4-K 同时在 console/status/报告检索真实假 Key 与 client_secret=，结果 leaks=[]。

## 测试命令
`ZY_BAIDU_AK=… ZY_BAIDU_SK=… node runtime/stage5-5b-p4.js`（真实 Key 仅经环境变量注入进程，不写入任何仓库文件/日志/报告；脚本结束时环境变量即作废）

## 结果（P4-M 五行矩阵全 PASS，errors=[]）
| 行 | Local | Baidu | 结果 | 证据 |
|---|---|---|---|---|
| R1 | PASS | 未配置 | PASS | 本地成功；console 无 Baidu 日志（Baidu=0）|
| R2 | PASS | 已配置(fake) | PASS | 本地成功且不偷调 Baidu |
| R3 | FAIL | 未配置 | PASS | 明确提示「百度云端未配置」|
| R5 | FAIL | 已配置(fake) | PASS | `FALLBACK … → baidu` + `BAIDU_TOKEN_FAILED` →「配置无效」终态不死锁 |
| **R4** | FAIL | **已配置(真实)** | **PASS** | 测试连接「连接成功（有效 30 天，已缓存令牌）」→ 注入 Local 失败 → `FALLBACK … → baidu` → `BAIDU_RECOGNIZING lines=3 elapsed=425ms` → 已生成 3 个文字；画布 OCR 对象 count=9 全部 `editable:true` |

其他：P4-K 泄漏审计 PASS（leaks=[]；保存提示「已保存（AES-256-GCM 加密存储，仅本机；Key 不显示完整）」）；测试连接/凭据保存/回显全程无明文。

## 判定（P4 关闭）
LOCAL_SUCCESS+Baidu=0 ✓；Local failure→auto fallback（fallbackReason=LOCAL_OCR_FAILED）✓；Baidu→统一 OCRCandidate→Mapper→可编辑 Textbox（真实 425ms）✓；未配置→明确提示 ✓；Baidu 失败→明确终态 ✓；AK/SK 加密落库、不泄漏 ✓；Privacy notice ✓。
**P4 = PASS（含真实百度闭环）**

## 证据
`runtime/reports/stage5-5b-p4-report.json` = `docs/evidence/stage-5.5b/stage5-5b-p4-report.json`

## 下一步
P5：Geometry / Coordinate / Rotation / Multi-size → P6 Duplicate / Rollback。