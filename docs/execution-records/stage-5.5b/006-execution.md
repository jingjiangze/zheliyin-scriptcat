# 006 执行记录 — P3 OCR 主链路审计与最小闭环（Provider/候选/映射/编辑器四边界）

- 时间：2026-09-16
- 当前 branch：`demo`
- 关键 commit：`3a9c369 refactor: unify ocr candidate boundary (P3 audit fix)`
- 执行目标：P3（指令四-十二）：先审计主链路四边界，发现问题只做最小修复，并完成一次真实最小闭环（Native→Local→OCRCandidate→Mapper→Textbox），不改 Baidu fallback/duplicate/rollback/样式。

## 一、真实调用链追踪（§五/§六，入口→中间→数据结构→编辑器动作）
```
Native #zy-native-ocr-btn （或浮窗 #zy-ocr-btn）
  → handleOcrImage()                      入口函数
      → waitForCanvasReady()              桥：getCanvasInfo（只读，≤30s 轮询真实状态）
      → waitForOcrTarget()                桥：ocrPrepare（页面世界解析 active→背景图→首图）
                                           返回 {ok, kind, dataUrl, width, height, geometry{left,top,width,height,scaleX,scaleY,angle}}
      →（local）executor（页面世界，def 遮蔽 + new Function 注入）跑 Tesseract
                                           返回私有 {ok, lines:[{text,bbox{x0,y0,x1,y1}}], w, h}
      →（baidu）createBaiduProvider.recognize()
                                           返回统一 {candidates:[{text,bbox{x,y,width,height},confidence,coordinateSpace,imageSize}]}
      → unifyCandidates()                 P3 新增数据边界归一化（executor 私有形 / Provider 统一形 → 统一 OCRCandidate）
      → buildItemsFromOcr(candidates)     Mapper：image-pixel → canvas（几何来自 ocrPrepare）
      → postMessage('ocrCreate', items)   Editor action
      → page-bridge buildOcrCreateResult → createTextObject → 真实 textbox（可编辑）
```

## 二、Provider 边界审计结论（§六）
- **耦合成立**：修复前 `buildItemsFromOcr` 直接消费 executor 私有 `lines[].bbox.{x0,x1,y0,y1}`；本地路径完全绕过 OCRCandidate 统一边界（ocr-provider.js 的 normalizeBBox 未被主流程使用）。
- 风险：未来新增 Provider 需再次适配 x0/x1；bbox 校验与 imageSize 元数据缺失。
- **最小修复（不重写 executor）**：新增 `extension/src/ocr/candidate-normalizer.js`（@require，与 config-core 同模式）`unifyCandidates(raw, imageSize)`：executor 私有形（x0/x1）与 Provider 统一形（x/y/w/h）均归一为 `{text, bbox{x,y,width,height}, confidence, rotation, coordinateSpace:"image-pixel", imageSize}`；`buildItemsFromOcr` 只消费统一候选；Baidu 路径不再手工 x0/x1 重映射。
- 测试位置：`tests/editor-object-model/candidate-normalizer.test.js`（8 行矩阵，含反转 bbox/空文本/零宽/负宽过滤）。

## 三、Mapper / 坐标（§八）
- 使用真实几何：image width/height + canvas left/top/scaleX/scaleY/angle（全部来自 ocrPrepare 页面世界实测，含背景图 left/top 缺失的居中兜底）。
- 基础场景 + 隐式缩放（背景图由 fabric 自动适配缩放）真机验证：生成 textbox 位置合理。**旋转场景未专项验证 → PENDING**（按指令标记 PENDING，不判失败、不重写 Mapper）。

## 四、Textbox 创建边界（§九）
- ocrCreate → page-bridge createTextObject：type=textbox；P1 v3 证据 5 个样本 `editable:true`（「可双击编辑」）；样式克隆沿用参考对象（思源黑体 Regular），未推翻。

## 五、真实最小闭环（§十）
- P2-B 回归 harness（统一边界重构后重跑）：Native 按钮 → CANVAS_READY(bg=true) → ocrPrepare background-image → LOCAL(lines=3) → BUILDING(items=3) → SUCCESS(created=3)；errors=[]，**无回归**。

## 六、三态区分（§十一）
- A OCR 识别质量：少量错字（如 "WecChat"）→ quality 层面，允许。
- B 坐标质量：基础/缩放场景 PASS；旋转场景 PENDING。
- C 编辑器创建质量：textbox 可编辑（editable=true，P1 v3 5/5）→ PASS，优先级 C>B>A 已满足。

## 七、判定
- P2-B GATE：PASS（上轮 005）。
- P3 审计：完成；存在一处边界缺陷（executor 私有格式直入 mapper）→ 已最小修复 + 8 行单测 + 真机回归 PASS。
- P3 结论 = **情况 A（当前实现已基本闭环）**，剩余问题：① 旋转/多尺寸坐标专项验证 PENDING；② 未来 Provider 走统一候选（已具备入口）。

## 测试命令
`node tests/editor-object-model/run.js`（11 套件全 PASS）→ `node runtime/stage5-5b-p2b-native-panel.js`（真机回归全 PASS）

## 下一步
P4：Local-first / Baidu fallback / Privacy / Credential UX（统一候选边界已就位，fallback 决策已有 fallback-policy）。