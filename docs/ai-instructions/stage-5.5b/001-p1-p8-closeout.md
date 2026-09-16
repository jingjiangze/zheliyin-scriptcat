# 001 Stage 5.5B → P1→P2→P3→P6→P7→P8 真机闭环（用户完整指令归档）

> 来源：用户 2026-09-16 会话指令。原文完整保留，逐条编号与用户发给 AI-1 的指令一致。
> 归档原因：§0「全过程必须同步进入 GitHub……以后任何人只通过 GitHub，就能还原为什么这么改、谁要求这么改、改了什么、测试了什么、为什么通过」。

## 0. 最重要的新要求：全过程必须同步进入 GitHub

从现在开始，本项目不仅要同步：代码、测试、报告、commit，还必须同步：我发给 AI-1 的任务指令、AI-1 的执行记录、每阶段决策、测试证据、失败原因、修复过程、最终验收结论。
目标：以后任何人只通过 GitHub，就能还原「为什么这么改、谁要求这么改、改了什么、测试了什么、为什么通过」。不要只保留最终结果。

## 1. 用户指令必须归档

以后每次阶段性指令都必须进入仓库。建议目录：

```text
docs/
├─ ai-instructions/
│  ├─ stage-5.5b/
│  │  ├─ 001-stage-5.5b-continue.md
│  │  ├─ 002-p1-real-device.md
│  │  ├─ 003-p2-native-panel.md
│  │  └─ ...
│  └─ README.md
├─ execution-records/
│  ├─ stage-5.5b/
│  │  ├─ 001-execution.md
│  │  ├─ 002-execution.md
│  │  └─ ...
├─ evidence/
│  └─ stage-5.5b/
└─ stages/
   └─ STAGE_5_5B.md
```

如果仓库已有类似目录：优先复用现有结构，不要为了这个要求重新设计文档体系。

## 2. 当前这份指令也必须归档

把本轮完整指令保存到 `docs/ai-instructions/stage-5.5b/`，文件名 `XXX-stage-5.5b-p1-p8-closeout.md`。必须保留：任务目标、约束、验收标准、当前状态、用户提出的关键问题、停止条件。不要只提炼成摘要。

## 3. AI-1 执行记录也必须同步

每完成一个逻辑阶段，生成 `docs/execution-records/stage-5.5b/` 对应记录，至少记录：时间、当前 branch、当前 commit、执行目标、修改文件、测试命令、测试结果、失败、失败原因、修复、重新测试、最终结果。浏览器控制台证据 / ScriptCat 日志 / 截图 / JSON report 归档到 `docs/evidence/stage-5.5b/`。

## 4. Git 提交必须独立

一个逻辑修改 = 一个独立 commit。不要把代码/测试/文档/多个功能塞进一个巨大 commit。禁止 force push。保持可回滚、可审计、可追踪。

## 5. 每个阶段完成后立即 commit + push

流程：修改 → 测试 → 记录证据 → 更新执行记录 → commit → push → 继续下一步。GitHub 应实时反映进度。

## 6. 当前 P1 真机错误不要直接修改 OCR

当前真实提示：`画布未就绪，请等待模板加载完成`。先调查。不要直接把 `canvas not ready` 当成 OCR bug。必须首先确认完整时序：网页打开 → 模板加载 → 编辑器初始化 → Fabric 初始化 → canvas 创建 → backgroundImage/objects 加载 → Assistant 初始化 → OCR panel 初始化。记录每一步实际发生时间。

## 7. 重点排查“初始化时序”

检查：canvas 是否真的尚未创建、canvas 元素是否存在、Fabric 实例是否存在、editor 是否 ready、模板数据是否完成、backgroundImage 是否完成、当前 route 是否完成。同时检查：DOMContentLoaded、load、SPA route change、Vue/React 等框架生命周期、Fabric 初始化回调、现有编辑器 ready 信号。不要猜。

## 8. 不允许简单增加固定 sleep

禁止用 `setTimeout(..., 5000)` 掩盖问题然后声称 canvas ready。如果必须等待，应建立 `waitForCanvasReady()` 或复用网页已有 ready 信号。优先：事件、Promise、MutationObserver、已有 editor lifecycle，而不是固定延迟。

## 9. P1 真机必须证明两种情况

### 情况 A：正常加载
打开模板 → 等待编辑器 ready → OCR panel → 识别。必须 PASS。

### 情况 B：用户过早点击
打开页面 → canvas 尚未 ready → 用户点击 OCR。不能：报错、无反应、console exception。应该：`正在等待编辑器加载…`，然后 canvas ready → 自动继续；或提示用户稍后重试。但必须有明确 UI 状态。

## 10. 当前“无反应”的历史根因必须保留

已经确认：`bindPanel()` → 绑定不存在的 `#zy-probe` → 提前抛错 → 后续 OCR 按钮没有完成绑定 → 用户看到“点击无反应”。因此不要重新把问题解释成“background image 不支持”。现在已经修复：active image + background image。

## 11. 当前 P1 最高优先级回归

必须真实执行：上传图片 → 设为背景 → activeObject = null → backgroundImage != null → 点击 OCR。验证 `resolveOcrTarget()` 得到 `background-image`，而不是 `IMAGE_UNAVAILABLE`。

## 12. 普通 Image 也必须测试

场景：上传图片 → 选中图片 → 点击 OCR。必须 `resolveOcrTarget() → active-image`。

## 13. 背景图坐标不要假设

真实读取：`backgroundImage.element / width / height / scaleX / scaleY / angle / left / top`。如果 left/top 不存在：使用现有居中 fallback。不要在当前 Stage 创建复杂背景定位系统。

## 14. P2 正式进入原生网页面板

目标：折立印网页现有右侧面板 → 图片文字识别。不是独立浮窗。先做 DOM 审计，不要猜 selector。记录：真实 selector、class、id、DOM hierarchy、SPA 生命周期。

## 15. 原生 Panel 优先级

依次寻找：现有助手 panel → 现有属性 panel → 现有工具栏。能嵌入现有 panel，就不要创建新的 `position: fixed` 浮窗。

## 16. 旧浮窗暂时不要删除

先停止作为主 UI，保留实现。等 Native Panel + Real ScriptCat + Real User 全部稳定后再考虑删除旧 UI。

## 17. P2 第一版 UI

保持简单：`图片文字识别 / 识别方式：[自动（本地优先）] / [识别图片文字] / 状态：就绪`。高级设置 `▸ 百度 OCR`：Access Key、Secret Key、[保存]、[测试连接]。不要把 Tesseract / WASM / worker / IndexedDB 暴露给普通用户。

## 18. P3 目标

技术实现已完成。P3 真正目标：Native Panel → Local Tesseract → OCRCandidate → Mapper → Textbox。必须从真实网页 UI 触发。

## 19. Local First 必须继续保持

Local 成功：Local PASS → Baidu request = 0。必须有证据。

## 20. Local Failure 必须自动 fallback

制造 `LOCAL_ENGINE_LOAD_FAILED` 或 `LOCAL_OCR_TIMEOUT`，验证 Local → 失败 → Baidu。记录 `fallbackReason`。

## 21. AK/SK 安全描述必须准确

GM_setValue 可以用于：不提交 Git、不出现在页面源码、不写普通日志。但不能声称 AK/SK 是绝对安全的秘密。必须在文档写明：百度 AK/SK 属于客户端凭据。GM 存储可以避免明文进入 Git、页面和普通日志，但无法消除浏览器用户脚本环境下凭据被本机用户或脚本环境获取的风险。

## 22. 百度 OCR 隐私提示

UI 至少明确：本地识别失败后，自动切换百度 OCR 时，图片会发送到百度 OCR 服务。并区分：Local → 不上传图片；Baidu → 图片发送给百度。

## 23. Provider 职责保持不变

统一 `createTesseractProvider() / createBaiduProvider() / createFixtureProvider()`，输出 `{text, bbox, confidence, coordinateSpace}`。Provider 不负责 Canvas。

## 24. OCR 文本质量

当前 Stage 暂时不要进入高级 OCR。优先 Tesseract `data.lines`；如果可以直接获得 line bbox：使用原生 line bbox。不要继续扩大 clustering 算法。当前第一版允许少量文字识别错误，但不允许 bbox 错位、Textbox 不可编辑、位置完全错误。

## 25. P6 背景图验收

至少：A 普通 Image、B backgroundImage、C backgroundImage + no activeObject，全部测试。

## 26. 重复识别

第一次 5 textbox，第二次仍然约 5 个，不能 10 个。继续使用 Matcher + OCR 生成对象保护。

## 27. Rollback

至少验证：OCR 生成失败、OCR 中途失败、Mapping 失败、Textbox 创建失败。不能留下半成品、孤立对象、错误对象。

## 28. Real ScriptCat

最终必须在 Chrome/Edge + 真实 ScriptCat + 真实折立印网页测试。不能只依赖 Node / JSDOM / Mock / Fixture / Headless，这些只能作为辅助证据。

## 29. 真机人工验收

必须人工完成：1.打开编辑器 2.等待模板加载 3.上传图片 4.设为背景 5.打开网页内 OCR 面板 6.点击识别 7.等待 OCR 8.查看文字 9.双击文字 10.修改文字 11.再次识别。记录实际结果。

## 30. 最终用户体验

折立印 → 右侧助手 → 图片文字识别 → [识别图片文字] → 本地 OCR → 必要时自动百度 → 原位置出现可编辑文字。不能依赖外部浮窗才能完成主要操作。

## 31. Demo branch

最终建立 `demo`（不存在就创建）。`main` 继续作为稳定线。不要破坏 main。

## 32. 版本一致性

当前 0.3.6.0。下一次用户可见功能更新递增。必须同步检查：userscript @version、const VERSION、assistant version、manifest version、README/release metadata。不得出现多个不同版本号。

## 33. Demo URL

最终确认 `https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js` 实际存在且内容正确。不要只写在 README 里就算 PASS。

## 34. Demo Update

测试：安装旧版本 → 发布新版本 → ScriptCat 检查更新 → 发现新版本 → 升级。必须有真实证据。

## 35. 不要为了测试 PASS 修改断言

所有 FAIL 必须判断：实现 bug / 测试 bug / 环境限制。只有测试本身前提错误才能修改测试。禁止为了 PASS 降低断言。

## 36. Git 提交建议

保持独立，例如：`test: finalize canvas readiness regression`、`fix: handle editor canvas initialization timing`、`feat: embed ocr into native editor panel`、`test: local ocr from native panel`、`test: baidu fallback from native panel`、`fix: prevent duplicate ocr reconstruction`、`test: real scriptcat demo flow`、`docs: record stage5.5b closeout`、`docs: archive ai instructions and execution records`。实际提交信息根据真实改动调整，不要凑数量拆 commit。

## 37. 每个 commit 都必须 push

流程：修改 → 测试 → 记录 → commit → push → 确认 remote → 下一阶段。最终 `git status` 必须明确 `clean`，并确认 local HEAD = remote HEAD。

## 38. 重要：不要丢失历史记录

已有 Stage 1/2/3/4/5/5.5/5.5B。不要覆盖已有记录。如果已有 AI-1 execution log / completion report / test report：继续追加或建立新的编号。不要 rm / rewrite / replace。历史证据必须保留。

## 39. 本轮结束时必须更新总索引

如果仓库存在 CHANGELOG / README / STAGE_INDEX / AI_HISTORY，把本轮状态同步进去。至少能看到：Stage、状态、当前版本、commit、测试、下一步。

## 40. 最终 Gate（逐项输出）

```text
LOCAL_OCR PASS  BAIDU_OCR PASS  LOCAL_FIRST PASS  AUTO_FALLBACK PASS
NORMAL_IMAGE PASS  BACKGROUND_IMAGE PASS  NO_ACTIVE_BACKGROUND PASS
CANVAS_READY PASS  CANVAS_EARLY_CLICK PASS
NATIVE_WEB_PANEL PASS  OCR_BUTTON_RESPONSE PASS
REAL_SCRIPTCAT PASS  REAL_OCR PASS  REAL_BBOX PASS  REAL_MAPPING PASS  REAL_TEXTBOX PASS  REAL_EDITABLE PASS
DUPLICATE_PROTECTION PASS  ROLLBACK PASS
DEMO_INSTALL PASS  DEMO_UPDATE PASS
GIT_CLEAN PASS  REMOTE_SYNCED PASS  DOCUMENTATION_SYNCED PASS
USER_INSTRUCTIONS_ARCHIVED PASS  EXECUTION_RECORD_ARCHIVED PASS
```

## 41. Technical / Product / Real User 必须分开

报告不能混淆。例如：Tesseract technical = PASS、Native panel = PASS、Real editor = PASS、Real ScriptCat = PASS、Real user = PENDING。只有真的人工完成之后才能写 Real User = PASS。

## 42. 当前停止条件

只有当 Native Web Panel + Local OCR + Baidu fallback + Background Image + No Active Object + Real Textbox + Editable + Rollback + Real ScriptCat + Demo install/update 全部通过之后：立即停止 Stage 5.5B。不要提前进入字体精确/颜色/粗细/旋转/多行/段落/复杂布局/高级 Matcher/自动编组/Undo/Preview/高级 OCR。

## 43. 当前真正目标

不是“继续开发 OCR”，而是：把已经通过技术验证的 OCR，真正接入折立印网页，使普通用户可以在原生网页面板中完成：选择图片/背景图 → 点击识别 → Local OCR → 必要时百度 fallback → 原位置生成可编辑文字。

## 44. 最终向我汇报时只汇报结果

最终报告必须包括：当前版本、当前 branch、当前 commit、Demo URL、Local OCR、Baidu OCR、Fallback、Canvas readiness、Native Panel、Background Image、No Active Object、Real ScriptCat、Real User、Editable、Rollback、Duplicate Protection、Demo Install、Demo Update、Git clean、Remote synced、Documentation synced、尚未解决的问题。不要用大量过程日志替代结论。但过程日志必须已经保存到 GitHub。

## 45. 最后一条：自主推进

不需要等待逐步告知改哪个文件/哪个 selector/怎么实现/哪个 API/怎么测试。自行调查、设计、实现、测试、修复、记录、commit、push。但始终遵守：先证据再修改、小步修改、独立 commit、不破坏 main、不 force push、不重写项目、不重新做 OCR 选型、每一步记录、每一步同步 GitHub。

现在立即从 P1 当前"画布未就绪"开始。第一步只做：读取完整真机 report + 调查 canvas/editor/template readiness 时序 + 确认真实根因。在根因确认前，不要为了让测试 PASS 而修改 OCR 核心逻辑。

---
归档时间：2026-09-16；本文件为原文归档，执行过程见 `docs/execution-records/stage-5.5b/`，证据见 `docs/evidence/stage-5.5b/`。