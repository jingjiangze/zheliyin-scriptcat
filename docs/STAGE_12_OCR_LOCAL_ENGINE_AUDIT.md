# Stage 12 — 本地 OCR 引擎审计与替换方案（PP-OCRv6 / ONNX）

> 状态：**审计完成，方案待批准实施**（本文件只含审计与计划，不含代码改动）
> 分支：`stage-12-ocr-local-engine`（隔离 worktree `D:/zheliyin-scriptcat-ocr`，基线 `test@ce875f1`，0.3.11.74）
> 目标：把「本地 OCR」从 Tesseract.js chi_sim 换成更好的开源本地引擎（内置模型、离线可用）

---

## 1. 审计方法与证据来源

只读审计：源码（userscript / extension/src）、历史报告（docs/、handoff/、根目录 STAGE*.md）、runtime 报告与运行账（runtime/reports/）、站点运行环境约束（CSP/注入通道）。所有结论均给出文件与行号。

## 2. 现状事实

### 2.1 OCR 引擎矩阵（现状）

| 引擎 | 角色 | 输出 | 位置 |
|---|---|---|---|
| Native OCR（站点 `uploadOCR.do`） | **文字真值**（text truth） | 纯文本行，**无 bbox** | `extension/src/ocr/native-ocr-provider.js` |
| Baidu OCR（云） | 几何证据（bbox） | words + location | `extension/src/ocr/baidu-provider.js` |
| **Tesseract.js chi_sim（本地）** | ① auto 下云失败后的本地兜底 ② Native 未匹配行的几何 sidecar | line/word + bbox | `extension/src/ocr/ocr-provider.js`、`zheliyin-card-assistant.user.js` |
| Alt+Q | 已证伪（站点无此能力） | — | `extension/src/ocr/altq-provider.js` |
| fixture | 单测确定性回归 | — | `ocr-provider.js` |

### 2.2 调用链（真实）

- 默认模式 `auto`：`zheliyin-card-assistant.user.js` → `runBaiduOcr` = `runNativeTruth`（Native 真值）+ `runGeometryRecognition`（几何）；云失败 → `maybeLocalFallback` → `runLocalOcr`（Tesseract）。
- 本地引擎加载：`GM_xmlhttpRequest` 拉 `cdn.jsdelivr.net/npm/tesseract.js@5`（66KB）→ 缓存 → `GM_addElement` 文本注入 page world → 引擎再自行拉 wasm + `chi_sim` 语言包（~20MB，IndexedDB 缓存）。
- 结果桥接：page world 写 `data-zy-ocr-result` DOM 属性 → userscript 轮询解析。
- 降级策略：`fallback-policy.js`（auto=云优先、本地兜底；manual local/baidu 不换路）。

### 2.3 关键事实（决定优先级）

1. **真机 runtimes 里云端 Baidu 因 page-world CORS 未启用** → 实际几何源就是 **Local Tesseract**（`docs/STAGE_9_P2A_WIRING_AUDIT.md:23`）。本地引擎不是「备胎」。
2. **Local 成功恢复 geometry 的真机路径从未复现**：`STAGE9_COMMIT4_REPORT.md:167`「真机 Local（Tesseract 中文）识别质量差，未复现成功路径」。
3. **站点 CSP 已放行 `wasm-unsafe-eval`**（`runtime/RUNTIME_VALIDATION_REPORT.md:43` 记录的 `script-src` 指令），但无 `unsafe-inline` → 新 WASM 引擎**不需要新增注入通道**，沿用 `GM_addElement` + `GM_xmlhttpRequest` 即可。
4. 生产模块经 `@require https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/...` 分发（userscript 头），`raw.githubusercontent.com` 已在 `extension/manifest.json` host_permissions 白名单 → 模型资源放仓库同源分发技术上可行。

## 3. 问题清单（证据驱动）

### P0（直接导致真机效果差）

| # | 问题 | 证据 |
|---|---|---|
| P0-1 | 中文整词误识 | 公司名误识 `回册佛山盛包装制品限`（真值「佛山盛盈包装制品有限公司」）— `docs/STAGE_9_PRECISION_AB_REPORT.md:37`、`docs/STAGE_8D_OCR_QUALITY_RECONSTRUCTION_REPORT.md:65,78` |
| P0-2 | 图形/二维码噪点被当文字 | 单卡 33 归一化行中 **~19 行为 QR 噪点（58%）** — `docs/STAGE_8D_OCR_QUALITY_RECONSTRUCTION_REPORT.md:59`；后续列为待办（同文 L103） |
| P0-3 | 无文本检测（det）阶段 | Tesseract 只有识别；行需自建 word→line 聚类，**词序乱序为已知弱项** — `docs/STAGE_5_5_REAL_OCR_DEMO.md:42`；逐字 bbox 字高差异大需自定容差 — `docs/stage-6-editor-integration-report.md:104` |
| P0-4 | 无行方向/旋转信号 | 「Local Tesseract 不产 rotation → 如实 UNKNOWN/NONE」— `docs/STAGE_8D_P5_AUDIT.md:15` |

### P1（工程/分发）

| # | 问题 | 证据 |
|---|---|---|
| P1-1 | 中文行被插入空格（"空格回潮"），其 `line.text` 不可用 | `docs/stage-6-editor-integration-report.md:105` |
| P1-2 | 依赖 jsDelivr CDN + ~20MB 语言包，离线不可用、首次 3~10s | `extension/src/ocr/tesseract-loader.js:14`、`zheliyin-card-assistant.user.js:1370`、`docs/DEMO_INSTALL.md:18,28` |
| P1-3 | 引擎注入装载脆弱（UMD 被 requirejs AMD 吸收、CSP 拦截外链） | `docs/STAGE_5_5A_REAL_OCR_PRODUCT.md:15-21` |
| P1-4 | 体积/质量权衡历史结论为「依赖体积大、集成重」 | `docs/STAGE_5_4_OCR_ADAPTER_AUDIT.md:50` |

### 影响面

字段级重建仍 NOT READY：公司名识别误、手机截断、姓名/职位/邮箱未形成可读块、QR 噪点未过滤（`docs/STAGE_8D_OCR_QUALITY_RECONSTRUCTION_REPORT.md:78`）。**因为真机几何源=Local，P0-1~P0-4 会直接传到画布。**

## 4. 选型对比

| 方案 | 中文精度 | bbox/行级 | 方向 | 模型体积 | 许可 | 结论 |
|---|---|---|---|---|---|---|
| Tesseract.js chi_sim（现状） | 低（CJK 弱） | 仅 word，需自聚类 | 无 | ~20MB 语言包 | Apache-2.0 | 待替换 |
| **PP-OCRv6 ONNX（det+cls+rec）** | det Hmean 80.6(tiny)/86.2(medium)；rec 73.5%(tiny)/81.3%(small) | **原生行级多边形 bbox** | cls 模型给 180° | tiny 1.8+4.4≈6.3MB；small 9.9+20.4≈30MB | Apache-2.0 | **推荐** |
| RapidOCR（同源 ONNX 转换集） | 同 PP-OCRv6 | 同 | 同 | 同 | Apache-2.0 | 模型来源（取 ONNX 权重） |
| ppu-paddle-ocr（npm, MIT） | 同 | 同 | 同 | 同 | MIT | 备选（现成 SDK，但引入三方依赖与默认模型源） |
| client-side-ocr（npm, MIT） | RapidOCR 包装 | 同 | 同 | 15~30MB | MIT | 备选 |
| 本机 OCR 服务（localhost） | 可用 server 档（最高） | 同 | 同 | — | — | 不属于「内置」，其他用户需自部署 → 不在本轮 |

依据（外部）：PP-OCRv6 三档参数 1.5M/7.7M/34.5M，ONNX 体积 det tiny 1.83MB / small 9.93MB、rec tiny 4.3MB / small 20MB（RapidOCR 集成记录 2026-06-17/18）；官方称 tiny 档纯前端浏览器单图 ~97ms（PaddleOCR 官网）；rec 准确率 tiny 73.5% / small 81.3%（PaddleOCR 文本识别模块文档）。

## 5. 推荐方案

### 5.1 目标架构（下游零改动）

```
GM_xmlhttpRequest（ORT wasm + det/cls/rec ONNX + 字典，SHA-256 校验，CacheStorage 缓存）
        ↓ GM_addElement 文本注入（沿用既有通道）
onnxruntime-web（WASM，CSP 已放行 wasm-unsafe-eval）
        ↓ PP-OCRv6：det（行级框）→ cls（方向）→ rec（文本+置信度）
新增 createPaddleOcrProvider()（输出既有 OCRCandidate 契约）
        ↓ unifyCandidates → ocr-quality 质量门 → Mapper/Editor（不变）
```

### 5.2 模块边界（新增，不改动既有语义）

| 模块 | 职责 | 可测性 |
|---|---|---|
| `extension/src/ocr/ppocr-provider.js` | provider 工厂：`recognize(image, ctx)` → `{provider, providerType:"LOCAL", candidates[], meta}`；bbox 归一到 `{x,y,width,height}`（image-pixel）、confidence 0~1、rotation 来自 cls | node 单测（引擎注入 mock） |
| `extension/src/ocr/ppocr-engine-loader.js` | ORT + 模型加载：URL→缓存键→SHA-256 校验→ArrayBuffer；`ort.env.wasm.wasmPaths` 指向 blob；失败返回 `ENGINE_LOAD_FAILED`（不抛） | node 单测（mock 请求） |
| userscript | `ensureLocalOcrEngine()` 多引擎化（`zyOcrEngine=tesseract\|ppocr`）；executor 注入 + `data-zy-ocr-result` 桥接复用 | 真机 runner |

### 5.3 关键设计约束

1. **Native 仍是文字真值**；本引擎只提供几何 + 本地兜底文字（与 `layout-provider.js` 的 Rule 2 一致）。
2. **行级原生输出**：PP-OCR 有 det，直接产行级候选 → 绕开 `aggregateLineCandidates` 词序/聚类问题（该函数仅保留给无 det 引擎）。
3. **不新增第二套降级**：保持 `fallback-policy.js` 单一决策点。
4. **模型档位**：先 **tiny（≈6.3MB，较现状 -70%）** 打通链路与收益，再按评估集决定是否切 small（同代码，仅换模型文件 + manifest）。
5. **模型分发**：随仓库分支分发（与 `@require` 同源），首用下载一次并缓存；不引入新 CDN 域名（避免再吃 P1-2 的坑）。扩展打包（web_accessible_resources）作为后续可选路径。
6. **完整性**：`ocr-models.manifest.json`（id/sha256/bytes/version），校验失败拒绝使用并诚实报错。

## 6. 验证计划（分阶段，逐段 commit）

| 阶段 | 内容 | 通过标准 | 证据落盘 |
|---|---|---|---|
| V1 单测 | provider 契约、bbox 归一、loader 缓存/校验、失败路径 | 新增单测全绿 + 既有 33 例不回归 | `runtime/reports/stage-12/` |
| V2 离线 A/B | 同图集（名片正面/反面/QR 密集卡）：Tesseract vs PP-OCRv6 tiny | 行数/噪点行率/字段级命中（公司名/姓名/职位/电话/邮箱）量化对比，PP-OCR 不劣于现状 | `runtime/reports/stage-12/ppocr-ab.json` |
| V3 真机 Local 回归 | 46q 正反面场景 + 46p 抽样（Local 模式） | `created>0`、无既有场景回归、Local geometry 恢复数 ≥ 现状 | 复用 46q/46p 报告结构 |
| V4 切默认 | `zyOcrEngine` 默认值切换（独立 commit） | V1~V3 全绿 + 用户确认 | 版本 bump（五处统一） |

**回滚点**：① 开关 `zyOcrEngine` 一键回 Tesseract；② 每阶段独立 commit；③ 模型 manifest 可回退旧版本；④ demo 晋级仍按既有纪律（需用户显式确认）。

## 7. 未决决策（需确认）

1. 集成方式：**自集成 onnxruntime-web（推荐，已按此推进）** / 现成 SDK（ppu-paddle-ocr） / 本机服务。
2. 档位：**tiny 先行（本方案默认）** / 直接 small（精度优先） / tiny→small 评估后定。
3. 模型是否随 Chrome 扩展打包（web_accessible_resources）还是仅走仓库分发（当前默认仅走仓库）。

## 8. 纪律

- 本分支只动 OCR 引擎相关文件；**不碰**另一会话正在开发的 `template-match-*` / `page-bridge.js` / AI 匹配相关文件。
- 版本链纪律：切默认时按「每推必升版，五处统一」执行（header/@require?v=/VERSION/page-bridge stamp/runner BVER）。
- 本文件随审计结论提交；实施阶段另开 commit。

## 9. 实施进度（Stage 12）

| 里程碑 | 内容 | 文件 | 证据 | 状态 |
|---|---|---|---|---|
| M1 det 后处理内核 | 概率图 → 行级框：尺寸规划与反变换、二值化（严格 >）、8 邻域连通域、凸包、最小面积外接矩形、框内均值评分门、unclip 解析式外扩、阅读顺序排序、候选上限 | `extension/src/ocr/db-det-postprocess.js` | `runtime/stage12/db-det-postprocess.test.js`（**11/11**） | ✅ 已实现（未接线） |
| M2 参数与调优逻辑 | 档位基线（tiny/small/medium）、场景增量（card/dense/tilted/qrNoise/lowContrast）、小字放大派生（目标行高 16px 反推 limitSideLen）、长边预算夹紧、人工覆盖、越界夹紧；网格调优 + IoU 指标 | `extension/src/ocr/det-params.js` | `runtime/stage12/det-params.test.js`（**10/10**） | ✅ 已实现（未接线） |
| M3 provider 装配（离线可测） | 图像预处理与旋转感知裁切（det/rec/cls 张量、BGR 默认、两套 mean/std）、字典组装 + CTC 贪心解码 + cls 判定、模型清单解析/SHA-256 校验/缓存加载、provider 端到端编排（det→后处理→映射→cls→rec→候选契约，假 session 可测） | `ppocr-image-ops.js` / `ppocr-rec-decode.js` / `ppocr-engine-loader.js` / `ppocr-provider.js` | `runtime/stage12/ppocr-*.test.js`（8+8+7+6=**29/29**，含真实 ORT 异步回归护栏） | ✅ 已实现（未接线） |
| M3b 真实模型 + ORT 接线（已验证） | 模型落库（det 1.83MB / rec 4.49MB / dict 27KB / cls 1.02MB，真实 sha256 + `.gitattributes` 字节保护）；ORT 会话适配（`ort.InferenceSession` → session 接口）；真实浏览器验证 harness | `assets/ocr/ppocrv6/**`、`ppocr-ort-session.js`、`runtime/stage12/ppocr-browser-check.js` | 真实 Chrome + ORT 1.30.0：彩色名片样张 4 行 **字符准确率 100%**；端到端 ~0.7–0.9s（WASM 单线程）；`runtime/reports/stage-12/ppocr-browser-check.json` | ✅ 已验证（未接线主链） |
| M3-P 使用策略改造（已接线） | ① **未输入/未配置云端 API Key → 本地直出**（不再发起注定失败的云端请求，站点原生 OCR 文字真值照常执行）② **云端未返回结果 / 结果不全 → 本地辅助补齐**（cloud 0 行或质量门失败 = 本地几何全量接管；cloud 有行但 Native 行未全定位 = 本地几何补位 unmatched）。单一决策点仍在 `fallback-policy.js`，未新增第二套降级 | `extension/src/ocr/fallback-policy.js`（`decideOcrRoute` / `decideLocalAssist`）+ userscript 路由分发 / 本地辅助接线 / UI 文案 | `runtime/stage12/fallback-policy.test.js`（**12/12**）；开关 `zyLocalAssist`（默认 1）；版本 bump **0.3.11.77** | ✅ 已接线（引擎仍 Tesseract，M3c 后自动切换 ppocr） |
| M3c userscript 接线 | `@require` 接入 + GM 下载器 / WebCrypto / CacheStorage 适配 + 页面世界执行器 + `zyOcrEngine` 开关（默认关闭）+ 版本五处统一 | — | — | ⏳ 待做（需与另一会话的 userscript 改动协调） |
| M4 离线 A/B → 真机回归 → 切默认 | 见第 6 节 V2/V3/V4 | — | — | ⏳ 待做 |

**真机实测修正（真实模型 + 真实浏览器暴露，均已落码 + 单测护栏）**：
1. **det 输入必须 32 对齐**：非 32 倍数在 ORT 内触发 `Shape mismatch attempting to re-use buffer`；修复 = `planDetResize.alignTo=32` + 反变换改为 **按轴** `scaleX/scaleY`（单比例会造成长边方向系统性偏移）。
2. **provider 必须 await `session.run`**：真实 ORT 返回 Promise，原同步取值路径直接 `DET_FAILED`（单测的同步假 session 曾掩盖该缺陷 → 已补异步回归护栏）。
3. **cls 输入是 `3×80×160`**：不是 PP-OCRv4 时代的 `48×192`；且宽度固定、不按长宽比（`cropRectBilinear.outWidth`）。
4. **charset 必须 `useSpaceChar=false`**：PP-OCRv6 tiny 字典第 617 行本身就是全角空格（index 616 = space 类），再前置空格会整体错位一位 → 实测文本全乱码（已对照实证）。

**与 PaddleOCR 的差异（如实声明）**：轮廓用「连通域 + 凸包」替代 `cv2.findContours`（外轮廓语义等价，不做孔洞）；unclip 用矩形解析式 `d = A*r/P` 替代 pyclipper 多边形 offset（对矩形/近矩形文字行等价）；仅实现 `box_score_fast`；像素中心点集 + 0.5px 半径补偿对齐像素外框。

**未升版说明**：M1~M3 为新增未接线模块，不进入 userscript `@require` 链、不改任何既有文件 → 版本保持 0.3.11.74（与 Commit L2「未接线，版本保持」同一纪律）。**M3-P 已接线**（改 `fallback-policy.js` 既有模块 + userscript 路由/辅助/UI 文案）→ 按纪律五处统一升版 **0.3.11.77**（@version / @require?v= / VERSION / page-bridge stamp / runner BVER）。当前 Stage 12 单测合计 **62 例全绿**（M1 11 + M2 10 + M3 29（8+8+7+6）+ M3-P 12，`node runtime/stage12/<file>.test.js`）。

**M3-P 语义边界（如实声明）**：
1. **文字真值恒为站点原生 OCR**（与云端 API Key 无关）→ 本地直出/本地辅助都只补几何，不产最终文字；越界由现有 Native Truth Gate 拦截。
2. **云完整覆盖时零额外开销**：`decideLocalAssist` 返回 `assist=false`，不下载、不运行本地引擎。
3. **本地辅助只补位不覆盖**：`recoverNativeGeometry(localCandidates)` 只在 unmatched Native 行上恢复几何，已被云端几何命中的行不重算。
4. **一键回退**：`zyLocalAssist=0` 关闭本地辅助（回到 M3-P 之前行为）；`zyStage9LocalSidecar=1` 仍可强制开（旧开关保留）。

**M3 关键接口（供 M4 实现真实适配）**：provider 只依赖 `session = {det, rec, cls?}`：
`det.run({data, dims}) → {probMap, dims}`；`rec.run(input) → {data|probs, timeSteps, classes, applySoftmax?}`；`cls.run(input) → {data:[p0,p1]}`。
M4 只需把 `ort.InferenceSession.run` 的输出包成上述形状，并注入 `fetchBytes`（GM_xmlhttpRequest）+ `sha256`（WebCrypto）+ `cache`（CacheStorage）即可打通真实模型。