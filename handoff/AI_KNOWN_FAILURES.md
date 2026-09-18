# AI_KNOWN_FAILURES.md — 已踩过的坑（禁止重复踩）

> 「已知失败」= 历史上真实发生并已定位；每条含修复方向。

## 1. Node 闭包不能直接放进 browser evaluate

- 错误模式：`waitUntil(() => ev(() => {...}))`（把 Node 作用域闭包塞进 Playwright predicate）。
- 曾导致：browser 侧 `ReferenceError`（Node 变量不可达）。
- 正确：browser predicate 必须**完全在 browser context 内执行**（自包含表达式/字符串化）。

## 2. 不要用 offsetParent 判断 fixed modal 可见性

- 之前 fixed modal 的 `offsetParent === null` 判断不可靠。
- 正确：`getBoundingClientRect()` 结合 `display`、`visibility`、`opacity` 判断真实可见性。

## 3. 印刷流程不是「print -> proof」直连

- 真实流程（已真机验证）：
  ```text
  OCR 创建 → 抽屉核稿闸门(hegaoOk)
  → 点击印刷 → 设计信息 modal → 订单号 → 获取信息 → 作品名 → 用户名 → 确定
  → 交稿层 → 提交稿件 → 核稿
  ```
- 不能假定一步到位；runner 用阶段化 + `resume-state.json` 支持断点。

## 4. 登录必须真正填写，不能只判断 session

- 只判断 session 会假 PASS。
- 手动登录必须：focus → select → native setter → input → change → click login。
- 登录可能打断原流程 → 登录后**重建印刷流程**（旧 runner 已验证该恢复路径）。
- 会话会过期：`submitUserDesign.do → {"result":true,"loginState":"timeOut"}`；提交前检测/续期或 relogin。

## 5. proofWait 必须用 let，不能 const

- 曾出现 `Assignment to constant variable: proofWait`（后续重新赋值）。
- 规则：**被跨阶段重赋值的计时/等待变量一律 `let`**。

## 6. Playwright 注入时机

- bridge/instrumentation 必须 `addInitScript`（document-start，页面主世界）且在**任何 goto 之前**注入；
- 先 goto 后注入会漏掉首屏网络/失效（历史 `(0,eval)` 在 CSP 下不生效的正确替代是 addInitScript）。

## 7. P0 Runner 纪律

- **不允许**用自己 `drawText()` 模拟 OCR 成功——必须驱动真实网页 OCR UI（`#zy-native-ocr-btn`）+ 非侵入观测 `ocrCreate/ocrCreateResult`。
- 不点固定上传/不传图（消除换图弹窗）：OCR 源 = 真实「当前图片」→ 背景图 → 首图（c2b940d 对齐历史脚本流程）。

## 8. 核稿闸门与请求特征

- `proof-result.json` 曾长期 `beforeHegao/afterHegao=null`、`generatingHandled=0`：核稿弹窗请求特征未被捕获。
- 修复方向：先修**观测/检测规则**（找到核稿弹窗触发请求的 URL/特征），再判定核稿成败；不要先猜根因。

## 9. 红框定位（去检查红框 → 对象映射）

- `suspect-object.json` 曾 `located:false, mapped:null`：只有 DOM 层 `.text-error-check` 红框，未映射到画布对象。
- 修复方向：按红框 bbox ∩ 画布对象 bbox 候选 + 字段对照（含 isDisplay 系统对照）定位；仍是 OPEN。

## 10. 版本/缓存

- ScriptCat `@require` 按 URL（含 `?v=`）缓存 → 升版不同步 = 真机跑旧模块（BRIDGE_NO_REPLY 历史根因，0.3.8.3 修复）。
- 失效旧缓存：改 `?v=` 版本参数（或重装脚本）。

## 11. 工作区/仓库注意事项

- 禁止 force push / 改写已推送历史。
- `runtime/browser/profile*`、`runtime/vendor`、`node_modules`、storage-state、`*.session`、`.cookies` 不入库（.gitignore）；迁移环境时这些只能本机复制。