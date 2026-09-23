// runtime/stage10/template-slot-matcher.test.js — Stage 10-D Commit B：模板槽位匹配器单测
"use strict";
const { matchSlots } = require("../../extension/src/editor/template-slot-matcher.js");
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass += 1; console.log("  ok  " + name); } else { fail += 1; console.log("  FAIL " + name); } };
const unique = (arr, f) => { const s = new Set(arr.map(f)); return s.size === arr.length; };

// 1. 正常顺序：一一对应，全部匹配
{
  const slots = [
    { slotId: "s1", left: 100, top: 10, width: 200, height: 40, fontSize: 18, text: "张天天" },
    { slotId: "s2", left: 100, top: 60, width: 200, height: 40, fontSize: 24, text: "理财顾问" },
    { slotId: "s3", left: 100, top: 110, width: 200, height: 40, fontSize: 14, text: "山东公司" }
  ];
  const rows = [
    { text: "张天天", left: 102, top: 12, width: 180, height: 36, fontSize: 18 },
    { text: "理财顾问", left: 100, top: 61, width: 190, height: 38, fontSize: 24 },
    { text: "山东公司", left: 101, top: 112, width: 200, height: 40, fontSize: 14 }
  ];
  const r = matchSlots({ slots, rows });
  t("normal order: 3 matched", r.matches.length === 3);
  t("normal order: row<->slot same idx", r.matches.every((m) => m.rowIdx === m.slotIdx));
  t("normal order: no unmatched", r.unmatched.length === 0 && r.unusedSlots.length === 0);
  t("normal order: conf >= 0.9", r.matches.every((m) => m.confidence >= 0.9));
}

// 2. 乱序：rows 几何顺序与 slots 相反 → 按空间（非 index）匹配
{
  const slots = [
    { slotId: "s1", left: 100, top: 10, width: 200, height: 40, fontSize: 18, text: "姓名" },
    { slotId: "s2", left: 100, top: 60, width: 200, height: 40, fontSize: 24, text: "职位" },
    { slotId: "s3", left: 100, top: 110, width: 200, height: 40, fontSize: 14, text: "公司" }
  ];
  const rows = [
    { text: "公司", left: 101, top: 112, width: 200, height: 40, fontSize: 14 },   // 对应 s3
    { text: "职位", left: 100, top: 62, width: 190, height: 38, fontSize: 24 },    // 对应 s2
    { text: "姓名", left: 102, top: 11, width: 180, height: 36, fontSize: 18 }     // 对应 s1
  ];
  const r = matchSlots({ slots, rows });
  const byRow = {};
  r.matches.forEach((m) => { byRow[m.rowIdx] = m.slotIdx; });
  t("shuffled: still 3 matched", r.matches.length === 3);
  t("shuffled: row0(公司)->s3", byRow[0] === 2 && byRow[1] === 1 && byRow[2] === 0);
}

// 3. 左右两栏：跨栏误配被 spatial 拦截
{
  const slots = [
    { slotId: "left", left: 80, top: 10, width: 150, height: 40, fontSize: 16, text: "电话" },
    { slotId: "right", left: 380, top: 10, width: 150, height: 40, fontSize: 16, text: "微信" }
  ];
  const rows = [
    { text: "电话", left: 82, top: 12, width: 140, height: 36, fontSize: 16 },
    { text: "微信", left: 382, top: 12, width: 140, height: 36, fontSize: 16 }
  ];
  const r = matchSlots({ slots, rows });
  const byRow = {};
  r.matches.forEach((m) => { byRow[m.rowIdx] = m.slotIdx; });
  t("two columns: left->left, right->right", byRow[0] === 0 && byRow[1] === 1);
  t("two columns: both matched", r.matches.length === 2);
}

// 4. 短文本：row 短名与长文本槽空间近 → 仍匹配但不强制语义
{
  const slots = [
    { slotId: "s1", left: 100, top: 10, width: 200, height: 40, fontSize: 18, text: "张天天" },
    { slotId: "s2", left: 100, top: 60, width: 200, height: 40, fontSize: 24, text: "理财顾问" }
  ];
  const rows = [
    { text: "张", left: 103, top: 12, width: 60, height: 36, fontSize: 18 }
  ];
  const r = matchSlots({ slots, rows });
  t("short text: matched to nearest slot s1", r.matches.length === 1 && r.matches[0].slotIdx === 0 && r.matches[0].confidence >= 0.45);
}

// 5. 重复文本：两行同文本 → 各配最近槽，无双配
{
  const slots = [
    { slotId: "p1", left: 80, top: 10, width: 160, height: 36, fontSize: 15, text: "电话1" },
    { slotId: "p2", left: 300, top: 10, width: 160, height: 36, fontSize: 15, text: "电话2" }
  ];
  const rows = [
    { text: "13800138000", left: 82, top: 12, width: 150, height: 32, fontSize: 15 },
    { text: "13900139000", left: 302, top: 12, width: 150, height: 32, fontSize: 15 }
  ];
  const r = matchSlots({ slots, rows });
  t("dup text: both matched distinct slots", r.matches.length === 2 && unique(r.matches, (m) => m.slotIdx) && unique(r.matches, (m) => m.rowIdx));
}

// 6. 中英混合：英文行落到英文槽位（空间驱动）
{
  const slots = [
    { slotId: "cn", left: 100, top: 10, width: 200, height: 40, fontSize: 18, text: "公司名称" },
    { slotId: "en", left: 100, top: 60, width: 260, height: 36, fontSize: 16, text: "Company Name" }
  ];
  const rows = [
    { text: "Guangzhou Aikaqi", left: 102, top: 62, width: 240, height: 32, fontSize: 16 }
  ];
  const r = matchSlots({ slots, rows });
  t("mixed cjk/latin: english row -> en slot", r.matches.length === 1 && r.matches[0].slotIdx === 1 && r.matches[0].confidence >= 0.45);
}

// 7. 多电话：3 行 vs 2 槽 → 2 匹配 + 1 未匹配（不双配、不硬塞）
{
  const slots = [
    { slotId: "tel", left: 80, top: 10, width: 160, height: 36, fontSize: 15, text: "电话" },
    { slotId: "wechat", left: 300, top: 10, width: 160, height: 36, fontSize: 15, text: "微信" }
  ];
  const rows = [
    { text: "13800138000", left: 82, top: 12, width: 150, height: 32, fontSize: 15 },
    { text: "wechat_id_abc", left: 302, top: 12, width: 150, height: 32, fontSize: 15 },
    { text: "13900139000", left: 500, top: 200, width: 150, height: 32, fontSize: 15 } // 远区第三行
  ];
  const r = matchSlots({ slots, rows });
  t("multi-phone: 2 matched + 1 unmatched", r.matches.length === 2 && r.unmatched.length === 1);
  t("multi-phone: unmatched reason NO_SLOT", r.unmatched[0].reason === "NO_SLOT");
  t("multi-phone: distinct slots", unique(r.matches, (m) => m.slotIdx));
}

// 8. 空输入
{
  const r0 = matchSlots({ slots: [], rows: [{ text: "a", left: 1, top: 1, width: 1, height: 1 }] });
  t("empty slots -> all unmatched NO_SLOT", r0.matches.length === 0 && r0.unmatched.length === 1 && r0.unmatched[0].reason === "NO_SLOT");
  const r1 = matchSlots({ slots: [{ slotId: "s" }], rows: [] });
  t("empty rows -> all unused", r1.matches.length === 0 && r1.unusedSlots.length === 1);
}

const res = { pass: pass, fail: fail };
console.log("template-slot-matcher.test: pass=" + res.pass + " fail=" + res.fail);
process.exit(res.fail > 0 ? 1 : 0);