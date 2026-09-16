# AI-1 工作指令归档索引

> 目的：任何人只通过 GitHub 就能还原「为什么这么改、谁要求这么改、改了什么、测试了什么、为什么通过」。

- [Stage 5.5B 收尾闭环（P1→P2→P3→P6→P7→P8 真机）](./stage-5.5b/001-p1-p8-closeout.md) — 2026-09-16，最终状态指令：全过程同步 GitHub、指令归档、执行记录、P1「画布未就绪」时序调查、P2 原生网页面板、P6 背景图验收、Duplicate/Rollback、真机人工验收、GATE 40 项逐项。

## 约定（延续既有纪律）

- 每个逻辑修改 = 独立 commit；每步 commit + push；禁止 force push / squash。
- 先证据再修改：FAIL 必须先判断是实现 bug / 测试 bug / 环境限制，禁止为 PASS 降断言。
- 不重写项目、不推翻现有逻辑、不重新做 OCR 选型、不破坏 main。
- 历史证据只追加不删除（不 rm / rewrite / replace）。
- Technical / Product / Real User 三态分开记录，Real User 只有真人操作完成后才能写 PASS。