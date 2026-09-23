# 02 — Stage 9 完整上下文

## 总目标（最终主链）

```
图片 → OCR → Native Text Truth → Page Identity → Geometry → Image Ink
     → Font Target → Editor Font → Actual Ink → Position → Visual Verification
```

角色分工（硬规则）：

| 层 | 角色 |
| --- | --- |
| Native OCR | **文字最终真值**（`textbox.text === native.rawText`，禁 trim/sanitize/AI/Baidu/Local 覆盖） |
| Baidu OCR | **Geometry evidence**（standard/accurate bbox location） |
| Local OCR（Tesseract） | Geometry/layout evidence（fallback 路径） |
| ImageInk | **Typography evidence**（视觉墨迹宽度，P4-B 实验 target 来源） |
| Page Identity | pageId/transactionId/imageFingerprint/side/canvasId（正反硬隔离） |

## Native OCR 状态（已定案，勿改）

- endpoint：`POST /siteWeb/userCenterJsj/uploadOCR.do`
- FormData：`{ file, textType }`
- 默认策略（用户实测确定）：**textType=2（手写体）优先；失败/空结果自动回退 textType=1（印刷体）**，重试一次（`recognizeWithFallback`，meta.modeUsed/fallbackUsed 记录，不评分不猜内容）
- 站内 OCR 只返回纯文本（`userData` 以 `<br/>` 分行，无 bbox）→ Native 仅 Text Truth
- 会话依赖：页面上下文自动携带 Cookie（绝不记录 Cookie 值）
- 模块：`extension/src/ocr/native-ocr-provider.js`、`text-truth-gate.js`（FAIL_BAIDU_TEXT_LEAK / FAIL_LOCAL_OCR_TEXT_LEAK / FAIL_NATIVE_TEXT_MISMATCH）
- feature：`zyStage9NativeTruth=1`；`zyStage9NativeOcrMode=2`（实验开关）

## Baidu OCR 状态

- profiles（`extension/src/ocr/baidu-provider.js`）：
  - `standard` → `/rest/2.0/ocr/v1/general`（通用文字识别·标准含位置版）
  - `accurate` → `/rest/2.0/ocr/v1/accurate`（高精度含位置版）
- 实验开关：`zyBaiduOcrMode`（standard|accurate，默认 standard）
- **铁律**：Standard/Accurate 终选必须以真实 A/B 几何证据决定（见 evidence index），不允许凭接口名直接判断。真机 A/B（P2）结论：accurate 全轴略优于 standard（width MAE 114.5→108.3，-5.4%），且两模式 bbox 宽度均比 ImageInk 平均宽约 20%（20.4/19.7%）。

## P4-A 真实结论（391e92e）

K 系（10 个真实重建块，来源 v23 报告 + baidu benchmark + native-ab + 浏览器 measureText）：

| K | median | 稳定性 | 含义 |
| --- | --- | --- | --- |
| K1 = ImageInkW / OCRBBoxW | 0.956 | STABLE | OCR bbox ≈ ImageInk（非主要 padding 源） |
| K2 = EditorInkW / ImageInkW | 0.795 | **UNSTABLE** | 30-50px 组 0.403 / 50-80px 组 1.290（分层分离） |
| K3 = AdvanceW / ImageInkW | 0.580 | UNSTABLE | zh advance 仅为 ink 58%（mix 1.015） |
| K4 = AdvanceW / EditorInkW | 1.042 | UNSTABLE | measureText vs EditorInk 系统偏差仅 4% → 排除“advance 推大字号” |
| K5 = EditorInkH / fontSize | 0.929 | STABLE | 编辑器墨迹高度模型合理 |
| K6 = ImageInkH / fontSize | 1.810 | UNSTABLE | 源图墨迹高受区域合并污染 |

结论与禁条：

- 归因方向：**宽度 target 来源错配 + sizeBucket 分层不稳定**；字号/高度模型本身较好。
- **禁止**把任何数字变成 production multiplier：不允 `K2→×1.25`、`K4→×0.96`、`K1→×0.956`、`K3→×…`。
- 样本不足（10 块分 3 层后每格 1–6）→ 不能现在建立稳定分层校准表。

## P4-B 当前代码状态（a37b35f，0.3.11.40）

| 文件 | 职责 |
| --- | --- |
| `extension/src/editor/image-ink-target.js` | 纯函数：gray buffer + block region → 局部 Otsu 少数类前景 → ink bbox；失败显式 reason（NO_REGION/NO_INK），不伪造 inkWidth；node 单测真源 |
| `extension/src/editor/font-target-source.js` | `resolveTypographyTarget`：bbox 模式→OCR_BBOX；image-ink+valid→IMAGE_INK；image-ink+invalid→OCR_BBOX_FALLBACK；零乘数 |
| `extension/src/editor/page-bridge.js` | 新增只读 `inkMeasure`（源图 active→background→first image → 灰度 → 局部 Otsu → 每 block ink）；**页桥为 toString() 自包含注入，无法访问 @require 沙箱函数 → 与 image-ink-target.js 同构的自包含实现（这是已知实现事实，不是两套设计）** |
| `zheliyin-card-assistant.user.js` | `buildItemsFromOcr` 接线：`zyStage9FontInkTarget`（默认 "0"）→ resolveTypographyTarget 统一 `targetVisualWidth`（solveFontSizeFusion）与 `estimateTextLayout.visualWidth`（layoutWidth）**同源**；诊断 targetSource/targetWidth/ocrBBoxTargetWidth/imageInkTargetWidth/inkFallback；FONT_TARGET 日志；bridgeCall 支持 payload |
| `extension/assistant.js` / `manifest.json` / `runtime/runtime-manifest.json` | 版本 0.3.11.40（25 模块） |

## Feature Flag 总表（当前值）

| Flag | 默认 | 用途 |
| --- | --- | --- |
| `zyStage9NativeTruth` | 1 | Native Text Truth 主链 |
| `zyStage9NativeOcrMode` | "2" | Native 手写体优先 |
| `zyBaiduOcrMode` | standard | 百度 standard/accurate 实验 |
| `zyStage9FontInkTarget` | **"0"** | P4-B ImageInk typography target 实验（ON 才用 ImageInk） |
| `zyStage9Calibration` | "1" | NEW/CALIBRATION/RETRY 路由（画布已有文字→校准） |

## 数据流（P4-B target 同源）

```
OCRBBox → ImageInk(实验) → resolveTypographyTarget → targetVisualWidth → solveFontSizeFusion → fontSize
                              └─（同一 resolved target）→ estimateTextLayout.visualWidth → layoutWidth
```

修复了旧双重标准（字号按 A、layoutWidth 按 B）。ImageInk **只能**进 typography target；**禁止**改 targetQuad/position/pageId/transactionId/fingerprint/side/rotation。

## 已知未完成

- P4-B Commit 3（真机 A/B：A1/A2/B1/B2 × ≥2 runs）未开始 — 见 `04_NEXT_TASK.md`
- P4-B Commit 4（结论文档）未开始
- P4-C（FS_MIN=10）未开始
- P4-D（bounded loop 职责收敛）未开始
- solver 保持 `advance-first + ink-height secondary + ocr-height sanity + quality gate`，`FS_MIN=8`
- geometry 闭环已存在 `for (round<4)`，P4-D 不得新增第二套 loop
- Recognition Mode：NEW（空画布新建）/ CALIBRATION（已有文字→更新现有对象，不删除重建）/ RETRY（同页同指纹→重取证+校准，不复制）
- Page Identity：OCR 中途切页 → `PAGE_IDENTITY_CHANGED` → STOP