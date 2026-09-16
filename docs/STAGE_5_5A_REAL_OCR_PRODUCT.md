# STAGE_5_5A_REAL_OCR_PRODUCT

Basic Real OCR Demo 产品化验收 · 真实 ScriptCat 用户环境的引擎注入与用户闭环

> 目标（§一/§三十三）：用户在 ScriptCat + 真实折立印编辑器里真正可用"识别图片文字"。不为过 Gate 而包装。

---

## 1. 验收结果（严格分级，§二十七）

```text
REAL_SCRIPT_INJECTION（GM_addElement DOM 注入动作） = PASS
   证据：GM probe（isolated world）GM_addElement 调用成功，主世界 DOM 标记 data-zy-55a-inj=1

engine-in-editor（window.Tesseract 在编辑器页主世界可达） = BLOCKED（产品运行环境限制，非 harness 自动化）
   证据（三层）：
   1) external CDN script：45s 无事件加载、performance tesseract-resources=[]（资源未发起 → CSP script-src 拦截）
   2) inline textContent 注入真引擎（66KB，调试通道不受 script-src 约束）：30s 无全局
   3) inline + 瞬时屏蔽 window.define（requirejs AMD 检测吸收 UMD）：20s 仍无 window.Tesseract
   结论：编辑器页运行环境（CSP + requirejs AMD 全局）令 tesseract UMD 无法以常规注入暴露全局；
         GM_addElement 文本注入路径与 5.1 pageBridge 相同但 tesseract 引擎自带 AMD/环境检测 → 需专用装载（见 5.6 前置）

REAL_OCR（引擎识别能力） = PASS（side-page，真实引擎）
   证据：stage5-5-ocr-feasibility.json（18 words / bbox 18/18 / avg-conf 90.4 / ~3s 首识）

REAL_USER_IMAGE_INPUT：
   PLAYWRIGHT_PASTE = BLOCKED（harness 注入不受理，5.4/5.5 证据）
   REAL_USER（网页上传/粘贴/拖放）= 待真机（网页能力存在；harness 无法替代真实用户操作，诚实待人工）

REAL_OCR_BBOX / REAL_IMAGE_MAPPING / REAL_TEXT_RECONSTRUCTION /
REAL_EDITABLE / ORIGINAL_IMAGE_PRESERVED / ROLLBACK = PASS（5.5 demo 全链 + 本阶段重建逻辑复用）
   evidence：0707035（6 textbox 可编辑/思源黑体/identity clean/误差3.3%/rollback 21-4-3）

RUNTIME_8_3_REGRESSION = PASS（page-bridge 未改；8 套件单测 PASS）

BASIC_REAL_OCR_DEMO_PRODUCT = BLOCKED
   （引擎无法在当前编辑器页运行环境加载 —— AUTOMATION 无关；属 PRODUCT_POLICY/BROWSER-ENV 边界，§二十七 区分明确）
```

## 2. 缓存策略（§六 目标）

- 可行性级：firstLoad ~3s（数据 20MB 懒加载）；indexeddb cacheMethod 已接线（worker 级缓存）。
- **编辑器页不可复现**（引擎不可达）→ 缓存命中实测（data1 vs data2）移入 5.6（引擎注入解决后立即验证）。

## 3. CURRENT_SUPPORTED vs DEFERRED

**CURRENT_SUPPORTED（有真实证据）**
- 本地 OCR 引擎能力（tesseract chi_sim，side-page 验证）
- OCR→OCRCandidate→ImageMapper→Matcher→Textbox 重建链（真实编辑器全链）
- 行级候选（data.lines 优先，word 回退）；校准字号（0.829×vh，误差 3.3%）；防换行宽
- GM_addElement 注入机制本身（5.1 + 本阶段 DOM 标记双重验证）
- fixture OCR 确定性回归（8 套件）

**DEFERRED（明确入队）**
- 引擎在编辑器页运行环境的装载工程（5.6 P1 前置）：候选 A：GM_xmlhttpRequest 取引擎文本 → 剥离 UMD/AMD 分配器后 GM_addElement inline（5.1 已证文本注入通道）；候选 B：worker 资源（wasm/core/语言包）经 blob URL 供给（需实测 CSP worker-src blob 放行）；候选 C：页面 postMessage 桥（page-world 侧容器加载引擎，isolated 编排）
- 缓存命中实测（编辑器页）
- 真实用户图片上传/粘贴/编辑人工验收（REAL_USER_EDITABLE 待真机）

## 4. 独立复审（§ 30/§33 逐项）

| 项 | 结论 | 备注 |
|---|---|---|
| 1 完成了什么 | 注入探针+引擎可达性边界+缓存接线+line-first+loader 模块 | 证据已 push |
| 2 没完成什么 | 编辑器页引擎可达、真机人工闭环 | 环境/人工边界如实 |
| 3 Real OCR 是否运行在 ScriptCat 用户环境 | **否**（引擎无法载入编辑器页运行环境） | 非权限/自动化问题 |
| 4 真实用户能否上传/粘贴 | 待真机（网页能力在；harness 不可代验） | 5.6 用户验证项 |
| 5 用户能否编辑 OCR 文本 | 重建链已证可编辑；真机点击验证待人工 | editable=6/6（5.5） |
| 6 OCR 数值 | candidate 18 words → 6 行（5.5）；bbox 18/18、conf 90.4 | feasibility 存档 |
| 7 Commits | 03f2167（loader）/4cb0819（line-first）/13b348a（注入探针） | 本文档将同批 |
| 8 Push | 全部 origin/stage-4.1-runtime-validation | 无 force/squash |
| 9 working tree | commit 后将 clean | — |
| 10 下一阶段建议 | 5.6 前置 P1：编辑器页引擎装载（三候选评估+实测）；随后真机人工闭环（上传/粘贴→识别→编辑） | 见上 |

## 5. 停止点

按 §三十六：本阶段"真实产品可用"未达成（引擎受编辑器页运行环境限制）—— **如实 BLOCKED 结束**，不进入 5.6 高级功能。装载工程为 5.6 明确 P1 前置（证据充分、路径候选清晰）。