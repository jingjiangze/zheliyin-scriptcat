# STAGE_8A2B_OCR_GEOMETRY_FIX — 阶段性取证报告（A/B/C 根因）

> 分支：stage-8a-2-rotation-policy-geometry（test=0.3.11.2 已同步）；evidence: runtime/reports/stage-8a2/

## A. 背景图为什么向上偏移（ROOT 已钉）

- BROKEN_AT：`buildItemsFromOcr` 旋转分支「AABB 左上 + textbox 自转(origin left)」——anchor 在左上而非中心
- EVIDENCE（REAL，background-position.json）：0° top=23≈正确；angle↑ → top 负向偏移 **2°11 / 5°-13 / 8°-37 / 10°-52（≈-7.5px/°线性）**；canvas.zoom=1.4525 为显示缩放、aCoords 本地不受影响
- FIX 方向（第二阶段）：textbox 中心 = transformed OCR region 中心（中心锚定），OFF 时同理待用 preserveRotation 概念

## B. 普通图片为什么 500×500 → ~700×700（ROOT 已钉）

- BROKEN_AT：fontSize=avgLineH×scaleY÷0.969 只用 **OCR 输入（natural 分辨率）行高**，与图片**显示尺寸解耦**
- EVIDENCE（REAL，direct-image-scale.json）：图显示 100×30~500×150 → textbox **恒定 493×85（fs=59，aCoords 494×86）**；比例随显示缩小而相对放大 → 「500 图出现 700 文字区域」机制
- FIX 方向（第二阶段）：按「显示尺寸/natural 尺寸」归一化 bbox 后再算 fs/尺寸（Geometry 层，禁盲调 0.969）

## C. 88.5×57 为什么第 0 个创建失败（真实异常已捕获）

- EVIDENCE（REAL，canvas-88x57-create-failure.json）：`TypeError: Cannot read properties of undefined (reading 'media') at checkObjsInProductJson (CanvasDiy.js?v=20260707017:190:251) at drawText:416`
- 失败 entry：`font.id="248"`（getEditorDefaultFontId 从 1040459 CSS .fontFamily 抓取）、location.width=493 > canvas 453.2、height=85
- 对照组 252438 同 entry 成功 → **PRIMARY 候选：font.id="248" 在 1040459 无效/该页字体表不同 → 原生 checkObjs 崩溃**；SECONDARY：width 473→493 超画布宽度
- 待解（第二阶段）：fontid 无效 → 回退默认 fontId（id:"1"）或跳过抓取；重测确认 PRIMARY/SECONDARY

## 分类/状态（§28 修复原则：一次只修一个根因）

| 问题 | ROOT_CAUSE | BROKEN_AT | 状态 |
| --- | --- | --- | --- |
| A | WRONG_ANCHOR(旋转 AABB 左上+自转) | buildItemsFromOcr 旋转分支 | 已钉，待 fix（中心锚定） |
| B | SIZE_MAPPING 缺显示归一化 | fontSize/尺寸推算（natural-only） | 已钉，待 fix（Geometry 归一化） |
| C | NATIVE_SCHEMA_REJECTED（font.id 无效→checkObj undefined.media）| page-bridge buildTextMediaEntry getEditorDefaultFontId / CanvasDiy | 已捕获异常；PRIMARY 待复测确认 |

GEOMETRY_READY = NO（§35）。下一刀：A fix（中心锚定，含 OFF 概念）→ 每闭环 commit→push dev→FF test→升版。