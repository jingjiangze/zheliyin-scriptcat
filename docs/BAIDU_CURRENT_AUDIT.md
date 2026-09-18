# BAIDU_CURRENT_AUDIT — Stage 7.8 前置审计（只审计，零代码改动）

> 分支：stage-7-8-ocr-quality（基于 416ab82 = Stage 7 最终验收 + v0.3.10.3）
> 目的：搞清「当前是什么」→ 再谈「要改成什么」。不推翻已验收的 Page Ownership / P0。

## 一、Provider 现状（extension/src/ocr/baidu-provider.js）

| 审计项（§三） | 现状 | 判定 |
| --- | --- | --- |
| 接口 | `general` 通用文字识别标准含位置版（`/rest/2.0/ocr/v1/general`） | 含位置 ✓ |
| 返回字段 | `words_result[].words` + `location{left,top,width,height}` + `probability` | 位置/置信度均有 ✓ |
| 词级 bbox | general 接口无 word 级数据（只有行级 location） | 接口限制（UNKNOWN 可否升级 accurate/general_basic 待真机验证） |
| 输出候选 | `{text, bbox{x,y,width,height}, confidence, rotation:null, coordinateSpace:"image-pixel", imageSize}` | 已是统一字段 ✓ |
| 顶层身份 | `provider:"baidu-general-standard-position"`、`providerType:"REMOTE"` | ✓（候选级未带 sourceProvider，§五 需补） |
| rawMeta 保留 | meta 仅 imageWidth/Height/elapsed/rawWordCount/lineCount/httpStatus；原文 words_result 未透传 | 无（§四 需补） |
| 鉴权失败 | GET token（30 天缓存 + 过期前 1min 刷新）；未配置→BAIDU_NOT_CONFIGURED；(110/111)→清缓存重试 1 次 | ✓ 分类清晰 |
| 超时 | 识别 30s / token 15s；网络异常→BAIDU_NETWORK_ERROR | ✓ |
| 图片保护 | >4096px 或编码 >4M → resizeImage 等比压缩 | ✓ |
| 错误码 | BAIDU_ERR_MAP 19 项中文人话 | ✓ |

## 二、Fallback 现状（fallback-policy.js，Stage 7.2 §8.1）

| §六 情况 | 现状 | 判定 |
| --- | --- | --- |
| A 百度成功有字有位置 | 直接使用（quality gate PASS 后） | ✓ |
| B 网络/超时/HTTP/鉴权/JSON/空 | CLOUD_FAIL_ABLE 全类（timeout/http-error/auth-error/empty-result/invalid-result/exception/not-configured）→ local | ✓（决策已存在） |
| C 成功但结构损坏 | 非数组 words_result → mapBaiduError → fallback | ✓ |
| D bbox 全缺失 | words 无 location 时候选被过滤为空 → empty → fallback | 部分 ✓（空→fallback；若部分缺失被 quality gate 处理） |
| E 少量异常 | 交 quality gate（有效占比 <50% → FAIL → fallback） | ✓（路径存在） |
| manual 模式 | baidu→仅 Cloud；local→仅 Local，不换路 | ✓ |
| 结论 | **生产已是 BAIDU_PRIMARY + LOCAL_FALLBACK**；§六 无需重做，只需在出口补证据记录（fallbackReason 已带） | PASS（现状） |

## 三、Quality Gate 现状（ocr-quality.js，Stage 7.3）

| §三十三 检查项 | 现状 | 缺口 |
| --- | --- | --- |
| 空文本 | empty-text ✓ | — |
| bbox 存在/合法 | invalid-bbox/out-of-bounds(5%) ✓ | — |
| 图片尺寸存在 | 仅用于越界判定，容忍缺省 | 无“页面尺寸缺失”独立判定 |
| size 合理性 | 无（不检查高宽比/高越界） | **缺** |
| 块数异常少 | 无（只有 >200 上限） | **缺**（如 1 个超大块） |
| 大规模重叠 | 无 | **缺** |
| BLOCKED 特殊字符 | 无（sanitizer 不存在） | **缺** |
| merge 尺寸冲突 | no（merge 在 normalizer 层） | **缺** |
| 输出结构 | ok/reasonCode/reason/kept/dropped | 非 §三十二 的 {provider,textQuality,blockQuality,bboxQuality,sizeQuality,symbolQuality,overall} 分级 |

## 四、Normalizer / Common Schema 现状（candidate-normalizer.js）

| 层 | 函数 | 现状 | 判定 |
| --- | --- | --- | --- |
| 统一候选 | unifyCandidates | 输出 OCRCandidate：text/bbox/center/confidence/rotation/lineBBox/wordBoxes/coordinateSpace/imageSize | ✓ Common 雏形；**缺 id/sourceProvider/rawMeta/lineIndex/wordIndex** |
| 词行聚类 | groupWordsToLines | 中心 y ≤ max(6, h*0.45) 且 字高差 ≤ max(6, h*0.5) | 字高容差 0.5 偏松（§二十 大字小字同行可能被合）→ 需专项样本验证 |
| TextBlock | groupLinesToBlocks | 五条件 AND：heightRatio≤2.0 / 左对齐≤0.5×mH / 横向重叠≥0.5 / 行距≤1.5×mH 且 ratio≤1.25；旋转行独立 | 已有尺寸门槛；**2.0 偏松（§二十二 建议 1.10~1.50 实验）；缺 baseline guard（§二十三）、vertical-overlap guard（§二十四）、xGap 归一化（§二十五）、mergeReason 数值化（§二十六）** |
| 文本合并 | groupLinesToBlocks text = join("\n") | 保留原始逻辑换行 ✓ | — |
| 布局估算 | estimateTextLayout/estimateTextWidth | 已有（§十一/§十二 用于 textbox 宽度防提前换行） | ✓（Stage 8 再用） |

## 五、TextBlock → 下游（user.js buildItemsFromOcr）

- 链路：Cloud/Local → unifyCandidates 或 aggregateLineCandidates → **buildTextBlocks** → ocrTarget(pageId/side 冻结，Stage 7) → items → ocrCreate(pageId/side)
- ↑ **Cloud 与 Local 已共用 buildTextBlocks 统一 pipeline**（§三十/§三十一 已满足）
- fontSize 标定：avgLineH/0.969（“视觉字高→fontSize”，§十七 要求先建 Relative Size → 此映射将移交 Stage 8）
- 缺口：TextBlock 未带 provider / rawText+safeText / bboxHeight / estimatedTextHeight / sizeCluster / sizeConfidence

## 六、Stage 7.8 缺口汇总（按实现顺序）

| # | 缺口 | 落点 | 对应 § |
| --- | --- | --- | --- |
| 1 | Common OCR Result 补 sourceProvider/id/rawMeta/lineIndex/wordIndex | baidu-provider（candidate 层）+ candidate-normalizer`（unifyCandidates） | §四/§五/§二十八 |
| 2 | ocr-text-sanitizer.js（新纯模块）：sanitizeOcrText → {rawText,safeText,changed,removed,normalized,blocked,reason}；SAFE/NORMALIZABLE/BLOCKED 三级；DIY_CHARACTER_COMPATIBILITY | 新文件 + TextBlock 挂 rawText/safeText | §十二~§十六 |
| 3 | ocr-size-analyzer.js（新纯模块）：normalizedHeight=bbox.height/sourceImageHeight（禁固定阈值）、sizeCluster、sizeConfidence、numeric size proxy | 新文件 + TextBlock 挂 | §十七~§十九 |
| 4 | Size-Aware Merge：groupWordsToLines 字高容差收紧验证 + groupLinesToBlocks 加 baseline/verticalOverlap/sizeRatio（1.10~1.50 实验）/xGap 归一化 + mergeReason 数值化（sizeRatio/baselineDelta/…decision） | candidate-normalizer | §二十~§二十七 |
| 5 | Quality Gate 扩展：size 合理/块数过少/大规模重叠/BLOCKED 符号/merge 冲突 + 分级输出结构 | ocr-quality | §三十二/§三十三 |
| 6 | Baidu 返回 bbox 全缺失 → 明确 fallback 决策出口（现在隐式经空候选） | fallback-policy + runBaiduOcr 出口 | §六-D |
| 7 | 真机验收（§四十七/四十八 八轮）+ Fixture 集（§九 A-O 首批 B/C/G/H/D/I/J/L/M） | runtime fixtures + probes | §九/§四十七 |

## 七、明确不做（本阶段边界）

- Geometry 坐标映射（Stage 8）；Alignment/Style Reconstruction；最终 fontSize 映射（Stage 8）
- 不重做 Page Ownership（Stage 7 已验收）；不重做 P0 字段结构（isDisplay=0 等）
- 不做双 OCR 并行生产（§七）；不重写现有 OCR 主流程

## 八、风险与 UNKNOWN

- Baidu `general` 是否有更精确位置/confidence 接口（accurate/general_basic 差别）→ UNKNOWN，需真机抽测（Prov 已带 probability，评估可否用）
- groupWordsToLines 字高容差 0.5 在“大字+小字同水平线”上的真实行为 → UNKNOWN，需 Fixture G 真机取证后再定阈值（禁止盲目改）
- 特殊字符导致 DIY 报错的真实触发面（创建/预览/序列化/保存/核稿/订单链）→ 需单变量真机实验（§十一），**严禁先写粗暴 /[^一-龥a-zA-Z0-9]/g 过滤**
- 零宽字符/emoji/组合字符在 DIY 的真实行为 → UNKNOWN，需验证后进 SAFE/NORMALIZABLE/BLOCKED（§十五：不因“特殊”就删）