# STAGE 7 — Page Ownership（Page Registry / OCR Source Ownership / Page-safe Create）

- 分支：`stage-7-page-ownership`（基于 demo；main 未触碰）
- P0：CLOSED（v0.3.10.2，isDisplay 1→0 已真机验收）
- 本阶段目标：建立「这个 OCR 属于哪一页」的硬边界 —— Page Identity → Source Page 冻结 → 创建前跨页硬门禁
- 本报告日期：2026-09-18

---

## 一、最终状态矩阵

| 项目                           | 状态        | 依据 |
| ------------------------------ | ----------- | ---- |
| PAGE_INVENTORY                 | PASS        | 真机 252438：getPages R0 [c0] → R1 后 [c0,c1]（动态 materialize） |
| CURRENT_PAGE_RESOLUTION        | PASS        | 真机：FRONT(c0,cc=1) / BACK(c1,cc=2)，sideSource = page-group.current |
| FRONT_BACK_SWITCH              | PASS        | 真机：FRONT→BACK→FRONT→BACK→FRONT ×5 rounds 全 OK |
| PAGE_IDENTITY_STABLE           | PASS        | 真机：R2/R4 pageId === "canvas:c0"，重复出现 identity 不变 |
| OCR_SOURCE_OWNERSHIP           | PASS        | 真机：FRONT 冻结 → 切 BACK → frozen 快照不漂移（race.frozenStable=true） |
| OCR_PAGE_GROUPING              | PASS        | 单测：groupOcrBlocksByPage（canonical + __UNKNOWN__ 桶） |
| FRONT_CREATE                   | PENDING     | 需真实 ScriptCat + stage userscript 跑真实 OCR（依赖 demo 合并后 @require 生效，见 §五） |
| BACK_CREATE                    | PENDING     | 同上 |
| CROSS_PAGE_GUARD               | PASS        | 真机：CREATE_BLOCKED_WRONG_PAGE ×2 + CREATE_BLOCKED_PAGE_NOT_FOUND，全程 createdCount=0、激活页对象数不变 |
| PAGE_UNKNOWN_STOP              | PASS        | 单测：freeze 失败 → CURRENT_PAGE_UNKNOWN；user.js 冻结失败停止 OCR（无 FRONT fallback） |
| IDENTITY_CONFLICT              | PASS        | 单测：PAGE_IDENTITY_CONFLICT → CREATE_BLOCKED_PAGE_IDENTITY_CONFLICT；真机冲突探针（fake vo）另见 page-registry.json |
| UNDO_REDO（页隔离）             | PENDING     | 待 F/B 各创建后验证（依赖 FRONT_CREATE/BACK_CREATE） |
| SAVE_PAGE_OWNERSHIP            | PENDING     | 待 F/B 创建后保存刷新验证（Spec §29/§30） |
| SINGLE_PAGE_REGRESSION         | HISTORICAL  | 单面模板 1203177/20408603 自动化环境不可加载（历史 p0 单面真机证据为回归基线，见 P0_FONT_PRINT_ROOT_CAUSE_REPORT.md） |
| REAL_DUAL_PAGE                 | PASS(消息层)/PENDING(完整 OCR) | 252438 双面消息链真机全通过；真实 OCR Case1-5 待完整链路 |
| GEOMETRY_READY                 | NO          | 本阶段明确不触碰 bbox→Canvas 坐标转换（Stage 8 闸门） |

## 二、本轮代码变更（stage-7-page-ownership）

| Commit | 内容 |
| ------ | ---- |
| 9afba9e | feat(stage-7.6/7.7)：page-bridge 只读消息 getPages/getCurrentPage/resolvePage + ocrPrepare 同帧回传 page + ocrCreate Ownership 硬门禁 + created[] 回传 pageId/side |
| 4f3d321 | feat(stage-7.6)：page-model 纯函数 freezeSourcePage / groupOcrBlocksByPage / validatePageOwnership + 单测 18/18 |
| 655957d | feat(stage-7.6)：user.js OCR Source Page freeze + items/ocrCreate 透传 pageId/side + bridgeCall 注册 getCurrentPage |
| 62984ac | test(stage-7.6/7.7)：真机探针 ocr-source-ownership.js + 证据（ocr-source-ownership.json / cross-page-block.json） |

已全部 push 到 `origin/stage-7-page-ownership`（HEAD=62984ac）。

## 三、代码位置

- `extension/src/editor/page-model.js` —— Page Registry 权威纯函数（enumeratePages/getCurrentPage/getFrontPage/getBackPage/resolvePageIdentity/isKnownPage + freezeSourcePage/groupOcrBlocksByPage/validatePageOwnership）
- `extension/src/editor/page-bridge.js` —— 页面世界边界适配器：3 个只读消息 + ocrCreate 门禁（`.page-group.current × currentCanvasNum × idName` 交叉，PAGE_IDENTITY_CONFLICT；禁裸 index 当 identity）
- `zheliyin-card-assistant.user.js` —— handleOcrImage 冻结 source page；buildItemsFromOcr 每 item 携带 pageId/side；ocrCreate 顶层透传
- `tests/editor-object-model/page-model.test.js` —— 18/18 PASS（纯函数，不访问真实网站）
- `runtime/stage-7-4/ocr-source-ownership.js` —— 真机探针（真实 252438）

## 四、真机证据摘要（252438，2026-09-18）

`runtime/reports/stage-7-page/ocr-source-ownership.json`

- R0 FRONT：`pageId=canvas:c0, side=FRONT, cc=1, sideSource=page-group.current, pages=[c0(9 objs)]`
- R1 BACK：`pageId=canvas:c1, side=BACK, cc=2, pages=[c0,c1]`（totalCanvasArray 动态扩展，与 Stage 7.4/7.5 结论一致）
- R2/R4 FRONT：pageId 仍为 `canvas:c0` → **identity 稳定**
- Race：frozen(FRONT c0) → 切 BACK → `frozenStable=true`（源页不漂移）
- 门禁（合成 item 仅为边界级门禁验证，非 OCR 生产证明）：
  - `pageId=canvas:nonexistent` → CREATE_BLOCKED_PAGE_NOT_FOUND，createdCount=0，zeroCreate=true
  - 当前=BACK、source=FRONT → CREATE_BLOCKED_WRONG_PAGE，createdCount=0，zeroCreate=true
  - 当前=FRONT、source=BACK → CREATE_BLOCKED_WRONG_PAGE，createdCount=0，zeroCreate=true

关键工程事实：
- 持久 profile 中的旧 userscript（demo-pinned 旧 page-bridge）会占据 `__ZY_CARD_ASSISTANT_BRIDGE__` mark、忽略 pageId 弱化门禁 → 探针注入前必须先移除旧脚本（本次移除 zheliyin-registry-1789726405660），避免旧桥双 listener 污染判定。

## 五、尚未完成（诚实清单）

1. **真实 ScriptCat 完整 OCR Case1-5（FRONT 仅 / BACK 仅 / 双批 / 跨页拒绝 / 切换后创建）**：
   - 阻塞点：stage userscript 的 `@require .../page-bridge.js?v=0.3.10.2` 仍指向 **demo 分支**（生产旧桥，不认识 ocrCreate.pageId）；
     真实 OCR 结果会走旧桥 → 门禁不生效。
   - 生效路径：先 stage→demo 合并（FF），再在 External Chrome 真实 ScriptCat 安装 demo userscript 跑 Case1-5。
   - 替代路径（可临时验证）：把 user.js 的 page-bridge @require 临时指向 `stage-7-page-ownership` 分支 URL，验证后回退（与早期 ae4826c 同模式）。
2. **Undo/Redo 页隔离 + Save 后页归属**：依赖 FRONT/BACK 各创建成功（继 1）。
3. **版本**：本分支维持 0.3.10.2（与分支历史一致，page-model 等 feat 未升级）；**demo 合并时必须统一升 0.3.10.3**（userscript @version、const VERSION、@require ?v=、manifest.json version/version_name、extension/assistant.js 全局 version 四/五处一致）。
4. **单面回归**：自动化环境无法打开 1203177/20408603；沿用 p0 历史真机单面证据（HISTORICAL_REAL_EVIDENCE）。

## 六、Stage → demo 晋级清单（条件就绪后）

1. FF 合并（禁 force / rebase / 空 commit）：`git merge --ff-only origin/stage-7-page-ownership`（demo→stage）
2. 版本统一 0.3.10.3（§五-3 五处）
3. External Chrome 真实 ScriptCat：安装 demo userscript → 跑 Case1-5 / Undo-Redo / Save 归属 → REAL_DUAL_PAGE=PASS
4. 全 PASS 后收尾：REPORT 更新 → 关闭 Stage 7 → 进入 Stage 8 Geometry 闸门（GEOMETRY_READY=YES）

## 七、架构目标（本阶段落地部分）

```
Current Editor State → Page Registry → PageIdentity(pageId=canvas:c0|c1)
→ OCR Source Ownership（freeze，OCR 期间切页不漂移）
→ TextBlock(pageId/side) → Group By Page
→ Page Ownership Validation（sourcePageId === 激活页，否则 CREATE_BLOCKED_*）
→ Target Page → Native drawText → Editor Object(pageId) ...
```

PageIdentity 已作为 OCR→Editor 链的硬边界；未触：Geometry / Alignment / Style / Undo 核心 / P0 字段（isDisplay 等）。