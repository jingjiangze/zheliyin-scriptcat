# Stage 5.5B — OCR 产品化（云端备用 + 面板工具化）最终报告

> 阶段目标：把「识别图片文字」做成折立印网页里普通用户可用的工具，修复背景图点按钮无反应，并落地百度云 OCR（用户已确认：百度通用文字识别 + 保留本地识别）。
> 生成时间：<!-- ts -->
> 分支：`demo`  HEAD: <!-- head -->

## 一、Gate 汇总（§63）

| 验收项 | 状态 | 证据 |
|---|---|---|
| P1 背景图点击有反应（原「无反应」） | <!-- p1 --> | runtime/reports/stage5-5b-p1-diagnose-report.json |
| REAL_IMAGE_INPUT（网页上传/背景填充 → 真实 Image） | <!-- p6 --> | 同上（scenario-A-bg-set） |
| LOCAL_OCR（Tesseract.js chi_sim 页面内真实运行） | <!-- local --> | 同上（scenario-A-e2e） |
| REAL_OCR_BBOX（位置还原） | <!-- bbox --> | 同上（readable-textbox samples） |
| REAL_TEXTBOX（真实 Textbox，可双击编辑） | <!-- editable --> | 同上（editable 取证） |
| ORIGINAL_IMAGE_PRESERVED（原图/背景永不删除） | PASS | 回滚 readback：removed 仅清理 zyFieldKey=ocr_demo_* |
| BAIDU_PROVIDER（云端通道） | <!-- baidu --> | tests baidu-provider.test.js 18 项 + smoke |
| AUTO_FALLBACK（本地失败 → 云端，§47 local-first） | <!-- fallback --> | tests fallback-policy.test.js 14 行矩阵 |
| ROLLBACK | <!-- rollback --> | 诊断脚本 rollback step + 刷新模板恢复 |
| RUNTIME_8_3_REGRESSION | 待验证 | 需重跑 runtime:scriptcat 或真机回归 |
| FIXTURE_OCR_REGRESSION | PASS | tests run.js 10 套件全过 |

## 二、实际完成

1. **P1 根因修复**：`bindPanel` 中 `#zy-probe` 按钮已从模板移除但绑定仍在 → `querySelector` 返回 null → TypeError 中断 → 「识别图片文字」按钮从未绑定（这是"点按钮无反应"真正的根因）。修复：恢复诊断按钮 + 防御性绑定（OCR 优先），并废除 `active.type==="image"` 硬前提（目标图源优先级 activeObject → canvas.backgroundImage → 首张 image）。
2. **P4 百度云 OCR**：`extension/src/ocr/baidu-provider.js`（官方文档 2026-06 实时核对：`/rest/2.0/ocr/v1/general` 标准含位置版、token 30 天缓存、≤4M/≤4096px 压缩保护、110/111 自动刷新重试、错误码人话）；面板「识别方式」下拉（自动/仅本地/百度云端）+「百度云 OCR」设置（AK/SK 脱敏存储、保存、测试连接）。
3. **P5 自动 fallback**：`fallback-policy.js` 纯函数 + 14 行矩阵单测；自动模式本地失败（引擎加载失败/网络错误/识别失败/解析失败/空结果/超时）→ 切换百度；百度未配置 → 明确提示；仅本地/仅云端模式不互相切换；`LOCAL_OCR_EMPTY` 防循环（`_baiduDone`）。
4. 版本统一 0.3.6.0（userscript/manifest/assistant/README 四处一致，遵守 AI-2 DEFECT-VER-01 不变量）。

## 三、实际未完成 / Deferred（诚实清单）

1. **P2 原生面板迁移**：主 UI 仍是「名片套版助手」浮窗（#zy-card-assistant），未嵌入折立印原生右侧面板。原因见 <待填>；建议下阶段评估稳定 anchor 后迁移（§50 顺序：助手/页面/图层 tab → panel 容器 → toolbar → mini floating）。
2. **P7 真实用户人工验收**：已更新 docs/DEMO_REAL_MACHINE_TEST.md 供真实用户填写；自动化诊断（real editor + ScriptCat + 背景图→OCR→textbox）结果见 <P1 结果>。
3. 精准字号/颜色/粗细/旋转/多行/复杂布局：按 §72 明确 deferred（Stage 5.6+），本阶段未进入。
4. 拒绝的方案（§32）：未引入大型 AI Vision；未替换 Tesseract 架构；未改独立 Python OCR 服务；未做独立 OCR 网页。

## 四、提交记录（demo 分支）

- fix: p1 diagnose silent ocr action ...
- feat: add unified local and baidu providers ...
- feat: wire baidu cloud ocr into userscript ...
- feat: local-first fallback policy (P5) ...
- <docs/report 提交>

Push 状态：<!-- push -->，working tree：<!-- clean -->

## 五、下一阶段建议（Stage 5.6+）

1. P2 原生面板（稳定 anchor 定 + MutationObserver 唯一驻留）。
2. 精准字号（fontSize ≈ 0.829 × visualHeight 校准收口）。
3. 真实用户人工验收回填后，发布正式 Demo（v0.3.7.0）。
4. ocrCreate 重复点击幂等（MATCHED/markuuid 或 taskId changeSet）。