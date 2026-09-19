# STAGE_8A2_RESTART_AUDIT — PHASE 0 冻结审计

> 分支：stage-8a-2-rotation-policy-geometry
> 依据：ZHELIYIN-SCRIPTCAT Stage 8A-2 Geometry A/B/C 自动化修复与最终验收计划（2026-09-19）

## 1. 仓库状态

| 项 | 值 |
| --- | --- |
| branch | `stage-8a-2-rotation-policy-geometry` |
| HEAD | `1e4660c` |
| origin/test | `1e4660c` |
| HEAD/test 是否一致 | **YES（dev=test=1e4660c，0.3.11.10）** |
| version | `0.3.11.10`（五处统一） |
| working tree | clean |
| checkpoint | `checkpoint-8a2-restart`（本刀创建，指向 1e4660c） |
| force push | 禁止（未使用） |
| main / demo | 未触碰 |

> 注：规格预估 dev=6e91f4d/0.3.11.9；实际上一刀升版提交已直接落在 dev 并 FF test，dev=test=1e4660c/0.3.11.10，两者无分叉，无需 b 调。

## 2. 三问题现状

- **C = NATIVE_EMPTY_PAGE_CONTRACT（CONFIRMED）**：1040459 空模板 ProductVO.itemList 恒 0；drawText→checkObjsInProductJson→g-1=-1→undefined.media；已排除 font.id / width / 注入 / 时序；「1→0」不存在。
- **A = ROTATION_GEOMETRY（CONFIRMED）**：旋转后 OCR region 中心与 Native textbox 中心随角度系统性错位（transform ON top: 23/11/-13/-37/-52 @ 0/2/5/8/10°）；image-transform.js 尚未正式生产接线。
- **B = SIZE_MAPPING（CONFIRMED）**：OCR 用 natural raster 坐标、textbox 用 Editor display geometry，缺少归一化；textbox 恒定 493×85/fs59 不随显示尺寸变化；禁盲调 0.969。

## 3. 上一刀结论（D2-C2，勿重推）

- drawItem 为**画布同步器非 itemList 建立者**（调用方先 concat）；serializer=ea.setItemListJson 对**裸 fabric.Image 输出空**；对**站点原生创建对象**的行为未证（本阶段 C1/C2 首验）。

## 4. 当前未解决问题（按 PHASE 顺序）

1. C：站点原生 image creation path 未知 → 需 C1/C2 native-image-inventory 取证；
2. C：setItemListJson 对 native image object 是否输出合法 item（C4）；
3. C：drawItem 精确职责与上层调用者（C5/C6）；
4. A：Native→Fabric→OCR geometry 契约未确认（A1/A2）；
5. B：Natural/Display/Editor 坐标空间公式待实测（B1/B2/B3）。

## 5. 本阶段禁止事项

- 重写 userscript/page-bridge/OCR pipeline/Editor Object Model；新框架；改站点源码；
- `itemList.push({})` / 伪造 product item / 吞异常 / magic offset / magic scale / 盲调 0.969 / 固定 fontSize / 固定角度补偿 / 模板 ID 特判 / 1040459 硬编码；
- 凭猜测修 A 公式（必须先契约）；仅诊断 runner 用 image-transform。

## 6. 下一刀（PHASE C1/C2）

ZY_MODE=native-image-inventory：1040459 fresh → 定位站点原生「图片/上传」入口（DOM/工具栏/file input）→ Playwright setInputFiles 真实图片 → 记录 canvas 对象全字段/注册/itemList/undo/网络 非敏摘要 → 与裸 fabric.Image 字段级 diff（C3 契约）。