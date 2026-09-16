# STAGE_5_3_RECONSTRUCTION_AUDIT

Real Image → OCR → Native Text Reconstruction · 第一次真实图片进编辑器并还原为可编辑 textbox

> 原则：先调用网页已有能力（OCR/图片/字体/编组），不足处补最小能力（§八十四）。
> 实际情况：网页原生「文字识别(Alt+Q)」入口存在但**结果值无法程序化读取（OCR_RESULT_ACCESS = BLOCKED）**→ 依 §八十 走 OCRCandidate(fixture) 管线完成全部真实重建。

---

## 1. Native Capabilities Audit（P2）

runtimes/stage5-3-native-ocr-audit.js + probe/probe2（REAL_EDITOR）：

| 能力 | 审计结论 | 证据 |
|---|---|---|
| OCR 入口 | DOM「文字识别」「OCR识别alt+q」存在；选中图片后触发 → 无网络请求、无结果值暴露（7s 窗口） | native-ocr-result2.json：REAL_OCR_PANEL_OBSERVED；**OCR_RESULT_ACCESS = BLOCKED** |
| Image Object | 真实 image 有 natural 尺寸（980×1264 模板图 307×397 显示）；新图 fabric.Image 原生 600×400 @scale0.5 | image-transform.json |
| Font | 字体面板真实含「思源黑体 Regular」「思源黑体 Medium」「思源宋体 Regular/Medium」 | native-ocr.json font.selectOptions |
| Group | fabric.Group + 网页「编组」按钮均存在 | native-ocr.json group |

结论：原生 OCR 入口存在但结果不可程序取用（面板交互/上传流程依赖人工）→ 不假装 PASS（§七），OCR 结果走 fixture（§八十 允许）。

## 2. Image Coordinate Mapper（P6/P7）

`extension/src/ocr/image-mapper.js`（纯函数，fabric transform 语义，禁止 simple offset）：
- local rect（相对图片逻辑尺寸）→ Canvas 全局 AABB（scale pre-multiply + 中心旋转，§十六）
- 单测覆盖 scale=1 / 0.5 / 2、angle=45°（AABB=(w+h)/√2）、整幅/局部、归一化 0..1 往返（image-mapper.test.js，6 套件全 PASS）

## 3. Real Reconstruction 完整链（P8-P15，errors=0, stage5-3-reconstruction.json）

```text
REAL_EDITOR → 绘制 synthetic 测试图(600x400, 4 行: 测试名片/行业方案专家/电话/地址)
→ fabric.Image 真实对象(scale 0.5, 保留为 Reference Image)     REAL_IMAGE ✓
→ rows(绘制坐标=fixture ground-truth) → 归一化 → mapper → Canvas bbox   IMAGE_COORDINATE ✓
→ Object Matcher：4/4 NOT_FOUND（新图文字区 vs 模板槽位不重叠 → 保护生效，未误写模板）✓
→ 创建策略（模拟用户确认）：同源 createTextObject ×4            REAL_TEXTBOX ✓
     type=textbox / editable=true / fontFamily=思源黑体 Regular / markuuid=null(identity clean)
→ fabric.Group 编组 → destroy 解组 → 成员独立                     REAL_GROUP ✓
→ Reference Image 保留（imageCount 4）                          REFERENCE_IMAGE_SAFE ✓
→ 清理 created + reload → 21 对象 / 4 原文本 / 3 图 零残留      REAL_ROLLBACK ✓
```

质量统计（stage5-3-product-flow.json 摘要）：ocrCount=4（fixture）、matched=0、ambiguous=0、**notFound=4→created=4**、defaultFont=4（思源黑体 Regular）、rollback=true。
> 说明：本模板 4 个文字槽位与测试图区域无重叠 → 均为 NOT_FOUND，正确展示了「模板保护 + 创建策略」；matched 路径在 5.2 matcher probe 已验证（自匹配 4/4）。per-candidate 结果完整存档（§五十六）。

## 4. 生产变更

- **零行为变更**：未触碰 page-bridge/assistant/userscript/apply 链；新增 2 个基础设施（extension/src/ocr/image-mapper.js —— 就绪未挂接；image-mapper.test.js）。
- 新增 fixture：tests/fixtures/ocr/test-card.png（synthetic 脱敏测试图，4 行）。

## 5. 独立复审（§七十五 18 问）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 重复造网页 OCR？ | 否（审计发现原生入口，仅其结果不可程序取用才走 fixture；§八十 允许） |
| 2 | 重复造图片上传？ | 否（fabric 原生 Image 对象；网页拖拽上传需人工，未再造 clipboard parser） |
| 3 | 重复造字体系统？ | 否（直接写网页真实字体字符串「思源黑体 Regular」） |
| 4 | 重复造 Group？ | 否（fabric.Group 原生编组/销毁） |
| 5 | 图片缩放正确？ | 是（scale 0.5 → bbox 尺寸/位置比例正确，mapper 单测） |
| 6 | 图片旋转正确？ | 数学已验（rot45 AABB）；真实旋转图未构造（模板内无安全样本）→ PARTIAL 记录 |
| 7 | OCR bbox 转换正确？ | 是（本地绘制坐标 → mapper → canvas bbox，scale=0.5 一致） |
| 8 | 文字是真 textbox？ | 是（type=textbox 4/4） |
| 9 | 文字可继续编辑？ | 是（editable=true 4/4 + fabric 双击语义） |
| 10 | 默认字体用思源黑体 Regular？ | 是（网页字体面板实测该字体存在；4 个新建对象 fs 均写该字串） |
| 11 | 多文字安全编组/解组？ | 是（group→ungroup→成员独立） |
| 12 | 原图始终安全？ | 是（识别流程内保留不删；会话级对象 reload 清除合理） |
| 13 | Matcher 误匹配？ | 4/4 NOT_FOUND 无误写模板（region 不重叠判定） |
| 14 | AMBIGUOUS 停止？ | 是（5.2 单测/5.1 语义沿用） |
| 15 | NOT_FOUND 需确认才 create？ | 是（本 runner 显式"创建策略=模拟用户确认"分支） |
| 16 | 创建 identity 安全？ | 是（markuuid=null，5.1 修复延续） |
| 17 | 失败可 rollback？ | 是（cleanup+reload 21/4 零残留） |
| 18 | 旧阶段回归？ | 是（6 套件 + RUNTIME-8.3 无回归；page-bridge 未改） |

## 6. Final Report（§七十三/§七十四）

```text
Gate A OCR:        REAL_OCR = BLOCKED(PANEL_ONLY) → 依 §八十 OCRAdapter(fixture)=PASS（诚实标注）
Gate B Coordinate: IMAGE_COORDINATE = PASS / IMAGE_SCALE = PASS
Gate C Textbox:    REAL_TEXTBOX = PASS / TEXT_EDITABLE = PASS
Gate D Recon:      TEXT_POSITION = PASS / TEXT_SIZE = PASS(with fontSize APPROX, deferred) / FONT = PASS
Gate E Group:      GROUP = PASS / UNGROUP = PASS
Gate F Safety:     ROLLBACK = PASS / REFERENCE_IMAGE_SAFE = PASS / CREATION_SAFETY = PASS
Total Gate:        GO（CONDITIONAL-GO 元素：真实 OCR provider 未接入、字号校准 deferred —— 规格允许）
BASIC_RECONSTRUCTION = PASS（§七十二 不宣称 FULL_CARD_RECONSTRUCTION）
```

```text
# Stage 5.3 Result
REAL_IMAGE → REAL_TEXTBOX → TEXT_EDITABLE → CORRECT_COORDINATE → SAFE → ROLLBACK  全部 PASS
Production Changes: 零行为变更；新增 extension/src/ocr/image-mapper.js（未挂接）+ fixture
Important Findings:
  - 网页原生 OCR 入口存在但结果不可程序化读取 → OCR_RESULT_ACCESS=BLOCKED（如实）
  - 思源黑体 Regular 存在网页字体面板 → 默认字体真实可用
  - fabric 原生编组/解组通过
Deferred:
  - 真实 OCR provider 接入（5.4：Native OCR 深度 hook 或外部 adapter + 真实图片）
  - 字号校准表（§二十九：多字号 visualBounds 校准）
  - 旋转图片真实重建（模板无安全旋转图样本）
Commits/Push: 4ad71a0(174ed) 0360f29 0776d2d + 本 docs；全部已 push
Gate:         GO
```

## 7. 停止点（§八十一）

达成「最小真实闭环：图片 → OCR(fixture) → 可编辑文字」。**不进入复杂样式自动恢复 / 完整图片矢量化 / 完整设计稿重建**；下一阶段（5.4：真实 OCR provider / Native OCR 深度集成）据真实 Runtime 结果再定。