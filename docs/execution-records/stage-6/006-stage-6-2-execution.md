# Stage 6.2 执行记录 — Native Pipeline（强制纠偏）

- 时间：2026-09-17（Asia/Hong_Kong）
- 分支：`demo`
- 起点 HEAD：`ee47859`（fix: tighten OCR textblock segmentation）
- 目标：§一~§二十八 —— 问题 A（TextBlock 过度合并）与问题 B（OCR 未进入 DIY 原生管线）
- 真实测试环境：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`
- 文档：`docs/stage-6-2-native-pipeline-report.md`

## 执行序列

### R0 基线审计
- 确认仓库 demo 分支 HEAD=`ee47859`，工作区含未提交 bridge 修改 + runtime 工具
- 确认固定测试 URL 可访问，编辑器初始：canvasObjs=9、layerArrLen=1（背景）、undoLen=1、redoLen=0、fontId=248（方正黑体简体）、workArea 92×56mm

### R1 静态逆向（无真机）
- `runtime/stage-6-2-dump-bundles.js` 采集 168 个真实 bundle → `runtime/vendor/252438/`（gitignored）
- `runtime/stage-6-2-scan.js` / `stage-6-2-window.js` 窗口打印精读关键实现：
  - r165 `OneKeyCanvasDiy`：`drawText(a,b,c,d,e,f)` 完整实现 @46103、`checkObjsInProductJson` @8354、`createCustomJson` @57419（遍历 canvasToProductObjArr）
  - r124 `ProductJsonObjAssignment`：`createObjProductJsonDetail` TEXT 分支 + location 落位 + multiUuid/markuuid 复制
  - r66 `Undo`：save（去重、上限 50）/ replay（栈方向）源码
  - r164 `LoadFromProductJsonCommand`：模板加载 TEXT 路径 `d.drawText(f,null,null,null,a,k.i$6)`

### R1 探针首跑失败（hook 日志闭包序列化时机）
- Phase 1 evaluate 返回时 log 尚空 → 补丁为 `window.__zyProbeLog = log` + Phase 6 单独 evaluate 读取

### R3 探针（真机 hook 对拍）— 全指标 PASS
- 证据：`runtime/reports/stage-6-2-native-probe.json`
- T1（手工路径）canvas 9→10/layer 1→2；T1 原生撤销→对象移除、重做→恢复（undo 2→1/redo 0→1）
- T2（media 路径）canvas 10→11/layer 2→3、layerNum=2、location* 精确落位、isEdit=1、uuid 原生
- <b>hook 调用链证据</b>（§十四）：`Undo.save → drawText → canvas.add → checkObjsInProductJson → Undo.save`（media 路径含 `createObjProductJsonDetail`）
- 清理：hook 全部恢复、基线 (9,1,undo=1,redo=0) 复原

### e2e 端到端（生产 bridge）— 两次运行
- 首次运行注入失败：`(0,eval)(src)` 在页面 CSP 下未将 `pageBridge` 提升为全局 → 改用 `page.addInitScript`（CDP 原生注入，document-start 安装，随导航自动重装），注入成功（marker 幂等）
- 补充 §二十 历史边界子场景：OCR 后模拟用户编辑 + 原生 U.save → Undo#1 先撤编辑（批次保留）、Undo#2 撤批次（模板保留）、Redo 恢复同一批、Redo2 编辑重放 —— 全指标 PASS
- 证据：`runtime/reports/stage-6-2-ocr-create-native-test.json`（mode=native、3==3、layerText==canvasText、undo/redo 闭环、templateIntact）

### P1 Save/Reload（两次探测 + 清理）
- v1（`stage-6-2-save-reload-probe.js`）：保存点击 → 仅前置检查 XHR；刷新对象恢复但未做站点数据隔离 → **报告标注 superseded**
- v2（`stage-6-2-save-reload-probe2.js`）：接受保存弹窗 + 全量网络钩 + 清站点数据 → 刷新未恢复 → **server-save persistence = PENDING**（限制：需真实登录，自动化不伪造保存）
- 服务端卫生：`stage-6-2-cleanup-persisted.js` 写回清理并验证 `SERVER-CLEAN`

## 关键修改
- `extension/src/editor/page-bridge.js`：`ocrCreate` Native-first 分支 + 5 辅助函数（getCanvasDiyForSide/getEditorDefaultFontId/buildTextMediaEntry/nativeIdentityGuid/findOcrObject）；原生不可用回退 mirror 路径

## 测试命令
```bash
node runtime/stage-6-2-dump-bundles.js       # bundle 采集（产物 gitignored）
node runtime/stage-6-2-native-probe.js       # hook 对拍（R3 全 PASS）
node runtime/stage-6-2-ocr-create-native-test.js   # 生产 bridge e2e（全 PASS）
node runtime/stage-6-2-save-reload-probe2.js       # P1 决定性（PENDING+限制）
node runtime/stage-6-2-cleanup-persisted.js        # 服务端清理（SERVER-CLEAN）
```

## 最终状态
- P0 TextBlock 拆分 / 一区域一 textbox / Canvas / Layer / Native operation / Undo / Redo：**PASS（真实证据）**
- P1 Save/Reload：**PENDING（限制已记录，需真实登录手动验证）**
- 工作区：clean、同步 push