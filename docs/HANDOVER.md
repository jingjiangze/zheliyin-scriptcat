# 交接文档 · 折立印名片套版助手（封存态 `0.3.11.91`）

> **目的**：任何人（或新的 AI 会话）**只通过 GitHub** 即可还原「为什么这么改、谁要求这么改、改了什么、测试了什么、为什么通过」，并从封存基线无缝接续开发。
>
> **状态**：test 轨已封存于 `0.3.11.91`；公开轨 `demo` 未随本批推进。
>
> **关联**：封存标签 `seal-0.3.11.91-p0x`（`a3411f6`）、`seal-0.3.11.91-p0x-archive`（`d7e3d78`）；工作目录脚本归档见 [docs/archive/seal-0.3.11.91/](./archive/seal-0.3.11.91/)；硬性规则见 [NATIVE_FIRST_POLICY.md](./NATIVE_FIRST_POLICY.md)、[NATIVE_TRUTH_COMPLETENESS.md](./NATIVE_TRUTH_COMPLETENESS.md)。

---

## 0. 30 秒上手

| 项 | 值 |
|---|---|
| 接续基线 | `test` = `stage-9-altq-baidu-reconstruction` = **`d7e3d78`**（= `origin` 两轨） |
| 版本 | **`0.3.11.91`**（`@version` / `const VERSION` / 50 条 `@require ?v=` 三处一致） |
| 主脚本 | `zheliyin-card-assistant.user.js`（3912 行） |
| 公开轨 | `demo` = `69995db`（`0.3.11.74`，本批**未动**） |
| 稳定轨 | `main` = `6840170` |

```powershell
# 1) 接续
cd D:\zheliyin-scriptcat
git fetch origin
git checkout test && git log --oneline -5        # 应见 d7e3d78

# 2) 全量单测回归（当前应为 57/58，1 项既有失败见 §6）
$f = Get-ChildItem -Recurse -Filter *.test.js runtime | ForEach-Object { $_.FullName }
node --test $f

# 3) 真机验收（任选一个 runner；AI 用 key 仅 env 临时注入，绝不落盘）
$env:ZY_AI_KEY = "<临时注入>"
node runtime/stage9/commit-46v-template-fit-real.js      # 模板 Fit
node runtime/stage9/commit-46y-local-match-rule-real.js  # 本地匹配规则 A/B
node runtime/stage9/commit-46p-real-acceptance.js --selftest   # 静态自检（不需真机）
```

**三条不可破的红线**（详见 §4）：① 文字真值只来自 Native OCR；② apply 只改 `text`（必要时 `fontSize`），几何/字体/样式/身份/层序零变化；③ 跨版命令一律 `VERSION_MISMATCH` 拒绝。

---

## 1. 本批完整工作记录（时间正序）

### 1.0 批次定位与分支纪律背景

- 内部开发轨 `test` → 镜像轨 `stage-9-altq-baidu-reconstruction`（RULE-20 fast-forward、RULE-21 HEAD 相等）；公开轨 `demo` 独立。
- 每个逻辑改动 = 独立 commit + 立即双推 + 每 commit 升版（RULE-18/19）；**禁 force push / reset / rebase**（RULE-22）。
- 本批期间曾遇 GitHub 网络中断（`Failed to connect to github.com:443` / `Connection was reset`）：一律**本地提交保存 + 多轮重试 + 非 force**，网络恢复后快进推送，未做任何破坏性操作。

### 1.1 P1 多版地基（`269a775` / `93d8512` → `67e9041`，`0.3.11.78`）

- **需求**（用户）：「加入多版套版，真实测试两轮，明确区分或隔离每一版，填充当前面、填充正反面、切换到多版时跟着切换，先打开背面再开启多版，一步步来，先给我审计方案」。
- **实现**：版布局判定（版数真源 = `totalCanvasArray`）／`findCanvasForSide(side, vIdx)` 按版定位／版维快照 + 全版 hash／命令与 validator 版维门禁（混版 → `VERSION_MISMATCH`）／只读消息 `getMultiVersionInfo`。
- **真机证据**：`46p` 10 模板 ×3 轮 = **30/30**；`46q` 正反面 = **12/12**（front4 + back3）；`46r` 多版布局 2 轮 7 步全绿。
- **关键坑（已修）**：反面画布为**懒创建**（需先点 UI「背面」页才 materialize 第二画布）→ 测试与 runner 必须先点背面。

### 1.2 原生 OCR 会话自动定期更新（`0fcde73`，`0.3.11.79`）

- **需求**：「脚本设置自动定期更新原生网页文字识别 cookie，**默认读取使用者 cookie**」。
- **实现**：`touchNativeOcrSession()` 对同域 `OCRTool.do` 发 `fetch(credentials:"same-origin")` —— 由浏览器自动携带当前登录会话 Cookie，**不手工注入、不写死、不落盘 cookie 值**；`startOcrSessionKeeper()` 启动后 4s 首触 + 按间隔（默认 10 分钟）；`runNativeTruth` 遇 `SESSION_EXPIRED` 即时触发。
- **后续变更**：`877f1d3` 按其后的用户指令**移除设置 UI**，后台保活保留（默认开启）。

### 1.3 P2 多版套版（仅当前版）（`7442af0`，`0.3.11.80`）

- **实现**：纯逻辑 `zySelectCommands`（按「版 + 面」选取；跨版指令一律拒绝且不入选）／面板「多版套版（仅当前版）」区（版标识 + 填当前面 / 填正反面）／`startVersionWatcher` 每 1.5s **只读**轮询 `getMultiVersionInfo` 实现切版跟切，版/面一变即把冻结匹配标 `stale` 并在 UI 提示，拦截误写。
- **隔离保证**：作用域固定仅当前版 + bridge 硬校验 `version == current.vIdx`。

### 1.4 P3 真机验收（`4a75e23`，`0.3.11.81`）

- `commit-46s` 两轮 `errors: []`：S1 多版建立（v=2 / totalLen=4）、S2 切版标签、S4 切到第 2 版 + 误点拦截、S5 填当前面（仅 v0 正面变化）、S6 填正反面（v0 正反变化，v1 零变化）、S7 混版 → `VERSION_MISMATCH` 零泄漏。

### 1.5 M4 可编辑匹配工作台（`7d9999c` → `d1e067e`，`0.3.11.82` / `0.3.11.83`）

- **实现**：新纯模块 `extension/src/ai/template-match-workbench.js`（`zyBuildWorkbench` / `zyWbAssign` / `zyWbAssignText` / `zyWbUnbind` / `zyWbSwap` / `zyWbRebuildMatches`）；双栏 UI（左 = 模板槽位[原模板只读 / 客户值可编辑]，右 = 客户文字块，点选分配）；重建指令复用 `zyBuildApplyCommandPlan`，保留同版/不串面/冻结/双因子。
- **硬规则**：槽位 ↔ 客户块**一对一**（重复分配自动从旧槽解绑）；`MANUAL_EDIT` 断开来历链接。
- **按路线图移除**：面板「正反面与字段（可编辑）」legacy 区（函数保留未删）。
- **语义修正**：`解绑/清空` 回到「不确定」（uncertain 是**槽位级**属性）。
- **真机**：`commit-46t` 两轮全绿 —— A1 渲染（6 行 / 4 客户块 / 汇总「已绑定 6/6」）、A2 解绑、A3 点选分配、A4 行内编辑（MANUAL_EDIT）、A5 交换、A6 确认套版落正确槽位且对象数不变、A7 `objectUuid/left/top/width/angle/fontId/fontFamily/fill` 零变化。

### 1.6 去掉原生 OCR 栏（`b6354ab`，`0.3.11.84`）

- **需求**：「去掉原生 ocr 栏，不在 ui 显示默认后台执行，真实审计后真机测试」。
- **实现**：移除 `OCR_ONLY_MODE` 常量、原生抽屉 CSS、`renderNativeOcrDrawer` / `mountNativeOcrPanel` / `observeNativeRemount` 及 init 挂载分支；OCR 能力保留在浮窗入口。
- **真机**：`commit-46u` 两轮全绿（两种 GM 模式下 `#zy-native-ocr-panel` / `#zy-native-ocr-tool-btn` / `#zy-native-status` 计数恒为 0；SPA 变更后不复活；点识别仍可后台启动）。

### 1.7 M5 模板 Fit 引擎（`057a986`，`0.3.11.85`）

- **实现**：新纯模块 `extension/src/editor/template-text-fit.js` —— `zyFitFontSize`（`FITS` / `SHRINK` / `OVERFLOW` / `NO_EVIDENCE_*` / `MEASURE_FAILED`；注入测量器求不溢出最大字号）与 `zyFitMatches`；输出键白名单（仅字号决策，无几何/字体/样式字段）。
- **接线**：`page-bridge.js` 的 `templateApplyV2` **默认开启**；以**改动前槽位足迹宽**为目标真实测量；放不下才写 `fontSize`；回执带 `fontSizeEvidence`。
- **顺带修正**：Smart 路径原在 `setObjectText` **之后**取 `so.width` 当目标 → 纯 Text 对象会自我截断成 no-op；M5 一律用改动前足迹宽。
- **真机**：`commit-46v` 两轮 —— front-2 `22→17`、front-3 `14→13`、back-1 `14→8`（SHRINK，实测宽 ≤ 目标）；front-1 `16→10` 到 min 仍溢出 → `OVERFLOW` 标位；几何/字体/样式/身份/层序零变化。

### 1.8 stage-12 PP-OCRv6 本地引擎（并行工作流；`3337f76`/`d1c42a2`/`65933d9`/`1c561fa`，`0.3.11.78` → `0.3.11.86`）

- 由另一条工作流在 `origin/test` 上推进（本地 OCR 引擎 + 使用策略：未配置云端 Key 用本地直出、云端空/不全用本地补齐），合入后占用 `0.3.11.86`。
- **整合方式（可复现）**：`stash → git merge --ff-only origin/test → stash pop`，唯一冲突为 `@require` 块（保留远端 8 条 ppocr 模块）→ 本侧顺延升版为 `.87`。

### 1.9 修复「无 Native 文字真值，本批不创建」误报 + 去掉会话设置 UI（`877f1d3`，`0.3.11.87`）

- **需求**（用户反馈）：「无 Native 文字真值，本批不创建，**是输出的 bug**，我遇到了这个 bug（最新 test）」。
- **根因**：`native-completeness-gate.js` 的 `resolveGate` 兜底分支把 `totalNative === 0` **一律**报成 `NATIVE_NO_TRUTH`；而该分支实际混合三种不同原因，真实状态被掩盖。
- **修复（三分支）**：

  | 条件 | 新 code | 文案要点 |
  |---|---|---|
  | `tb.skipped && !tb.native`（内部异常 / 依赖未就绪） | `NATIVE_TRUTH_PIPELINE_ERROR` | 「流水线**异常**…**非“无真值”**」 |
  | `tb.native.ok === true`（请求成功但 0 行） | `NATIVE_EMPTY` | 「请求成功但未识别到文字（0 行）」 |
  | 其余 | `NATIVE_NO_TRUTH` | 历史兜底（G1/G2 契约不变） |

- **同时**：移除「原生 OCR 会话（自动更新 Cookie）」设置 UI（含 `bindOcrSessionControls` / `ocrSessionSettingsHtml` 死代码）；后台保活不变。
- **验证**：门禁测试 `native-gate-every-path` 14/14（新增 G3/G4）；`commit-46w` 两轮（UI 零 `zy-ocr-session-*`，而 GM 会话状态仍被写入 → 证明后台保活无需 UI）。

### 1.10 UI 精简（`e4aedae`，`0.3.11.88`）

- **需求**：「去掉诊断 ui，去掉复制套版结构（改为复制全部文字），去掉追加信息，改为识别图片文字」。
- **实现**：移除 `#zy-probe` 诊断按钮（内部 `probeCanvas` 保留，经 `?zydebug` 出口可用）；`#zy-append` **原地**改为 `#zy-ocr-btn`「识别图片文字」并删除重复行；复制行改为 **[复制正反面] [复制全部文字]**（`zyBuildCopyText` 新增 `all` 模式 = 纯文本逐行，无标题无结构字段；`template` 分支保留、仅撤 UI 入口）。
- **真机**：`commit-46o`（改造为两模式）——「已复制正反面 6 行」/「已复制全部文字 5 行」，画布零变化。

### 1.11 修复「Native 文字真值流水线异常」（`0e2eca5`，`0.3.11.89`）

- **需求**（用户反馈）：「Native 文字真值流水线异常…**目前 demo 分支的 Native 文字可用，对比代码并进行审计修复**」。
- **对比结论（决定性）**：`maybeApplyNativeTruth` 在 demo（`0.3.11.74`）与 test 全函数仅 **1 处差异**（Stage 12 本地辅助块）：
  - demo 分支条件含 `STAGE9_LOCAL_SIDECAR`（默认 `"0"` 关）→ **从未执行**；
  - test 改为 `localAssistScope !== "none"`（`zyLocalAssist` 默认 `"1"` 开）→ **首次执行**；
  - 该分支主体逐字相同，其中 `recoverNativeGeometry` / `runLocalGeometrySidecar` **无 try 防护** → 任一抛出即冒泡为「流水线异常」→ 整批不创建。
  - 即：**既有潜伏缺陷被默认开关打开后首次暴露**，非 Native OCR 本身不可用。
- **修复**：新增非致命包装 `safeRecoverNativeGeometry` / `safeRunLocalGeometrySidecar`（失败返回中性结果 + 写证据，**绝不中断识别**，对齐 stage-12 契约「本地为末端」）；异常文本透出（门禁显示「内部错误：<真实异常>」）；新增 `?zydebug` 出口。
- **验证**：`native-gate-every-path` 15/15（新增 G5）；`commit-46x` 两轮（`mode=NATIVE_TRUTH`、门禁 `NATIVE_PARTIAL_OK` 精确结论、控制台零 `[TRUTH] exception`）。

### 1.12 阶段 1（P0-0）本地 OCR 专用几何匹配规则（`f658849`，`0.3.11.90`）

- **需求**：「本地 ocr 和 ocr 真值差距大导致不创建，**应设置本地匹配规则**，审计该方案后合并之前的审计计划」。
- **再审结论（关键）**：`native-geometry-recovery.js` 的 `SOURCE_LOCAL` 阶段**并非未实现，而是门槛照抄 BAIDU**（`if (lsim < T.minSim)`，`minSim` 默认 **0.8**）→ 手写体真值 vs 本地印刷体识别串必然 `sim` 低 → 本地几何 **100% 被跳过** → 门禁 `UNRESOLVED` → 不创建。**根因 = 门槛错误，非能力缺失。**
- **实现** `matchLocalGeometryOnly`（L1–L9 规则集）：L2 沿用几何硬门；L5 禁复用已占几何；**L6 文字降权不升权**（不再设硬门，`sim≥0.8` 仍加分）；**L4 唯一性硬门**（最优−次优 < 0.2 且非高相似 → `NONE`，宁缺勿滥）；L7 记 `LOCAL_GEOMETRY_ONLY`、`score ≤ 0.7`、evidence 含 `rule/text-sim/len/type/uniq-gap`。
- **安全边界**：开关 `zyLocalMatchRule` **默认 `"off"`** → off 分支**逐字不变**（零现网行为变化）；单测 `local-geometry-match` 6/6；`commit-46y` 两轮 A/B：`off→recovered=0`；`geometry-only→recovered=1, method=LOCAL_GEOMETRY_ONLY, score=0.52`；歧义`→0`；越界`→0`。

### 1.13 阶段 2a（P0-2）字号求解单一入口（`e370feb`，`0.3.11.91`）

- **实现**：`page-bridge.js` 新增 `zyPickFontSize()` —— **唯一字号求解入口**，优先 M5 单一来源 `zyFitFontSize`（page 世界由 `installPageBridge` 注入），仅当注入缺失时回退历史 `zySolveFontSizeFusion`（已标 `@deprecated`，待阶段 2b 删除）。
- **契约保持**：smart 路径显式传 `minFontSize: 10`（保住其 `[10,160]` 契约；因 `targetW` 取自 `setObjectText` 之后 bbox，Fit 在 base 下判 `FITS`，≈ 无行为变更）；v2 路径不传（Fit 默认 `0.6·base`），与 M5 同源。

### 1.14 P0-X：内容相似套版 46h 过期验收口径闭环（`f9f5233` / `4fa8e45` / `a3411f6`，`0.3.11.91`）

- **起因**：`commit-46h`（内容相似）在 `0.3.11.91` 失败；用 `git stash` 隔离本阶段改动、回 `0.90` 基线重跑 → **逐字相同失败** ⇒ 判定为**既有回归**并转入专项。
- **定性**：`contentApplyFromPanel` 自 M2/M4 起已改为 AI 槽位匹配**【预览】** → 需再点「确认套版」才写画布；原 `templateApplySmart` 协议**已无 UI 入口** ⇒ 46h 属**过期验收口径**（其前提「一次点击即改画布 + 文案『正面更新 N 槽』」已不存在）。
- **处置过程（三轮，每轮一提交）**：
  1. `f9f5233` 现代化：`waitApplyDone` 升级为「等待 + 驱动」（识别预览文案后自动点 `#zy-apply-confirm`）；状态门兼容新旧文案且仅 `expectApplied>0` 强制；字号下界按 M5 放宽为 `[8,160]`；
  2. `4fa8e45` 加**点击后探针**（面板 / 按钮 / 确认键可见性 + 点击瞬间状态 → `runRec.clickDiag`）；
  3. `a3411f6` **决定性定位并修复**：探针证实点击已生效、确认键已生成；真实文案为「AI 槽位匹配不可用（no-key），**已改用本地规则库匹配（预览，未修改画布）**」→ 而驱动只认写死的 AI 分支文案 → **未点确认键**。修复 = 预览识别改为**通配 `（预览，未修改画布）`** + 终止文案集合扩充。
- **结果**：`C-MAIN` / `C-NO_MATCH` / `C-EMPTY` **3/3 用例 × 3 轮全绿**（`AI 填充完成：更新 3 槽（几何/字体/样式/身份/层序冻结，只改文字）`）；**产品代码零改动**（纯测试口径修复）。

### 1.15 封存与归档（`d7e3d78`，`0.3.11.91`）

- **需求**：「封存该项目，将所有更改记录上传至云端」「把本地脚本归档到云端仓库」「将完整工作内容交接到 github」。
- **封存**：对齐本地 `stage` 引用 → 打标签 `seal-0.3.11.91-p0x`（`a3411f6`，注释即本批完整更改记录）→ 推远端。
- **归档**：`docs/archive/seal-0.3.11.91/`（**132 文件 / 约 900KB**）= 本批全部实现补丁、探针、验收驱动脚本与提交信息；**凭据文件 `.zy-ai-key.tmp` 已排除、入库前密钥扫描 0 命中**；排除 `.nobom.txt` 派生副本与 `demo-us.js` / `test-us.js` 全量副本（git 历史已有真源）→ 标签 `seal-0.3.11.91-p0x-archive`（`d7e3d78`）。
- **本文件**：补全「完整工作内容交接」（承接前述封存与归档）。

---

## 2. 验收资产矩阵

### 2.1 真机 runner（`runtime/stage9/commit-46*.js`，21 个）与报告

| runner | 主题 | 报告 bver | 轮次 | 结果 |
|---|---|---|---|---|
| `46g` | 智能填充 | 0.3.11.65 | 3 | 3/3 |
| `46h` | 内容相似套版 | **0.3.11.91** | 3 | **3/3**（P0-X 后） |
| `46j` | AI 模型加载 | 0.3.11.67 | 2 | 2/2 |
| `46k` | AI 槽位匹配预览 | 0.3.11.69 | 1 | 1/1 |
| `46l` | AI 槽位应用 | 0.3.11.71 | 1 | 1/1 |
| `46m` | 并发守卫 | 0.3.11.71 | 1 | 1/1 |
| `46n` | UI 确认套版 | 0.3.11.72 | 1 | 1/1 |
| `46o` | 复制模式（正反面 / 全部文字） | 0.3.11.88 | 1 | 1/1 |
| `46p` | 综合验收（A–J 十模板） | 0.3.11.78 | 10 | 10/10 |
| `46q` | 正反面真机 | 0.3.11.78 | 4 | 4/4 |
| `46r` | 多版布局 | 0.3.11.78 | 2 | 2/2 |
| `46s` | **多版套版（P2）** | 0.3.11.81 | 2 | 2/2 |
| `46t` | **匹配工作台（M4）** | 0.3.11.83 | 2 | 2/2 |
| `46u` | 去原生 OCR 栏 | 0.3.11.84 | 2 | 2/2 |
| `46v` | **模板 Fit（M5）** | 0.3.11.85 | 2 | 2/2 |
| `46w` | 去会话 UI（后台保活） | 0.3.11.87 | 2 | 2/2 |
| `46x` | 流水线韧性（非致命化） | 0.3.11.89 | 2 | 2/2 |
| `46y` | **本地匹配规则 A/B** | 0.3.11.90 | 2 | 2/2 |

> `46f`（模板套版）报告位于 `runtime/reports/stage-10/`。所有报告同时保留 `.json`（结论）与 `-run.log`（过程）。
> 各报告 `bverExpect` 记录其验收时的脚本版本 —— **历史报告不随版本 bump 改写**（保持证据原貌）。

### 2.2 单元测试（`runtime/**/*.test.js`，共 58 个文件）

| 目录 | 数量 | 本批新增 / 改造 |
|---|---|---|
| `stage8d` | 6 | — |
| `stage9` | 30 | **`local-geometry-match.test.js`（新，6 断言）**、`native-gate-every-path.test.js`（+G3/G4/G5 → 15） |
| `stage10` | 5 | — |
| `stage11` | 8 | **`multiversion-p2.test.js`（新）**、**`template-match-workbench.test.js`（新，8 组）**、**`template-text-fit.test.js`（新，9 组）** |
| `stage12` | 9 | — |

---

## 3. 关键设计结论（本批沉淀，避免重复踩坑）

1. **反面画布懒创建**：不先点 UI「背面」页，第二画布不存在 → 任何多版 / 双面测试与功能必须先 materialize。
2. **「一键智能填充」= 预览语义**：任何驱动 / 自动化必须「已点击填充 → 等预览文案 → 点 `#zy-apply-confirm`」三步；预览文案有**两种**（AI 分支「AI 槽位匹配完成（预览，未修改画布）」与本地规则库降级分支「…已改用本地规则库匹配（预览，未修改画布）…」）→ **统一通配 `（预览，未修改画布）`**。
3. **字号目标宽必须取「改动前」足迹**：`setObjectText` 之后再取 `so.width` 会自我截断（对纯 Text 对象退化为 no-op）。
4. **本地 OCR 门槛不可照抄 Baidu**：手写体真值 vs 本地印刷体 `sim` 天然低；文本只能**降权**、不能当硬门（阶段 1 已实现，默认关）。
5. **辅助层必须非致命**：几何恢复 / 本地辅助任一异常都不得中断识别（否则表现为「整批不创建」）。
6. **状态文案是契约**：门禁 / 流水线的用户可见文案被测试与用户依赖，改动需同步更新 runner 与文档（本批因写死文案产生两次误判）。

---

## 4. 硬性纪律与红线（必须延续）

**文字真值**
- Native OCR（`textType=2` 手写体）是**唯一文字真值**；Baidu / Local 只提供 **geometry**，不得成为文字来源；本地文字**永不进画布**（`textbox.text` 恒为 `native.rawText`）。
- 缺失行如实告知（`NATIVE_PARTIAL_OK`），**不得**为好看谎报 `COMPLETE`。

**冻结契约**
- apply 只允许改 `text`（必要时 `fontSize`）；`objectUuid / left / top / width / angle / fontId / fontFamily / fill` 必须**零变化**。
- 多版隔离：跨版 / 混版命令一律 `VERSION_MISMATCH` 拒绝。

**凭据纪律**
- `ZY_STAGE9_COOKIE` / `ZY_AI_KEY` / `ZY_BAIDU_AK` / `ZY_BAIDU_SK` **仅 env 临时注入**；报告只记名不记值；**禁止落盘**；cookie 串仅允许写 `%TEMP%\zy_stage9_cookie.txt`。
- 仓库内禁止提交任何凭据（本批归档已做密钥扫描）。

**发布纪律**（见 `docs/NATIVE_FIRST_POLICY.md` RULE-01..22）
- 每 commit 升版（RULE-18，多处统一：`@version`、`const VERSION`、全部 `@require ?v=`，以及 runner 的 `BVER`）；
- 双推 `test` + `stage-9-altq-baidu-reconstruction`，非 force（RULE-19）；`stage` HEAD == `test` HEAD（RULE-21）；
- **禁 force push / reset --hard / rebase**（RULE-22）。

**工程方法**
- 默认**不改变现网行为**：新能力一律开关 **默认 off**，真机 A/B 达标后再转默认。
- FAIL 先判**责任归属**：`git stash` 回基线复跑 → 判定「实现 bug / 测试 bug / 环境限制」，**禁止为 PASS 降断言**。
- 每步可回滚：每提交独立可 `git revert`；历史证据只追加不删除。
- 三态分离记录：Technical / Product / Real User（Real User 仅在真人操作后写 PASS）。

---

## 5. 待办队列（按优先级，含依据）

| 优先级 | 条目 | 动作 | 依据 / 验证 |
|---|---|---|---|
| **高** | **阶段 5**：本地规则转默认 | `zyLocalMatchRule` 默认 `off` → `geometry-only`，做成可一键回滚的独立提交 | 阶段 1 已备 A/B 证据（`46y`）；**会改变真实识别行为，需真机确认** |
| 中 | 阶段 2b | 删除 `zySolveFontSizeFusion`，完成字号**单一来源** | 46v 已绿；删后须跑 46h / 46v |
| 中 | 阶段 3（P0-1） | 套版执行器合一：`templateApply` / `templateApplySmart` / `templateApplyV2` 三协议并入 `zyExecApplyCommands(plan,{fit})` | 现有 3 执行器 + 2 字号求解器重复；验证 46f/46l/46o/46t |
| 中 | 阶段 4（P0-3） | 抽取 `zyNativeTruthStage()`，合并 `maybeApplyNativeTruth` 两处重复前置（cloud / local 路径） | 验证 46x/46p |
| 中 | P1-6′ | 恢复层收敛：`buildAnchorCandidates()` + 4 个恢复模块合成一条搜索链 | **与阶段 1 同模块族，建议同批做**（避免二次重构） |
| 低 | P1-4 / P1-5 | provider 统一接口（`createXxxProvider().recognize()`）；质量 / 安全门收敛为「1 入口 + 5 纯校验器」 | `ocr-p0-matrix` |
| 低 | P2-7 | 死代码清理（候选：`tesseract-loader.js`、`ocr-provider.js`、`layout-provider.js`、`native-ocr-diff.js`、`ocr-model.js`、`ocr-text-safety-gate.js`、`ocr-text-sanitizer.js`、`text-geometry-matcher.js`、`image-mapper.js`、`diy-font-registry.js`、`image-ink-target.js`、`image-ink-visual.js`、`native-anchor*.js`、`native-capability.js`、`native-create-measure.js`、`native-dimension-contract.js`、`native-layer-contract.js`、`object-adapter.js`、`object-model.js`、`post-create-stabilizer.js`） | **须先反向引用复核**（`usage-audit.cjs` 已归档）；注意通用名误判 |
| 低 | P2-8 | page-bridge apply 协议 3 → 1（用 `mode/version` 字段区分） | 验证 46p |
| 低 | P2-9 | 建立「步骤 → 真机 runner」验收矩阵文档 | — |
| — | M6 / M7（用户早期路线图） | Template Apply V3 / 多模板真实验收 | 未开始（M4 / M5 已完成） |

---

## 6. 已知遗留与限制（诚实清单）

1. **单测 57/58**：唯一失败 `runtime/stage8d/text-fit-fusion.test.js`（依赖 `text-fit-fusion.js`）—— **既有失败，与本批改动无关**，尚未判定「实现 bug / 测试 bug」，需单独立项。
2. **本机真机环境无有效站点 OCR 会话**：Native 真值链路的真机验证受限；`46x` 采用 `?zydebug` 出口 + 合成真值驱动（绕过站点会话），已如实标注。
3. **`46h` 无 AI key 时走「本地规则库」降级分支**（runner 环境未注入 key）—— 属预期行为；AI 分支由 `46t` / `46v` / `46p` 覆盖。
4. **早期挂账**：`b-diag`「V0/V15 偶发 entry 缺 timeline」仍未解决。
5. **`demo` 轨未随本批推进**（`69995db` / `0.3.11.74`）：发布到 demo 需另行授权（用户此前明确「只修 test，暂不发 demo」）。
6. **`templateApplySmart` 协议已无 UI 入口**（保留代码未删）：属阶段 3 收敛范围。
7. **阶段 1 新规则默认关闭**：即当前线上（test 轨）行为 = 本地几何仍按旧门槛（100% 跳过）；需阶段 5 才真正生效。

---

## 7. 关键文件地图

| 路径 | 职责 / 要点 |
|---|---|
| `zheliyin-card-assistant.user.js` | 主脚本（3912 行 / 50 `@require`）：面板、AI 匹配、多版套版、工作台渲染与交互、OCR 会话保活、`installPageBridge`、`initZheliyin`、`?zydebug` 出口 |
| `extension/src/editor/page-bridge.js` | 页面世界桥：3 个 apply 协议 + `ocrCreate`；**`setObjectText` 是唯一文字写入点**；`zyMakeCanvasMeasurerFor`（真实测量）；**`zyPickFontSize`（字号单一入口）** |
| `extension/src/editor/template-apply-v2.js` | 纯规划：`zyBuildApplyCommandPlan` / **`zySelectCommands`（版 + 面选取）** |
| `extension/src/editor/template-text-fit.js` | **M5 字号 Fit**：`zyFitFontSize` / `zyFitMatches` |
| `extension/src/ai/template-match-workbench.js` | **M4 工作台纯函数**：`zyBuildWorkbench` / `zyWbAssign` / `zyWbAssignText` / `zyWbUnbind` / `zyWbSwap` / `zyWbRebuildMatches` |
| `extension/src/ocr/native-geometry-recovery.js` | 几何恢复（含 **`matchLocalGeometryOnly`** 本地规则） |
| `extension/src/ocr/native-geometry-aligner.js` | 文本主导对齐（`score = sim*3 + …` → 本地失配根源） |
| `extension/src/ocr/native-completeness-gate.js` | 完整性门 `resolveGate`（`NATIVE_*` 状态判定） |
| `extension/src/ocr/native-ocr-provider.js` | `POST /siteWeb/userCenterJsj/uploadOCR.do`（`textType=2`）；`NATIVE_SESSION_EXPIRED` 判定 |
| `runtime/stage9/session-probe.js` | 会话解析：env `ZY_STAGE9_COOKIE` → probe → 合并；产物 `%TEMP%\zy_stage9_cookie.txt` |
| `runtime/stage9/commit-46*.js` | 21 个真机 runner（见 §2.1，均支持 `--selftest`） |
| `runtime/reports/stage-11/*.json` | 本批验收证据（同时保留 `-run.log`） |
| `docs/archive/seal-0.3.11.91/` | 本批工作脚本归档（132 文件） |
| `docs/NATIVE_FIRST_POLICY.md` | RULE-01..22（版本 / 推送 / 禁 force） |
| `docs/NATIVE_TRUTH_COMPLETENESS.md` | 真值完整性状态细分 |

---

## 8. 环境与工具链

- **OS / Shell**：Windows + PowerShell（注意：不支持 `&&` / `||` 串联，用 `;`）。
- **Node**：直接 `node <file>`；单测用 `node --test`。
- **真机自动化**：Playwright（`node_modules/playwright`）；注入 ScriptCat（`runtime/vendor/scriptcat`）。
- **固定测试 URL**：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`。
- **会话获取**：`runtime/stage9/session-probe.js`（`ZY_SESSION_REFRESH=1` 可强制刷新；需身份 cookie `diy-User-third` + `thirdMember`）。
- **编辑器限制（重要）**：repo 位于 `D:\zheliyin-scriptcat`；若 AI 工作目录与 repo 不同盘导致无法直接编辑，**用 Node 补丁脚本**（读 → 字符串锚点替换 → 写回，保留 CRLF）改写，范式见归档脚本（`*-patch.cjs`）；锚点必须**唯一**，脚本内自带 `ANCHOR MISS / NOT UNIQUE` 校验。
- **版本 bump 范式**：脚本批量替换 `OLD → NEW`，覆盖 `zheliyin-card-assistant.user.js` + `extension/src/editor/page-bridge.js` + `runtime/stage9/*.js`（runner `BVER`）；**不改 `runtime/reports/**`（历史证据保持原版本）**。

---

## 9. 本批用户指令归档（原文）

> 按仓库既有约定（`docs/ai-instructions/README.md`）记录「谁要求这么改」——以下为本批直接驱动开发的用户指令原文。

1. 「加入多版套版，真实测试两轮，明确区分或隔离每一版，填充当前面，填充正反面，切换到多版时跟着切换，或者加入一键填入多版内容，先打开背面再开启多版，一步步来，先给我审计方案」
2. 「好的，执行 P1 多版地基改造」
3. 「每步改动都要推送到 github，补推后继续 p3」
4. 「继续 M4 可编辑匹配工作台」／「好的，先补 M4 真机验收」
5. 「脚本设置自动定期更新原生网页文字识别 cookie，默认读取使用者 cookie」
6. 「去掉原生 ocr 栏，不在 ui 显示默认后台执行，真实审计后真机测试并进入下一步」
7. 「无 Native 文字真值，本批不创建，是输出的 bug，我遇到了这个 bug（最新 test）」
8. 「去掉诊断 ui，去掉复制套版结构（改为复制全部文字），去掉追加信息，改为识别图片文字」
9. 「Native 文字真值流水线异常（内部错误或依赖未就绪，非“无真值”），本批不创建；请重试，若持续出现请反馈该提示。目前 demo 分支的 Native 文字可用，对比代码并进行审计修复」
10. 「重新审计 ocr 识别和文字套版，详细说明重复点可复用点，以及改进方案，给我结构图」
11. 「本地 ocr 和 ocr 真值差距大导致不创建，应设置本地匹配规则，审计该方案后合并之前的审计计划」
12. 「再审阅一遍 github 仓库后再重新审计一遍方案，保持每步都提交每步可回滚，中途不允许询问我，完成一个阶段后自动总结上下文并审计进入下一个阶段」
13. 「持续进行任务，每个阶段审计完后自动进入下一阶段，上下文达到 70 时总结上下文」／「强制持续进行任务！」
14. 「封存该项目，将所有更改记录上传至云端」／「把本地脚本归档到云端仓库」／「将完整工作内容交接到 github」

---

## 10. 交接检查清单（接续者按此自检）

- [ ] `git fetch` 后确认 `test` 与 `stage-9-altq-baidu-reconstruction` 均指向 `d7e3d78`，工作树干净、零未推送。
- [ ] 版本多处一致：`0.3.11.91`（`@version` / `VERSION` / 50 条 `@require ?v=`）。
- [ ] 全量单测 57/58（唯一失败为 §6-1 既有项）。
- [ ] 阅读 §4 硬性纪律与红线后再动手。
- [ ] 新改动遵循：开关默认 off → 单测 → 真机 runner → bump → 双推（非 force）→ 三方 HEAD 校验。
- [ ] 若继续队列，从 §5「高」优先级（阶段 5）或「中」（阶段 2b/3/4）开始，并按「每步一提交、每步可回滚」执行。

*本文件为纯文档变更（不改产品代码），故不 bump 脚本版本，以保持封存标签 `seal-0.3.11.91-p0x-archive` 与其验收证据的版本一致性。*
