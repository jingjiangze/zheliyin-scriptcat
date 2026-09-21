# STAGE 10-C — Native Layer Contract

> 状态：IN_PROGRESS（2026-09-21）
> 基线：`0.3.11.49`（稳定文字创建路径，test=`5556cb3` revert 链 + `5ed2152` evidence）
> 目标：正式定义「Native Create Success」，把 OCR 自动创建从「看到 Canvas 对象」升级为「完成原生图层注册」，并建立创建后硬校验与整批回滚。

---

## 0. 问题定义（Canvas textbox ≠ Native Layer）

> OCR 创建出来的文字可能存在于 Fabric Canvas，但没有完成设计器原生图层注册。

以下任何一个条件都不能单独代表创建成功：

```text
canvas.getObjects() 找到对象
obj.text 正确
obj.uuid / obj.multiUuid 存在
obj.locationX/Y 存在
画布上看得到文字
```

真正成功必须满足：

```text
Native Create
+ Native Canvas Object
+ Native Layer Registration
+ Native Identity
+ Native Product/Serialization Registration
```

## 1. 为什么会出现「只有 Canvas、没有 Native Layer」

历史沿革存在三层隐患：

1. **Mirror fallback 成功路径（已核实仍存在）**：`diy` 不可用时 `createTextObject() + mirrorEditorObjectModel()` 会给 Fabric 对象打 `multiUuid/locationX/Y/layerNum` 等字段，看起来"像"原生对象，但从未进入 `canvasObjInfo.canvasToProductObjArr`（native layer array）与产品序列化链 → **假成功**。
2. **Native drawText 后只在 Canvas 层确认**：`diy.drawText(...) → findOcrObject()`（text+layerNum 匹配）即认为成功；从未验证 `canvasToProductObjArr` 是否包含该对象、product JSON / serializer 是否注册、native identity 是否真实。
3. **无创建后硬校验 / 无失败整批回滚到 created=0**：当前事务仅对"创建异常"回滚，不对"创建了但没注册进原生图层"回滚。

## 2. 发布轨与真值优先级（本阶段强制约束）

| 轨 | 用途 | @updateURL/@downloadURL | @require |
|---|---|---|---|
| `demo` | 唯一公开发布轨 | 允许（指向 demo） | 全部 → `demo/*` |
| `test` | 内部开发轨 | 禁止 | 全部 → `test/*` |

**OCR 文字真值优先级（强制）**：

```text
1. 站点原生 OCRTool.do 手写体识别（uploadOCR.do, textType=2）——绝对真值
2. 百度 OCR ——几何/候选证据 ONLY（不得覆盖 1 的文字）  ← 现有 zyStage9NativeTruth 机制
3. 本地 OCR —— 仅 fallback
```

- 站内手写体识别结果中**不存在**的文字，**绝对禁止**进入画布。
- 站内手写体识别结果中**存在**的文字，**必须全部**进入画布。
- 最终 `textbox.text` 必须来自 Native OCR rawText（原样，禁 trim/sanitize 覆盖）。

## 3. Native Create Success 定义（契约）

创建后必须至少验证 A→D，且以「删除即回滚」兜底：

```text
A. Canvas Object        : canvas.getObjects() 包含新对象
B. Native Layer Array   : canvasObjInfo.canvasToProductObjArr 包含同一对象（或可证明对应的原生对象）
C. Native Identity      : 存在站点真实身份字段（uuid / multiUuid / layerNum 至少其一；字段存在本身 ≠ 已注册）
D. Product JSON / Serializer : 新对象已进入设计器原生产品数据链（序列化/检查函数可见）
E. Layer Inventory      : 创建前 N → 创建后 N+1，新增对象可被原生体系枚举（░ 真机阶段实现）
```

**字段名一律以真机审计为准，禁止猜测**（当前审计事实来源：`runtime/reports/stage-9/ocrtool-discovery*.json`、stage-6-2 系列、`docs/STAGE_8A2_*`）。

## 4. 强校验：创建流程（Native-first 简化）

```text
diy.drawText(...)
 ↓
findOcrObject()            → 无对象 = CREATE_NATIVE_LAYER_FAILED
 ↓
verifyNativeLayer()        → 失败 = CREATE_NATIVE_LAYER_FAILED
 ↓
verifyNativeIdentity()     → 失败 = CREATE_NATIVE_LAYER_FAILED
 ↓
verifyNativeProductRegistration() → 失败 = CREATE_NATIVE_LAYER_FAILED
 ↓
PASS
```

`diy`（CanvasDiy，原生 drawText 入口）不可用：

```text
CREATE_NATIVE_UNAVAILABLE（立即停止，禁止进入 mirror fallback 假成功）
```

**mirrorEditorObjectModel 的新定位**：只允许用于 审计 / 兼容旧测试 / 只读实验 / 历史调试；**禁止**作为 OCR production create 的成功路径。特别禁止「Canvas Object + multiUuid + locationX/Y + layerNum」被认定为原生图层。

## 5. 整批回滚语义（失败时）

第一个 Native Layer Verification 失败：

```text
停止
→ 删除已创建对象（canvas.remove）
→ 同步移除 canvasToProductObjArr 中对应项（恢复 native layer array）
→ 恢复产品对象数组
→ 恢复 undo snapshot（若有）
→ created = 0
→ 回复 { ok:false, code:"CREATE_NATIVE_LAYER_FAILED", created:[] }
```

禁止出现 `createdCount > 0` 却只有 Canvas 对象、没有 Native Layer 的假成功。

## 6. 验收

- [ ] `1 OCR Block = 1 Native textbox`（未获得 10-C 多 textbox 契约前，不启用 run split）
- [ ] 创建后 verifyNativeLayer 四层证据全绿
- [ ] Mirror fallback 不再是 OCR 生产成功路径
- [ ] 失败场景整批回滚 created=0
- [ ] 真机（模板 + 夏祝莲名片图）创建对象全部属于 Native Layer
- [ ] 发布 demo 前强制印刷流程查询无报错（submitUserDesign.do / imgPreviewSearch 核稿 PASS）

## 7. 与既有模块的关系

| 模块 | 角色 |
|---|---|
| `native-create-measure.js` | 对象识别（NATIVE_RETURN/REGISTRY_DELTA…）、registry mismatch、三层一致性、cleanup 恢复验证 —— 判定库 |
| `native-color.js` | 颜色（Stage 10-A，不回归） |
| `native-capability.js` | 能力门（NATIVE_READY…，判定 Native 可用性来源之一） |
| `text-run-model/segmentation`（0.3.11.52 已 revert） | 标记 EXPERIMENTAL，非 production create contract；不删除历史 |
