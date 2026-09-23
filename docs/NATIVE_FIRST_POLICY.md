# Native First Policy（Stage 9 全局工程原则，Commit 2 固化）

> 生效日期：2026-09-20　版本口径：0.3.11.42（`audit(stage-9): establish native-first capability gate`）
> 适用仓库：`jingjiangze/zheliyin-scriptcat`，分支 `stage-9-altq-baidu-reconstruction` = `test`。

## 一、总原则

任何新功能第一步永远不是自己实现，而是先审计折立印原生网页是否已经存在对应能力。

覆盖范围不限于：文字识别 / 图片识别 / 文字新增与修改 / 字体 / 字号 / 位置移动 / 尺寸缩放 / 旋转 /
正反面切换 / 画布与模板尺寸 / 页面信息 / 对象保存 / 撤销 / 复制 / 删除 / 图层 / 导出 / 快捷键 /
对齐 / 居中 / 素材 / 二维码 / 颜色。

原生存在（API / 模块 / UI 操作 / 网络接口 / 对象模型 / 状态字段）→ 优先复用。
自定义实现仅允许用于：原生没有能力，或原生能力已确认存在但无法满足需求。
禁止自造第二套实现。

## 二、五层证据审计（Native Capability Audit）

「查不到 ≠ 不存在」。任何能力审计至少五层：

```text
L1 UI           按钮/菜单/工具栏/右键菜单/快捷键入口
L2 Event        键盘/事件/快捷键注册
L3 Network      request / response / websocket（只记 method/url/status/键名，禁凭据值）
L4 Module/API   requirejs.s.contexts._.defined 枚举 + 目标函数签名 probe
L5 Object State 操作前后对象普查对比（count/type/uuid/aCoords/location*/layerNum）
```

标准结论（只认这个四值枚举）：

```text
NATIVE_READY        L4 模块/API + L5 对象状态均已确认
NATIVE_PARTIAL      至少一层有证据（L1/L3/L4 任一命中）
NATIVE_UNKNOWN      证据不足（零命中或仅 L2 级别）；默认值
NATIVE_UNAVAILABLE  仅当五层审计完成且存在足够反证时才能给出
```

**NATIVE_UNKNOWN ≠ NATIVE_UNAVAILABLE。**

## 三、决策树

```text
新功能需求 → Native Capability Audit → 发现原生入口?
   YES → 复用原生 → 验证结果（Create → Measure）
   NO  → 深度逆向 / 五层再确认 → 仍然没有 → 自定义实现
```

## 四、Native Create → Measure（之后各 Commit 的基石）

不再问「文字该放哪」，改用：

```text
Native CanvasDiy.drawText() → 原生 textbox → native identity → 查询 canvas.getObjects()
→ 定位刚创建对象 → obj.setCoords() → 读取 aCoords/left/top/width/height/angle/location*
→ 记录 requestedGeometry vs nativeActualGeometry → nativePlacementError
```

对象定位禁止只靠 text：优先 native generated identity → registry/object identity → layerNum →
creation-order delta → text+geometry，text 仅作最后 fallback。

原生自动修正位置属于正常行为（先核 locationX/aCoords/origin/font metrics/transform），
不自行复制内部公式、不固定历史常量（如 -4）。

## 五、职责分离（Position / Typography / Text / Page / Size / Transform）

```text
POSITION   Native Anchor / aCoords   TYPOGRAPHY  ImageInk / EditorActualInk
TEXT       Native OCR（绝对真值）      PAGE        PageIdentity
SIZE       Native Template Dimension Contract（禁硬编码 92x56/507.5）
TRANSFORM  image-space
```

Baidu / Local OCR / AI 只提供 geometry / 样式证据，不得覆盖 Native OCR 正文。

## 六、硬规则（RULE-01..22）

```text
RULE-01  任何新功能先查原生。
RULE-02  未完成 UI+Network+Module/API+Object 四层审计，禁止声明「原生不存在」。
RULE-03  原生存在则优先复用。
RULE-04  原生创建后必须查询真实 Canvas 对象，不能假设请求参数就是最终位置。
RULE-05  Native Canvas object 是实际执行结果的第一手证据。
RULE-06  模板尺寸不能硬编码。
RULE-07  尺寸必须从当前模板公开信息/原生页面/API 查询。
RULE-08  正面和背面分别查询尺寸与方向。
RULE-09  横版与竖版分别验证（背面竖版文字单独测试）。
RULE-10  OCR reconstruction 与普通字段填充必须分离（RECONSTRUCTION_MODE / FIELD_FILL_MODE）。
RULE-11  一 block 一个最终 textbox。
RULE-12  一个 textbox 全部 calibration round 使用同一 object identity。
RULE-13  Native OCR 是最终 text truth。
RULE-14  Baidu / Local OCR 只能提供 geometry evidence。
RULE-15  aCoords 是最终视觉几何优先证据。
RULE-16  禁止固定 -4 等位置修正成为生产逻辑。
RULE-17  禁止没有多模板证据就建立 global multiplier。
RULE-18  每个 commit 必须升版本。
RULE-19  每个 commit 必须 push stage。
RULE-20  每个 commit 必须把完全相同的 commit fast-forward 到 test。
RULE-21  stage HEAD 必须与 test HEAD 一致后才能继续。
RULE-22  禁止 force push / reset / rebase 改写 test。
```

## 七、Commit 2 产物索引

```text
extension/src/editor/native-capability.js         纯模块：五层证据收敛 + 结论枚举（node 可测）
tests/editor-object-model/native-capability.test.js 14 用例全绿
runtime/stage9/native-capability-audit.js          真机五层审计 runner（--selftest 通过）
runtime/reports/stage-9/native-capability-audit.json 真机证据（模板 1234075）
docs/NATIVE_FIRST_POLICY.md                        本文件
```

真机证据摘要（模板 `1st 1234075/2114747/999`，2026-09-20）：

```text
gate = NATIVE_READY（模块 136；UI 56 条；原生 text 对象 7）
text-create/text-edit/font/size/position/side/page/undo/layer/align/qrcode/color = NATIVE_READY
ocr/save/export/material = NATIVE_PARTIAL
CanvasDiy.getInstance / Undo.getInstance / sundry.mmToPX|pxToMM / CurrentCanvas.getCanvasFromArray
= 原生入口探针命中（签名已取证）
```

> 对比：模板 `252438` 同一审计口径 text 对象 = 0 → 仅说明该模板无预置文字锚点，
> NATIVE_READY 判断不受影响（MODE B：CREATE_THEN_MEASURE_NATIVE 兜底）。