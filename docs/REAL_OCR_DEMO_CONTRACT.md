# REAL_OCR_DEMO_CONTRACT — 真实 OCR 演示契约

> 维护者：AI-2（Repository Governance 线）
> 性质：**接口契约定义**。本文档**不实现**任何模块，只定义两条工作线之间的共享边界。
> 基线：`stage-4.1-runtime-validation` @ `7c412b8`（Stage 5.5A）
> 修订：@ `3becf04`（Stage 5.4）初版；@ `4cb0819`（Stage 5.5）补 OCR Provider 契约，并关闭 GAP-1 / GAP-2 / GAP-5。
> 证据等级见 `docs/EVIDENCE_POLICY.md`；协作边界见 `docs/PARALLEL_DEVELOPMENT.md`

---

## 0. 为什么需要这份契约

仓库里有两条并行的工作线：

- **AI-1（Demo implementation）**：负责真实图片输入、OCR provider、重建链路。
- **AI-2（Repository governance）**：负责文档、测试组织、仓库治理。

两条线**不得共享正在修改的实现文件**，只能共享**接口**。这份文档就是那些接口的唯一定义处。

**本文档的写作原则**：
1. 契约优先描述**已经存在的真实实现**（附文件名与函数名），而不是凭空规定。
2. 契约要求的字段若当前模型**没有**，明确列为**缺口（GAP）**，而不是假装它已存在。
3. 任何「应该是什么样」都必须标注 `[TODO]`，不得写成既有事实。

---

## 1. 契约总览

```text
                            ┌───────────────────────────────┐
                            │  ImageObject（真实图片对象）    │  ← 输入端
                            └───────────────┬───────────────┘
                                            │
              ┌─────────────────────────────┴──────────────────────────┐
              │  C1. ImageObject 契约       （§2）                       │
              │  C2. 坐标契约               （§4）                       │
              └─────────────────────────────┬──────────────────────────┘
                                            ▼
                            ┌───────────────────────────────┐
                            │  OCR Provider.recognize()      │  C2a.（§3.0）
                            │   （tesseract LOCAL / fixture） │
                            └───────────────┬───────────────┘
                                            ▼
                            ┌───────────────────────────────┐
                            │  OCRCandidate[]（候选文字块）   │
                            └───────────────┬───────────────┘
                                            │  C3. OCRCandidate 契约（§3）
                                            ▼
                            ┌───────────────────────────────┐
                            │  Canvas 坐标（image-mapper）    │
                            └───────────────┬───────────────┘
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  MatchResult（object-matcher）  │
                            └───────────────┬───────────────┘
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  Textbox / Textbox[]（输出端）  │  C5.（§5）
                            └───────────────┬───────────────┘
                                            │
                                            ▼
                            ┌───────────────────────────────┐
                            │  changeSet（可回滚）            │  C6.（§6）
                            └───────────────────────────────┘

              不变量（§8）：原图必须保留
```

---

## 2. C1 — ImageObject 输入契约

一张已进入编辑器画布的图片对象，作为整条重建链的输入。

### 2.1 契约要求

| 契约字段 | 含义 | 对应真实字段 | 状态 |
|---|---|---|---|
| `source dimensions` | 图片**原始像素**尺寸 | `naturalWidth` / `naturalHeight`（ImageSource），Stage 5.3 审计实测 980×1264 模板图 / 600×400 新图 | ✅ 存在 |
| `canvas dimensions` | 图片在 Canvas 上的**逻辑**尺寸 | `width` × `height`（fabric 显示尺寸，**已含 scale 语义前的逻辑值**） | ✅ 存在 |
| `position` | 对象左上角在 Canvas 的坐标（origin=left/top） | `left` / `top` | ✅ 存在 |
| `scale` | 缩放 | `scaleX` / `scaleY` | ✅ 存在 |
| `angle` | 旋转（度） | `angle` | ✅ 存在 |
| `identity` | 身份 | `markuuid`（跨会话稳定）/ `uuid`（会话级） | ✅ 存在 |

### 2.2 硬约定

1. **`source dimensions` ≠ `canvas dimensions`**。二者必须分开传递，禁止混用。OCR 引擎在**原始像素**空间工作；mapper 在**逻辑尺寸**空间工作。
2. **几何必须取真实值**。凡是需要视觉包围盒的地方，一律使用 `zyGetVisualBounds()`（`extension/src/editor/object-adapter.js`），它优先调用 fabric `getBoundingRect()`：
   - 有真实旋转/描边时，`width`/`height` **不是**包围盒。
   - 实测反例：`path` 对象 angle=105°、scale=0.81 → 有效尺寸 344.6×127.5，而 fabric AABB 是 220.3×378.7。
   - 只有 `getBoundingRect()` 不可用时，才回退 `width*scaleX × height*scaleY`。
3. **身份不得混用**：`markuuid` 是持久候选身份（textbox 4/4 唯一，跨 3 会话稳定）；`uuid` 每次会话重新生成（3 会话 × 4 textbox = 12 个互异值）。**新建对象不得继承参考对象的 `markuuid`**（见 §8 不变量 4）。
4. `line` 类型对象**不参与**本契约（其 `width=|dx|`、`height=|dy|`，几何语义不是 bbox）；`group` 的子对象坐标为 **group-local**，进入链路前必须由上层标记。

---

## 3. OCR 层契约

### 3.0 C2a — OCR Provider 契约（Stage 5.5 新增）

> 对应真实实现：`extension/src/ocr/ocr-provider.js`
> `recognize(image, ctx) → Promise<{ provider, providerType, candidates[], meta }>`

**这是 OCR 引擎与重建链之间唯一的接口。** 换 provider 不改重建代码。

| 字段 | 契约 | 真实实现 | 状态 |
|---|---|---|---|
| `provider` | string，如 `tesseract-chi_sim` / `fixture` | ✅ | 一致 |
| `providerType` | `LOCAL` \| `FIXTURE`（`REMOTE` 保留未用） | ✅ | 一致 |
| `candidates[]` | `OCRCandidate[]`（见 §3.1） | ✅ | 一致 |
| `meta` | `{ imageWidth, imageHeight, elapsed, rawWordCount, lineCount, lines, words }` | ✅ | 一致（含诊断用原始 words/lines） |
| 引擎未加载 | 返回 `{ error: { errorCode: "ENGINE_NOT_LOADED", … }, candidates: [] }`，**不 throw** | ✅ | 一致 |

**已实现的 provider**：

| provider | 类型 | 状态 | 说明 |
|---|---|---|---|
| `createTesseractProvider()` | `LOCAL` | ✅ **REAL PASS** | 本地 WASM，`chi_sim`，零上传零 key；**候选默认取引擎原生 `data.lines`**（行级），无行时回退 `words` |
| `createFixtureProvider()` | `FIXTURE` | ✅ | 确定性回归用；**不得冒充 REAL** |

**契约级约束（不得放宽）**：

0. **⚠️ 引擎装载是本契约的当前最大风险**（Stage 5.5A 实测）：provider 契约要求「引擎由调用层提供」，而调用层在**编辑器页运行环境**下**拿不到引擎**（CSP `script-src` 拦截外链、requirejs AMD 环境吸收 UMD、inline 注入亦不可达）。
   因此 provider 契约本身成立，但**端到端产品可用性仍被阻断**，需 5.6 的装载工程解决。实现方在此问题解决前，不得声称「真实 OCR 产品可用」。
1. **隐私**：`LOCAL` provider 不得上传用户图片、不得要求任何 key。
2. **引擎缺少即 ERROR**，不得抛异常、不得静默返回空候选冒充成功。
3. **候选必须带 `imageSize`**：`image-pixel` 坐标只有在知道原图尺寸时才能换算。
4. **引擎加载不属于 provider 职责**：`GM_addElement` / CDN 注入由调用层负责（见 `tesseract-loader.js`）。
   > 这是 Stage 5.5 的关键边界划分，也是当前**待真机验证**的一项（引擎注入方式）。

---

### 3.1 C3 — OCRCandidate 契约

> 对应真实实现：`extension/src/ocr/ocr-model.js` → `createOCRCandidate(input)` / `isUsable(candidate)`
> 以及 `extension/src/ocr/ocr-provider.js` 的 `normalizeBBox()`（provider 侧产出）

```js
{
    text,             // string，必填；空白不可用
    bbox,             // { x, y, width, height }，必填；四值均为有限非负数
    confidence,       // number 0..1（tesseract 的 0..100 会被归一化）
    rotation,         // number（度）或 null
    coordinateSpace,  // string，见下
    imageSize         // { width, height }，image-pixel 坐标系下必须携带
}
```

**`coordinateSpace` 取值（以真实实现为准）**：

| 取值 | 含义 | 谁产出 | 消费方 |
|---|---|---|---|
| **`image-pixel`** | 相对图片**原始像素** | `ocr-provider.js`（当前唯一实际使用值） | `image-mapper` → 需要 `imageSize` |
| `image-normalized` | 0..1 归一化 | （保留） | `imageLocalNormalized()` |
| `image-logical` | 相对图片逻辑尺寸 | （保留） | `imageLocalRectToCanvas()` |
| `canvas` | Canvas 全局坐标 | `image-mapper` 输出的结果语义 | **`object-matcher` 只接受这一级** |

> **契约裁定**：`object-matcher.match()` 要求 `candidate.bbox` 与 `object.visualBounds` **同坐标系**（Canvas 像素，origin=left/top）。
> 因此进入 matcher 之前 `coordinateSpace` **必须**已是 `canvas`；任何非 `canvas` 的候选都必须先经 `image-mapper`。

### 3.2 与真实实现的差异（GAP 清单，Stage 5.5 后）

| 契约字段 | 真实实现 | 判定 |
|---|---|---|
| `text` | ✅ `text`（+ 派生 `textLen`、`textHash8`） | 一致 |
| `bbox` | ✅ `bbox: {x,y,width,height}` | 一致 |
| `confidence` | ✅ `confidence`，`null` 或**钳制到 [0,1]** | 一致（更严格） |
| `rotation` | ✅ **已存在**（`normalizeBBox` 输出，非数字时为 `null`） | ✅ **GAP-1 已关闭**（Stage 5.5） |
| `coordinateSpace` | ✅ **已存在**，当前恒为 `"image-pixel"` | ✅ **GAP-2 已关闭**（Stage 5.5）；已按真实取值对齐 |
| `imageSize` | ✅ 由 provider 附带 | 契约补入（GAP-2 的推论需求） |
| `source`（manual/ocr/fixture） | ⚠️ `ocr-model.js` 中仍有；provider 侧改由 `providerType` 表达 | **GAP-7 部分转化**：来源信息改由 provider 层承载 |

> 说明：`rotation` 目前**允许为 `null`**，且重建链实际依赖的是 `ImageObject.angle`（Stage 5.3/5.4 的 mapper 路径）。
> 因此 `rotation` 的存在意义是**信息保留**；旋转重建本身仍属 `DEFERRED → Stage 5.8`。

> ~~**GAP-1 / GAP-2 处置建议**~~ —— **已于 Stage 5.5 由实现线解决**（`ocr-provider.js` 的 `normalizeBBox()` 直接产出 `rotation` 与 `coordinateSpace`，取值 `"image-pixel"`）。
> 本节保留原始建议文本以记录决策过程，但**当前无需再决策**。

---

## 4. C2b — 坐标契约（最易出错的一环）

> 对应真实实现：`extension/src/ocr/image-mapper.js` → `imageLocalRectToCanvas(imgObj, localRect)` / `imageLocalNormalized(imgObj, rect01)`

### 4.1 四级坐标空间

```text
① source-pixel      图片原始像素（OCR 引擎输出，如 980×1264）
        │  ÷ natural 尺寸
        ▼
② image-normalized  0..1
        │  × 逻辑尺寸(width/height)
        ▼
③ image-logical     图片在 Canvas 上的逻辑局部坐标
        │  scale pre-multiply + 绕中心旋转 + 平移至 left/top
        ▼
④ canvas            Canvas 全局坐标（origin = left/top）  ← matcher 只接受这一级
```

### 4.2 硬约定

1. **禁止简单 offset 平移**。Stage 5.3 明确规定：必须使用真实的 fabric transform 语义（缩放前置 + 绕对象中心旋转）。
2. **旋转必须按 AABB 外接**：`imageLocalRectToCanvas` 返回的是四角变换后的轴对齐包围盒（`left/top/width/height` + `centerX/centerY/angle`）。
3. **归一化输入必须用逻辑尺寸换算**，不得用 natural 尺寸直接乘。
4. 本模块**不能替代** fabric `getBoundingRect()`：需要真实引擎语义时（描边、复杂路径）必须回退到 adapter。
5. 已覆盖的边界（`tests/editor-object-model/image-mapper.test.js`，10 断言）：`scale=1 / 0.5 / 2`、`angle=45°`（AABB=(w+h)/√2）、整幅/局部映射、0..1 归一化往返、非法输入返回 `null`。

### 4.3 缺字段说明

`imageLocalRectToCanvas` 只读取图片对象的 `left/top/width/height/scaleX/scaleY/angle`。若 `coordinateSpace`（GAP-2）被引入，本函数**不需要改动** —— 空间转换由上层完成，mapper 只负责 ③→④。这保证了 GAP-2 的引入是**向后兼容**的。

---

## 5. C4 — 匹配契约（OCR 链的输入边界，不属输出）

> 对应真实实现：`extension/src/editor/object-matcher.js` → `match(candidate, objects, ctx)`

```js
match(
  candidate,   // OCRCandidate，bbox 必须是 canvas 坐标系
  objects,     // EditorObject[]（object-model.parseEditorObject 输出）
  { canvasWidth, canvasHeight }
) → {
  status: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND" | "ERROR",
  ...
}
```

**判定阈值（契约常量，改动需登记）**：

| 常量 | 值 | 含义 |
|---|---|---|
| `MATCH_TH` | `0.45` | 低于此分 → `NOT_FOUND` |
| `AMBIGUOUS_MARGIN` | `0.08` | 与次高分差距小于此值 → `AMBIGUOUS` |
| 评分权重 | `0.35·IoU + 0.2·(1−centerDistance) + 0.1·sizeRatio + 0.35·textCompatibility` | — |

**契约级安全约束（不得放宽）**：

1. `AMBIGUOUS` 必须**停止**，禁止"取第一个"。
2. `NOT_FOUND` 必须**停止**，禁止自动创建 —— 创建必须经**显式用户确认**（Stage 5.3 的 runner 中即"创建策略 = 模拟用户确认"分支）。
3. 候选池排除 `line`、`groupChild`（`candidateObjects()`）。
4. `match()` **不 throw**，异常一律返回 `status: "ERROR"`。
5. **禁止伪造 `persistedId`**。
6. 复杂度 `O(n)`，**禁止**引入 AI 或网络调用。

---

## 6. C5 — Textbox 输出契约

> 对应真实实现：Stage 5.3/5.4 在真实编辑器内创建，`runtime/stage5-3-real-reconstruction.js` / `stage5-4-real-product-flow.js`

### 6.1 契约要求（全部已在真实编辑器验证）

| 契约字段 | 要求值 | 真实验证 |
|---|---|---|
| `type` | `textbox` | ✅ 实测 4/4 |
| `editable` | `true` | ✅ 实测 4/4（可双击编辑语义） |
| `position` | 由 `image-mapper` 映射得到，非硬编码布局 | ✅ 实测（scale 0.5 一致） |
| `fontFamily` | 网页**原生**字体 | ✅ 实测「思源黑体 Regular」存在于网页字体面板 |
| `fontSize` | 由校准公式得出 | ✅ `fontSize = 0.829 × visualHeight`（short 单行） |
| `markuuid` | `null`（identity clean） | ✅ 实测 4/4 |

### 6.2 默认字体约定

```text
默认字体 = 思源黑体 Regular
```

**依据**：Stage 5.3 native capabilities audit 实测网页字体面板含「思源黑体 Regular」「思源黑体 Medium」「思源宋体 Regular/Medium」；Stage 5.4 创建实测写入该字体串成功。

> 契约要求：默认字体必须是**网页字体面板里真实存在**的候选，禁止硬编码一个网页没有的字体名。

### 6.3 字号约定与已知限制

| 场景 | 公式 / 处理 | 状态 |
|---|---|---|
| short 单行 | `fontSize = 0.829 × visualHeight`（≈ `0.82`），Stage 5.4 实测重建回读 **mean height error = 5.03%** | ✅ 可用 |
| 真实 OCR 行（Stage 5.5） | 同公式 + 宽度防溢出换行修复后，实测 **mean height error = 3.3%** | ✅ 已改善 |
| mid / long 单行 | 同上有偏差（ratioMean 1.206，大字号 6 字换行时 max 2.537） | ⚠️ 需注意 |
| **多行** | **不做单行反推**（需行数估计） | ⏳ `DEFERRED → Stage 5.6 字号精确 / 5.9 多行段落` |

> 契约要求：字号**必须来自校准表/公式**，禁止"猜一个字号"。若场景落在未覆盖区间（多行、超大字号），必须降级为**标记需人工确认**，而不是静默给出错误值。

### 6.4 编组契约

- 多文字安全编组使用 **`fabric.Group` 原生**能力（网站「编组」按钮同源）。
- 编组/解组后成员必须**恢复独立**（实测 PASS）。
- **禁止**自建编组数据结构替代原生能力。

---

## 7. C6 — rollback / changeSet 契约

### 7.1 changeSet 要求

一次重建操作 = **一个可整体回滚的事务**。

| 契约要求 | 真实实现 | 状态 |
|---|---|---|
| 记录本次创建的对象 | runner 内 `created` 列表 + 定向 cleanup | ✅ |
| 只回滚**本次生成**的对象 | `zyCreatedByAssistant` / 定向清理，模板层不动 | ✅ |
| rollback 后**零残留** | 实测：清理 + reload → 21 对象 / 4 原文本 / 3 图 | ✅ PASS |
| mutation 类操作的白名单 diff | `runtime/editor-object-diff.js`（白名单 + 数值容差） | ✅ |
| `setText` 只允许改 `[text, height]` | 实测 `changedFields = [text, height]`；restore 后 `[]` | ✅ PASS |

**硬约定**：

1. `height` 变化来自 textbox **自动换行**，属**已知副作用**，记录为 `OBJECT_MUTATION_SIDE_EFFECT`，**不作为 bug 修复**。
2. 回滚必须能**恢复模板原值**（实测「简小设」→ 改 → 恢复原值）。
3. 一次操作内**禁止**触发保存/提交（in-memory only）。
4. `changeSet` 的粒度是**一次 run**，不是单个对象。

### 7.2 GAP 说明

| 契约要求 | 真实现状 | 判定 |
|---|---|---|
| `runId` 贯穿一次事务（便于诊断/撤销） | ❌ 未实现（`REFACTOR_PLAN.md` R4 提出，从未落地；`ARCH-RISK-001` 开放） | **GAP-3** |
| 「撤销」入口（用户可感知） | ❌ 未实现（当前是 runner 级 cleanup） | **GAP-4** |

> 契约裁定：若要把重建能力接入**产品**（而非审计 runner），必须先解决 GAP-3/GAP-4。
> 在此之前，重建能力的回滚只在审计链内成立。
> 该产品化路径现已由实现线排入 **Stage 5.13 Undo**；引擎注入真机验证（GAP-8）为 **5.6 前置**。

---

## 8. 不变量（Invariants）

以下为**不可违反**的约束，任一条被破坏即视为 `NO-GO`。

1. **原图必须保留**。识别/重建流程内不得删除参考图（实测 `images=4` 保留）。会话级 reload 清除未保存内容属正常语义，不算删除。
2. **模板对象不得被误改**。`MATCHED` 才允许改已有层，且只改 `text`（+ 自动 `height`）；`NOT_FOUND` 需显式确认才能创建。
3. **不得伪造 identity**。新建对象的 `markuuid` 必须为 `null`；禁止复制参考对象的 `markuuid`（Stage 5.1 曾出现 P1 `CREATION_IDENTITY_LEAK`，已修 `f301ba3`）。
4. **不得继承参考对象的运行时缓存/事件**。`inheritReferenceProps` 的 skipBox 必须保持 Stage 5.1 的白名单扩展（`markuuid/uuid/__charBounds/__lineHeights/__lineWidths/_styleMap/__eventListeners/aCoords/oCoords/lastSafeText`）。
5. **不得为测试需要修改生产逻辑**。
6. **FIXTURE 不得冒充 REAL**。凡是 OCR 来源为 fixture 的链路，必须显式标注 `FIXTURE_OCR`。
7. **不得引入 AI 到 matcher 层**（matcher 是确定性层）。
8. **不得持有 raw fabric 对象引用跨模块边界**（`object-model` 必须保持纯数据）。

---

## 9. 契约缺口汇总（交 AI-1 决策）

| ID | 缺口 | 影响 | 建议处置 | 状态（Stage 5.5 后） |
|---|---|---|---|---|
| ~~**GAP-1**~~ | `OCRCandidate` 无 `rotation` | 旋转文本的候选语义不明 | 扩模型 | ✅ **已关闭**（`normalizeBBox` 产出 `rotation`，允许 `null`） |
| ~~**GAP-2**~~ | `OCRCandidate` 无 `coordinateSpace` | OCR 坐标接入靠隐式约定，易错 | 引入枚举 | ✅ **已关闭**（`coordinateSpace: "image-pixel"` + `imageSize`） |
| **GAP-3** | 无 `runId` | 无法诊断/按事务撤销 | 参考 `REFACTOR_PLAN.md` R4 或 Stage 5.13 | ⏳ 开放（**阻塞产品化**） |
| **GAP-4** | 无用户可感知的撤销入口 | 产品化体验缺口 | 事务化 + 撤销 UI | ⏳ 开放 → 已排入 **Stage 5.13 Undo** |
| ~~**GAP-5**~~ | 真实 OCR provider 未接入 | 整链 OCR 源仍是 fixture | Stage 5.5 决策 | ✅ **已关闭**（本地 tesseract 已接入，`REAL_OCR_PROVIDER = PASS`） |
| **GAP-6** | 多行字号未覆盖 | 多行文本字号不准 | 行数估计 | ⏳ 开放 → 已排入 **Stage 5.6 字号精确 / 5.9 多行段落** |
| **GAP-7** | `source` 字段未纳入契约 | FIXTURE/REAL 区分依赖约定 | 正式纳入契约 | 🔄 **已转化**：来源改由 provider 的 `providerType` 承载，语义更明确 |
| **GAP-8** | OCR 引擎在**编辑器页运行环境**可达性 | 生产可用性的最后一跳 | 装载工程 | ❗ **已探测，结论为 BLOCKED**（Stage 5.5A）：`GM_addElement` 注入动作 PASS，但引擎无法暴露全局（CSP 拦外链 CDN + requirejs AMD 吸收 UMD）→ 装载工程列为 **5.6 P1 前置**（3 候选：剥离 AMD 分配的文本注入 / blob worker 资源 / page-world postMessage 桥） |
| **GAP-9** | provider 与重建链均未挂接生产 | 用户实际无法使用 | 产品化接线 | ⏳ 开放（且被 GAP-8 前置阻塞：引擎不可达则接线也无意义） |

> **GAP 不是缺陷，是待办。** 本清单的作用是让实现线在开发时不必猜测契约意图，也让审计者能明确区分"未做"与"做错"。
>
> 本表在每次阶段推进后更新状态；**已关闭项不删除**，保留以记录契约演进过程。

---

## 10. 契约变更流程

1. **契约文件归 AI-2 维护**；AI-1 **不得**直接改本文件。
2. AI-1 若需要变更契约（例如决定扩展 `createOCRCandidate`），通过 **commit message + PR/issue 说明**提出，由 AI-2 更新本文件。
3. 契约变更必须同步更新：本文件 + `docs/CURRENT_STATUS.md` + `docs/TEST_MATRIX.md` 的相关行。
4. **实现与契约不一致时，以实现为事实、以契约标注 GAP** —— 不得为了契约好看而把实现说成已满足。
5. 每次契约变更独立 commit：`docs: amend real ocr demo contract (<GAP-ID>)`。

---

## 11. 与外部指令的差异说明

外部治理指令给出的契约草案包含 `rotation` 与 `coordinateSpace` 两个字段。经核对真实代码：

- **初版审计时（Stage 5.4 @ `3becf04`）**：`ocr-model.js` 的 `createOCRCandidate` **没有**这两个字段 → 曾列为 GAP-1 / GAP-2。
- **Stage 5.5 @ `4cb0819` 之后**：`ocr-provider.js` 的 `normalizeBBox()` **已产出**这两个字段（`coordinateSpace: "image-pixel"`）→ **GAP-1 / GAP-2 已关闭**。
- 指令描述为「重要共享契约」的前提**成立**——`OCRCandidate`、坐标映射、Textbox 输出、证据定义确实是两条线唯一的共享面。
- 但**不成立**的部分：指令假设 `extension/src/ocr/**`、`mapper/**`、`matcher/**`、`object/**`、`bridge/**` 为**独立目录**。真实情况是相关模块集中在两个目录：
  - `extension/src/ocr/`（**4** 个文件：`ocr-model` / `ocr-provider` / `tesseract-loader` / `image-mapper`）
  - `extension/src/editor/`（**4** 个文件：`page-bridge` / `object-model` / `object-adapter` / `object-matcher`）
  且截至 Stage 5.5，**全部仍为未挂接生产**。

本契约始终以**真实实现**为基线：先如实标注差异（GAP），再随实现推进逐条关闭，**不把未实现的部分写成契约已满足**。
