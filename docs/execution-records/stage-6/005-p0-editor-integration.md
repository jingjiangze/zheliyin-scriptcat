# 执行记录 005 — Stage 6.1 TextBlock 排版稳定 + Stage 6 P0 编辑器接入

- 日期：2026-09-17
- 分支：demo
- 基线：push 前 HEAD = 5e6f922（0.3.8.6）；末次 HEAD = 6377625（0.3.8.7）
- 环境：252438（`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`）

## 执行目标
1. Stage 6.1：Local OCR → Line → TextBlock → Textbox 稳定（§1–§24）
2. Stage 6 P0 强制补充：原生图层接入 / Undo-Redo / OCR 对象生命周期（§一–§二十四，优先级最高）

## 修改文件
- `extension/src/ocr/candidate-normalizer.js`：joinWordsSmart / applyTessLineText（§5 中文空格修正）/ groupLinesToBlocks / buildTextBlocks / estimateTextWidth/Layout / groupWordsToLines 形状兼容与容差调参
- `zheliyin-card-assistant.user.js`：tessLines 传入聚合、buildTextBlocks 接入（本地/百度路径）、buildItemsFromOcr 消费 TextBlock（fontSize 标定/防提前换行/高度/诊断）、GROUP 几何诊断、SUCCESS 日志editorInteg 计数；v0.3.8.7
- `extension/src/editor/page-bridge.js`：ocrCreate 事务回滚；mirrorEditorObjectModel（multiUuid 用 `sundry.guid()`、location*/printLocation*/layerNum/media*）、原生 `Undo.getInstance().save()` 前后尝试、`editorIntegration` 接入诊断
- `tests/editor-object-model/candidate-normalizer.test.js`：A–I 块聚类、拼接、宽度/换行诊断、executor x01 形状、tess CJK 空格回归；12 套件全 PASS
- `runtime/`：12 轮生命周期审计脚本 + P0 真机回归 harness
- `docs/stage-6-editor-integration-report.md`、`CHANGELOG.md`、版本同步（userscript/manifest/assistant/README）

## 关键结果（252438 真机）
- 合成名片背景（张三/销售经理/电话：13800138000 同块 + 独立区）本地 OCR：
  - GROUP 诊断：`lines=4 y=72,132,192,449 h=56,59,53,47`（4 个视觉行，逐字 bbox 字高差异 1.5~1.8×，调参后正确同行聚类）
  - TextBlock：2 块（同块 3 行保留 `\n`；独立区不合并）→ **2 textbox**
  - textbox：`张三\n销售经理\n电话:13800138000`（无中文空格、手机号连续）；可双击编辑；multiUuid v4（原生生成器）、mediaMediaType=text、layerNum>0、location* 数值
  - forcedWrap=0；createdCount=detectedBlocks=2；editorInteg={undo:true, savePre:true, savePost:true, ident:2, uv4:2}
- 原生 undo 闭环：PENDING（审计定位根因：编辑器撤销为 JSON 快照式，RAW canvas.add 不被原生历史跟踪；本版完成身份镜像+原生 save 尝试，原生注册入口接入后复测）

## 证据
- `docs/evidence/stage-6-p0/`（audit2–audit12 + stage-6-p0-editor-integration.json）
- `runtime/reports/stage-6-p0-editor-integration.json`

## Git 提交
```
4ff8d97  feat: stage-6.1 TextBlock layer + smart join + wrap diagnostics (v0.3.8.7)
26449b1  audit: characterize native layer/undo/add-text lifecycle on 252438 (stage-6 P0)
9bc9794  feat: mirror OCR textboxes into editor object model + native undo save attempt (stage-6 P0)
10f0711  fix: keep smart-join text for pure CJK lines instead of tess spaced line.text
5e7d402  fix: normalize executor word bbox {x0,y0,x1,y1} before line clustering
2e2d527  diag: log aggregated line geometry (y/h numeric only)
6377625  fix: relax line-clustering tolerance for real chi_sim per-char bboxes
（后续：test 归档 + docs 记录 本文件）
```
远程 demo 已同步（`git push origin demo`），HEAD==origin/demo==6377625（末次推送后）。

## 未解决问题（诚实清单）
- [PENDING] 原生 Undo/Redo 对 OCR 批次的完整感知（U-1）——见 report U-1~U-5
- [PENDING] 原生「新增文字」入层入口自动化不可复现 → 真机人工 UX 置字对拍（report 2.4/U-3）