# 08 — Runtime Evidence Index（Stage 9 真机证据索引）

> 索引全部 `runtime/reports/` 中 Stage 9 相关证据。`runtime/reports/stage-9/` 为主目录；`runtime/reports/stage-8b/` 存有 Stage 8 真机（v23 等）被 Stage 9 复用。
> 标注 COPY 的 5 份已在 `handoff/stage9-p4b-2026-09-20/reports/` 留有副本（原文件未移动）。

## runtime/reports/stage-9/（主证据）

| 文件 | 内容 | 关键结论 | 副本 |
| --- | --- | --- | --- |
| `font-calibration-audit.json` | P4-A：10 块四层几何 + K1-K6 + 分组稳定性 | K1=0.956 STABLE / K2=0.795 UNSTABLE / K4=1.042 / K5=0.929 STABLE；禁全局乘数 | ✅ COPY |
| `baidu-geometry-benchmark.json` | P2：standard/accurate vs ImageInk（局部 Otsu），含原始 location+probability + perRound | accurate 全轴略优（width MAE 114.5→108.3，-5.4%）；两模式 bbox 均比 ImageInk 宽约 20%；height 受并线污染仅参考 | ✅ COPY |
| `native-ab.json` | Native 印刷体(1)/手写体(2) A/B：10 行 rawText + mode/lineCount | 行数恒 10；公司名两模式均=佛山盛盈包装制品有限公司；手写体邮箱 ltd→Itd 更差；changedLines 5/10 全为标点/空格 | ✅ COPY |
| `source-vs-reconstruction.json` | v23：10 块 Source(OCR块)/ImageInk(区域)/EditorInk 四层 + MAE + attribution | SOURCE center MAE 17.1px；RECON width MAE 99px/380%（碎片块）；attribution=RECONSTRUCTION_PRIMARY | ✅ COPY |
| `e2e-front-back-isolation.json` | P3 真机双面隔离 E2E（ac530ab 二次运行 PASS） | front→back→front 三段：NEW 3 建 / CAL 3 原位更新 0 复制 / 中途切页 PAGE_IDENTITY_CHANGED；acceptance pass=true | ✅ COPY |
| `bench-blocks-input.json` | audit 中间产物（10 块输入） | — | — |
| `source-vs-reconstruction.json`（见上） | — | — | — |
| `altq-deep.json` / `altq-discovery.json` | Alt+Q 探测（反证：无绑定） | ALTQ_UNAVAILABLE | — |
| `jsj-login-scan.json` | jsj 登录态菜单枚举 | 登录后工具菜单仍无文字识别入口 | — |
| `native-ocr-discovery.json` / `native-ocr-replay.json` / `ocrtool-discovery*.json` / `precision-discovery.json` | Native 协议发现/重放/精准取证 | uploadOCR.do FormData{file,textType} → userData <br/> 分行 | — |
| `precision-ab.json` | Native 精准 A/B 汇总 | 同 native-ab | — |

## runtime/reports/stage-8b/（Stage 8 真机，Stage 9 复用）

| 文件 | 用途 |
| --- | --- |
| `real-card-gate-a0-v03211223.json`（及 16-27 各轮） | v23 基线（raw97/created10/ink10）—— Stage 9 多份审计的 Source 层来源 |
| `font-metrics-audit.json` | SimHei synthetic 标定（advance/actualBoundingBox/rasterInk 比例） |
| `background-image-audit-*.json` | 8B 旋转/缩放全矩阵（Stage 9 未改其行为） |

## 搜索确认

已按关键字 `stage9 / stage-9 / STAGE-9 / e2e / isolation / text-truth / transaction / font / baidu / native / precision` 检索 `runtime/reports/` 与 `docs/`：
- `e2e-front-back-isolation.json` **存在**（已入索引 + 副本）。
- 未发现名含 `font-target-ab` 的报告（= 说明 P4-B Commit 3 尚未产生真机 A/B 证据，符合预期，勿伪造）。
- Stage 9 设计/协议文档另见 `docs/`（STAGE_9_NATIVE_OCR_PROTOCOL.md、STAGE_7_PAGE_OWNERSHIP_REPORT.md 等）与各 `STAGE_*_REPORT.md`。

## 关键真机环境参数（值不落盘）

- 目标编辑器：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`（单面 data；反面经 `.page-group .pageNum` tab 点击后 materialize 为 c0+c1）
- 名片样本：`runtime/stage8b/assets/real-card-shengying.png`（895×577）