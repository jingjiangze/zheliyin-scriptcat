# STAGE_8A1_OCR_OVERFLOW_ROTATION_REPORT — Selected Image Overflow + Background Rotation

> 分支：`stage-8a-1-ocr-overflow-rotation`（基于 stage-8a-ocr-audit @ aa4f51f）
> 原则（§五十二/§五十五）：诊断→根因→最小修复→真机验证→commit+push；证据不足如实 UNKNOWN；
> 不碰 fontSize/K（§三十二 禁止恢复 bbox.height*K），不引入 Typography/Style/Alt+Q。
> 证据：`runtime/reports/stage-8a1/selected-image-overflow.json`（9 场景 REAL）

---

## A. Selected Image Overflow

| 项 | 值 |
| --- | --- |
| OBJECT_EXISTS | **YES**（3 个 textbox 均创建成功，uuid diff 定位） |
| PAGE_CORRECT | **YES**（pageId=canvas:c0 FRONT，REAL） |
| CANVAS_GEOMETRY | 871.50×530.16（Fabric 单位，REAL） |
| ROOT_CAUSE | **WRONG_ORIGIN**（旋转分支 center 定位，left/top 存中心坐标，与上游 left 左上语义错位） |
| SECONDARY_EFFECT | SIZE_OVERFLOW（旋转+整图 scaleY 时：S4 fs=118 → boundingRect 1439 宽 = 画布 165%，右溢出 1193px） |
| BROKEN_AT | [zheliyin-card-assistant.user.js](file:///D:/zheliyin-scriptcat/zheliyin-card-assistant.user.js) `buildItemsFromOcr` 旋转分支（`if(!angle)…else { origin:"center", left:pcx, top:pcy }`） |
| FIX（最小） | 旋转分支改用**源 bbox 四角 → 图片变换矩阵（绕中心 scale+rotate）→ AABB 左上**，`originX="left"`（c2d7b3c）；新增 [image-transform.js](file:///D:/zheliyin-scriptcat/extension/src/editor/image-transform.js)（transformPoint/Corners/BBox/invert/compose） |
| VERIFY（真机） | S2(rot8)：origin center→**left**、left 404→**244**（AABB 左上）；S4(rot2+scale2)：left 436→**118**；角度保留 |

数值链（A-9，S1 第 1 行）：OCR 行高 57 → TextBlock mH 57 → fs=round(57×1÷0.969)=59 → textbox width 493 height 85（本地）→ getBoundingRect 717×124.9（渲染，×≈1.46 常量因子：Editor 渲染单位↔本地单位比例，已记录，归属 Typography/Canvas 层，本轮不改）。

分类明细（9 场景 REAL）：S1 base / S3 scale0.5 → 位置正确（IN_CANVAS）；S2/S4 → origin 修复前 center 错位、修复后 left ✓；S4 → SIZE_OVERFLOW 165%（scaleY 放大属于 Typography 层，本轮不碰）。

## B. Background Rotation

| 项 | 值 |
| --- | --- |
| ROTATION_BBOX_DISTORTION | **NO**：LOCAL OCR 行高组 `57,18,11` 在 0°/2°/5°/8°/10° 完全不变（同一张 1200×260 图；GROUP h REAL） |
| ROOT_CAUSE | 非 OCR 错误；旋转差异在**映射层**：AABB 左上锚定 + textbox 自带 angle 渲染时右扩（B4/B5 溢出 31/58px ≈ 画布 7%） |
| OCR_PREPROCESS_ROTATION | **不需要**（§二十六：OCR 行高无旋转失真，不做预旋转） |
| ORIENTED_BBOX | 不需要（§二十七：当前 Provider 无四角稳定证据，不建复杂接口） |
| TEXTBOX | fs 恒 59（scale1 下不因旋转放大）；刷新稳定待 Save/Reload（UNKNOWN） |
| BROKEN_AT | 无生产函数需改；溢出为 AABB 锚定边界，≤7% 画布 → 未来 Overflow Guard（1~2%）范围内 clamp，不做大动 |

## C. Regression（§五十五 结论格式）

| 项 | 判定 | 说明 |
| --- | --- | --- |
| P0（isDisplay=0/创建结构） | PASS（代码未动）+ REAL（9 场景创建成功） | ocrCreate 字段结构未改 |
| Page Ownership | PASS | pageId=canvas:c0 9 场景 REAL |
| 92×56 | UNKNOWN | 1065075 模板无 fabric image（8A-0 已证）→ 未注入复测（后续轮） |
| 88.5×57 | UNKNOWN | 1040459 同左；画布 453.2×744.8 竖版已记录 |
| Save | UNKNOWN | 编辑器提交授权环境限制 |
| GEOMETRY_READY | **NO**（§五十四：Typography/Canvas 映射未达 PASS） |

## 分类体系（§四十七）

- 问题 A：PRIMARY = WRONG_ORIGIN（修复）；SECONDARY = SIZE_OVERFLOW（Typography 层，本轮不碰）
- 问题 B：PRIMARY = 无 OCR 错误；SECONDARY = AABB 锚定右扩（≤7%，Guard 范畴）

## 下一步

1. （可选）92×56 / 88.5×57 模板挂图后 A/B 复测（补齐 UNKNOWN）；
2. Background 真实模板背景图场景（backgroundImage 非 image 对象时站点取图链）——2 个真实模板无 fabric image，站点背景取图链需专项审计（新轮）；
3. 全部证据齐后进入 Stage 8A TypographyCalibration（fs/scale 映射校准，替换 0.969 直除）。