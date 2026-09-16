# STAGE_5_1_IDENTITY_GEOMETRY_AUDIT

Object Identity / Geometry Hardening + Creation Safety Audit · 真实编辑器对象边界打磨

> 原则：先审计 → 真实实验 → 证据 → 最小修复 → 真实 Runtime 回归 → 独立复审（§三）。
> 只做 Identity / Geometry / Creation 三件事；不进入 OCR（§五十）。

---

## 1. Stage 5.0 Closure（§五/§六/§七）

- Closure Fix 提交：2570eac（fix: close stage5 object model audit gaps）
  - 新增 docs/EDITOR_OBJECT_PROPERTY_CLASSIFICATION.md（真实 snapshot 数据，A~E 分类；字段级 observedCount/objectTypes/persistenceObservation）
  - diff 类型安全修复：`runtime/editor-object-diff.js` same() 类型不同直接判 changed（防 1==="1" / true==="true"）；数字 epsilon；含新增单测
  - 术语统一：markuuid = Stable/Persisted Candidate（非 universal）；uuid = Session Runtime Identity；明确 reload stability ≠ server-save persistence
- Closure 后全部 Stage 5 测试 PASS（3 套件）。

## 2. A. Identity Boundary Audit（§九/§十/§二十八）

实验（runtime/stage5-identity-audit.js，3 次完整页面加载 session A/B/C）：

| 结论 | 证据 |
|---|---|
| markuuid 跨 3 会话稳定（4 textbox 全稳定；text/geometry/layerNum 全一致） | markuuidStable=true ×4，identity-matrix.json |
| uuid 每次会话重新生成（4 textbox x 3 会话 = 12 个不同 uuid） | uuidSet 全互异 |
| textbox 子集 markuuid 单会话内唯一（dupCount=0） | duplicateCount.duplicates=[] |
| 按类型身份策略分型（§十 不强行统一） | typeStrategy：textbox/image/path/group 有 uuid+markuuid；rect 底图有 markuuid 无 uuid；line 全无 |
| **PERSISTED_ID_SCOPE = TEXT/IMAGE/GRAPHIC**（group 为共享；line 为 none） | identityKind 分型 |

## 3. B. Geometry Boundary Audit（§十一~§十六/§二十九）

实验（runtime/stage5-geometry-audit.js）：

- **rotation**：path index2 angle=105 scale=0.81；raw 425.2×157.4 → effective 344.6×127.5 → **fabric AABB 220.3×378.7**（旋转后 AABB ≠ effective）→ OCR 必须用 getBoundingRect/几何变换，不能拿 width 当 bbox。
- **stroke**：rect 600×365 → AABB 620.5×377.9（stroke 外扩）。
- **line**：width=|x2-x1|、height=|y2-y1|（8/8 实测）→ line 几何语义非 bbox，Model 不作 OCR 目标。
- **group**：child 坐标 group-local（child left=-40.35/-69.35 vs group 原点 277.16/-6.92）→ 渲染世界坐标需经 group 变换；本模板 group 为 SVG 装饰，无内嵌文字。
- **coordinateSpace**: 顶层对象 canvas-global（origin left/top）。

模型修正（feat c5e6fba）：object-model.js identity 增加 runtimeId/persistedId/identityKind，geometry 增加 coordinateSpace；object-adapter.js 增加 zyGetVisualBounds（fabric getBoundingRect 优先，effective fallback）。单测扩充全 PASS。

## 4. C. Creation Safety Audit（§十七~§二十五/§三十）

实验（runtime/stage5-creation-safety.js，REAL_SOURCE_EQUIV：production page-bridge.js 逐字提取 create 路径在真实编辑器执行）：

- **修复前（fc0eefa 记录）**：`created.markuuid === reference.markuuid`（CREATION_IDENTITY_LEAK）；继承 __charBounds/_styleMap/__eventListeners/lastSafeText（CREATION_RUNTIME_STATE_LEAK）→ **UNSAFE**。
- **Finding STAGE5.1-CRE-01（P1）**：inheritReferenceProps skipBox 未排除 identity/度量缓存/事件/编辑回退字段。
- **最小修复（f301ba3）**：skipBox 追加 markuuid/uuid/__charBounds/__lineHeights/__lineWidths/_styleMap/__eventListeners/aCoords/oCoords/lastSafeText。
- **修复后重跑**：identity-leak clean（created.markuuid=undefined）；**零共享结构引用**（leakRefs 全 false —— created 与 reference 的 __eventListeners/度量/样式结构均独立）；编辑器状态（isDesign/isEdit/isLineText/媒体/边框）按预期继承；cleanup count 21→21 无残留 → **CREATION_SAFETY = SAFE**。
- **回归**：RUNTIME-8.3 全链（runtime8-full-chain-report.json）errors=0；object-model/adapter/diff 单测 PASS。

## 5. D. Multi-template（§二十六/§二十七）

- **MULTI_TEMPLATE_SAMPLE = PARTIAL**：当前账号/Runtime 仅 1 个真实可访问模板，未发现其它安全入口；不猜 URL、不制造模板。单模板证据完整（identity/geometry/creation 全部在本模板上实测）；**未发现类型（IText/Text/组内文字/背面/多画布）统一标 UNKNOWN**，不推广为模板通用行为（runtime/reports/stage5-multi-template.json）。

## 6. 生产修改清单

| 文件 | 类型 | commit |
|---|---|---|
| extension/src/editor/page-bridge.js | fix（inheritReferenceProps skipBox 扩展，P1） | f301ba3 |
| extension/src/editor/object-model.js | feat（identity 分型 + coordinateSpace） | c5e6fba |
| extension/src/editor/object-adapter.js | feat（zyGetVisualBounds） | c5e6fba |
| docs/*（classification/terms/model/inherit audit） | docs | 2570eac / 5c85d4b |

行为影响：page-bridge apply/create 路径唯一改动为「新建对象不再继承模板 identity/缓存/事件」，模板套版行为不变（全链回归 PASS）。

## 7. 独立复审（§四十六 10 问）

| # | 问题 | 结论 |
|---|---|---|
| 1 | markuuid 真持久吗？ | 跨 3 会话 reload 稳定（textbox 层 VERIFIED）；语义为 Candidate 非 universal |
| 2 | markuuid 对象级唯一吗？ | textbox 4/4 唯一；SVG 组共享（3D84D06A…）→ 非对象级 universal |
| 3 | group child 共享 identity？ | 是（markuuid 组共享）；child 另有无唯一 id —— 组内用 local/index/path 关系 |
| 4 | width/height 是视觉 bbox 吗？ | 否（旋转 path AABB≠effective；stroke 外扩）→ 用 zyGetVisualBounds |
| 5 | child 坐标 canvas 还是 group-local？ | group-local（实测负偏移） |
| 6 | angle+scale 解释正确？ | raw 记录原始；有效边界用 getBoundingRect（fabric 引擎）；文本层当前无旋转样本 |
| 7 | new textbox 泄 reference markuuid？ | 修复前泄漏（P1 实证）；修复后 clean（f301ba3 重跑） |
| 8 | new object 继承 cache/event/editor runtime？ | 修复后零共享结构引用（leakRefs 全 false）；编辑器运行时事件为独立注册 |
| 9 | 临时 mutation 零残留？ | creation probe cleanup 21→21、无测试文本；mutation rollback diff=[] |
| 10 | 单模板结论推广到全部模板？ | 未推广（PARTIAL；差异型 UNKNOWN 显式记录） |

## 8. Final Report（§四十八）

```text
Stage 5.0 Closure:      PASS（2570eac；classification doc + diff 类型安全 + 术语）

Identity:               VERIFIED（textbox markuuid 3/3 会话稳定唯一；分型 matrix）
Persisted Identity:     CANDIDATE（markuuid；scope=text/image/graphic；group-shared；line=none）
Geometry:               PASS（AABB≠effective 已证含 angle/stroke；line/group 语义明确）
Rotation:               PASS（真实样本 path 105°；文字层无旋转样本记录 NO_REAL_TEXT_ROTATED）
Group Geometry:         PASS（child 坐标 group-local 实测）
Creation Safety:        PASS（修复后 SAFE；P1 finding 已修并回归）
inheritReferenceProps:  CONDITIONAL→RESOLVED（FINDING-C 已修 f301ba3；whitelist 仍 Deferred）
Multi-template:         PARTIAL（单模板样本；差异 UNKNOWN 显式记录）
Unit Tests:             PASS（object-model/adapter/diff，新增 identity 分型/visualBounds 用例）
Real Runtime:           PASS（creation probe 真实编辑器 + RUNTIME-8.3 全链回归）
Rollback:               PASS（创建清理 21→21 零残留；mutation diff=[]）

Production Changes:
  - page-bridge.js: inheritReferenceProps skipBox +10 字段（P1 fix, 行为不变回归 PASS）
  - object-model.js: identity r/p-id + identityKind + coordinateSpace（纯数据扩展）
  - object-adapter.js: zyGetVisualBounds + exports（只读扩展）

Important Findings:
  - CREATION_IDENTITY_LEAK 曾导致新对象 markuuid 与模板一致（P1）→ 已修
  - fabric AABB 是旋转/描边对象唯一可信视觉包围盒；line/group 几何语义与 textbox 不同
  - uuid 会话级、markuuid 跨会话（textbox 层）—— 两个 ID 不可混用

Deferred Risks:
  - server-save persistence 未验证（只验证 reload stability）
  - multi-template 证据不足（PARTIAL）
  - inheritReferenceProps 白名单化（需 ≥2 模板）
  - group 内嵌 text 未出现于本模板（若出现需 group 变换 matcher）

Commits:
  2570eac closure fix
  2ea7cf6 identity audit
  234686b geometry audit
  fc0eefa creation safety audit (UNSAFE evidence)
  f301ba3 P1 fix + regression
  5c85d4b FINDING-C resolved docs
  c5e6fba object model hardening
  (docs commit 本文件)

Push:
  全部已 push origin/stage-4.1-runtime-validation（无 force/squash）

Gate:
  GO（无未解决 P0/P1；CONDITIONAL 项均有明确 Deferred 记录）
```

## 9. 成功标准自检（§五十一）

未来拿到 OCR `text + bbox` 时已具备：归一化坐标（coordinateSpace + getBoundingRect 语义）、对象 identity（persistedId/runtimeId 分型）、创建安全（新建对象不再污染模板 identity/cache）—— 可安全进入 Matcher 前置构建，无需猜测 identity/rotation/scale/group/cache 行为。

## 10. 停止点（§五十三）

停在 Identity / Geometry / Creation Safety Foundation。**不进入 OCR、不进入自动文字拆分、不进入完整 Object Matcher**，等下一阶段明确授权。