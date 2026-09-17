# UI-2 改造前后对比（真机实测，真实 ScriptCat + 真实折立印 + 目标 URL）

| 项目 | 改造前 | 改造后 | 判定 |
|---|---|---|---|
| 面板 position | `fixed` | `fixed` | OK |
| 面板 z-index | `2147483000` | `100` | PASS |
| 面板 width | `246px` | `311px` | PASS (原生310) |
| 面板 background | `rgb(255, 255, 255)` | `rgb(253, 253, 253)` | PASS |
| 面板 color | `rgb(23, 32, 51)` | `rgb(66, 66, 66)` | PASS |
| 面板 border-left | `0.8px rgb(215, 220, 229)` | `0.8px rgb(234, 234, 234)` | OK |
| 面板 box-shadow | `rgba(16, 24, 40, 0.12) -8px 0px 24px 0px` | `rgba(0, 0, 0, 0.1) 0px 4px 20px 0px` | PASS |
| 面板 font-family | `"Microsoft YaHei", "Segoe UI", Arial, sans-serif` | `"Microsoft YaHei", tahoma, arial, "Hiragino Sans GB", 宋体, sans-serif` | OK |
| 面板头 bg | `rgb(31, 111, 235)` | `rgb(255, 255, 255)` | PASS 修复UI-RISK-10 |
| 面板头 color | `rgb(255, 255, 255)` | `rgb(66, 66, 66)` | PASS |
| 面板头 padding | `10px 12px` | `10px 20px` | PASS (原生10px 20px) |
| 面板头 cursor | `move` | `default` | PASS |
| 入口 tag | `undefined` | `LI` | PASS (BUTTON->LI) |
| 入口 width | `190px` | `190px` | PASS |
| 入口 height | `52px` | `33px` | PASS (原生33) |
| 入口 background | `rgb(46, 127, 240)` | `rgb(255, 255, 255)` | PASS |
| 入口 color | `rgb(255, 255, 255)` | `rgb(66, 66, 66)` | PASS |
| 入口 font-size | `18px` | `12px` | PASS |
| 入口 font-weight | `700` | `400` | PASS |
| 入口 font-family | `Arial` | `"Microsoft YaHei", tahoma, arial, "Hiragino Sans GB", 宋体, sans-serif` | PASS (消除Arial) |
| 入口 文案 | `(单字)识` | `图片文字识别` | PASS |
| 入口 图标 | `无` | `diyicon icon-discern zyo-entry-icon` | PASS |
| 主按钮 bg | `n/a` | `rgb(59, 130, 246)` | PASS (#3b82f6) |
| select 圆角 | `6px` | `3px` | PASS |
| select font-size | `12px` | `13.3333px` | PASS |
| baidu input 圆角 | `6px` | `3px` | PASS |
| status color | `rgb(102,112,133)` | `rgb(106, 106, 106)` | PASS (#6a6a6a) |
| 横向滚动 | `false` | `closed=false opened=false reclosed=false` | PASS |
| 抽屉 toggle | `无法打开` | `closed=none opened=flex reclosed=none` | PASS |
| legacy 浮窗 | `未挂载` | `closed=false opened=false` | PASS |

**统计**：PASS 27 / OK 3 / FAIL 0 / 合计 30

> 说明：改造前数据取自 `ui2-inject2.json`（v0.3.8.0 未改造注入实测）；改造后取自 `ui2-snap-closed.json` / `ui2-snap-opened.json` / `ui2-snap-reclosed.json`（双向 toggle 实测）。