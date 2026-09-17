# Execution Record 001 — Stage 5.6 OCR-only Demo：真机回归 22/22 PASS

> 记录 001（延续 stage-5.5b/008 序号体系，本阶段独立目录）。
> 时间：2026-09-17；分支 `demo`；本地 HEAD 与 `origin/demo` 对齐后开始（`604f552`）。

## 一、执行目标

按用户指令「Demo OCR-only 化：UI 架构审计、最小停用套版、真实回归」完成交付 B 的真机验证：

1. OCR-only 默认 UI：旧套版浮窗 `#zy-card-assistant` 不挂载；原生右栏 OCR 抽屉 `#zy-native-ocr-panel` + 工具按钮独立工作。
2. OCR 主链三场景真机回归（背景图 / 选中图 / 早点击）：Native OCR → Local Tesseract → Candidate → Mapper → Textbox（created>0、editable、errors=[]）。
3. 套版代码保留证明：GM 开关 `zyShowTemplatePanel="1"`（官方脚本值通道）→ 浮窗恢复 + 套版按钮齐全；清除后回 OCR-only。
4. 回滚清理与 SPA 防重。

## 二、相关提交（本轮）

| commit | 内容 |
|---|---|
| `e0abcf0` | docs: stage-5.6 UI 架构审计（交付A）+ 用户指令归档 |
| `45eb057` | feat: OCR-only demo（停用套版浮窗挂载、样式/页桥/更新检查前置、v0.3.7.0 四版本同步） |
| `604f552` | test: p5 OCR-only harness（v1：基于 chrome.storage 探测恢复开关，restore 场景 PENDING） |
| 本轮新增 | test: harness v2 恢复开关改官方 serviceWorker/value API（详见下文） |

## 三、关键问题与修复链路（诚实记录）

### 3.1 问题：restore 场景无法动态置位 GM 开关（v1 harness 暴露）

- 现象：`storage-key-discovered` FAIL → `restore-panel-appears` 标记 PENDING（v1 报告 errors=2，OCR 三场景已全 PASS）。
- 根因调查（3 轮 probe，均落盘 `runtime/reports/probe-*`）：
  1. ScriptCat 的 GM 值**不**以可读名形式存在于 `chrome.storage.local`（全量 18 key 扫描无 zy*，仅 `value:<uuid>` / `script:<uuid>` / `compiled_resource:*` 等）；
  2. 直接改 `value:<uuid>.data.zyShowTemplatePanel` 不生效 —— 引擎在 SW 侧有缓存与回写，绕过官方通道的写入会被覆盖（probe-gm-value-shape v1 实测 legacy 未出现）；
  3. 从扩展源码（`runtime/vendor/scriptcat/src/chunk.js` 模块 45868）确认**官方通道**：`serviceWorker/value/getScriptValue` / `serviceWorker/value/setScriptValues`（注意：**setScriptValue 单数未注册**，报 "no such api value/setScriptValue"）；值编码 `[0,v]=有值 / [1]=undefined(删除)`（模块 74310 `_8`）。
- 修复：harness v2 用 `chrome.runtime.sendMessage({action:"serviceWorker/value/setScriptValues", data:{uuid, keyValuePairs:[["zyShowTemplatePanel",[0,"1"]]], ts}})`；清除用 `[1]`。
- 验证：probe-gm-value-shape.json（官方通道 → 浮窗出现；[1] → 恢复 OCR-only）→ 复跑完整 harness 全 PASS。

### 3.2 结论（教训）

- ScriptCat 脚本 GM 值只能经官方 `serviceWorker/value/setScriptValues` 读写；测试工具不得直接操作 `chrome.storage.local` 的 `value:*`。
- 旧 `p4 harness resetMainStorage`（扫描 `/zyBaidu|zyOcrMode/` 删 `chrome.storage.local`）实际扫不到 GM 值键 —— 此前的「删除」多半为空操作，P4 断言不受影响因运行序重置后重存。后续如需清存储应改用官方通道。

## 四、测试命令与结果

- 单测：`node tests/editor-object-model/run.js` → **12 套件全 PASS**（含 baidu-provider 18、fallback-policy 14、credential-crypto 9）。
- 语法：`node --check zheliyin-card-assistant.user.js` / `extension/assistant.js` / `runtime/stage5-5b-p5-ocr-demo.js` → 全 OK。
- 真机：`node runtime/stage5-5b-p5-ocr-demo.js`（Playwright + 真实 ScriptCat + 真实折立印编辑器 `thirdDiyAdd.do`，persistent profile-usc3）→ **22/22 PASS，errors=0，pending=[]**。

### 逐项（报告 `runtime/reports/stage5-5b-p5-ocr-demo-report.json`，证据 `docs/evidence/stage-5.6/`）

| 步骤 | 结果 | 关键证据 |
|---|---|---|
| install-userscript | PASS | status=1（REAL_SCRIPT_CAT_INSTALL） |
| ocr-drawer-mounted / drawer-unique / tool-btn-unique | PASS | 抽屉 1、工具按钮 1、ready=true |
| **legacy-panel-hidden** | PASS | default 下 `#zy-card-assistant` 不存在（legacyCount=0）——OCR-only 默认成立 |
| status-node-single | PASS | .zy-status 仅 1（原生抽屉） |
| 场景 A（背景图+无选中）| PASS | 已生成 3 个文字；读回 3 textbox 全 editable；回滚 removed=3、bg 清除 |
| 场景 B（选中 Image 对象）| PASS | 已生成 2 个文字；回滚 removed=2 |
| 场景 C（早点击）| PASS | 抽屉一出现立即点击 → 自动等编辑器（early）→ 已生成 3 个文字（first-image 兜底）；回滚 removed=3 |
| refresh-no-dup-ocr-only | PASS | 抽屉/按钮仍 1，浮窗仍无 |
| **restore-api-write** | PASS | `serviceWorker/value/setScriptValues` code=0 |
| **restore-panel-appears** | PASS | 写 `[0,"1"]` 后浮窗出现 legacyCount=1 |
| **template-buttons-present** | PASS | parse/append/front/back/fields/raw/ocrInPanel/probe 全 true —— 套版代码保留（动态证明） |
| **restore-cleared-ocr-only-back** | PASS | 写 `[1]` 后刷新回 OCR-only |
| cleanup-userscript | PASS | 脚本移除 |

日志（[zy-ocr]）关键序列：`CANVAS_READY(w=871.5x530.2 bg=true active=null)` → `PREPARING kind=background-image 900x1200` → `LOCAL_LOADING(66695 chars)` → `LOCAL_RECOGNIZING lines=3` → `BUILDING items=3` → `SUCCESS created=3`（三场景同构，A/B/C 状态机全通）。

## 五、修改文件清单

- `runtime/stage5-5b-p5-ocr-demo.js`（v2：restore 场景改官方 API）
- 新增 probe（测试工具）：`runtime/probe-gm-storage-key.js`、`runtime/probe-gm-api.js`、`runtime/probe-gm-api2.js`、`runtime/probe-gm-storage-location.js`、`runtime/probe-gm-value-shape.js`
- 证据 `docs/evidence/stage-5.6/`：stage5-5b-p5-ocr-demo-report.json、probe-gm-value-shape.json、probe-gm-api2.json

## 六、验收口径对本轮的意义

- Demo 用户视角：打开折立印 → 原生右栏「图片文字识别」抽屉（识别方式/识别当前图片/状态/百度设置）→ 识别 → 生成可编辑文字；套版浮窗不再作为主入口。
- 仓库：套版全部代码保留（静态：本期未删任何套版函数/模块；动态：恢复开关浮窗重建含全部套版按钮）。
- 隐藏 vs 删除：**仅停用挂载（隐藏入口）**；`renderPanel`/`bindPanel`/`parseFields`/`applyFieldsToPage`/field-core/config-core/bridge/legacy 全部保留。

## 七、PASS / FAIL / PENDING / BLOCKED

- OCR-only UI 断言：PASS（5/5）
- OCR 三场景：PASS（A/B/C 全，created>0、editable、errors=0）
- 刷新防重 / 回滚：PASS
- 恢复开关动态证明（套版保留）：PASS（官方 API 通道）
- 单测：PASS（12 套件）
- PENDING / BLOCKED：无

## 八、下一步

- 将本次经验归档到项目记忆（ScriptCat GM 值官方通道约束）。
- 等 OCR-only Demo 稳定后，继续 P5 Geometry / Rotation / Multi-size / Duplicate / Rollback / 更高精度重建（用户已确认顺延）。