# Stage 3 Completion Report

> 日期：2026-09-15 | 阶段：Stage 3（运行时一致性 + Bridge 特征化 + 最小 Editor 边界）

## 当前 HEAD

代码阶段：`76779ad`；阶段终点 tag：`stage-3-complete`。

## 当前 tag

- 起点：`stage-3-baseline` → `eba5486`
- 终点：`stage-3-complete` → 本报告推送后 main HEAD

## Stage Goal

确认所有运行形态代码一致性；识别并隔离现有 Bridge/Editor 能力为最小边界；为 Unified Object / OCR 建立稳定入口；全程不重写协议、不改变业务。

## 实际完成

1. 一致性核实（§三/§四）
2. Bridge 协议与能力完整记录（§九/§十/§四十三）
3. 直接访问统计（§二十五）
4. 最小 Editor 边界：page-bridge 抽取为独立模块并测试（§十四/§二十三/§二十六）
5. 对象属性调查：EDITOR_OBJECT_NOTES.md（§二十七/§二十八/§二十九）
6. 前置测试全绿 + 新增 editor 边界测试 18/18

## 未完成

- Bridge requestId/timeout/错误码升级（判断：当前严格串行，无并发风险 → 记录为技术债，§二十一）
- 正式 Editor API 全面实现（§十五 只做最小边界）
- 真机验证（ScriptCat/扩展/设计器）

## Main / Extension / Source 一致性

- main HEAD == `stage-2-complete`（eba5486）；tags 齐全。
- 逐字节核对 6 文件（userscript / assistant / manifest / field-core / config-core / ai-client）GitHub==本地 **全部 MATCH**。
- source of truth：`extension/src/*` 五模块；`assistant.js` 为 userscript 生成物；无 legacy copy（getConfig/saveConfig/aiRequest/normalizeFields/parseJsonFromText 各一份）。

## Stage 2 报告与真实代码是否一致

**一致**。收口核实（§五）：
- GM_getValue：仅 getConfig（config 边界）+ 面板位置 + 更新日期（均属预期）。
- GM_xmlhttpRequest：仅 checkForUpdate 更新检查 1 处（基础设施，预期保留）；AI 已全部走 ai-client。
- window.postMessage：applyFieldsToPage/probeCanvas 2 个业务发送点（预期数量，未扩散）。
- addEventListener("message"：内容侧 1 + pageBridge 内 1。

## Bridge 当前架构

内容侧（userscript）→ `installPageBridge`（`pageBridge.toString()` 注入页面）→ 页面侧 `page-bridge.js`（Editor 边界唯一实现）。消息单向 fire-and-forget，响应经全局 message 事件按 type 分流。

## Bridge 当前协议

| 方向 | source | type | payload → response |
|---|---|---|---|
| 内容→页面 | zy-card-assistant | apply | {fields, side} → applyResult{ok, applied[]/message} |
| 内容→页面 | zy-card-assistant | probe | {} → probeResult{ok, href, canvases[]} |
| 页面→内容 | zy-card-assistant-page | applyResult / probeResult | — |

无 requestId/无超时（串行调用，未升级，技术债 BRIDGE-RISK-001/002）。

## Editor 当前能力

Read(定位/文字层枚举)/Find(Canvas 探测)/Match(scoreObject)/Create(clone+fabric)/Update(setObjectText/place)/Delete(removeAssistantExtras 按标签)/Cleanup/Render(requestRenderAll)/Probe(只读)。全部仍由原实现承担，仅搬迁为模块以便测试（§十六 保留 apply 行为）。

## Direct Editor Access 清单（§二十五）

- 核心业务路径：applyFieldsToPage / probeCanvas（2 处 postMessage，业务侧仅此）。
- 页面侧：全部集中在 `page-bridge.js`（单一归属）。
- 其它（UI/初始化/测试）：无直接触碰 canvas/页面内部对象。
- 结论：`DIRECT_EDITOR_ACCESS` 已收敛；唯一入口待未来 bridgeClient 厚度化（§十二 判定：当前无需新封装）。

## 本阶段建立的最小边界

`extension/src/editor/page-bridge.js` —— 页面侧编辑器唯一实现，可独立加载与测试；注入机制不变；协议不变；零业务字段依赖。

## 对象字段调查

见 `EDITOR_OBJECT_NOTES.md`：读写能力 13 项代码确认（位置/宽高/字号/字体/颜色/粗细/斜体/行高/对齐/字距/文本/创建/修改/删除）；rotation 与图片层枚举需真机确认；对象层级依赖 getObjects() 顺序。

## OCR 能力缺口

1. rotation/图片层读取：需真机确认。
2. 坐标转换模块（imagePixels→normalized→design→editor）：未实现（§三十一 明确本阶段不做）。
3. TextObject/runId/zyFeature 标签：沿用 zyCreatedByAssistant/zyFieldKey（未变更），扩展留 R4。

## 测试结果

wiring wired-ok；field-core 43/43；config-core 15/15；ai 18/18；**editor/bridge 18/18**（新增）。

## 真实页面测试

**UNVERIFIED**（需登录折立印 + ScriptCat/扩展真机）。

## UNVERIFIED 项目

ScriptCat @require（4 模块）加载、扩展刷新加载、设计器画布套版、AI 真实服务、rotation/图片层属性。

## 已知问题

- C1 选层下限 -20 较宽松：单对象场景下低分对象仍被补填（记录为行为，非回归；Stage 2 已锁定）。
- editor 测试无法覆盖真实 fabric 侧设计器自定义元数据（克隆继承依赖真机验证）。

## 新发现风险

- CONSISTENCY-RISK：无（已核实一致）。
- Editor 边界已模块化，新增风险：@require 数量增至 4（网络依赖面扩大，缓存可缓解，真机待验）。

## 技术债

BRIDGE-RISK-001/002（无 requestId/超时——当前串行低危）、KEY-UI（Key 安全 UI 未做）、rotation/图片层探测、字段怪癖 5 项（契约锁定）。

## 当前架构图

```
userscript（编排/UI/AI业务/配置）
 ├─ field-core（字段纯逻辑）
 ├─ config-core（配置解析）
 ├─ ai-client（AI 传输）
 └─ page-bridge（Editor 边界，页面注入，可单测）
        ↓ postMessage(apply/probe, 兼容协议)
        折立印设计器
```

## 当前距离 Unified Object

Editor 边界已就位；尚需 TextObject 规范化、runId/zyFeature 标签、bridge requestId（技术债）。

## 当前距离 OCR

缺 OCR 后端边界、坐标转换、样式候选/confidence；已具备：文字层读写与创建删除（EDITOR_OBJECT_NOTES 13 项确认）、probe 只读自检、ai-client 可插拔通道。

## 下一阶段建议

Stage 4：**Unified Object 调查落地 + Editor API 最小实现（read/getCanvasInfo/getTextObjects + create/update/removeGeneratedObjects 包装现有 page-bridge）+ runId/zyFeature 标签（向后兼容）**。

## 为什么

Editor 边界已成为可测试事实；下一步把所有页面操作经统一 Editor API 出口，业务不再直接 postMessage —— 这是安全带 OCR 的前提；标签与 runId 让重复执行/撤销可追踪。Key-UI 仍作为独立并行项。

## 完成度

| 项 | 状态 |
|---|---|
| 一致性核实 | PASS（8/8 文件 MATCH + tag 对齐） |
| Bridge 协议/能力记录 | PASS |
| Editor 边界抽取 | PASS（逐字搬迁 + 18/18 单测） |
| 对象属性调查 | PASS（代码确认 13 项，2 项待真机） |
| 前置回归 | PASS（field 43 / config 15 / ai 18 全绿） |
| 真机 | UNVERIFIED |
| 总体 | **85%** |

## Git Commit

见 §Git Commit 目录（8 个代码/测试 commit + 本报告与文档 commit）。

## Git Tag

- `stage-3-baseline` → eba5486
- `stage-3-complete` → 报告推送后 HEAD

## Stop

按 Stage 3 指令 §四十六：报告完成即**停止**，等待项目负责人审查与下一阶段指令。