# UI-2 — OCR UI 原生化实施（右栏入口 + 邻接抽屉）

> 阶段：**UI-2**（原生入口 + 面板基础样式实施）
> 维护者：UI / Web Integration 线
> 前置：`docs/UI_NATIVE_AUDIT.md`（UI-1 审计，Gate = GO）
> 目标页面：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`
> 改造对象：`demo` @ `e941e6d`（`zheliyin-card-assistant.user.js` **v0.3.8.0**，74905 B / 1555 行）
> 证据等级：**REAL**（真实 ScriptCat v1.4.0 + 真实折立印 + 目标 URL，Playwright 实测 computed style / getBoundingClientRect）

---

## 1. 结论摘要

| 项 | 结论 |
|---|---|
| **UI-2 Gate** | **PASS（30/30：27 PASS + 3 OK + 0 FAIL）** |
| 改造范围 | **+199 / −13 / 3 hunks**（1555 行中 1225 行逐行未动，占 79%） |
| OCR 技术链 | ✅ **未改动**（14 个技术关键字仅 `handleOcrImage` 出现 1 次，且为 UI 事件绑定行） |
| 关闭风险 | **UI-RISK-01**（z-index 覆盖层）、**UI-RISK-09**（真机几何缺失）、**UI-RISK-10**（浮窗拖拽头遗产） |
| 遗留风险 | UI-RISK-02（observer 无节流）、UI-RISK-03（层叠依赖 DOM 顺序）、UI-RISK-04（Vue 重渲染）→ 留 UI-3/UI-4 |
| 未做 | 视觉融合精修（字体/间距逐像素比对）、4 场景唯一性回归、`.ai-*-Cont` 并排比对 → UI-3/UI-4 |

---

## 2. 真机环境（§十四 要求的真机验证）

| 项 | 实测 |
|---|---|
| 浏览器 | Chrome（隔离 profile，`--load-extension`） |
| 脚本管理器 | **真实 ScriptCat v1.4.0**（MVP3，`chrome-extension://ndcooeababalnlpkfedmmbbbgkljhpjf/src/service_worker.js` 活跃） |
| 目标页 | HTTP **200**，`readyState=complete`（跨环境复现 UI-1 全部几何） |
| viewport | 1440×900，`deviceScaleFactor:1` |
| 依赖加载 | 按 ScriptCat「拼接、作用域共享」语义加载全部 8 个 `@require` 模块后执行主脚本（依据 `field-core.js` 头部约定 + `"use strict"` 下间接 eval 不泄漏声明） |

> **真机通道已建立且可复现**：`ui-audit/ui2-env/`（`probe-ui2.js` / `inject-ui2b.js` / `verify-ui2.js` / `regress-ui2.js`，含 `scriptcat-ext/` 与 `modules/`）

---

## 3. 改造前后对比（真机实测，30 项）

| 项目 | 改造前 | 改造后 | 判定 |
|---|---|---|---|
| 面板 `z-index` | `2147483000` | **`100`** | ✅ PASS |
| 面板 `width` | `246px` | **`311px`** | ✅ PASS（原生 `.design-ai-panel` = 310px） |
| 面板 `background` | `rgb(255,255,255)` | **`rgb(253,253,253)`** | ✅ PASS（`#fdfdfd`） |
| 面板 `color` | `rgb(23,32,51)` | **`rgb(66,66,66)`** | ✅ PASS（`#424242`） |
| 面板 `border-left` | `rgb(215,220,229)` | **`rgb(234,234,234)`** | ✅ OK（`#eaeaea`） |
| 面板 `box-shadow` | `rgba(16,24,40,.12) -8px 0 24px` | **`rgba(0,0,0,.1) 0 4px 20px`** | ✅ PASS |
| 面板 `font-family` | 缺 fallback 链 | **原生完整链** | ✅ OK |
| **面板头 `background`** | **`rgb(31,111,235)` 蓝底** | **`rgb(255,255,255)` 白底** | ✅ **PASS（修复 UI-RISK-10）** |
| 面板头 `color` | `rgb(255,255,255)` | `rgb(66,66,66)` | ✅ PASS |
| 面板头 `padding` | `10px 12px` | `10px 20px` | ✅ PASS（对齐 `.ai-panel-header`） |
| **面板头 `cursor`** | **`move`** | **`default`** | ✅ PASS |
| **入口 tag** | `BUTTON` | **`LI`** | ✅ PASS（原生 li 体例） |
| 入口 `width` | `190px` | `190px`（修复 210px 溢出） | ✅ PASS |
| 入口 `height` | `52px` | **`33px`** | ✅ PASS（对齐 `.tabPageLayer`） |
| 入口 `background` | **`rgb(46,127,240)` 蓝底** | **`rgb(255,255,255)` 白底** | ✅ PASS |
| 入口 `color` | `rgb(255,255,255)` | **`rgb(66,66,66)`** | ✅ PASS |
| 入口 `font-size` | `18px` | **`12px`** | ✅ PASS |
| 入口 `font-weight` | `700` | **`400`** | ✅ PASS |
| 入口 `font-family` | **`Arial`** | **原生完整链** | ✅ PASS |
| 入口 文案 | 单字「识」 | **「图片文字识别」** | ✅ PASS |
| 入口 图标 | 无 | **`diyicon icon-discern`** | ✅ PASS |
| 主按钮 `background` | — | **`rgb(59,130,246)`** | ✅ PASS（`#3b82f6`） |
| select 圆角 | `6px` | **`3px`** | ✅ PASS |
| select `font-size` | `12px` | **`13.3333px`** | ✅ PASS |
| baidu input 圆角 | `6px` | **`3px`** | ✅ PASS |
| status `color` | `rgb(102,112,133)` | **`rgb(106,106,106)`** | ✅ PASS（`#6a6a6a`） |
| 横向滚动 | — | **closed/opened/reclosed 均 `false`** | ✅ PASS |
| 抽屉 toggle | **无法打开** | **`none → flex → none`** | ✅ PASS |
| legacy 浮窗 | 未挂载 | **未挂载** | ✅ PASS |

**统计：27 PASS / 3 OK / 0 FAIL / 合计 30**

---

## 4. 功能回归（§十六 保护性验证，8/8 PASS）

| 项 | 检查点 | 实测 | 判定 |
|---|---|---|---|
| **R1** | UI 唯一性 | `panels=1 / tools=1 / ocrBtns=1 / legacy=0` | ✅ |
| **R2** | 重复挂载守卫（连续 5 次 DOM 变动 + 等待） | `1 → 1 → 1` | ✅ |
| **R3** | status 节点 | `#zy-native-status` = `1`，文本「就绪」 | ✅ |
| **R4** | **Early Click（引擎未就绪点击）** | 状态 → **「正在准备图片…」**，**`newErrors: []`** | ✅ **接线正常，不崩** |
| **R5** | 百度设置区 | `ak/sk/save/test/details` 全 `true` | ✅ |
| **R6** | toggle 双向 + 关闭按钮 | `flex → none → flex` | ✅ |
| **R7** | legacy 浮窗（OCR-only） | `legacy=false / legacyButtons=0` | ✅ |
| **R8** | 布局无重叠无溢出 | 面板 `x=939 w=311 right=1250`；rightBar `x=1250 w=190`；**`overlap=false`**；入口 **`contained=true`**；无横向滚动 | ✅ |
| — | 页面 JS 错误 | `pageErrors: []` | ✅ |

> **R8 关键**：面板右缘 `1250` **精确等于** rightBar 左缘 `1250` —— 完美贴合，零重叠、零溢出。

---

## 5. 改动清单（精确范围）

**改动区间**：orig L296–L625 → mod L296–L811（3 hunks，+199 / −13）
**未动**：前缀 295 行 + 后缀 930 行 = **1225 行（79%）逐行一致**

### 5.1 `addStyles()` — 新增 `#zy-native-ocr-panel` 作用域覆盖段

| 选择器 | 作用 |
|---|---|
| `#zy-native-ocr-panel` | 宽 310 / `#fdfdfd` / `#424242` / `#eaeaea` / 原生 shadow / `z-index:100` / 原生字体链 |
| `#zy-native-ocr-panel .zy-head` | 对齐 `.ai-panel-header`（`10px 20px` / 白底 / `border-bottom #eaeaea` / `cursor:default`） |
| `#zy-native-ocr-panel .zy-title` | 对齐 `.ai-panel-title`（`16px/700` / `#424242`） |
| `#zy-native-ocr-panel .zy-icon-btn` | 原生按钮体例（白底 / `#dbdbdb` / `radius 3px`） |
| `#zy-native-ocr-panel .zy-body` | 对齐 `.ai-panel-body`（`10px 15px` / 保留 `flex:1`/`grid`/`overflow:auto`） |
| `#zy-native-ocr-panel .zy-label` | `12px/400/#6a6a6a` |
| `#zy-native-ocr-panel .zy-input` | 原生 input（`radius 3px` / `#dbdbdb` / `13.3333px` / `#545454`） |
| `#zy-native-ocr-panel .zy-btn` | 对齐 `.ai-btn-blue`（`#3b82f6` / `radius 4px`） |
| `#zy-native-ocr-panel .zy-settings` | `border #eaeaea` / 白底 / `padding 10px` |
| `#zy-native-ocr-panel .zy-status` | `12px/#6a6a6a` |
| `#zy-native-ocr-tool-btn` | **原生右栏 li 体例**（`33px` / 白底 / `12px/400` / `#424242` / `box-sizing:border-box` / `list-style:none`） |
| `#zy-native-ocr-tool-btn.zyo-active` | 展开态高亮（`#f1f1f1` / `#278fcf`） |
| `#zy-native-ocr-panel button/input/select/textarea/summary` | 统一继承原生字体链（消除 `Arial` 回退） |

### 5.2 `mountNativeOcrPanel()` — 入口节点改为原生 `li`

```js
// 改造前：<button> 蓝底 52px / font 18px/700 / textContent="识"
// 改造后：<li role="button" tabindex="0">
//           <i class="diyicon icon-discern zyo-entry-icon"></i>
//           <span>图片文字识别</span>
//         默认收起 + Enter/Space 键盘可达
```

### 5.3 新增抽屉显隐统一入口（消除状态不一致）

```js
function setNativeDrawerOpen(open)   // 统一写 style.display + 同步入口 .zyo-active
function isNativeDrawerOpen()
function toggleNativeDrawer()
```
> 替代原先在 `renderNativeOcrDrawer` / `mountNativeOcrPanel` 两处各自比较 `style.display` 的写法（旧写法在初始未设值时不可靠，真机表现为**抽屉点不开**）。

---

## 6. §十一 namespace 合规核对

| 约束 | 落实 |
|---|---|
| 禁止污染 `.button`/`.panel`/`.input`/`.header` 等全局选择器 | ✅ **零全局选择器**：所有新增规则均以 `#zy-native-ocr-panel` 或 `#zy-native-ocr-tool-btn` 打头 |
| 类名 namespace | ✅ 新增私有类名统一 `zyo-` 前缀（`zyo-entry-icon` / `zyo-active`） |
| 不破坏 legacy（§十二） | ✅ `#zy-card-assistant` 的既有 `.zy-*` 规则**逐行未改**；改用「作用域覆盖」而非「改写基础规则」，故旧浮窗蓝底拖拽头**原样保留** |

---

## 7. 变更统计

| 文件 | 变化 |
|---|---|
| `zheliyin-card-assistant.user.js`（demo 分支） | **+199 / −13 / 3 hunks**（74905 → 84533 B；1555 → 1741 行） |
| `docs/UI_NATIVE_AUDIT.md` | UI-1 → 基线校准 + §0.A 真机补测 + UI-RISK-09 关闭 + UI-RISK-10 新增 + Gate `CONDITIONAL-GO → GO` |
| `docs/UI_2_NATIVE_IMPLEMENTATION.md` | 本文档（新增） |
| `ui-audit/ui2-env/` | 真机环境与证据（脚本 7 个 / 快照 4 个 / 截图 5 张 / 日志 4 个） |
| `ui-audit/ui2-patch/` | `ui2-native.patch`（unified diff）+ 前后完整文件 + `stats.json` |

---

## 8. 下一步

### UI-3（视觉融合精修）
1. 抽屉打开态截图 × 4 viewport，与原生 `.ai-*-Cont`（AI 面板）**并排比对**字体/边框/间距/阴影/header。
2. 精修：`.zy-note` / `.zy-divider` / `.zy-actions` 等次级元素；抽屉与右栏之间是否需要 `.btn-switch` 式拉手过渡（UI-RISK-06）。
3. 处理 UI-RISK-02（MutationObserver 加 `requestAnimationFrame` 去抖）。

### UI-4（真实 ScriptCat 回归）
1. **4 场景面板唯一性**：refresh / route change / SPA navigation / script reinstall。
2. UI-RISK-03（显式层叠策略）、UI-RISK-04（Vue 重渲染存活）。
3. §二十二 全量功能回归：Local OCR / Background Image / Active Image / Early Click / Baidu fallback。

### UI-5（终验）
§十八 8 项 UI PASS + 6 项 OCR PASS。

### 已知待办
- ⚠️ 页面首访存在 `.new-guide.on` 新手引导遮罩，会拦截右栏点击（**非本 UI 引入**，真实用户亦会遇到）→ UI-4 需确认原生功能是否同样被拦，并决定是否需要引导层避让策略。
