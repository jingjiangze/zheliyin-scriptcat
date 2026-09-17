# UI_NATIVE_AUDIT — 折立印 OCR UI 原生化 · UI-1 阶段审计

> 阶段：**UI-1**（真实页面 UI / DOM 审计，**不修改生产代码**）
> 维护者：UI / Web Integration 线
> 目标页面：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`
> 审计对象：`demo` @ `7c1df21`（用户脚本 `zheliyin-card-assistant.user.js` v0.3.7.0，blob `d1f96c4a4fc3a1c580fc3655c8b253cdd9cdd18a`，72705 bytes / 1480 行）
> 方法：Playwright-core + Chromium 1243 真实浏览器，4 个 viewport 实测 + 真实 `cssRules` 提取 + 源码调用图可达性
> 证据等级：见 `docs/EVIDENCE_POLICY.md`。本文件所有几何/样式数字为 **REAL**（真实页面 computed style / getBoundingClientRect）；涉及"当前实现是否达成"的判断标注为 **SOURCE-READ**（源码逐行阅读，非黑盒跑测）
>
> ---
> **⚠️ 基线校准（2026-09-17，UI-2 入口前复查）**
> 审计时远端 `demo` tip 为 `7c1df21`（v0.3.7.0）。复查时远端 `demo` 已推进至 **`e941e6d`**，生产版本为 **v0.3.8.0**（74905 bytes / 1555 行）。期间新增 3 个 commit：
> `107175f`（canvas-ready 等待 UX 分级 → 0.3.7.1）、`4cb7c87`（旋转 OCR 文本框角度修复 → 0.3.8.0）、`e941e6d`（几何矩阵 harness v2 + P5 终版报告）。
> **已逐行比对确认：本文档审计的 UI 代码段（`addStyles` / `#zy-native-ocr-panel` / `#zy-native-ocr-tool-btn` / `renderNativeOcrDrawer` / `mountNativeOcrPanel` / `observeNativeRemount` / `initZheliyin`）在 v0.3.8.0 中结构未变**（仅行号位移：L272→L272、L296→L296、L545→L545、L599→L599、L616→L616、L1445→L1467）。故本文档全部偏差结论**继续有效**，仅版本号与行号需按 v0.3.8.0 阅读。
> `4cb7c87` 改的是 `ocrCreate`/mapper（属 §十六 划定的 OCR 技术链，不属 UI 专项职责）—— 对 UI 接线的影响留待 UI-4 功能回归验证。

---

## 0.A 真机实测补测（UI-RISK-09 闭环，2026-09-17）

> 本节为 **UI-2 入口条件**的补测结果。方法：Playwright-core + **真实 ScriptCat v1.4.0（Chrome MV3）** + 隔离 profile + 真实目标 URL，按 ScriptCat「拼接、作用域共享」语义加载全部 `@require` 模块后执行 v0.3.8.0 主脚本，实测 `#zy-native-ocr-panel` 渲染几何。
> 凭证与脚本：`ui-audit/ui2-env/`（`probe-ui2.js` / `inject-ui2b.js` / `ui2-inject2.json` / `shot-ui2-real.png`）
> 环境：Chrome（隔离 profile）+ ScriptCat `ndcooeababalnlpkfedmmbbbgkljhpjf` v1.4.0 + 1440×900 + `deviceScaleFactor:1`

### 0.A.1 环境可达性（真机通道成立）

| 项 | 结果 |
|---|---|
| ScriptCat service worker | ✅ `chrome-extension://ndcooeababalnlpkfedmmbbbgkljhpjf/src/service_worker.js` 活跃 |
| 目标页 | ✅ HTTP **200**，`readyState=complete`，title「智能设计定制未来」 |
| 原生锚点复现 | ✅ `rightBar` 190×849 @1250,51 / `z-index:20` —— **与 §1.1 四 viewport 审计数字完全一致**（跨环境交叉验证通过） |
| jQuery | ✅ 存在（与 §3.8 一致） |

### 0.A.2 注入体实测几何（原为源码推算 → 现为 REAL）

| 节点 | 实测值 | 判定 |
|---|---|---|
| `#zy-native-ocr-panel` | **246×900 @x=1004, y=0** `position:fixed` **`z-index:2147483000`** `bg:#ffffff` `color:rgb(23,32,51)` `border-left:0.8px rgb(215,220,229)` `box-shadow:rgba(16,24,40,.12) -8px 0 24px 0` font `"Microsoft YaHei","Segoe UI",Arial,sans-serif` | ❌ 与 §6.1 判定一致（编号全部坐实） |
| `.zy-head`（面板头） | 245×46 `bg:` **`rgb(31,111,235)` = `#1f6feb`** `color:#fff` `font-size:12px` `font-weight:400` | ❌ **新增发现（UI-1 未捕获）**：头部是**整块高饱和蓝底白字**，且源码带 `cursor:move` —— 系 legacy 浮窗**拖拽头部**遗产，在右栏抽屉中语义与视觉**双重错误**，是"用户一眼看出是外挂"的最强信号 |
| `.zy-body` | 245×778 @1005,46 `display:grid` `color:rgb(23,32,51)` | ⚠️ 对应 §6.1 色值偏差 |
| `#zy-native-ocr-tool-btn` | **190×52 @1250,y=863** `bg:#2e7ff0` `color:#fff` `font-size:18px` `font-weight:700` **`font-family:Arial`** | ❌ 与 §6.2 判定**逐条坐实**（含字体回退到 Arial 的实测证据） |
| `#zy-card-assistant`（legacy 浮窗） | `null`（未挂载） | ✅ 符合 §13 OCR-only Demo 定位 |
| `.rightPageBar.rightBar` 子节点 | **9 个**，新增 `BUTTON` 排**最后**（在 `DIV.bg-material` 之后） | ✅ 坐实 **UI-RISK-03**（层叠依赖 DOM 顺序） |
| `panel.parentElement` | `BODY`（`<aside>` 挂 body，非挂 rightBar） | ✅ 与源码 L590 `document.body.appendChild` 一致 |
| 横向滚动 | `false` | ✅ 无副作用 |

### 0.A.3 UI-RISK-09 结论

**CLOSED。** 抽屉实际渲染几何与 z-index 影响**已获得真机实测**，UI-1 的数条"源码推算"（固定宽度/固定色/固定 z-index/font 回退）**全部被实测证实**，无一项被推翻；并**新增 1 项 UI-1 遗漏的严重问题**：`.zy-head` 蓝底白字 + `cursor:move` 的浮窗头部遗产（登记为 **UI-RISK-10**）。

---

## 0. 结论摘要（先看这里）

| 项 | 结论 |
|---|---|
| **§七 推荐挂载方案** | **方案 B（原生右栏入口 + 邻接抽屉）**，即当前 `demo` 已选路线 —— 需**保留方向、重做视觉与结构** |
| **当前 `#zy-native-ocr-panel` 是否"原生"** | ❌ **否**。它是 `position: fixed` + 自定义 `zy-*` 设计体系，**并非折立印原生设计语言** |
| 主要偏差 | ① 蓝 `#1f6feb` 品牌色 vs 原生 `#278fcf`/`#3b82f6` ② `z-index: 2147483000` 覆盖层 ③ 阴影/圆角/字号自成一套 ④ 右栏按钮 `52px` 高蓝底白字，**视觉上是外挂** ⑤ 未复用原生 `.design-ai-panel` / `.ai-*` 组件族 |
| 一个必须先纠正的文档错误 | `docs/OCR_DEPENDENCY_POLICY.md` §7.4 称"主 UI 为 `<aside id="zy-native-ocr-panel">` 邻接 `.rightPageBar.rightBar`"→ 代码属实；但同表把 `NATIVE_PANEL` 判为 **PASS**，而该 UI **在当前形态下不满足 §九/§十 的"视觉原生化"要求**。建议将该判定降级为 `PARTIAL`，理由见 §6.4 |
| 工作范围 | UI-1 只审计。**未改动任何生产代码**（`demo` 分支只读；`ai2-repo-governance` 只新增本文档） |

---

## 1. UI architecture（真实页面结构）

### 1.1 顶层布局（1440×900 实测）

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ .toolBar  442×49 @248,0   撤销/重做/背景色/清空/自由绘制 | 备份包/订单号/保存/印刷 │
├──────┬────────────────────────────────────────────────────┬──────────────┤
│ .leftMenu │                                                    │ .rightPageBar│
│ 55×849│            #rectCanvas / #canvasBground            │  .rightBar   │
│  @0,51│            620×377 @503,287                        │  190×849     │
│       │            （fabric 画布宿主）                      │  @1250,51    │
│       │                                                    │  z-index 20  │
│       ├────────────────────────────────────────────────────┤              │
│ .extraBar  55×135 @0,755（快捷键 / 帮助）                    │  tabPageLayer│
│                                                             │  页面/烫金/图层│
│                                                             │  190×33 @1250,51│
│                                                             │              │
│                                                             │  .layerWrap  │
│                                                             │  190×814@1250,86│
└──────┴────────────────────────────────────────────────────┴──────────────┘
                                                    .btn-switch 12×80 @1238,436
                                                    .switch-content 41×849 @1210,51
```

### 1.2 右栏（`.rightPageBar.rightBar`）—— 8 个子节点（真实 DOM 顺序）

| # | 节点 | 几何 | position | 说明 |
|---|---|---|---|---|
| 0 | `.btn-switch` | 12×80 @1238,436 | absolute | 右侧拉手（`radius:40px 0 0 40px`, font 20px） |
| 1 | `.switch-content` | 41×849 @1210,51 | absolute | 素材面板拉手容器（`常用素材` / `<` `>`） |
| 2 | `.tabPageLayer` | 190×33 @1250,51 | static | **原生 Tab 控制器**：`页面` / `烫金`(display:none) / `图层` |
| 3 | `.batch-del` | 0×0 | static | 批量删除（隐藏态） |
| 4 | `.layerWrap` | 190×814 @1250,86 | **fixed** | 图层容器 |
| 5 | `.moveHover` | 0×0 | relative z20 | 图层悬浮菜单（删除/上移/下移/置顶/置底） |
| 6 | `.pageWrapMulti` | 190×769 @1250,94 | static | 多版设计列表（正面/背面） |
| 7 | `.bg-material` | **260×900 @1550,0** | **fixed** | 常用素材滑动面板（相框素材/矢量素材） |

> ⚠️ **关键事实**：`.btn-switch` / `.switch-content` **不是**右栏子元素视觉位置——它们 `x=1238 / 1210`，位于 rightBar **左侧外部**（rightBar 从 1250 起）。它们是"抽屉拉手"体例的原生先例。

### 1.3 右侧滑动抽屉的**原生既有模式**

页面已存在两套"从右侧滑出/贴附"的原生模式，这是方案 B/C 的直接依据：

**模式 1 — `.bg-material`（常用素材）**
```text
position: fixed; width: 260px; height: 900px (=100vh);
background: #fff; border: 0; shadow: none;
由 .switch-content（41px 拉手）+ .btn-switch（12×80 箭头）驱动显隐
```
- 实测：`x=1550`（= 1440+110），即**默认整体位于视口右侧之外**（right = −370）
- 语义：**贴边全高白色面板，无圆角、无阴影**，靠 border 与相邻区域分隔

**模式 2 — `#ai-fangzhiCont` / `#ai-shejiCont`（原生 AI 面板）**
```text
position: absolute; z-index: 100; width: 310px; height: 100%;
background: #fdfdfd; border-radius: 8px;
box-shadow: rgba(0,0,0,.1) 0 4px 20px;
transition: 0.3s;                    ← 抽屉运动
```
- 内部组件族：`.ai-panel-header`（`padding:10px 20px; border-bottom:1px solid #eaeaea; background:#fff`）→ `.ai-panel-title`（`16px/700`）→ `.ai-panel-body`（`padding:10px 15px 10px 5px`，`flex-grow:1; overflow-y:auto`）
- 按钮：`.ai-generate-btn`（`height:44px; border-radius:22px; 渐变; font-size:15px; font-weight:bold`）、`.ai-btn-blue`（`#3b82f6`）、`.ai-btn-outline`（`height:44px; radius:22px; border:1px solid #eaeaea; padding:0 24px`）
- 返回按钮模式：`返回` + 标题（`AI 仿制展开图` / `AI 设计`）

> **这两套就是折立印自己给"右侧面板"的答案。** 方案 B 必须**靠向这两套**，而不是自建 `zy-*` 体系。

---

## 2. Native components（原生组件清单 · 可复用资产）

### 2.1 原生 OCR 既有 UI 资产（页面里**已经有** OCR 相关 DOM！）

| 选择器 | 几何 | 文本 | display | 性质 |
|---|---|---|---|---|
| `dd#clk-ocr` | 260×28 @65,690 | `OCR识别alt+q` | block | **原生 OCR 入口**（快捷键 alt+q） |
| `span#logincallOcrCount` | 0×0 | `0/100` | block | **原生 OCR 配额** |
| `i.diyicon.icon-ocr.ai-ocr-icon` | 0×0 | — | block | 原生 OCR 图标（iconfont） |
| `div#ocrTableCont.subItem` | 0×0 | `返回 上传表格图片` | flex | 原生"上传表格图片"抽屉（**带返回按钮**） |
| `a#ocrLianDan.btn-liandan.pc` | 0×0 | `上传表格图片` | block | 上传表格图片按钮 |
| `div.refOcrcrop1/2`, `.ocrcrop` | 0×0 | `取消 确定` | none | 原生裁剪面板 |
| `input#ocrBgColor / #ocrUid / #ocrDesign` | 0×0 | — | none | 原生 OCR 上下文参数 |

**这条发现极重要**：
1. 折立印**自己就有 OCR 功能入口**（`OCR识别alt+q`，260×28 @65,690 —— 位于左栏底部 `额外工具区`）。
2. 折立印自己就有**"上传表格图片"抽屉**（`#ocrTableCont.subItem`，含 `返回` + `上传表格图片`），**结构与本项目要做的抽屉高度同构**。
3. `#logincallOcrCount` = `0/100` 说明原生 OCR 是**配额制**。

### 2.2 原生"文字识别"素材分类入口（左栏）

```html
<li class="recognitionColor" id="textDisNav">
    <span>文字识别</span>
    <i class="icon-discern"></i>
</li>
<!-- 父级 -->
<ul class="materialType clearfix holdAllItemUl official-material">
```

> 这是**左栏素材分类**里的"文字识别"项（`font-size:12px; color:#fff`）。它属于素材导航，不是 OCR 面板入口，但**是"文字识别"这一中文命名在原生 UI 中的既有用法**——本项目面板标题应与之对齐用词。

### 2.3 原生工具栏分组（11 组 `.toolGroup`，用于理解分组体例）

| # | class | 关键项 |
|---|---|---|
| 0 | `leftBtn toolGroup` 442×50@248,0 | 撤销/重做/背景色(含重置)/清空画布/自由绘制 |
| 1 | `editFontStyle text toolGroup showTip` | 颜色/字体/字号/对齐/间距/环绕/背景填充/字效/描边/艺术字/列表/大小写 |
| 2 | `imgmask toolGroup showTip` | 描边 |
| 3 | `bitmap toolGroup showTip` | 智能抠图/裁切/异形裁切/自动裁切/美化/尺寸/圆角/换图/设为背景/描边/3D文字/改色 |
| 4 | `svg toolGroup showTip` | 颜色/一键改色/填充色/边框色/描边/尺寸/边框粗细/边框角度 |
| 5 | `table toolGroup showTip tableOperat` | 表头色/表体色/边框色/透明/边框粗细/外框/列宽/行高 |
| 6 | `group toolGroup showTip` | 对齐 |
| 7 | `editBar-guides toolGroup showTip` | 颜色/删除 |
| 8 | `cupOneKeyTool toolGroup showTip` | 一键对称 |
| 9 | `generalTool toolGroup showTip` | 锁定/图层/透明度/画布对齐/翻转/旋转/投影/解组/编组/一键对称/复制/删除 |
| 10 | `unknowR toolGroup showTip` | 删除 |

> 体例：**`li` + `diyicon` 图标 + `showTip` 悬浮提示**。组内 `li` 统一 `padding:0 7px`、`font-size:12px`。

---

## 3. Style system（原生设计语言 · 全部为实测值）

### 3.1 字体

| token | 值 |
|---|---|
| fontFamily | `"Microsoft YaHei", tahoma, arial, "Hiragino Sans GB", 宋体, sans-serif` |
| fontSize | `12px` \| `13.3333px` \| `14px` |
| fontWeight | **`400`**（全局，无 700 的正文） |
| lineHeight | `16.8px`（= 12 × 1.4） |

> ⚠️ 当前 `zy-*` 体系用了 `font-weight:700` + `font-size:18px`（右栏按钮）+ `Arial` 混排 —— **与原生不符**。

### 3.2 间距栅格（实测频次排序）

```text
10px ×630   ← 主导
 4px ×278
 5px ×260
20px ×120
 8px ×103
 7px  ×94
 6px  ×87
 2px  ×84
14px ×61 / 12px ×54 / 9px ×47 / 15px ×42 / 16px ×39
```

> **主要栅格 = 4 / 5 / 8 / 10 / 20**。当前 `zy-*` 用 `gap:3px`、`padding:7px`、`border-radius:6px` —— `3px` 不在原生栅格内。

### 3.3 输入控件（原生）

| 控件 | 样式 |
|---|---|
| **行内小输入**（`#pageWidth` 等） | `height:18px; border-radius:3px; border:1px solid #dbdbdb; color:#545454; font-size:13.3333px` |
| **搜索框** | `height:32px; border-radius:20px; background:#f1f1f1; border:0` |
| **下拉 select 类** | `height:~26px; border-radius:2px; border:1px solid #e6e6e6; color:#343434; padding:0 15px 0 5px` |

> 当前 `zy-input`：`border-radius:6px; padding:8px; border:1px solid #d7dce5` → **圆角、边框色、内边距均非原生**。

### 3.4 面板 / 抽屉（原生）

| 组件 | 样式 |
|---|---|
| `.design-ai-panel`（`#ai-*-Cont`） | `background:#fdfdfd; border-radius:8px; box-shadow:rgba(0,0,0,.1) 0 4px 20px; z-index:100; width:310px; transition:0.3s` |
| `.ai-panel-header` | `padding:10px 20px; border-bottom:1px solid #eaeaea; background:#fff` |
| `.ai-panel-title` | `font-size:16px; font-weight:bold` |
| `.ai-panel-body` | `padding:10px 15px 10px 5px; flex-grow:1; overflow-y:auto` |
| `.table-custom-panel` | `border-radius:4px; background:#fff` |
| `.ctip-modal.modal-mini` | `border-radius:5px; box-shadow:rgba(0,0,0,.2) 0 2px 3px; z-index:10000` |
| `.bg-material` | `position:fixed; width:260px; height:100vh; background:#fff; border:0; shadow:none` |

### 3.5 按钮（原生）

| 组件 | 样式 |
|---|---|
| `.ai-generate-btn` | `height:44px; border-radius:22px; font-size:15px; font-weight:bold; 渐变(紫→蓝); box-shadow` |
| `.ai-btn-blue` | `background:#3b82f6; color:#fff` |
| `.ai-btn-outline` | `height:44px; border-radius:22px; border:1px solid #eaeaea; background:#fff; color:#333; padding:0 24px; font-size:14px` |
| `.ai-result-use-btn` | `height:40px; border-radius:20px; background:#3b82f6; color:#fff; font-size:14px` |
| 工具栏 `li` | `padding:0 7px; font-size:12px; color:#424242` |
| `.mbtn`（素材 tab） | `width:130px(260/2); height:26px; font-size:14px; color:#333 / #999(未选中)` |

### 3.6 原生主色

| 用途 | 值 |
|---|---|
| 主品牌蓝（`印刷` 按钮、文字选中态） | **`rgb(39,143,207)` = `#278fcf`** |
| AI 功能蓝 | `#3b82f6`（`rgb(59,130,246)`） |
| 次要文字 | `#6a6a6a`（`rgb(106,106,106)`） |
| 一般文字 | `#424242`（`rgb(66,66,66)`） |
| 弱文字/占位 | `#999` / `#ccc` |
| 分隔线 | `#eaeaea` / `#e4e7ec` |
| 边框 | `#dbdbdb` / `#e6e6e6` |
| OCR 橙（`ocr.css` 上传按钮） | `rgb(252,110,81)` → hover `rgb(243,80,47)` |
| OCR 蓝（`ocr.css` 另一按钮） | `rgb(93,156,236)` → hover `rgb(58,127,216)` |

> **当前 `zy-*` 用 `#1f6feb` / `#2e7ff0`，与以上任一原生蓝都不相同。**

### 3.7 CSS Variables —— **不可依赖**

```
count = 1
--swiper-navigation-size = 18px
```

> 全站仅 1 个 CSS 变量（且属 swiper）。**§十二 的"原生 CSS variables"优先级在本项目实际不可用**，必须走 `原生 class` / `computed style` 路线。

### 3.8 技术栈

```json
{ "jquery": "1.10.2", "vue": true, "react": false, "layer": true }
```

- **jQuery 1.10.2 可用**
- **`vue: true`** —— 注意：虽无 Vue 组件化痕迹，但页面**存在 Vue 运行时**，DOM 可能被 Vue 重渲染接管 → 强化 §十九 的 MutationObserver 必要性，也要求**不要直接改被 Vue 绑定的节点属性**
- 弹层用 `layer`
- 图标：`diyicon`（iconfont 273 rules）+ `colourdiyicon` + `diyicon.css`(228 rules)

---

## 4. Candidate mount points（候选挂载点评估）

| # | 挂载点 | 选择器 | 实测几何 | 优势 | 风险 |
|---|---|---|---|---|---|
| **M1** | 原生 Tab 层 | `.tabPageLayer` | 190×33 @1250,51 | 与 `页面/烫金/图层` 同层级，**最高原生度** | 需改原生 Tab controller（**§八 禁止**）；`烫金` tab 已 `display:none`，插 tab 会破坏三段式布局 |
| **M2** | 右栏容器尾部 | `.rightPageBar.rightBar` | 190×849 | 已实现；DOM 稳定（4 viewport 恒存在） | 直接 `appendChild` 会**插在 `.bg-material` 之后**，且继承 190px 宽 → 与 245px 抽屉冲突；且改动右栏子节点顺序可能影响 `.layerWrap`（`position:fixed`）堆叠 |
| **M3** | 右栏左侧贴边（复用 `.switch-content` 体例） | 新节点，`right:190px` | — | 与 `.btn-switch`/`.switch-content` 同一"拉手"体例；不侵入右栏 DOM | 需与既有 41px 拉手做视觉避让 |
| **M4** | `.bg-material` 同层（fixed 全高贴边） | 兄弟节点，`right:190px` | — | **与原生素材面板完全同体例**（贴边全高白底无圆角） | 与素材面板同时打开时会重叠 → 需互斥逻辑 |
| **M5** | 独立浮窗（现状） | `#zy-card-assistant` | — | 与网页零耦合 | **§十 明令禁止**的"外挂"形态 |
| **M6** | 左栏 OCR 入口锚点 | `dd#clk-ocr` | 260×28 @65,690 | 语义最贴（原生 OCR 在左栏） | 左栏宽仅 55px，容纳不下 245px 抽屉 |

**`.rightPageBar.rightBar` 稳定性复核（§六 要求，4 viewport 实测）**

| viewport | rightBar | 高度规律 | `.bg-material` x | `.switch-content` x | 画布宽 |
|---|---|---|---|---|---|
| 1366×768 | 190×717 @1176,51 | `vh−51` ✓ | 1476（=vw+110） | 1136 | 568 |
| 1440×900 | 190×849 @1250,51 | `vh−51` ✓ | 1550（=vw+110） | 1210 | 620 |
| 1600×900 | 190×849 @1410,51 | `vh−51` ✓ | 1710（=vw+110） | 1370 | 732 |
| 1920×1080 | 190×1029 @1730,51 | `vh−51` ✓ | 2030（=vw+110） | 1690 | 956 |

- **全部 viewport 无横向滚动**（`hasHScroll=false`）
- **`rightBar` 宽度恒为 190px，`right` 恒为 0（完全贴右）**，`z-index:20`，`position:absolute`，`top:51px`，**存在性 4/4 稳定**
- `.bg-material` 的 x **恒为 `vw + 110`**，即无论多宽都整体移出视口右侧 → **这是纯 JS/内联控制的位移**（非 CSS 响应式），说明抽屉开合由脚本控制

> ✅ **`rightBar` 作为锚点是可靠的**（§六 结论：稳定）。但**锚点可靠 ≠ 可直接 append**。

---

## 5. §七 四种挂载方案对比与推荐

### 5.1 评分矩阵（5 维度，1–5 分，5 最优）

| 方案 | 原生程度 | 稳定性 | 低侵入 | 可维护性 | 对网页原逻辑影响 | **总分** |
|---|---|---|---|---|---|---|
| **A** 原生 Tab（`.tabPageLayer` 内新增 tab） | 5 | 2 | 1 | 3 | **1（必须改 Tab controller → §八 禁止）** | **12** ❌ |
| **B** 原生右栏入口 + 同布局抽屉 | **4** | **5** | **4** | **4** | **4** | **21** ✅ **推荐** |
| **C** 原生右栏附近独立原生风格 Panel | 3 | 5 | 5 | 4 | 5 | **22** ⚠️ 并列 |
| **D** 继续旧浮窗（现状） | 1 | 5 | 5 | 3 | 5 | **19** ❌ |

### 5.2 为什么 B 优于 C

两者总分接近（21 vs 22），但**B 在"用户感知为原生"这一唯一目标上明显更强**：

- **C** 是"旁边放一个看起来像原生的面板"—— 用户仍能感知它是**附加物**（因为它不在右栏体系内）。
- **B** 让 OCR 拥有一个**右栏内的高频入口**，用户从"右栏工具栏"进入 —— 这与原生 `页面/图层` 的进入方式同构，**才是"原生功能"的感知来源**。
- **方案 C 的真实风险**：与既有 `.switch-content`（41px 拉手 @1210）和 `.bg-material` **视觉打架**，反而更像外挂。

> **§七 最终推荐：方案 B** —— 但必须满足"入口原生 + 面板原生"两个子条件。当前代码**只做到"入口在右栏"**（`appendChild` 一个蓝底按钮），**未做到"入口原生"**（蓝底 52px 白字是外挂视觉），也未做到"面板原生"（`fixed` + `zy-*` 体系）。**这正是 UI-2/UI-3 要修的核心。**

### 5.3 方案 B 的目标形态（UI-2/UI-3 施工图）

```text
折立印编辑器
├── 原生工具区域（.toolBar / .leftMenu / .extraBar）      ← 不动
├── 原生右侧区域（.rightPageBar.rightBar）
│     ├── .tabPageLayer（页面 / 烫金 / 图层）              ← 不动
│     ├── .layerWrap / .pageWrapMulti                      ← 不动
│     └── ★ [新增] 原生体例入口（li / diyicon / showTip）   ← UI-2
│             例如：<li class="zyo-entry" id="zyo-tab">图片文字识别</li>
│             视觉：font-size:12px; padding:0 7px; color:#424242
└── ★ [新增] 图片文字识别 抽屉（原生体例，right:190px）      ← UI-2 / UI-3
      ├── .zyo-head        ← 对齐 .ai-panel-header（padding:10px 20px; border-bottom:1px solid #eaeaea）
      │     └── 标题 16px/700「图片文字识别」
      ├── .zyo-body        ← 对齐 .ai-panel-body（padding:10px 15px 10px 5px; overflow-y:auto）
      │     ├── 识别方式     ← select，原生 input 体例
      │     ├── 识别当前图片 ← 按钮，对齐 .ai-btn-blue / .ai-generate-btn 体例
      │     ├── 状态         ← .zyo-status（12px / #6a6a6a）
      │     ├── OCR结果      ← 可滚动文本列表（**非** 巨大 textarea）
      │     └── ▸ 百度 OCR 高级设置  ← 折叠（<details>），复用 credential-crypto
      └── 几何：width 245→**310px 对齐 .design-ai-panel**；right:190px；height:100vh
```

---

## 6. 当前实现与原生设计语言的偏差清单（UI-2/UI-3 待修）

### 6.1 面板容器 `#zy-native-ocr-panel`（源码 SOURCE-READ：`demo` @`7c1df21` L272–L287）

| 属性 | 当前值 | 原生基准 | 判定 |
|---|---|---|---|
| `position` | `fixed` | `.bg-material` 也是 fixed → **可接受**；但 `.ai-*-Cont` 用 absolute | ⚠️ 可保留，需确认层叠 |
| `right` | `190px` | 与 rightBar 宽一致 | ✅ **正确** |
| `width` | `245px` | `.design-ai-panel` = **310px**；`.bg-material` = 260px | ❌ 应改 310（对齐 AI 面板） |
| `height` | `100vh` | `.bg-material` = 900px(100vh) | ✅ 可接受 |
| `z-index` | **`2147483000`** | 原生最高 `10000`（`.ctip-modal`）、`100`（AI 面板） | ❌ **严重**：覆盖层级别，会压住原生弹层 |
| `background` | `#ffffff` | `.design-ai-panel` = `#fdfdfd` | ⚠️ 建议 `#fdfdfd` |
| `color` | `#172033` | 原生 `#424242` / `#6a6a6a` | ❌ 非原生 |
| `border-left` | `1px solid #d7dce5` | `#eaeaea` / `#e4e7ec` | ⚠️ 近似，建议 `#eaeaea` |
| `box-shadow` | `-8px 0 24px rgba(16,24,40,.12)` | `.design-ai-panel` = `rgba(0,0,0,.1) 0 4px 20px` | ❌ 方向+色值均非原生 |
| `font-family` | `"Microsoft YaHei","Segoe UI",Arial` | `"Microsoft YaHei", tahoma, arial, "Hiragino Sans GB", 宋体` | ❌ 缺 fallback 链 |

### 6.2 右栏入口按钮 `#zy-native-ocr-tool-btn`（L296–L307）

```css
display: block; width: 100%; height: 52px;
border: 0; background: #2e7ff0; color: #fff;
font-size: 18px; font-weight: 700;
```

| 属性 | 判定 |
|---|---|
| `background:#2e7ff0`（亮蓝实底） | ❌ **典型外挂视觉**（§十）：原生右栏无任何实色大按钮 |
| `height:52px` | ❌ 原生 `li` 约 26–33px（`.mbtn` 26px、tab 33px） |
| `font-size:18px; font-weight:700` | ❌ 原生正文 12px/400、标题 14–16px |
| `textContent = "识"`（单字） | ❌ 原生用词完整（`文字识别` / `上传表格图片`） |
| `width:100%` | ❌ 破坏右栏 190px 内的原生 `li` 体例 |
| 无图标 | ❌ 原生 `li` 一律 `diyicon` 图标 |

### 6.3 内部组件样式（`zy-*` 体系）

| 组件 | 当前 | 原生 | 判定 |
|---|---|---|---|
| `.zy-btn` | `border-radius:6px; min-height:34px; background:#1f6feb; font-size:12px; font-weight:700` | `.ai-btn-blue` `#3b82f6` / 或 `#278fcf` | ❌ 色 + 圆角 + 字重 |
| `.zy-input` | `border-radius:6px; padding:8px; border:1px solid #d7dce5` | `radius:3px; border:#dbdbdb; height:18px` | ❌ |
| `.zy-settings` | `border-radius:6px; background:#fbfcfe; border:1px solid #e4e7ec` | `.ai-setting-header` / `<details>` 体例 | ⚠️ 方向对，色值需换 |
| `.zy-label` | `font-size:12px; color:#475467; font-weight:700` | `12px / #6a6a6a / 400` | ❌ 字重 + 色 |
| `.zy-status` | `font-size:12px; color:#667085` | `12px / #6a6a6a` | ⚠️ 色近似 |
| `gap:3px` / `padding:7px` | 非 4/5/8/10/20 栅格 | 主栅格 4/5/8/10/20 | ❌ |

### 6.4 对 `OCR_DEPENDENCY_POLICY.md` §7.4 的复核意见

| 该文档表述 | 实测/源码复核 | 建议 |
|---|---|---|
| "主 UI 是否为 `position: fixed` 浮窗 → ✅ 否" | ❌ **不准确**。`#zy-native-ocr-panel` 的 CSS 明写 `position: fixed`（L273）。是"贴边 fixed"而非"浮窗"，但字面判定为"否"与代码不符 | 改为"是 `fixed` 贴边（同 `.bg-material` 体例），非浮动卡片" |
| "`NATIVE_PANEL` = ✅ PASS" | ⚠️ 该 UI **满足「有右栏入口 + 邻接抽屉」的结构要求，但不满足 §九（视觉原生化）与 §十（禁止外挂风格）**。蓝底 52px 白字按钮 + `z-index:2147483000` + 自成一套 `zy-*` 设计体系 | 降级为 **`PARTIAL`**，注明"结构 PASS / 视觉 FAIL"，交由 UI-2/UI-3 闭环 |
| "旧浮窗保留为 fallback（符合 §16）" | ✅ 属实（`if (!OCR_ONLY_MODE \|\| !nativeOk) renderPanel()`） | 保留 |

> 本条属于**文档与代码一致性**问题，非功能缺陷。按 `docs/DEVELOPMENT_RULES.md` 与 EVIDENCE_POLICY 精神，**不应以 PASS 记录一个视觉未达标的 UI**。

---

## 7. 风险登记

| ID | 风险 | 等级 | 说明 / 处置 |
|---|---|---|---|
| **UI-RISK-01** | `z-index: 2147483000` 压过原生弹层（原生最高 `10000`） | 🔴 **高** | 抽屉打开时可能遮挡 `layer` 弹层 / 裁剪框（`.ocrcrop`）/ 颜色选择器（`.minicolors-panel`）。UI-2 必须降到原生量级（100–10000） |
| **UI-RISK-02** | `MutationObserver(document.body, {childList:true, subtree:true})` | 🟡 中 | 无节流，全 body 子树监听。§十九 明令"禁止每几十毫秒扫描整个 DOM"。当前实现是**事件驱动（无定时器）**，触发在 DOM 变更时 → 可接受，但**折立印 DOM 变更极频繁**（fabric 重绘、素材加载），建议加 `requestAnimationFrame` 去抖 |
| **UI-RISK-03** | `appendChild` 到 `.rightPageBar.rightBar` 尾部 | 🟡 中 | 插在 `.bg-material`（`position:fixed`）之后，同为 fixed/absolute 混合 → 堆叠顺序依赖 z-index。UI-2 应改用**明确的层叠策略**而非依赖 DOM 顺序 |
| **UI-RISK-04** | 页面含 **Vue 运行时** | 🟡 中 | 若 Vue 接管 rightBar 子树，重渲染可能移除注入节点。当前靠 `MutationObserver` 补偿 → **必须验证**（UI-4 回归项） |
| **UI-RISK-05** | 与原生 OCR 入口（`dd#clk-ocr`「OCR识别alt+q」）**功能语义重叠** | 🟡 中 | 页面本身有 OCR（配额 `0/100`，且绑定"相框"交互，见 `STAGE_5_4`）。两个 OCR 入口可能让用户困惑。UI-2 需在文案上区分（如「图片文字识别」vs 原生 alt+q） |
| **UI-RISK-06** | 抽屉 245px 未与右栏 190px 建立间距体例 | 🟢 低 | 视觉上抽屉左边缘紧贴 rightBar 左边界，缺少原生 `.btn-switch` 那样的拉手过渡 |
| **UI-RISK-07** | CSS 未做 namespace 隔离 | 🟢 低 | 已有 `#zy-native-ocr-panel` / `#zy-card-assistant` 前缀（ID 级），**但 `.zy-*` 类为全局类名** → 与页面 `.btn`/`.input` 不冲突（当前无同名），风险可接受；建议 UI-2 统一收进 `#zy-native-ocr-panel .zy-x` 或改前缀 `zyo-*` |
| **UI-RISK-08** | 旧浮窗与抽屉**同时存在**（两套 UI） | 🟡 中 | OCR-only 模式下浮窗不挂载 → 正常。但 `OcrOnlyMode` 关闭时两套并存 → UI-4 需验证不会同屏出现两个 OCR 入口 |
| **UI-RISK-09** | ~~4 个 viewport 下未验证抽屉实际渲染~~ **→ 已于 0.A 节闭环（CLOSED）** | ✅ 关闭 | 真机实测完成：面板 246×900 @1004,0 / `z-index:2147483000` / `.zy-head` `#1f6feb` 蓝底 / tool-btn 190×52 `#2e7ff0` `Arial`。原"源码推算"全部证实 |
| **UI-RISK-10** | **`.zy-head` 为 legacy 浮窗拖拽头部遗产**（实测 `bg:#1f6feb` 蓝底白字 + 源码 `cursor:move`） | 🔴 **高** | **UI-2 必须重做**：原生 `.ai-panel-header` 体例为 `padding:10px 20px; border-bottom:1px solid #eaeaea; background:#fff` + 标题 `16px/700` 深色字。蓝底白字在右栏抽屉中既是视觉外挂信号，`cursor:move` 更是语义错误（抽屉不可拖） |

---

## 8. 功能回归清单（§二十二，UI-2 起每轮必跑）

| 项 | 检查点 | 本轮（UI-1）状态 |
|---|---|---|
| Local OCR | 本地识别链路可用 | 未测（UI-1 只审计 UI） |
| Background Image | 背景图取图 + 坐标映射 | 未测 |
| Active Image | 选中图取图 | 未测 |
| Early Click | 引擎未就绪时点击不崩 | 未测 |
| Baidu fallback | 本地失败才走远程；成功时 0 远程请求 | 未测（策略侧已有静态可达性证明） |

### UI 误伤检查（§二十三）

| 检查 | 目标 | 本轮 |
|---|---|---|
| selector / ID 冲突 | 无 `zy-*` 与原生同名 | ✅ 无冲突（`zy-` 前缀独占） |
| event 重复绑定 | OCR button 不双触发 | ⚠️ **待验**：浮窗按钮（`#zy-ocr-btn`）与抽屉按钮（`#zy-native-ocr-btn`）分别绑定 `handleOcrImage`，且 `bindOcrControls` 又会查 `#zy-ocr-btn` → **需确认不存在一次点击触发两次识别** |
| status 不更新 | 状态机可见反馈 | ⚠️ 两套 status 节点（`#zy-status` / `#zy-native-status`），需确认共用 `setStatus` 时都更新 |
| MutationObserver 重复挂载 | 面板数恒为 1 | ✅ `if (nativeObs) return` 守卫；`renderNativeOcrDrawer` 首行 `getElementById` 早退 |

---

## 9. 截图对比清单（§二十一）

已采集于本审计工作区（`ui-audit/`）：

| 文件 | 用途 |
|---|---|
| `01-initial-1440.png` | 1440 全页基线（含原生素材面板 / 画布 / 右栏） |
| `02-1920.png` | 1920 全页基线 |
| `vp-1366-full.png` / `vp-1440-full.png` / `vp-1600-full.png` / `vp-1920-full.png` | 4 viewport 全页 |
| `vp-*-toolbar.png` | 4 viewport 顶部工具栏（`0..100px`）—— 用于比对按钮/字号/间距 |
| `vp-*-rightrail.png` | 4 viewport 右栏局部放大 —— 用于比对 tab / 图层 / 拉手 / 抽屉对齐 |

**UI-3 验收时需新增**：抽屉打开态截图 × 4 viewport，与 `.ai-*-Cont`（AI 面板）打开态**并排比对**字体/边框/间距/阴影/header。

---

## 10. UI-1 成功标准核对（§二十四）

| 标准 | 本轮结论 |
|---|---|
| Native Entry | ⚠️ 未达成（蓝底 52px 按钮） |
| Native Layout | ⚠️ 部分（`right:190px` 正确，但 width/z-index/layer 策略需改） |
| Native Style | ❌ 未达成（`zy-*` 自成体系） |
| Native Interaction | ✅ 达成（右栏入口点击 → 抽屉显隐，不与原生交互冲突） |
| No Duplicate UI | ✅ 达成（唯一性守卫齐备） |
| Refresh Stability | ✅ 结构上达成（`observeNativeRemount` 补偿） |
| Template Stability | ⚠️ 待验（`rightBar` 缺失时回退浮窗，逻辑正确） |
| No Original UI Damage | ✅ 达成（未改原生 DOM/class/event；仅 `appendChild` 新节点） |
| Local OCR / Background Image / Active Image / Early Click / Baidu fallback | ⏸ UI-1 不涉及（功能回归列 UI-4） |

> **UI-1 Gate 结论：`CONDITIONAL-GO` → `GO`（2026-09-17 补测后）**
> —— 架构判断明确、挂载方案已定（B）、风险已登记。原「入口条件 = UI-RISK-09 真实环境补测」**已于 §0.A 完成（CLOSED）**：真机 ScriptCat + 真实目标页实测确认面板几何与 z-index 影响，UI-1 全部偏差结论被证实并新增 UI-RISK-10。
> **UI-2 可以开始**。

---

## 10.A UI-2 入口条件核对（补测后）

| 入口条件（原 §13） | 状态 |
|---|---|
| 真实 ScriptCat 环境复测（UI-RISK-09） | ✅ **完成**（§0.A）：真机通道成立、面板实测几何取得、风险关闭 |
| 基线版本校准 | ✅ 完成（§基线校准声明）：审计对象已对齐 `e941e6d` / v0.3.8.0，UI 代码段逐行比对确认未变 |
| 施工图确认（§5.3） | ✅ 可直接执行 |
| 遗留待办 | ⚠️ `.zy-head` 蓝底问题为 UI-1 遗漏，已补登 **UI-RISK-10**（🔴 高），纳入 UI-2 修复范围 |

---

## 11. 取证方式与可复现性

| 脚本（`ui-audit/`） | 作用 | 产物 |
|---|---|---|
| `audit-ui1.js` | 1440 + 1920 基础审计 | `ui-audit.json` / `01-initial-1440.png` / `02-1920.png` |
| `audit-ui1b.js` | 深度审计（`cssRules` 152 条 / AI 面板 / OCR 节点 / toolGroups / tab / bg-material / iconFont / frameworks） | `ui-audit2.json` → `ui-audit2-report.txt` |
| `audit-ui1c.js` | **4 viewport 响应式实测** + 工具栏/右栏局部截图 | `ui-audit3.json` → `ui-audit3-report.txt` |
| `extract.js` / `extract2.js` / `extract3.js` | JSON → 可读报告 | `ui-audit-report.txt` / `ui-audit2-report.txt` / `ui-audit3-report.txt` |

**环境**：`playwright-core` + Chromium `chromium-1243/chrome-win64/chrome.exe`，headless，`deviceScaleFactor:1`。
**注意**：本次运行**未加载 ScriptCat**，故 `injected.zyNativeOcrPanel=false`、`scriptcat=false` —— 原生 `#zy-native-ocr-panel` 的实测几何**缺失**，已在 UI-RISK-09 登记。

---

## 12. 明确未做的事（§二十七）

本阶段**未**触碰：OCR 精度优化、字体识别、样式识别、自动布局、Duplicate、Rollback、Mapper 重写、Provider 重构、Canvas Bridge 重构、`getCanvasInfo`、`ocrPrepare`、Tesseract、OCRCandidate、candidate-normalizer、`ocrCreate`、Textbox creation、fallback-policy、credential-crypto、OCR 识别逻辑。

**未修改任何生产代码**：`demo` 分支只读；本次新增仅限 `docs/UI_NATIVE_AUDIT.md` 与本审计脚本/证据（治理分支）。

---

## 13. 下一步（UI-2）

1. ~~在**真实 ScriptCat 环境**复测（补齐 UI-RISK-09）~~ → ✅ **已于 §0.A 完成（CLOSED）**。
2. **UI-2 改造范围**（按 §5.3 施工图 + §6 偏差清单 + §0.A 实测 + UI-RISK-01/03/10）：
   - **入口** `#zy-native-ocr-tool-btn` → 原生 `li`/`diyicon`/`showTip` 体例（`font-size:12px; padding:0 7px; color:#424242`，h≈26–33px），文案用完整词「图片文字识别」，**消除 `#2e7ff0` 蓝底 + `18px/700` + `Arial`**。
   - **面板头** `.zy-head` → 对齐原生 `.ai-panel-header`（`padding:10px 20px; border-bottom:1px solid #eaeaea; background:#fff`）+ `.ai-panel-title`（`16px/700` 深色）→ **消除 UI-RISK-10 蓝底白字与 `cursor:move`**。
   - **面板体** `.zy-body` → 对齐 `.ai-panel-body`（`padding:10px 15px 10px 5px; overflow-y:auto`）。
   - **几何** `width 245 → 310`（对齐 `.design-ai-panel`）；`z-index 2147483000 → 原生量级`（UI-RISK-01）；层叠策略显式化（UI-RISK-03）。
   - **色值** `#172033 → #424242/#6a6a6a`；`border-left #d7dce5 → #eaeaea`；`box-shadow → rgba(0,0,0,.1) 0 4px 20px`。
   - **控件** `.zy-input` → 原生 `radius:3px / border:#dbdbdb / h18px`；`.zy-btn` → 对齐 `.ai-btn-blue`/`.ai-generate-btn` 体例。
   - **字体** 补齐原生 fallback 链；**栅格** 收进 4/5/8/10/20（消除 `gap:3px`）。
3. 满足 §十七 Git 规则：**入口 `/` 面板改造单独一轮 commit + push + 确认远端**。
4. UI-2 后进入 UI-3（视觉融合并排比对）→ UI-4（真实 ScriptCat 回归，含 4 场景面板唯一性）→ UI-5（§十八 14 项全 PASS 终验）。
