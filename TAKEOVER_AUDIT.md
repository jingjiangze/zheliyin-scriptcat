# TAKEOVER_AUDIT.md — AI 接管独立审计报告

> 接管项目：`jingjiangze/zheliyin-scriptcat`
> 审计基线：`origin/demo` HEAD（当前开发分支），仅审计、零生产代码改动。
> 审计时间：2026-09-17（UTC+8）
> 依据：用户指令「zheliyin....txt」（接管/上下文迁移/独立审计指令，全文 §1~§55）
> 原则：GitHub 当前代码是真实基准；历史报告只当线索，不当事实；每个结论附证据。

---

# 1. Current Repository

```text
branch:          origin/demo（开发基线；main=稳定版，stage-4.1-runtime-validation=开发中）
HEAD:            b36ce20c3589bbe819dc6aa390d723bc065c14f8
                 "feat: bump version to 0.3.8.8 (stage-6.2 native pipeline sync)"
remote:          https://github.com/jingjiangze/zheliyin-scriptcat.git
working tree:    审计在干净 detached worktree（@origin/demo）内进行；
                 主 checkout 为 ai2-repo-governance（含上一会话遗留的未提交 ui-audit 文件，本轮未触碰）
version:         userscript 0.3.8.8（@version + const VERSION + manifest version_name + 全部 @require ?v=0.3.8.8 + README 表格一致）
local demo tag:  本地分支 `demo` = ceedbb5（含 2 个仅本地 commit：ceedbb5/0fa8303，未在 origin/demo 上，属待澄清分歧，本轮不处理）
MAIN_HEAD:       6840170（docs: clarify install tracks）
DEMO_HEAD:       b36ce20（origin/demo）
```

版本来源核查（§四）：`zheliyin-card-assistant.user.js` 头部 `@version 0.3.8.8`、`const VERSION = "0.3.8.8"`、`extension/manifest.json` `version_name "0.3.8.8"`、7 处 `@require ?v=0.3.8.8`、README 版本表——**五处一致，无第二套版本系统**。`package.json` 0.1.0 是 Playwright runtime harness 专用版本（注释明确不影响生产），不冲突。

---

# 2. Architecture Map（§五，以真实结构为准）

```
zheliyin-card-assistant.user.js        ← 生产主脚本（@require 加载 8 个模块 + OCR 抽屉 UI + OCR 编排）
│  @require extension/src/fields/field-core.js         （字段解析纯函数）
│  @require extension/src/core/config-core.js          （配置单一来源）
│  @require extension/src/ai/ai-client.js              （豆包 AI 客户端）
│  @require extension/src/editor/page-bridge.js        （页面世界桥：apply/getCanvasInfo/ocrPrepare/ocrCreate）
│  @require extension/src/ocr/{baidu-provider,fallback-policy,candidate-normalizer,credential-crypto}.js
│
├── extension/           浏览器扩展（MV3）：assistant.js + gm-shim + 同一批 src 模块，manifest 按序加载
├── runtime/             Playwright 真机 harness：注入/探针/Phase 脚本 + reports/*.json 证据 + fixtures
├── tests/               无框架单测（editor-object-model/*.test.js run.js，node 直跑）+ HTML 浏览器套件 + fixtures
├── docs/                Stage 5.x 系列审计 + stage-6/6.2 报告 + execution-records + evidence
├── installer/           一键安装器（GitHub Actions 构建 exe）
└── 根级 README/CHANGELOG/ARCHITECTURE_AUDIT/STAGE_*_REPORT
```

关键连接：**userscript（隔离世界 UI）→ postMessage → page-bridge.js（页面世界，唯一画布入口）→ 编辑器 CanvasDiy/CanvasObjVO/Undo**。OCR 识别在页面 world executor 中进行，画布对象操作必须经 bridge。

---

# 3. Historical Stage Verification（§七 可信度表）

> 说明：本轮审计者无登录环境、未执行真机；「真机」列 = 仓库内历史证据文件存在性，属历史证据、本轮未重跑（按 §三十「不要相信自己的完成」，全部标为待重验）。「代码/单测」列为本轮实际核验。

| 历史结论 | 当前代码证据（本轮核验） | 当前测试（本轮重跑） | 当前真机 | 当前结论 |
| --- | --- | --- | --- | --- |
| Stage 1 字段核心模块化 | `field-core.js` 存在且被 @require 加载 | HTML 套件未重跑（43/43 为历史报告） | 历史报告 | PARTIALLY VERIFIED |
| Stage 2 Config/AI 边界 | `config-core.js`/`ai-client.js` 存在并被加载 | 未重跑 | 历史报告 | PARTIALLY VERIFIED |
| Stage 3 page-bridge 抽取 | `page-bridge.js` 内部结构与报告一致（apply/ocrCreate 等真实存在） | 未重跑 | 历史报告 | PARTIALLY VERIFIED |
| Stage 3.1/3.2 桥生命周期加固 | 闭包 guard + 稳定 marker 已见 | 未重跑 | 历史报告 | PARTIALLY VERIFIED |
| Stage 4 重复注入修复 | `pageBridgeInstalled` 闭包标志存在（userscript） | 未重跑 | 历史报告 | PARTIALLY VERIFIED |
| Stage 5.5B 百度云 + local OCR | baidu/fallback/tesseract/credential 模块存在并加载 | **本轮重跑：baidu-provider、fallback-policy、tesseract-loader、credential-crypto 等 12 套件 ALL PASS** | 历史证据文件在 | VERIFIED（单测级）/ 真机 UNVERIFIED |
| Stage 5.6 OCR-only Demo UI | 原生右栏抽屉 + `zyShowTemplatePanel` 开关代码在 | 静态核对 | 历史报告 | PARTIALLY VERIFIED |
| Stage 6 P0 对象模型镜像 | mirror 路径 + `sundry.guid` 用途在（page-bridge） | 未重跑 | `runtime/reports/stage-6-p0-*` 在 | PARTIALLY VERIFIED |
| Stage 6.1 TextBlock 层 | `groupLinesToBlocks`/`buildTextBlocks`/`joinWordsSmart` 真实存在，收紧参数已落地 | **本轮重跑 ALL PASS（含 s62-* 拆分/mergeReasons 用例）** | 历史报告 | VERIFIED（单测级）/ 真机 UNVERIFIED |
| Stage 6.2 原生 Native Pipeline | Native-first 分支真实存在（§4 详验） | **本轮重跑 12 套件 ALL PASS** | 证据 6 个 JSON 在；Save/Reload=PENDING | VERIFIED（native/layer/undo 代码+单测）；Save/Reload **PENDING** |

禁止为了好看把 PENDING 写成 PASS——**Save/Reload 维持 PENDING**（证据见 §8）。

---

# 4. Current OCR Path（§五 C/§六）

```
抽屉/按钮（userscript "识别图片文字"）
  → ocrRunning busy lock 贯穿 LOAD→RECOGNIZING→BUILDING→CREATING→DONE
  → executor（页面世界）Tesseract（本地）识别 or Baidu 云
  → candidate-normalizer（joinWordsSmart / groupWordsToLines / groupLinesToBlocks / buildTextBlocks）
  → buildItemsFromOcr（TextBlock → items：text/bbox/geometry/fontSize/diagnostics）
  → postMessage ocrCreate（userscript L~1054，10s 回复兜底）
  → page-bridge ocrCreate：Native-first（CanvasDiy.drawText）→ 失败回退 mirror
  → ocrCreateResult → 终态释放锁
```

- 引擎选择：`zyOcrMode`（auto/local/baidu）：**auto = 本地优先，本地失败 → 百度云 fallback**（`decideFallback` 决策矩阵，`fallback-policy.js` 本轮验证识别）。
- ⚠️ 与接管指令 §十冲突：指令要求 **Cloud PRIMARY / Local FALLBACK**；当前实现是 **Local PRIMARY / Cloud FALLBACK**。此为 Stage 7.2/7.3 的明确改造项，当前如实记录为「未满足」。

---

# 5. Current Side/Page Path（§十一/§三十九）

- `findCanvasForSide(side)`：`side==="back" ? 1 : 0`，仅支持 front/back 两个索引；消息语义只有 `front/back/both`。
- **`ocrCreate` 生产路径硬编码 `findCanvasForSide("front")` + `getCanvasDiyForSide("front")`（page-bridge L60/L71）**：OCR 重建文字目前**只可能落在正面画布**。
- 不存在 SideResolver；编辑器真实的 side/page/version/canvas 数据模型**未做页面对象调查**（历史证据只到 252438 正面）。

```text
当前代码如何知道自己在编辑哪一页？ → 不知道。OCR 路径固定 front。
结论：Stage 7.1（Current Side Resolver）尚未开始 → 按要求标记为 UNKNOWN / 硬编码 front。
```

---

# 6. Current Cloud OCR（§十五）

```text
Cloud adapter:    extension/src/ocr/baidu-provider.js（百度通用文字识别 /rest/2.0/ocr/v1/general，位置版）
调用入口:         userscript runBaiduOcr → fetch → candidate-normalizer 统一候选（缺省路径不变）
返回结构:         {words_result...} → 归一化为 words/lines + lineBBox（与本地路径共用 TextBlock 管线）
fallback:         无二级 fallback（Cloud 失败即结束提示）
                 ⚠️ 注意：当前 Cloud 是"本地失败的 fallback"，不是 primary；fallback 矩阵只对 auto 模式生效
认证:             AK/SK → credential-crypto 加密存 GM 存储，token 30 天缓存 + 110/111 自动刷新（历史测试 PASS 级验证）
```

---

# 7. Current Native Text（§八/§二十二 重点复核）

核验 `extension/src/editor/page-bridge.js`（L50~L206）：

1. **OCR 创建文字是否真的调用 `CanvasDiy.drawText`？** → 是。`getCanvasDiyForSide("front")` 取 CanvasDiy 包装，`diy.drawText(String(it.text), null, null, null, entry, layerNum)`（L90），并 `findOcrObject` 回捞对象；流程含 `createObjProductJsonDetail → canvas.add → canvasToProductObjArr 图层注册` 同一原生出口（报告 §2.1，本轮代码路径核实）。
2. **是否仍存在 `createTextObject` / `placeCreatedObject` 旧路径？** → 存在（L155/L651/L749），但已非 OCR 生产主路径：
   - OCR 生产路径 = Native-first；`createTextObject` 仅用于 **mirror 回退分支**（原生不可用时）和 **套版 applyFields**（填字段功能，非 OCR 重建）。
   - 回退会 `editorIntegration.mode="mirror"` 显式标明，不会静默混用。
3. **Undo/Redo？** → Native-first 分支创建前后调用 `Undo.getInstance().save()`（L76/L117-118，仅编辑器自身 API）；历史真机证据 `stage-6-2-ocr-create-native-test.json` 记录 undo1 撤编辑→undo2 撤批次→redo 恢复同批（报告 §3.2）。本轮：代码路径确认，真机未重跑。
4. **Layer？** → 原生 drawText 链注册进 `canvasToProductObjArr`；`layerNum` 由 OCR 批次顺序生成传第 6 参；后端证据 `canvasTextCount==layerTextCount`。本轮代码路径确认。
5. **Save/Reload？** → **PENDING**：决定性复测 `stage-6-2-save-reload-probe2.json` 明确 `serverSavePersistence=PENDING, reloadStability=not-restored`，限制已诚实记录（自动保存被订单检查前置拦截，红线：不伪造登录）。**按 §三十四要求保持 PENDING，待真实登录手动回填。**

结论：Stage 6.2「Native text operation / Native Layer / Native Undo / Redo」代码级 VERIFIED，「Save/Reload」**PENDING**。身份字段（uuid/multiUuid）由原生流程生成，OCR 不再伪造（L87-95 entry 构造 + 原生出口，报告 §2.3 对拍，本轮代码一致）。

---

# 8. Current Known Problems（§三十五，只列真实验证的问题）

| # | 级别 | 问题 | 证据 |
| --- | --- | --- | --- |
| P1 | P0/结构性 | `ocrCreate` 硬编码 front：无法处理背面/其他版 → 与「六大原则：只处理当前页面」冲突 | page-bridge L60/L71 |
| P2 | P0/策略 | OCR 策略为 Local-Primary/Cloud-Fallback，与指令「Cloud PRIMARY / Local FALLBACK」相反 | fallback-policy.js + userscript auto 模式 |
| P3 | P1 | Save/Reload 持久化未闭环 | stage-6-2-save-reload-probe2.json（PENDING） |
| P4 | P1/结构 | 无 SideResolver、无真实编辑器 side/page 数据模型调查 | §5 |
| P5 | P2 | mirror 回退路径与套版路径共用 `createTextObject`（历史旧路径保留，属设计内，风险=语义分裂） | page-bridge L155/L651 |
| P6 | P2 | `findCanvasForSide` 以索引猜 back=1，未对照真实多页结构验证 | page-bridge L398-410 |
| P7 | P3 | 本地分支 `demo`=ceedbb5 含 2 个仅本地 commit（ceedbb5/0fa8303），未推 origin，属待澄清分歧 | git log |
| P8 | P3 | 主 checkout（ai2-repo-governance）有上一会话未提交 ui-audit 文件（15 改 + 20 未跟踪） | git status（本轮未触碰） |
| P9 | P3 | README 标题遗留 "v0.2.3.11" 旧文案（README 内已自注） | README L1/L11 |

---

# 9. Proposed Stage 7（§三十八~§四十七 路线，含每项要素）

> 未开始实施。仅作接管后候选执行顺序；每项开工前先重同步 demo HEAD。

| Stage | 目标 | 涉及文件（预计） | 风险 | 测试 | 完成标准 |
| --- | --- | --- | --- | --- | --- |
| 7.1 Current Side/Page Resolver | 判定当前编辑页 front/back/other；不允许默认 front，判不了则停 OCR+诊断提示 | page-bridge.js + userscript + candidate-normalizer | 编辑器真实数据结构未知（需真实页面对象调查） | 新增 side 纯函数单测 + 真机 front/back/other 各一轮 | side 判定 + ocrCreate 落在正确画布；unknown→停止 |
| 7.2 Cloud OCR Primary | 调整策略：Cloud 优先 + timeout/error/invalid/empty 分类 | userscript（runBaiduOcr 主链）+ fallback-policy | 云限流/额度/鉴权 | fallback 单测扩展（cloud-fail→local） | Cloud 成功不调 Local；失败有分类 |
| 7.3 Local OCR Fallback | Local 只作 Cloud 失败回退 | 同 7.2 | 引擎加载慢 | 同上 | 正常场景不触发 Local |
| 7.4 Unified OCR Result | 统一 `{engine,image,side,words,lines,blocks,confidence}`，后段不感知来源 | ocr-model/candidate-normalizer | 大改风险=谨慎小步 | 兼容性单测 | 后段只消费 Unified |
| 7.5 TextBlock 2.0 | 一视觉区域一 TextBlock（已有收紧基础，继续防过度合并） | candidate-normalizer | 过度/不足合并 | fixture+单测+真机 | blocks↔created 一致 |
| 7.6 Geometry Verification | image→canvas 坐标含 scale/position/rotation（0/15/45/90/105° + 多尺寸） | image-mapper + page-bridge | 旋转几何易错 | P5 矩阵复跑 | 角点误差达标 |
| 7.7 Native Text Mapping | 继续 `CanvasDiy.drawText`（或验证过的更高层 API）强约束 | page-bridge | 原生 API 变化 | 端到端 | object/layer/history/undo/redo |
| 7.8 Font / Size Estimation | 字体/字号估计（先保证位置/宽高/内容/方向/换行） | candidate-normalizer + fonts | 字体库差异 | 标定对比 | 内容优先，样式可迭代 |
| 7.9 Width / Wrap / Line Spacing | 宽度/换行/行距 | 同上 | 换行误差 | forcedWrap 诊断 | 换行合理 |
| 7.10 Save / Reload | 真实登录闭环（红线：不伪造登录/保存） | —（验证为主） | 需真人 | 手动验证清单 | 刷新后对象/图层/身份恢复 |
| 7.11 Full Runtime Matrix | front/back/other 全矩阵 + 页面切换不串 | 全部 | 覆盖面大 | 真机矩阵 | 各 side 独立 |
| 7.12 Visual Diff / Reconstruction | 重建质量对比优化 | — | 效果主观 | 截图对比 | 主要字段重建可读可编辑 |

---

# 10. Confirmation

```text
No production code changed.             ← 本轮 0 生产改动
No version bump.                        ← 详见下方「版本策略说明」

CRITICAL: 本审计未执行真机（无登录环境）。所有 True-Machine 结论须在后续轮次用
真实登录 + 真机（252438 环境，见 REAL_RUNTIME_GUIDE.md / docs/DEMO_REAL_MACHINE_TEST.md）
重跑后方可升格为 VERIFIED。
```

## 版本策略说明（§五十一，遵循项目现有策略，不自创规则）

历史证据：项目对「纯文档/审计 commit」**不升版本**（R0 审计、Stage 3.1「源码零修改」全程保持 0.3.0.0；`docs: stage-6.2 native pipeline report` 3f13f71 不升版，随后由独立 commit `feat: bump version to 0.3.8.8` 升版）；升版与生产代码改动成对出现。本交付仅新增 `TAKEOVER_AUDIT.md`（纯审计文档）→ **本轮不升版本**（0.3.8.8 不变）。

## 建议的下一轮工作（需用户确认后再动代码）

1. 若用户批准 → 进入 **Stage 7.1（Side/Page Resolver）**：先做真实页面对象调查（编辑器 front/back/other 数据结构），再最小实现 + 升版 0.3.8.9。
2. 若 P3（Save/Reload）需优先 → 真人登录手动验证后回填 Stage 6.2 报告。