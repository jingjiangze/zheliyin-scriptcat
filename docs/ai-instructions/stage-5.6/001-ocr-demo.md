# 用户指令归档 — 下一轮执行方案：Demo OCR-only 化（2026-09-17）

> 归档为可追溯指令，来源：用户会话消息（2026-09-17，收到后执行）。
> 对应仓库：`jingjiangze/zheliyin-scriptcat` 分支 `demo`；阶段：Stage 5.6（OCR-only Demo）。

## 任务目标

先审计当前 `demo` 分支实际 UI 架构，再最小化停用文字套版助手 UI，使 Demo 以 OCR 为主要功能；**不得破坏 P1～P4 已验证的 OCR 能力**。本轮不是重构阶段，也不是删除套版代码。

## 约束（必须遵守）

- 始终以当前仓库实际状态为准，先核对 branch/HEAD/remote/working tree/P4 最新提交/各 UI 组件/初始化链。
- 第一轮只做 UI 架构审计（交付A），不改生产代码；产出「当前 UI 结构 + OCR/套版依赖关系 + 停用方案 + 风险 + 推荐最小修改」。
- 停用策略：优先隐藏/停用入口，不删除已有能力。禁止删除 field-core/config-core/套版逻辑/旧 Editor API/shared state/Legacy code；禁止为去掉套版重写 renderPanel。
- 推荐方向（按审计结果选）：A 功能入口级隐藏 / B 初始化级停用 / C 简单 feature flag；不要把所有业务逻辑塞进大量 flag。
- 保护对象（尽量不改）：Native OCR panel、OCR button、Canvas readiness、getCanvasInfo、ocrPrepare、Local Tesseract、OCRCandidate、candidate-normalizer、Mapper、ocrCreate、Textbox、Baidu Provider、fallback-policy、credential-crypto、Privacy notice。
- Legacy floating panel 不立即删除：套版部分隐藏、OCR native panel 保留；可作为兼容/fallback 留在代码中。
- 目标 UI：图片文字识别（识别方式：自动本地优先 + 识别当前图片 + 状态 + 结果 + 百度高级设置）；图片→OCR→Textbox→双击编辑。
- 真实 ScriptCat + 真实折立印编辑器验证：套版入口不再作为主界面、Native OCR 存在；至少验证三场景：Background Image（activeObject=null）、Active Image、Early Click（UI 出现立即点击→等待编辑器→自动继续）。
- 增加一次 OCR-only 回归：Native OCR→Local→Candidate→Mapper→Textbox，created>0、editable、errors=[]；优先复用 P2-B/P3/P4 harness。
- 必须验证套版代码仍然存在（UI 不显示 ≠ 代码删除）。最终：Demo=OCR-only，Repository=OCR+套版底层能力。
- 版本处理：按正常 patch/minor 规则；最终 Demo 的 @version/README/CHANGELOG 必须一致。
- Git 交付：审计→独立 commit→push→确认 remote；实现→真实验证→独立 commit→push→确认 remote；不得把 UI 审计+UI 修改+OCR 重构合并成大 commit。
- 拆两个交付：交付A=UI Architecture Audit（P5-demo-ui-audit）；交付B=OCR-only Demo（最小停用 + 真机回归）。
- 若发现 OCR 与套版高度耦合：不立即大拆，报告依赖清单，保留共享初始化仅隐藏套版用户入口。
- 问题必须诚实分类 PASS/FAIL/PENDING/BLOCKED；UI 改动影响 Native OCR/Canvas/Provider/Textbox 必须修复或标记 PENDING。
- 本轮不进入 P5 Geometry / Rotation / Multi-size（顺延，等 OCR-only Demo 稳定后再继续）。
- 最终输出须包含：branch/HEAD、UI 审计结论、OCR 与套版依赖、采用的最小停用方案、修改文件、OCR 回归、套版 UI 状态、Legacy 状态、PASS/FAIL/PENDING、Commit、Push、Remote HEAD、Working Tree、下一步；明确哪些只是隐藏、哪些真正删除。
- 用户补充：优先推送 ocrdemo。

## 验收标准（用户视角）

打开折立印 → 看到 OCR 功能 → 识别图片 → 生成可编辑文字；看不到/不再主推文字套版助手；仓库保留 P1 P2 P3 P4 能力与套版代码。

## 关键问题（执行中确认并归档）

1. 页桥注入 `installPageBridge()` 目前只在 `renderPanel()` 内调用（含样式/更新检查）——OCR-only 下必须前置到 init，否则 OCR 页桥失效。
2. OCR 主链对浮窗 DOM/套版状态零依赖（逐函数核对），仅共享 `setStatus`/模块状态/`bindOcrControls`（suffix 双绑定单一来源）。
3. 原生右栏缺失的页面变体：`mountNativeOcrPanel()` 返回 false → 保留浮窗兜底（`!OCR_ONLY_MODE || !nativeOk` 时 renderPanel）。
4. 恢复开关设计：`zyShowTemplatePanel="1"`（GM_setValue）可恢复套版浮窗，用于真机「套版代码保留」动态验证。
5. 版本：0.3.6.0 → 0.3.7.0（四处同步 + README/CHANGELOG/DEMO_REAL_MACHINE_TEST）。