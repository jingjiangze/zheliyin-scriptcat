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
| 4.6-0b | 27cb187 | 真机回退修复：inkV 作用域 ReferenceError（inkByBlock 安全访问）+ diag confidence 字段 + V0/B 报告输出 |
| 4.6-SESSION | 552a4ce | 会话 cookie 自动续期：session-probe（OCRTool.do 抓取 + 自动登录 + 保守合并）+ commit-46-real 主循环前内嵌 |

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

## 9. real-device result（全量 A/B，2026-09-22，P0 自动登录会话）

- **会话**：4.6-SESSION-b probe 自动登录（P0_LOGIN_USER/PASS → login.do → 门店页签发 diy-User-third）；
  `cookieSource=probe`、identity=true（完整身份，非 merged）。
- **执行**：`node runtime/stage9/commit-46-real.js`（ZY_CASE=V0,V15,V45；ZY_AB=A,B；ZY_SESSION_REFRESH=1=强制重抓）。
  6 个 run 全部 Native OCR 通过：保留=创建成功、通过 0 个（Native Anchor 复用语义）、拒绝 0 个。

| Case | AB 模式 | 旋转 | 保留行 | renderedInk 对比行 | leftShift(dx< -2) 行数 | dx 范围（代表性） |
|------|---------|------|-------|--------------------|----------------------|-------------------|
| V0 | A（旧 OCR bbox） | 0° | 15 | 10 | 10 | -5.9 ~ -15.4（夏祝莲 -14.03） |
| V0 | B（Visual Ink 默认） | 0° | 15 | 10 | 10 | -16.0 ~ -75.7（夏祝莲 -75.66） |
| V15 | A | 15° | 12 | 10 | 6 | -6.5 ~ -39.4（广州爱卡奇硅胶制品有限公司 -39.39） |
| V15 | B | 15° | 11 | 9 | 9 | -12.3 ~ -56.3（夏祝莲 -56.29） |
| V45 | A | 45° | 3 | 3 | 1 | Xia Zhu Lian -10.28 |
| V45 | B | 45° | 2 | 2 | 2 | 夏祝莲 -7.94 / Xia Zhu Lian -26.21 |

- **A/B 对照信号（Commit 4.6 修复方向证据）**：
  1. **整体左移真实存在，且 B（Visual Ink 目标）比 A（旧 OCR bbox）更偏**：V0 下 B dx=-16~-76px（夏祝莲 -75.66），
     A dx=-6~-15px（夏祝莲 -14.03）；V15 同向。→ 左移修复点落在 Visual Target 求解环节（targetLeft 过右），
     非渲染端单点问题。
  2. 真机 IMAGE_INK 全部未过 0.30 confidence 门槛（B 模式实际回落 OCR_BBOX_FALLBACK），逐行 visualGeometrySource 见 per-case JSON ——
     门槛按本表 dx 分布收紧/放宽另议（§10）。
  3. **旋转越大保留越少**：V15 保留 11-12 行、V45 仅 2-3 行（其余 unmatched），符合旋转下 geometry 映射考验点。
  4. 字号全部 NORMAL（ink/ocr ratio 0.86~0.98，未触发 INK_TOO_LARGE）；颜色 fillGate 以 MULTI_MODAL / FOREGROUND_RELIABLE 为主（逐行见 per-case JSON）。
- 报告件：`runtime/reports/stage-9/commit-46-real.json` + per-case `commit-46-real-{case}-{ab}.json`（cookie 只记名）。

## 10. unresolved

- ~~Native OCR 会话过期（真机 A/B 全量证据受阻）~~ ✅ 已解除（4.6-SESSION-b，见 §13.1/§9）：
  resolveStage9Cookie() 自动续期 + P0 自动登录已内嵌 runner；全量 A/B（V0/V15/V45 × A/B）走 probe 自动登录路径（cookieSource=probe），6/6 run 通过。
- IMAGE_INK 可靠性门槛 0.30 为「经验下界」（任务书 §5 明示不设未经实验的极端固定阈值）；
  真机复跑后按实测 dominance/rowBandConfidence 分布收紧或补充证据。
- GitHub 网络（github.com:443）间歇不可达问题已解除：4.6-SESSION 系列全部双推完成（见 §11）。

## 11. Git SHA

- test = stage 本地 HEAD：cc99f43（含 4.6-A … 4.6-0b、4.6-SESSION、4.6-SESSION-b 全部子提交）
- 推送状态：4.6-SESSION 系列（552a4ce/726bdeb）已双推；本报告随 4.6-SESSION-b（56ed36e）的 docs 子提交推送
- main / demo 未动（任务书 §0 约束保持）

## 12. 禁止项合规声明

本 Commit 未使用：全局字号 multiplier / 全局 left offset / 全局颜色替换 / 固定 fontSize /
固定 bbox 缩放 / 随机微调 / 手工 case-by-case 坐标；未修改 Native OCR Truth、textType=2、
Native Create 主入口、Native Layer Contract、Page Ownership、Partial Create semantics。
## 13. 会话自动续期（4.6-SESSION）

- 需求（用户）：会话 cookie 过期时，自动去 `https://diy.zheliyin.com/siteWeb/userCenterJsj/OCRTool.do` 抓取最新，并内嵌到脚本。
- 实现（`runtime/stage9/session-probe.js`，可 require 模块）：
  - `probe()`：playwright 持久 profile → index.do + OCRTool.do → `browser.cookies()` 全域抓取 zheliyin 域 cookie（含 httpOnly）→ 拼串。
  - `tryAutoLogin()`：缺身份 cookie 且注入 `P0_LOGIN_USER/P0_LOGIN_PASS` 时，自动填表 `login.do`（#userAccount / #userPassword / #accountLogin）重建会话。
  - `mergeCookies(base, fresh, freshHasIdentity)`：fresh 带完整身份 → 整体采用 fresh（SESSION 与身份同源最新）；fresh 缺身份（匿名）→ 保守保留 base 已验证 SESSION，仅补齐 fresh 新增字段（Hm_* 等）。
  - `resolveStage9Cookie()`：env ZY_STAGE9_COOKIE（显式优先）→ probe 自动抓取（ZY_SESSION_REFRESH=1 或未注入 env 时执行）→ 上次已知全量兜底（标记可能过期）。
- 接线（`runtime/stage9/commit-46-real.js`）：主循环前 `await probeMod.resolveStage9Cookie()`；报告记录 cookieSource / cookieWarning（cookie 只记名，不落库）。
- 真机验证（V0/B，无 env cookie，走 probe 自动抓取路径）：
  - cookieSource=merged；Native OCR **通过**：「几何校验完成：通过 0 个，保留 15 个」；visualRows=15；renderedInkCompare=10。
  - leftShift 证据复现（与手动注入 cookie 结果一致）：夏祝莲 dx=-75.66、13719111188 dx=-52.42、微信: dx=-23.43 等，供 Commit 4.6 修复对照。
- 真机经验事实（2026-09-22）：
  1. 持久 profile 未登录时（缺 `diy-User-third`）→ Native OCR SESSION_EXPIRED；匿名新 SESSION 会**破坏**已验证 cookie → 合并必须保守（保留已验证 SESSION）。
  2. `browser.addCookies()` 注入的 cookie **不跨重启持久** → probe 每次运行重新抓取/合并；profile 是否登录决定产出「probe（完整身份）」或「merged（保守兜底）」。
  3. 注入 `P0_LOGIN_USER/P0_LOGIN_PASS` 后，probe 可自动登录 `login.do` 重建完整身份 —— ✅ 已实测（见 §13.1）。
- 复现命令：`node runtime/stage9/commit-46-real.js --selftest` → `node runtime/stage9/commit-46-real.js`（可选 `ZY_SESSION_REFRESH=1`、`ZY_CASE`/`ZY_AB`）。

### 13.1 P0 自动登录自愈（4.6-SESSION-b）

- 注入 `P0_LOGIN_USER` / `P0_LOGIN_PASS` 后 **probe 自动登录真机验证通过**：`source=probe`、`identity=true`
  （cookie 含 `diy-User-third` + `SESSION` + `thirdMember` + `thirdLocalForage`）。
- 登录流程关键实现（login.do，成熟做法取自 autologin3.js / p0/runner.js）：
  1. 登录面板为弹窗：外层 `.mask-bg.zLoginOut`（display:none）包裹 `.zLoginTan` → `#userAccount`/`#userPassword` 存在但 0×0 不可交互，需先翻转 mask 层级展开；
  2. 填表用原生 setter + input/change（React 受控输入），提交优先 `#accountLogin`，否则匹配可见「登录/确定」文本；
  3. **登录成功仅签发 SESSION**（login.do 弹「请检查链接中店铺编码」alert）；`diy-User-third` 需跳门店设计页
     （STORE_URL = /diyWeb/third/252438/2114747/999/thirdDiyAdd.do）后才 Set-Cookie → tryAutoLogin 先等 SESSION → 跳门店页 → 再验身份。
- 凭据仅运行时环境变量（P0_LOGIN_USER/P0_LOGIN_PASS），不落库、不入报告 value；cookie 串仅写 %TEMP% 且报告只记名。
- 全量 A/B 借此会话跑通（§9）。
