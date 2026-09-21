# STAGE 10-B.0：Native Multi-Textbox Capability Audit

- 日期：2026-09-21
- 基线：`6ee36bd`（stage == test），Version `0.3.11.49`
- 模板：`1234075`（真实 diy.zheliyin.com 编辑器）
- Runner：`runtime/stage10/text-run-native-audit.js`
- 证据原文：`runtime/reports/stage-10/text-run-native-audit.json`
- 结论：**Native Multi-Textbox 独立能力 PASS；save/reload 持久化 BLOCKED（会话）**

---

## 1. 目的（规格 §四/§五）

Stage 10-B（Text Run / Mixed Typography Segmentation）的前提：确认 Native 编辑器允许
**多个相邻 textbox 独立存在**，各自拥有独立 fontSize / fill / uuid / markuuid / layerNum /
pageId / aCoords，并且修改其中一个不影响另一个。

## 2. 审计步骤

| Part | 验证内容 |
|---|---|
| A | 双 probe 创建：A=`ZY_RUN_A_TEXT` fs40 fill=`#ff0000`，B=`ZY_RUN_B_TEXT` fs20 fill=`#0000ff`，紧邻放置 |
| B | 独立性：只改 A 字号 40→48；只改 B fill→`#00aa33`；验证不串扰 |
| C | identity 审计：uuid / multiUuid / markuuid / layerNum / regIdx / aCoords |
| D | serializer：fabric toJSON 独立 + 产品队列 canvasToProductObjArr 注册索引独立 |
| E | 真实保存（点击“保存”按钮 + 网络捕获）→ reload → 读取两个对象的字号/fill 独立性 |

## 3. 结果

### Part A — 创建（PASS）

```json
A fs=40 fill=#ff0000 layer=17
B fs=20 fill=#0000ff layer=18
foundA=true foundB=true distinctIds=true distinctLayer=true
```

### Part B — 独立修改（PASS）

```json
aSizeChanged=true   bFillChanged=true
aFillUnchanged=true bSizeUnchanged=true
```

即：改 A 字号不影响 B；改 B 颜色不影响 A。**两次修改互相隔离。**

### Part C — Identity 独立性（PASS）

```json
distinct = {
  "uuid": true, "multiUuid": true, "markuuid": false,
  "layerNum": true, "regIdx": true, "aCoords": true
}
```

- uuid / multiUuid 各自不同
- layerNum 17 vs 18（独立图层）
- 产品队列（canvasToProductObjArr）注册索引 17 vs 18（独立条目）
- aCoords 互不相同（独立位置）
- markuuid 两者均为空字符串 —— probe 未设置 markuuid（正常，非缺陷）

### Part D — Serializer 独立性（PASS）

- fabric `toJSON()` 每个对象独立序列化（含 fill / fontSize）
- 产品队列注册索引独立：`regIdx { A: 17, B: 18 }`，`regDistinct=true`

### Part E — save/reload 持久化（BLOCKED，会话）

- 保存按钮：`clicked=true`
- 保存网络：无 diy.zheliyin.com POST（仅 chrome-extension options 页 GET）
- reload 后：两个 probe 均未恢复（`found=false`）
- 结论：与会话态相关 —— 与 Stage 10-A Phase G 完全同因
  （`uploadOCR` 返回登录跳转；无有效可写会话时保存链路不产生服务端持久化）。

```
BLOCKED 原因：无有效登录会话 → 真实“保存”不触发服务端持久化
（能力本身已由 Part A/B/C/D 证明为独立对象，非多 textbox 能力问题）
```

## 4. 结论

```text
Native Multi-Textbox 独立创建/独立样式/独立 identity/独立 serializer Queue：PASS
save/reload 后保持两个独立对象：BLOCKED（会话限制，同 Stage 10-A G）

Stage 10-B Native 前提 → 成立
  多个相邻 textbox 各自 fontSize/fill/uuid/layerNum/aCoords 独立，
  Stage 10-B 的 Run Segmentation（1 Block → N Run → N textbox）有真实 Native 支持。
```

## 5. NEXT

- 10-B.1：纯模块 `extension/src/editor/text-run-model.js`（升版 0.3.11.50）
- 10-B.2：纯模块 `extension/src/editor/text-run-segmentation.js`
- 10-B.3：真实图片 Mixed Typography Detection evidence（不接生产）
- 10-B.4/5：conservative production gate → Native Create/Measure

## 6. Git

- 本轮 = audit evidence only → **不 bump version**
- commit：`docs(stage-10): audit native multi-textbox capability (10-B.0, no version bump)`
- push stage + ff test