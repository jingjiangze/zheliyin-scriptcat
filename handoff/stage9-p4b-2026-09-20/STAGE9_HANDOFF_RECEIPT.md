# STAGE9_HANDOFF_RECEIPT — 接管验收凭证

- 验收日期：2026-09-20（Asia/Hong_Kong）
- 验收 Agent：Stage 9 新 Agent（本会话，独立核验，非仅采信 handoff）
- 核验方式：读 handoff 10 文档 + 独立 Git 命令复核 + 逐文件读 P4-B 代码 + 逐报告核对 + 单测独立重跑

```
HANDOFF_RECEIPT=PASS

Repository: jingjiangze/zheliyin-scriptcat
Branch:     stage-9-altq-baidu-reconstruction
HEAD:       a37b35f (P4-B Commit 2, 0.3.11.40)；本会话从 3646045 (handoff commit) 起手
Version:    0.3.11.40 (userscript @version / assistant.js / manifest.json / runtime-manifest.json 四源一致)

P4-A:         391e92e  test(stage-9): add font calibration audit (diagnostics only)
P4-B Commit1: 4359707  test(stage-9): add image ink target measurement
P4-B Commit2: a37b35f  feat(stage-9): add optional image ink typography target (0.3.11.40)

ImageInk implementation:     VERIFIED
Typography target resolver:  VERIFIED
Feature flag default OFF:    VERIFIED
Native truth:                VERIFIED
Page isolation:              VERIFIED
Recognition mode:            VERIFIED
Current real A/B:            NOT DONE     <- 即 P4-B Commit 3，本 Agent 下一步

Next task:
P4-B Commit 3（真机 A1/A2/B1/B2 x >=2 runs，FULL_REAL_PIPELINE，然后 Commit 4 结论）
```

## 核对明细

### 1. Git 状态（独立命令复核，非采信文档）

- `git fetch --all --prune`：origin/stage-9-altq-baidu-reconstruction = 3646045（含 handoff 提交）
- `git status --short --branch`：`## stage-9-altq-baidu-reconstruction...origin/...`（干净，无 M/??）
- `git diff --check`：无输出
- `git log -40`：3646045 -> a37b35f -> 4359707 -> 391e92e -> ac530ab -> ...（Stage 9 序列完整、无改写痕迹）
- `git show --stat 391e92e`：+font-calibration-audit.json(841) +font-calibration-audit.js(167)
- `git show --stat a37b35f`：5 files changed, 193 insertions(+), 83 deletions(-)
- `git diff 391e92e..a37b35f --stat`：8 files changed, 461 insertions(+), 83 deletions(-)
- 分支对照：test = origin/test = a37b35f；demo 本地 61cd248（origin/demo 本次 fetch 后为 3853742，见备注 2）

### 2. P4-B 代码核对（逐文件读取）

| 文件 | 核对结论 |
| --- | --- |
| image-ink-target.js | 局部 Otsu 少数类前景 bbox；NO_REGION/NO_INK 显式 reason，不伪造 inkWidth；无乘数；node 可测 |
| font-target-source.js | bbox→OCR_BBOX；image-ink+valid→IMAGE_INK；+invalid→OCR_BBOX_FALLBACK（fallback=true+reason）；零乘数 |
| page-bridge.js | inkMeasure handler 只读（active→background→first image；Otsu 同构自包含，注释声明实现事实/D8）；ocrCreate/ocrAdjust/ocrCalibrate 均强制 Page Ownership（PAGE_IDENTITY_CHANGED→STOP） |
| text-fit-fusion.js | solver 未改：advance-first + ink-height secondary + ocr-height sanity + quality gate；FS_MIN=8 |
| zheliyin-card-assistant.user.js | STAGE9_FONT_INK_TARGET = GM_getValue("zyStage9FontInkTarget","0")==="1"（默认 OFF L891）；flag OFF 时 inkMeasure 零请求；resolveTypographyTarget 同一 target 供 solveFontSizeFusion(targetVisualWidth) 与 estimateTextLayout(visualWidth) 同源（D9）；diagnostics 含 targetSource/targetWidth/ocrBBoxTargetWidth/imageInkTargetWidth/inkFallback |
| assistant.js / manifest.json / runtime-manifest.json | 版本 0.3.11.40 一致；@require text-fit-fusion/image-ink-target/font-target-source?v=0.3.11.40 |

### 3. 关键确认项（第三阶段要求）

- zyStage9FontInkTarget 默认 OFF：确认（L891，默认 "0"）
- OCR_BBOX / IMAGE_INK / OCR_BBOX_FALLBACK 逻辑正确：确认（font-target-source.js + user.js L1272-1276 + 单测 6 例）
- ImageInk 不修改 targetQuad / page geometry：确认（inkMeasure 只读；宽仅进 typography target；targetQuad 仍由 aCoords 仿射唯一确定 L1248-1264）
- Native Text Truth 未被改变：确认（zyStage9NativeTruth=1、textType=2 手写体优先 + recognizeWithFallback 回退 textType=1、textbox.text=rawText 原样）
- PageIdentity / TransactionIdentity 未被改变：确认（transactionId/imageFingerprint 透传、zyOcrKey=zy-ocr-{txId}-{blockIndex}、PAGE_IDENTITY_CHANGED→STOP、正反独立 Session）
- Recognition Mode 未被改变：确认（resolveRecognitionMode NEW/CALIBRATION/RETRY、zyStage9Calibration=1）

### 4. 历史真机证据核对（第四阶段，逐报告）

| 报告 | 关键值 | 核对结果 |
| --- | --- | --- |
| font-calibration-audit.json | K1=0.9558 STABLE；K2=0.7947 UNSTABLE；K3=0.5799 UNSTABLE；K4=1.0423 UNSTABLE；K5=0.9286 STABLE；K6=1.8095 UNSTABLE | 与 handoff 一致；verdict 明确 UNSTABLE → 不得转全局乘数 |
| baidu-geometry-benchmark.json | accurate 全轴略优；width MAE 114.5→108.3 (-5.4%)；两模式 bbox 宽于 ImageInk 约 20%（20.35/19.75%）；2 rounds x 10 blocks | 与 handoff 一致 |
| native-ab.json | textType=1 与 textType=2 各 1-2 轮；lineCount 恒 10；公司名两模式均命中 | 与 handoff 一致 |
| source-vs-reconstruction.json | sourceCenterMAE=17.14；reconWidthMAE=99.1 (379.7%)；attribution=RECONSTRUCTION_PRIMARY | 与 handoff 一致 |
| e2e-front-back-isolation.json | front→back→front；calibrated 不重复创建；mid-switch PAGE_IDENTITY_CHANGED 停止；acceptance.pass=true | 与 handoff 一致 |

- runtime/reports/stage-9 实际 ls 确认：不存在 font-target-ab* 文件（Commit 3 真机 A/B 确未产生，handoff 声明属实，不伪造）。
- 旧报告 1.042 / 0.96 / 0.795 仅诊断值；resolveTypographyTarget 仅 ×scale，无 K 系常量进 target 计算。

### 5. 独立重跑测试（验证 07_TEST_STATUS 真实性）

- image-ink-target 14/14；recognition-mode 9/9；transaction-identity 10/10；native-ocr-provider 12/12；
  text-truth-gate 10/10；baidu-profile 7/7；native-ocr-diff 7/7；altq-provider 10/10；text-geometry-matcher 10/10
- Stage 9 合计 89/89；legacy（baidu-provider/common-schema）ALL PASS；node --check 4 文件 OK

## 备注（不影响 PASS 的差异 / 环境差异）

1. 本机机既有 checkout 是另一并发会话（ai2-repo-governance）的脏工作树，与 Stage 9 无关；本次核验/后续作业使用新克隆目录（tracking origin/stage-9-altq-baidu-reconstruction），不触碰其他分支。
2. origin/demo 本次 fetch 后为 3853742（docs: add AI takeover audit），与 handoff 冻结声明 61cd248 不同——系远端他人/后续会话更新，不影响 Stage 9 分支；本 Agent 不操作 demo（铁律 6 / 风险 13）。
3. 凭据：本会话环境未注入 ZY_STAGE9_COOKIE / ZY_BAIDU_AK / ZY_BAIDU_SK（env 未发现）。P4-B Commit 3 为真机 A/B，需用户按 09_SECRET_ENV_NAMES.md 范式注入 runtime env 后执行；未注入前不得伪造或占位（09 纪律 3）。