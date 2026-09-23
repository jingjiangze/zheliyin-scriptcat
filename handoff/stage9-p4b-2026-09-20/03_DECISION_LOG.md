# 03 — Decision Log（关键设计决策）

## D1. Native OCR = 绝对文字真值
- 定案：`textbox.text === native.rawText`（原样，禁 trim/归一/标点清洗）。
- 依据：用户实测 + v25/v26 真机双轮验证；Baidu/Tesseract/AI 文本禁止进入最终 textbox。
- 反例记录：手写体(textType=2)邮箱 `ltd→Itd` 实为更差，但结论仍是"手写体优先"（用户指令优先于该单点差异）。

## D2. Native 默认策略：手写体优先
- `textType=2` 优先，`recognizeWithFallback` 失败/空结果回退 `textType=1` 重试一次。
- **用户明示**：不因新 Agent 接手而改成 textType=1。

## D3. Baidu = Geometry Evidence（不参与文字）
- Standard(/general) vs Accurate(/accurate) 由 `zyBaiduOcrMode` 实验切换。
- 终选必须由真机 A/B（P2 基准）决定；当前证据：accurate 全轴略优但差距很小，两模式 bbox 均比 ImageInk 宽约 20%。

## D4. Page / Transaction / Object Identity（P1）
- 每次 OCR 事务 = {transactionId, pageId, side, canvasId, imageFingerprint, imageWidth/Height, createdAt}。
- `zy-ocr-{transactionId}-{blockIndex}` key + `zyOcrObjectId`；正反各自独立 Session。
- ocrCreate/ocrAdjust/ocrCalibrate 全部强制 Page Ownership；切页 → `PAGE_IDENTITY_CHANGED` → STOP（禁 findCanvasForSide 自动找另一画布）。

## D5. NEW / CALIBRATION / RETRY（P3）
- 空画布→NEW（创建）；已有文字+不同图→CALIBRATION（更新现有对象 identity，不删除重建）；同页同指纹+已有文字→RETRY（重新取证+校准，不复制）。
- feature `zyStage9Calibration=1` 默认开启。

## D6. ImageInk = Typography evidence（P4-B 实验）
- 仅作 typography target；禁止触碰 source geometry/position/quad/identity。
- 默认 OFF（`zyStage9FontInkTarget=0`=OCR bbox 行为）；ON 才实验。
- 失败必须显式 fallback（NO_INK/NO_REGION → OCR_BBOX_FALLBACK），禁止伪造 inkWidth / `Math.max(inkWidth,bboxWidth)` 之类的安全修复。

## D7. 禁止固定乘数（P4-A 后）
- K1/K2/K3/K4/K6 任何值（0.956/0.795/0.580/1.042/1.81）都**不得**转成 global multiplier。
- 只有多卡多 bucket 证据稳定的分层校准表才可能（目前样本不足）。

## D8. 页桥自包含实现（实现事实，非设计分歧）
- page-bridge 通过 `toString()` 注入页面世界自包含字符串 → 无法引用 userscript `@require` 沙箱函数 → `inkMeasure` handler 与 `image-ink-target.js` 同构自包含。node 单测以模块为真源。

## D9. 字号与 layoutWidth 同源（P4-B）
- `resolveTypographyTarget` 的单一 width 同时供 `solveFontSizeFusion.targetVisualWidth` 与 `estimateTextLayout.visualWidth`。
- 修复历史双重 target 来源问题。

## D10. A/B 必须 fresh runtime
- `BAIDU_OCR_MODE / STAGE9_NATIVE_OCR_MODE / STAGE9_FONT_INK_TARGET` 在 userscript 初始化时读取 → 不能在同一已加载页面改 GM 值后继续跑；必须新 page/新 context 或完整 reload 后重跑（见 04）。

## D11. 版本纪律
- 每次生产改动独立 commit + 五处升版（userscript @version/VERSION/@require?v=、manifest version/version_name、assistant.js）+ runtime-manifest 重新生成；evidence 单独 commit（不升版）。

## 禁止事项（延续到未来）
- force push / reset / 改写历史；删除或覆盖既有真机证据；改现代 ShDemo 的 demo 分支；把实验 flag 默认改 ON；跨阶段并行（Commit3→Commit4→P4-C→P4-D 顺序）。