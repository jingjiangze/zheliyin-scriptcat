# DEPENDENCY_MAP.md — 依赖地图（R0）

> 依据 main HEAD `6c19b46` 主脚本（约 1540 行）实际调用关系整理。行号为当前快照行号。

## 1. 模块级依赖图

```
入口(1530) ──> renderPanel(262) ──> addStyles / installPageBridge / bindPanel / makeDraggable / applySavedPanelPosition / checkForUpdateSoon
renderPanel ──> renderFieldInputs ──> normalizeFields
bindPanel ──> parseFields │ rebuildFieldsFromSideText │ applyFieldsToPage │ probeCanvas
parseFields(446) ──> splitSidesByDoubao|splitFrontBackText → parseByRulesFromSides → parseByDoubao → mergeFields|mergeTwoFields → renderFieldArea → applyFieldsToPage
本地引擎 ──> parseByRulesFromSides(643) ──> isCompanyLine/isAddressLine/isBusinessLine/isBackExtraLine/isNameExcluded/PHONE_BOUND_RE → normalizeFields
AI 侧 ──> splitSidesByDoubao(770)|parseByDoubao(831) ──> GM_xmlhttpRequest ──> parseJsonFromText / cleanMultiline
合并 ──> mergeFields(933) ──> normalizeFields / rawIncludes / isAddressLine / isBusinessLine
Bridge 触发 ──> applyFieldsToPage(981)|probeCanvas(986) ──> window.postMessage → [页面注入脚本 pageBridge(1021)]
pageBridge ──> findCanvasForSide → getLoadedModule|findCanvasFromGlobals|findCanvasIn|unwrapCanvas
applyFields(1144) ──> buildItems → pickObject → scoreObject → findReferenceObject → analyzeLayout → createTextObject → removeAssistantExtras → setObjectText → placeCreatedObject
更新 ──> checkForUpdateSoon(1486) ──> checkForUpdate(1501) ──> GM_xmlhttpRequest ──> compareVersion ──> showUpdateLink(1494)
```

## 2. 逐函数依赖表（主要节点）

| 函数 | 行号 | 调用方 | 依赖项 | 副作用 | GM | DOM | 页面 | AI |
|---|---|---|---|---|---|---|---|---|
| renderPanel | 262 | 入口(1530) | addStyles/installPageBridge/bindPanel/makeDraggable/applySavedPanelPosition/checkForUpdateSoon/renderFieldInputs | 面板重建 | GM_getValue | 文档 | 注入脚本 | — |
| bindPanel | 358 | renderPanel | parseFields/rebuildFieldsFromSideText/applyFieldsToPage/probeCanvas | 事件注册 | — | 文档 | — | — |
| parseFields | 446 | bindPanel | 见 §3 上帝函数依赖 | state 写+UI 刷+apply | GM_getValue+GM_setValue | 文档 | postMessage | 是 |
| splitFrontBackText | 523 | parseFields/parseByRules/rebuild/splitSides fallback | splitByExplicitMarkers/isStrongFrontLine/isStrongBackLine/isLikelyBackLine/clean | 无 | — | — | — | — |
| parseByRulesFromSides | 643 | parseFields/parseByRules/rebuildFieldsFromSideText | 全部谓词+正则+stripLabel 系列 | 无 | — | — | — | — |
| splitSidesByDoubao | 770 | parseFields | GM_xmlhttpRequest/parseJsonFromText/cleanMultiline/splitFrontBackText(fallback) | 网络 | GM_xmlhttpRequest | — | — | 是 |
| parseByDoubao | 831 | parseFields | GM_xmlhttpRequest/parseJsonFromText | 网络 | GM_xmlhttpRequest | — | — | 是 |
| mergeFields | 933 | parseFields | normalizeFields/rawIncludes/isAddressLine/isBusinessLine | 无 | — | — | — | 间接 |
| applyFieldsToPage | 981 | bindPanel/parseFields | window.postMessage | 发消息 | — | — | postMessage | — |
| probeCanvas | 986 | bindPanel | window.postMessage | 发消息 | — | — | postMessage | — |
| 消息监听 | 991 | 运行期 | setStatus | state 写 | — | 文档 | postMessage | — |
| applyFields | 1144 | pageBridge | buildItems/pickObject/…/setObjectText | 改 canvas | — | — | canvas | — |
| createTextObject | 1306 | applyFields | getReferenceStyle/inheritReferenceProps/fabric | 建图层 | — | — | canvas | — |
| removeAssistantExtras | 1243 | applyFields | 标签 zyCreatedByAssistant/zyFieldKey | 删图层 | — | — | canvas | — |
| setStatus | 501 | 多处 | state.logs/#zy-status | UI 写 | — | 文档 | — | — |
| checkForUpdate | 1501 | checkForUpdateSoon | GM_xmlhttpRequest/compareVersion/showUpdateLink | 网络/UI | GM_xmlhttpRequest | 文档 | — | — |

## 3. parseFields 依赖全景（上帝函数）

```
输入       #zy-raw / #zy-api-key / #zy-model
配置       GM_getValue(zyBaseUrl) + getConfig 骨架 + saveConfig(GM_setValue)
分面       splitFrontBackText | splitSidesByDoubao(AI)
抽取        parseByRulesFromSides（本地）→ parseByDoubao(AI) → mergeFields
普通态     state.fields ← merge | mergeTwoFields(追加)
UI         renderSideTextArea / renderFieldArea / setBusy / setStatus
输出       applyFieldsToPage(postMessage)
失败态     本地重算 + 复制三处 + 状态提示 + 仍 apply
```

## 4. 高扇出 / 高风险节点（拆分前先记录，不急着动）

| 节点 | 被依赖次数 | 标记 |
|---|---|---|
| `normalizeFields` | ≥8（renderFieldInputs/mergeFields/mergeTwoFields/parseFields/readFieldsFromPanel…） | HIGH-FANOUT（R2 优先，但先稳定再拆） |
| `parseByRulesFromSides` | 4（parseFields/parseByRules/rebuildFieldsFromSideText/异常分支） | HIGH-FANOUT + 业务核心 |
| `clean`/`unique` | 遍布 ~30 处 | HIGH-FANOUT 纯函数（低危，可先提 src/core/utils.js） |
| `setStatus` | ≥10 处 | 中扇出，UI 侧 |
| `applyFieldsToPage` | 3 | 中，通往 bridge 唯一出口（收敛点，优先） |

## 5. 未来目标边界（仅设计，不落地）

- `src/core`（utils/constants/storage/http 包装）← 纯函数 + GM 侧
- `src/config` ← getConfig/saveConfig/applySavedPanelPosition + CONFIG_VERSION
- `src/fields` ← 谓词/抽取/分面/merge/normalize（原样平移）
- `src/ai` ← aiClient + prompts（splitSides.v3/extractFields.v4）
- `src/editor` ← bridgeClient + editor adapter + coordinate.js
- `src/features` ← 卡片填充、后续 图片拆字
- `src/ui` ← renderPanel/bindPanel/诊断中心

> 拆分顺序严格按 REFACTOR_PLAN.md（R1 不拆业务模块；R2 每次只迁移一个边界）。