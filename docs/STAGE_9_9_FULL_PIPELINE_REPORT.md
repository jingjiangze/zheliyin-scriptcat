# Stage 9.9 全链路真机验收报告（FULL PIPELINE）

- 基线 Commit：`6370a5a`　Version：`0.3.11.48`
- 阶段：STAGE-9-9-FULL-PIPELINE
- 数据链路验收：`Native OCR Truth → Geometry Evidence → Image-Space Transform → Anchor/Create → Typography → Textbox Create → Native Measure → Containment → Rendered Verification`
- JSON 报告：`runtime/reports/stage-9/stage-9-9-full-pipeline.json`
- 依赖闭包：`runtime/reports/stage-9/dependency-closure.json`

## 0. 结论总览

| 结论 | 数量 | 明细 |
|---|---|---|
| PASS | 28 | Anchor×4、Measure 闭环、幂等×3、PageIdentity、ImageSpace×4、Containment×4、Typography×9（T1-T7+collapse+wrap）、P0×3、TextToImage |
| FAIL | 0 | - |
| BLOCKED | 1 | Native OCR Truth 链路（native uploadOCR 返回登录跳转 HTML，会话未过） |
| UNKNOWN | 0 | - |
| UNRESOLVED | 3 | R1 CaseC / R2 CaseB / R3 CaseD（依赖 R0 的 Native 会话，被 BLOCKED 阻断） |

**NEXT BLOCKER / 结论：**
Stage 9.9 **BLOCKED（非 FAIL、非 PASS）**。Commit 6/7/8 的几何/排版/锚点/幂等/PageIdentity 能力已全部真机闭环通过（28 PASS）。唯一未闭环项是 **Native OCR 真值链路**：真实 `diy.zheliyin.com` 的 `/siteWeb/userCenterJsj/uploadOCR.do` 未过登录会话（返回登录跳转 HTML，`PARSE_FAIL`）→ Native Truth 不启用，Fallback 仅为 Legacy 路径。这是 **会话/环境阻塞**，并非 Commit 6/7/8 代码缺陷。

补测条件：提供有效登录会话（`ZY_STAGE9_COOKIE` 或持久 profile 内登录态）后重跑，或授权使用 `ZY_STAGE9_COOKIE` 注入。

## 1. Git Baseline

- HEAD：`6370a5a6adb611180931fe1effa2b8fdd706f3ed`（= 0.3.11.48）
- branch：`stage-9-altq-baidu-reconstruction`
- stage 远端：`6370a5a` == test 远端：`6370a5a` == local：`6370a5a`（三头一致）
- working tree：**非 clean**（新增本轮 audit/report 文件，待提交；未擅自 reset/force push）

## 2. Runtime Dependency Closure（P0，PASS）

- userscript 全部 27 个真实 `@require`（demo 分支 5 + test 分支 22）逐项解析 URL → branch/ref → 远端内容 vs 本地 `extension/src/`（CRLF 归一后 sha256）：
  - 27/27 `MATCH_LOCAL`，无 stale、无缺失、无 version query 不一致。
  - 结论：demo/test 分支虽混合引用，但各模块内容与 6370a5a 本地一致，**无旧模块加载风险**。
- 仅注释内伪匹配（`@require 注入 …`）已过滤（非 https URL 不计数）。

## 3. Native OCR Truth（BLOCKED —— 会话阻塞）

| Case | 场景 | 结论 | 证据 |
|---|---|---|---|
| A | Native + Baidu 双成功 → finalText == Native Truth | BLOCKED | R0 native uploadOCR 返回登录跳转 HTML（HTTP 200），`PARSE_FAIL` → Native 不可用 → 仅 Legacy 路径 |
| B | Native-only（Baidu 缺几何）→ UNRESOLVED_GEOMETRY，不乱建 | UNRESOLVED | 依赖 R0 |
| C | Baidu-only → DROP | UNRESOLVED | 依赖 R0 |
| D | 冲突 → NATIVE_TRUTH（Baidu 仅 geometry evidence） | UNRESOLVED | 依赖 R0 |

- R0 已真实跑通：背景注入 → ocrPrepare → node 同源真实 Baidu（10 candidates）→ 点击真实「识别当前图片」→ 状态「几何校验完成」→ 创建 2 个 textbox（吴健湘 / Tel.:0757-88809856，fontSize 34/22 按逐行 ink 求解）→ Baidu 文本 10 条 vs Native 未激活。**链路其余步骤均真实执行**，仅 Native 真值入口被会话阻断。

## 4. Anchor Reuse / Create（PASS ×4）

- A1 existing anchor reuse：`reused=true`，score=0.8578，margin=0.2949，复用对象不走新建，textbox 数不变。
- A2 no anchor create：新建 `ZY_99_PROBE_NEW`（OBJECT_DELTA identity 恢复：uuid + pageId:canvas:c0 + geometry）。
- A3 UNCERTAIN：`uncertain=1`，`reused=0`（不强制复用，不透支阈值强行 MATCH）。
- A4 wrong page：`CREATE_BLOCKED_PAGE_NOT_FOUND`（动态反页 canvas:c1→c0）。
- identity recovery：`REGISTRY_DELTA` / `OBJECT_DELTA` / `NATIVE_RETURN`（probe 走 OBJECT_DELTA），不再用 text+layerNum。

## 5. Image-Space（PASS ×4）

| 图例 | natural | object | 有效缩放（affine） | 结论 |
|---|---|---|---|---|
| I1 真实（natural≠object） | 1063×638 | 621.75×373.16 | sx=sy=0.584897 | CONTAINED，natural≠object 证实 |
| I2 非 1:1 均匀 | - | - | 0.409428 | CONTAINED |
| I3 旋转 30° | - | - | 0.584897，targetQuadAngle=30° | CONTAINED |
| I4 非均匀 | - | - | sx=0.350938 ≠ sy=0.643387 | CONTAINED |

- imageTransform affine 全程唯一几何源；未再使用 geo.scaleX/scaleY 充当 natural scaling truth。

## 6. Containment（PASS ×4）

- C-IN：CONTAINED → createAllowed=true
- C-OUT：OUT_OF_IMAGE（no-overlap）→ createAllowed=false
- C-REPAIR：NEEDS_REPAIR → repair（imageShift x=-140）→ CONTAINED → createAllowed=true
- C-STILL_OUT：OUT_OF_IMAGE → repair 失败（quad 宽超图片）→ `createAllowed=false`（严禁忽略 repair 结果继续创建）
- P0-3 复验：`inverse(imageTransform)` 在 IMAGE_PIXEL 系判定；Canvas AABB 内 ≠ Image 内（不冒充）。

## 7. Typography（PASS ×9）

- T1 单行中文 / T2 双行中文 / T3 三行中文 / T4 中英混排 / T5 中文+数字 / T6 长地址 / T7 短电话：7/7 PASS（per-line ink → median → fs → drawText → measure 闭环）。
- T2 证据：per-line ink [57,57] → median 57 → medianCanvasPx 33.34 → fontSize 34（误差 0），renderedLineCount=2 == sourceLineCount=2。
- T-collapse-fail：gate `collapseDetected=true`、`typographyPass=false`（2→1 必须 FAIL）✓
- T-wrap-fail：gate `wrapDetected=true`、`typographyPass=false`（1→3 必须 FAIL）✓
- 注：`collapseDetected` 通过 `failures` 上报（`typography` 对象仅暴露 `wrapDetected` 字段，Commit 8 诊断 API 不对称，非行为缺陷；生产与单测均以 `failures/status` 判定）。

## 8. Native Measure 闭环（PASS）

- create → setCoords → 实测 aCoords / width / height / angle / fontSize / renderedLineCount / ink：
  - topLeftError = (0, 0)
  - aCoordsBB(220,20,218.82,25.86)、width=217.82、height=24.86（文本自适应，非 180×34 请求值）
  - renderedLineCount=1、ink=FABRIC_OBJECT_LINES(217×20)
- location 访问器对象模型未暴露（o.location 等为 null）→ 以 aCoords/width/height/angle/rendered 为最终实测几何（如实标注，未伪造）。

## 9. 幂等性（PASS）

- 同一 transactionId + imageFingerprint + items 连续 3 次：
  - Run1 created=1（新建），Run2/3 `reused=1`（复用同一 uuid），`dupObjects=1` 恒等，textbox 数恒定，无重复对象。

## 10. PageIdentity 硬门禁（PASS）

- front 冻结 pageId `canvas:c0` → 切到 back `canvas:c1` → 用旧 front pageId 创建 → `CREATE_BLOCKED_WRONG_PAGE`（BLOCKED，非静默成功）。

## 11. Text-to-Image capability（PASS，productionReady=false）

- drawImg=false（L4 模块无 drawImg/createImg 等函数命中）、serializer=true（ProductDataType 命中）、saveReload=false、productionReady=false（本轮仅 capability evidence，不做生产接线，不用 raster fallback 掩盖几何缺陷）。

## 12. 验收清单（对照 Stage 9.9 §16）

- [x] HEAD/stage/test 一致（6370a5a 三头同）
- [x] @require dependency closure 无旧模块风险（27/27 MATCH_LOCAL）
- [ ] Native OCR = final text truth（BLOCKED：native uploadOCR 会话未过）
- [x] Anchor reuse / UNCERTAIN 不强制复用 / Create identity 可靠恢复
- [x] image-space 唯一 natural→canvas truth；effectiveScale 正确；不再依赖 geo.scaleX/scaleY
- [x] Image containment 真机通过；repair 通过；repair 失败禁止 Create
- [x] 单行/多行 typography；per-line ink；line count 无 wrap/collapse 误放行
- [x] Native Create → Measure 闭环（actual aCoords 有真实证据）
- [x] 连续运行无 duplicate
- [x] PageIdentity 防串页通过
- [x] text-to-image 仅 capability evidence；未用 raster fallback 掩盖几何 bug

## 13. 缺陷记录 / 代码修改规则

- **未发现 Commit 6/7/8 生产代码缺陷**：本轮未修改 `zheliyin-card-assistant.user.js` 及相关生产模块（silent `export`/无 bump version）。
- 全部 28 PASS 均由既有生产代码 + 页面世界纯模块真机取得。
- Native Truth 链路为**环境/会话阻塞**（uploadOCR 登录跳转），补测条件见 §0。
- 本轮新增：audit 脚本 `runtime/stage9/dep-closure-audit.js`、真机 runner `runtime/stage9/stage-9-9-full-pipeline.js`、依赖闭包报告、本报告与 JSON 报告（仅 docs/evidence，不升版）。

## 14. NEXT BLOCKER

1. **补测 Native OCR Truth 四案例（Case A/B/C/D）**：需有效登录会话（`ZY_STAGE9_COOKIE` 或 profile 内登录态）→ 重跑 `runtime/stage9/stage-9-9-full-pipeline.js` → 将 BLOCKED/UNRESOLVED 转为 PASS 或记录真实 FAIL。
2. 补测通过后进入 **Stage 9.10 Front/Back PageIdentity + Back Canvas Materialization**（不跳视觉优化）。