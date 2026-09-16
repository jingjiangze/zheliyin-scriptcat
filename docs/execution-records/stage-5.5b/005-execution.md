# 005 执行记录 — P2-B 原生右栏 OCR 面板真机 GATE 全 PASS（进入 P3 审计）

- 时间：2026-09-16
- 当前 branch：`demo`
- 关键 commit：`8bc428a feat: embed ocr into native editor right rail (P2-B)...` / `6517715 fix: p2b native panel observer ensure + harness scoping`
- 执行目标：P2-B 真机验收（指令三：Native UI / Button / Toggle / No-Duplicate / Refresh / Legacy / Native→OCR / Textbox 全部 PASS 才进入 P3）。

## 首轮失败与修复（回归链）
- 首轮 exit 1 且无 report：harness `cn` 声明在 try 内、finally 引用 → ReferenceError（**测试 bug**）。同时发现**实现缺陷**：init 时 rightBar 未创建则 mountNativeOcrPanel() 返回 false 且 observer 不启动 → 抽屉永不出现。修复（6517715）：observer 启动先 ensure 一次 + init 恒启动 observer；harness cn 提为外层作用域；install 失败改 throw 保证 report 落盘。

## 测试命令
`node runtime/stage5-5b-p2b-native-panel.js`（Playwright + 真实 ScriptCat + 真实 diy.zheliyin.com，profile-usc3）

## 测试结果（errors=[]，全部 PASS）
| 步骤 | 结果 | 证据 |
|---|---|---|
| install | PASS | status=1 |
| native-drawer-mounted | PASS | 原生右栏存在；drawer 存在；toolBtn 存在；legacy #zy-card-assistant 仍在 |
| drawer-position | PASS | l=1004 w=246 h=900（紧贴 rightBar 左缘 x=1250） |
| drawer-unique / tool-btn-unique | PASS | drawerCount=1 / toolBtn=true |
| tool-btn-toggle | PASS | 开→关(none)→再开(flex) |
| bg-set | PASS | backgroundImage 900×1200（背景图+无选中场景） |
| **native-ocr-flow** | PASS | 原生按钮 #zy-native-ocr-btn → CANVAS_READY(bg=true) → ocrPrepare **background-image** → LOCAL → **已生成 3 个文字** |
| refresh-no-dup | PASS | reload 后 drawerCount=1 / toolCount=1 |
| rollback / cleanup | PASS | 刷新后无残留；脚本卸载 |

## P2-B Gate 判定
Native UI ✓ / Button ✓ / Toggle ✓ / No-Duplicate ✓ / Refresh ✓ / Legacy ✓ / Native→OCR（真实 Local→Textbox）✓ → **P2-B = PASS → 允许进入 P3**。

## 证据
`runtime/reports/stage5-5b-p2b-native-panel-report.json` = `docs/evidence/stage-5.5b/stage5-5b-p2b-native-panel-report.json`

## 下一步
P3：OCR 主链路审计（tracing + Provider 边界）与最小闭环验证，见 006-execution.md。