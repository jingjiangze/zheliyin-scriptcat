# Execution Record 003 — Stage 5.6 P0 BRIDGE_NO_REPLY 二段诊断（v0.3.8.1）

> 时间：2026-09-17；分支 `demo`。用户第 2 轮真机反馈定位到具体失败分支后的一次最小加固。

## 一、用户反馈与定位（★ 对提问的回答）

| 维度 | 回答 | 含义 |
|---|---|---|
| 入口 | 新建设计 thirdDiyAdd.do | 与 harness 验证 URL 同族 |
| UI | 抽屉/按钮出现 | 脚本 init 成功、原生面板已挂载 |
| 时机 | 等设计内容完全出来才点 | 排除「早点击」 |
| 文案 | 新的分级提示（BRIDGE_NO_REPLY） | 已是 0.3.7.1+；失败码 = 桥无响应 |

**结论**：同 URL 族、同面板、非早点击，但 `getCanvasInfo` 60 秒无任何响应 → 本窗口无桥监听。二选一：`pageBridge` 模块缺失（@require page-bridge.js 未加载 → 注入被 try/catch 吞掉 → 面板照常挂载）vs 桥已注入但在别的 window/frame（iframe 拓扑，顶层发消息到不了画布所在 frame 的 listener）。

## 二、本轮修复（最小）

1. `handleOcrImage` BRIDGE_NO_REPLY 分支：
   - 失败时 `installPageBridge()` 重试一次（幂等；早前注入失败可补）；
   - 按 `typeof pageBridge !== "function"` 分档：
     - 模块缺失 → 明确提示「@require 下载失败（网络代理/拦截）→ 删除重装；仍失败换 Chrome 扩展版」；
     - 模块存在但无响应 → 保持跨框架提示 + `[zy-ocr]` 记录 `window.__ZY_CARD_ASSISTANT_BRIDGE__` marker 状态。
2. init 增加 `[zy-ocr][INIT] pageBridge=... unifyCandidates=... baiduProvider=... credCrypto=...` 依赖加载状态日志（无敏感信息）。

## 三、验证

- 语法 + 单测 12 套件全绿；0.3.8.1 全链路 p5 harness 回归（见最终输出）。
- 说明：正常成功路径（getCanvasInfo 响应）不受影响；改动仅覆盖失败分支文案/重试与 init 日志。

## 四、生效路径

- 用户更新到 **v0.3.8.1**（ScriptCat 检测 `@updateURL` 提示更新，或重装 https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js ）后重试：
  - 若出现「脚本依赖加载失败……@require 下载失败」→ 网络/代理导致模块拉取失败 → 删脚本重装 / 换扩展版；
  - 若仍显示「页面桥接无响应」→ 大概率 iframe 拓扑 → 进入跨框架定位开发（P0 第三段）；
  - 打开浏览器控制台可看到 `[zy-ocr][INIT] pageBridge=function/undefined ...`，直接可判定。

## 五、PASS / FAIL / PENDING

- 本修复：语法/单测 PASS；回归以 harness 最终输出为准。
- PENDING：真实用户侧根因待更新 0.3.8.1 后复测确认（模块缺失 vs iframe）；iframe 跨框架定位未实现（不做猜测性开发）。