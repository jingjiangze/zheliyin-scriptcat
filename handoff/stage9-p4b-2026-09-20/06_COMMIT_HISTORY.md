# 06 — Commit History（Stage 9，SHA 已按 git log 核对）

## 当前交接基线（新 Agent 起点）

```
a37b35f  feat(stage-9): add optional image ink typography target (P4-B commit2, 0.3.11.40)   ← HEAD / test
4359707  test(stage-9): add image ink target measurement (P4-B commit1)
391e92e  test(stage-9): add font calibration audit (P4-A, diagnostics only)
ac530ab  test(stage-9): verify front back calibration isolation E2E (P3 evidence run v2 PASS)
016ad62  test(stage-9): verify front back calibration isolation E2E (P3 evidence run)
58723fc  test(stage-9): verify front back calibration isolation E2E (P3 evidence tool)
3e3cf54  test(stage-9): verify baidu standard vs accurate geometry (P2 evidence)
d96e304  test(stage-9): verify front-back calibration isolation (P3, §49)
17a91a4  feat(stage-9): add new-vs-calibration recognition routing (P3)
d2413a8  test(stage-9): benchmark Baidu standard vs accurate geometry (P2 evidence tool)
2c7ce22  feat(stage-9): add Baidu standard/accurate geometry profiles (P2)
c531a7a  fix(stage-9): harden OCR page/transaction identity (P1)
```

## V3 及以前（Native Truth 建立期）

```
72e03ae  feat(stage-9): Native OCR 手写体优先 + 明显错误回退印刷体（0.3.11.36）
4fed71d  test(stage-9): native OCR precision A-B evidence（V3 复测收口，v27）
b84df1c  feat(stage-9): support native OCR precision-mode replay（0.3.11.35）
c3156e2  test(stage-9): verify native text truth isolation（v25/v26）
09ac312  fix(stage-9): Native Truth 真机修复（0.3.11.34）
5e2733a  feat(stage-9): connect native OCR as absolute text truth（0.3.11.33）
350ba76  test(stage-9): audit native OCR reconstruction wiring + SOURCE 基准
10022cf  test(stage-9): verify direct native OCR replay (GATE-9A 3/3)
09504e6  feat(stage-9): add native OCR provider
c5bbb98  docs(stage-9): document native OCR protocol
fef563e  test(stage-9): discover native OCR network protocol
e4e0c21  feat(stage-9): add text-geometry matcher
70b6239  feat(stage-9): add Baidu geometry adapter
dac3327  feat(stage-9): add AltQ text truth provider adapter
8969f5c  test(stage-9): P0-3F jsj 登录态菜单枚举
c702a20  test(stage-9): P0-2 基线 v23 报告
af96579  test(stage-9): P0 取证（Alt+Q 反证等）
```

## 待办（未创建）

```
- P4-B Commit 3（真机 A/B 矩阵）       → 未开始
- P4-B Commit 4（结论文档）            → 未开始
- P4-C（FS_MIN=10 统一）               → 未开始
- P4-D（bounded loop 职责收敛）        → 未开始
```

## 分支对照

| 分支 | HEAD |
| --- | --- |
| stage-9-altq-baidu-reconstruction | a37b35f（HEAD） |
| test | a37b35f |
| demo | 61cd248（0.3.11.35，冻结至用户确认晋级） |
| main | 6840170 |