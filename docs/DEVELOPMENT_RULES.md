# DEVELOPMENT_RULES — 开发规则

> 维护者：AI-2（Repository Governance 线）
> 基线：`stage-4.1-runtime-validation` @ `7c412b8`（Stage 5.5A）
> 性质：**规范**。可由任何一条线（AI-1 / AI-2 / 人类维护者）引用，用于自我约束与互审。
> 本文件不追溯改写历史 commit。

---

## 1. 十条规定（红线）

| # | 规则 | 说明 |
|---|---|---|
| 1 | **先审计，再动手** | 任何修改前先取证：真实代码 / 真实运行结果 / 真实 Git 历史。禁止凭 Fabric 文档或猜测臆造对象类型、属性、行为 |
| 2 | **小步提交** | 一个逻辑任务 = 一个 commit。`docs:` `test:` `refactor:` `fix:` `feat:` `chore:` 前缀 + 具体模块名 |
| 3 | **独立 commit** | 禁止把 R0/Stage1/Stage2 混提；禁止把 docs 与 refactor 混提 |
| 4 | **立即 push** | 每完成一个逻辑任务即 push，避免本地堆积造成协调冲突 |
| 5 | **不 force push** | 绝对禁止。远端领先时用 `pull --rebase` 或新建分支，**不得**覆盖他人提交 |
| 6 | **不 squash** | 禁止压缩历史。历史即证据 |
| 7 | **不重写项目** | 禁止推倒重来、禁止大规模移动代码、禁止删除历史 Stage |
| 8 | **真实验证优先** | 能用真实站点验证的，不用 mock 替代结论；mock 结论必须标注 INTEGRATION，不得标 REAL |
| 9 | **Fixture 不能冒充 Real** | 见 `docs/EVIDENCE_POLICY.md` §5 自检清单 |
| 10 | **生产逻辑不因测试而污染** | 禁止为了让测试通过而改生产行为；禁止测试专用分支进入生产代码 |

---

## 2. 每轮修改的标准流程（强制）

```bash
# 0) 开局：确认基线，避免覆盖他人
git status
git branch --show-current
git log --oneline -5
git fetch origin && git status -sb        # 若落后 → pull --rebase，禁止 force

# 1) 改动
#    （只改自己职责范围内的文件，见 docs/PARALLEL_DEVELOPMENT.md §2）

# 2) 提交前自检
git diff                                  # 逐行确认改动符合预期
git status                                # 确认没有误加文件（尤其敏感文件）

# 3) 测试
node tests/editor-object-model/run.js     # UNIT（零依赖）
#   + 视改动范围补 headless 套件（见 docs/TEST_MATRIX.md §1）

# 4) 提交（一个逻辑任务一个 commit）
git add <明确路径>                         # 避免 git add -A 带入无关文件
git commit                                # message 写清：做了什么 + 依据 + 验证结果

# 5) 推送
git push                                  # 失败则 pull --rebase 后重试，禁止 force
```

> 环境提示（本项目 Windows 实测）：Git 需显式 `http.sslVerify=false` 才能连通 GitHub；
> 含 `/` 的分支名（如 `docs/xxx`）在 PortableGit 上出现过 ref 未写入的问题，**建议使用扁平分支名**。

---

## 3. Commit message 规范

```text
<type>: <做了什么>

<可选：为什么 / 依据 / 证据>
<可选：验证结果（套件 + 断言数 + 结论）>
<可选：遗留 / Deferred / 目标阶段>
```

- `<type>` ∈ `docs` `test` `refactor` `fix` `feat` `chore` `evidence`
- 涉及阶段时写阶段号（如 `docs: stage5.4 ocr adapter audit`）
- **禁止**无信息的 message（`update`、`fix bug`、`wip`）
- 涉及 P0/P1 修复时，message 必须带 finding ID（如 `(AUDIT-BRIDGE-002)`、`(STAGE5.1-CRE-01)`）

---

## 4. 文件级纪律

### 4.1 禁止触碰（除非有对应阶段的明确授权）

| 文件 | 原因 |
|---|---|
| `zheliyin-card-assistant.user.js` 的 metadata / 安装入口 / 更新机制 | userscript 契约 |
| `extension/src/fields/field-core.js` 的谓词与判定顺序 | Compatibility Contract（`BEHAVIOR_BASELINE.md` §2，18 项） |
| `extension/src/editor/page-bridge.js` 的 `applyFields` 选层主流程与 `removeAssistantExtras` 清理语义 | 产品行为 |
| `createTextObject` 克隆继承逻辑 | 依赖设计器类签名，改动需真机联调 |
| `zyCreatedByAssistant` / `zyFieldKey` 命名 | 清理语义依赖；**新增标签只增不改** |
| Bridge 消息格式（`probe`/`apply`/`applyResult`/`probeResult`） | 跨世界协议 |
| 站点相关 canvas 探测链（`findCanvasFromGlobals` 等） | 站点耦合 |

### 4.2 新增标签规则

新增对象标记必须**只增不改**（旧版不识别即忽略，无风险）。当前已用：`zyCreatedByAssistant`、`zyFieldKey`。
计划中未实现：`zyFeature` / `zyRunId` / `zySource`（`ARCH-RISK-001`，见 `REFACTOR_PLAN.md` R4）。

### 4.3 不引入的东西

除非有真实必要并单独论证，**禁止**引入：

```text
React / Vue / Svelte
Vite / webpack / 任何打包迁移
monorepo
后端服务 / 数据库 / Docker
TypeScript 迁移
新的运行时依赖（生产用户脚本必须保持零依赖可安装）
```

理由：主产物是**单文件用户脚本**，任何构建链都会破坏「粘贴即用」的安装方式。

---

## 5. 版本与 Release 纪律

### 5.1 当前版本事实（2026-09-16 核对）

| 载体 | 版本 | 状态 |
|---|---|---|
| `zheliyin-card-assistant.user.js` `@version` | `0.3.0.0` | 权威 |
| `extension/assistant.js` `const VERSION` | `0.3.0.0` | 与上一致 ✅ |
| `extension/manifest.json` `version` / `version_name` | `0.3.0` / `0.3.0.0` | 一致 ✅ |
| `README.md` 标题 | `v0.2.3.11` | ❌ **不一致（已过时）** —— 本次治理修正 |
| `package.json` `version` | `0.1.0` | ✅ 无关（仅 runtime harness，`private: true`） |
| `CHANGELOG.md` | `[Unreleased]` 段含 R0~Stage 4.0 | ⚠️ 未记录 4.1/RUNTIME-8.x/Stage 5.x |
| tag `v0.3.0` | `d03e014` | ✅ |

### 5.2 规则

1. **不随便升级版本号**。版本升级只在真实发布时进行，且 `@version` 与 `VERSION` 必须同时改。
2. **不在一次提交里混入版本升级**。版本升级必须独立 commit：`chore: bump version to X`。
3. **不追溯补打历史 tag**。历史缺 tag 就缺着（Stage 3.2 之后均无 tag），**不补签**。
4. 需要 tag 时，从当前 HEAD 为**新**阶段打。
5. 每个功能阶段的推荐节奏：

```text
code commit  →  test evidence commit  →  docs commit  →  tag（必要时）
```

6. `README.md` 的版本描述必须与 `@version` 一致。发现不一致 → 立即修 README（**不改代码版本**）。

---

## 6. 敏感数据纪律

**禁止提交**：

```text
cookies / session
token / API key / Authorization 头
真实账号 / 密码
真实图片（客户名片原图）
真实订单信息
browser storage dump
profile 目录 / screenshots / dumps
```

**允许提交**：

```text
脱敏 fixture（[REDACTED_*] + textLen + textHash8）
fake token / 占位账号（如 13800138000）
synthetic image（程序绘制）
schema / sample metadata
```

**现行机制（已生效，保持）**：

- `runtime/autologin.js` / `autologin3.js`：凭据**只经环境变量**（`ZY_USER` / `ZY_PASS`），不写文件、不入库 ✅
- `runtime/browser-launcher.js`：`redactText()` 统一脱敏 ✅
- `.gitignore` 已排除 `runtime/browser/profile*/`、`storage-state/`、`*.session`、`.cookies`、`runtime/reports/screenshots*` ✅

**待整改项**：见 `docs/SENSITIVE_DATA_AUDIT.md`。

---

## 7. Gate 与停止点纪律

1. 每个阶段必须给出 `GO` / `CONDITIONAL-GO` / `NO-GO`，并附证据（`docs/EVIDENCE_POLICY.md` §4 模板）。
2. **不允许无等级标注的 PASS**。
3. **不允许为凑 Gate 改写 BLOCKED/PARTIAL**。CONDITIONAL-GO 是合法且有价值的结论。
4. 阶段报告必须写明「停止点」（本阶段到哪为止、不进入什么）。历史上每个 Stage 5.x 报告都做到了，**继续执行**。
5. 未获授权不得自启下一阶段（如 Stage 5.4 §9 明确"待授权"）。

---

## 8. 与另一条线的协作纪律

完整版见 `docs/PARALLEL_DEVELOPMENT.md`。要点：

1. 两条线**不共享正在修改的实现文件**。
2. 共享面只有：`OCRCandidate` / 坐标映射契约 / Textbox 输出契约 / 证据定义（即 `docs/REAL_OCR_DEMO_CONTRACT.md`）。
3. 发现对方文件的问题：**记录 + 报告**，不直接抢改；只有**致命安全问题**才直报。
4. 契约变更由治理线更新契约文件，实现线通过 commit message 提出。

---

## 9. 敏感操作清单（需显式确认）

以下操作执行前必须向用户确认：

```text
force push / reset --hard / 分支删除
批量重命名或移动文件
删除任何 Stage 历史文档或 tag
修改生产行为（page-bridge / assistant / userscript）
提交任何含真实数据的文件
```

---

## 10. 自检清单（提交前逐条打勾）

```text
[ ] git status 干净，无未预期的已暂存文件
[ ] 只改了自己职责范围内的文件
[ ] 没有触碰 §4.1 禁止清单
[ ] 没有引入 §4.3 禁止项
[ ] 改动理由有证据（真实代码 / 真实运行结果 / 真实历史）
[ ] 测试跑过，结果记录在 commit message 或测试报告
[ ] 新增 PASS 都有证据等级标注
[ ] 没有 fixture 冒充 real
[ ] 没有敏感数据
[ ] commit message 符合 §3 格式
[ ] 一个逻辑任务一个 commit
[ ] 已 push（或说明为何未 push）
```

---

## 11. 本文件的维护

1. 本文件由治理线维护；实现线如需变更规则，通过 commit message / issue 提出。
2. 规则变更必须独立 commit：`docs: amend development rules (<原因>)`。
3. 规则**不追溯适用**于历史提交 —— 历史按当时规则评价，不因新规则被否定。
