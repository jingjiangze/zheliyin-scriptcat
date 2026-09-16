# 004 执行记录 — P2-A 原生右栏 DOM 审计（第 1 轮：结构定位 + 第 2 轮：深度枚举待确认）

- 时间：2026-09-16
- 当前 branch：`demo`
- 执行目标：P2-A（指令第二章 §五-§八）：不猜 selector，真实打开折立印编辑器，记录右侧原生工具/面板的真实 DOM 结构、层级与稳定性。

## 第 1 轮结果（runtime/stage5-5b-p2-panel-audit.js，editor-ready 后枚举大矩形 + 关键词）
- `.diyMain > div.rightPageBar.rightBar`：右侧工具条存在，rect left=1250 / width=190 / height=849（viewport 1440×900）。
- `div.bg-material`（rightBar 内）：rect left=1550（视口外）/ 260×900，visible=false，text=「常用素材」→ 是右滑抽屉面板（点击工具按钮后滑入）。
- 结论雏形：编辑器原生右侧结构 = 右工具条（.rightBar root）+ 若干滑动抽屉面板；浮窗 #zy-card-assistant 仍存在（我们的 UI）。

## 待第 2 轮确认（运行中 runtime/stage5-5b-p2-audit-deep.js）
- rightBar 子节点枚举（工具按钮：title/class/rect），识别「工具箱/识别/文字识别/图层/属性」等原生入口；
- 全部右滑面板清单（素材/图层/属性/文本/样式等）与其可见性切换；
- 刷新稳定性（reload 前后 selector 对比）；
- 挂载候选取证（display/position/z-index）。

## 证据
- `runtime/reports/stage5-5b-p2-panel-audit-report.json` → `docs/evidence/stage-5.5b/`（第 1 轮）
- 第 2 轮：`runtime/reports/stage5-5b-p2-audit-deep-report.json`（下一轮交付）

## 判定
PENDING（等第 2 轮 deep 数据 → 再输出「原生入口 → 真实 DOM → 内容容器 → 推荐挂载点 → 备用挂载点」结论）。