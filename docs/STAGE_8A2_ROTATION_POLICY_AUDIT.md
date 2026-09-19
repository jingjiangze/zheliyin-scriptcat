# STAGE_8A2_ROTATION_POLICY_GEOMETRY_AUDIT — 旋转策略/几何基线审计（§四 十问）

> 分支：stage-8a-2-rotation-policy-geometry（基于 8ccd5d7）
> 范围：只审计（零生产代码修改），回答 §四 十问 + 明确 preserveRotation 双模式落点。

## 一、§四 十问（CODE FACT，全部来自当前真实代码）

| # | 问题 | 答案 | 依据 |
| --- | --- | --- | --- |
| 1 | it.angle 最终进 Native 多少 | `location.rotation` 与 `printLocation.rotation`（`buildTextMediaEntry`：`rot = it.angle||0`） | page-bridge.js:507/517-518 |
| 2 | originX 最终多少 | **entry 不设 originX/originY** → Native 流程自定（以创建后回读为准，REAL 见 8A-1） | page-bridge.js:510-527 |
| 3 | originY 最终多少 | 同上，不设 | 同上 |
| 4 | left/top 代表什么 | **左上（it.left/it.top → location.x/y）**；无“中心”分支 | page-bridge.js:508-509 |
| 5 | width/height 本地还是渲染 | 本地（layoutWidth/boxHeight；factWidth=factHeight=w 等比） | 508/506 + user.js items |
| 6 | scaleX/Y 二次缩放 | **无**（entry 无 scale 字段；创建对象 scale=1，8A-1 REAL 回读证实） | 510-527 + 8A-1 json |
| 7 | viewportTransform | 仅显示缩放，不入 OCR→Canvas 计算（buildItemsFromOcr 用本地 canvas 坐标） | user.js |
| 8 | aCoords vs oCoords | aCoords=对象转换矩形（本地），oCoords=_calcCurrentTransform 后含角（交互）；**真实 Canvas 空间用 aCoords** | 8A-1 回读字段 |
| 9 | getBoundingRect | fabric 返回局部包围（含 stroke/scale），不受 viewportTransform 影响（实测其值=本地×1.46 因子≈Editor 渲染比例，非 zoom） | 8A-1 json |
| 10 | location* vs Fabric | entry 的 location = it 的 left/top/width/height/angle（同一来源，无分叉）；创建后业务字段回读待 8A-2 复核 | 510-518 |

**结论**：`if (it.angle) { origin center }` 老镜像段**不是当前主路径**（Native-first drawText+entry 已接管）；当前 it.angle → location.rotation，left/top 为左上语义，无 scale 字段、无双重旋转。

## 二、preserveRotation 双模式落点（设计，第二刀实现）

- 配置：`GM_getValue("zyOcrPreserveRotation", true)`（浮窗+原生抽屉同源，§九）。
- **ON（默认）**：buildItemsFromOcr 维持现行为（it.angle=图片 angle；位置=旋转后 AABB 左上，8A-1 已修）；校验点：**旋转中心与 OCR region 中心一致**（§十一 禁止 AABB 左上+另 anchor 旋转）——需真机回读 center 误差（8A-2 测试矩阵）。
- **OFF**：buildItemsFromOcr 置 it.angle=0，**left/top 由「旋转后 OCR region 中心」反推水平矩形的左上**（用 image-transform transformBBox 取 center，再按 textbox width/height 回推 left/top），使文字水平但中心仍落原区域（§十/§二十二）。
- 禁止：angle=0 后沿用 AABB 左上（anchor 耦合）；禁止角度/模板硬编码（§十七/二十九）。

## 三、本刀无生产代码修改

- 仅审计+文档；按项目纪律纯 docs 提交不升版、不推进 test（用户新纪律适用于“代码修改”闭环，首刀无代码改动）。

## 四、下一步（第二刀）

1. feat: GM 配置 + 双 UI 勾选 + buildItemsFromOcr 双模式（ON 现行为/OFF 中心反推）；
2. 单测：OFF 中心反推（transformBBox→center→回推 left/top，旋转 0/5/10 + scale 0.5/1/2）；
3. 真机矩阵：0/2/5/8/10° × ON/OFF + scale 组合 → rotation-policy/geometry/size.json + centerError/positionError/sizeError；
4. 每闭环：commit → FF test → 升版（每推必升版 五处统一）→ push。