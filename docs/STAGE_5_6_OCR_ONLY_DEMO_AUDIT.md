# Stage 5.6 — OCR-only Demo：UI 架构审计（交付A）

> 审计时点：2026-09-17；分支 `demo`，HEAD `a46dcc5`（v0.3.6.0，P4 交付后），working tree clean。
>
> 本审计只读生产代码（`zheliyin-card-assistant.user.js` 已缓存/逐段核对），未修改任何生产文件。
> 目标：回答「当前 Demo 的 UI 到底由哪些部分组成、OCR 能否脱离套版 UI 单独工作、最小停用方案是什么」。

---

## 1. 结论摘要

| 问题 | 结论 |
|---|---|
| 当前 UI 由哪些部分组成 | ① 旧浮窗 `#zy-card-assistant`（套版+共享+OCR 一体化）；② 原生右栏 OCR 抽屉 `#zy-native-ocr-panel` + 右栏工具按钮 `#zy-native-ocr-tool-btn`；③ 共享初始化（样式/页桥/更新检查） |
| OCR 是否依赖套版 DOM | **否**。OCR 主链（`handleOcrImage`→`waitForCanvasReady`→`waitForOcrTarget`→engine→`ocrCreate`）只依赖：模块级 state、postMessage 页桥、`.zy-status` 类节点；不读 `#zy-raw/#zy-fields/#zy-side-texts/#zy-api-key` 等任何套版 DOM |
| OCR 是否依赖套版状态 | **否**。不读 `fieldState/templateState/sideState`；仅共用 `setStatus`（写所有 `.zy-status`）与 `state.logs` |
| OCR 是否依赖旧浮窗初始化 | **部分**。`addStyles()` 与 `installPageBridge()` 目前只在 `renderPanel()` 内被调用（renderPanel L315-316）；若停用浮窗挂载，必须把这两步前置到 `initZheliyin`，否则 OCR 抽屉无样式、页桥不注入（OCR 直接失效） |
| 推荐停用方案 | **方案 B（初始化级停用）+ 最小前置**：`OCR_ONLY_MODE` 决定 `initZheliyin` 是否调用 `renderPanel()`；样式/页桥/更新检查前置到 init（幂等）；原生右栏缺失时保留浮窗兜底 |
| 隐藏 vs 删除 | **只停用挂载（隐藏入口），不删除任何代码/模块**。`renderPanel`/`bindPanel`/`parseFields`/`applyFieldsToPage`/field-core/config-core/bridge/legacy 全部保留 |

---

## 2. 当前实际 UI 结构（以代码为准）

初始化链（`initZheliyin()` L1485-1492，唯一开机入口）：

```text
initZheliyin()
├── renderPanel()                       # L314：旧浮窗（套版 + 共享 + OCR 全部在里面）
│   ├── addStyles()                     # L108（GM_addStyle，整个 zy-* 样式体系，含原生抽屉样式 L274-310）
│   ├── installPageBridge()             # L1402（页桥注入——目前唯一调用点！）
│   ├── 构建 #zy-card-assistant DOM     # L322-402
│   ├── bindPanel(panel)                # L441（套版按钮 + OCR 按钮 + bindOcrControls("")）
│   ├── makeDraggable(panel)            # L946
│   └── checkForUpdateSoon()            # L1441（版本更新检查——目前唯一调用点！）
├── mountNativeOcrPanel()               # L609：原生右栏抽屉 + 工具按钮
│   └── renderNativeOcrDrawer()         # L554（#zy-native-ocr-panel，suffix=-native 绑定）
├── observeNativeRemount()              # L628：MutationObserver SPA 防重补挂
└── loadBaiduConfig()                   # L512：凭据解密缓存（异步预载，双目标刷新占位）
```

### 2.1 旧浮窗 `#zy-card-assistant`（renderPanel，L314-406）——混合容器

```text
#zy-card-assistant（.zy-head 可拖拽 + .zy-body）
├── 当前网址 / 版本                    # L335-338（共享信息）
├── <details>识别设置</details>         # L339-360
│   ├── #zy-api-key  豆包 API Key       # L344（套版 AI 辅助）
│   ├── #zy-model    模型               # L348（套版 AI 辅助）
│   └── #zy-ocr-mode 图片识别方式        # L352-358（OCR 共享：自动/仅本地/百度云端）
├── <details>百度云 OCR</details>       # L361-378（OCR 共享）
│   ├── #zy-baidu-ak / #zy-baidu-sk     # L365-371
│   ├── #zy-baidu-save / #zy-baidu-test # L372-375
│   └── #zy-baidu-status                # L376
├── #zy-raw 客户文字 textarea           # L379-382（套版输入）
├── #zy-side-texts 正反文本             # L383（套版）
├── #zy-parse-apply 识别并填正反面       # L385（套版主按钮）
├── #zy-append 追加信息                 # L386（套版）
├── #zy-fields 字段网格                 # L388（套版 11 字段）
├── #zy-apply-front 填正面 / #zy-apply-back 填反面  # L390-391（套版）
├── #zy-ocr-btn 识别图片文字            # L394（OCR 入口 ①）
├── #zy-probe 诊断                      # L395（诊断）
├── #zy-update 更新提示                 # L398（共享）
└── #zy-status 状态（.zy-status 类）     # L399（共享状态输出）
```

### 2.2 原生右栏 OCR 抽屉（mountNativeOcrPanel + renderNativeOcrDrawer，L554-638）——OCR 独立容器

```text
.rightPageBar.rightBar
└── #zy-native-ocr-tool-btn「识」         # L615-621（开关抽屉，幂等）
#zy-native-ocr-panel（fixed right:190 width:245）  # L554-607
├── 头部 #zy-native-close                 # L564
├── #zy-ocr-mode-native 识别方式          # L570-575（含隐私提示：本地不上传/百度发送第三方）
├── #zy-native-ocr-btn 识别当前图片       # L577（OCR 入口 ②，绑定 handleOcrImage）
├── #zy-native-status（.zy-status 类）    # L578（setStatus 双目标之一）
├── <details>百度 OCR</details>           # L580-597
│   ├── #zy-baidu-ak-native / #zy-baidu-sk-native
│   ├── #zy-baidu-save-native / #zy-baidu-test-native
│   └── #zy-baidu-status-native
└── 绑定：bindOcrControls(drawer, "-native", null)  # L605（与浮窗共用单一来源）
```

### 2.3 共享层

| 项 | 位置 | 现状 |
|---|---|---|
| `state`（模块级） | L70-77 | fields/frontText/backText/logs/busy/minimized；OCR 只用 logs + busy(套版) |
| `setStatus` | L1044-1049 | 写**所有** `.zy-status`（浮窗+抽屉双目标），与面板存在性解耦 |
| `addStyles` | L108-312 | **仅 renderPanel 调用**；含浮窗与原生抽屉两套样式 |
| `installPageBridge` | L1402-1419 | **仅 renderPanel 调用**；闭包标志幂等（L80/L1408） |
| `checkForUpdateSoon` | L1441-1446 | **仅 renderPanel 调用**；日期守卫幂等 |
| `bindOcrControls` | L469-500 | 浮窗("")/抽屉("-native")共用，单一来源 |
| `loadBaiduConfig` | L512-537 | init 直接调用；占位刷新 querySelectorAll 双目标（L535） |

---

## 3. OCR 依赖矩阵（停用套版会不会误伤 OCR）

### 3.1 OCR 主链对 DOM 的依赖（逐函数核对）

```text
handleOcrImage L799
├── state.ocrPanelClosed      → undefined（未在 state 定义）→ 恒跳过，无依赖
├── setStatus                 → 写 .zy-status 类节点（抽屉存在即有效）
├── waitForCanvasReady L694   → bridgeCall("getCanvasInfo")（postMessage，零 DOM）
├── waitForOcrTarget L683     → bridgeCall("ocrPrepare")（postMessage，零 DOM）
├── 引擎下载/注入              → GM_xmlhttpRequest + GM_addElement + data-zy-ocr-result（零面板 DOM）
├── buildItemsFromOcr L883    → ocrTarget 模块级 + unifyCandidates + postMessage ocrCreate
└── page-bridge ocrCreate     → 页面世界 createTextObject（零面板 DOM）
```

**结论：OCR 主链对浮窗 DOM 零依赖。** 唯一交叉点为 `setStatus`（抽屉有 `.zy-status` 节点）与模块级状态。

### 3.2 OCR 对套版状态/函数的依赖

| 项目 | 是否依赖 | 说明 |
|---|---|---|
| state.fields / frontText / backText | 否 | OCR 不读写 |
| renderPanel / bindPanel | 否（但 init 顺序相关） | OCR 不调用；**但页桥与样式目前经由它们安装** |
| parseFields / applyFieldsToPage / field-core | 否 | 套版私有链路，OCR 无引用 |
| probeCanvas | 否 | 诊断只读，非 OCR 必要 |
| Legacy floating panel | 否（OCR 抽屉独立） | `#zy-native-ocr-btn` 直接绑定 `handleOcrImage` |

### 3.3 反向：套版对初始化共享步骤的依赖

套版（parseFields L988 等）读浮窗 DOM（#zy-raw/#zy-api-key/#zy-model/#zy-fields/#zy-side-texts）。**浮窗不挂载 → 套版按钮不存在 → 这些函数永远不会被触发**，无需改动即可安全停用入口（代码保留）。

---

## 4. 停用方案评估

| 方案 | 描述 | 评估 |
|---|---|---|
| A：入口级隐藏 | 仍调用 renderPanel 但 CSS 隐藏套版区块 | 浮窗仍挂载/更新检查/探针仍跑；需改 HTML 结构分块 + CSS，改动面大于 B，且「隐藏但加载」不符合 Demo 干净感 |
| **B：初始化级停用（推荐）** | `OCR_ONLY_MODE` 决定不调用 `renderPanel()`；把 `addStyles`+`installPageBridge`+`checkForUpdateSoon` 前置到 `initZheliyin`（三者均幂等） | 改动最小（约 8 行）；套版 UI 完全不出现在 Demo；代码零删除；GM 开关 `zyShowTemplatePanel="1"` 可恢复 |
| C：全面 feature flag 化 | 把套版/OCR 全部包进 flag | 过度设计，违反「最小修改」原则 |

**方案 B 前提**（审计确认）：三个前置调用全部幂等——
- `addStyles`：GM_addStyle 重复注入同 CSS 无害（当前 minimize 重建浮窗已反复调用）；
- `installPageBridge`：闭包标志 `pageBridgeInstalled`（L80/L1408）保证同一运行只注入一次；
- `checkForUpdateSoon`：日期守卫（L1442-1444）。

### 4.1 边界情况：无原生右栏的页面变体

`mountNativeOcrPanel()` L609-612 在无 `.rightPageBar.rightBar` 时返回 `false`。OCR-only 下若原生面板挂不上：
- 回退：`initZheliyin` 中 `!OCR_ONLY_MODE || !nativeOk` 时仍调用 `renderPanel()` → 浮窗（含 OCR 按钮 + 状态）兜底，保证可用性；
- 该变体下 OCR 入口回到浮窗 `#zy-ocr-btn`（此时浮窗存在，依赖链成立）。

---

## 5. 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| 停用浮窗后页桥不注入 → OCR 全挂 | **P0** | 实现必须先做：`addStyles`+`installPageBridge` 前置到 init |
| 更新检查入口丢失 | P2 | `checkForUpdateSoon` 一并前置；`showUpdateLink`（L1449-1453）对缺失 `#zy-update` 节点安全返回；版本升级仍由 ScriptCat `@updateURL` 主导 |
| P2-B harness 断言 `legacy-kept`（浮窗存在）在新默认下失败 | P1（测试） | 新增 OCR-only harness（`stage5-5b-p5-ocr-demo.js`）按新默认验证；历史 p2b 证据不动 |
| 诊断入口 `#zy-probe` 仅浮窗有 | P2 | 属套版面板功能，OCR-only 下不可见属预期；GM 开关恢复后可回用 |
| 百度设置入口重复（浮窗+抽屉） | P1 | 抽屉 `-native` 控件即完整能力；两处写同一 GM key，天然一致 |

---

## 6. 推荐最小修改（交付B范围）

1. userscript 顶部新增（模块级，紧跟 VERSION）：
   `const OCR_ONLY_MODE = GM_getValue("zyShowTemplatePanel", "0") !== "1";`
2. `initZheliyin()` 改为：
   ```js
   addStyles(); installPageBridge();
   const nativeOk = mountNativeOcrPanel(); observeNativeRemount();
   loadBaiduConfig().catch(...);
   if (!OCR_ONLY_MODE || !nativeOk) renderPanel();
   checkForUpdateSoon();
   ```
3. 版本 0.3.6.0 → 0.3.7.0（userscript @version/const VERSION、extension/manifest、assistant、README、CHANGELOG、DEMO_REAL_MACHINE_TEST 同步）。
4. 新增 obedience：不删 `renderPanel` 函数体、不删套版任何函数、不删 legacy、不改 OCR/桥/Provider。

**不修改**：field-core / config-core / ai-client / page-bridge / baidu-provider / fallback-policy / candidate-normalizer / credential-crypto / handleOcrImage / buildItemsFromOcr / bindOcrControls / setStatus。

---

## 7. 验收口径

- Demo 用户默认看到：原生右栏「图片文字识别」抽屉（识别方式 + 识别当前图片 + 状态 + 百度设置）；旧套版浮窗不再挂载。
- GM 开关 `zyShowTemplatePanel="1"` → 刷新后浮窗恢复（含诊断/更新提示/豆包 AI 设置）。
- 真实 ScriptCat 回归：背景图 / 选中图 / 早点击三场景，Native→Local→Candidate→Mapper→Textbox（created>0、editable、errors=[]）；回滚清理通过。
- 仓库：套版全部代码保留（静态核对 + 开关恢复动态验证）。