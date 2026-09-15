# ARCHITECTURE_AUDIT.md — R0 完整代码审计

> 审计目标：`jingjiangze/zheliyin-scriptcat`
> 主脚本：`zheliyin-card-assistant.user.js`（约 1540 行）
> 审计日期：2026-09-15 | 性质：**只读审计，未改动任何源码**
> Golden Master：见 `BEHAVIOR_BASELINE.md §1`

---

## 1. 一句话架构

```
ScriptCat/浏览器扩展 userscript（单文件 IIFE）
 → UI/State（面板、字段表单、按钮）
 → 本地字段规则（分面 → 字段抽取，本地规则优先）
 → AI 辅助（可选；分面+抽字两个请求，失败回退本地）
 → postMessage Bridge（页面注入脚本 → 设计器 canvas）
 → 折立印设计器（已有图层优先填充 / 不足才新建克隆层 / 助手层标签清理）
```

## 2. 仓库结构审计

| 目录/文件 | 用途 | 实际入口 | 运行时依赖 | 仅构建/安装 | 可删除性 | 风险 |
|---|---|---|---|---|---|---|
| `zheliyin-card-assistant.user.js` | 主业务脚本（v0.3.0.0） | `document.readyState` → `renderPanel()` | 是 | 否 | 否 | 版本历史与 `@version` 不一致（详见 §4.6） |
| `extension/manifest.json` | 浏览器扩展 MV3 清单 | chrome 加载 | 是 | 否 | 否 | `all_frames:true`（2026-09-10 已修 iframe 兼容） |
| `extension/gm-shim.js` | GM_* 兼容层（localStorage/fetch） | manifest js 数组第 1 项 | 是 | 否 | 否 | 与主脚本经 `assistant.js` 间接同步 |
| `extension/assistant.js` | 主脚本主体（去 metadata） | manifest js 数组第 2 项 | 是 | 否 | 否 | 由 PowerShell 从 userscript 自动生成，需保持同步 |
| `installer/installer.ps1` | ps2exe 一键安装器源码 | 双击/ps2exe 编译 | 否（打包时） | 是 | 可选（若弃 ps2exe） | 打包方式已标记可替换（C# 原生待定） |
| `.github/workflows/build-exe.yml` | 自动构建 exe + tag 发 Release | push main / tags `v*` | 否 | 是 | 否 | 构建链已验证通过 |
| `README.md` | 项目说明（存于 GitHub，本机未持有副本） | — | 否 | — | 否 | 本地无法核对行为约定原文，以对话记录与上传 R0 指令为准 |
| 本机 `ARCHITECTURE_AUDIT.md` 等 6 份 R0 文档 | R0 产出 | — | 否 | 是 | — | — |

> 说明：本机无 git 工作区，仓库事实以 GitHub API 抓取为准（main=6c19b46；唯一 tag v0.3.0@d03e014）。

## 3. 主脚本功能分区审计（逐函数）

### 3.1 Bootstrap / 常量 / 状态

| 函数/区块 | 行号 | 职责 | DOM | GM | Bridge | AI | 业务规则 | 适合迁移 | 迁移风险 |
|---|---|---|---|---|---|---|---|---|---|
| Metadata | L1–29 | @match/@grant/@connect | — | — | — | — | — | 否（userscript 契约） | 低 |
| 常量区 | L34–48 | 版本/来源/URL/电话正则 | — | — | — | — | 部分（正则） | 是（`src/core/constants.js`） | 低 |
| `state`+`emptyFields` | L60–83 | 运行状态 + 11 字段模型 | — | — | — | — | 是（schema） | 是（`src/fields/model.js`） | 中（对外兼容面） |

### 3.2 Config / 持久化

| 函数 | 行号 | 职责 | 依赖 |
|---|---|---|---|
| `getConfig` | 85 | 读 apiKey/baseUrl/model | GM_getValue |
| `saveConfig` | 93 | 写回 | GM_setValue |
| `applySavedPanelPosition` | 395 | 面板位置恢复 | GM_getValue |

### 3.3 UI 层

| 函数 | 行号 | 职责 | 备注 |
|---|---|---|---|
| `addStyles` | 99 | 全量 CSS（约 160 行） | DOM |
| `renderPanel` | 262 | 整块面板 HTML 渲染 | DOM、GM、注入 bridge |
| `renderFieldInputs` | 325 | 字段表单（正/反两区） | DOM、normalizeFields |
| `renderSideTextInputs`/`renderSideTextArea` | 345/384 | 正/反面文本编辑 | DOM、state |
| `bindPanel` | 358 | 6 个按钮事件 | DOM、各业务入口 |
| `readSideTextFromPanel`/`readFieldsFromPanel` | 377/507 | 面板→state 回读 | DOM |
| `rebuildFieldsFromSideText` | 389 | 手调分面文本后重抽字段 | 本地规则 |
| `makeDraggable` | 404 | 拖动+持久化位置 | DOM、GM |
| `renderFieldArea`/`setBusy`/`setStatus` | 489/494/501 | 局部刷新/禁用/状态栏 | DOM、state |

### 3.4 业务编排（识别入口）

| 函数 | 行号 | 职责 | 依赖 |
|---|---|---|---|
| `parseFields` | 446 | 识别主入口（**上帝函数**，见 §4.1） | UI+Config+规则+AI+state+apply |
| `parseByRules` | 517 | 纯本地整段解析 | 本地规则 |

### 3.5 本地规则引擎

| 函数 | 行号 | 职责 |
|---|---|---|
| `splitFrontBackText` | 523 | 本地正反面粗分（四步：显式标记→强正→强反→模糊） |
| `splitByExplicitMarkers` | 558 | 「正面/反面」显式标记切分 |
| `isStrongFrontLine` | 594 | 正面强特征行判定 |
| `isStrongBackLine` | 611 | 反面强特征行判定 |
| `isLikelyBackLine` | 620 | 模糊行归类 |
| `isFrontPriorityLine` | 630 | 正面前置纠偏谓词（≡强正） |
| `isCompanyLine` | 634 | 公司行判定 |
| `parseByRulesFromSides` | 643 | **核心抽取器**：公司/姓名/职位/电话/微信/邮箱/网址/地址/主营/反面补充 |
| `stripLabel`/`stripTrailingDept`/`stripBusinessLabel`/`stripBackExtraLabel` | 713–731 | 标签剥离 |
| `isNameExcluded`+`NAME_EXCLUDED_RE` | 733–737 | 姓名排除词 |
| `isAddressLine`/`isBusinessLine`/`isBackExtraLine`/`isLongBackText` | 739–768 | 行类别判定 |

> 以上全部 = **Compatibility Contract**，迁移只能平移、零改动（`src/fields/`）。

### 3.6 AI 辅助

| 函数 | 行号 | 职责 | 备注 |
|---|---|---|---|
| `splitSidesByDoubao` | 770 | 分面调用（自带 HTTP） | 与 parseByDoubao 结构重复 |
| `parseByDoubao` | 831 | 字段抽取调用（自带 HTTP） | 同上 |
| `parseJsonFromText` | 892 | AI 输出容错解析 | 纯函数，适合 `src/core/utils.js` |

### 3.7 字段合并 / 规范化

| 函数 | 行号 | 职责 |
|---|---|---|
| `normalizeFields`/`normalizeArrayField`/`splitList` | 902/921/926 | 清洗、去重、剔重主字段 |
| `mergeFields` | 933 | 本地+AI 合并（AI 值须命中原文+谓词验证） |
| `mergeTwoFields` | 959 | 追加信息合并 |
| `rawIncludes`/`cleanMultiline` | 971/977 | 子串匹配/多行清洗 |

### 3.8 Bridge（触发侧）

| 函数 | 行号 | 职责 |
|---|---|---|
| `applyFieldsToPage` | 981 | 发 apply 消息 |
| `probeCanvas` | 986 | 发 probe（自检） |
| window `message` 监听 | 991 | 收 applyResult/probeResult |

### 3.9 Bridge（页面侧，L1021–L1452，约 430 行）

| 函数 | 行号 | 职责 | 依赖 |
|---|---|---|---|
| `pageBridge`（主监听） | 1021 | 分发 probe/apply | Bridge |
| `post` | 1049 | 回执发送 | Bridge |
| `findCanvasForSide` | 1053 | 按正/反面定位 canvas | 全局对象/require |
| `getLoadedModule`/`findCanvasFromGlobals`/`findCanvasIn`/`unwrapCanvas` | 1076–1129 | canvas 深度探测 | window |
| `getTextObjects`/`isTextObject` | 1131/1135 | 文字层枚举 | canvas |
| `applyFields` | 1144 | 填层主流程 | 全部 editor 能力 |
| `buildItems`/`addMultiItems`/`addItem`/`line` | 1180–1221 | 字段→候选层项 | 业务 |
| `pickObject`/`scoreObject` | 1227/1259 | 选层+打分 | 启发式 |
| `findReferenceObject`/`analyzeLayout` | 1280/1286 | 参考层/布局分析 | 启发式 |
| `createTextObject`/`getReferenceStyle`/`placeCreatedObject`/`setObjectText` | 1306–1431 | 新建/样式克隆/定位/写文本 | fabric |
| `removeAssistantExtras` | 1243 | 清理助手多余层 | 标签 |
| `buildProbeResult` | 1435 | 自检回执 | canvas |

### 3.10 工具 / 更新 / 初始化

| 函数 | 行号 | 职责 |
|---|---|---|
| `clean`/`unique`/`escapeHtml`/`clamp` | 1463/1467/1477/442 | 纯工具 |
| `checkForUpdateSoon`/`checkForUpdate`/`showUpdateLink`/`compareVersion` | 1486–1528 | 每日更新检测+面板链接 |
| 入口 | 1530–1537 | readyState → renderPanel |

## 4. 上帝函数分析（R0 只记录，不拆分）

### 4.1 `parseFields()`（L446–487）
同时承担：读面板输入（#zy-raw）→ 读配置（apiKey/baseUrl/model）→ 写回配置 → 空校验 → busy 锁 → 分面（AI 或本地）→ 本地抽取 → AI 抽取 → merge → 合并追加态 → 刷新 UI → 状态提示 → **apply 到页面** → 异常降级（本地重算+复制）→ 解锁。

- 既做业务又做 IO、既处理 UI 又处理数据、既处理 AI 又处理业务规则、既处理 Bridge 又处理状态：**全部命中**。
- 难单测：7 种外部依赖耦合。属未来拆分重点 → **Parse Orchestrator + AI Client + Field Engine + UI Adapter**。
- `REG-RISK-001`：apply 与识别耦合在 catch 分支，AI 失败时仍 apply 本地结果（行为已存在，勿改变，仅记录）。

### 4.2 `renderPanel()` / `bindPanel()` / `applyFieldsToPage()`（L262/358/981）
- renderPanel：DOM 渲染+样式+桥接注入+位置恢复+更新检测，5 项职责，中耦合。
- bindPanel：仅事件绑定，职责干净。
- applyFieldsToPage：1 行，干净；但业务函数多处直接裸调 `window.postMessage`（§7 风险）。

## 5. Config 审计（R0 只记录，不修改）

| KEY | 默认 | 读取处 | 写入处 | 用途 | 风险 |
|---|---|---|---|---|---|
| `zyArkApiKey` | "" | L87 | L94 | AI Key | `DATA-RISK-001` 明文存储+UI 明文展示 |
| `zyArkBaseUrl` | DEFAULT_BASE_URL | L88 | L95 | AI baseUrl | 与 `zyBaseUrl` 语义重复，命名不一致 → `DATA-RISK-002` |
| `zyArkModel` | DEFAULT_MODEL | L89 | L96 | AI 模型 | 低 |
| `zyBaseUrl` | DEFAULT_BASE_URL | L451 | （面板无入口） | 实际生效的 baseUrl | 无 UI 入口，仅存储可改；与 zyArkBaseUrl 二义性 |
| `zyPanelLeft`/`zyPanelTop` | null | L396–397 | L436–437 | 面板位置 | 低 |
| `zyUpdateCheckedDate` | "" | L1486 | L1488 | 每日更新检测节流 | 低 |

共性：无 `CONFIG_VERSION`、无迁移器、Key 值散落 3 处常量 DEFAULT_BASE_URL/MODEL。→ R2 `src/core/config.js`。

## 6. AI 请求点审计（R0 只记录）

| 点 | 函数 | 行号 | method | auth | timeout | 错误处理 |
|---|---|---|---|---|---|---|
| 1 | `splitSidesByDoubao` | L791 | POST /chat/completions | Bearer | 30000 | HTTP 非2xx→`slice(0,220)`；JSON 错→eject；grant/超时 |
| 2 | `parseByDoubao` | L856 | 同上 | 同上 | 30000 | 同上 |
| 3 | `checkForUpdate` | L1506 | GET（非 AI） | 无 | 15000 | 静默忽略 |

重复面：URL 构建、headers、body 骨架（model/temperature/response_format/messages）、onload 解析、错误处理全部重复 → `AI-RISK-001`（统一 `aiClient.chat()` 目标）。错误**未分类**：401/403/429/5xx/超时/网络/JSON 全落同一个「AI 识别失败」文案 → `AI-RISK-002`。

## 7. Bridge 协议审计（P 级分级；R0 不修改）

| 方向 | source | type | payload → response | 风险 |
|---|---|---|---|---|
| 内容→页面 | zy-card-assistant | apply | fields+side → applyResult{ok,applied/message} | `BRIDGE-RISK-001` 无 requestId |
| 内容→页面 | zy-card-assistant | probe | (空) → probeResult{href,canvases[]} | `BRIDGE-RISK-002` 无超时（bridge 未注入时永久等待提示） |
| 页面→内容 | zy-card-assistant-page | applyResult / probeResult | — | `BRIDGE-RISK-003` 无统一错误码；`BRIDGE-RISK-004` 业务函数直接裸调 window.postMessage |

页面异常场景（设计器未加载/重渲染/切换/canvas 未初始化）均有探空返回「未找到画布」，分级：P1（无 requestId 在并发时潜在 P2，当前单请求低危）。

## 8. Fields Domain 审计

| 字段 | 类型 | 多值 | 允许空 | 本地规则产 | AI 可补 |
|---|---|---|---|---|---|
| company_cn / company_en / name / title | string | 否 | 是 | 是 | 仅当本地缺且原文命中 |
| phones / wechats / emails / websites / addresses | array | 是 | 是 | 是 | 追加（原文命中+谓词） |
| business / back_extra | array | 是 | 是 | 是 | 追加（原文命中+谓词） |

不变式（勿改）：AI 不得覆盖本地可靠值；addresses 必须过 `isAddressLine`；business 必须过 `isBusinessLine`；所有 AI 添加项必须 `rawIncludes(raw, item)` 命中原文；`normalizeFields` 去重并剔掉与主字段重复项。

## 9. 正反面业务规则行为规格（摘要，完整版见 BEHAVIOR_BASELINE.md §3）

| 场景 | 规则 | 优先级 | 例外 |
|---|---|---|---|
| 正面强特征 | 公司/地址/电话/邮箱/微信网址/职位词/纯中文2-4字（排除主营类词） | 最高 | 主营/反面关键词先行排除 |
| 反面强特征 | business / back_extra 关键词 | 高 | 若同时是强正面则不算 |
| 模糊行 | 长段说明→反面；其余→正面 | 低 | front<2 时不强判反面 |
| 公司名 | 含公司/集团/科技…；候选择优（有限公司/集团结尾优先）+剥尾部部门 | — | 地址/主营行不算 |
| 姓名 | 纯中文 2–4 字，排除职位词/业务词/`NAME_EXCLUDED_RE`；或「姓名 空格 职位」 | — | 产品中心/联系方式等不误判 |
| 电话 | `PHONE_BOUND_RE`（前后非数字边界） | — | 长数字串不误截 |
| 微信 | 正/反面行都扫，剥「微信/wechat」前缀 | — | |
| 地址 | 长度≥6 且含省市道路等词；非主营 | — | 主营词不算地址 |
| 主营 | 主营业务/生产/销售/产品词或行业词（芯片/五金…） | — | 地址不算主营 |

## 10. 生成的图层对象审计

- 标识：`obj.zyCreatedByAssistant = true`（createTextObject）+ `obj.zyFieldKey = item.key`（applyFields）。
- 清理：`removeAssistantExtras` 只清 `zyCreatedByAssistant` 且本轮富余的层；**不触模板原层（已满足契约）**。
- `ARCH-RISK-001`：标识不足以支撑未来 OCR/撤销/局部识别——无 `zyFeature/zyRunId/zySource`；清理条件收敛为 `zyGenerated === true` 属 R2。**暂不改**，新增标签只增不改。

## 11. UI / State 审计

- `state` 读写：`fields`（L470/480/514 + 面板输入回读）、`frontText/backText`（L464/465/476/477）、`logs`（L502）、`busy`（L495）、`minimized`（renderPanel）。
- 问题：UI 直接改 state（readFieldsFromPanel）、DOM 作隐式 state（面板输入即数据源）、UI/领域/运行态在同一对象 → P2。

## 12. 日志审计

- `setStatus` 为唯一用户提示口（最多 8 行）；`console.info` 1 处（版本）。无 console.error/结构分级。
- 用户提示/调试/错误/诊断混用同一通道 → P2；未来 `logger.{info,warn,error}`，R0 不实现。

## 13. 版本检查审计

- 链路：`checkForUpdateSoon`（每日节流，GM_setValue 记录日期）→ `checkForUpdate`（GET updateURL，正则取 `@version`）→ `compareVersion` → `showUpdateLink`（面板内链接，替代被拦的 alert/window.open）。
- 分类：**Infrastructure/Update**，与业务无关，迁移时可独立成 `src/features/update.js`。
- `ARCH-RISK-002`：代码 `VERSION=0.3.0.0`，但 git 提交信息已有 "v0.3.1" 字样（探针功能）；`@version` 与 `VERSION` 一致为 0.3.0.0，仓库无 0.3.1 tag —— 版本号语义需在 R1 统一（避免更新检测自我误报）。

## 14. 风险清单（累计）

| ID | 级别 | 问题 | 当前动作 |
|---|---|---|---|
| AI-RISK-001 | P1 | AI HTTP 三处重复、未集中 | 仅记录（R1 引入 aiClient 时处理） |
| AI-RISK-002 | P1 | AI 错误未分类、脱敏不足（slice(0,220) 可能暴露响应体） | 仅记录（R1） |
| DATA-RISK-001 | P1 | API Key 明文存储+UI 明文 | 仅记录（R1 安全收口） |
| DATA-RISK-002 | P2 | zyArkBaseUrl vs zyBaseUrl 命名二义 | 仅记录（R2 配置迁移） |
| BRIDGE-RISK-001 | P2 | 无 requestId，并发潜在串结果 | 仅记录（R3） |
| BRIDGE-RISK-002 | P3 | probe 无超时提示链路 | 仅记录（R1 诊断中心可先加 UI 侧超时提示） |
| BRIDGE-RISK-003 | P3 | 无统一错误码 | 仅记录（R3） |
| BRIDGE-RISK-004 | P2 | 业务函数裸调 postMessage | 仅记录（R3 收敛 bridgeClient） |
| REG-RISK-001 | P2 | 失败分支仍 apply 本地结果 | 行为保留；记录 |
| ARCH-RISK-001 | P1 | 生成层标识不完整（缺 feature/runId/source） | 仅记录（R2/R4） |
| ARCH-RISK-002 | P3 | 版本号语义（0.3.0.0 vs git v0.3.1 字样） | 仅记录（R1 说明文档统一） |
| ARCH-RISK-003 | P2 | 单文件 1540 行、bridge 单块 430 行 | 仅记录（R2/R3） |

## 15. 最危险 10 个问题（按风险排序）

1. `parseFields` 上帝函数（P1，REG-RISK-001 叠加）
2. AI 错误不分类 + 响应体可能外泄到用户可见错误（AI-RISK-002）
3. Key 明文存储/展示（DATA-RISK-001）
4. AI 请求逻辑三处重复（AI-RISK-001）
5. 生成层标识不足（ARCH-RISK-001）
6. Bridge 无 requestId（BRIDGE-RISK-001）
7. zyArkBaseUrl/zyBaseUrl 命名二义（DATA-RISK-002）
8. 无测试基线、回归靠手工（R0 建立 DOC 层基线，执行待 R1）
9. 版本号语义不一致（ARCH-RISK-002）
10. 布局/打分启发式硬编码（H4/H7，见下）

## 16. 高风险硬编码（补充）

| ID | 位置 | 内容 |
|---|---|---|
| H1 | L37–38 | DEFAULT_BASE_URL / DEFAULT_MODEL |
| H2 | L772/L839 | 两段未版本化 prompt |
| H3 | L807/872/1505 | 超时 30000/30000/15000 |
| H4 | L1227–L1277 | 选层/打分魔法值（35/-20/90/95/8/12） |
| H5 | L1306–L1376 | createTextObject 克隆继承（依赖设计器类签名，需真机验证） |
| H6 | L393/420/430 | 拖拽边界 8/80/44 |
| H7 | L1286–L1298 | analyzeLayout 默认 360×216、间距 24、比例 0.1/0.12/0.8 |
| H8 | L1203–L1212 | addMultiItems cap=3 |
| H9 | L69–L83 | fields 结构无 schema/版本 |
| H10 | L1021–L1452 | bridge 单文件 430 行 |

## 17. 当前不能动的代码（Do-Not-Touch）

1. 本地规则全部谓词与 `parseByRulesFromSides` 判定顺序（§9）
2. `mergeFields`/`normalizeFields` 合并策略（本地优先、AI 补空且须命中原文）
3. `applyFields` 选层主流程与 `removeAssistantExtras` 清理语义
4. `createTextObject` 克隆继承逻辑（已 try/catch 兜底；改动需真机联调）
5. `zyCreatedByAssistant/zyFieldKey` 命名与清理语义（新增标签只增不改）
6. 站点相关 canvas 对象探测（findCanvasFromGlobals 等）；OCR 需新增旁路探测
7. userscript metadata、安装入口、更新机制

## 18. 可以安全迁移的代码（R1/R2 候选）

| 模块 | 迁移难度 | 收益 | 风险 |
|---|---|---|---|
| 纯工具（clean/unique/clamp/escapeHtml/compareVersion/parseJsonFromText） | 低 | 中 | 低 |
| 常量（DEFAULT_*/PHONE_BOUND_RE/FIELD_LABELS） | 低 | 中 | 低 |
| prompt 提取（splitSides/extractFields 文本常量） | 低 | 中 | 低（不改文本内容，仅提出） |
| Config 封装（get/set/migrate，内部仍 GM_*） | 中 | 高 | 低-中（需兼容层） |
| AI Client（aiClient.chat 收敛三处请求） | 中 | 高 | 中（行为需逐场景回归） |

## 19. 与未来 OCR 的可复用点

createTextObject/样式克隆、getTextObjects/isTextObject、getReferenceStyle 颜色/字号读取、postMessage 通道（待加 requestId）、标签制清理、analyzeLayout 尺寸启发式（OCR 由 `src/editor/coordinate.js` 接管）。需新建：TextObject 标准化、坐标转换、Editor Adapter 包装（禁直接碰 canvas）。

## 20. R0 验收核对

- [x] 完整读取仓库（API 侧）+ 主脚本（逐段通读）
- [x] 函数/职责地图（§3） | [x] 依赖地图（DEPENDENCY_MAP.md）
- [x] 配置 key 地图（§5） | [x] AI 请求点地图（§6） | [x] Bridge 协议地图（§7）
- [x] state 地图（§11） | [x] fields schema（§8） | [x] 业务规则基线（BEHAVIOR_BASELINE.md）
- [x] regression matrix（TEST_PLAN.md） | [x] 架构风险列表（§14） | [x] 目标架构与迁移计划（REFACTOR_PLAN.md）
- [x] 每阶段回滚策略（REFACTOR_PLAN.md）
- 未执行：拆模块 / 改业务逻辑 / 改 prompt / 改 bridge / 新增 OCR / 重写主脚本 / 删除旧代码 —— 全部未发生。