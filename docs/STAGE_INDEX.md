# STAGE_INDEX — 阶段索引

> 维护者：AI-2（Repository Governance 线）
> 依据：真实 Git 历史（`git log`，152 commit / 9 tag），**未修改任何历史 commit、未重打 tag、未 squash**
> 基线：`stage-4.1-runtime-validation` @ `e9235af`（Stage 5.5A-R2）；默认分支 `main` @ `7446faa`
> 证据等级术语见 `docs/EVIDENCE_POLICY.md`

---

## 0. 先纠正一个最容易误读的点

> ### ⚠️ Stage 5.3 的 `Reconstruction PASS` **不等于** Real OCR 已完成

Stage 5.3 报告的准确含义是：

```text
FIXTURE OCR（人为构造 OCRCandidate，bbox 来自合成图的已知绘制坐标）
  → image-mapper 坐标映射
  → object-matcher 匹配
  → 在真实编辑器里创建真 textbox（type=textbox / editable / 思源黑体 Regular）
  → fabric.Group 编组/解组
  → Reference Image 保留
  → rollback 零残留
```

**它验证的是**「坐标映射 + 匹配 + 原生文字重建 + 回滚」这条链路成立。

**它没有验证**：真实 OCR provider 能否从真实客户图片里产出候选。真实 OCR 在 Stage 5.3 与 5.4 两次深探后结论为 `NATIVE_OCR_RESULT_ACCESS = BLOCKED`，真实 provider 接入记为 `DEFERRED → Stage 5.5`。

> 因此：本索引中所有 Stage 5.3 / 5.4 的 `PASS`，凡涉及 OCR 来源的，一律按 `FIXTURE_OCR` 理解。历史报告原样保留，本索引负责补充这层说明。
>
> **Stage 5.5 更新（2026-09-16）**：真实 OCR 已接入 —— `REAL_OCR_PROVIDER = PASS`（本地 tesseract.js，chi_sim，零上传零 key），`BASIC_REAL_OCR_DEMO = PASS`。
> 即：**5.3/5.4 = fixture 链路验证；5.5 = 真实 OCR 链路验证**。两者都成立，含义不同，不要互相覆盖。

---

## 1. 阶段总表

| Stage | 目标 | 完成时间 | 主要 commit | 状态 | 真实验证情况 | 遗留问题 |
|---|---|---|---|---|---|---|
| **Legacy-A**（v0.2.3.8 时代） | 分面流水线重做、GitHub 热更新 | 2026-06-12 | `a6654f0` `43a5ab3` `9bbdd06` `22c6067` | 已发布 | 无系统化证据（早于 R0 基线） | 无正式测试基线 |
| **Legacy-B**（v0.3.0 / v0.3.1） | 扩展版、安装器、CI、iframe 兼容 | 2026-09-10 | `a76c3bd` `6c5e38e` `01260b0` `fd8ed3f` `4dd4085` `838e5bf` `087ccc2` `e39c58e` `6c19b46` | 已发布（tag `v0.3.0` @ `d03e014`） | CI 构建通过；真机验证未做 | 版本号语义混乱（`ARCH-RISK-002`） |
| **R0** | 只读架构审计 + Golden Master 基线 | 2026-09-15 | `b8a9c69` `d17a22d` `465fdab` `d7cd998` `1d9e716` `51c7579` + 6 fixture commit + `4549201` | GO（纯文档） | 只读审计，无运行回归（TEST_PLAN 只定义不执行） | 无 |
| **Stage 1** | field-core 单一事实来源（行为零变更） | 2026-09-15 | `fc9edac` `3ae7f75` `4fc8301` `6241c3c` `d028977` `77be68d` `b4e8e90` `9a002ea` `e86752f` | 完成 | UNIT 43/43 PASS（headless） | ScriptCat `@require` 真机未验证 |
| **Stage 2** | config-core 单一来源 + ai-client 边界 | 2026-09-15 | `d6eafbc` `c9b69d3` `3713265` `1335567` `5b9adc0` `e9fead2` `2c4b5f4` `be0856e` `c928c42` `09c86be` `650166a` `ca4beb2` `aef9f80` `b747fe8` `a8760b0` `eba5486` | 完成 | UNIT 15/15 + 18/18 PASS；AI fallback 矩阵 PASS | 真实 AI 链路未验证 |
| **Stage 3** | page-bridge 提取为 Editor 边界唯一实现 | 2026-09-15 | `e7292a4` `d93b395` `11cc39d` `62fe831` `7a44b67` `8416d3d` `8717311` `76779ad` `3906645` `6645661` `122336d` `01f7bd6` | 完成 | INTEGRATION 18/18（canvas mock）PASS | 「canvas mock」≠ 真机；rotation/图片层枚举 UNVERIFIED |
| **Stage 3.1** | Runtime wiring 复核 + 生产入口检查 | 2026-09-15 | `9df6217` `8163c43` `d438121` `4fac975` | PASS WITH TECHNICAL DEBT | INTEGRATION 5/5 wired-ok | `EDITOR-RISK-001` 业务耦合 P2 |
| **Stage 3.2** | Bridge 重复注入修复 + 再审计 | 2026-09-15 | `d77d3d3` `026c542` `e706340` `740ea9a` `ed5fe3f` `45cae12` `0578132` | 完成（P1 关闭） | INTEGRATION 6/6 ×3 稳定 + Mutation 验证 | 真机三连仍缺 |
| **Stage 4.0** | Bridge/Runtime 独立审计 + 最小加固 | 2026-09-15 | `ab60705` `0ea9ec0` `be09364` `71a2096` `7446faa` | **CONDITIONAL-GO**（`main` 的最后一个阶段） | INTEGRATION 6/6（新增 t6 跨实例） | P0=0 P1=0；5 项 P2 记录 |
| **Stage 4.1** | 真实运行时拓扑取证 | 2026-09-15 | `85877be` `4a7d63e` `6dc75e1` `a4b13d5` `fbffa5a` `dd6be30` `d5cc5a2` | **CONDITIONAL-GO** | REAL：真实设计器拓扑 / Canvas 949×577 / 21 对象 / `findCanvasForSide` 成立 / `@require`×5 全 200 | 真实 Bridge 往返 + 真实 Apply 当时仍 UNVERIFIED（RUNTIME-8.3 解锁） |
| **RUNTIME-0** | Playwright harness 可行性审计 | 2026-09-15 | `b49939b` | 完成（只审计） | 无 | — |
| **RUNTIME-1** | 浏览器 harness + 持久 profile + 健康检查 | 2026-09-15 | `0b59b0e` | 完成 | SMOKE：浏览器启动 + 门户可达 | — |
| **RUNTIME-2** | ScriptCat 运行时验证 | 2026-09-15 | `906d092` | 完成 | SMOKE：面板/按钮/可见性 | 当时注入受限，以同源扩展兜底 |
| **RUNTIME-3** | Bridge 运行时验证 | 2026-09-15 | `ea75c6a` | 完成 | INTEGRATION：probe 恰 1 / N-probes / marker | — |
| **RUNTIME-4** | Canvas 运行时验证 | 2026-09-15 | `9c0d939` | 完成 | REAL：discovery + snapshot + introspection | — |
| **RUNTIME-5** | 真实 Canvas 最小修改 + 回滚 | 2026-09-15 | `c423101` | 完成 | REAL：apply + snapshot-diff rollback | — |
| **RUNTIME-6** | attach 模式 + 统一运行器 + 指南 | 2026-09-15 | `882e44d` | 完成 | 现场诊断可用 | — |
| **RUNTIME-7** | 真实登录态编辑器运行 + 统一报告 | 2026-09-15 | `a069af8` `be0340f` `c4786ac` | 完成 | REAL：面板/canvas/apply PASS；发现 **P1 CSP 拦截内联注入** | 图层受 CSP 限制（RUNTIME-8 以 `GM_addElement` 绕过） |
| **RUNTIME-8** | ScriptCat 真实运行时基建 + 注入矩阵 | 2026-09-15~16 | `ec5ee8f` `b98037c` `1f945dc` `7830966` | 完成（CONDITIONAL） | 注入矩阵建立；`GM_addElement` 绕过 CSP | — |
| **RUNTIME-8.1** | ScriptCat 原生安装契约 + 自动安装 | 2026-09-16 | `69a8891` `55a959c` | 完成 | REAL：安装/启用 PASS | 注入当时仍环境受限 |
| **RUNTIME-8.2** | userScripts API 解锁尝试 | 2026-09-16 | `cfa50c2` | **结论已被 8.3 撤回** | 曾判 `INJECTION_BLOCKED`（误判为 Chromium 不支持） | ⚠️ 历史结论撤回，保留记录不删 |
| **RUNTIME-8.3** | 注入闭环收尾（真实 ScriptCat 全链） | 2026-09-16 | `198e29a` `791e4a7` `3a61155` | **PASS** | **REAL**：`npm run runtime:scriptcat` 全链 **18 步 errors=0**；probe 1↔1 / 5↔5；apply→rollback 21→21 | 无 |
| **Stage 5.0** | Editor Object Audit + Object Model | 2026-09-16 | `b5af1c2` `db39ed0` `b7c62de` `46c72aa` `3905a85` `29e0f8b` | **GO** | REAL：21 对象全量快照；`OBJECT_IDENTITY = VERIFIED`（textbox 层） | back 画布不存在；单模板样本；`inheritReferenceProps` 宽复制 |
| **Stage 5.1** | Identity / Geometry Hardening + Creation Safety | 2026-09-16 | `2570eac` `2ea7cf6` `234686b` `fc0eefa` `f301ba3` `5c85d4b` `c5e6fba` `ce76f4e` `b165254` | **GO** | REAL：markuuid 跨 3 会话稳定；修复 P1 `CREATION_IDENTITY_LEAK` 后重跑 SAFE + RUNTIME-8.3 全链回归 | multi-template `PARTIAL`；server-save 未验证；白名单化待 ≥2 模板 |
| **Stage 5.2** | 真实可用编辑流水线 + Object Matcher | 2026-09-16 | `1f24e28` `bc554eb` `28cc691` `e962012` `84ba493` `3339995` | **GO** | REAL：PRODUCT_SMOKE 11 步 PASS；matcher 自匹配 4/4（score 0.807）；偏移 → NOT_FOUND；safe mutation 仅 `[text,height]` | OCR 真实图像→候选未接入；matcher↔legacy 统一待定 |
| **Stage 5.3** | Real Image → OCR → Native Text Reconstruction | 2026-09-16 | `4ad71a0` `94e6336` `0360f29` `0776d2d` `1cafd55` | **GO** | REAL + **FIXTURE_OCR**：synth 600×400 图 → mapper → matcher 4/4 NOT_FOUND（模板保护）→ 创建 4 真 textbox → group/ungroup → 参考图保留 → rollback 21/4 零残留 | **真实 OCR provider 未接入（BLOCKED）**；字号校准 deferred；旋转图无样本 |
| **Stage 5.4** | Native OCR 边界 + 真实图片输入 + 重建精度 | 2026-09-16 | `438effb` `2e51280` `1f3e6d8` `96649cc` `3becf04` | **CONDITIONAL-GO** | REAL + **FIXTURE_OCR**：4 实验深探 → `NATIVE_OCR_RESULT_ACCESS = BLOCKED`；字号校准 `fontSize = 0.829 × visualHeight`，**重建后回读 mean height error 5.03%**；group/rollback 全 PASS | Local OCR 评估未接入 → 5.5；原生图片输入自动化 `PARTIAL`；多行字号反推 deferred |
| **Stage 5.5** | **真实 OCR Provider 接入 + Basic Real OCR Demo** | 2026-09-16 | `1ea948b` `131658e` `0707035` `7ef1aed` `03f2167` `4cb0819` | **GO（Demo 级）** | **REAL**（当前 HEAD）：tesseract.js 本地 provider 实测（chi_sim：18 words / bbox 18/18 / avg-conf 90.4 / 首跑 ~3s / **零上传零 key**）；`BASIC_REAL_OCR_DEMO = PASS` —— 真实 OCR 6 行候选 → mapper(1000×800 natural × 0.45) → matcher（**电话行 MATCHED 复用模板槽**，其余 NOT_FOUND 保护）→ 6 个真 textbox（editable / 思源黑体 Regular / markuuid=null）→ 字号误差 **3.3%** → 参考图保留 → rollback 21/4/3 零残留 | 引擎注入为 `GM_addElement`/side-page（**待真机一键验证**，5.6 前置）；行聚合词序质量 → 5.9；真实用户粘贴 → 待真机；`ocr-provider.js`/`tesseract-loader.js` **未挂接生产** |
| **Stage 5.5A** | **Basic Real OCR Demo 产品化验收**（引擎注入 + 用户闭环） | 2026-09-16 | `13b348a` `7c412b8` | **BLOCKED（产品级）** | REAL：`GM_addElement` 注入动作 **PASS**（主世界 DOM 标记 `data-zy-55a-inj=1`）；**`engine-in-editor = BLOCKED`** —— 三层证据：① 外链 CDN 被 CSP `script-src` 拦截（`performance` 资源为空，未发起）② inline 注入真引擎 30s 无全局 ③ inline + 屏蔽 `window.define`（requirejs AMD 吸收 UMD）20s 仍无 `window.Tesseract`。属 **PRODUCT/BROWSER-ENV** 边界，非 harness 自动化问题 | 引擎装载工程（3 候选）为 **5.6 P1 前置**；编辑器页缓存命中实测顺延；真实用户上传/粘贴 + 双击编辑待人工 |
| **UI-1** | **OCR UI 原生化 · 真实页面 UI / DOM 审计**（不修改生产代码） | 2026-09-17 | （本轮） | **CONDITIONAL-GO → GO**（真机补测后转 GO） | **REAL**（4 viewport 实测 + 真实 `cssRules` 提取）：`.rightPageBar.rightBar` 四视口恒 **190px 宽 / right=0 / top=51 / h=vh−51 / z=20**，无横向滚动；提取原生设计语言（font `Microsoft YaHei` / `12·13.33·14px` / `weight 400`；栅格 `4·5·8·10·20`；primary `#278fcf`；AI 面板族 `.design-ai-panel` 310px/radius8/shadow`rgba(0,0,0,.1) 0 4px 20px`/z100）；**CSS variables 全站仅 1 个（不可依赖）**；发现原生 OCR UI 资产（`dd#clk-ocr`「OCR识别alt+q」、`#logincallOcrCount` 0/100、`#ocrTableCont`「返回 上传表格图片」）与原生「文字识别」入口 `li#textDisNav` | §七 推荐 **方案 B**（原生右栏入口+邻接抽屉）；当前实现偏差清单 + 10 项风险；**UI-RISK-09 已闭环**（真机 ScriptCat v1.4.0 实测面板 246×900 @1004,0 / `z-index:2147483000` / `.zy-head` `#1f6feb` 蓝底）；新增 **UI-RISK-10**（`.zy-head` 浮窗拖拽头遗产，🔴 高）；`OCR_DEPENDENCY_POLICY.md` §7.4 `NATIVE_PANEL` 建议 `PASS → PARTIAL` |
| **UI-2** | **OCR UI 原生化 · 原生入口 + 邻接抽屉实施** | 2026-09-17 | （本轮） | **PASS（30/30）** | **REAL**（真实 ScriptCat v1.4.0 + 真实折立印 + 目标 URL）：面板 `z-index 2147483000→100` / `width 246→311px`（对齐 `.design-ai-panel`）/ `bg ↔ #fdfdfd` / `shadow ↔ rgba(0,0,0,.1) 0 4px 20px`；**面板头蓝底 `#1f6feb` → 白底 + `border-bottom #eaeaea` + `cursor:move→default`**（UI-RISK-10 关闭）；入口 `BUTTON→LI` / `52→33px` / 蓝底 → 白底 / `18px/700/Arial` → `12px/400/原生字体链` / 单字「识」→「图片文字识别」+ `diyicon icon-discern`；抽屉 toggle `none→flex→none` 双向；布局 `overlap=false` / 入口 `contained=true` / 无横向滚动 | 改动 **+199 / −13 / 3 hunks**（1555 行中 1225 行逐行未动 = 79%）；**OCR 技术链未改动**（14 关键字仅 `handleOcrImage` 命中 1 次，为 UI 事件绑定行）；功能回归 8/8（含 **early-click 不崩**、零页面错误）；关闭 UI-RISK-01/09/10；UI-RISK-02/03/04/06 留 UI-3/UI-4 |

---

## 2. 阶段编号的两套体系（必须说明，不要混淆）

仓库同时存在两套编号，**不是错误，但极易误读**：

| 体系 | 出处 | 状态 |
|---|---|---|
| **R0 / R1–R5** | `REFACTOR_PLAN.md`（R0 产物，**计划**） | R0 已执行；**R1–R5 从未以该编号执行** |
| **Stage 1 / 2 / 3 / …** | 实际执行时采用的编号 | 全部已执行 |

实际发生的事：`REFACTOR_PLAN.md` 定义了 R1–R5 的渐进式迁移路线；实际执行改用 `Stage N` 编号，且顺序与 R 计划不完全对应。

对应关系（**推断性对齐，仅供理解，不代表计划被执行**）：

| 计划 | 实际落地 | 说明 |
|---|---|---|
| R1（AI 错误分类 + 脱敏日志 + Key 掩码） | 部分并入 **Stage 2** | `ai-client.js` 结构化错误模型落地；Key 掩码 UI **未做** |
| R2（core/config/fields/ai 拆模块） | **Stage 1 + Stage 2** | `field-core` / `config-core` / `ai-client` 落地；`src/core/utils.js` **未做** |
| R3（bridgeClient / adapter / coordinate） | 部分并入 **Stage 3**，其余进入 **Stage 5** | `page-bridge.js` 提取完成；`bridgeClient`（requestId）**未做**；`adapter` 以 `object-adapter.js` 落地（Stage 5.0）；`coordinate` 以 `image-mapper.js` 落地（Stage 5.3） |
| R4（runId / TextObject / 标签增强） | **未执行** | `ARCH-RISK-001` 仍开放 |
| R5（图片 OCR） | 演化为 **Stage 5.0–5.5** | 范围更聚焦：先对象模型/identity/geometry，再 matcher，再重建，最后接入真实 OCR provider（5.5） |

> 治理结论：**不重命名历史**。R1–R5 保留为"计划文档"，实际执行以 Stage 编号为准；两者映射关系记在本节，避免后人误以为 R1–R5 是已完成阶段。

---

## 3. Tag 现状（**未新增、未重打**）

| tag | commit | 日期 |
|---|---|---|
| `v0.3.0` | `d03e014` | 2026-09-10 |
| `r0-audit` | `4549201` | 2026-09-15 |
| `stage-1-baseline` | `4549201` | 2026-09-15 |
| `stage-1-complete` | `e86752f` | 2026-09-15 |
| `stage-2-baseline` | `e86752f` | 2026-09-15 |
| `stage-2-complete` | `eba5486` | 2026-09-15 |
| `stage-3-baseline` | `eba5486` | 2026-09-15 |
| `stage-3-complete` | `01f7bd6` | 2026-09-15 |
| `stage-3.1-complete` | `4fac975` | 2026-09-15 |

**缺失的 tag（记录，不补打）**：Stage 3.2、4.0、4.1、RUNTIME-0~8.3、Stage 5.0~5.4 均无 tag。

> 规则（见 `docs/DEVELOPMENT_RULES.md`）：**不追溯补打历史 tag**。若将来需要 tag，从当前 HEAD 向前为**新**阶段打，而不是给历史补签。

---

## 4. 阶段之间的 Gate 演化

```text
R0            GO（纯文档）
Stage 1–3     完成（UNIT/INTEGRATION PASS，真机 UNVERIFIED）
Stage 3.1     PASS WITH TECHNICAL DEBT
Stage 3.2     P1 关闭
Stage 4.0     CONDITIONAL-GO   ← main 的终点
Stage 4.1     CONDITIONAL-GO   ← 真实拓扑已取证，真实往返未取证
RUNTIME-8.3   REAL PASS        ← 真实往返 + 真实 Apply 解锁
Stage 5.0     GO
Stage 5.1     GO
Stage 5.2     GO
Stage 5.3     GO（含 FIXTURE_OCR 条款）
Stage 5.4     CONDITIONAL-GO
Stage 5.5     GO（Demo 级）    ← 真实 OCR 接入，BASIC_REAL_OCR_DEMO = PASS
Stage 5.5A    BLOCKED          （产品化验收：引擎在编辑器页运行环境不可达）
Stage 5.5A-R2 PASS             ← 当前 HEAD（page-world executor 突破：引擎装载成功）
UI-1          CONDITIONAL-GO → GO  ← OCR UI 原生化审计；真机补测后转 GO
UI-2          PASS              ← 原生入口 + 邻接抽屉实施（30/30；真机 ScriptCat 实测）
```

> 注意 `Stage 5.3 = GO` 与 `Stage 5.4 = CONDITIONAL-GO` 不矛盾：5.4 因为**深探后确认原生 OCR 不可程序读取**，按 `docs/EVIDENCE_POLICY.md` §3 如实降级为 CONDITIONAL-GO —— 这是**诚实结论**，不是退步。
>
> 同理 `Stage 5.5 = GO`（Demo 级）与 `Stage 5.5A = BLOCKED`（产品级）也不矛盾，是两个不同命题：
> 5.5 回答「OCR 引擎 + 重建链能否跑通」→ 能；5.5A 回答「用户在 ScriptCat + 真实编辑器里能否真的用上」→ 暂时不能（引擎加载被产品环境挡住）。
> 这正是一次**避免用 Demo 级 PASS 冒充产品级可用**的合格实践。

---

## 5. 当前所在位置

| 项 | 值 |
|---|---|
| 分支 | `stage-4.1-runtime-validation` |
| HEAD | `e9235af`（Stage 5.5A-R2 editor-executor，**engine-in-editor 突破为 PASS**） |
| 下一步 | **Stage 5.6 的 P1 前置已由 5.5A-R2 完成**（采用「page-world executor + UMD module/exports 遮蔽 + `new Function`」路线）；后续为 5.6 字号精确与识别质量提升 |
| 后续已定序路线 | 5.6 字号精确 → 5.7 颜色/粗细 → 5.8 旋转 → 5.9 多行/段落（行内词序/列） → 5.10 复杂布局 → 5.11 智能匹配 → 5.12 编组 → 5.13 Undo → 5.14 Preview |
| 停止点约定 | Stage 5.5A-R2：引擎装载突破后**仍在 demo 范围内**（未进入颜色/粗细/旋转/多行/编组/预览）；后续 5.6 起推进字号精确与识别质量 |

---

## 6. 维护规则

1. 本文件**不改写历史**。发现的错误结论（如 RUNTIME-8.2）保留原文，仅以「已撤回」标注。
2. 新增阶段时追加行，并在 §4 尾部延续 Gate 演化链。
3. 每行「真实验证情况」列必须使用 `docs/EVIDENCE_POLICY.md` 的标准等级。
4. 若 commit 与阶段对应关系有歧义，写「主要 commit」并注明可能遗漏，禁止编造。
