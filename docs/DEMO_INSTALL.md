# DEMO_INSTALL — Demo 安装与验收

> 维护者：AI-2（Repository Governance 线）
> 适用：**Demo 分支**（真实用户试用）。稳定版请见 `main` 分支 README。
> 配套：`docs/BRANCH_POLICY.md`、`docs/RELEASE_LINEAGE.md`、`docs/DEMO_RELEASE.md`

---

## ⚠️ 先读这一段

**这是实验版本，不是稳定版。**

| | 版本 | 说明 |
|---|---|---|
| 稳定版（`main`） | `0.3.0.0` | 日常使用请安装这个 |
| **Demo（`demo`）** | **`0.3.7.0`**（四处版本已统一，见 `docs/DEMO_RELEASE.md`） | 试用 AI-1 最新实现；含**图片识别**、**网页原生右栏面板**、**本地优先 + 百度云兜底** |

## ⚠️ v0.3.7.0 起：Demo 默认是「仅 OCR 模式」

从 `0.3.7.0` 开始，**Demo 默认不再显示旧套版浮窗**，主界面只有**原生右栏的「图片文字识别」抽屉**。

| 你想要 | 怎么切换 |
|---|---|
| **只用图片识别**（默认） | 无需操作。右侧原生栏出现 OCR 抽屉 |
| **要用套版填层等旧功能** | 在 ScriptCat 里给本脚本添加 GM 值：`zyShowTemplatePanel` = `"1"`，然后刷新页面 |

> **代码没有删除**：旧套版浮窗的全部实现（豆包 / AI 设置 / 字段 / 正反面 / 诊断 / 更新提示）仍完整保留在脚本里，
> 只是默认不挂载。另外，**如果页面没有原生右栏**（页面变体），脚本会**自动回退**挂载旧浮窗，不会出现"什么都没有"。

**当前 Demo 的能力与限制**：

```text
编辑器内 OCR 引擎装载       = PASS（Stage 5.5A-R2 突破，原 BLOCKED）
图片识别（「识别图片文字」）  = 可用（3 个真 textbox，可双击编辑）
网页原生右栏面板            = 可用（P2-B 主 UI；旧浮窗默认停用、可开关恢复）
本地优先 + 百度云端兜底      = 可用（auto 模式：本地失败才切云端；凭据 AES-GCM 加密）
套版填层（旧浮窗）           = 可用，但 v0.3.7.0 起**默认停用**（需 zyShowTemplatePanel="1"）
识别质量（真实样本）         = PARTIAL（词序/断行待改进 → 待 Stage 5.9 改进）
旋转坐标映射                = TODO（未启动）
```

> ✅ **`DEFECT-VER-01` 保持已修复**：`@version` / `const VERSION` / `extension/assistant.js VERSION` / `manifest version_name` 四处一致 = `0.3.7.0`（`manifest.version` = `0.3.7`，为 `@version` 前三段）。
> 修复前表现为「面板显示 0.3.0.1 + 每次提示发现新版」；现由 AI-2 在 `e0abcf0` 与 `604f552` 连续复验 PASS，CI 的 metadata check 会持续守护该不变量（`docs/BRANCH_POLICY.md` §4.1）。

---

## 1. 安装（6 步）

1. **安装 ScriptCat**（已装可跳过）：<https://scriptcat.org/>
2. **打开固定安装地址**：

   ```text
   https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
   ```

3. **ScriptCat 弹出安装页 → 点击「安装」**
4. **打开折立印设计器页面**（需登录）
5. **右侧出现「名片套版助手」面板即安装成功**
6. **以后无需重新安装** —— 脚本 `@updateURL` 已固定指向 demo 分支，ScriptCat 会自动提示更新

> 该地址**原则上永不变**。变的是 demo 分支的内容，所以用户只需安装一次。

---

## 2. 怎么确认装到的确实是 Demo

安装后在面板里看版本号：

| 面板显示 | 含义 |
|---|---|
| `版本：0.3.7.0` | ✅ Demo（与 `@version` 一致） |
| `版本：0.3.0.0` | ❌ 这是稳定版，说明装到了 `main` |

> 更可靠的确认方式：用 sha256 核对（见下），或检查是否存在 **「识别图片文字」按钮** / **右栏 OCR 抽屉**（稳定版没有）。
> 注意：v0.3.7.0 起**默认看不到旧套版浮窗**（那是 OCR-only 模式，不是装错）。

也可以直接核对交付物哈希（无争议的标识）：

```bash
curl -sSk https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js | sha256sum
# 期望（2026-09-17 实测，72705 bytes）：
# b37018fece8c9ddfa3602b35a47e78da013726d3f9343c0c15bbca238d0033b2
```

> 该 sha256 对应 `demo` @ `604f552`，并已实测**与 raw 响应完全一致**（即 CDN 无滞后）。
> 版本升级后该值会变 —— 那时以 `node runtime/check-demo-update.js` 的实测输出为准，不要照抄本文档。

---

## 3. 本 Demo 会加载哪些代码（运行期依赖）

Demo 的 userscript 通过 `@require` 拉取 **8 个模块**，**全部指向 demo 分支**：

```text
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/fields/field-core.js
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/core/config-core.js
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ai/ai-client.js
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/editor/page-bridge.js
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/baidu-provider.js
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/fallback-policy.js
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/candidate-normalizer.js
https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/credential-crypto.js
```

> **这一条很关键**：早期 AI-1 分支的这些 URL 指向 `main`，会让用户拿到 `main` 的 `page-bridge.js` ——
> 从而**丢掉 Stage 5.1 的 P1 identity 修复**。Demo 分支已修正，并已实测验证（见 `docs/RELEASE_LINEAGE.md` §4）。
> 若将来发现「装了 Demo 但行为像稳定版」，**第一个要检查的就是这些 URL**。

**如何自动验证闭包（推荐，无需人工逐个 curl）**：

```bash
node runtime/check-demo-closure.js --ref origin/demo --expect-branch demo            # 结构检查
node runtime/check-demo-closure.js --ref origin/demo --expect-branch demo --net      # 追加网络可达性
node runtime/check-demo-update.js  --ref origin/demo                                 # 更新链 + 版本单调性
```

> 2026-09-17 对 `e0abcf0` 实测：10 条依赖（8 `@require` + `@updateURL` + `@downloadURL`）**全部 HTTP 200**，`violations: []`，结论 `PASS`。

---

## 4. 验收标准（发行 Demo 前必须逐项实测）

**把「GitHub 上有源码」和「用户能装上」区分开** —— 这是三个独立字段：

| 字段 | 含义 | 怎么验 | 当前 |
|---|---|---|---|
| `USER_INSTALLABLE` | 用户能装上 | 步骤 1–5 全走通，面板出现 | ✅ PASS |
| `USER_UPDATEABLE` | 用户能更新 | 面板版本 = `@version`；`@updateURL` 可达且指向 demo | ✅ PASS |
| `REAL_FEATURE_USABLE` | 功能真的能用 | 逐功能判定（**不是**安装成功就等于功能可用） | ⚠️ 部分（见下） |

一次 Demo 更新的最小验收链（`docs/BRANCH_POLICY.md` §7）：

```text
Demo version → Raw URL → ScriptCat install → ScriptCat update → 真实页面
至少验证：install = PASS / update = PASS / script loaded = PASS
功能是否 PASS：另外判断
```

自动化可测部分（已实测通过，2026-09-17）：

```bash
# ① 交付物可达且内容正确
curl -sSk -o /dev/null -w '%{http_code}\n' https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
# → 200

# ② 8 个运行期依赖全部可达（推荐直接用闭包检查器，见 §3）
node runtime/check-demo-closure.js --ref origin/demo --expect-branch demo --net
# → 结论 PASS，10 条依赖全 200

# ③ page-bridge 确实是 AI-1 版（含 P1 修复）
curl -sSk https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/editor/page-bridge.js | sha256sum
# → e9cb91ff9bd37630968e820d267d2ada61c762b3ccb67caf324f10656176dccf  （2026-09-17 实测，28062 bytes）
```

**必须人工完成的**（自动化不可替代）：

- [ ] ScriptCat 里真实安装 / 更新动作
- [ ] 真实登录态设计器页面加载脚本、面板出现
- [ ] 粘贴客户资料 → 识别并填正反面 → 画布真实落层
- [ ] 双击新建文字层确认可编辑
- [ ] （v0.3.6.0）点「识别图片文字」→ 生成本地 OCR 文字层
- [ ] （v0.3.6.0）配置百度 AK/SK → auto 模式本地失败时确认切到云端
- [ ] （v0.3.6.0）确认右侧原生面板出现且刷新后不重复

---

## 5. 功能可用性（本 Demo 的准确状态）

| 功能 | 状态 | 证据等级 |
|---|---|---|
| 套版填层（已有层只改文字 / 不足才新建 / 清理多余助手层） | ✅ 可用 | REAL |
| 正反面分区 + 本地规则 + AI 辅助（可回退） | ✅ 可用 | REAL |
| 画布自检 | ✅ 可用 | REAL |
| **图片识别（OCR）→ 自动生成文字层** | ✅ **可用**（v0.3.6.0 起；原 `BLOCKED`） | REAL |
| **网页原生右栏面板** | ✅ 可用 | REAL |
| **本地优先 + 百度云端兜底（auto 模式）** | ✅ 可用（需自备百度 AK/SK；凭据本机加密存储） | REAL |
| 对象模型 / matcher / image-mapper / OCR provider（旧版） | ⛔ 未挂接生产 | 代码在仓库，生产路径不调用 |
| 旋转坐标映射 | ⏳ 未启动 | `TODO` |

> **注意区分两条轨道的挂接程度**：`demo`（v0.3.6.0）已把 `baidu-provider` / `fallback-policy` / `candidate-normalizer` / `credential-crypto`
> 四个模块**真正挂到生产路径**；但 `matcher` / `image-mapper` / `object-model` 仍**只在审计链内**。
> 详见 `docs/CURRENT_STATUS.md` §2。

---

## 6. 反馈时请提供

```text
1. 面板显示的版本号（应为 `0.3.6.0`）
2. 浏览器 + ScriptCat 版本
3. 现象截图（注意：请勿发送真实客户名片 / 手机号 / 微信 / 二维码）
4. 控制台错误（如有）
5. 若涉及百度兜底：OCR 模式（auto/local/baidu）+ 是否已配置 AK/SK（**不要发送密钥本身**）
```

> 敏感信息规范见 `docs/REAL_MACHINE_EVIDENCE.md` —— **禁止提交真实名片、客户手机号、真实微信、二维码、Cookie、Token**。

---

## 7. 卸载

ScriptCat → 管理面板 → 找到「折立印名片套版助手」→ 删除。

> 注意：Demo 与稳定版**共用同一个 `@name`**（有意为之，避免被当成两个脚本同时运行导致双面板）。因此安装 Demo 会**替换**稳定版，而不是并存。
