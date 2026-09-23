# STAGE9 几何回归审计：test(0.3.11.56) vs demo(0.3.11.49)

- 日期：2026-09-22
- 依据：用户实机截图（盈通启富证券名片）——test 轨出现文字重叠/错位/错别字；demo 发布轨无此偏差。
- 分支基线：demo=8cf1f3a（内容 0.3.11.49）；test=7b71ecb（0.3.11.56，含 4.6-A…4.6-SESSION-b）
- 性质：**只读审计文档，未修改任何行为**（用户确认「先只写审计文档」）

## 1. 现象（用户实机截图）

| 现象 | 描述 |
|------|------|
| 多层重叠/重影 | 「山东盈通启富证券投资集团」等多处文字多层堆叠；邮箱显「jian@i@3658Bacsheji@36588.com」字符混杂 |
| 位置偏移 | 文字整体相对原卡片文字错位（几十 px 级），原背景文字未对齐 → 视觉重影 |
| 错别字 | 职位「理财顾问」被识别为「里才师」类错字并上画布 |
| demo 对照组 | demo（0.3.11.49）同卡无上述偏差 |

## 2. 审计方法

1. **代码差分**：`git diff 8cf1f3a..test`（zheliyin-card-assistant.user.js +583 行，新增 extension/src 模块 18 个）。
2. **真机 A/B 实测**：commit-46-real 全量 V0/V15/V45 × A/B（cookieSource=probe 自动登录），产出 per-case JSON。
3. **逐段代码阅读**：buildItemsFromOcr 几何映射、image-ink-visual.js、native-anchor-matcher.js、native-anchor-style-apply.js、page-bridge inkMeasure。

## 3. 审计发现（按证据强度排序）

### 3.1 唯一「文字位置」回归源 = 4.6-A 视觉墨迹接管（已证实）

- **demo 无此逻辑**：`git show 8cf1f3a:zheliyin-card-assistant.user.js` 中无 `vbBox` / `visualGeomSource` / `VISUAL_INK_MIN_CONF`；
  demo 的 IMAGE_INK 仅用于「字号宽度」（`resolveTypographyTarget`），**不参与位置**。
- **test 独有且默认启用**（zheliyin-card-assistant.user.js L1707-1716）：
  `inkV.confidence >= 0.30` 时用墨迹盒（inkBox）替换 OCR bbox 作为 target 映射源（`mapRectToCanvas(inkBox, imgT)`），
  **没有任何「墨迹盒 vs OCR bbox」一致性门禁**。
- 墨迹算法（image-ink-visual.js）：行/列投影挑「主文字带×主列段」，对含图标行、中英混排行、多元素行容易挑错 span
  → 一旦触发，target 右移几十 px → 文字与背景原字错位 →「重影/多层叠加」。
- 证据（2026-09-22 det-n-run 实测已纠正）：**ink 实际一直在触发** —— B 模式全部行 inkConfidence=1（≥0.30 门槛放行），
  墨迹盒几何错误（数字行 16×30 单字形碎片 / 姓名行 99×111 跨行团块）→ target.left 确定性 +1.6~+94px 偏移。
- **掩盖性诊断 bug**：`visualGeomSource` 为 if(imgT) 块内 const，diag 块外 typeof 访问恒为 undefined → 恒记 OCR_BBOX_FALLBACK，
  此前「15/15 未触发」结论错误（详见 STAGE9_GEOMETRY_AUTHORITY_AUDIT.md §7）。
- 运行时「漂移」判定纠正：模式内 range=0/stdev=0（确定性成立）；早先 A/B target 差异 = ink 接管模式差异，非运行噪音。

### 3.2 真机运行几何不稳定（新增实测证据）

- 同一卡 V0-A vs V0-B 两次独立 run，target 漂移（tLeft 差）：夏祝莲 +61.6px、13719111188 +37.5px、2287483098 +94.3px、
  微信: +1.6px；且 actual 亦随动（2287483098 actual 352→400）。
- 说明除代码外，画布 objectWidth/DPR/aCoords 每会话存在漂移 → 效果「时好时坏」，放大感知偏差。
- 报告：runtime/reports/stage-9/commit-46-real-V0-A.json / -V0-B.json。

### 3.3 Anchor 复用无「几何漂移」门禁（test 新增）

- demo 无 native-anchor-matcher 模块；test 引入 `MATCH_THRESHOLD=0.55`，且 spatial 仅占权重 0.35
  （native-anchor-matcher.js L111：spatial*0.35 + size*0.15 + style*0.12 + shape*0.15 + lines*0.08 + layer*0.15）。
- 短串（微信:/手机:/Mobile 等 2-4 字）文本/脚本相似度高，存在跨对象错配复用风险；
  4.6-C 复用后强制同步 left/top（native-anchor-style-apply.js），若锚点选错 → 文字贴到错误位置 → 重叠。
- 需用户卡实测确认（anchorUsed 字段已采集）。

### 3.4 文字错别字——Native Truth 强制 textType=2（配置/设置层）

- runner / 面板强制 `zyStage9NativeTruth=1` + `zyStage9NativeOcrMode=2`（手写体）作为唯一文字真值；
  打印体卡片下手写引擎输出错字且按铁律直接入 textbox.text，禁止 Baidu 文本覆盖。
- demo 默认 `zyStage9NativeTruth=0`（文字走 Baidu/Local safeText，正确）。
- 现状：textType=2 手写体「用户实测正确率更高」的记录针对的是手写类卡片（夏祝莲）；打印体卡片反之。
- 按 Native Truth 铁律，文本仍应以 Native 为准；纠正方向是「Native 文本质量门禁」，非切换到 Baidu。

## 4. 解决方案（分级，实施时先单测 + 双推 test/stage）

| 级别 | 措施 | 验收标准 |
|------|------|----------|
| P0 | 4.6-A 墨迹**位置接管**默认关闭（保留字号墨迹 height-first + 诊断字段），几何回到 OCR bbox → imgT → targetQuad（= demo 同模型） | 同一卡重跑 dx 收敛至 demo 水平（±10px 内）；回归单测 27/27 |
| P1-a | 墨迹位置接管保留但加一致性门禁：IMAGE_INK target 与 OCR bbox target 差 >6px（或 5% 块宽）→ 拒绝 IMAGE_INK 回落 bbox | ink 触发时无 >6px 漂移用例 |
| P1-b | Anchor 复用加几何漂移门禁：候选锚 actual 位置与 target 差 > 阈值 → 不复用（新建 + diff，保持 identity） | 短串不错配；无重复 textbox |
| P1-c | Native 文本质量门禁：Native text 与 Baidu/本地 OCR 文本做相似性对齐（复用 aligner），不一致行仅诊断不创建（守住 Native Truth + partial-create 语义） | 打印体卡错字不再上画布 |
| P2 | 画布 objectWidth/DPR 稳定性治理；字段语义校验（姓名/职位/手机/邮箱格式） | 多次运行 target 稳定 |

## 5. 未决项（需用户卡复现确认）

- 用户截图对应的实机配置（是否开启 NativeTruth/哪版 userscript）——需要用户提供卡片图或 thirdDiyAdd.do URL 复现。
- 3.3 Anchor 错配是否实际发生（per-case JSON anchorUsed 在各 run 中未回填成功，待修复采集）。
- 3.4 错字源自 Native 或 Baidu——取决于用户端 NativeTruth 开关。

## 6. 相关报告/证据

- runtime/reports/stage-9/commit-46-real.json + commit-46-real-{case}-{ab}.json（全量 A/B）
- STAGE9_COMMIT4_6_VISUAL_REPAIR_REPORT.md（§9 全量结果 / §13 会话自动续期 / §13.1 P0 自动登录）
