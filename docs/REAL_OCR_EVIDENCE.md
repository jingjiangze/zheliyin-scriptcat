# REAL_OCR_EVIDENCE.md — 真实 OCR 链路（ScriptCat）证据归档

> 更新：2026-09-18 | 分支：test | 版本：0.3.10.2
> 结论：**真实 OCR 对象层 = PASS（4/4 Native textbox, isDisplay=0, 可见）**
> AUTH 恢复状态机 = **会话建立 PASS（bootstrap 登录成功, 重试提交不再 timeOut）**
> 环境边界：自动化 profile 无法复刻「真实用户订单上下文」的保存持久化/主提交（见 §6）

---

## 1. 真实链路（逐级证据）

| 层 | 结果 | 证据 |
|---|---|---|
| 真实 ScriptCat | PASS | `runtime/vendor/scriptcat` 扩展加载；userscript `runStatus:complete` v0.3.10.2 |
| 真实 userscript | PASS | 控制台 `[zy-ocr][INIT] pageBridge=function …` + `折立印名片套版助手已加载 0.3.10.2` |
| 真实 OCR（本地 Tesseract） | PASS | `ocr-raw.json`：4 行识别 `ABC 科技 有 限 公司 / 张三 / 13800138000 / 销售经理`（bbox 齐全） |
| TextBlock→buildItemsFromOcr | PASS | `ocr-create-items.json` 4 items（postMessage 真实观测） |
| ocrCreate→pageBridge | PASS | `ocrCreateResult {detectedBlocks:4, createdCount:4, failedBlockIndex:null, editorIntegration.mode:"native"}` |
| Native textbox | PASS | `ocr-object-A-create.json`：type=textbox，uuid 真实（4b0a720d-…），layerNum 1，isLineText true |
| **isDisplay** | **0** | 生产 `page-bridge.js buildTextMediaEntry` → `isDisplay:0`；最终对象实测 `isDisplay:0` |
| 编辑器渲染 | PASS | `OCR_VISIBLE_CHECK=PASS`；`ocr-after-create.png`（4 个 bbox 红框标注） |
| 保存 | 环境受限 | 自动化会话保存后 reload 对象丢失（站点设计持久化依赖真实订单上下文，见 §6） |
| AUTH 恢复状态机 | PASS(会话建立) | `authBootstrap={stage:"logged-in", loginClosed:true}`；提交重试第 2 发 `loginState` 不再 timeOut（空体 200） |

## 2. 服务端核稿 A/B（单变量，已归档 control-result.json）

| 组 | 结果 |
|---|---|
| isDisplay=1（旧 schema） | 9× ERR_AUTO_CHECK（第1页） |
| isDisplay=0（新 schema） | 1× 处理中 + 8× `producestate:1` success |
| resourceType=1 / isComposite=1 / isPreview=1 | 单变量均仍 FAIL（排除） |

→ **ROOT CAUSE = isDisplay 1→0（服务端可复现，单变量）**；生产修复已体现于 `page-bridge.js`（v0.3.10.2）。

## 3. 对象级证据（ocr-object-A-create.json，节选）

```json
{ "constructor":"b", "type":"textbox", "text":"ABC 科技 有 限 公司",
  "fontId":"248", "fontFamily":"方正黑体简体", "fontSize":26, "fill":"#000000",
  "isDisplay":0, "isEdit":1, "resourceType":0, "isComposite":0, "isPreview":0,
  "isDesign":1, "selectEnabled":1, "visitLevel":1, "topEnable":1,
  "uuid":"4b0a720d-…", "multiUuid":"4fb61ff1-…", "layerNum":1,
  "visible":true, "opacity":1, "scaleX":1, "scaleY":1, "angle":0 }
```

## 4. AUTH 恢复状态机（本轮新增能力，harness）

- `submitUserDesign.do` → `{"result":true,"loginState":"timeOut"}` = **AUTH_EXPIRED**（waitForResponse 同步捕获响应体，可靠判定）
- 恢复：轮询等站点登录弹层（≤20s，历史 relogin 探针同款）→ `ensureLogin`（focus/select/原生 setter/input/change/点击；**不 reload，原位保留对象**）→ 重试提交
- 会话引导：登录会整页 reload（历史验证）→ **创建对象前先 bootstrap 会话**，否则未保存对象随 reload 丢失（`AUTH_RELOGIN_OBJECT_PERSISTENCE` 观测点已内置）
- 上限：2 次；超限输出 `AUTH_LOGIN_FAILED` 并停止业务

## 5. 分层判定（harness 输出，见 ocr-run-summary.json）

```
AUTH startup:   PASS(bootstrap logged-in) / EXPIRED(触发恢复前)
SUBMIT retry:   不再 timeOut（bootstrap 阶段验证）
HEGAO:          ENTERED（前一轮已达成）
PROOF:          UNKNOWN/未达成（受 §6 环境边界阻隔）
OBJECT:         VALID   INTEG: NATIVE   ISDISPLAY: 0   RENDER: PASS
```

## 6. 环境边界（诚实清单）

1. 自动化 profile（profile-usc3）的「保存→reload」持久化失败：站点设计持久化依托真实订单/商户上下文；自动化会话无真实订单 1 依附，保存提示成功但 reload 后不回读对象。
2. 主提交（设计信息「确定」后 30s）在自动化未观察到 `submitUserDesign.do`：流程出现站点侧前置门（订单校验/获取信息），30s 窗口不足或需真实订单号态。
3. 修复方向不涉及此类环境变量：**不得把自动化保存失败归因于 OCR**；同理不得用 submit 超时判核稿失败。

## 7. 下一步（真机）

1. 用户在**真实浏览器（真实登录 + 真实订单上下文）**安装 test 分支 userscript 0.3.10.2，走 `识别当前图片 → 创建文字 → 核稿 → 订单号1 → 印刷 → 设计信息 → 确定 → 交稿`，确认无「自动核稿失败」且文字正常显示。
2. 若需自动化闭环：采用 CDP 接管用户已登录 Chrome（`--remote-debugging-port=9222`），以真实会话复跑本 harness。
3. 合并 test → demo → main 前，先由真机结果确认。

## 8. 产物清单

- runtime/reports/p0/ocr-runtime/{ocr-raw,ocr-textblocks,ocr-create-items,ocr-object-A-create,ocr-object-B-after-reload,ocr-object-D-before-proof,ocr-run-summary,real-proof-investigation}.json
- runtime/reports/p0/ocr-runtime/{ocr-after-create,ocr-before-proof}.png
- runtime/reports/p0/control-result.json（A/B 服务端单变量矩阵）
- runtime/p0/ocr-real-runner.js（真实 ScriptCat 链路 harness）
- 凭据纪律：全程仅环境变量；报告/产物/截图全部脱敏。