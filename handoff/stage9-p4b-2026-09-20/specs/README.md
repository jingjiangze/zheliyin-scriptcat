# specs/ — 规格来源说明

本目录不复制规格原文（两轮规格为会话附件中的大文本，非仓库内容；且 P4-B 规格含大量过程性要求，复制全文会造成交接包冗余）。

- **Stage 9 V4 规格**（高精度百度 OCR + 新识别/校准 + 正反面隔离 + Font Calibration）：
  原附件：`c:\Users\Administrator\.trae-cn\attachments\6aabb4f584e41820169e63c3\d490196a-15db-4563-ad42-1cd9b921685e_bccfcbb8-f382-4446-92e5-35936ecebfe1_# Stage 9....txt`（1940 行；执行序 P1→P7，Commit 1-9 建议）。
- **Stage 9 P4-B 执行指令**（ImageInk Target → Calibrated Advance Target → solveByAdvance）：
  原附件：`c:\Users\Administrator\.trae-cn\attachments\6aabb4f584e41820169e63c3\f1623035-0aff-4848-a2a8-ff56dd9b97d9_88996823-dc65-4451-8ec0-c73c52a90fe6_# Stage 9....txt`（约 1600 行；Commit 1-4 + 结束条件 + CASE A/B/C 决策规则）。

关键要求提炼（完整要求以附件为准）：

1. P4-B 目标 = 建立**可关闭、可取证的 ImageInkWidth typography target 实验链路**（默认 OFF），不是直接当新标准全量启用。
2. 四层数据（OCRBBox → ImageInk → AdvanceTarget → EditorActualInk）不得混用；ImageInk 只用于 typography target，不替换 source bbox（§五/§九）。
3. 统一 Target Resolver（font-target-source.js）：bbox | image-ink(+valid) | OCR_BBOX_FALLBACK；禁止任何固定乘数（§六/§二十五）。
4. feature flag `zyStage9FontInkTarget`，默认 "0"，A/B 期间保持默认关闭（§七/§二十一）。
5. 字号 target 与 layoutWidth visual target 必须同源（§十一）——已实现（D9）。
6. solver 不改算法：advance-first / ink-height secondary / ocr-height sanity / quality gate 全部保持（§十）。
7. 真机 A/B 矩阵 A1/A2/B1/B2 × ≥2 runs、≥3 张名片优先；标 FULL_REAL_PIPELINE 或 BRIDGE_SYNTHETIC（§十五/§十六/§二十六）。
8. 每 block 记录四层 + 误差 + wrap + identity（§十七/§十八/§二十七）；禁止 Cookie 值（§二十二）。
9. 提交顺序：Commit1（image-ink module+tests）/ Commit2（resolver+接线+flag+0.3.11.40）/ Commit3（真机 A/B evidence）/ Commit4（docs 结论）——Commit1/2 已完成（4359707 / a37b35f）。
10. 结束条件与决策规则：CASE A 稳定改善→进 P4-C/P4-D；CASE B 部分改善→数据积累期；CASE C 无稳定改善→保留 flag 暂停启用并重定位（§二十八/§二十九）。P4-C（FS_MIN=10）与 P4-D（bounded loop 职责收敛）完成 P4-B 后再做（§三十）。