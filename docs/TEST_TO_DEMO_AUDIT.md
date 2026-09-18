# TEST_TO_DEMO_AUDIT.md — test → demo 晋级审计

> 时间：2026-09-18 | SOURCE=test(7b46dd4→+晋级前2 commit) | TARGET=demo(e5cadf5)
> 关系：demo 是 test 祖先（merge-base --is-ancestor 通过）= 纯 fast-forward
> 范围：64 个 commit 分类（e5cadf5..test），不重构 test 历史

## 1. 分类总表

| 分类 | 代表 commit | 是否进入 demo | 原因 |
|---|---|---|---|
| userscript（主运行文件） | 晋级前新增 URL 回收 commit | 是 | Demo 主运行文件；P0 真机验收版本 |
| extension/src/editor/page-bridge.js | 9081201(isDisplay 1→0) / cea831b(save-chain 序列化修复) | 是 | P0 生产修复（服务端单变量+真机验收确认） |
| OCR 生产（cloud-primary/本地 fallback/质量门） | 25af82c / 0d041d6 | 是 | 已真机验证，与 P0 闭环一致 |
| 编辑器页解析器（front/back 基础） | ded455c | 是 | Stage 7.1 已验收基座 |
| @require 版本同步 0.3.10.2 | 0b16a99 | 是 | 版本一致性铁律 |
| object-model | 保持 test 当前状态 | 是（原样带入，不再修改） | 只读归一化/诊断，本轮不触碰 |
| runtime/p0（harness） | runner.js / ocr-real-runner.js / session-adopt.js / 探针 | 是（仓库保留测试工具；不参与用户脚本运行时） | 项目既有 demonstration 纪律：runtime/ 随仓库演进 |
| runtime/reports（证据 JSON/PNG） | ocr-runtime / control-result / stage-7-3-* | 是 | 证据归档纪律 |
| 临时探针/诊断脚本（runtime 顶层 *.js） | p0-font-print-probe / relogin-probe v2-v7 / stage-6-2 / stage-7-3 等 | 是（仓库保留）；不进入任何安装载体 | 一次性取证工具，与生产互不影响 |
| 文档 | docs/*.md, handoff/*, THIS FILE | 是 | 证据/交接纪律 |
| 账号/密码/敏感数据 | 557aa63(清硬编码) / 4187e0b(证据脱敏) | 严格脱敏，无明文 | 全仓 secret 扫描无凭证残留 |

## 2. demo 晋级前最小修正（已单独 commit）

1. **userscript URL 分支回收**：ae4826c 曾将 @require/@updateURL/@downloadURL/UPDATE_URL/DOWNLOAD_URL 临时指向 `test` 分支（标注"合流时改回 demo"）。晋级前回收为 `demo` 分支（13 处 URL 行），版本保持 0.3.10.2，功能零改动。
2. **本审计文档**独立 commit。

## 3. 版本核对（晋级目标态）

- userscript @version = 0.3.10.2
- const VERSION = 0.3.10.2
- 9× @require ?v=0.3.10.2（指向 demo 分支）
- extension/assistant.js VERSION = 0.3.10.2
- extension/manifest.json version / version_name = 0.3.10.2
- 不升 0.3.10.3（P0 验收即此版本）

## 4. 关键生产内容确认（demo 晋级后复核项）

- page-bridge.js `buildTextMediaEntry`：`isDisplay: 0`（唯一生产写入点）
- 无 `isDisplay: 1` 生产残留（历史探针/报告中的 1 仅属测试/证据，已区分）
- OCR 链路：cloud-primary → local fallback（质量门），TextBlock→ocrCreate→drawText 原生链路不变

## 5. 明确不修改

本轮禁止改动：OCR 核心流程 / TextBlock / Native drawText / isDisplay / object-model / geometry / style / 核稿逻辑 / 登录逻辑。均为已验证状态，仅做版本晋级。

## 6. 晋级方式

demo fast-forward 到 test HEAD（含 2 个晋级前 commit）→ push origin/demo；main 不动。