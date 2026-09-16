# TEST_MATRIX — 测试矩阵

> 维护者：AI-2（Repository Governance 线）
> 基线：`stage-4.1-runtime-validation` @ `3becf04`（2026-09-16）
> 术语见 `docs/EVIDENCE_POLICY.md`
> **本次治理未移动任何现有测试文件。** 现有 `tests/` 布局保持原样（见 §6 关于目录结构的说明）。

---

## 1. 复跑结论（治理线独立复现，2026-09-16）

以下 7 个套件由治理线在本机**独立复跑**，用于确认 `stage-4.1` HEAD 的测试基线仍然成立：

| 套件 | 层 | 断言/用例 | 结果 | 复现命令 |
|---|---|---|---|---|
| `tests/editor-object-model/`（6 文件） | UNIT | **110** | **ALL PASS** | `node tests/editor-object-model/run.js` |
| `tests/field-core.test.js` | UNIT | **43** | **ALL PASS** | headless 打开 `tests/run-tests.html` |
| `tests/config-core.test.js` | UNIT | **15** | **ALL PASS** | 同上 |
| `tests/ai.test.js` | UNIT+INTEGRATION | **18** | **ALL PASS** | headless 打开 `tests/ai-tests.html?zydebug=1` |
| `tests/editor-bridge.test.js` | INTEGRATION | **18** | **ALL PASS** | headless 打开 `tests/editor-tests.html` |
| `tests/bridge-lifecycle.test.js` | INTEGRATION | **6** | **ALL PASS** | headless 打开 `tests/bridge-lifecycle.html?zydebug=1` |
| `extension/wiring-check.html` | INTEGRATION | **5** | **wired-ok** | headless 打开该页 |
| **合计** | | **215** | **全部通过** | |

复跑环境：Windows / Git Bash / Node v22.22.2 / Google Chrome `--headless=new --dump-dom --allow-file-access-from-files`。

> `bridge-lifecycle` 复跑时 LC 计数为 `{c1:1, c2:1, c3a:1, c3b:1, c3c:1, ca:1, before:1, after:1, c6:1}` —— **全部为 1**，即注入幂等性（`AUDIT-BRIDGE-001/002` 的修复）在当前 HEAD 上仍然成立。

**未复跑**：`npm run runtime:scriptcat`（需真实 ScriptCat + 已登录 profile）。该项的上次结果为 `errors=0` 全链 PASS（`runtime/reports/runtime8-full-chain-report.json`，2026-09-16）。

---

## 2. 能力 × 证据等级矩阵（**主表**）

| 能力 | UNIT | FIXTURE | SYNTHETIC | INTEGRATION | REAL | 备注 |
|---|---|---|---|---|---|---|
| **Runtime bridge（注入/幂等/生命周期）** | — | — | — | ✅ 6/6 + 5/5 | ✅ `REAL_SCRIPT_CAT_BRIDGE` | 真实 ScriptCat 注入生产 `page-bridge.js`（sha256 校验），probe 1↔1 / 5↔5 |
| **Object identity** | ✅ 35 断言（`object-model`） | ✅ `editor-object-textbox.json` | — | — | ✅ 跨 3 会话矩阵 | `markuuid` 稳定；`uuid` 会话级 12/12 互异 |
| **Object matcher** | ✅ 22 断言 | ✅ `editor-objects-52.json` | — | — | ✅ 自匹配 4/4（score 0.807）+ 偏移 → NOT_FOUND | 阈值 `MATCH_TH=0.45` / `MARGIN=0.08` |
| **Object diff / rollback 基建** | ✅ 12 断言 | — | — | — | ✅ 真实 mutation diff | 白名单 + 数值容差 + 类型安全 |
| **Object adapter** | ✅ 18 断言 | ✅ | — | — | ✅ `zyGetVisualBounds` 真实取 AABB | `line`/`group-child` 语义已测 |
| **Image mapper** | ✅ 10 断言 | — | — | — | ⚠️ 仅在 Stage 5.3 链中被调用 | scale 0.5/1/2 + rot45 AABB + 归一化往返 |
| **OCR candidate** | ✅ 13 断言 | ✅ `ocr/redacted-card-01.json` | ✅ `ocr/test-card.png` | — | ❌ **BLOCKED**（原生 OCR 不可程序读取） | `isUsable` 过滤空白/非法 bbox |
| **Textbox creation** | — | ✅ | ✅ | — | ✅ **真实编辑器 4/4** | `type=textbox` / `editable` / `markuuid=null` |
| **Font / fontSize** | — | — | — | — | ✅ 真实测量 12–72 + 重建回读 5.03% 误差 | 校准公式 `0.829 × visualHeight`（short 单行） |
| **Group / ungroup** | — | ✅ | — | — | ✅ `fabric.Group` 原生编组/解组 | — |
| **Reference image 保留** | — | — | ✅ | — | ✅ `images=4` | — |
| **Rollback（零残留）** | — | — | — | — | ✅ 21→21 / 4 原文本 / 3 图 | 创建清理 + reload |
| **Creation safety** | ✅ | — | — | — | ✅ 修复后 SAFE（重跑） | P1 `CREATION_IDENTITY_LEAK` 已修 |
| **Real webpage（页面/画布拓扑）** | — | — | — | — | ✅ top window / requirejs 138 模块 / canvas 949×577 / 21 对象 | 无 iframe 干扰（`mattingContent` 为空壳） |
| **Product flow（legacy 用户路径）** | — | — | — | — | ✅ PRODUCT_SMOKE 11 步 + REAL_PRODUCT_FLOW | 面板 → 粘贴 → 识别 → apply → reload |
| **Multi-template** | — | — | — | — | ⚠️ **PARTIAL**（仅 1 个可达模板） | 差异型标 `UNKNOWN` |

---

## 3. 测试层级定义在本仓库的落地方式

| 层 | 本仓库执行方式 | 是否需网络 | 是否需登录 |
|---|---|---|---|
| **UNIT** | Node 直跑（`run.js`）或 headless 浏览器打开 `tests/*.html` | 否 | 否 |
| **INTEGRATION** | headless 浏览器 + canvas mock（`editor-tests.html` / `bridge-lifecycle.html` / `wiring-check.html`） | 否 | 否 |
| **SMOKE** | `npm run runtime:check` / `node runtime/full.js` | 是 | 否 |
| **REAL** | `npm run runtime:scriptcat` / `node runtime/stage5-*.js` | 是 | **是**（持久 profile） |

> 三层递进关系：UNIT 保证模块正确 → INTEGRATION 保证边界正确 → REAL 保证在真实站点成立。
> **UNIT/INTEGRATION PASS 不构成 REAL PASS**（`docs/EVIDENCE_POLICY.md` §0）。

---

## 4. 夹具清单（`tests/fixtures/`）

| 文件 | 类型 | 用途 | 脱敏状态 |
|---|---|---|---|
| `basic-card.txt` | SYNTHETIC 文本 | 纯中文普通名片 | ✅ 合成公开示例 |
| `english-company.txt` | SYNTHETIC 文本 | 中英双语公司名 | ✅ |
| `front-back.txt` | SYNTHETIC 文本 | 显式正/反面分段 | ✅ |
| `mixed-language.txt` | SYNTHETIC 文本 | 微信+邮箱+网址+英文地址 | ✅ |
| `multi-address.txt` | SYNTHETIC 文本 | 多地址 | ✅ |
| `multi-phone.txt` | SYNTHETIC 文本 | 多电话 | ✅ |
| `editor-object-textbox.json` | FIXTURE（真实派生） | 真实 textbox 对象（文本已 REDACTED） | ✅ 文本脱敏，保留 hash/len |
| `editor-objects-52.json` | FIXTURE | matcher 用例对象集 | ✅ |
| `ocr/redacted-card-01.json` | FIXTURE | 对应真实 Canvas 4 个 textbox 的候选结构 | ✅ `text: [REDACTED_*]` |
| `ocr/test-card.png` | SYNTHETIC 图片 | 600×400 合成名片图（4 行文字） | ✅ 程序绘制 |

**规则**：任何真实数据进入 `tests/fixtures/` 前必须脱敏；脱敏方式为 **替换文本 + 保留 `textLen`/`textHash8`**（保留结构可比性，不保留内容）。

---

## 5. 覆盖缺口（明确记录，不回避）

| ID | 缺口 | 影响 | 状态 |
|---|---|---|---|
| **TGAP-1** | 无自动化 REAL 测试入口 | 真实站点回归需人工/需 profile，无法进 CI | 已知（`RUNTIME_HARNESS_AUDIT.md`） |
| **TGAP-2** | 真实旋转**文字**对象无样本 | 旋转文字重建未验证 | `DEFERRED` |
| **TGAP-3** | 多行文本字号未覆盖 | 多行字号不准 | `DEFERRED` |
| **TGAP-4** | 真实 OCR 无任何自动化用例 | OCR 源仍为 fixture | 待 Stage 5.5 |
| **TGAP-5** | 真实「粘贴/拖拽图片」无法在 harness 复现 | native image input 只得 `PARTIAL` | 已知；真机优先 |
| **TGAP-6** | 单纯例模板 → 模板差异未覆盖 | identity 策略可能不通用 | `PARTIAL` |
| **TGAP-7** | legacy `parseFields` 上帝函数无单测（7 种外部依赖耦合） | 回归靠 INTEGRATION 兜 | 已知（`ARCHITECTURE_AUDIT.md` §4.1） |
| **TGAP-8** | 无 `runId` / 无事务级撤销测试 | 无法测"整体撤销" | `GAP-3/4`（见契约文档） |
| **TGAP-9** | 无 CI 自动跑测试 | `.github/workflows` 只构建 exe，不跑测试 | **建议补齐**（见 §7） |

---

## 6. 关于测试目录结构（**不做大规模搬迁**）

外部治理指令建议建立：

```text
tests/
    unit/
    integration/
    smoke/
    fixtures/
```

**本仓库真实结构**：

```text
tests/
    *.test.js                 ← 根级：field-core / config-core / ai / editor-bridge / bridge-lifecycle
    *.html                    ← 对应的浏览器 runner
    editor-object-model/      ← 独立子目录：6 个 Node 套件 + run.js
    fixtures/                 ← 已存在
    fixtures/ocr/             ← 已存在
    TEST_REPORT.md
```

**处置：暂不搬迁。** 理由：

1. 搬迁会改动 6 个套件 + 4 个 runner 的相互引用路径，属"大规模移动代码"，违反最小改动原则；
2. 搬迁会让历史报告（`TEST_REPORT.md`、各 Stage 报告）里的路径**全部失效**，反而降低可追溯性；
3. 现有结构已有内在规律（根级 = headless 浏览器套件；`editor-object-model/` = Node 套件；`fixtures/` = 夹具），**并不混乱**。

**替代方案（低成本、零搬迁）**：本文件 §1/§2 的表格即为"单元/集成/冒烟/真实"的**逻辑分类**。若将来确需物理分目录，必须**单独一个阶段**执行，并同步更新全部历史文档的路径引用。

---

## 7. 建议（不实施，交决策）

按收益排序，均**不是本次治理范围**：

| 优先级 | 建议 | 收益 |
|---|---|---|
| 高 | 在 `.github/workflows/` 增加一个 job，跑 `node tests/editor-object-model/run.js` | 让 110 个断言进 CI，零依赖（无浏览器/无网络） |
| 中 | 给 headless 浏览器套件补一个 CI job（Chrome 预装于 runner） | 覆盖 43+15+18+18+6+5 |
| 中 | `package.json` 增加 `test` script 指向 `run.js` | 降低门槛 |
| 低 | 把 REAL 套件的执行前置条件写成 checklist | 降低人工回归遗漏 |

---

## 8. 维护规则

1. 新增测试**不要**移动现有测试文件。
2. 每个新增套件必须登记到本文件 §1（含断言数与复现命令）。
3. 断言数变化时更新 §1；结果由 PASS 变 FAIL 时**不得**只改数字，必须记录失败原因与处置。
4. `tests/` 下的夹具必须脱敏；新增真实派生夹具必须注明脱敏方式。
5. 本文件不修改任何测试代码。
