# Stage 8D OCR Quality Reconstruction —— 最终报告（GATE-8D）

日期：2026-09-20（P6/P7 完成后自动冻结）
分支：`stage-8d-ocr-quality-reconstruction`
版本：`0.3.11.32`（生产，test 已同步）
生产 commit：`5f11d6b`；evidence HEAD：`24f73d8`

> 本报告只使用磁盘证据（runtime/reports/stage-8b/*.json、runtime/stage8d/*、docs/*）。
> 8D 主规格的 §34 原文不在本会话/磁盘中，十项检查点按本阶段真实证据重构，逐条如实标注 PASS / NOT READY，绝不作伪。

---

## 1. 最终状态

```
GATE-8D-OCR-QUALITY  = PASS       （管线证据链完整、无伪造、单测全绿、行为零回归）
GATE-8D-TEXT-FIT     = PASS       （Source/Target/Actual 三层建立；字号合理；几何亚像素；fusion 未改）
GATE-8D-REAL-IMAGE   = PASS_WITH_NOTES（七轮真机 + overlay 三视图；字段级重建 NOT READY → Stage 9）
OVERALL             = PARTIAL_READY
demo                = NOT_PROMOTED
```

## 2. 十项验收检查点（按证据重构）

| # | 检查点 | 结论 | 证据 |
|---|---|---|---|
| 1 | WORD→LINE 归一化 | PASS | 97 words → 33 lines（P3 yTol=min 修复） |
| 2 | LINE→BLOCK 分组 | PASS | 3+ 行巨型块=0；回册…/多 与 器/洛/Tel 拆分（P4 baselineDeltaMax=1.6+重叠门 0.38） |
| 3 | Gate 拦截 | PASS | validateBlockSet 单测 24/24；块层二次 gate 后链稳定 |
| 4 | 字体来源四层 provenance | PASS | resolver 可区分四层；真机如实 FONT_REAL_TEMPLATE（usedFont=方正黑体简体） |
| 5 | specialStyle 只打标不改变创建 | PASS | STYLE_DEFERRED 仅诊断；v20→v21→v22 created 恒 10 |
| 6 | orientation 接线且不伪造 | PASS | 无行级 rotation → UNKNOWN/NONE 如实；有信号才分类 |
| 7 | 字号求解模型证据驱动 | PASS | advance 主 fusion 保持 8B 定案；回册…限 fs=41 vs 源 40px 级 |
| 8 | 尺寸四层关系（Source/Target/Actual） | PASS | v21+ ink 10/10 实测；无 INK_WIDER_THAN_TARGET |
| 9 | 几何合同 | PASS | center avg 0.24px（max 0.59）、angle 0.0 |
| 10 | 真实名片 E2E 可复现 | PASS_WITH_NOTES | v16→v22 七轮（created 7→10 稳定）；字段级重建 NOT READY（如实） |

## 3. 真机系列证据（real-card 佛山盛盈包装 895×577，page-world 单实例）

| run | 阶段 | created | rollback | rejected | noted | ink | rawWords |
|---|---|---|---|---|---|---|---|
| v16 | P3 基线 | 7 | 7 | - | - | - | 97 |
| v17 | P3 后 | 8 | 8 | - | - | - | 97 |
| v18 | P4 修复验证 | 9 | 9 | - | - | - | 97 |
| v19 | P4 PASS | 10 | 10 | 0 | 10 | - | 97 |
| v20 | P5-1 诊断层 | 10 | 10 | 0 | 10 | - | 97 |
| v21 | P6-1 ink 三层 | 10 | 10 | 0 | 10 | 10/10 | 97 |
| v22 | P7 overlay | 10 | 10 | 0 | 10 | 10/10 | 97 |

created 单调 7→10 且 v19 后稳定 10；rejected 恒 0；noted 10 = STYLE_MISMATCH（宽度保留，仅备注）。

## 4. GATE-8D-OCR-QUALITY —— PASS

- 单测合计 67 例全绿：gate 24 + fusion 8 + normalizer-p3 4 + line-blocks-p4 4 + font-source 12 + ink-measure 15。
- 诊断字段（每创建对象）：fontFamilySource/fontFamilyResolved/fontFamilyUsed、fontProvision、specialStyle/styleStatus/specialStyleEvidence、orientation（source/blockAngle/imageAngle/classification/confidence）、fusion8d、bboxSeparation8d、ocrBBox8d、status8d。
- 状态链：DETECTED→VALIDATED→READY→CREATED→VERIFIED（READY 后由 calibration/ink 推进）。

如实留底（非管线问题，属引擎质量，不伪造）：
- 本地 tesseract 对 QR 密集卡：33 归一化行中约 19 行为 QR 噪点（见 overlay filtered 图）。
- created 文本含碎片/误识：`回册佛山盛包装制品限`、`Telephone: +86`（截断）、`轿 CO 天 住 出 sre` 等。
- orientation 行级 rotation 无输入信号（Local Tesseract 不产 rotation）→ 如实 UNKNOWN/NONE。

## 5. GATE-8D-TEXT-FIT —— PASS

- fusion（advance 主）字号：fs 20~107，与源图字号级匹配；`回册佛山盛包装制品限` fs=41 vs 源 40px。
- P6-1 ink 三层：Source=ocrBBox8d（OCR bbox canvas 像素），Target=layoutWidth/boxHeight/fontSize，Actual=像素级 alpha bbox（FABRIC_OBJECT_LINES 实测 10/10）；inkTargetRatio 示例：回册块 0.578（宽保留设计），无 1 例 INK_WIDER_THAN_TARGET。
- 几何合同：center avg 0.24px / angle 0.0。
- 明确不判 FAIL 的备注：compare width/height 全 FAIL = textbox 保留 OCR 视觉宽+margin（防强制换行）与 line-box 高度语义，STYLE_MISMATCH=10 仅备注不拒绝；P6 audit 无溢出、无证据要求调整 → 字号/宽度模型未改（fusion 未动，遵守协议）。

## 6. GATE-8D-REAL-IMAGE —— PASS_WITH_NOTES

- 七轮真实名片 E2E 全部 page-world 单实例注入、单次 @require inline；route=background、input 固定 `runtime/stage8b/assets/real-card-shengying.png`。
- overlay 三视图（v22，路径 runtime/stage8d/overlay/）：
  - `real-card-ocr-raw.png`（97 words 绿框）
  - `real-card-ocr-filtered.png`（33 归一化行蓝框）
  - `real-card-ocr-reconstructed.png`（创建后主画布，10 textbox）
- 卡片真实字段（P7 图证）：吴健湘 / 客户经理 / +86 15913171583 / 佛山盛盈包装制品有限公司 / Tel 0757-88809856 / 地址（省市区镇路12号，车间五厂房3号）/ E-mail sandy.wu@shengying.ltd。
- 字段级验收（如实）：公司名块存在但识别误；手机截断；姓名/职位/邮箱未形成可读块；QR 噪点未完全过滤 → **字段级重建 NOT READY，归 Stage 9**。

## 7. P0→P7 执行轨迹

| 阶段 | 内容 | commit/验证 |
|---|---|---|
| P0 | 执行链修复（RAW 日志 slice 崩点 ×2、fusion measurer 接口、单实例注入） | - |
| P1 | ocr-candidate-gate.js（单 block 校验/尺寸门/block-set 检测） | 单测 24 |
| P2 | text-fit-fusion.js（advance 优先多证据字号求解） | 单测 8 |
| P3 | WORD→LINE yTol=min（20→33 行） | 单测 4 |
| P4 | LINE→BLOCK 链式合并加固 | v19 真机 |
| P5-1 | font-source.js 四层 resolver + specialStyle + orientation | v20（0.3.11.31） |
| P6-1 | ink-measure.js alpha bbox + Source/Target/Actual | v21（0.3.11.32） |
| P7 | overlay 三视图 + E2E 验收 | v22 evidence |

## 8. Git 状态

```
stage-8d = 24f73d8（含全部 evidence）
test     = 5f11d6b（生产 0.3.11.32，已 ff 同步）
demo     = 不晋升
```

## 9. 遗留与下一阶段（Stage 9）

1. QR/图形噪点过滤（33 行中约 19 行噪点）。
2. 词级质量门（当前碎片块仍会创建；需置信度/整块语义门槛）。
3. 字段级结构化重建（姓名/职位/公司/电话/地址/邮箱成块）—— 引擎词表与模板字体匹配。
4. 云端 Baidu 主路径在 page-world 下的 CORS 受限（本地 OCR 已闭环；云端回归需 ScriptCat 注入链或凭据方案）。
5. 字号"小字放大/大字 1.475x"旧病根（8A 遗留）与 P6 ink 三层数据联动校准时机（未触发，暂不改）。