// 归档多版真机探测结论（P1 事实基础）+ P0 版本 bump
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const OUT = path.join(ROOT, "runtime", "reports", "stage-11", "multiversion-probe.json");

const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(os.tmpdir(), f), "utf8")); } catch (e) { return null; } };
const probe2 = read("zy_mvprobe2.json");
const probe4 = read("zy_mvprobe4.json");
const probeSw = read("zy_mvsw.json");

const pick = (p, label) => (p && p.steps ? p.steps.map((s) => ({ label: s.label, state: s.state })) : null);

const report = {
  ts: new Date().toISOString(),
  stage: "MULTIVERSION-PROBE",
  purpose: "P1 多版套版的事实基础（真机探测，非源码推断）",
  site: { url: "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", typeid: "12", designerGoodsId: "252438" },
  conclusions: {
    totalCanvasArray_layout: "扁平数组，每版占 2 个连续条目：[v1正面(c0), v1背面(c1), v2正面(c2), v2背面(c3), ...]",
    canvasIndex_mapping: "第 vIdx 版第 side 面的 canvas 索引 = 2*vIdx + (side==='back' ? 1 : 0)",
    versionCount_source: ".pageWrapMulti li 数量（1=单版，>1=多版）；不可用 CanvasObjVO.multiCanvas（真机恒为 true，无区分力）",
    currentVersion_source: [
      "CanvasObjVO.currentCanvasNum（1 基）→ canvasIdx = cur-1 → vIdx = floor(canvasIdx/2)，side = canvasIdx%2 ? back : front",
      "DOM 交叉：.pageWrapMulti .page-group.current 的全局索引 == canvasIdx",
      "DOM 交叉：.pageWrapMulti li.currentLi 索引 == vIdx"
    ],
    dom_structure: ".pageWrapMulti > li（每版一个）> .page-group ×2（正面/背面）+ .pageNum；多版下 pageNum 文本为「第N版正面/背面」；第 1 版 li class=currentLi 且删除按钮为 del-first，第 2 版起 class=otherLi 且为 icon-del",
    enable_multiversion_sequence: [
      "1) 先点「背面」使 c1 materialize（站点硬约束：否则弹「开启多版前请先确认背面设计」）",
      "2) 点当前版 li 内 a.copy-template（文本「多版设计」）→ 弹窗「多版设计（输入版数）」",
      "3) #modleNum = 依据第几版设计（必须 ≤ .pageWrapMulti li 数，否则 layer.msg 拒绝且弹窗不关）",
      "4) #multiNum = 本次新增版数（父容器 .copy-template-num 带 +/- 按钮）",
      "5) 点确定 → 异步渲染（约 10s+）"
    ],
    switch_version: "点击 .pageWrapMulti .page-group[canvasIdx]（点 li 本身无效）；切换后 currentCanvasNum / .page-group.current / li.currentLi / 可见 .canvas-container 同步变化",
    canvas_visibility: "仅当前面的 .canvas-container display=block，其余 none",
    popup_fields: "#copyTemplate 内含 .copy-modle-num（#modleNum，即「根据第 [N] 版设计」）与 .copy-template-num（#multiNum + 加减）；#copyMulti 为流程标志（弹窗开启时 1）"
  },
  realDeviceEvidence: {
    step4_after_multi_created: pick(probe4, "probe4"),
    switchExperiment: pick(probeSw, "switch")
  },
  impactOnCurrentCode: {
    risk: "extension/src/editor/page-bridge.js findCanvasForSide() 硬编码 total[side==='back'?1:0] → 多版下恒取第 1 版（第 2 版起不可见、不可改）",
    backwardCompat: "单版 totalLen=2 → vIdx=0 → canvasIdx=0/1，与现状逐字一致；snapshot.slotId 保持面内相对 + 新增 version 字段"
  },
  probeRuns: {
    probe2_li_ops_hidden: probe2 ? { initial_hidden: probe2.steps && probe2.steps[0] && probe2.steps[0].state && probe2.steps[0].state.hidden, li_ops: probe2.steps && probe2.steps[0] && probe2.steps[0].state && probe2.steps[0].state.liInfo } : null
  }
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log("probe report -> " + OUT);

// ---- P0 版本 bump：0.3.11.75 → 0.3.11.76（全链：userscript + page-bridge stamp + stage9 runner BVER）----
const OLD = "0.3.11.75", NEW = "0.3.11.76";
const files = ["zheliyin-card-assistant.user.js", "extension/src/editor/page-bridge.js"]
  .concat(fs.readdirSync(path.join(ROOT, "runtime", "stage9")).filter((f) => f.endsWith(".js")).map((f) => "runtime/stage9/" + f));
let total = 0;
for (const rel of files) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const src = fs.readFileSync(fp, "utf8");
  const n = (src.match(new RegExp(OLD.replace(/\./g, "\\."), "g")) || []).length;
  if (!n) continue;
  fs.writeFileSync(fp, src.split(OLD).join(NEW), "utf8");
  total += n;
  console.log("  bump " + rel + " ×" + n);
}
const us = fs.readFileSync(path.join(ROOT, "zheliyin-card-assistant.user.js"), "utf8");
console.log("P0 bump " + OLD + "->" + NEW + " total=" + total);
console.log("@version=" + (/\/\/ @version\s+([\d.]+)/.exec(us) || [])[1] + " VERSION=" + (/const VERSION = "([\d.]+)"/.exec(us) || [])[1] + " @require=" + (us.match(/^\/\/ @require\s+\S+/gm) || []).length + " vMatch=" + (us.match(/\?v=0\.3\.11\.76/g) || []).length);