# 10 — Known Risks（已知风险清单）

1. **ImageInk 仍属实验 target**：`zyStage9FontInkTarget` 默认 0；P4-B Commit 3 真机 A/B 未产生，不能宣称 ImageInk 是最终默认模型（§29 CASE A/B/C 三选一依据）。
2. **P4-A 样本不足**：K2/K3/K4 UNSTABLE，10 块分层后每格 1–6 样本 → 不得建立稳定分层 multiplier；需多卡多 bucket 证据。
3. **pageBridge inkMeasure 为 self-contained 同构实现**：页桥 `toString()` 注入无法访问 @require 沙箱函数；这是实现事实，不是设计分歧；单测以 `image-ink-target.js` 为真源（08/02 已记录）。
4. **OCR bbox / ImageInk 只改变 typography target**：禁止借此改 source geometry（targetQuad/position/quad/angle）；否则字体模型与几何位置模型重新耦合（P4-A 诊断结论）。
5. **active image → backgroundImage → first image 的取源优先级未真机覆盖**：inkMeasure 取源与 buildOcrPrepare 一致，但 ImageInk 条件（flag=1）的完整真机路径（Commit 3）未跑，优先级在复杂画布（多图/底图叠加）下待验证。
6. **ImageInk 失败必须 fallback，禁止伪造宽度**：NO_INK/NO_REGION → OCR_BBOX_FALLBACK（diagnostics inkFallback=true + reason）；禁止 `Math.max(inkWidth, bboxWidth)` 式安全修复。
7. **FS_MIN=8 尚未统一**（P4-C 未开始）：page-bridge adjust 仍允许 fontSize≥8；若未来升 10，须在 solver/build/calibration/adjust 全部一致，且 clamp 后重算 measure/layout/width/height。
8. **Geometry 闭环 loop≤4 已存在**（P4-D 未开始）：不得新增第二套 loop；未来只做 Font→ActualInk→Position→FinalVerify 职责收敛。
9. **A1/A2/B1/B2 真机矩阵未完成**（P4-B Commit 3 缺失）：目标 target 的最终判据（EditorInk/ImageInk→1、position error 同步、无新增 wrap/identity/page 回归）尚未有数据。
10. **Fresh runtime 约束**：`BAIDU_OCR_MODE / STAGE9_NATIVE_OCR_MODE / STAGE9_FONT_INK_TARGET` 在 userscript 初始化读取；A/B 若在同一已加载页面改 GM 值会无效，必须新 page/reload。
11. **凭据纪律**：任何新 runner 若缺 ZY_STAGE9_COOKIE / ZY_BAIDU_AK / ZY_BAIDU_SK 必须显式报缺退出；报告只记 cookie 名；禁止值落盘。
12. **Native 手写体(h2)单点退化**：手写体邮箱 `ltd→Itd` 正确率更低，但用户指令仍要求手写体优先（D2）——已知的权衡，勿擅改默认 textType。
13. **demo 分支冻结**：61cd248（0.3.11.35）；晋级需用户显式确认（merge -X theirs + @require 回退范式），交接后不得自动晋级。