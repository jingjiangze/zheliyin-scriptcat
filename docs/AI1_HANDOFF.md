# AI1_HANDOFF — 治理线 → 开发线 移交单

> 维护者：AI-2（Repository Governance 线）
> 用途：**单向**记录需要 AI-1（开发线）处置的事项。AI-2 只登记与移交，**不替 AI-1 改实现**（用户指令明确）。
> 配套：`docs/AGENT_SYNC_PROTOCOL.md`、`docs/SENSITIVE_DATA_AUDIT.md`

---

## 处置规则

| 级别 | 含义 | 期望时机 |
|---|---|---|
| `P0-BLOCK` | 会导致真实用户数据泄漏 / 错误下载 | **下一次 commit 前** |
| `P1-SOON` | 会削弱安全性或造成假 PASS | 当前阶段内 |
| `P2-LATER` | 改善项，不阻断 | 任意 |

处理完成后，请在**本次 commit message** 或 `docs/` 下注明 `HANDOFF-xxx: DONE`，AI-2 会在下一轮复核。

---

## 打开项

### HANDOFF-SD-04 · `P1-SOON` · OCR 诊断报告可能写入真实图片 base64

| 项 | 内容 |
|---|---|
| 文件 | `runtime/stage5-5a-scriptcat-ocr-smoke.js`（**demo 分支**，第 163 / 166 / 170 / 249 行） |
| 链路 | `getFirstCanvasImage()` → `cv.toDataURL("image/png")` → `return {img: img}`（含 `dataUrl`）→ `out.ocrRaw = ocr` / `out.gm.img = ocr.img` → `fs.writeFileSync("reports/stage5-5a-real-scriptcat-ocr.json", JSON.stringify(out))` |
| 为什么现在要处理 | ① 该报告**已被 git 跟踪**（`runtime/reports/stage5-5a-real-scriptcat-ocr.json`）；② 阻断它的前置（引擎装载）**已在 Stage 5.5A-R2 转为 PASS**，取图分支现已可达；③ 报告路径**未被 `.gitignore` 覆盖** |
| AI-2 实测现状（`e0abcf0`） | ✅ **当前无泄漏** —— 报告仅 2009 bytes，`ocrRaw={err,injectMode,amdHint}`（引擎装载失败），`gm` 键不存在。**但这只是"上次恰好失败"** |
| 建议处置（二选一或都做） | **(a)** 写入前统一脱敏：把任何 `^data:image\/.*;base64,` 字符串替换为 `[REDACTED_IMAGE len=N]`，并删除 `gm.img.dataUrl` / `ocrRaw.img.dataUrl`；**(b)** 把 `runtime/reports/stage5-5a-real-scriptcat-ocr.json` 加入 `.gitignore`，并 `git rm --cached` 停止跟踪（**保留历史，不 rewrite**） |
| 参考实现 | `tests/fixtures/ocr/redacted-card-01.json` 已是 `[REDACTED] + textLen + textHash8` 格式，可对齐 |
| 建议 commit 形状 | `fix(privacy): redact image dataUrl in stage5-5a smoke report` —— **独立 commit**，便于回滚与追溯 |

### HANDOFF-SD-05 · `P1-SOON` · OCR 驱动把识别文本片段写入报告

| 项 | 内容 |
|---|---|
| 文件 | `runtime/stage5-5-real-ocr-demo.js` —— `step(..., "text=" + JSON.stringify(lines.map(l => l.text.slice(0, 14))))` |
| 现状 | 当前跑合成图（`测试公司` / `深圳市南山区` 等），无害 |
| 风险 | 同一 runner 若换真实名片 → 真实文字前 14 字符进公开报告 |
| 建议处置 | 与 SD-04(a) 共用同一个脱敏函数；输出 `textLen` + `textHash8` 代替原文 |

### HANDOFF-CONNECT-01 · `P2-LATER` · `@connect *` 收敛

| 项 | 内容 |
|---|---|
| 位置 | `zheliyin-card-assistant.user.js` 的 `// @connect *` |
| 说明 | 其上方已有具名主机（`aip.baidubce.com` 等），`*` 使任何主机都可被 `GM_xmlhttpRequest` 访问 |
| 建议 | 删除 `@connect *`，按需补具名项。**注意**：删除前确认没有动态主机需求 |

### HANDOFF-TOKEN-01 · `P2-LATER` · access_token 明文存 GM

| 项 | 内容 |
|---|---|
| 位置 | `zyBaiduToken` / `zyBaiduTokenExpiryAt` |
| 说明 | AK/SK 已 AES-GCM 加密，但短期 token 仍明文。**不写日志**，泄漏面较小 |
| 建议 | 复用 `credential-crypto.js` 加密；优先级低 |

---

## 已确认无需处理（供参考，避免重复排查）

| 项 | 结论 |
|---|---|
| 硬编码真实密钥 | ✅ 无。全树仅 `runtime/stage5-5b-p4.js` 的 `FAKE_AK`/`FAKE_SK` 假值 |
| 凭据写入日志 / DOM | ✅ 无。`ocrLog` 只输出阶段名 + 计数 + 耗时 + 错误码 |
| `GM_setValue` 存图片 | ✅ 无。仅存配置 / 密文 / KEK / token / UI 状态 |
| 本地成功时误发云端请求 | ✅ 结构不可达 —— `decideFallback` 仅被 4 处**失败分支**调用 |
| 非 auto 模式外传 | ✅ 不可能 —— `mode !== "auto"` 直接 `stop` |
| 上传整画布 / 网页截图 | ✅ 无 —— 只上传所选**单张**图片的 dataUrl |
| 版本四处不一致 | ✅ 已一致（`0.3.6.0` / manifest `0.3.6`） |

---

## 维护规则

1. AI-2 **只追加与勾选**，不改 AI-1 的实现文件。
2. 每项必须含：文件 + 行号 + 现状实测 + 建议处置 + 建议 commit 形状。
3. 判定"当前无泄漏"必须给**实测依据**，不得只写"设计上不会"。
4. AI-1 完成后不必回写本文件；AI-2 在下一轮复核时更新状态。
