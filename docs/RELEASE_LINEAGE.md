# RELEASE_LINEAGE — 版本血缘

> 维护者：AI-2（Repository Governance 线）
> 用途：回答**「这个 Demo / 这个版本到底对应哪个 commit」** —— 这是并行开发下最容易失真的问题。
> 事实基线：2026-09-16 从 Git 实时读取；配套 `docs/BRANCH_POLICY.md`

---

## 1. 血缘链

```text
        AI-1 开发分支                      demo                         main
   stage-4.1-runtime-validation            │                            │
              │                            │                            │
   Stage 4.0 ─┼─● 7446faa ─────────────────┼───────────────────────────●  7446faa
              │  (main 的终点)              │                            │
              │                            │                            │
   RUNTIME-8.3 ┤ ● 3a61155                 │                            │
              │                            │                            │
   Stage 5.0–5.4┤ ● …                     │                            │
              │                            │                            │
   Stage 5.4 ──┤ ● 3becf04 ──┐             │                            │
              │             │  治理分支 ai2-repo-governance             │
              │             └─● f68a3d2 … 5be5f26（仅文档）             │
   Stage 5.5 ──┤ ● 4cb0819                 │                            │
   Stage 5.5A ─┤ ● 7c412b8 ──┐             │                            │
              │             └─────────────● 0fa8303 (demo 元数据)
              │                           ● ceedbb5 (demo 横幅)  ← demo HEAD
              │                                                        │
           当前 HEAD                                                 稳定 HEAD
           （开发中）                                              （未合并，落后 66）
```

**方向**：AI-1 → demo → (release candidate) → main。**不可逆流**。

---

## 2. 各分支血缘表（实时）

| 分支 | 角色 | 起点（base） | 当前 HEAD | 与 main 关系 | 说明 |
|---|---|---|---|---|---|
| `main` | 稳定 | — | `7446faa` | — | Stage 4.0，85 commit / 44 文件 |
| `stage-4.1-runtime-validation` | AI-1 开发 | `7446faa`（main） | `e9235af` | 领先 67 / 落后 0 | Stage 5.5A-R2，152 commit / 189 文件 |
| `demo` | 真实用户试用 | `e9235af`（AI-1 HEAD） | `58337a8` | 领先 68 / 落后 0 | = AI-1 HEAD + demo 元数据/UI/文档 |
| `ai2-repo-governance` | 治理文档 | `3becf04`（Stage 5.4 点） | `e14b48c` | **与 main 无代码差异**（仅文档） | 175 commit / 193 文件 |

> ⚠️ **demo 的 base 已随 AI-1 推进前移**：从 `7c412b8` 变为 `e9235af`。同步 demo 时不要沿用旧 base。
> ⚠️ **AI-1 现在也直接向 `demo` 推送**（`58337a8`、`0cccfd1`）。因此 `demo` 分支的实际维护者是 **AI-1 + AI-2 共同**，
> 治理线的角色转为**校验**（元数据自洽 / 版本一致性 / 发布清单同步），并保留 `docs/DEMO_RELEASE.md` 记录。

> **注意 `demo` 的 base 是 AI-1 HEAD 而不是 `main`** —— 这是硬要求（`docs/BRANCH_POLICY.md` §6）。从旧 `main` 建 demo 会得到一个"缺 66 个 commit 的假 demo"。

---

## 3. 「这个 Demo 对应哪个 commit」——三级溯源

任一次 demo 发布，都可以用这三条独立信息互相对齐：

| 层级 | 信息 | 当前值 | 怎么查 |
|---|---|---|---|
| ① 分支 | `demo` HEAD | `58337a8f553c350537138208d9320d83b4a64690` | `git rev-parse origin/demo` |
| ② 代码归属 | demo base = AI-1 的哪个 commit | `e9235af`（Stage 5.5A-R2） | `git merge-base --is-ancestor e9235af demo` + `docs/DEMO_RELEASE.md` |
| ③ 交付物 | userscript sha256 | **以 `docs/DEMO_RELEASE.md` 最新条目为准**（`58337a8` 版本需重新计算，本文档不写死） | `curl -sSk <demo raw url> \| sha256sum` |

**为什么需要第 ③ 层**：demo 与 main 曾在同一版本号（`0.3.0.0`）下内容不同。仅凭「版本号」或「分支名」无法确认用户装到的到底是什么。**sha256 是唯一无争议的标识**，因此每次 demo 更新都必须把它写进 `docs/DEMO_RELEASE.md`。

---

## 4. 运行期依赖的血缘（容易被忽略的一层）

userscript 通过 `@require` 拉取 4 个模块 —— **这些模块的来源分支决定了用户实际跑的代码**：

| 模块 | `demo` 分支上的 sha256 | 与 `main` 是否相同 | 指向 |
|---|---|---|---|
| `extension/src/fields/field-core.js` | （见下表命令） | ✅ 相同 | `/demo/` |
| `extension/src/core/config-core.js` | 同上 | ✅ 相同 | `/demo/` |
| `extension/src/ai/ai-client.js` | 同上 | ✅ 相同 | `/demo/` |
| `extension/src/editor/page-bridge.js` | `793ba9e1671f590e…` | ❌ **不同**（main 为 `17141f7c67fb4862…`） | `/demo/` |

**血缘修复记录**：AI-1 分支 `@7c412b8` 的 userscript 把 8 处 URL 全部指向 `main`，导致 ScriptCat 用户拿不到 `page-bridge.js` 的 Stage 5.1 P1 修复。`demo` 分支已在 `0fa8303` 全部切到 `/demo/`，端到端验证：

```bash
# 已验证：demo 分支的 page-bridge 实际内容 = AI-1 版本（含 P1 修复）
curl -sSk https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/editor/page-bridge.js | sha256sum
# → 793ba9e1671f590e2d221ccbff93911da91f2e2db15475ce683fb43e9916a01d
```

> 这条记录的价值：它证明了「demo 装到的东西 = AI-1 的实现」这件事**是被验证过的，不是被假设的**。

---

## 5. demo 同步流程（每次 AI-1 有新的已验证成果时）

```bash
# 1) 取 AI-1 最新
git fetch --all --prune
DEV=$(git rev-parse origin/stage-4.1-runtime-validation)

# 2) 切到 demo，合并 AI-1（快进或普通 merge，禁止 force / 禁止 rebase AI-1）
git checkout demo
git merge --no-ff "$DEV" -m "chore(demo): sync demo to AI-1 <stage> (<short>)"

# 3) 检查元数据是否仍自洽（AI-1 可能顺手改回 main）
grep -nE '@require|@updateURL|@downloadURL' zheliyin-card-assistant.user.js
grep -nE 'const UPDATE_URL|const DOWNLOAD_URL' zheliyin-card-assistant.user.js

# 4) 按 §4 BRANCH_POLICY 递增 demo 版本（第 4 段 +1），同步 4 处版本点
#    @version / const VERSION / extension/assistant.js VERSION / manifest version_name

# 5) 记录到 docs/DEMO_RELEASE.md（版本 / commit / sha256 / 功能 / 已知问题）

# 6) 推送并实测
git push origin demo
curl -sSk -o /dev/null -w '%{http_code}\n' https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
```

> **不要从 `main` 同步 demo。** 若 demo 分支出现异常，正确做法是**重新从 AI-1 HEAD 建 demo**，而不是退回 `main`。

---

## 6. merge 顺序与冲突预案

| 操作 | 顺序 | 冲突可能性 | 预案 |
|---|---|---|---|
| AI-1 → demo | 直接 merge | 低（demo 只改了 3 个文件） | 若 AI-1 也改了 userscript/README：**以 AI-1 的代码为准，再重新套用 demo 元数据**（元数据是叠加层，不是内容层） |
| governance → demo | 建议在 AI-1 → demo 之后 | **中：README 双方都改** | governance 的 README 是完整重写版且已含 Demo 安装段 → **取 governance 版**，丢弃 demo 的横幅（信息已覆盖） |
| governance → main | 任意时刻 | 低（纯文档新增） | 直接 merge；**只带文档，不带任何 Stage 5.x 代码** |
| demo → main | 仅在满足 `BRANCH_POLICY §7` 后 | 低（快进） | 由维护者决定；AI-2 只准备 candidate |

---

## 7. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-09-16 | 初版：四分支血缘表、三级溯源、`@require` 血缘修复记录、同步流程、冲突预案 |
