# 003 P2-B 真机验收 → P3 OCR 主链路审计与最小闭环（用户指令归档）

> 来源：用户 2026-09-16 会话指令。原文结构完整保留。执行见 `docs/execution-records/stage-5.5b/`。

## 一、第一阶段：完成 P2-B 真机验收
P2-A 已完成，P2-B 已实现（原生右栏 → OCR 入口 → 原生邻接抽屉）。先读取当前真实测试结果。必须核对：1.Native Panel（原生右栏存在、OCR 按钮存在、drawer 存在、与右栏位置关系正确、不依赖旧浮窗才能用 OCR）；2.幂等（drawer 唯一、rail button 唯一、MutationObserver 不复制元素、页面重渲染不重复）；3.Toggle（开→关→再开 状态正常）；4.Native OCR Button 实际触发 handleOcrImage→waitForCanvasReady→ocrPrepare→Local OCR→Textbox（不能只确认按钮能点击）；5.Legacy Panel 仍存在，套版功能未破坏。

## 二、P2-B 关键验收：不要只测 UI
必须实际验证：原生 OCR Button → 真实 OCR → 至少生成一个真实 Textbox → Textbox 可编辑。最好用已验证的 background image / no activeObject 场景。

## 三、P2-B 通过条件（全部满足才 PASS）
Native UI PASS + Button PASS + Toggle PASS + No Duplicate PASS + Refresh PASS + Legacy Panel PASS + Native→OCR PASS + Textbox PASS。任一失败：只修 P2-B，不进入 P3。完成须有测试报告/execution record/evidence/独立 commit/push/确认远端。

## 四、P3：先代码审计，不急着重构
目标：确认当前是否已形成 "Native Panel → Local OCR → OCRCandidate → Mapper → Textbox" 完整边界。先审计，不要直接重构。

## 五、P3 第一项：追踪真实 OCR 调用链
从 Native button 追踪：handleOcrImage → ocrPrepare → Local OCR executor/Provider → OCR result → buildItemsFromOcr → mapper → ocrCreate → Textbox。列出：入口函数、中间函数、数据结构、返回结构、最终 editor action。

## 六、重点检查 Provider 边界
现有 Tesseract Provider / OCR Provider / OCRCandidate / Baidu Provider。调查：主流程是否真正使用 Provider 抽象，还是直接依赖 Tesseract executor 私有返回格式（data.lines、provider-specific 字段、私有对象、私有 error、executor metadata）。若发现 Native→直接调 Tesseract→直接读内部字段，而不是 Native→Provider→OCRCandidate：不要立即大改，先记录当前耦合位置、风险、最小拆分方案。

## 七、P3 第二项：检查 OCRCandidate 是否真正成为统一边界
本地 OCR 最终能否转换为统一 OCRCandidate（text/bbox/confidence/coordinateSpace/imageSize）。Mapper/Editor 是否只依赖统一字段。理想：Tesseract/Baidu/未来 Provider → 统一 OCRCandidate → 共同 Mapper → 共同 Editor。已满足则不改。

## 八、P3 第三项：检查 Mapper
OCR bbox → image coordinate → canvas coordinate，是否正确使用 image/canvas 宽高、left/top/scaleX/scaleY/angle。不能因为能生成 Textbox 就认为坐标正确。至少实测一次：普通 image + 放大/缩小 image，观察 Textbox 是否明显偏移。基础场景正确而旋转未验证 → 标 PENDING，不判失败，不重写 Mapper。

## 九、P3 第四项：检查 Textbox 创建边界
审计 ocrCreate / createTextObject：type=textbox、editable=true、正确写入 text/left/top/width/height/scale/angle；已有参考文本对象克隆机制则保留，不推翻。

## 十、P3 第五项：做一次真实最小闭环
真实图片只验证 Native Panel → Local Tesseract → OCRCandidate → Mapper → Textbox。不要同时加入 Baidu fallback/duplicate/rollback/高级排版/样式恢复（放后面阶段）。

## 十一、P3 区分三个结果
A. OCR 识别质量（错字=quality）；B. 坐标质量（内容对但 Textbox 跑出图=mapping/integration）；C. 编辑器创建质量（创建成功但不能编辑=editor integration）。优先级 C > B > A。

## 十二、P3 如需改代码
只做最小修改。例如真正发现 Tesseract executor 直接暴露 data.lines、绕过 Provider 才改为 Provider/OCRCandidate。不为了架构漂亮拆十几文件。改完立即测试+证据+独立 commit+push。

## 十三、本轮明确禁止
Baidu fallback 完整改造 / Duplicate Protection / Rollback 重构 / OCR 样式恢复 / 字体恢复 / 多行排版 / 自动布局 / 大规模 UI 重构 / 删除旧浮窗 / 重写 Bridge / 重写 Tesseract。

## 十四、本轮最终输出（二选一）
情况 A：P3 已基本闭环 → 输出现状 + 剩余问题，下一轮进 P4。情况 B：P3 存在边界缺陷 → 明确问题/根因/最小修复/修复后，真实测试后再提交。

## 十五、本轮结束条件
P2-B PASS + P3 主链路审计完成 + 真实 Local OCR→Textbox 已验证。若 P2-B 失败：本轮只完成 P2-B 修复，不进入 P3。

## 十六、Git 强制交付
每轮一个目标/一个成果/一个独立 commit/立即 push/确认 remote。生产代码、测试代码、审计脚本、execution record、evidence、文档都必须提交。禁止连续修改后统一 commit。禁止 force push。

## 十七、最终报告格式
【本轮交付】阶段 / 目标 / 实际完成 / 真实测试 / 关键发现 / PASS FAIL PENDING / Commit / Push / Remote HEAD / Working Tree / 下一轮。不要为了漂亮结果把 PENDING 写成 PASS。

## 十八、最重要的判断
真正目标：确认 Native UI 能否稳定接入现有 OCR 链路、现有 Provider/Candidate/Mapper/Editor 四边界是否成立。成立不改；不成立只修断裂的边界。不破坏已通过真实测试的 P1 能力。

---
归档时间：2026-09-16。