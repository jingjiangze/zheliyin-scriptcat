# CURRENT_STATUS — 当前状态总览

> 维护者：AI-2（Repository Governance 线）
> 基线：分支 `stage-4.1-runtime-validation` @ `7c412b8`（Stage 5.5A，2026-09-16）
> 修订：@ `3becf04`（5.4）初版；@ `4cb0819`（5.5）同步真实 OCR；@ `7c412b8`（5.5A）同步产品化验收结论；
> @ `e9235af` / demo `58337a8`（5.5A-R2）**同步引擎装载突破：`engine-in-editor` BLOCKED → PASS**；
> 本页同时覆盖 **四轨状态**（main / demo / AI-1 开发 / 治理），分支明细见 §4。
> **本页只陈述已有证据支持的状态。没有证据的一律写 `TODO`，不预判。**
> 状态取值：`PASS` / `PARTIAL` / `BLOCKED` / `TODO` / `DEFERRED` / `UNVERIFIED`
> 等级取值见 `docs/EVIDENCE_POLICY.md`

---

## 1. 能力状态一览（主表）

| 功能 | 状态 | 证据等级 | 证据出处 | 说明 |
|---|---|---|---|---|
| ScriptCat injection | **PASS** | REAL | `runtime/reports/runtime8-full-chain-report.json` | 真实 ScriptCat 扩展 + 真实编辑器，全链 18 步 `errors=0` |
| page bridge | **PASS** | REAL | `runtime/reports/verify-gm-bridge-report.json` | `GM_addElement` 注入生产 `page-bridge.js`（sha256 校验，未复制第二份），probe 1↔1 / 5↔5，跨实例重复 ×3 仍恰 1 |
| editor object audit | **PASS** | REAL | `runtime/reports/stage5-object-snapshot.json` `stage5-object-audit.json` | 21 对象 / 6 类型全量属性；`OBJECT_IDENTITY = VERIFIED`（textbox 层） |
| object matcher | **PASS** | UNIT + REAL | `runtime/reports/stage5-matcher.json` | 单测 22 断言；真实编辑器自匹配 4/4（score 0.807）；偏移 +180px → NOT_FOUND |
| image mapper | **PASS** | UNIT | `tests/editor-object-model/image-mapper.test.js` | scale 0.5/1/2 + rot45 AABB + 归一化往返 + 非法输入，10 断言 |
| fixture reconstruction | **PASS** | **FIXTURE** | `runtime/reports/stage5-3-reconstruction.json` `stage5-4-product-flow.json` | **输入为 FIXTURE_OCR**（bbox 来自合成图已知绘制坐标）；链路本身在真实编辑器执行 |
| native OCR access | **BLOCKED** | REAL（探测结论） | `runtime/reports/stage5-3-native-ocr*.json` `stage5-4-native-ocr.json` | 原生「文字识别(Alt+Q)」面板存在，但绑定"相框"素材交互；Stage 5.4 四种深度 hook 实验后：无网络请求、无 postMessage、canvas 无变化、结果值不进 DOM |
| **real OCR（provider）** | **PASS** | REAL | `runtime/reports/stage5-5-ocr-feasibility.json` `stage5-5-real-ocr-demo.json` | **本地 tesseract.js 已接入并实测**：chi_sim，18 words / bbox 18/18 / avg-conf **90.4** / 首跑 ~3s / **零上传、零 key、全本地 WASM**。原生路径仍 BLOCKED，本地路径为已选定替代 |
| **real OCR → 重建（demo 级）** | **PASS** | REAL | `runtime/reports/stage5-5-final-gate.json` | `BASIC_REAL_OCR_DEMO = PASS`：真实 OCR 6 行候选 → mapper(1000×800 natural × 0.45) → matcher（**电话行 MATCHED 复用模板槽**，其余 NOT_FOUND 保护）→ 6 个真 textbox → 字号误差 **3.3%** → 参考图保留 → rollback 21/4/3 零残留，`errors=0` |
| **OCR 引擎在编辑器页可达（产品化关键）** | ✅ **PASS（5.5A-R2 突破，原 BLOCKED）** | REAL | `runtime/reports/stage5-5a-executor-report.json` | **原 `BLOCKED` 已被解决**：改用 **page-world OCR executor**（UMD `module`/`exports` 遮蔽 + `new Function` + `sourceMappingURL` 换行修复），15 步全 PASS、`errors: []`。首次 2969ms → 跨会话 **667/674ms**（IndexedDB 缓存生效）。`executor-umd-load` / `ocr-first` / `ocr-cached` 全部 PASS |
| **Demo 图片识别入口（用户可用）** | ✅ **PASS** | REAL | demo `58337a8` `runtime/reports/stage5-5a-executor-report.json` | Demo 版新增**「识别图片文字」按钮** + page-world executor + `ocrCreate` 桥（`page-bridge.js` +19 行）。链路：选中图片 → 识别 → mapper → matcher（3 候选全 `NOT_FOUND` → 保护性创建）→ **3 个真 textbox**（editable / 思源黑体 Regular / `markuuid=null`）→ 参考图保留 → rollback 21/4/3 |
| **识别质量（真实编辑器样本）** | ⚠️ **PARTIAL** | REAL | 同上 | 机制 PASS，但样本识别文本为 `个 时` / `如` / `NU`（3 行、词序乱）→ 属**已知质量项**，排入 Stage 5.9 多行/段落。**不要把「机制跑通」当成「识别准确」** |
| real image input | **PARTIAL** | REAL / SYNTHETIC | `runtime/reports/stage5-3-image-transform.json` `stage5-4-real-image-input.json` | **真机**粘贴/拖拽可用；**harness 自动化**三种注入（ClipboardEvent / CDP+Ctrl+V / setInputFiles）均不被受理 → 记录为 automation limitation；另有 Stage 5.5 注记：编辑器页 CDN script 注入被环境静默拦截 → 生产改走 `GM_addElement`（机制已证，**待真机一键验证**） |
| real editable textbox | **PASS** | REAL | `stage5-3-reconstruction.json` `stage5-4-product-flow.json` | 真实编辑器内创建 `type=textbox` / `editable=true` / `markuuid=null`（identity clean），4/4 |
| grouping | **PASS** | REAL | `runtime/reports/stage5-3-grouping.json` | `fabric.Group` 原生编组 → destroy 解组 → 成员独立 |
| rollback | **PASS** | REAL | `stage5-4-product-flow.json` `stage5-object-mutation.json` | 创建后清理 + reload → 21 对象 / 4 原文本 / 3 图，零残留；`setText` mutation diff 仅 `[text,height]`，restore 后 diff `[]` |
| product flow | **PASS** | REAL | `runtime/reports/stage5-product-smoke.json` `stage5-4-product-flow.json` | Stage 5.2 PRODUCT_SMOKE 11 步（用户 UI 路径）；Stage 5.4 REAL_PRODUCT_FLOW 全链 `errors=0` |
| font / fontSize | **PASS** | REAL | `runtime/reports/stage5-4-font-calibration.json` | 「思源黑体 Regular」实测存在于网页字体面板；校准公式 `fontSize = 0.829 × visualHeight`（short 单行），重建回读 **mean height error = 5.03%** |
| creation safety | **PASS** | REAL | `runtime/reports/stage5-creation-safety.json` | Stage 5.1 修复 P1 `CREATION_IDENTITY_LEAK`（`f301ba3`）后重跑 SAFE，零共享结构引用 |
| object identity | **PASS** | REAL | `runtime/reports/stage5-identity-matrix.json` | `markuuid` 跨 3 会话稳定（textbox 4/4 唯一）；`uuid` 会话级（12/12 互异） |
| reference image safety | **PASS** | REAL | `stage5-3-reconstruction.json` | 识别流程内保留原图（`images=4`） |
| legacy product chain | **PASS** | REAL | `stage5-product-smoke.json` | 面板 → 粘贴 → 识别 → apply 4 个 textbox → reload 恢复，无助手报错 |
| multi-template | **PARTIAL** | REAL（单样本） | `runtime/reports/stage5-multi-template.json` | 当前账号仅 1 个可达模板；差异型显式标 `UNKNOWN`，未推广 |
| real rotated text reconstruction | **TODO** | — | `stage5-1-final-gate.json` | 模板内无安全的旋转**文字**样本（有旋转 path 样本）→ `DEFERRED` |
| server-save persistence | **TODO** | — | — | 只验证了 reload stability，未验证服务端保存 → `DEFERRED` |
| full card reconstruction / SVG 矢量化 | **DEFERRED** | — | `docs/STAGE_5_4_OCR_ADAPTER_AUDIT.md` §9 | 明确停止点，未启动 |

---

## 2. 一个关键区分：**「验证通过」≠「已上生产」**

这是本仓库最容易误读的地方，单独列出。

| 模块 | 有单测 | 被 Stage 5 链使用 | **生产路径是否调用** |
|---|---|---|---|
| `extension/src/fields/field-core.js` | ✅ | — | ✅ **是**（`@require`） |
| `extension/src/core/config-core.js` | ✅ | — | ✅ **是** |
| `extension/src/ai/ai-client.js` | ✅ | — | ✅ **是** |
| `extension/src/editor/page-bridge.js` | ✅ | ✅ | ✅ **是** |
| `extension/src/editor/object-model.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/editor/object-adapter.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/editor/object-matcher.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/ocr-model.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/ocr-provider.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/tesseract-loader.js` | ✅ | ✅ | ❌ 否（**未挂接**） |
| `extension/src/ocr/image-mapper.js` | ✅ | ✅ | ❌ 否（**未挂接**） |

> **含义**：Stage 5.x 的对象/OCR 能力**目前只存在于审计链（`runtime/stage5-*.js`）中**。用户在浏览器里正常使用助手时，走的是 legacy 产品链，**不会触发** OCR / matcher / mapper。
> 因此各阶段报告统一声明的「**零行为变更**」是成立的 —— 也正因如此，**不能把 Stage 5.x 的 PASS 理解为"产品已具备 OCR 能力"**。

---

## 3. Gate 现状

```text
分支:        stage-4.1-runtime-validation @ 7c412b8
最后阶段:    Stage 5.5A (Basic Real OCR Demo - Productization)
Gate:        BLOCKED（产品化未达成：引擎在编辑器页运行环境不可达）
说明:        Demo 级 GO（5.5）≠ 产品级可用（5.5A）。两者是不同命题，不可互相替代。
P0:          0
P1:          0（Stage 5.1 的 CREATION_IDENTITY_LEAK 已修复并回归）
下一阶段:    Stage 5.6（字号精确）—— 前置：GM_addElement 引擎注入真机验证
已定序路线:  5.6 字号精确 → 5.7 颜色/粗细 → 5.8 旋转 → 5.9 多行/段落 → 5.10 复杂布局
             → 5.11 智能匹配 → 5.12 编组 → 5.13 Undo → 5.14 Preview
```

**Demo 现状**（`demo` @ `ceedbb5`，版本 `0.3.0.1`）：

```text
USER_INSTALLABLE    = PASS（自动可验部分；人工安装动作 PENDING）
USER_UPDATEABLE     = PASS（8 处 URL 均已指向 demo）
REAL_FEATURE_USABLE = 部分（套版填层可用；图片识别 BLOCKED）
```
> 详见 `docs/DEMO_RELEASE.md`（发布清单）与 `docs/DEMO_INSTALL.md`（安装与验收）。

**Stage 5.5A 产品化验收结论**（按 `docs/EVIDENCE_POLICY.md` §3 如实登记）：

```text
REAL_SCRIPT_INJECTION (GM_addElement 注入动作)  = PASS
REAL_OCR (引擎识别能力, side-page)              = PASS
engine-in-editor (window.Tesseract 编辑器页可达) = BLOCKED（PRODUCT env）
REAL_USER_IMAGE_INPUT                           = 待真机（PLAYWRIGHT_PASTE=BLOCKED）
BASIC_REAL_OCR_DEMO_PRODUCT                     = BLOCKED
```

> **一句话**：OCR 引擎与重建链都已验证可用，但引擎**无法在编辑器页的运行环境里加载**（CSP + requirejs AMD），因此**用户在浏览器内暂时用不上**。
> 这是 `PRODUCT/BROWSER-ENV` 边界，**不是** harness 自动化问题。装载工程列为 **Stage 5.6 的 P1 前置**。

**遗留条件项**：

| 条件 | 状态 | 目标 |
|---|---|---|
| 引擎注入为 `GM_addElement` / side-page（非页面内直接注入） | 机制已证，**待真机一键验证** | Stage 5.6 前置 |
| 行聚合词序质量（tesseract 原生 lines 已优先，词序仍为已知弱项） | 已记录 | Stage 5.9 多行/段落 |
| 真实用户在网页内粘贴图片 | 待真机验证 | — |
| `ocr-provider.js` / `tesseract-loader.js` 未挂接生产 | 与 5.0–5.4 同 | 产品化阶段 |
| multi-template 证据 | `PARTIAL`（单模板） | 待样本 |

---

## 4. 分支状态表（**实时读取，勿凭记忆**）

| Branch | HEAD | Purpose | Installable | Stable |
|---|---|---|---|---|
| `main` | `7446faa` | 稳定公开版（默认分支） | ✅ Yes | ✅ **Yes** |
| `demo` | `58337a8` | 真实用户试用（实验性） | ✅ Yes | ❌ No（实验版） |
| `stage-4.1-runtime-validation` | `e9235af` | AI-1 持续开发 | ❌ No（未配元数据，`@require` 指 main） | ❌ No |
| `ai2-repo-governance` | 见 `git rev-parse origin/ai2-repo-governance` | 文档 / 规范 / 契约 | — （非交付物） | — |

**Demo 固定安装地址**（装一次即可，URL 永不变）：

```text
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
```

**版本对照**：

| 轨道 | `@version` | 说明 |
|---|---|---|
| `main` | `0.3.0.0` | 稳定线 |
| `demo` | `0.3.5.0` | AI-1 采用 0.3.x 递增（见 BRANCH_POLICY §4）；⚠️ **与脚本内 `VERSION` 不一致 → 见 §3 已知缺陷** |

**四分支血缘与祖先关系**：

```text
main 7446faa  ⊂  stage-4.1-runtime-validation e9235af  ⊂  demo 58337a8
   (85c/44f)              (152c/189f)                       (155c/190f)
                                     ↑
                        ai2-repo-governance e14b48c（文档线，基线 3becf04，不含 Stage 5.5/5.5A/R2 文件）
```

> ⚠️ **GitHub 默认展示的是 `main`**，它**不包含**任何 Stage 5.x / RUNTIME-8.x / OCR / object-model 代码（落后 66 commit，可快进）。
> 只从默认分支阅读本仓库会得到「只有 Stage 4.0」的错误印象 —— 这是当前最大的信息结构风险。
> 处置方案见 `docs/PARALLEL_DEVELOPMENT.md` §5（**AI-2 不擅自执行合并**）。

> ⚠️ **AI-1 开发分支不是可直接安装的交付物**：其 userscript 的 8 处 URL 仍指向 `main`，
> 直接安装会加载 `main` 的 `page-bridge.js`（**不含 Stage 5.1 P1 identity 修复**）。
> 需要试用最新实现请装 `demo`（已在 `0fa8303` 修正全部 URL 并实测验证）。

**复现命令**：

```bash
git fetch --all --prune
for b in main demo stage-4.1-runtime-validation ai2-repo-governance; do
  printf "%-32s %s  commits=%-4s files=%s\n" "$b" \
    "$(git rev-parse --short origin/$b)" "$(git rev-list --count origin/$b)" \
    "$(git ls-tree -r --name-only origin/$b | wc -l)"
done
```


## 5. 测试现状速览

| 层 | 套件 | 结果 | 执行方式 |
|---|---|---|---|
| UNIT | `tests/editor-object-model/` 8 套件 | **132 断言 ALL PASS**（2026-09-16 由治理线复跑确认） | `node tests/editor-object-model/run.js` |
| UNIT | `field-core` 43 / `config-core` 15 / `ai` 18 / `editor-bridge` 18 | PASS（2026-09-16 治理线复跑确认） | headless 浏览器 |
| INTEGRATION | `bridge-lifecycle` 6/6；`wiring-check` 5/5 | PASS（2026-09-16 治理线复跑确认） | headless 浏览器 |
| REAL | `npm run runtime:scriptcat` 全链 18 步 | PASS，`errors=0`（历史报告，治理线未复跑） | Playwright + 真实 ScriptCat |
| REAL | Stage 5.5 `BASIC_REAL_OCR_DEMO` | PASS，`errors=0`（历史报告，治理线未复跑） | Playwright + 真实编辑器 + tesseract |
| REAL | Stage 5.5A `engine-in-editor` | **BLOCKED**（产品环境 CSP + requirejs AMD；历史报告） | Playwright + 真实 ScriptCat |

明细与复现命令见 `docs/TEST_MATRIX.md`。

---

## 6. 维护规则

1. 本页**只写有证据的状态**。无证据 → `TODO`；有堵点 → `BLOCKED`；已登记推迟 → `DEFERRED`。
2. 每个 `PASS` 必须给出**证据等级**与**证据文件路径**。
3. 不得为让本表好看而改写 `BLOCKED` / `PARTIAL`。
4. 生产挂接状态变化时（§2 表），必须同步更新本页与 `README.md` 的 Current Status。
5. 更新本页不修改任何实现代码。
6. **§4 分支状态表必须从 Git 实时读取**：`git fetch --all --prune` 后按该节复现命令取数，禁止凭记忆填写。
7. `docs/CURRENT_STATUS.md` 是本仓库**唯一**的总状态页。禁止创建 `CURRENT_STATUS_2.md` / `_NEW` / `_FINAL` 等变体。
