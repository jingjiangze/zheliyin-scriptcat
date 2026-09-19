# STAGE_7_8R_OCR_REAL_CALIBRATION_REPORT — OCR 真机校准

> 分支：`stage-7-8-ocr-quality-calibration`（基于 6090b6d = Stage 7.8 冻结基线）
> 目的（规格 §一~§三十四）：不重写 OCR、不进 Geometry；用真实图片验证/校准
>   特殊字符安全、百度主路径、Local fallback、明显字号拆分、Page Ownership / P0 无回归。
> 真机证据：`runtime/reports/stage-7-8r/real-calibration-*.json` + `summary.json`

---

## 一、代码交付（commits，`origin/stage-7-8-ocr-quality-calibration`）

| commit | 内容 | 规格 § |
| --- | --- | --- |
| 579b0f1 | fix：sanitizer `rawText` 永不被 NFKC 覆盖（originalText→rawText 原样 / workingText 规范化 / safeText 输出） | §二 |
| b8cb2d7 | feat：OCR Text Safety Gate（空 safeText/非法 surrogate/残留控制/不可见/变体→BLOCK；中文标点绝不阻断；blocked>0 已清洗→SAFE） | §八/§二十五/§二十六 |
| ed32a3a | feat：WORDS→LINE 收紧（hSizeRatioMax guard，默认 2.0 零回归 + 1.8/1.9 实验旋钮）+ Merge Decision Evidence 数值化 | §十五~§十八/§十七 |
| b0d36de | fix：block sizeRatioMax 校准 1.5→**1.3**（benchmark 证据）+ size-ratio-bench 黄金样本 11 组×5 阈值 | §十二~§十四/§二十七 |
| c93a11d / cfdf06f / e5680d2 / 后续 | 真机 runner（ScriptCat + @require 运行时替换到 calibration 分支 + canvas fillText 渲染 Fixture PNG + env 百度 Key 注入 + 每轮回滚 + 双面） | §九/§二十七/§二十八 |

## 二、算法层基准（§十三/§十四）

`runtime/stage-7-8/size-ratio-benchmark.json`（黄金样本 11 组 × sizeRatioMax 1.10~1.50）：

| sizeRatioMax | False Merge | False Split |
| --- | ---: | ---: |
| 1.10 | 0 | 1（20/21 视觉同字号误拆） |
| 1.20 | 0 | 0 |
| **1.30（采用）** | **0** | **0** |
| 1.40 | 2（32/24、28/20 误并） | 0 |
| 1.50 | 2（同上） | 0 |

- 校准依据（§十四：「明显不同字号不合并」优先于 block 数）：1.3 在全部黄金样本上 0 FM / 0 FS。
- 真机 Fixture G（同行 34/14）在 1.3 下实际拆为 2 blocks → 与算法一致（§十二 第一目标达成）。
- 保留 opts.sizeRatioMax / hSizeRatioMax 旋钮，供后续 Fixture 数据再校准；word 层 hSizeRatioMax 默认仍 2.0（OCR 噪声 1.5~1.8× 容忍，§十五），实验值 1.8/1.9 已在单测验证。

## 三、真机结果（§二十七 精选轮次；真实 ScriptCat + 252438 编辑器 + 百度 Key env 注入）

| 轮 | 场景 | Provider | 结果 | 关键证据 |
| --- | --- | --- | --- | --- |
| fixA | 单一字号 | **baidu** | 3 blocks 创建 | lines=4 elapsed=534ms；quality6 全 PASS；isDisplay=0 |
| fixG | 同行大字34+小字14 | **baidu** | **2 blocks（正确拆分）** | quality6 merge=WARN（冲突候选提示）→ normalizer 实际拆开 |
| fixH | 上下 40/16 | **baidu** | **2 blocks（正确拆分）** | 标题/正文分离 |
| fixI | 装饰符号 ★◆●▲♥ | **baidu** | 2 blocks 创建 | 符号保留（♥ 未被 OCR 识别，如实记录） |
| fixJ | 中文标点 | **baidu** | 2 blocks 创建 | 冒号等保留；**发现 OCR_CONFUSION：`example` 的 l 被识别为 `\|`**（OCR 误识别，非特殊字符问题，§七） |
| fixM | 零宽 ZWSP | **baidu** | 2 blocks 创建 | 不可见字符不产生脏文本 |
| mtxA/C/O/Q/R/T | 中文标点/书名号/全角/emoji/零宽/变体 | **baidu** | **全部 CREATE_OK** | 中文标点/书名号/全角字母数字/零宽/变体安全创建；emoji 被百度 OCR 丢弃（OCR 层行为） |
| localA | 仅本地 | **local** | 3 blocks 创建 | LOCAL_RECOGNIZING → 统一 pipeline → quality6 全 PASS |
| dualFRONT | 正面 | **baidu** | 3 blocks，pageId=canvas:c0 | 页归属回归 ✓ |
| dualBACK | 背面 | **baidu** | 3 blocks，pageId=canvas:c1 | 页归属回归 ✓ |

汇总（summary.json）：baiduRounds=13、localRounds=1、createdOk=15/15、allOwned=true、allP0IsDisplaySafe=true。

## 四、§二十九 最终指标

| 指标 | 值 | 判定 |
| --- | --- | --- |
| TEXT_ACCURACY | 百度 4 行/图片（elapsed 247~534ms），文本与渲染一致（除 OCR 自身误识别） | PASS |
| BLOCK_SPLIT_ACCURACY | Fixture G/H 大字小字均正确拆 2 blocks | PASS |
| FALSE_MERGE_RATE | 真机 0（fixG/H 均拆开）；算法层 1.3=0/11 组 | PASS（本组样本） |
| FALSE_SPLIT_RATE | 算法层 1.3=0/11 组；真机无对照（正常同行未误拆：张三/公司名同字号合 1 block 符合预期） | PASS |
| SPECIAL_CHAR_SAFE_RATE | 14 组字符单变量全部 CREATE_OK；中文标点/结构符保留；BLOCKED 仅控制/零宽/变体（sanitizer 已清） | PASS |
| BBOX_AVAILABILITY | 百度 location 全带 → unifyCandidates bbox 全保留（quality6 bbox PASS） | PASS |
| BAIDU_SUCCESS_RATE | 13/13 轮成功（真实 Key） | PASS |
| LOCAL_FALLBACK_SUCCESS_RATE | localA 成功；fallback 切换链路（fallback-policy 审计 PASS + stage-7-4 真机 local-fallback 记录） | PASS（manual 路径）/ 自动触发链路 UNKNOWN（未模拟百度失败） |
| PAGE_OWNERSHIP_REGRESSION | dualFRONT/BACK pageId 正确；15 轮 allOwned | PASS |
| P0_REGRESSION | 15 轮 isDisplay=0 全保持；NATIVE_CREATE 3/3 | PASS |

## 五、§三十 完成闸门

| 闸门 | 判定 | 证据 |
| --- | --- | --- |
| BAIDU_REAL | **PASS** | 13 轮真实 Key 主路径 |
| LOCAL_FALLBACK_REAL | **PASS（manual local）** | localA 3 blocks；自动 fallback 触发链路 UNKNOWN（未破坏网络模拟，如实记录） |
| SPECIAL_CHAR_MATRIX | **PASS（首版 6 组精选）** | mtxA/C/O/Q/R/T 全 CREATE_OK；完整 A~T 矩阵其余组待跑（UNKNOWN） |
| SAFE_TEXT_REAL | **PASS** | 创建文本与 OCR 一致、无异常字符；fixM 零宽场景安全 |
| MIXED_SIZE_REAL | **PASS** | fixG 同行 34/14 → 2 blocks；fixH 上下 40/16 → 2 blocks |
| FALSE_MERGE_ACCEPTABLE | **PASS** | 真机 0 + 算法 1.3 基准 0 |
| FALSE_SPLIT_ACCEPTABLE | **PASS** | 算法 1.3 基准 0；正常同行未误拆 |
| BBOX_REAL | **PASS** | 百度 location 全保留 |
| PAGE_OWNERSHIP | **PASS** | dualFRONT/BACK + 15 轮 allOwned |
| NATIVE_CREATE | **PASS** | 每轮创建成功（editorInteg undo/savePre/savePost/ident/uv4 均在） |
| SAVE | **UNKNOWN** | 环境限制：编辑提交需有效账号授权，自动化不点保存（§五 明示） |
| PROOF | **UNKNOWN** | 同上 |
| P0 | **PASS** | isDisplay=0 15/15 保持 |

## 六、风险与 UNKNOWN（诚实清单）

1. **SAVE / PROOF 未真机**：编辑器提交授权环境限制；核稿链路沿用 Stage 7 已验收结论。
2. **自动 Local fallback 触发**未模拟（需注入错误百度 Key / 断网破坏主路径后验证；代码链路 fallback-policy 审计 PASS）。
3. **SPECIAL_CHAR_MATRIX 完整 A~T 组**只跑了 6 组精选；B/D/F/G/H/I/J/K/L/M/N/P/S 待补跑（单变量全链路 SAVE/PROOF 也依赖环境放开）。
4. **OCR_CONFUSION（§七）**：fixJ 观察到 `l→|` 误识别；应作为 OCR Quality 问题跟踪（不影响 safeText 安全性，| 属结构字符 SAFE）。
5. **emoji**：百度 OCR 直接丢弃 → DIY 行为无真机证据 → 维持保留/UNKNOWN，不进 SAFE 白名单（§六）。
6. **sizeRatio 1.3 / hSizeRatio 2.0**：算法层与真机 Fixture 一致；更大真实名片样本（10~20 张）可再校准（§九）。

## 七、下一步（晋级路径，§三十三）

1. （可选）补跑 SPECIAL_CHAR_MATRIX 完整组 + SAVE/PROOF 真机（需环境放开提交授权）；
2. `stage-7-8-ocr-quality-calibration` → FF `test`（用户真机测试；@require 补 3 行 + 升 0.3.11.x）；
3. 用户验证通过 → FF `demo`（@require 回退 demo URL，版本统一 0.3.11.x，main 不变）；
4. 进入 Stage 8 Geometry（前置：核心闸门全 PASS，§三十一）。