# STAGE_7_8_OCR_QUALITY_REPORT — OCR Quality Calibration

> 分支：`stage-7-8-ocr-quality`（基于 416ab82 = Stage 7 最终验收 + v0.3.10.3）
> 目标（规格 §一~§五十五）：百度优先 + Local fallback；Common OCR Result；特殊字符安全；Size-Aware 分块；
> 相对字号；质量门禁；Fixture 集。
> 报告性质：代码 + 单元测试交付完成；真机验收（§四十七/四十八）受环境限制（百度 Key 未配置 / 需真实
> ScriptCat + External Chrome 编辑器会话）→ 逐项如实标记 PASS / UNKNOWN，严禁把「看起来不错」写成 PASS。

---

## 一、交付清单（commits，`origin/stage-7-8-ocr-quality`）

| commit | 内容 | 规格 § |
| --- | --- | --- |
| f934851 | audit：OCR providers / merge pipeline 审计（零改动） | §三 |
| 501434d | Common OCR Result schema：Baidu 候选 id/sourceProvider/rawMeta/lineIndex/wordIndex；unifyCandidates 透传（opts.sourceProvider 兜底）；aggregateLineCandidates 打标 LOCAL | §四/§五/§二十八/§三十 |
| 88656ea | ocr-text-sanitizer.js：sanitizeOcrText 三级 SAFE/NORMALIZABLE/BLOCKED；控制/零宽/变体/BOM 删除；全角字母数字转半角；keepBlocked 探测 | §十~§十六 |
| 6620019 | ocr-size-analyzer.js：normalizedHeight / sizeRatio / sizeCluster / sizeConfidence / numeric proxy | §十七~§十九 |
| 53830ba | Size-Aware Merge：sizeRatio guard（默认 1.5）/ Vertical-Overlap / Baseline / xGap 归一化记录；mergeAudit/splitAudit 数值化 | §二十~§二十七、§四十一 |
| db28320 | 质量门禁六维分级 bundleOcrQuality（text/block/bbox/size/symbol/merge） | §三十二/§三十三 |
| 5c6eaf6 | TextBlock 富字段（provider/rawText+safeText/sanitize/bboxHeight/estimatedTextHeight/size*）；user.js 送 safeText + 六维诊断 | §十三/§十七~§十九/§四十一 |
| fd1a480 | Fixture 图集 A/B/C/G/H/I/J/K/L/M（SVG 源 + golden JSON + README） | §九/§三十九 |

版本纪律：开发分支按 §四十六 保持内部一致（0.3.10.3），晋级 test/demo 时统一升 0.3.11.x。

## 二、模块现状对照（§四十三 职责边界）

| 模块 | 职责 | 状态 |
| --- | --- | --- |
| baidu-provider.js | 百度 API + Common Result | PASS（§三/§四 补齐） |
| fallback-policy.js | Provider fallback | 现状 PASS（§六，无需重做，审计 §二） |
| ocr-text-sanitizer.js（新） | 安全文本 | PASS |
| candidate-normalizer.js | 文字块拆分/合并 | PASS（Size-Aware 化） |
| ocr-size-analyzer.js（新） | 相对字号分析 | PASS |
| ocr-quality.js | 质量门禁 | PASS（六维分级） |
| page-model / page-bridge | 页面归属 | 未动（Stage 7 已验收，无回归） |

## 三、单测统计

- `tests/editor-object-model/run.js`：**19 套全部通过**（含 4 新套件：common-schema / ocr-text-sanitizer / ocr-size-analyzer / merge-guard / ocr-quality-bundle / textblock-fields 共 6 新套件）。
- 新增用例：common-schema 16、sanitizer 31、size-analyzer 20、merge-guard 19、quality-bundle 15、textblock-fields 17。
- `page-model.test.js`：**18/18 回归通过**（Page Ownership 零改动）。

## 四、Fixture 统计（§九 首版 A/B/C/G/H/I/J/K/L/M）

| Key | block 数 | gold 尺寸 | 焦点 |
| --- | --- | --- | --- |
| A 单一字号 | 4 | 560×300 | 字号一致 → 稳定成块 |
| B 大标题+正文 | 4 | 560×320 | **标题必须与正文 split（False Merge 重点）** |
| C 大+小+数字 | 3 | 560×320 | 三档相对字号 → 不同 sizeCluster |
| G 同行大+小 | 3 | 560×200 | **组词聚类字高容差 0.5 取证样本** |
| H 上下字号不同 | 2 | 560×220 | 40/16 → 必须 2 个 TextBlock |
| I 装饰符号 | 2 | 560×240 | ★◆●▲♥ 不得被粗暴过滤 |
| J 中文标点 | 2 | 560×200 | ，。！？、；：『』（）《》…—— SAFE |
| K 英文结构 | 3 | 620×220 | +86 / @ / . 结构不得被打散 |
| L 非常规 Unicode | 2 | 560×260 | ①②Ⅳ½℃™®；emoji 非 BMP 定级待真机 |
| M 零宽不可见 | 2 | 560×200 | ZWSP 清理证据 |

离线交付 SVG 源 + golden JSON；像素 PNG 由真机浏览器 canvas fillText 光栅化（README 明示）。

## 五、验收矩阵（§五十 逐项）

| # | 验收项 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | BAIDU_PRIMARY | **PASS（代码路径）/ UNKNOWN（真机）** | §六 审计：auto=Cloud Primary+Local fallback；runBaiduOcr 主路径 |
| 2 | LOCAL_FALLBACK | **PASS（代码路径）/ UNKNOWN（真机）** | fallback-policy CLOUD_FAIL_ABLE 全覆盖 |
| 3 | COMMON_RESULT_SCHEMA | PASS | 501434d + common-schema 单测 |
| 4 | SPECIAL_CHARACTER_AUDIT | PASS（首版清单） | 88656ea 拒绝清单 + 单测 |
| 5 | SAFE_TEXT | PASS | buildItemsFromOcr 送 safeText（5c6eaf6 + textblock-fields 单测） |
| 6 | NORMAL_PUNCTUATION | PASS | sanitizer 单测（中文标点 SAFE、全角标点保留、结构字符保留） |
| 7 | BLOCKED_SYMBOLS | PASS（35 条规则级） | single 控制/零宽/变体/BOM 用例（emoji 等未验证项保持保留 → UNKNOWN 级，§十五） |
| 8 | MIXED_SIZE_SPLIT | PASS（单测） | merge-guard：40/18→2 blocks；H 夹具 |
| 9 | SIZE_CLUSTER | PASS | size-analyzer 单测（尺度无关性验证） |
| 10 | FALSE_MERGE_REGRESSION | PASS（单测） | merge-guard 19 用例 + FIXTURE B/G/H 焦点 |
| 11 | FALSE_SPLIT_ACCEPTABLE | PASS（单测） / UNKNOWN（真机） | size-guard 1.5 默认经 1.10~1.50 旋钮实验调参 |
| 12 | BBOX_PRESERVED | PASS | baidu-provider + normalizer bbox 保留（单测） |
| 13 | PAGE_OWNERSHIP_REGRESSION | PASS | page-model 18/18；page-bridge 未动 |
| 14 | NATIVE_CREATE_REGRESSION | UNKNOWN（真机） | 需真实编辑器 Native Create 验证 |
| 15 | P0_REGRESSION | PASS（代码未触碰）/ UNKNOWN（真机） | isDisplay=0/P0 字段结构未改 |
| 16 | REAL_SCRIPTCAT | UNKNOWN | 需要真实 ScriptCat + 登录会话（环境限制） |
| 17 | REAL_DUAL_PAGE | UNKNOWN | 同左；Stage 7 已双面验收但 7.8 新分块链路待真机复测 |

## 六、UNKNOWN 与风险清单（诚实声明）

1. **百度真机**：`profile` 未配置百度 API Key → 无法真机验证 Baidu general 返回在真实图片上的 quality gate / size 行为。
   `OCR_PROVIDER_COMPARISON.json`（§八）依赖双 OCR 对照真机 → 待真机步骤生成。
2. **sizeRatio 最终阈值**：默认 1.5（spec 建议 1.10~1.50 实验区间上沿）；Fixture G 的 AI 单位取证后才可能收紧
   （§二十二；单测已提供 sizeRatioMax/heightsRatio 旋钮，均可经 opts 覆盖）。
3. **groupWordsToLines 字高容差 0.5**：按规格「保留默认，取证后决定」，默认未动；Fixture G 为该行为实证样本。
4. **emoji / 未验证扩展字符 / 组合字符**：sanitizer 默认保留（§十五 不因特殊就删）；升级 BLOCKED 需 §十一 真机
   单变量证明 DIY 失败。
5. **像素 Fixture 渲染**：离线 SVG + golden；PNG 需浏览器 canvas（README 明示）。
6. **六维质量门定位**：`bundleOcrQuality` 仅诊断（emitOcrDiag.quality6），**不改变 fallback 决策**；
   特殊符号导致的 symbolQuality FAIL 不会误触发 Local fallback（§三十四 职责分离）。

## 七、进入 Stage 8 Geometry 的前置

按 §五十一：真机八轮（§四十八）全部 PASS + P0 无回归 后才可进入 Stage 8。当前建议：

1. 配置百度 API Key（环境变量）或用户面板设置；
2. 以 `stage-7-4/real-ocr-page-ownership.js` 同模式跑真机：真实 ScriptCat + stage-7-8 user.js（@require 指向
   stage-7-8 分支并按晋升纪律升缓存键）+ Fixture A/B/C/G/H/I/J/K/L/M（浏览器 canvas 渲染 PNG）+ 真机核稿回归；
3. 产出 `OCR_PROVIDER_COMPARISON.json` 与 `REAL_OCR_EVIDENCE.md`；
4. 全部 PASS → FF test（用户测试）→ FF demo（晋级时 @require 回退 demo URL + 版本统一 0.3.11.x）。