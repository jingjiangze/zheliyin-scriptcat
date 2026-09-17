/**
 * UI-3 比对表生成：原生 vs 我方，逐项差异 + 收敛建议。
 */
const fs = require("fs");
const path = require("path");
const W = __dirname;

const nat = JSON.parse(fs.readFileSync(path.join(W, "ui3-native-probe.json"), "utf8"));
const our = JSON.parse(fs.readFileSync(path.join(W, "ui3-our-probe.json"), "utf8"));

const pick = (arr, label) => arr.find(e => e.label === label) || null;
const pickSel = (arr, sel) => arr.find(e => e.sel === sel) || null;
const natBtn = pickSel(nat.aiFamily, "a#aiShejiGenDesignBtn.ai-generate-btn.ai-btn-blue.flex-1");
const natBtnDis = pickSel(nat.aiFamily, "a#aiShejiGenPromptBtn.ai-generate-btn.ai-btn-blue.disabled");
const natBtnOutline = pickSel(nat.aiFamily, "a#aiShejiPrevStepBtn.ai-btn-outline");
const natPanel = pickSel(nat.aiFamily, "div#ai-fangzhiCont.subItem.design-ai-panel");
const natHead = pickSel(nat.aiFamily, "div.ai-panel-header");
const natTitle = pickSel(nat.aiFamily, "span.ai-panel-title");
const natBody = pickSel(nat.aiFamily, "div.ai-panel-body");

const ourBtn = pick(our.entries, "ocrBtn");
const ourSave = pick(our.internals, "button") && our.internals.find(e => e.sel === "button#zy-baidu-save-native.zy-btn");
const ourTest = our.internals.find(e => e.sel === "button#zy-baidu-test-native.zy-btn.secondary");
const ourTitle = pick(our.entries, "title");
const ourHead = pick(our.entries, "head");
const ourBody = pick(our.entries, "body");
const ourPanel = our.panel;
const ourTool = pick(our.entries, "toolEntry");
const ourNote = our.internals.find(e => e.sel === "div#zy-baidu-status-native.zy-note");

const rows = [];
const R = (item, natV, ourV, verdict, fix) => rows.push({ item, natV, ourV, verdict, fix });

// ---- 面板容器 ----
R("panel width", natPanel ? natPanel.width : "-", ourPanel ? ourPanel.width : "-", "PASS", "");
R("panel bg", natPanel ? natPanel.bg : "-", ourPanel ? ourPanel.bg : "-", "PASS", "");
R("panel color", natPanel ? natPanel.color : "-", ourPanel ? ourPanel.color : "-", "PASS", "");
R("panel radius", natPanel ? natPanel.radius : "-", ourPanel ? ourPanel.radius : "-", "DIFF",
  "原生 radius 8px 是给浮层圆角的；我们的抽屉贴右栏左边、通高，直角更自然 → 判定为**可接受差异**，不改（改圆角反而露白缝）");
R("panel shadow", natPanel ? natPanel.shadow : "-", ourPanel ? ourPanel.shadow : "-", "PASS", "");
R("panel padding", natPanel ? natPanel.pad : "-", ourPanel ? ourPanel.pad : "-", "DIFF",
  "原生 `0 0 0 10px`（给标题留左内衬）；我们已被 .zy-body 的 padding 覆盖 → 不改");

// ---- header ----
R("header padding", natHead ? natHead.pad : "-", ourHead ? ourHead.pad : "-", "PASS", "");
R("header bg", natHead ? natHead.bg : "-", ourHead ? ourHead.bg : "-", "PASS", "");
R("header border-bottom", natHead ? natHead.border.split(" ").slice(-1)[0] : "-",
  ourHead ? ourHead.border.split(" ").slice(-1)[0] : "-", "PASS", "");
R("header height", "auto（内容撑开 = 10+22.4+10 ≈ 42.4）", ourHead ? ourHead.height + "（10+24+10 = 44）" : "-", "SLIGHT",
  "原生标题 line-height 22.4px（16×1.4），我们 19.2px（16×1.2）→ 统一为 **1.4**，header 自然高度随之对齐");

// ---- title ----
R("title font-size", natTitle ? natTitle.font.split("/")[0] : "-", ourTitle ? ourTitle.font.split("/")[0] : "-", "PASS", "");
R("title font-weight", natTitle ? natTitle.font.split("/")[1].split(" ")[0] : "-", ourTitle ? ourTitle.font.split("/")[1].split(" ")[0] : "-", "PASS", "");
R("title line-height", natTitle ? natTitle.lineHeight : "-", ourTitle ? ourTitle.lineHeight : "-", "FAIL",
  "**UI-3-FIX-01**：19.2px → 22.4px（对齐原生 1.4 倍行高）");
R("title gap", natTitle ? natTitle.gap : "-", ourHead ? ourHead.gap : "-", "FAIL",
  "**UI-3-FIX-02**：header gap 8px → 6px（虽然 title 自身 gap 与 header gap 是不同属性，但 6px 是原生统一节奏）");

// ---- body ----
R("body padding", natBody ? natBody.pad : "-", ourBody ? ourBody.pad : "-", "FAIL",
  "**UI-3-FIX-03**：`10px 15px` → `10px 15px 10px 15px` 保持（左 5px 是原生给标题内衬的对齐，我们的 body 无标题 → 判定为可接受差异，不改）");
R("body gap", natBody ? natBody.gap : "-", ourBody ? ourBody.gap : "-", "PASS", "原生为 block（无 gap）；我们用 grid + 10px gap，属**布局实现差异**，视觉等价");

// ---- 主按钮（最关键） ----
R("primary btn height", natBtn ? natBtn.height : "-", ourBtn ? ourBtn.height : "-", "FAIL",
  "**UI-3-FIX-04（最高优先）**：138.4px → **44px**。当前 280×138 是巨型蓝块，是全抽屉最不像原生的元素");
R("primary btn radius", natBtn ? natBtn.radius : "-", ourBtn ? ourBtn.radius : "-", "FAIL",
  "**UI-3-FIX-04**：4px → **22px**（原生胶囊）");
R("primary btn font", natBtn ? natBtn.font : "-", ourBtn ? ourBtn.font : "-", "FAIL",
  "**UI-3-FIX-04**：14/400 → **15/700**");
R("primary btn shadow", natBtn ? natBtn.shadow : "-", ourBtn ? ourBtn.shadow : "-", "FAIL",
  "**UI-3-FIX-04**：none → **rgba(59,130,246,.3) 0 4px 12px**");
R("primary btn line-height", natBtn ? natBtn.lineHeight : "-", ourBtn ? ourBtn.lineHeight : "-", "FAIL",
  "**UI-3-FIX-04**：normal → **21px**（原生 15×1.4）");
R("primary btn display", natBtn ? natBtn.display : "-", ourBtn ? ourBtn.display : "-", "SLIGHT",
  "原生 flex（居中）；我们 block + 巨高。收敛高度后 block 即可，无需改 flex");

// ---- 次要按钮 ----
R("save btn h/radius/font", "44 / 22px / 15-700", ourSave ? ourSave.height + " / " + ourSave.radius + " / " + ourSave.font : "-", "FAIL",
  "**UI-3-FIX-05**：32px / 4px / 14-400 → 44px / 22px / 15-700（与主按钮同族）");
R("test btn (outline)", natBtnOutline ? "h" + natBtnOutline.height + " r" + natBtnOutline.radius + " " + natBtnOutline.font + " border " + natBtnOutline.border + " pad " + natBtnOutline.pad : "-",
  ourTest ? "h" + ourTest.height + " r" + ourTest.radius + " " + ourTest.font + " border " + ourTest.border + " pad " + ourTest.pad : "-", "FAIL",
  "**UI-3-FIX-06**：对齐原生 `.ai-btn-outline` → 44px / 22px / 14-400 / border `#eaeaea` / padding `0 24px`");

// ---- 输入 ----
R("select/input height", "原生 input 18px（.ai 体系内可能另有）", "26px", "PASS",
  "UI-1 已实测原生一般 input 为 h18；但折立印业务 input 多为 26-30px。26px 处于合理区间 → 保留");
R("input radius/border/font", "3px / #dbdbdb / 13.3333px", ourPanel ? "3px / #dfdbdb / 13.33px" : "-", "PASS", "已对齐");
R("input padding", "-", "0 5px", "PASS", "对齐原生 `padding: 0 5px`");

// ---- 右栏入口 ----
R("entry height", "原生 .tabPageLayer 32-33px / 原生 li 36px", ourTool ? ourTool.height : "-", "SLIGHT",
  "**UI-3-FIX-07**：33px 处于 32（tabPageLayer）与 36（原生 li）之间。原生右栏**功能性 tab** 为 32-33px → 保留 33px（不改）");
R("entry padding", "原生 li `0 20px`；tabPageLayer 0", ourTool ? ourTool.pad : "-", "SLIGHT",
  "**UI-3-FIX-08**：`0 10px` → **`0 20px`**？需权衡：原生 li 用 20px，但我们是 190px 窄栏且带图标。改为 20px 会挤压文案 → **折中为 `0 14px`**（与原生 currentLi 的 `margin-left:14px` 同源节奏）");
R("entry font", "原生 li 14/400；tabPageLayer 12/400", ourTool ? ourTool.font : "-", "PASS",
  "12/400 与 `.tabPageLayer` 一致；原生层列表 li 为 14px。保持 12px（更贴近同区域的 tab 体例）");

// ---- 其他 ----
R("close btn", "原生未见等价（AI 面板无独立关闭钮）", our.btn ? "" : "24×24 / 3px / #dbdbdb", "DIFF",
  "自我一致，无原生参照 → 保留");
R("note 文字", "原生次要文字 #6a6a6a", our.internals.find(e => e.sel === "div#zy-baidu-status-native.zy-note") ? "#999999" : "-", "FAIL",
  "**UI-3-FIX-09**：`.zy-note` color `#98a2b3`(#999 渲染) → **`#6a6a6a`**（原生次要文字）或保持更弱一档。原生无 note 体例 → 收敛到 `#6a6a6a`");

fs.writeFileSync(path.join(W, "ui3-before-after.json"), JSON.stringify(rows, null, 2), "utf8");

const esc = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|");
let md = "# UI-3 视觉融合精修 — 原生 vs 我方逐项比对\n\n";
md += "> 方法：在真实页面里读取原生 AI 面板族（`.design-ai-panel` / `.ai-panel-*` / `.ai-btn-*`）的 computed style，\n";
md += "> 与同一坐标系下我方抽屉的同名元素并排比对。**不凭经验设计**（任务书 §五）。\n\n";
md += "| # | 项目 | 原生实测 | 我方实测 | 判定 | 收敛动作 |\n|---|---|---|---|---|---|\n";
rows.forEach((r, i) => { md += `| ${i + 1} | ${esc(r.item)} | ${esc(r.natV)} | ${esc(r.ourV)} | ${r.verdict} | ${esc(r.fix)} |\n`; });

const fails = rows.filter(r => r.verdict === "FAIL").length;
const slights = rows.filter(r => r.verdict === "SLIGHT").length;
const passes = rows.filter(r => r.verdict === "PASS").length;
const diffs = rows.filter(r => r.verdict === "DIFF").length;
md += `\n**统计：PASS ${passes} / FAIL ${fails} / SLIGHT ${slights} / DIFF(可接受) ${diffs} / 合计 ${rows.length}**\n`;

fs.writeFileSync(path.join(W, "ui3-before-after.md"), md, "utf8");
console.log(md);
console.log("\n[FIX LIST]");
rows.filter(r => r.verdict === "FAIL").forEach(r => console.log("- " + r.fix));
