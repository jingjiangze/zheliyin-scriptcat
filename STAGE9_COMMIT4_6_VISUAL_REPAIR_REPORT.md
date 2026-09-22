# STAGE9_COMMIT4_6_VISUAL_REPAIR_REPORT

- 日期：2026-09-22
- 版本：0.3.11.55 → 0.3.11.56
- 任务书：Commit 4.6 — OCR Visual Geometry / Typography / Color 修复
- 分支基线：test = stage-9-altq-baidu-reconstruction = 2a2dc37（4.5）
- 本 Commit 子提交（每步：audit → modify → unit test → runtime test → commit → push）：

| 子提交 | SHA（test） | 内容 |
|--------|------------|------|
| 4.6-A | d0ca209 | ImageInk Visual BBox（防污染算法 + page-bridge 同构 + 接线）+ image-ink-visual.test.js |
| 4.6-B | d42f0e2 | Typography Ink 安全（evaluateInkEvidenceForFontSize + inkTrusted）+ text-fit-ink-safety.test.js |
| 4.6-C | f9b28f1 | Native Anchor MATCH 完整同步样式/几何 + native-anchor-style-apply.test.js |
| 4.6-D | 58a0f3c | 颜色 Confidence 门禁（dominance/ambiguity/multiModal + shouldApplyFill）+ color-confidence.test.js |
| 4.6-E | 8545e44 | 升版 0.3.11.56（@version/@require?v=/const VERSION 统一）+ UI 状态文案「保留=创建成功」 |
| 4.6-0 | 79854b2 | 真机只读证据采集（__zyStage9VisualDiag）+ commit-46-real.js（A/B runner） |

## 1. 左移根因

**root cause：OCR bbox 直接当作最终视觉位置。**

- 旧行为：`b.bbox → mapRectToCanvas → targetQuad`，OCR bbox 是引擎 padding 产物，
  Left 含引擎左 padding，导致文字整体左移（真机截图中「整体偏左」）。
- 修复（4.6-A）：概念分离 `OCR_BBOX（识别/搜索区域）→ SOURCE_INK_BOX（防污染视觉墨迹）
  → VISUAL_TARGET_BOX（视觉目标）`。`buildItemsFromOcr()` 中仅在 Ink 证据满足
  `ok + confidence >= 0.30 + coverage 合理 + bbox 有效` 时切换到 ImageInk.inkBox，
  否则回退 OCR bbox 并标记 `visualGeometrySource = IMAGE_INK | OCR_BBOX_FALLBACK`。
- 坐标映射统一：`visualBBox → buildImageTransform() → mapRectToCanvas → targetQuad`
  （禁止 `left -= N` / magic offset；禁止 `canvas left -= N`）。
- 旋转：visualBBox 四角顶点 → affine → targetQuad（非 AABB 后旋转）。
  测试覆盖 0°/15°/30°/45°/90°/105°（rotation-recovery / image-ink-visual）。

## 2. 字号根因

**root cause：inkHeight 无条件最高优先级，污染时强制主导 fontSize（「服务热线」异常大）。**

- 旧逻辑：`inkHeight 与 advance 冲突 >15% → 仍然使用 ink`。
- 修复（4.6-B）：新增 `evaluateInkEvidenceForFontSize()`，先判可信度：
  - `INK_TOO_LARGE`：ink/ocr > 2.2（疑似多行/纹理污染）
  - `INK_TOO_SMALL`：ink/ocr < 0.35
  - `ADVANCE_INK_CONFLICT`：advance 与 ink 差异 > 15%（OK_BOTH_RATIO）
  - `INK_INVALID`：inkHeight 缺失/非正数
  - 正常 → `fontEvidenceStatus = NORMAL` 才进入融合；异常 → 改走 advance 主求解
    （`advance-width-primary-ink-invalid`）或 OCR height sanity，warnings 记录拒绝原因（禁静默 clamp）。
- 诊断输出：`fusion8d.fontEvidence = { status（细分）, fontEvidenceStatus, diagnosis, inkToOcrRatio,
  advanceFontSize, inkFontSize, inkHeight, ocrHeight }`（userscript diagnostics 透传）。

## 3. 颜色根因

**root cause：`if (o && o.ok)` 即应用颜色，双色污染/纹理/低集中度被强制设为主色。**

- 修复（4.6-D）：extractForegroundColor 输出 `dominance / ambiguity / multiModal`；
  生产应用前必须过 `shouldApplyFill()`：
  - ok + dominance >= 0.35（主色集中）+ 非 multiModal + ambiguity 合理 → 才设 fill
  - 弱证据 → `skipped: true`（证据保留但不设 base.fill），**保留 Native 默认色**，
    禁止「颜色证据弱 → 强制设黑/棕/任意主色」。
- 颜色与位置同源：颜色采样 region 复用 `inkByBlock.inkBox`（visualInkBox），
  即 Color / Position / Typography 全部来自同一 visual ink 区域（§13）。

## 4. Anchor 是否参与本次错误

- **不参与左移/字号/颜色根因**（Anchor MATCH 只复用身份与更新 text/fill，几何来自模板旧对象）。
- 4.6-C 补齐：MATCH 后完整同步 `left/top/width/height/angle/fontSize/fontFamily/fontWeight/fontStyle`，
  并 `setCoords() + syncBusinessFieldsFromObject()`；identity（uuid/multiUuid/markuuid/zyOcrObjectId）保持不变；
  禁止删除重建。fill 仍仅可靠颜色证据时更新（弱证据保留原生 fill）。

## 5. 旧/新 target geometry 对照

| 维度 | 旧（OCR_BBOX） | 新（IMAGE_INK） |
|------|--------------|----------------|
| 来源 | OCR bbox（引擎 padding 产物，带 left padding） | visualInkBox（行投影主文字带，左缘收敛） |
| 映射 | bbox → mapRectToCanvas | visualBBox → buildImageTransform → mapRectToCanvas |
| 来源标记 | 无 | visualGeometrySource: IMAGE_INK / OCR_BBOX_FALLBACK |
| 判定证据 | 无 | inkBox / inkWidth/Height / coverage / confidence / componentCount / rowBandConfidence |

真机 A/B（V0 直排 / V15 / V45，A=强制 OCR_BBOX、B=IMAGE_INK）由 `commit-46-real.js` 采集，
每 block 记录 ocrBBox / imageInkBox / targetQuad / targetGeometry / fontSize / fillGate /
fontSizeEvidence / visualGeometrySource / anchorUsed，并计算 actualInk vs target 的
dx/dy/widthGap/heightGap + leftShiftObserved（任务书 §18/§19）。

## 6. 旧/新 fontSize 对照

| 场景 | 旧（ink 无条件） | 新（ink 可信才进融合） |
|------|----------------|----------------------|
| ink/ocr >= 2.2（多行/纹理污染） | 用 ink → 字号异常大 | INK_TOO_LARGE → advance 主求解 |
| advance/ink 冲突 >15% | 仍用 ink | ADVANCE_INK_CONFLICT → 按证据链决断（advance/sanity） |
| ink 正常 | 用 ink | NORMAL → ink-height 与 advance 一致采用 |
| ink 过小 <0.35 | 用 ink | INK_TOO_SMALL → advance / OCR sanity |

## 7. 旧/新 color evidence

| 场景 | 旧（o.ok 即应用） | 新（shouldApplyFill 门禁） |
|------|------------------|--------------------------|
| 黑字+红字同区域 | 强制主色 | multiModal → skipped（保留 Native 色） |
| 低 dominance 噪点 | 强制 | DOMINANCE_LOW → skipped |
| 单色文字 | 应用 | FOREGROUND_RELIABLE → 应用 |

## 8. 单测与回归

- 新增单测：image-ink-visual.test.js（8）、text-fit-ink-safety.test.js（8）、
  native-anchor-style-apply.test.js（9）、color-confidence.test.js（7）
- stage9 全量回归：**27 文件 / 27 PASS / 0 FAIL**（含既有全部回归用例，无回归）
- runner selftest：commit-46-real.js --selftest ALL PASS（A/B 注入开关验证）
- 语法检查：userscript / page-bridge / text-fit-fusion / native-color / 新模块 node --check 全过

## 9. real-device result（截至报告生成）

- **受阻项**：Native OCR **SESSION_EXPIRED**（会话 cookie 过期），
  `uploadOCR.do` 走登录跳转；本 Commit 已保存运行轨迹：
  - Baidu external 路径可达（diy:200 / raw:200）
  - Native OCR 返回 SESSION_EXPIRED → 按既有语义「本批不创建」
    （禁止用其它 OCR 文本进入画布，符合 Native Truth 铁律）
  - runner 完整链路（editor-ready / bg-inject / ocr-prepare / click-ocr / rollback）已实际执行通过
- **待会话重建后补跑**：注入新 ZY_STAGE9_COOKIE（或 P0_LOGIN_USER/PASS），
  重跑 `node runtime/stage9/commit-46-real.js --selftest` 后
  `node runtime/stage9/commit-46-real.js`
  产出 A/B targetQuad / fontSize / fill / actual geometry / rendered ink 对照 + leftShift 判定。

## 10. unresolved

- Native OCR 会话过期：真机 A/B 全量证据待会话重建（环境变量注入即可，runner 已就绪）。
- IMAGE_INK 可靠性门槛 0.30 为「经验下界」（任务书 §5 明示不设未经实验的极端固定阈值）；
  真机复跑后按实测 dominance/rowBandConfidence 分布收紧或补充证据。
- GitHub 网络（github.com:443）间歇不可达：本次多笔提交已本地 commit 完成，
  推送至 test 与 stage-9-altq-baidu-reconstruction 待网络恢复后一次性双推（raw 已确认可达）。

## 11. Git SHA

- test = stage 本地 HEAD：79854b2（含 4.6-A … 4.6-0 全部子提交）
- 推送状态：4.6-A/B 已双推（d42f0e2）；4.6-C/D/E/0 本地 commit，GitHub 网络恢复后双推
- main / demo 未动（任务书 §0 约束保持）

## 12. 禁止项合规声明

本 Commit 未使用：全局字号 multiplier / 全局 left offset / 全局颜色替换 / 固定 fontSize /
固定 bbox 缩放 / 随机微调 / 手工 case-by-case 坐标；未修改 Native OCR Truth、textType=2、
Native Create 主入口、Native Layer Contract、Page Ownership、Partial Create semantics。