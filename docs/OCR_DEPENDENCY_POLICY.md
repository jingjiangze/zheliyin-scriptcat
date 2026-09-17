# OCR_DEPENDENCY_POLICY — OCR 依赖政策

> 维护者：AI-2（Repository Governance 线）
> 性质：**记录与约束**。本文档**不修改** AI-1 的 OCR 实现，只登记依赖事实、风险与规则。
> 相关实现（位于开发分支，**不在治理分支**）：`extension/src/ocr/ocr-provider.js`、`extension/src/ocr/tesseract-loader.js`
> 证据：`runtime/reports/stage5-5-ocr-feasibility.json`（开发分支 `7c412b8`）

---

## 1. 依赖清单（实测事实）

| 依赖 | 事实 | 来源 |
|---|---|---|
| **tesseract.js** | `@5`，`https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js` | `tesseract-loader.js:14` |
| **加载体积（脚本）** | **66 KB** | 实现注释 + 可行性实测 |
| **语言数据** | `chi_sim`（简体中文），**约 20 MB**，**首次使用时才下载**（lazy-load） | 实现注释 |
| **WASM 核心** | 由 tesseract.js 自行加载（同源 CDN 路径） | 引擎内部 |
| **Worker** | `engine.createWorker(lang, 1, { cacheMethod: "indexeddb" })` | `tesseract-loader.js` |
| **缓存** | `cacheMethod: "indexeddb"`（v5 worker 级缓存；语言数据二次命中不再重复下载） | `tesseract-loader.js:71` |
| **注入方式** | isolated world（ScriptCat）经 `GM_addElement` 注入 CDN script 到 page world | `tesseract-loader.js:5` |
| **调用方提供 injector** | 本模块**不依赖 `GM_*`** 本身（可单测） | `tesseract-loader.js:10` |

### 实测耗时（Stage 5.5 可行性，`stage5-5-ocr-feasibility.json`）

```text
脚本加载        loadMs  = 581
worker 就绪     readyMs = 1989   （含语言数据）
识别耗时        recMs   = 351
输出            words = 18 / bboxValid = 18/18 / avgConf = 90.4
页面错误        pageErrors = []
```

---

## 2. 六维度登记（用户指令 §二十八 要求）

| 维度 | 本项目的值 |
|---|---|
| **source** | 第三方 CDN：`cdn.jsdelivr.net`（npm 镜像）。**非自托管** |
| **version** | `tesseract.js@5`（主版本锁定 `@5`，未锁到精确补丁版本） |
| **cache** | IndexedDB（worker 级）；语言数据二次加载命中缓存 |
| **network requirement** | **首次使用必须联网**：`cdn.jsdelivr.net`（66 KB）+ 语言数据（~20 MB）。之后走 IndexedDB 缓存 |
| **privacy** | ✅ 引擎为**本地 WASM**：图片**不上传**、**不需要 key**。⚠️ 但**存在对外请求**（见 §3） |
| **fallback** | 引擎不可用时返回结构化错误 `ENGINE_NOT_LOADED`，**不 throw**、不静默返回空候选冒充成功 |

---

## 3. 风险登记

| ID | 风险 | 等级 | 现状 / 处置 |
|---|---|---|---|
| **DEP-1** | （原）引擎在编辑器页无法加载 | ✅ **已解决** | Stage 5.5A 实测 `BLOCKED`（CSP 拦外链 + requirejs AMD 吸收 UMD + inline 亦不可达）→ **Stage 5.5A-R2 突破（`e9235af`）**：改用 **page-world OCR executor**（UMD `module`/`exports` 遮蔽 + `new Function` + `sourceMappingURL` 换行修复），15 步全 PASS、`errors: []`。首次 2969ms → 缓存命中 **667/674ms** |
| **DEP-2** | **第三方 CDN 依赖**：`jsdelivr` 不可达 / 被墙 / 变更 | 🟡 中 | 注意：5.5A-R2 的 executor 路线是**先把引擎文本取回再注入**，因此 CDN 仍被依赖（取回阶段）。建议：评估自托管 / 多 CDN 回退 |
| **DEP-8** | 识别质量（真实编辑器样本 3 行、词序乱） | 🟡 中 | 机制 PASS 但质量不足；属已知项，排入 Stage 5.9 多行/段落 |
| **DEP-3** | **首次 20 MB 下载** | 🟡 中 | 首次体验有明显等待（readyMs ≈ 2s 是在已有缓存/本地条件下的实测，真实首下可能显著更长）。需在 UI 给出进度与说明 |
| **DEP-4** | **隐私披露**：虽不上传图片，但会请求第三方 CDN | 🟡 中 | 请求本身会暴露「该 IP 在使用本工具」；Referrer 可能带出页面 URL。建议：`referrerpolicy="no-referrer"` + 在文档中明示 |
| **DEP-5** | **版本未精确锁定**（`@5`） | 🟢 低 | 上游在同一主版本内变更理论上不破坏，但仍建议锁定到 `@5.x.y` 并在升级时回归 |
| **DEP-6** | **IndexedDB 缓存体积** | 🟢 低 | 约 20 MB 落在用户浏览器存储配额内；需在卸载说明中提示可清理 |
| **DEP-7** | 行级候选词序质量（`data.lines` 优先，word 回退） | 🟢 低 | 已知项，排入 Stage 5.9（多行/段落） |

---

## 4. 硬规则

### 4.1 禁止把语言数据提交到仓库

```text
✗ 不要把 ~20MB 的 chi_sim traineddata 提交进 Git
✗ 不要把 wasm 核心提交进 Git
```

**理由**：Git 不适合存大二进制；会永久膨胀仓库（且无法通过删除文件缩小历史）；§二十七 明确要求。

若将来确需自托管，必须：

```text
① 单独 release 资产（GitHub Release asset）或独立 CDN —— 不进 Git 历史
② 明确版本与校验（sha256）
③ 记录到本文档的 §1 依赖清单
```

### 4.2 不改 OCR 实现

AI-2 **不修改** `extension/src/ocr/**` 与 `runtime/stage5-*` 的任何实现。
发现问题 → 记录到本文档 §3 风险表 + `docs/SENSITIVE_DATA_AUDIT.md`，交由 AI-1。

### 4.3 隐私底线（不得放宽）

1. `LOCAL` provider **不得上传用户图片**。
2. **不得要求任何 API key**。
3. 不得把用户图片/文字写入仓库、日志、远端服务（见 `docs/REAL_MACHINE_EVIDENCE.md`）。
4. 若要引入 `REMOTE` provider：必须先更新本文档 + `docs/REAL_OCR_DEMO_CONTRACT.md`，并说明上传范围与用户同意机制。

---

## 5. 与契约的关系

`docs/REAL_OCR_DEMO_CONTRACT.md` §3.0 定义了 provider 接口约束：

```text
recognize(image, ctx) → { provider, providerType, candidates[], meta }
引擎未加载 → { error: { errorCode: "ENGINE_NOT_LOADED" }, candidates: [] }，不 throw
```

本政策补充的是**依赖侧**约束（来源/缓存/网络/隐私/回退）。两者共同构成 OCR 层的完整约定。

> **当前最重要的一条**：契约要求「引擎由调用层提供」，而调用层在编辑器页**拿不到引擎**（DEP-1）。
> 因此 **provider 契约成立，但端到端产品可用性仍被阻断**。在此问题解决前，任何一方都不得声称「真实 OCR 产品可用」。

---

## 6. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-09-16 | 初版：依赖清单（含实测耗时）、六维度登记、7 项风险、禁止提交语言数据、隐私底线、与契约的关系 |
| 2026-09-17 | 新增 §7.3（`LOCAL_FIRST`/`REMOTE_FALLBACK` 结构可达性证明）、§7.4（`NATIVE_PANEL` 验证依据）；§7 五项审计项由 `TODO` 更新为实测结论（对象 `demo` @ `e0abcf0` v0.3.6.0） |

---

## 7. AI-1 后续轨道的审计项（先行约定，待实现后逐项核）

AI-1 接下来进入「本地优先 + 百度兜底 + 网页原生面板 + 背景图片」。以下审计项**先行登记**，
实现落地后由 AI-2 逐项核查，结论写回本表。**未实现写 `TODO`，不得预判 PASS。**

| 审计项 | 判定标准 | 当前 |
|---|---|---|
| `LOCAL_FIRST` | 默认 provider = local；且 **local 成功时不得发出任何远程请求**（这是隐私属性，不是性能优化） | ✅ **PASS**（结构验证，见 §7.3） |
| `REMOTE_FALLBACK` | 仅当 local 失败才请求远程；且 **local 成功时远程请求数必须为 0** | ✅ **PASS**（结构验证，见 §7.3） |
| `BACKGROUND_IMAGE` | 背景图场景下坐标映射仍正确（背景图为 canvas 最底层，其变换语义与普通 image 可能不同） | ⚠️ `PARTIAL`（`ocrPrepare` 已按 active→背景→首图 优先级取图 + 居中兜底；真实视觉位置比对仍 `TODO`） |
| `NATIVE_PANEL` | 若最终仍以 `position: fixed` 浮窗作为**主 UI** → 标记为**未达成**设计要求 | ✅ **PASS**（主 UI 已改为 `.rightPageBar.rightBar` 邻接抽屉 + 右栏工具按钮；旧浮窗降为 fallback） |
| `NO_SILENT_FAILURE` | 任何失败路径都必须有用户可见反馈；禁止静默返回空结果冒充成功 | ✅ **PASS**（`OCR_ERR` 四类中文提示 + PREPARING 状态机 + 120s 超时 + `notify-config` 分支；`799e96d` 修复了 P1 静默失败） |

> **复核时间**：2026-09-17，对象 `demo` @ `e0abcf0`（v0.3.6.0）。方法：源码逐行阅读 + 调用点可达性分析（非黑盒跑测）。

### 7.3 `LOCAL_FIRST` / `REMOTE_FALLBACK` 的验证依据（结构可达性）

本次以**调用图可达性**证明，而非仅依赖"设计意图"：

```text
决定函数  : decideFallback({mode, baiduEnabled, failCode, userCancelled})
调用者    : maybeBaiduFallback(img, failCode)      ← 唯一调用点
调用者的调用点（userscript，共 4 处，全部为失败分支）:
    :867  LOCAL_OCR_FAILED      （本地识别失败）
    :871  LOCAL_OCR_PARSE_FAIL  （结果解析失败）
    :872  LOCAL_OCR_TIMEOUT     （超时）
    :906  LOCAL_OCR_EMPTY       （空结果）
```

**推论**：
1. **本地成功路径上不存在任何调用点** → local 成功时必然 0 次远程请求 → `LOCAL_FIRST` / `REMOTE_FALLBACK` 成立。
2. `decideFallback` 首判定 `if (mode !== "auto") return {action:"stop"}` → `local`/`baidu` 显式模式下**永不兜底**。
3. `if (!baiduEnabled) return {action:"notify-config"}` → 未配置凭据时**只提示、不发请求**。
4. `FALLBACK_ABLE` 白名单**不含** `IMAGE_UNAVAILABLE` / `CROSS_ORIGIN_IMAGE` 等输入类错误 → 这类失败**不上传**。

> ⚠️ **本条为静态可达性证明，非运行时抓包**。运行时抓包（网络面板计数）仍列为真机项，见 `docs/REAL_MACHINE_EVIDENCE.md`。
> 两者不冲突：静态证明排除"代码上可能"，真机验证覆盖"环境上确实"。

### 7.4 `NATIVE_PANEL` 的验证依据

| 检查 | 结论 |
|---|---|
| 主 UI 是否 `position: fixed` 浮窗 | ✅ 否 —— 主 UI 为 `<aside id="zy-native-ocr-panel">`，邻接 `.rightPageBar.rightBar` |
| 是否有右栏工具按钮入口 | ✅ 有（与原生工具栏同区） |
| 旧浮窗去向 | 保留为 fallback（符合 §16 约定，非删除） |
| 唯一性 | `renderNativeOcrDrawer` 先 `getElementById("zy-native-ocr-panel")`，存在即返回 → 不重复创建 |
| SPA 重挂载 | `MutationObserver` 处理 late `rightBar` mount（`6517715` 修复「rail 后建则抽屉永不出现」） |

> 4 场景（refresh / route change / SPA navigation / script reinstall）的面板数恒为 1 —— AI-1 报告 P2-B 已验 `refresh-no-dup`；
> route change / SPA navigation / reinstall 三场景仍建议补回归用例。

### 7.1 各审计项的取证方式

| 项 | 怎么验 |
|---|---|
| `LOCAL_FIRST` | 断网/拦截远程域名后跑一次识别：应成功；同时检查网络面板/请求日志为 **0 次外发** |
| `REMOTE_FALLBACK` | ① 正常识别 → 记远程请求数（应为 0）；② 人为使 local 失败（如禁用 worker）→ 应出现远程请求且结果仍可用 |
| `BACKGROUND_IMAGE` | 用带背景图的真实模板，比对 mapper 输出的 canvas bbox 与视觉位置 |
| `NATIVE_PANEL` | 检查 DOM：是否存在 `position: fixed` 且承担主交互的面板；若存在但仅作辅助 → 记录为「辅助浮窗」而非主 UI |
| `NO_SILENT_FAILURE` | 制造 4 类失败（引擎缺失 / 网络失败 / 无选中图 / 空候选），逐个确认都有可见提示 |

### 7.2 面板重复注入（与 OCR 无关，但同属 UI 轨道）

必须验证以下 4 种场景下面板数量恒为 **1**：

```text
refresh              （F5 刷新）
route change         （编辑器内切换路由/模板）
SPA navigation       （前端路由跳转）
script reinstall     （ScriptCat 内重装/更新脚本）
```

> 既有机制：闭包标志（`pageBridgeInstalled`）+ 页面级 marker（`window.__ZY_CARD_ASSISTANT_BRIDGE__`）+ `bridge-lifecycle` 回归（6 用例）。
> 新增 SPA/路由场景需补回归用例后才可标 PASS。

### 7.5 demo v0.3.6.0 新增的运行期依赖（2026-09-17 登记）

Demo 的 `@require` 由 4 条增至 **8 条**，新增 4 条均为**本地**模块（无网络传输用户数据）：

| 依赖 | 作用 | 网络行为 |
|---|---|---|
| `extension/src/ocr/baidu-provider.js` | 百度云 OCR provider | 仅 `auto` 模式兜底时请求 `aip.baidubce.com` |
| `extension/src/ocr/fallback-policy.js` | 本地优先决策（纯函数） | **无**（纯计算） |
| `extension/src/ocr/candidate-normalizer.js` | 候选边界统一（纯函数） | **无**（纯计算） |
| `extension/src/ocr/credential-crypto.js` | AK/SK AES-GCM 加解密 | **无**（纯计算） |

> 新增 `@connect aip.baidubce.com`。注意 `@connect *` 仍在（`HANDOFF-CONNECT-01`，建议收敛）。
| 2026-09-16 | 初版：依赖清单（含实测耗时）、六维度登记、7 项风险、禁止提交语言数据、隐私底线、与契约的关系 |
