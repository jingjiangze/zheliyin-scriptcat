# 002 Stage 5.5B 后续工程计划与审计指令 + 强制交付与 Git 规则（用户完整指令归档）

> 来源：用户 2026-09-16 会话指令（两个部分：工程计划与审计指令、强制交付与 Git 规则）。原文完整保留。
> 归档执行记录见 `docs/execution-records/stage-5.5b/`，证据见 `docs/evidence/stage-5.5b/`。

## 第一部分：工程计划与审计指令

### 最重要的判断
当前不应继续围绕"OCR 能不能调用"本身展开；要完成的是三个边界：编辑器边界（page world 可靠获取 Canvas/背景图/active image）、OCR 数据边界（Provider 输出统一结构、主业务不依赖私有格式）、编辑器输出边界（稳定转换为可编辑 Textbox，不因重复识别/中途失败污染画布）。

### 阶段划分
P1 Canvas/Editor Readiness 最终确认 → P2 折立印 Native UI/Panel 真实 DOM 审计 → P2+ OCR UI 接入真实 Native 区域 → P3 Native UI→Local OCR→OCRCandidate→Textbox → P4 Local-first/Baidu fallback/Privacy/Credential UX → P5 识别结果质量与坐标映射复核 → P6 Duplicate Protection/Rollback/多场景图片 → P7 真实 ScriptCat/实际用户流程 → P8 Demo 安装/更新/最终回归。

### 关键工作原则
- 永远以当前仓库、本地 checkout、真实浏览器为准；不要因为历史报告跳过当前审计。
- 不要重新实现已存在的基础能力（Page World Bridge、getCanvasInfo、ocrPrepare、Local Tesseract、Baidu Provider、OCRCandidate、坐标映射基础、Textbox 创建、助手对象标记）。
- 禁止大规模重构：重写 userscript/Bridge、更换 OCR 框架、合并模块成巨模块、引入新大型基础设施。
- 禁止固定 sleep 代替 readiness；使用 Bridge response / readiness signal / polling / Promise / MutationObserver / 编辑器实际加载状态。

### P1 重点（四个场景 + 一个早点击）
场景 1 正常加载 → OCR；场景 2 提前点击 → 显示等待 → Canvas ready → 自动继续；场景 3 active image；场景 4 backgroundImage；场景 5 backgroundImage + activeObject=null 仍可继续。P1 需回答：Canvas 在哪个 world 可见、Bridge 是否唯一访问边界、Early Click 实际发生什么、background 是否合法 OCR source、优先级、readiness race。

### P2 审计目标
不要猜 Native Panel。折立印已有"工具箱/识别/文字识别/OCR识别"等原生入口；先观察真实网页：点击原生工具后哪个 DOM 被创建/显示/承载。搞清楚：原生入口、原生内容容器（drawer/panel/tab/sidebar/dialog/floating/right-side）、DOM 稳定性（刷新/页面切换/模板切换/动态创建/重复节点/框架重渲染）。决策：有合适原生区域则嵌入；只有按钮无容器则研究其打开逻辑在附近建最小扩展；确认无法稳定复用时才继续浮窗。最终输出"原生入口 → 真实 DOM → 真实内容容器 → 推荐挂载位置 → 备用挂载位置 + 选择依据"，若结论是"不适合嵌入"也可接受但必须有真实 DOM 证据。

### P3 Provider 边界
确认主逻辑不直接依赖 Tesseract executor 私有字段/特殊返回值/provider-specific error；理想：Provider → 统一 OCRCandidate，后续 mapper/editor 不关心来源。Textbox 判定：内容写入、bbox 来自 OCR 坐标而非堆中心、坐标变换（原始尺寸/Canvas 尺寸/缩放/left/top/scaleX/scaleY/rotation）、真正可选中/编辑/修改文字。

### P4 Local-first / Credential / Privacy
Local 成功 → Baidu request = 0；Local 失败 → fallbackReason（ENGINE_LOAD_FAILED/OCR_FAILED/TIMEOUT/INVALID_RESULT 等）→ fallback provider。Baidu AK/SK 属"客户端可访问凭据"：不提交 Git、不写普通日志、UI 默认不显示完整值、错误日志脱敏、明确告知用户 Local 不上传图片 / Baidu 图片发送至百度。禁止声称"前端绝对安全保存"。

### P5 坐标与重建质量
OCR 错一个字可接受；Textbox 完全错位不可接受。重点检查 OCR bbox → image coordinate → canvas coordinate → textbox geometry。mapper 已稳定处理基本情况时不重写。

### P6 Duplicate / Rollback
有 marker ≠ 已做 duplicate protection。确认同一 source 第二次识别是否重复追加；如需去重，基于 source/text/normalized position/bbox/source fingerprint 建立最小 identity，倾向复用/更新而非无限追加；不要拿字段套版逻辑当 OCR 去重。Rollback：全部成功才提交；失败清理本轮对象+恢复+报告失败；不要求复杂 transaction framework，只解决"本次失败不留下明显半成品"。图片场景：普通 Image / backgroundImage / backgroundImage+activeObject=null 统一进入 source resolution，尤其不要因 activeObject=null 错误返回 IMAGE_UNAVAILABLE。

### P7 / P8
P7 真实 ScriptCat+真实 userscript+真实编辑器，重点是用户实际能完成任务而非日志出现 PASS。P8 新安装/更新安装/旧→新，关注 @version/@require/@updateURL/@downloadURL 与 GitHub demo 一致，不只验证文件存在。

### 测试判断标准
区分 PASS/FAIL/PENDING/NOT APPLICABLE；"暂时没测试"不能写 PASS；OCR 识别质量与编辑器集成正确性分开，集成正确性优先级更高。

### 高风险点
风险 1 World boundary（userscript 又恢复直读 page-world Canvas）；风险 2 Readiness race；风险 3 UI integration（自己造了一套网页已有交互）；风险 4 Provider coupling（绑定 Tesseract 私有格式）；风险 5 Coordinate drift；风险 6 Duplicate；风险 7 Partial commit；风险 8 Credential leakage（AK/SK 进日志、仓库、错误信息、公开 Demo）。

### 禁止做的事
除非审计证明必要，不得：重写 zheliyin-card-assistant.user.js、重写 page-bridge.js、删除旧 OCR 浮窗、删除旧兼容代码、更换 Tesseract、更换现有 Provider、改造套版逻辑、修改与 OCR 无关 UI、引入新服务端/大型依赖。

### 最终停止条件
Canvas readiness 稳定 + Native UI 集成合理 + Local OCR 主链路稳定 + Textbox 可编辑 + 坐标基本正确 + Local-first 成立 + Fallback 可验证 + Duplicate 可控 + Failure 可回滚 + 真实 ScriptCat 可运行 + Demo 可安装/更新 + 原有套版功能无回归。达标即停止扩大 5.5B 范围，高级 OCR/复杂排版/样式恢复/多行精确重建留待下一阶段。

### 执行策略
不要一次性全做。先重新审计当前状态 → 确认已有成果 → 找当前真正剩余问题 → 只解决最高价值问题 → 真实验证 → 再进入下一阶段。若当前状态已满足某阶段则补齐证据/验收即可，不重复开发；若计划与实际冲突以实际代码和真实网页为准并说明调整原因。

## 第二部分：强制交付与 Git 规则

### 每一轮形成独立交付
修改生产代码/userscript/Bridge/OCR Provider/测试脚本/诊断脚本/文档/执行记录/证据/修复 harness/调整 Demo artifact/配置等任一项，都必须：发现问题 → 完成修改 → 验证 → 形成证据 → 立即 commit → 立即 push。禁止多阶段积压统一提交。

### commit 单一目的
一个 commit 对应一个清晰可解释的变化（如 fix:/test:/feat:/docs: 前缀）。禁止 "update / fix / final / 各种优化 / stage5全部完成" 这类无边界提交，也不混入无关修改。

### 代码与证据同步交付
代码修改 + 对应测试 + 对应结果 = 完整交付。测试脚本自身 bug 的修复也属交付（修复→重跑→有效结果→commit→push），不能只在聊天里说"是脚本问题"。

### 证据可追溯
Execution record 记录 commit hash / 测试时间 / 环境 / 场景 / PASS FAIL / 关键日志。

### 禁止无提交进入下一阶段
P1 未交付不得开始 P2（P1 → 测试 → 证据 → commit → push → 确认远端 → P2）。

### Push 是交付的一部分
每轮 commit 后必须 push 到 demo；push 后必须确认 local HEAD == origin/demo、working tree clean；ahead/behind/diverged/uncommitted 均不算完成。

### 禁止 force push
禁止 git push --force / -f；冲突/分叉正常处理，不得破坏远端历史。

### 失败轮次也要形成交付
测试 FAIL 也提交实现 commit + 失败证据，并明确 status = FAIL / PENDING；不要为了看起来全绿而删除失败记录。

### 纯调查轮次也应形成证据提交
如 P2 DOM Audit 无生产代码修改，也要把 audit result + execution record + evidence 作为独立文档 commit。交付 ≠ 每轮必须改生产代码，但每轮必须留下可追溯成果。

### 禁止"顺手修改"
当前轮次只改与当前目标直接相关的内容；其余留到独立轮次。

### 单轮交付结构
1 当前状态审计 → 2 唯一目标 → 3 最小修改 → 4 测试 → 5 记录结果 → 6 保存 evidence → 7 保存 execution record → 8 git commit → 9 git push → 10 验证 remote → 11 下一轮。

### 每轮汇报格式（至少包含）
【本轮交付】目标 / 修改 / 测试 / 结果（PASS/FAIL/PENDING）/ 关键证据 / Commit(hash) / Push(demo/<remote>) / Remote HEAD / Working Tree(clean/dirty) / 下一步。不要只回"已完成"或只给 hash。

### 关闭前 Git 审计清单
所有代码修改、测试工具修改均已 commit；重要证据已归档；execution records 完整；demo 已 push；working tree clean；local HEAD == origin/demo；无未提交临时修改；无孤立本地成果。

### 最核心执行约束
一轮一个目标 → 一轮一个可追踪成果 → 一轮一个独立 commit → 一轮立即 push → 确认 remote → 下一轮。以"Git 中已存在、远端已同步、证据可追溯"作为"这一轮真正完成"的判定标准。

---
归档时间：2026-09-16。P1 已真机全 PASS（见 execution record 003），本指令按阶段顺序约束后续推进。