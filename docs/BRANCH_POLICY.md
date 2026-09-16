# BRANCH_POLICY — 分支政策

> 维护者：AI-2（Repository Governance 线）
> 生效日期：2026-09-16
> 事实基线：见 §2（每次修订都从 Git 实时读取，不沿用旧文档数字）

---

## 1. 三轨模型

```text
                        GitHub
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
      main                demo             开发分支
        │                  │                  │
     稳定公开版        真实用户试用        AI-1 持续开发
        │                  │                  │
        └──────── 状态 / 证据 / 契约（治理分支）────────┘
                           │
                           ▼
                   docs/CURRENT_STATUS.md
```

**只有四条长期分支**，不为此项目制造 `feature/*` 分支群（规模不匹配）：

| 轨道 | 分支 | 角色 | 谁写入 |
|---|---|---|---|
| 稳定 | `main` | 公开默认分支。**只有满足发布标准才前进** | 维护者（AI-2 **不擅自**合并） |
| Demo | `demo` | 真实用户试用。固定 raw 安装地址，装一次即可 | AI-2 从 AI-1 已验证版本同步 |
| 开发 | `stage-4.1-runtime-validation` | AI-1 快速迭代，允许频繁提交 | **仅 AI-1** |
| 治理 | `ai2-repo-governance` | 文档 / 规范 / 契约。**只含文档类改动** | 仅 AI-2 |

---

## 2. 实时事实（2026-09-16 读取）

| 分支 | HEAD | commits | 跟踪文件 | 说明 |
|---|---|---|---|---|
| `main` | `7446faa` | 85 | 44 | Stage 4.0；默认分支 |
| `demo` | `ceedbb5` | 153 | 187 | 由 `7c412b8` 建立 + 2 个 demo 元数据 commit |
| `stage-4.1-runtime-validation` | `7c412b8` | 151 | 187 | Stage 5.5A；AI-1 开发中 |
| `ai2-repo-governance` | `5be5f26` | 166 | 182 | 治理文档（基线 `3becf04`） |

> 祖先关系（实测）：`main` ⊂ `demo`、`7c412b8` ⊂ `demo`、`main` ⊂ `7c412b8`、`3becf04` ⊂ `ai2-repo-governance`。
> 即：**demo 与 main 之间是快进关系**，无分叉。

> 复现命令：
> ```bash
> for b in main demo stage-4.1-runtime-validation ai2-repo-governance; do
>   echo "$b $(git rev-parse --short origin/$b) $(git rev-list --count origin/$b) $(git ls-tree -r --name-only origin/$b | wc -l)"
> done
> ```

---

## 3. 各分支的写入规则

### 3.1 `main`（稳定）

- **AI-2 不合并、不 rebase、不 force push。**（用户指令 §五 / §四十八 明确要求）
- 进入 `main` 的唯一路径：`demo` 满足发布标准 → 建立 release candidate → 维护者决定合并。
- 当前 `main` 落后开发线 **66 commit**（`7446faa` 是 `7c412b8` 的严格祖先，可快进）。

### 3.2 `demo`（真实用户试用）

- **必须从 AI-1 当前可运行版本建立或同步，绝不从旧 `main` 建立。**
- 允许包含未挂接 / BLOCKED 的能力，但**必须在 README 与 `docs/DEMO_RELEASE.md` 标注实验性与已知限制**。
- 固定安装地址（**原则上永不变**，变的是分支内容）：

```text
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
```

- 元数据必须自洽（详见 §5）。

### 3.3 开发分支（AI-1）

- AI-2 **只读**。不 commit、不 rebase、不 checkout、不覆盖未提交修改。
- 若发现 AI-1 正在改某文件（工作树有相关改动），**立即停止对该文件的任何操作**，等其 commit 后再同步（用户指令 §四十一）。

### 3.4 `ai2-repo-governance`（治理）

- **只允许文档类改动。** 检测命令：

```bash
git diff --name-only <base>..HEAD | grep -E '^(extension/|runtime/|installer/|tests/|package)' \
  && echo "越界" || echo "OK: docs-only"
```

- **不把 AI-1 的开发分支合并进本分支。** 原因：若日后有人把治理分支合并到 `main`，就会变成「侧门把整套 Stage 5.x 代码带进 main」，违反「AI-2 不擅自合并 main」。
  → 代价：本分支的树**不含** AI-1 在 `3becf04` 之后新增的文件（如 `docs/STAGE_5_5*.md`、`extension/src/ocr/ocr-provider.js`）。
  → 处置：文档引用这些文件时必须**显式写明所在分支与 commit**，不暗示它们在本分支上。

---

## 4. 版本与 tag 规则

1. **不追溯补打历史 tag**（Stage 3.2 之后均无 tag，保持现状）。
2. tag 只在**发布**时创建（`v0.x.x`），不提前批量打。
3. 版本号沿用项目既有 4 段数字格式：

| 轨道 | 版本示例 | 含义 |
|---|---|---|
| `main` | `0.3.0.0` | 正式发布线 |
| `demo` | `0.3.0.1` | 同一发布线的 **demo build 计数**（第 4 段递增） |
| 未来功能版 | `0.3.1.0` | 第 3 段递增；此时 demo 回到 `0.3.1.1` 起算 |

**为什么不给 demo 另起一套版本号**：`compareVersion()`（脚本内实现）按 `.` 拆分后 `parseInt` 逐段比较，带后缀（如 `-demo`）会被 `parseInt` 截断成 0 产生歧义；4 段数字是唯一无歧义且兼容既有实现的方案。

4. **用户可见功能更新 ⇒ 必须递增 demo 版本**；纯文档变更 ⇒ 不动脚本版本（用户指令 §十）。

---

## 5. Demo 分支的元数据自洽要求

`demo` 分支的 userscript **必须**满足：

| 项 | 要求 |
|---|---|
| `@require`（4 个） | 指向 `demo`，**不指向 `main`** |
| `@updateURL` / `@downloadURL` | 指向 `demo` |
| 脚本内 `const UPDATE_URL` / `const DOWNLOAD_URL` | 指向 `demo`（更新检查实际用这两个常量） |
| `@version` | 与 `const VERSION`、`extension/assistant.js` 的 `VERSION`、`manifest.json` 的 `version_name` **一致** |
| `@name` | **保持不变**：改 `@name` 会被脚本管理器视为第二个脚本 → 与稳定版同时运行 → 双面板 |
| `@description` | 带【Demo/实验版】标记，便于用户辨识 |

> **为什么这条是硬要求（本项目真实缺陷）**：AI-1 分支 `@7c412b8` 的 userscript 把 8 处 URL 全部指向 `main`，而 `extension/src/editor/page-bridge.js` 在两分支**不同**
> （`main` sha256 `17141f7c…` vs AI-1 sha256 `793ba9e1…`，差异为 Stage 5.1 的 P1 `CREATION_IDENTITY_LEAK` 修复）。
> 后果：① ScriptCat 安装该分支脚本实际加载 `main` 的 page-bridge → **P1 修复不生效**；② demo 的 `@updateURL` 指 main → **ScriptCat 会把 demo 用户更新回 main**。
> `demo` 分支已修正（commit `0fa8303`）。

---

## 6. 同步方向（单向，不可逆流）

```text
AI-1 开发分支  ──(验证后)──▶  demo  ──(满足发布标准)──▶  main
      │                         │                          ▲
      └──(只读)──▶ 治理分支 ─────┘  （治理分支只贡献文档）
```

- **允许**：AI-1 → demo；demo → main（需满足 §7）；治理 → 任意（仅文档）。
- **禁止**：main → demo；main → AI-1；治理 → AI-1。
- **demo 从旧 `main` 建立** 是明确禁止的（用户指令 §七）。

---

## 7. 从 demo 进入 main 的标准（全部满足才可提 release candidate）

```text
[ ] Demo 验收 PASS（install / update / script loaded，见 docs/DEMO_INSTALL.md §4）
[ ] 真机验证 PASS（见 docs/REAL_MACHINE_EVIDENCE.md）
[ ] 回归 PASS（Node 套件 + headless 套件）
[ ] 无已知 critical blocker
[ ] 文档已同步（CURRENT_STATUS / STAGE_INDEX / CHANGELOG / README / DEMO_RELEASE）
```

满足后**由维护者决定**是否合并；AI-2 只负责准备 candidate 与证据，不执行。

---

## 8. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-09-16 | 初版：三轨模型、四条长期分支、demo 元数据自洽要求、单向同步、发布标准 |
