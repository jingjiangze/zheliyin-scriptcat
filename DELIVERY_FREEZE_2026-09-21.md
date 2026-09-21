# 折立印名片套版助手 —— 交付冻结文档（Delivery & Freeze Record）

> 仓库：https://github.com/jingjiangze/zheliyin-scriptcat
> 冻结时间：2026-09-21（TRAE SOLO CN 会话 6aaf97a91b7bf44f3c4933e4 收尾）
> 冻结姿态：**项目暂时冻结**。工作分支 HEAD：test == stage-9-altq-baidu-reconstruction == c537610（Commit 4.4 完成态）。
> 本文档同时总结「GitHub 仓库全部内容」与「本地工作区全部内容」，作为阶段性交付与冻结基线记录。

---

## 1. 项目概况

- **产品形态**：Tampermonkey/ScriptCat userscript —— 在第三方名片 DIY 设计器（diy.zheliyin.com）内识别客户名片资料并自动创建文字图层（OCR → Native 文字创建链路）。
- **入口文件**：`zheliyin-card-assistant.user.js`（v0.3.11.54，当前 test 分支；demo 分支为 0.3.11.49 发布轨）。
- **技术栈**：原生 JS userscript + fabric.js（编辑器侧）+ Playwright 真机 Harness（runtime 验证侧）+ 本地 Tesseract.js（local fallback）+ Baidu OCR（云端 fallback）+ 折立印 Native OCR（uploadOCR.do textType=2，文字真值唯一来源）。
- **核心架构**：OCR 只提供位置/几何（geometry evidence），文字真值由 Native OCR 提供；1 OCR Block = 1 textbox；Native Create（CanvasDiy.drawText）为唯一生产创建路径。

### 1.1 分支健康度

| 分支 | 提交数 | 最后提交 | 定位 |
| --- | --- | --- | --- |
| main | 86 | 2026-09-16 | 历史主干（Golden Master 基线 v0.3.0.0） |
| demo | 451 | 2026-09-21 | 唯一公开发布轨（0.3.11.49，@require 全部指向 demo/） |
| test | 543 | 2026-09-21 | 内部开发轨（当前冻结 HEAD） |
| stage-9-altq-baidu-reconstruction | =test | =c537610 | OCR-P1 Commit 1-4 双分支同步轨（与 test 同 HEAD） |
| 其余 stage-*/ 分支 | — | 2026-09-16~20 | 各阶段历史证据分支（均已推送，SHA 与远程一致） |

### 1.2 Tags（14 个，已全部推送）

`v0.3.0`、`stage-1-baseline/-complete`、`stage-2-baseline/-complete`、`stage-3-baseline`、`stage-3-complete`、`stage-3.1-complete`、`r0-audit` 与 `checkpoint-8a2-*`（3 个）、`checkpoint-8b-before-reconstruction-engine`、`checkpoint-8d-before-ocr-quality`。

---

## 2. GitHub 仓库全部内容

Git 跟踪文件共 **1069 个**（其中 Markdown 127 个）。顶层结构：

| 目录/文件 | 类型 | 说明 |
| --- | --- | --- |
| zheliyin-card-assistant.user.js | 单文件 | userscript 主入口（v0.3.11.54，@require 28+ 条指向 test/） |
| extension/ | 源码 | 全部生产模块（OCR/Editor/Field/Core/AI 五域，57 文件在 src/） |
| runtime/ | 工具 | Playwright 真机 Harness 与探针（735 文件，含 stage9 等 22 个单测） |
| tests/ | 测试 | 模块级单元测试（55 文件，含 editor-object-model/） |
| docs/ | 文档 | 103 个阶段报告与契约文档 |
| handoff/ | 交接 | AI_HANDOFF/AI_KNOWN_FACTS/AI_NEXT_TASK 等连续工作文档（26 文件） |
| project-history/ | 历史 | 迁移记录 + AI 开发历史（65 文件） |
| installer/ | 安装 | installer.ps1（Windows ScriptCat/浏览器安装脚本） |
| release/ | 发布 | production-manifest.json（发布清单，28 条 @require 指向 demo/） |
| .github/workflows/ | CI | build-exe.yml |
| 根目录 *.md（21 个） | 文档 | ARCHITECTURE_AUDIT / CHANGELOG / DEPENDENCY_MAP / 各 STAGE_N_REPORT 等 |
| package.json / package-lock.json | 工程 | runtime Harness 依赖（playwright ^1.63.0，devDependency） |

### 2.1 extension/src 生产模块

| 域 | 文件数 | 代表模块 |
| --- | --- | --- |
| ocr/ | 29 | baidu-provider、native-ocr-provider、native-geometry-aligner、native-geometry-recovery（Commit 1-4 核心）、native-completeness-gate、text-truth-gate、transaction-identity、recognition-mode、ocr-quality、fallback-policy、candidate-normalizer、ocr-candidate-gate、credential-crypto 等 |
| editor/ | 21 | page-bridge（冻结区）、image-transform、image-space、image-containment、multiline-typography、text-fit、text-fit-fusion、ink-measure、image-ink-target、native-color、native-anchor-matcher 等 |
| fields/ | 1 | field-core |
| core/ | 1 | config-core |
| ai/ | 1 | ai-client |

### 2.2 docs/ 文档分类（103 个）

- **Stage 报告**：STAGE_1 ~ STAGE_10C 系列（STAGE_5_*、STAGE_8A2_*、STAGE_9_*、STAGE_10A/10C 等）
- **契约/审计**：STAGE_8B_COORDINATE_CONTRACT、STAGE_8A2_NATIVE_IMAGE_OBJECT_CONTRACT、STAGE_10C_NATIVE_LAYER_CONTRACT、NATIVE_FIRST_POLICY、OCR_IMAGE_DELIVERY_AUDIT、EDITOR_OBJECT_MODEL 等
- **真机证据**：REAL_OCR_EVIDENCE、SESSION_PARITY_REPORT、SAVE_RELOAD_RUNTIME_REPORT、DEMO_REAL_MACHINE_TEST、STAGE_9_9_FULL_PIPELINE_REPORT 等
- **子目录**：ai-instructions/（AI 工作指引）、evidence/、execution-records/

### 2.3 runtime/ 真机 Harness

| 子目录/文件 | 说明 |
| --- | --- |
| stage9/ | OCR-P1 主线：22 个 *.test.js 单测 + commit-4-real.js、partial-sidecar-recovery.js、font-target-ab.js、stage-9-9-full-pipeline.js 等真机 runner |
| reports/ | 全部运行证据 JSON（stage-9/、stage-8a*/、p0/、release/ 等子目录 + 顶层探针报告） |
| browser/ | Playwright 持久化浏览器 profile（**gitignore，不入库**） |
| vendor/ | ScriptCat 扩展等本地依赖（**gitignore，不入库**） |
| 顶层 *.js（约 130 个） | 各阶段 probe/runner：p0-*、stage5-6-*、stage-6-2-*、stage-7-3-*、probe-* 等 |
| scriptcat-adapter.js | 仓库级脚本管理适配器（register/remove） |

---

## 3. 本地工作区内容（D:\zheliyin-scriptcat）

磁盘文件总计 **2865 个**（含 gitignore 项，实际入库 1069 个）。

### 3.1 入档部分（与 GitHub 一致）

见 §2 全部内容。核实方法：`git status` 工作树 clean；`git ls-files` 1069 文件；双分支 test == stage == c537610。

### 3.2 本地独有（gitignore 忽略，不入库）

| 路径 | 文件数 | 内容/用途 |
| --- | --- | --- |
| node_modules/ | 183 | playwright 依赖（package-lock 已入库，重装即可） |
| runtime/browser/profile*/ | ~1500 | Playwright 持久化 profile（登录会话、cookies——**含凭据，严禁入库**） |
| runtime/vendor/ | 97 | ScriptCat 扩展（ndcooeab…）本地副本 |
| runtime/downloads/ | 171 | Tesseract.js wasm / 测试素材下载缓存 |
| runtime/reports/screenshots* / err-png/ 等 | — | 真机截图、失败现场图（不入库） |
| storage-state/、playwright-profile/、*.session、.cookies | — | 会话残留（未创建/已忽略） |

### 3.3 凭据处置（已在 UNRESOLVED / 环境变量约定中说明）

- Baidu AK/SK、折立印 Cookie 仅存在于运行时环境变量（ZY_BAIDU_AK/SK、ZY_STAGE9_COOKIE）与本地 temp job state；**任何报告文件只记名不记值**。
- 真机 runner 强制要求 env 注入，不伪造凭据。

---

## 4. 测试与验证状态（冻结时刻）

- Stage 9 单测：**22 个文件全绿（0 regression）**，覆盖 Commit 1-4 全部新增模块（geometry-space 22 / native-anchor-recovery 14 / editor-object-identity 8 / geometry-occupancy 7 / image-ink-recovery 5 / rotation-recovery 6 / native-geometry-recovery 28 等）。
- Commit 4 真机验收：CASE 4-A/A2/B/C/E/G 全 PASS（native=15 手写体行；NATIVE_ANCHOR 命中 + 身份复用 + 旋转 containment 越界拦截 + partial create + ImageInk 不猜 全部证据化）。
- Commit 3c 结论保留：**LOCAL real-device successful recovery = UNRESOLVED**（不因冻结改写）。

---

## 5. 冻结声明与后续注意事项

1. **冻结边界**：test 与 stage-9-altq-baidu-reconstruction 停在 c537610；demo 停在 8cf1f3a 之后发布链（0.3.11.49）；main 不动。
2. **解冻后接续点**：
   - OCR-P1 Commit 5 / Stage 11 Style Reconstruction（FontFamily/FontWeight/FontStyle/LineHeight/CharSpacing/TextAlign）——生产接线暂停中，升级须先完成 Stage 10-C Native Text Creation Contract 审计。
   - LOCAL real-device successful recovery 补测（需可写会话）。
3. **禁改区域**（历史冻结令持续有效）：page-bridge.js 主创建路径、CanvasDiy.drawText、Native Layer Contract、1 OCR Block = 1 textbox、Partial Create 语义。
4. **重新上电流程**：`git checkout test` → `npm ci`（恢复 playwright）→ 注入凭据 env → `node runtime/stage9/commit-4-real.js --selftest` → `node _run_stage9_reg.js`（22 文件回归）→ 真机重跑 CASE。

---

*文档由 TRAE SOLO CN 生成，与 Git 提交 c537610（test/stage-9-altq 双分支）同步。*
