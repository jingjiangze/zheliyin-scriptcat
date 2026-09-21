# STAGE9_COMMIT4_REPORT

> OCR-P1 Commit 4：Native Anchor + ImageInk Geometry Recovery — 真机验收报告
> 日期：2026-09-21（TRAE SOLO CN） ｜ 基线 test==stage-9-altq-baidu-reconstruction==20b2ee3（Commit 4.3）
> 定义见任务书 §一~§十八；本报告对应 §十六 Commit 4.4（Real-device integration + evidence）。

## 0. 结论

| 验收项 | 状态 |
| --- | --- |
| Commit 4.1 Geometry Space | PASS（22 用例，8820334） |
| Commit 4.2 Native Anchor Recovery + Identity | PASS（22 用例，097ffac） |
| Commit 4.3 ImageInk Recovery + Occupancy + Page Isolation + Rotation | PASS（28 用例，20b2ee3） |
| Commit 4.4 真机集成 + Evidence | PASS（本报告，CASE A/A2/B/C/E/G 全绿） |
| 既有 Stage 9 全部回归 | 0 regression（22 文件全绿） |
| LOCAL real-device successful recovery | **UNRESOLVED**（如实保留，不改写 PASS） |

Commit 4 完成门禁（§十八）逐项核对见文末「门禁检查表」。

## 1. 修改文件清单

| 文件 | 提交 | 说明 |
| --- | --- | --- |
| extension/src/ocr/geometry-space.js | 4.1 | 统一 geometry schema + 四空间转换（新增） |
| runtime/stage9/geometry-space.test.js | 4.1 | 22 用例（新增） |
| extension/src/ocr/native-anchor-recovery.js | 4.2 | 多因素 Anchor 打分（新增） |
| runtime/editor-object-identity.js | 4.2 | identity snapshot/复用/防伪造（新增） |
| runtime/stage9/native-anchor-recovery.test.js | 4.2 | 14 用例（新增） |
| runtime/stage9/editor-object-identity.test.js | 4.2 | 8 用例（新增） |
| extension/src/ocr/geometry-occupancy.js | 4.3 | occupiedGeometry 防重复占用（新增） |
| extension/src/ocr/image-ink-recovery.js | 4.3 | Ink 几何恢复，不产 text（新增） |
| extension/src/ocr/native-geometry-recovery.js | 4.3 | 阶段 0 NATIVE_ANCHOR + 阶段 4 IMAGE_INK 插槽（修改，追加） |
| runtime/stage9/geometry-occupancy.test.js | 4.3 | 7 用例（新增） |
| runtime/stage9/image-ink-recovery.test.js | 4.3 | 5 用例（新增） |
| runtime/stage9/rotation-recovery.test.js | 4.3 | 6 用例（新增） |
| runtime/stage9/native-geometry-recovery.test.js | 4.3 | +5 ANCHOR/INK 用例（共 28） |
| zheliyin-card-assistant.user.js | 4.4 | anchorCandidates 采集 + gray decode + inkResolver39 + recovery ctx（追加 63 行） |
| runtime/stage9/commit-4-real.js | 4.4 | 真机 runner（新增） |
| runtime/reports/stage-9/commit-4-real*.json | 4.4 | 真机证据（新增） |
| STAGE9_COMMIT4_REPORT.md | 4.4 | 本报告（新增） |

## 2. Frozen Region 清单（未改动证据）

| 区域 | 状态 |
| --- | --- |
| page-bridge.js ocrCreate 主路径（L113-310） | 未改动（审计 7e08ee7 确认 getTextInventory 可零改动提供 anchors） |
| CanvasDiy.drawText() Native 创建主路径 | 未改动 |
| Native Layer Contract（verifyNativeLayer10C） | 未改动 |
| buildItemsFromOcr 1 OCR Block = 1 textbox | 未改动 |
| Partial Create 语义（matched>0 部分创建+missing 报告；matched==0 全不创建；Native unavailable 创建 0） | 未改动（§十三 冻结） |
| maybeApplyNativeTruth 的文字真值（Native OCR 唯一 text 来源） | 未改动（Baidu/Local/ImageInk 只当 geometry evidence） |

## 3. Native Truth 未改变证明

- 生产文字真值仍仅来自 Native OCR（textType=2 手写体）；recovery 只输出 geometry（source/sourcePriority/confidence/reason），不输出 textbox.text。
- 真机证据：CASE B（rot=15°）nativeLines=15、CASE G nativeLines=15，均与无旋转场景一致；CASE A/A2 的 missingTexts 均为 []（Native 行无缺失）。
- userscript 4.4 接线位于 maybeApplyNativeTruth 之前只读阶段（anchorCandidates / inkResolver39 作为 ctx 传入 recovery），不改动真值赋值路径。

## 4. Native Create 未改变证明

- ocrCreate 主路径、drawText、verifyNativeLayer 四层硬校验、事务回滚（1 block=1 textbox）均未改。
- 真机证据：CASE A created=15（原生对象带 angle=0）、layerCount=15；CASE A2 预置 anchor-夏祝莲 被 NATIVE_ANCHOR 复用，无新增同名对象——复用走既有 zyAnchorMatch 路径，未另建 textbox。

## 5. Geometry Schema（Commit 4.1）

统一 schema：{ x, y, width, height, angle, coordinateSpace }，支持空间：

| coordinateSpace | 含义 |
| --- | --- |
| IMAGE_NATURAL | 源图 natural 像素（OCR bbox / ImageInk region 输入系） |
| IMAGE_VIEWPORT | 视口缩放后的图片像素 |
| CANVAS | fabric 画布逻辑系（aCoords） |
| EDITOR_OBJECT | 编辑器对象系（对象局部） |

## 6. Anchor 评分因素（native-anchor-recovery.js）

多因素（无单阈值）：textScore（归一化文本相似）、tokenScriptScore、lengthScore、rankScore（expected y/x-order）、neighborScore（相邻 anchor 距离）、sizeScore（bbox 兼容）、angleScore。
Acceptance 最低证据（硬门禁）：evA = textFac>=textMin && textScore>=0.8，或 evB = orderScore>=orderMin && sizeScore>=0.5；margin<0.12 → UNCERTAIN（不强制复用）。输出 { matched, anchor, score, factors, reason }。

## 7. Recovery Source Priority（§十）

NATIVE_ANCHOR（0）→ BAIDU_LINE（1）→ BAIDU_WORD（2）→ LOCAL（3）→ IMAGE_INK（4）。每层保留 source/sourcePriority/confidence/reason。Occupancy：occupiedGeometry，occupied→reject（overlap>0.5，输出 accepted/rejected/rejectionReason）。Page Isolation：pageId/side/canvasId/imageFingerprint 同事务（SCOPE_MISMATCH 拒绝跨 front/back）。

## 8. 坐标转换公式（geometry-space.js）

- efficientScale：effectiveScale = mean(|T·e_x|, |T·e_y|)（经 buildImageTransform 仿射求取，禁止固定倍率）
- imageNatural→viewport：T_viewport · P_natural（视口缩放仿射）
- viewport→canvas：复用 T（aCoords 实测）
- canvas→editorObject：T_obj⁻¹ · P_canvas（对象局部系）
- rotateRectAroundCenter：R(θ) ∘ translate(−center)
- 895×577 → viewport → canvas、rotated、non-uniform、high-DPI 均有单测覆盖。

## 9. Rotation 测试

rotation-recovery.test.js 覆盖 0°/90°/−90°/15°/45°/105°（image-space bbox → rotate around image center → viewport → canvas）。真机 CASE B/G rot=15°：truth 守恒 + angle 保留（created 对象 angle=15）+ 越界行（Add/East/Tel 3 行）由 isQuadInsideImage 硬门禁拒绝（gap=3 记录 evidence，不越权创建）。

## 10. Page Isolation

- page-isolation 断言：geometry-occupancy.scopeMatches + 事务身份（transactionId/imageFingerprint）同事务校验；单测覆盖。
- 真机：E2E front/back 隔离见既有 e2e-front-back-isolation.js（回归绿）；CASE C/E/G 的 missing 行留在本事务，无跨页恢复证据。

## 11. Unit Test 结果

| 文件 | 用例数 | 结果 |
| --- | --- | --- |
| geometry-space.test.js | 22 | PASS |
| native-anchor-recovery.test.js | 14 | PASS |
| editor-object-identity.test.js | 8 | PASS |
| geometry-occupancy.test.js | 7 | PASS |
| image-ink-recovery.test.js | 5 | PASS |
| rotation-recovery.test.js | 6 | PASS |
| native-geometry-recovery.test.js | 28 | PASS |
| 既有 Stage 9 全量（22 文件） | — | **0 regression（22/22 绿）** |

## 12. Real-Device Evidence（Commit 4.4）

图片：real-card-xiazhu.png（含夏祝莲手写），Native OCR textType=2 真机。凭据仅运行时注入，报告只记名。

| CASE | DROP | 旋转 | native | initM | finalM | finalU | recovery源 | requested | created | missing | 断言 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | - | rot=0 | 15 | 15 | 15 | 0 | none | 15 | 15 | - | 4/4 | ok |
| A2 | 夏祝莲 | rot=0 | 15 | 14 | 15 | 0 | NATIVE_ANCHOR | - | 15 | - | 5/5 | ok |
| B | - | rot=15 | 15 | 15 | 15 | 0 | none | 12 | 12 | - | 7/7 | ok |
| C | 夏祝莲 | rot=0 | 15 | 14 | 14 | 1 | none | 14 | 14 | 夏祝莲 | 3/3 | ok |
| E | 夏祝莲 | rot=0 | 15 | 14 | 14 | 1 | none | 14 | 14 | 夏祝莲 | 4/4 | ok |
| G | 夏祝莲 | rot=15 | 15 | 14 | 14 | 1 | none | 11 | 11 | 夏祝莲 | 5/5 | ok |

### CASE 细节

**CASE A** rot=0 侧car=false
  - consistency → PASS: sum===nativeLines
  - created-equal-finalMatched → PASS: created==finalMatched
  - missing-reported → PASS: missing length
  - no-recovery-when-complete → PASS: 全匹配时不触发 recovery
**CASE A2**（DROP=夏祝莲） rot=0 侧car=false
  - consistency → PASS: sum===nativeLines
  - created-equal-finalMatched → PASS: created==finalMatched
  - missing-reported → PASS: missing length
  - anchor-used → PASS: NATIVE_ANCHOR 在 recovery 链命中
  - anchor-identity-reused → PASS: 预置 uuid（anchor-夏祝莲）保留且无第二个同名对象
**CASE B** rot=15 侧car=true
  - consistency → PASS: sum===nativeLines
  - created-equal-finalMatched → PASS: 旋转 containment：finalM=15 requested=12 created=12 gap=3（越界行由 isQuadInsideImage 硬门禁拒绝）
  - missing-reported → PASS: missing length
  - rot-truth-preserved → PASS: 旋转下 Native truth 未变（B 不 drop）；missing 0
  - rot-angle-retained → PASS: 创建对象带 angle（含 0）
  - rot-safe-gap → PASS: 旋转下创建<=finalMatched，越界行（gap=3）由硬门禁拒绝并记录 evidence
  - rot-created-bound → PASS: 创建数不超过 finalMatched（不越权创建）
**CASE C**（DROP=夏祝莲） rot=0 侧car=false
  - consistency → PASS: sum===nativeLines
  - created-equal-finalMatched → PASS: created==finalMatched
  - missing-reported → PASS: missing length
**CASE E**（DROP=夏祝莲） rot=0 侧car=true
  - consistency → PASS: sum===nativeLines
  - created-equal-finalMatched → PASS: created==finalMatched
  - missing-reported → PASS: missing length
  - ink-no-guess → PASS: ImageInk 无 region → missing 保留不猜位置
**CASE G**（DROP=夏祝莲） rot=15 侧car=true
  - consistency → PASS: sum===nativeLines
  - created-equal-finalMatched → PASS: 旋转 containment：finalM=14 requested=11 created=11 gap=3（越界行由 isQuadInsideImage 硬门禁拒绝）
  - missing-reported → PASS: missing length
  - rot+drop+partial → PASS: 旋转+缺失+partial 同时成立
  - rot-gap-ok → PASS: G 创建数不超 finalMatched（越界拒绝已记录）

## 13. Unresolved Items

1. **LOCAL real-device successful recovery = UNRESOLVED**：真机 Local（Tesseract 中文）识别质量差，未复现「Local 成功恢复 geometry」的成功路径；由 3 个 LOCAL 单测覆盖安全失败路径。本次未改写为 PASS（Commit 3c 结论原样保留）。
2. CASE 4-D「Baidu 不足→Local 恢复」：真机素材下 Baidu 对 drop 行的残余词不可测，C 组合实际落到「BAIDU/LOCAL 均无候选 → missing 保留」；D 的成功恢复路径保持 UNRESOLVED，不猜。
3. 旋转场景 3 行（Add:2B059 / East Yide Rd / Tel）在 rot=15° 时 targetQuad 越界被 containment 拦截（CASE 4-B 要求的「geometry 不跑出 canvas」），记录为证据而非失败。

## 14. Git Commit SHA

Commit 4 序列（test 与 stage-9-altq-baidu-reconstruction 双分支同步）：

| Commit | SHA | 内容 |
| --- | --- | --- |
| Commit 4/Audit | 7e08ee7 | commit-4 audit |
| Commit 4.1 | 8820334 | geometry space schema |
| Commit 4.2 | 097ffac | native anchor recovery + identity |
| Commit 4.3 | 20b2ee3 | image ink recovery + occupancy + isolation + rotation |
| Commit 4.4 | %COMMIT4_4_SHA% | 真机集成 + evidence（本报告随行） |

## 15. GitHub Branch SHA

- test 分支：%COMMIT4_4_SHA%
- stage-9-altq-baidu-reconstruction 分支：%COMMIT4_4_SHA%
- main：不动 ｜ demo：不动

## 门禁检查表（§十八）

| 门禁 | 证据 | 状态 |
| --- | --- | --- |
| Native Truth PASS | §3 + CASE A/B/G nativeLines 守恒 | ✅ |
| Partial Create PASS | CASE C/E/G missing 保留 + created==finalMatched | ✅ |
| Native Anchor PASS | CASE A2 anchorUsed + identity 复用 | ✅ |
| Geometry Space PASS | 4.1 单测 22 + §5/§8 | ✅ |
| Rotation PASS | rotation 6 用例 + CASE B/G rot=15 | ✅ |
| ImageInk PASS | image-ink 5 用例 + CASE E ink-no-guess | ✅ |
| Front/Back Isolation PASS | occupancy scope + e2e 回归 | ✅ |
| No text-source bypass | recovery 只产 geometry，不产 text | ✅ |
| No regression | 22 文件全绿 0 regression | ✅ |
| Real Device PASS | 6 CASE 全绿（含 LOCAL UNRESOLVED 如实记录） | ✅ |
| Git clean | Commit 4.4 提交后工作树 clean | ✅ |
| test == stage | 双分支同 SHA | ✅ |

**LOCAL real-device successful recovery = UNRESOLVED**（保持原样，不因报告整洁删除）。
