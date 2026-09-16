# 003 执行记录 — P1 Canvas/Editor Readiness 真机全 PASS（GATE 通过，进入 P2）

- 时间：2026-09-16
- 当前 branch：`demo`
- 关键 commit：`bb34fec fix: ocr executor syntax ... + waitForOcrTarget ...`
- 执行目标：P1 最终回归——修复 executor 语法缺陷后，三个场景（A 背景图 / B 选中图 / C 过早点击）真机验证；达到指令 §9-§12、工程计划"P1 场景 1-5"全部要求。

## 前一轮失败与根因（回归链）
- v2：executor 120s 超时 + pageErrors `Unexpected token ')'`×2。node 复现（真实引擎文本 + 逐字符拼接）：**原 userscript executor 尾部括号不平衡，语法错误 → 注入脚本未执行 → message 无人监听 → 死等超时**；而 5.5A harness 版 PARSE OK。归类：实现 bug（executor 字符串），非 OCR 核心、非测试 bug。
- 修复（bb34fec）：executor 尾部改为与 5.5A 验证版一致结构（`}); })).catch(...); }); })();`）；node 重测 PARSE OK。另加 `waitForOcrTarget`（早期点击时模板图片尚未加载 → 轮询 ocrPrepare 直至目标出现或确定性失败，非固定 sleep）。

## 测试命令
`node runtime/stage5-5b-p1-diagnose.js`（Playwright + 真实 ScriptCat + 真实 diy.zheliyin.com 编辑器，profile-usc3）

## 测试结果（errors=[]，全部 PASS）
| 步骤 | 结果 | 关键证据 |
|---|---|---|
| cleanup / install | PASS | 无历史脚本；status=1 |
| TIMELINE | PASS | panel@1967ms canvas@3053ms |
| ui-ocr-btn | PASS | panels=1、ocrBtn/probeBtn/statusNode 存在 |
| **Case A 背景图 + activeObject=null（§11）** | PASS | ocrPrepare kind=**background-image** 900×1200 → LOCAL 识别 → **已生成 5 个文字（可双击编辑）**（1.4s） |
| A readable-textbox | PASS | 5 个 textbox 均 editable=true（测试 公司 / 折 立 印 设计 / 13800138000 / WecChat: abc123 / 深圳 市 南山 区…）；OCR 少量错字属识别质量，不影响集成判定 |
| **Case B 选中图（§12）** | PASS | kind=**active-image** 980×1264 → 已生成 3 个（1.4s） |
| **Case C 过早点击（§9 情况 B）** | PASS | 状态序列：正在等待编辑器加载… → 正在准备图片… → 识别中 → **已生成 3 个文字**（2.9s）；kind=first-image（模板首图） |
| Rollback（§27） | PASS | removed=8（5+3）→ totalAfter=21（原始）→ bgAfter=false |
| console | - | CANVAS_READY / PREPARING / LOCAL_LOADING(66695 chars) / BUILDING / SUCCESS 全链日志 |
| pageErrors | PASS | 仅编辑器噪音 `window.closeSocket is not a function`（无我们注入脚本错误） |
| Local-first | PASS | 本地成功路径无任何 Baidu request 日志 |

## P1 Gate 判定
- page-world Canvas 唯一经 Bridge 获取 ✓；getCanvasInfo / ocrPrepare PASS ✓
- Case A / B / C PASS ✓；Early Click 显示等待状态 + ready 后自动继续 ✓
- backgroundImage 合法 OCR source ✓；activeObject=null 可识别 ✓；优先级 active→background→first 符合预期 ✓
- Local Tesseract 可启动并完成识别 ✓；无 fixed sleep（waitForCanvasReady/waitForOcrTarget 轮询真实状态）✓
- **P1 = PASS → 允许进入 P2**（指令：P1 未通过不得进入 P3；未交付不得进入下一阶段 —— 本记录即交付）

## 证据
`runtime/reports/stage5-5b-p1-diagnose-report.json` = `docs/evidence/stage-5.5b/stage5-5b-p1-diagnose-report-v4.json`（v3 全绿版）

## 下一步
P2-A 原生 Panel DOM 审计（`runtime/stage5-5b-p2-panel-audit.js`，profile 已释放）；按审计结论 → P2-B 接入原生区域 → P2 Gate。之后 P3（Native→Local→Textbox 统一候选边界）等。