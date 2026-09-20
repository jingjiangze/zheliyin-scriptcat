# STAGE 9 P4-B 真机 ImageInk A/B 证据报告

> 阶段：STAGE-9 P4-B Commit 3（真实 A/B Matrix）
> 提交：`ceca3f6`（`test(stage-9): run font target real A/B matrix`）— 已 push
> 分支：`stage-9-altq-baidu-reconstruction`
> 运行方式：本机 Windows + ScriptCat 真机（headless=false 可见浏览器）+ 真实 DIY 编辑器 + Native textType=2 + Baidu node 侧同源 provider
> 证据文件：`runtime/reports/stage-9/font-target-ab.json`
> 凭据：Baidu AK/SK 与会话 Cookie 仅运行时 env 注入；报告零泄漏（LEAK_SCAN=CLEAN，无 AK/SK/Cookie 原文/名字）

## 一、矩阵执行结果（8 个真实 run）

| 条件 | Baidu | ImageInk | run | pipeline | blocks | created/dup | errs |
|---|---|---|---|---|---|---|---|
| A1 r1 | standard | OFF | 1 | FULL_REAL_PIPELINE | 2 | 2/0 | 0 |
| A1 r2 | standard | OFF | 2 | FULL_REAL_PIPELINE | 2 | 2/0 | 0 |
| A2 r1 | standard | ON | 1 | FULL_REAL_PIPELINE | 2 | 2/0 | 0 |
| A2 r2 | standard | ON | 2 | FULL_REAL_PIPELINE | 2 | 2/0 | 0 |
| B1 r1 | accurate | OFF | 1 | FULL_REAL_PIPELINE | 1 | 1/0 | 0 |
| B1 r2 | accurate | OFF | 2 | FULL_REAL_PIPELINE | 1 | 1/0 | 0 |
| B2 r1 | accurate | ON | 1 | FULL_REAL_PIPELINE | 1 | 1/0 | 0 |
| B2 r2 | accurate | ON | 2 | FULL_REAL_PIPELINE | 1 | 1/0 | 0 |

- 全部 8 run：`pipeline=FULL_REAL_PIPELINE`、真实 Editor Object > 0、真实 textbox 创建、无 duplicate（duplicateCount=0）、无 blocks=0。

## 二、四层证据（每 run 逐块）

### A1/A2（Baidu standard，Native textType=2）

| 条件 | 文本 | targetSource | OCR_BBOX w | ImageInk w | target w | Advance w | EditorInk w | K2_after | fs | wrap(rendered/forced) |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 客户经理 | OCR_BBOX | 185 | — | 185 | 172.00 | 170 | — | 43 | 1/false |
| A1 | Tel.: 0757-88809856 | OCR_BBOX | 278 | — | 278 | 247.08 | 247 | — | 27 | 1/false |
| A2 | 客户经理 | IMAGE_INK | 185 | 176 | 176 | 172.00 | 170 | 0.966 | 43 | 1/false |
| A2 | Tel.: 0757-88809856 | IMAGE_INK | 278 | 276 | 276 | 247.08 | 247 | 0.895 | 27 | 1/false |

### B1/B2（Baidu accurate，Native textType=2）

| 条件 | 文本 | targetSource | OCR_BBOX w | ImageInk w | target w | Advance w | EditorInk w | K2_after | fs | wrap(rendered/forced) |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | Telephone:+86 1591317158 | OCR_BBOX | 283 | — | 283 | 353.72 | 369 | — | 28 | 1/false |
| B2 | Telephone:+86 1591317158 | IMAGE_INK | 283 | 276 | 276 | 353.72 | 369 | 1.337 | 28 | 1/false |

## 三、Position / Geometry（editor 实际对象）

| 条件 | 文本 | left | top | width | height | angle | aCoords |
|---|---|---|---|---|---|---|---|
| A1/A2 | 客户经理 | 262 | 35 | 200 | 48.59 | 0 | 有 |
| A1/A2 | Tel.: 0757-88809856 | 268 | 250 | 295 | 30.51 | 0 | 有 |
| B1/B2 | Telephone:+86 1591317158 | 217 | 250 | 397 | 31.64 | 0 | 有 |

- 同条件 r1/r2 位置完全一致（确定性重建）；fontSize 由 advance-primary 求解（43/27/28）。

## 四、Native Truth

- 全程固定 `textType=2`（未在 A/B 内切换 Native 精度）。
- 最终 `editor textbox.text === native.rawText`：本矩阵每个 run 均走 Native uploadOCR → Text Truth → 创建，Baidu 仅提供 geometry 候选与目标宽度，不覆盖文字。

## 五、Actual Ink 关键数据

- ImageInk OFF（A1/B1）：无 ink target，仅记录 OCR_BBOX target。
- ImageInk ON（A2/B2）：`editorInkWidth/inkTargetWidth` → K2_after = A2 块 0.966 / 0.895（editor 略小于 ink target）；B2 长行 1.337（editor 大于 ink target，advance 353.72 > ink 276，因 accurate 长行候选一行塞入更长文本）。K2 不稳定结论与 P4-A 审计一致（font-calibration-audit K2 UNSTABLE spreadRatio 0.8）；**不可用全局 multiplier**。

## 六、Front/Back 隔离

- 执行序：Front 校准（created=2）→ Back 校准 → 回 Front 重校准。
- `frontInvariant=true`（Front 校准后在 back 侧操作并返回后，Front inventory 不变）；back 侧对象不污染 Front；errors=[]。
- 与 e2e-front-back-isolation 结论（ac530ab PASS）一致。

## 七、CASE 判定（仅记录事实，不提前给"默认开关"结论）

- ImageInk 在 standard 短行（客户经理/电话号）下 K2_after 0.895~0.966，EditorInk 与 ImageInk 差距 5~10%，较 OCR_BBOX 目标（185/278）更贴近实际 Advance（172/247）。
- accurate 长行（Telephone）K2_after=1.337，ImageInk 目标(276) < Advance(353.72)——Rewrite/wrap 与长行行为仍需 P4-C/D 补充数据。
- 建议：ImageInk 作为候选目标不开启默认；待 P4-C/D 与更多 run 后再定。

## 八、回归与语法

- Stage 9 单测：95/95 PASS（文档口径 89/89 之上，含 image-ink-target 14）。
- legacy（baidu-provider / common-schema）：ALL PASS。
- node --check：image-ink-target.js / font-target-source.js / page-bridge.js / zheliyin-card-assistant.user.js / font-target-ab.js 全部 OK。
- 既有负债（P4-B 未引入，勿视为 P4-B 回归）：tests/editor-object-model 中 candidate-normalizer 10 / merge-guard 2 / merge-golden-word 2 / textblock-fields 3 共 17 项失败，来源为 stage-8d P4 合并策略（2aa1d02 起），不在 P4-B 范围，未在本阶段改动（按 Stage 9 接管约束禁止顺手重构）。

## 九、结论

- P4-B Commit 3 = **PASS**（8/8 真实 run、Front/Back PASS、Native Truth 保持、无 duplicate、无 blocks=0、无凭据泄漏、git diff --check 通过、回归+legacy+node-check 全绿）。
- 下一步（P4-C 已获准启动）：`FS_MIN 8 → 10`，仅此一项改动，随后真机验证 + commit + push。
- 待办：P4-C → P4-D（沿用 runGeometryCalibration ≤4 轮，区分 Source Geometry Error 与 Reconstruction/Font Error，禁止全局 multiplier）。