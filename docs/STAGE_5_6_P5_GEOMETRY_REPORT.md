# Stage 5.6 — P5 Geometry：坐标模型、矩阵验证与旋转修复（最终报告）

> 日期：2026-09-17；分支 `demo`；范围：`OCR bbox → Textbox` 几何准确性（Stage 5.6，即原计划 P5）。
> 审计只读（`docs/STAGE_5_6_P5_GEOMETRY_AUDIT.md`）→ 矩阵真机验证（`runtime/stage5-6-p5-geometry.js`）→ 最小修复 → 复跑收敛。
> P5 范围外：OCR 文字质量（P5-I）、UI/套版、P6 重复防护/回滚/对象生命周期（不混入）。

---

## 1. Geometry Model（最终，与代码一致）

```text
OCR bbox（image pixel，原点=导出图左上）   ← unifyCandidates 统一边界 {x,y,width,height}
   ↓ normalized:          ux = bbox.x/w − 0.5, uy = bbox.y/h − 0.5
   ↓ image→canvas:        dx = ux·w·sx, dy = uy·h·sy
   ↓ rotate about center: C(P) = 图像中心 + R(θ)·(P−图像中心)
   ↓                         图像中心 = (left + w·sx/2, top + h·sy/2)
   ↓
θ=0 ：文本盒左上角 = C(bbox 左上) − 4px（视觉留白）；size = bbox·s ∘ {width: bw+8, fontSize≈bh}
θ≠0 ：文本盒中心 = C(bbox 中心)，并设置 angle=θ、originX/Y=center（fabric 绕中心旋转）→ 中轴闭合
```

关键确立点（审计 §/矩阵验证）：
1. 图像像素空间即旋转后的局部空间 → `bw/bh` 天然是沿行/法向尺寸，旋转路径无需重新分解 bbox。
2. 旋转围绕「图像中心」完成，fabric 文本盒同样绕自身中心旋转 → 「盒中心=映射中心 + angle」即与图中文字完全重合。
3. 背景图 left/top 底在页面世界完成（`extractImagePayload` 居中兜底），隔离世界只消费 geometry。

## 2. P5-2 矩阵结果（修复前 / 修复后）

harness：自绘已知文字（measureText 精确宽度）→ 注入 fabric（active/background）→ 原生 OCR → `getCenterPoint` 读回 → 独立仿射公式比对。
判定契约：θ=0 角点匹配（left/top ≈ 映射角点−4px）；θ≠0 角度≈θ 且中心≈映射中心。容差 `max(12, 30·scale)`px。OCR 空格引起的 textbox 换行（高度≈2行）记为 wrap 警告（P5-I 域），不判 FAIL。

| 组 | 单元格 | 修复前 | 修复后 | 证据（≤tol px） |
|---|---|---|---|---|
| A 基础 | scale1・居中・θ0 | FAIL（期望模型错） | **PASS** | 11 |
| B 缩放 | 0.5x / 2x | FAIL（同上） | **PASS** | 5.5 / 22 |
| C 位置 | 左上 / 右下 | FAIL（同上） | **PASS** | 11 / 11 |
| **D 旋转** | **15° / 45° / 90°** | **FAIL**（angle=0，误差 18.7→117.8→222.4px） | **PASS**（angle 生效，误差 6.2~7.2px） | 7.2 |
| E 多尺寸 | 500 / 2000 | FAIL / FAIL | **PARTIAL**（500: OCR 合并 3→2 行，质量域；匹配行 8px）/ **PASS** 11 | 8 / 11 |
| F 背景图 | scale0.7・左上 | FAIL（同上） | **PASS** | 7.7 |

修复前 D 组 FAIL 即为审计预测的旋转缺陷（真实 bug，非测试假阳性）；修复后全闭合。

## 3. P5-3 最小修复（仅两处，不重写 Mapper）

1. `zheliyin-card-assistant.user.js` `buildItemsFromOcr`：θ≠0 输出 `{left: 旋转中心, top: 旋转中心, angle, origin:"center", width: bw+8, fontSize≈bh}`；θ=0 分支与旧行为逐字节一致。
2. `extension/src/editor/page-bridge.js` `ocrCreate`：`it.angle` 时 `obj.set({angle, originX:"center", originY:"center"})`。

未改：Provider/候选边界/fallback/UI/ocrPrepare/θ=0 路径。

## 4. 候选边界（P5-H）

本地 executor（`bbox{x0,y0,x1,y1}`）与 Baidu 均经 `unifyCandidates` → Mapper 只消费统一 `{x,y,width,height}`。修复过程未引入旁路。**PASS（静态+真机）**。

## 5. 已知边界（诚实清单）

| 项 | 状态 | 说明 |
|---|---|---|
| @require 资源缓存 | ⚠️ 部署注意 | ScriptCat 按 URL 缓存 @require 编译资源；harness 已加「安装前清 compiled_resource/resource」保证真实验证最新模块。真实用户侧：主脚本经 @updateURL 更新后，@require 文件若内容变更，需确认 ScriptCat 更新编译时是否重拉（未实测，建议后续在发布流程验证「脚本更新后页桥行为是否随新版本走」） |
| OCR 空格→textbox 换行 | PENDING(P5-I) | 空格文本在固定宽度内自动换行，高度翻倍、盒内纵向位置后移；文字质量域，P6 后处理 |
| 3000×3000 级超大图 | PENDING | 矩阵覆盖 2000×3000 PASS；更大尺寸未测 |
| 斜交图像内文字（非整图旋转） | PENDING | 本阶段仅覆盖整图旋转 |

## 6. 验收矩阵（对应任务 §十八）

```text
Geometry Model：已确立（见 §1，公式与代码逐条对应）
0°：PASS
Scale（0.5/1/2）：PASS
Offset（居中/左上/右下）：PASS
Rotation（15/45/90）：PASS（修复前 FAIL：textbox 未携角度、轴对齐盒错位，误差随 θ 增到 222px；修复=输出旋转中心+角度+center 原点）
Multi-size（500/900/2000）：PASS（500 子项 PARTIAL=OCR 行合并，几何仍 ≤8px）
Background：PASS
Active Image：PASS
Candidate boundary：PASS
Textbox（可编辑）：PASS（created>0、editable、rollback 见 stage-5.6/001）
```

证据：`runtime/reports/stage5-6-p5-geometry-report.json`、`docs/evidence/stage-5.6/stage5-6-p5-geometry-report.json`；回归 `runtime/reports/stage5-5b-p5-ocr-demo-report.json`。