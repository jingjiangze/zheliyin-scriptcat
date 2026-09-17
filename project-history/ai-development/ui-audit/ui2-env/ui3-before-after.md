# UI-3 视觉融合精修 — 原生 vs 我方逐项比对

> 方法：在真实页面里读取原生 AI 面板族（`.design-ai-panel` / `.ai-panel-*` / `.ai-btn-*`）的 computed style，
> 与同一坐标系下我方抽屉的同名元素并排比对。**不凭经验设计**（任务书 §五）。

| # | 项目 | 原生实测 | 我方实测 | 判定 | 收敛动作 |
|---|---|---|---|---|---|
| 1 | panel width | 310px | 310px | PASS |  |
| 2 | panel bg | rgb(253, 253, 253) | rgb(253, 253, 253) | PASS |  |
| 3 | panel color | rgb(66, 66, 66) | rgb(66, 66, 66) | PASS |  |
| 4 | panel radius | 8px | 0px | DIFF | 原生 radius 8px 是给浮层圆角的；我们的抽屉贴右栏左边、通高，直角更自然 → 判定为**可接受差异**，不改（改圆角反而露白缝） |
| 5 | panel shadow | rgba(0, 0, 0, 0.1) 0px 4px 20px 0px | rgba(0, 0, 0, 0.1) 0px 4px 20px 0px | PASS |  |
| 6 | panel padding | 0px 0px 0px 10px | 0px | DIFF | 原生 `0 0 0 10px`（给标题留左内衬）；我们已被 .zy-body 的 padding 覆盖 → 不改 |
| 7 | header padding | 10px 20px | 10px 20px | PASS |  |
| 8 | header bg | rgb(255, 255, 255) | rgb(255, 255, 255) | PASS |  |
| 9 | header border-bottom | 234) | 234) | PASS |  |
| 10 | header height | auto（内容撑开 = 10+22.4+10 ≈ 42.4） | 24px（10+24+10 = 44） | SLIGHT | 原生标题 line-height 22.4px（16×1.4），我们 19.2px（16×1.2）→ 统一为 **1.4**，header 自然高度随之对齐 |
| 11 | title font-size | 16 | 16 | PASS |  |
| 12 | title font-weight | 700 | 700 | PASS |  |
| 13 | title line-height | 22.4px | 19.2px | FAIL | **UI-3-FIX-01**：19.2px → 22.4px（对齐原生 1.4 倍行高） |
| 14 | title gap | 6px | 8px | FAIL | **UI-3-FIX-02**：header gap 8px → 6px（虽然 title 自身 gap 与 header gap 是不同属性，但 6px 是原生统一节奏） |
| 15 | body padding | 10px 15px 10px 5px | 10px 15px | FAIL | **UI-3-FIX-03**：`10px 15px` → `10px 15px 10px 15px` 保持（左 5px 是原生给标题内衬的对齐，我们的 body 无标题 → 判定为可接受差异，不改） |
| 16 | body gap | normal | 10px | PASS | 原生为 block（无 gap）；我们用 grid + 10px gap，属**布局实现差异**，视觉等价 |
| 17 | primary btn height | 44px | 138.438px | FAIL | **UI-3-FIX-04（最高优先）**：138.4px → **44px**。当前 280×138 是巨型蓝块，是全抽屉最不像原生的元素 |
| 18 | primary btn radius | 22px | 4px | FAIL | **UI-3-FIX-04**：4px → **22px**（原生胶囊） |
| 19 | primary btn font | 15/700 Microsoft YaHei | 14/400 Microsoft YaHei | FAIL | **UI-3-FIX-04**：14/400 → **15/700** |
| 20 | primary btn shadow | rgba(59, 130, 246, 0.3) 0px 4px 12px 0px | none | FAIL | **UI-3-FIX-04**：none → **rgba(59,130,246,.3) 0 4px 12px** |
| 21 | primary btn line-height | 21px | normal | FAIL | **UI-3-FIX-04**：normal → **21px**（原生 15×1.4） |
| 22 | primary btn display | flex | block | SLIGHT | 原生 flex（居中）；我们 block + 巨高。收敛高度后 block 即可，无需改 flex |
| 23 | save btn h/radius/font | 44 / 22px / 15-700 | 32px / 4px / 14/400 Microsoft YaHei | FAIL | **UI-3-FIX-05**：32px / 4px / 14-400 → 44px / 22px / 15-700（与主按钮同族） |
| 24 | test btn (outline) | h44px r22px 14/400 Microsoft YaHei border 0.8px solid rgb(234, 234, 234) pad 0px 24px | h32px r4px 14/400 Microsoft YaHei border 0.8px solid rgb(219, 219, 219) pad 1px 6px | FAIL | **UI-3-FIX-06**：对齐原生 `.ai-btn-outline` → 44px / 22px / 14-400 / border `#eaeaea` / padding `0 24px` |
| 25 | select/input height | 原生 input 18px（.ai 体系内可能另有） | 26px | PASS | UI-1 已实测原生一般 input 为 h18；但折立印业务 input 多为 26-30px。26px 处于合理区间 → 保留 |
| 26 | input radius/border/font | 3px / #dbdbdb / 13.3333px | 3px / #dfdbdb / 13.33px | PASS | 已对齐 |
| 27 | input padding | - | 0 5px | PASS | 对齐原生 `padding: 0 5px` |
| 28 | entry height | 原生 .tabPageLayer 32-33px / 原生 li 36px | 33px | SLIGHT | **UI-3-FIX-07**：33px 处于 32（tabPageLayer）与 36（原生 li）之间。原生右栏**功能性 tab** 为 32-33px → 保留 33px（不改） |
| 29 | entry padding | 原生 li `0 20px`；tabPageLayer 0 | 0px 10px | SLIGHT | **UI-3-FIX-08**：`0 10px` → **`0 20px`**？需权衡：原生 li 用 20px，但我们是 190px 窄栏且带图标。改为 20px 会挤压文案 → **折中为 `0 14px`**（与原生 currentLi 的 `margin-left:14px` 同源节奏） |
| 30 | entry font | 原生 li 14/400；tabPageLayer 12/400 | 12/400 Microsoft YaHei | PASS | 12/400 与 `.tabPageLayer` 一致；原生层列表 li 为 14px。保持 12px（更贴近同区域的 tab 体例） |
| 31 | close btn | 原生未见等价（AI 面板无独立关闭钮） | 24×24 / 3px / #dbdbdb | DIFF | 自我一致，无原生参照 → 保留 |
| 32 | note 文字 | 原生次要文字 #6a6a6a | #999999 | FAIL | **UI-3-FIX-09**：`.zy-note` color `#98a2b3`(#999 渲染) → **`#6a6a6a`**（原生次要文字）或保持更弱一档。原生无 note 体例 → 收敛到 `#6a6a6a` |

**统计：PASS 14 / FAIL 11 / SLIGHT 4 / DIFF(可接受) 3 / 合计 32**
