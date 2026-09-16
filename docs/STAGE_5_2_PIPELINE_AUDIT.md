# STAGE_5_2_PIPELINE_AUDIT

Real Usable Editor Pipeline + Object Matcher Foundation · 真实可用的确定性编辑流水线

> 原则：先让现有网页脚本真正可用 → 再扩大自动化（§六十五）。Matcher 是确定性层，OCR 只提供候选，AMBIGUOUS/NOT_FOUND 就停止。

---

## 1. 交付与证据

| 交付 | 文件 | 证据 |
|---|---|---|
| P0 Product Smoke（REMOTE user path） | runtime/stage5-product-smoke.js | runtime/reports/stage5-product-smoke.json（11 步 PASS） |
| P1 Object Matcher（确定性） | extension/src/editor/object-matcher.js | 单测 + runtime/reports/stage5-matcher.json |
| Matcher 单测/fixtures | tests/editor-object-model/object-matcher.test.js + editor-objects-52.json | 5 套件全 PASS |
| P4 OCR Candidate | extension/src/ocr/ocr-model.js | tests/.../ocr-model.test.js + fixtures/ocr/redacted-card-01.json |
| Matcher Real-Editor Probe + Safe Mutation 阶段二 | runtime/stage5-object-matcher.js | stage5-matcher.json |

生产行为变更：**零**（未触碰 page-bridge.js / assistant.js / userscript / apply 链 / UI；新增 object-matcher.js + ocr-model.js 为就绪未挂接基础设施，§四/§四十七 legacy 保留）。

## 2. P0 Product Smoke（§八/§十）

真实 ScriptCat + 生产聚合 userscript（4 个 @require src 内联 self-consistency）在真实编辑器：

```text
install(PASS) → nav(PASS) → 面板出现 #zy-raw+#zy-apply-front(PASS) → canvas(PASS) → snapshot(PASS)
→ 粘贴客户资料 + 点击【识别并填正反面】(PASS, local 规则回退无 AI key)
→ 文本真实变更：公司/电话(11位)/微信/地址 填入 4 textbox(PASS)
→ reload 模板恢复(PASS, 21 对象无残留) → 无助手 pageerror(PASS, 4 个页面自身历史错误不计) → cleanup(PASS)
PRODUCT_SMOKE = PASS
```

**产品 finding（记录不修改）**：当前 legacy 规则在无「公司」槽位时 company 会轻度复用「姓名」槽（scoreObject C1 语义），导致姓名无位可填 —— 属既有产品行为，5.3 统一 legacy+matcher 时按策略处理。

## 3. P1 Object Matcher（§十一~§二十五）

- 确定性纯函数：`match(candidate, objects, ctx)` → MATCHED / AMBIGUOUS / NOT_FOUND / ERROR（不 throw，§五十四）。
- 评分 = 0.35·IoU(visualBounds) + 0.2·(1−centerDistance) + 0.1·sizeRatio + 0.35·textCompatibility（语义词表与 Stage 5.0 字段分类一致，§十六 复用语义）。
- 坐标：candidate.bbox 与 visualBounds 同坐标系（Canvas px）；normalizeRect/denormalizeRect 供 OCR 接入（§十九）。
- 保护：MATCH_TH=0.45 + AMBIGUOUS_MARGIN=0.08 → 满足即 stop（§十四/§三十五）；line/group-child 排除（§二十/§二十一）；不伪造 persistedId（§二十四）；O(n)（§五十三）。

**Real-Editor 验证（stage5-matcher.json）**：
- 自匹配 4/4：真实 textbox visualBounds → candidate → MATCHED 且 selected.index 一致（score 0.807）→ **TEXT_OBJECT_MATCHING = PASS**
- 偏移 +180px → NOT_FOUND（score 下降验证）→ 无强制匹配
- 阶段二 Safe Mutation：MATCHED → setText → diff **仅 [text, height]**（§三十三 EXPECTED_MUTATION）→ restore → diff **[]** 零残留
- AMBIGUOUS 在单测覆盖（近距对象对 → AMBIGUOUS，不 pickObject[0]）

## 4. P4 OCR Candidate（§四十~§四十四）

- `createOCRCandidate({text,bbox,confidence,source})` 纯数据；isUsable 过滤空白/非法 bbox；未绑定任何 OCR 服务商。
- fixture `tests/fixtures/ocr/redacted-card-01.json` 对应真实画布 4 区域；单测验证 usable → matcher 直连（解耦，§四十二）。

## 5. REAL_USABLE_FLOW（§三十九）

= PRODUCT_SMOKE（用户 UI 路径：粘贴→识别→apply→恢复）+ MATCHER PROBE（读对象→候选→match→safe mutation→rollback）两链组合，全部真实编辑器执行 → **REAL_USABLE_FLOW = PASS**。

## 6. 独立复审（§五十七 12 问）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 用户现在能真实使用？ | PASS（PRODUCT_SMOKE 11 步用户路径） |
| 2 | Matcher 会误匹配？ | 自匹配 4/4 正确；偏移降级 NOT_FOUND；单测覆盖 wrong-object/overlap |
| 3 | AMBIGUOUS 真的停止？ | 是（0.08 margin 判 AMBIGUOUS，不选第一个） |
| 4 | NOT_FOUND 不乱创建？ | 是（matcher 只输出结果；创建未接入本阶段） |
| 5 | setText 只预期 mutation？ | 是（real-editor diff 仅 text+height） |
| 6 | 创建 identity 干净？ | 5.1 已 SAFE（skipBox 修复仍在；本阶段未新增创建路径） |
| 7 | group 被当 top-level？ | 否（candidateObjects 排除 groupChild + line） |
| 8 | rotation 用 visualBounds？ | 是（优先 visualBounds；aabbFromGeometry 纯数学兜底并有单测） |
| 9 | OCR bbox 与 Canvas 坐标一致？ | 有归一化工具 + 同坐标系约定；真实 OCR 需 5.3 图像→归一验证 |
| 10 | Legacy fallback 可用？ | 是（page-bridge 零改动；product smoke 走 legacy 真实生效；matcher 未挂接） |
| 11 | 失败时安全？ | 是（ERROR 不 throw；无助手 pageerror） |
| 12 | Stage4/RUNTIME-8.3 无回归？ | 是（本轮未改 page-bridge；5.1 全链回归仍 PASS） |

## 7. Final Report（§五十八）

```text
PRODUCT_SMOKE = PASS          OBJECT_MATCHER = PASS
TEXT_OBJECT_MATCHING = PASS   AMBIGUOUS_PROTECTION = PASS
NOT_FOUND_PROTECTION = PASS   SAFE_TEXT_MUTATION = PASS
CREATION_SAFETY = PASS(5.1)   ROLLBACK = PASS
RUNTIME_8_3 = PASS            UNIT = PASS(5 suites)
NO_P0 / NO_P1

Production Changes:
  - 零行为变更；新增 object-matcher.js + ocr-model.js（未挂接、legacy 保留）
Commits: 1f24e28(product smoke) bc554eb/28cc691(matcher feat+test) e962012(ocr model)
         84ba493(matcher real-editor probe) + 本 docs
Push: 已推送（无 force/squash）
Deferred:
  - OCR 真实图像→候选 未接入（5.3 OCR Runtime Integration）
  - matcher↔legacy scoreObject 统一、公司槽位/姓名槽映射策略（5.3）
  - multi-template 仍 PARTIAL

Gate: GO
```

## 8. 停止点（§六十三）

本阶段达成：当前脚本真实可用（PRODUCT_SMOKE）+ 经真实 Editor 验证的 Object Matcher + OCRCandidate 接口已建立。**不实现完整 OCR 自动重建** —— 下一阶段（Stage 5.3：OCR Runtime Integration / Real Image → OCR → Matcher）根据真实 Runtime 结果再推进。