# Execution Record 004 — Stage 6 起点：P0 收口（老桥缓存/空白模板/卡死）+ 字号标定基线 + §16 A/B（v0.3.8.5）

> 时间：2026-09-17；分支 `demo`。接续 stage-5.6/003（P0 二段诊断）→ 用户第 3~5 轮真机反馈逐项收口，进入 Stage 6。

## 一、P0 真机闭环（第 3~5 轮）

| 轮 | 用户现象 | 判定 | 处置 | 验证 |
|---|---|---|---|---|
| 3 | 多个画布均 BRIDGE_NO_REPLY；console：marker `{installed:true,ts}`、probe 有回复 | 桥活着但缺画布能力 ⇒ **@require 缓存旧 page-bridge**（pre-P1 无 getCanvasInfo） | v0.3.8.2 探针自分类；v0.3.8.3 @require 全部 `?v=` 版本化 | 重装/更新即拉新模块 |
| 4 | 正式版同；测试版「识别到 1 个文字区域，一直正在生成」 | 旧版桥（无 getCanvasInfo）→ 识别都走不到；测试版=新桥但 **ocrCreate 抛错→永不回复→BUILDING 死等** | v0.3.8.3 ocrCreate 全 try/catch 兜底必回复 + buildItemsFromOcr 10s 回复超时 | 错误显性化 |
| 5 | 「生成失败：Cannot read properties of null (reading 'left')」 | **空白模板（无文字层）**：`createTextObject` fabric 兜底在 `reference=null && layout=null` 时读 `layout.left` 抛错 | v0.3.8.4 空安全（安全默认；位置/尺寸由 ocrCreate 覆盖）；harness 增加 blank-canvas 单元格 | 标定 harness blank-canvas=MEASURED（fs∅→[37,37]，2 行均生成） |

**校准基线（Stage 6 P6.1 输入）**：`runtime/stage5-6-font-calibration.js`（真实 ScriptCat+编辑器，自绘已知字号×0.8 scale）

| 格 | 目标画布字号(=fs×0.8) | 读回 fontSize | ratio=读回/目标 |
|---|---|---|---|
| 空白画布（回归） | 38.4 | 37 | 0.964 |
| w-24 | 19.2 | 18 | 0.937 |
| w-36 | 28.8 | 28 | 0.972 |
| w-48 | 38.4 | 37 | 0.964 |
| w-64 | 51.2 | 50 | 0.977 |
| b-48（黑底白字） | 38.4 | 38 | 0.990 |
| w-48-regular | 38.4 | 37~38 | 0.977 |

→ 合成图下 `fontSize=round(bh)` 系统性偏小约 3%（0.94~0.99）；**真实图上「大小/间隙差距很大」主要来自混合字号行合并、lineHeight 差异与 charSpacing**，正是 P6.1 目标（本回合不猜测改系数，以真实编辑器字库/多字号标定做 lookup/interpolation）。

## 二、Stage 6 §16 必须项（单独 commit）

- **A. @require query 版本对齐**：此前 @version 0.3.8.4 而 query 仍 0.3.8.3 → 已统一 0.3.8.5（commit `a8cfc3b`）。
- **B. OCR busy lock 贯穿事务**：移除识别完成即释放；终态收敛到 `buildItemsFromOcr`（ocrCreate 回复/10s 超时/空结果）与错误终态（含 maybeBaiduFallback stop/notify-config 释放、baidu 路径移除提前 .finally）。

## 三、PASS / FAIL / PENDING

- PASS：@require 版本化、busy lock、空白模板、BUILDING 兜底、画布分级诊断（0.3.8.1→0.3.8.5 全链路 harness 22/22）。
- PENDING：真实用户侧确认重装后正式版可用（等待用户复测）；P6.1 字号 lookup 模型（本回合为基线数据，未改生产公式）；iframe 跨框架定位未做（用户当前路径已排除 iframe——probe 有回复）。
- 已避免：无证据的「旋转/字号系数猜测」。

## 四、相关提交

`2f09569`(0.3.8.2 探针分类) → `b17d0c9`(0.3.8.3 版本化+兜底) → `55d93ed`(0.3.8.4 空白模板 + 标定 harness) → `a8cfc3b`(0.3.8.5 A+B) → 本轮（标定证据 + 本记录）。