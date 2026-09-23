# 行绑定/拆行缺陷审计与修复方案（2026-09-23）

> 范围：Stage 9.9 —— 折立印名片 OCR 自动创建的「OCR 行 → textbox」绑定正确性。
> 触发：用户反馈 test(0.3.11.62) 位置/颜色不如 demo(0.3.11.49)；要求修复 demo 的拆行问题与列出的问题。
> 引用证据：runtime/reports/stage-9/snap/（test/demo × 盈通/夏祝莲 × 独立轮 + 同 OCR 轮，共 8 份报告快照）；
>            共享 OCR cache：snap/baidu_yintong.json、snap/baidu_xiazhu.json。

---

## 1. 审计方法（消除干扰）

- 新增 runner 开关 ZY_BAIDU_CACHE：让 test 与 demo 两次运行吃**同一份 Baidu 候选**（含每行 bbox），
  消除云端 OCR 跨轮「行分割 / bbox」随机差异 —— 避免把 OCR 噪声误判成代码劣化。
- 同 OCR 对照结论：test 与 demo 的位置差异**完整复现**，证明是代码层行绑定差异，非 OCR 随机。

## 2. 审计结论

### 2.1 正常基座（两版一致）
- 图片 → canvas 映射缩放一致（山东集团行两版同位置 32/193，cache bbox (60,360) ×0.54 → 32/194 ✓）。
- 颜色已回退（Commit A-ROLLBACK）：test 改为无条件应用 ImageInk 主色，不再全黑。

### 2.2 缺陷 A（demo 0.3.11.49）：文本↔bbox 索引错位（即「拆行/串位」）
证据（盈通，cache 行序 0/1/2/3/4/5…r 对应 bbox）：

| demo 创建行 | demo 位置 | 实际落位 = cache 行 |
|---|---|---|
| 简设计（商误识） | 325/33 | 行0 商设计(606,62)×0.54 |
| 盈通启富证券 | 369/36 | 行1 "1"(689,67) |
| YOUR LOGO | 378/36 | 行2 盈通启富证券(706,68) |
| 张 天天 | 325/55 | 行3 YOUR LOGO(607,103) |
| 理财顾问 | 29/74 | 行4 张天天(54,138) |
| 1888888 6666（拆行） | 28/107 | 行5 理财顾问18888886666(52,200) |

→ demo 把行文本与 bbox 整体错位 1-2 位（index-style zip 或行排序后未重配对）。
demo 的「拆行」= 把 Baidu 合并行「理财顾问18888886666」拆成 2 个 textbox（理财顾问 / 1888888 6666）。
⚠ demo 大多数行「看着对」的原因是：错位后落点仍在同区域（扫码/竖排区），视觉欺骗。

### 2.3 缺陷 B（test 0.3.11.62）：忠实但丢行 / 合并行整段定位
证据（test 盈通，visualRows.ocrBBox == targetGeometry，锁定 bbox 忠实）：

| test 创建行 | test 位置 | bbox 来源 |
|---|---|---|
| 张 天天 | 29/74 | 行4(54,138) ✓ 正确 |
| 理财顾问 | 28/107 | 行5 合并行(52,200) ← **整段坐合并行** |
| 简 | 424/225 | 行9(791,421) ✓ |
| www | 51/243 | 行11(96,455) ✓ |
| 山东省…中心 | 52/222 | 行8(97,415) ✓ |

- 正确：每行锁自己行 bbox（无串位）。
- 问题 1：**数字行「1888888 6666」丢失**（aligner isDigitOnly 排除于 SINGLE_LINE_CONTAINMENT → unmatched → gate 未创建）。
- 问题 2：**合并行拆出的「理财顾问」整段坐在合并行 bbox**,没有用子段（word/ink）定位 → 与 demo 拆出的「1888888 6666」行不并存（test 少建 1 行）。
- 现象叠加：test 创建 9 行 vs demo 11 行；行数少 + 个别行视觉别扭 → 用户判「test 不如 demo」。

### 2.4 界定
- 两版缺陷独立：demo=索引错位；test=忠实 + 丢行/整段定位。
- 颜色缺陷已在 Commit A-ROLLBACK 修复（不做本方案主体）。

## 3. 修复方案（统一原则）

> 原则：一行候选 → 一个 textbox；text 与 bbox 必须严格同源同行；只允许「与 bbox 语义一致」的拆分，
> 禁止 index zip / 前后行偏移；Num 行必须纳入创建。

### 3.1 test 轨道（B1/B2）
- B1 数字行恢复：aligner Phase 1.5 的 isDigitOnly 仅用于「单行包含匹配」排除；
  数字行（电话/日期）必须进入 final 创建 —— 用 Geometry Recovery Pipeline 分配 bbox（候选链
  BAIDU_WORD → LOCAL_WORD → IMAGE_INK），禁止直接丢弃；unmatched 时走 NATIVE_PARTIAL_OK 应有语义，
  数字行属于「原生行缺失但可靠 geometry 存在」类别 → 创建。
- B2 合并行拆分定位：native 把 Baidu 合并行拆成多块文本时，每块用它**子区域的 bbox**
  （优先 word geometry（BAIDU_WORD），其次 image-ink inkBox，禁止整段 union）。
  单测断言：「理财顾问」≈ 合并行左段 ink，「1888888 6666」≈ 右段 ink，两行 no-overlap。

### 3.2 demo 轨道（D1/D2）
- D1 行绑定修正：buildItemsFromOcr 中候选行与 bbox 的配对改为规范化文本匹配 + y 序双重校验，
  从源头消除「商设计/盈通启富/YOUR LOGO/张天天」整链错位；禁止 index 或 insertion-order zip。
- D2 拆行保留但 bbox 子段化（同 B2，复用 Geometry Recovery Pipeline 纯模块）。
- 注：demo 轨道修复可直接并入 test 版本（推荐：test 修好晋级 demo，避免双轨分叉）。

### 3.3 统一改动
- extension/src/ocr/native-geometry-aligner.js：Phase 1.5 数字行不加锁；one-to-many 拆分窗口允许数字行。
- extension/src/ocr/native-geometry-recovery.js：覆盖「合并行→数字行」word 级恢复场景（search 链加
  BAIDU_WORD numeric 分支），纯函数，单测先行。
- zheliyin-card-assistant.user.js buildItemsFromOcr：
  - 合并行拆分块：targetQuad/Box 改取子区域（word/ink），不再整段；
  - 数字行进入 items：text=rawText，bbox=子区域,字号=per-line median（沿用现有规则）。
- runner：ZY_BAIDU_CACHE 已实现（保持）。

## 4. 验证方案

1. 单测（新增，纯函数）：aligner 数字行 one-to-many（≥5 cases）；recovery numeric word（≥5 cases）；
   buildItemsFromOcr 子段定位（≥4 cases，覆盖 理财顾问/1888888 6666 无重叠）。
2. 全量回归：stage9 现有 29 文件 + runner --selftest 全绿后再动生产。
3. 真机同 OCR：ZY_BAIDU_CACHE 复用 snap/baidu_yintong.json：
   - test 盈通：创建行数 = 11（找回「1888888 6666」），理财顾问/电话行位置 = 子段 bbox，山东/简/www = bbox×0.54；
   - demo 盈通（若单改 demo）：行绑定各就各位（简设计=行0、盈通启富=行2、YOUR LOGO=行3、张天天=行4）。
4. demo 晋级门禁：发布前过印刷流程 gate（submitUserDesign.do 核稿链，runtime/p0/runner.js）。

## 5. 风险与回退

- B1/B2 会改变 test 创建行数与个别行位置：先单测、再真机、再发布；deviation 记录到报告。
- 数字行恢复可能引入「电话/日期错行创建」回归：用 recovery 置信门槛 + occupied 检查兜底。
- demo 晋级 = 发布流程（demo-only closure）；执行前需用户确认 branch 策略（test→demo ff）。
- 若单测/真机不佳：保留 Commit A-ROLLBACK 为独立回退点（80c4b9a 已锁定颜色修复）。

## 6. 结论（待用户裁决）

推荐执行顺序：
1) test 修 B1+B2（含单测+真机同 OCR 验证）→ 双推；
2) 行绑定统一逻辑并验证 demo 行为（demo 镜像 worktree 同 OCR 对照）；
3) 用户确认后晋级 demo（0.3.11.62+，过印刷 gate）。
