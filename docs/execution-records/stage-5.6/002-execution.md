# Execution Record 002 — Stage 5.6 P5 Geometry + P0 画布就绪 hotfix（v0.3.8.0）

> 时间：2026-09-17；分支 `demo`。接续 stage-5.6/001。期间收到用户 P0 真机阻断反馈，先 hotfix（独立 commit）再完成 P5。

## 一、执行目标

1. P5-1 审计当前 Geometry 坐标模型（只读，不改生产）。
2. P5-2 建立几何矩阵真机验证（scale/position/rotation/multi-size/background/active，独立仿射公式比对）。
3. P5-3 对真实缺陷最小修复（仅 Mapper + ocrCreate），θ=0 零回归，复跑矩阵收敛。
4. P0：真机反馈「编辑器画布长时间未就绪（30 秒）」→ 分级提示 + 60s 超时（v0.3.7.1）。

## 二、相关提交（本轮）

| commit | 内容 |
|---|---|
| `d1e1038` | docs: P5-1 geometry audit（坐标模型 + 旋转缺陷候选 + 边界静态 PASS） |
| `107175f` | fix: P0 画布就绪分级 UX，60s 超时，BRIDGE_NO_REPLY / CANVAS_NOT_FOUND 分级提示；v0.3.7.1 |
| `4cb7c87` | fix: P5-D 旋转最小修复（Mapper θ≠0 输出旋转中心+角度+center 原点；ocrCreate 应用 angle/origin）；v0.3.8.0 |
| 本轮新增 | test: geometry 矩阵 harness v2（判定契约修正 + 页桥新鲜度探针 + @require 资源缓存清理 + 全字段行）；docs: P5 最终报告；docs(evidence): record 002 + 证据 |

## 三、P0 真机阻断（分级处理，诚实记录）

- 现象：用户反馈「编辑器画布长时间未就绪（30 秒），无法正常使用」。
- 判断：原 `waitForCanvasReady(30000)` 无法区分「桥未注入/画布在 iframe（BRIDGE_NO_REPLY）」与「编辑器还没加载出画布（CANVAS_NOT_FOUND）」，且 30s 对慢加载不足；消息无自救指引。
- 修复（最小）：60s + 分级失败码 + 可操作提示（刷新页 / 确认在设计编辑页 / 扩展「允许用户脚本」）；`[zy-ocr]` 日志记录 code 便于远程诊断。
- 验证：0.3.7.1 全链路 harness 22/22 PASS（成功路径零回归；失败路径为纯提示文案变更）。
- 待用户反馈实际触发场景（见最终会话提问）——若为 iframe 拓扑，需后续做跨框架定位（本轮仅交付可诊断性与健壮性）。

## 四、P5 关键发现与修复

### 4.1 审计（P5-1，docs/STAGE_5_6_P5_GEOMETRY_AUDIT.md）

- 坐标模型：`C(P)=图像中心+R(θ)·(P−图像中心)`，bbox 为 image pixel；θ=0 输出 AABB 角点（-4px 留白），尺寸 width=bw+8、fontSize≈bh。
- 静态确认候选边界未被绕过（unifyCandidates 唯一入口）。
- 预测缺陷：旋转（θ≠0 时 textbox 无 angle + 轴对齐盒错位）。

### 4.2 矩阵首跑（P5-2，修复前）

- 修正 harness 期望契约：θ=0 用角点匹配（textbox 换行导致中心失真，属 P5-I）；θ≠0 用角度+中心。
- 结果：A/B/C/E(2000)/F PASS（角点误差 ≤22px）；**D(15/45/90) FAIL**（angle=0，误差 18.7→117.8→222.4px，随 θ 增大）；E(500) 数量不匹配（OCR 3→2 行合并，质量域）。

### 4.3 最小修复（P5-3）与「@require 资源缓存」陷阱

- Mapper θ≠0 输出旋转中心+角度；ocrCreate 应用 angle/originX、Y=center。θ=0 路径逐字节保留。
- **陷阱**：修复后矩阵 D 仍 FAIL —— 根因是 page-bridge.js 为 @require 外链，ScriptCat 按 URL 缓存编译资源，harness 装到旧页桥（位置已是新 Mapper 语义、angle 未应用）。
- 处理：harness 安装前清 `compiled_resource:*`/`resource:*` + 新增页桥旋转探针（直发 ocrCreate, angle:45 → 别名断言 angle=45、origin=center/center）。清缓存后 D 全 PASS（误差 ≤7.2px），探针 PASS。
- **部署注意（留档）**：真实用户侧 @require 缓存行为未实测，需在之后发布流程验证「脚本更新后页桥是否随新版本走」。

### 4.4 回归

- 单测 12 套件全绿；0.3.8.0 全链路 p5 harness errors=0（22/22，清缓存安装）。
- 矩阵：D-r15/45/90 PASS，A/B/C/E(2000)/F PASS，E(500) PARTIAL（匹配行 ≤8px）。

## 五、验收矩阵（§十八）

```text
Geometry Model：确立    0°：PASS    Scale(0.5/1/2)：PASS    Offset：PASS
Rotation(15/45/90)：PASS（修复前 FAIL）   Multi-size：PASS(500=PENDING-OCR合并)
Background：PASS   Active Image：PASS   Candidate boundary：PASS   Textbox：PASS
```

## 六、PASS / FAIL / PENDING / BLOCKED

- P5 全部几何主项 PASS；PENDING：E(500 行合并，P5-I)、超大图、斜交文字；真实用户 @require 更新行为（待验证）。
- P0 画布表述：修复已发版，用户侧实际触发场景待确认。

## 七、下一步

- 等用户补充 P0 实际场景（iframe？入口？）→ 决定是否做跨框架定位（P5/后续）。
- 用户可更新到 v0.3.8.0 体验旋转修复；验证「脚本更新后 @require 是否刷新」后归档。
- P6 Duplicate Protection + Rollback + OCR Object Lifecycle（用户指令 §十九，P5 稳定后进入）。