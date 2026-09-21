# OCR-P1 Gate Audit Report（步骤一：仓库真实状态 + production call path 审计）

> 基线：test=stage=`3935109`，demo=`8cf1f3a`（0.3.11.49），userscript `@version 0.3.11.53`（全 @require 指向 test 分支）
> 审计方式：只读静态审计（不修改代码），逐函数核对 production call path
> 审计时间：2026-09-21

## 1. 仓库真实状态

| 项 | 值 | 与任务书要求 |
|---|---|---|
| test HEAD | `393510903dd922d972778b8c9c7e4e8a0799c78c` | 与基线一致 |
| stage-9-altq | `393510903dd922d972778b8c9c7e4e8a0799c78c` | stage==test |
| demo HEAD | `8cf1f3a6ced8084d7726b8d53f6927b6fe7bef83` | 未 promotion（0.3.11.49） |
| userscript version | `0.3.11.53` | 符合 |
| userscript @require | 全 `test/extension/src/*.js?v=0.3.11.53` | test 轨 |
| 工作树 | clean | 符合 |

## 2. Production Call Path（实际代码）

```
handleOcrImage (L1159)
 ├─ mode=baidu / auto → runBaiduOcr (L942)
 │    ├─ runNativeTruth (L846)   → recognizeWithFallback(textType=STAGE9_NATIVE_OCR_MODE)
 │    │                            img._native = native（复用）
 │    └─ runGeometryRecognition (L871)
 │        ├─ Baidu provider.recognize → quality → candidate gate → buildTextBlocks
 │        ├─ maybeApplyNativeTruth (L962)
 │        │    ├─ 复用 img._native / 补执行 recognizeWithFallback
 │        │    ├─ geoBlocks = block.lines 行级摊平（OCR-P0.3-F）
 │        │    ├─ alignNativeGeometry(native.texts, geoBlocks)
 │        │    ├─ kept（text = native.rawText, textSource=NATIVE_OCR）
 │        │    └─ gate = {totalNative, matched, unmatchedNative, ...}
 │        ├─ evaluateCompleteness (L927-936)  仅在 tb.gate 存在时
 │        └─ buildItemsFromOcr (L937)
 └─ mode=local → runLocalOcr (L1052)
     └─ Local OCR → quality → candidate gate → buildTextBlocks
         └─ maybeApplyNativeTruth (L1144)
             └─ buildItemsFromOcr (L1145)   无 evaluateCompleteness
buildItemsFromOcr (L1304)
 └─ items（含 textSource/textTruth）
 └─ ocrCreate message (L1672) → page-bridge → CanvasDiy.drawText → native layer registry
```

## 3. 特别检查结论（A-E）

### A. Native unavailable 时是否有 Baidu/Local text 进入 buildItemsFromOcr —— 发现泄漏（高风险）

- `maybeApplyNativeTruth`（L978-980）：当 `!(native && native.ok)` 返回
  `{ blocks: 传入的原始 blocks, mode:"OFF", skipped:true, reason:"unavailable" }`，无 gate 字段。
- `runGeometryRecognition`（L927）：`if (tb && tb.gate && STAGE9_NATIVE_TRUTH)` → gate 不存在 → 跳过 Completeness Gate → L937 `buildItemsFromOcr(tb.blocks)` 直接消费 Baidu blocks。
- buildItemsFromOcr（L1415）：`srcText = b.textSource==="NATIVE_OCR" ? rawText : safeText` —— 非 NATIVE_OCR 块走 safeText（Baidu text）。
- 结论：Native unavailable（接口失败/会话过期/解析失败）时，Baidu 的 text 仍可能进入画布，违反绝对冻结规则 2/3。

### B. Native empty 时是否有其它 text 进入 creation —— 无泄漏（已拦截）

- Native ok=true 但 texts=[]：maybeApplyNativeTruth 正常构造 gate（matched=0）→ evaluateCompleteness 返回 ok:false（matched+unmatched < totalNative 不成立，最终 fallback 分支）→ L929 拦截。拦截成立。

### C. local execution path 是否绕过 completeness gate —— 发现泄漏（高风险）

- `runLocalOcr`（L1144-1145）：`maybeApplyNativeTruth` → 直接 buildItemsFromOcr，全程无 evaluateCompleteness。
- Native unavailable 时 maybeApplyNativeTruth 返回原 Local blocks → Local text 进入画布，违反 2/3/9.1。
- 结论：Local 路径完全绕过 Completeness Gate。

### D. textType 是否可被非 2 配置污染 —— 配置可污染（中风险，provider 有部分挽救）

- L956：`STAGE9_NATIVE_OCR_MODE = GM_getValue("zyStage9NativeOcrMode", "2")`。
- L853/L972：生产调用直接传入 textType=STAGE9_NATIVE_OCR_MODE。
- provider recognizeWithFallback（native-ocr-provider.js L191）内部：`primary = c.textType != null ? c.textType : "2"`——尊重外层传入；type=1 仅在 type2 空/失败时作为 diagnosticType1 诊断，且 `return r1`（type=2 原样）→ provider 层生产真值仍是 r1。
- 直接危害：type=1 请求被发送；最终 textbox.text 来源 r1（type=2）。属参数可污染、不属文字泄漏。任务书 9 要求生产固定 textType="2"，需硬化。

### E. legacy applyNativeTextTruth 是否仍被 active call site 使用 —— 无 active call site（未泄漏）

- text-truth-gate.js 导出 applyNativeTextTruth（纯模块保留）。
- userscript 无对该函数调用；仅 L1035 使用 validateNativeText（kept.text===rawText 校验）。
- 结论：无 active 调用，legacy 接线已清除。

## 4. 其它审计观察（非阻断）

- maybeApplyNativeTruth Native unavailable 分支（L978-980）：返回原 blocks + mode OFF。设计意图为 feature off 时报原样；生产 STAGE9_NATIVE_TRUTH 恒为 true，此分支只在 native 失败时命中 → 正是泄漏源。
- handleOcrImage auto 模式（L1254）：cloud-primary 失败 → maybeLocalFallback → runLocalOcr（local-fallback）→ 走 C 泄漏路径。
- buildTextMediaEntry / page-bridge 创建段：未审计到外部激活入口变更；保留冻结（未修改）。

## 5. 审计建议（供 Commit 1 参考）

1. maybeApplyNativeTruth unavailable/empty/fail 时返回 `gate: { totalNative:0, matched:0, ... }` 或新增显式 blocked 标记，使上游 Completeness Gate 能拦截。
2. runGeometryRecognition 与 runLocalOcr 统一在调用 buildItemsFromOcr 前执行 Completeness Gate（含 Native 失败 → STOP）。
3. production 调用固定 textType:"2"（保留 GM 配置仅作 diagnostic 透传，不进入生产请求）。

## 6. 审计范围备注

- 只读静态审计；未运行脚本 / 未修改代码。
- 行号基于 test 分支 3935109 的实际文件内容。

## 7. 结论

发现 2 个高风险泄漏 + 1 个中风险参数污染，1 个已拦截项，1 个已清除项。
下一步 Commit 1 将只修 Native 失败 → 全 creation STOP（不加 Geometry Recovery）。
