// 46q runner 增强采样（定位 P1 回归）：apply 失败时记录状态样本 + 版布局诊断
"use strict";
const fs = require("fs");
const F = "D:\\zheliyin-scriptcat\\runtime\\stage9\\commit-46q-front-back-real.js";
const raw = fs.readFileSync(F, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let src = crlf ? raw.split("\r\n").join("\n") : raw;
function must(oldStr, newStr, label) {
  const i = src.indexOf(oldStr);
  if (i < 0) throw new Error("ANCHOR MISS: " + label);
  if (src.indexOf(oldStr, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE: " + label);
  src = src.slice(0, i) + newStr + src.slice(i + oldStr.length);
  console.log("  ok " + label);
}

// 1) 记录读取到的版布局（before 快照）
must(`          const invB = await readAll();
          r1.before = { frontCount: (invB.frontItems || []).length, frontTexts: (invB.frontItems || []).map((it) => it.text), backCount: (invB.backItems || []).length, backTexts: (invB.backItems || []).map((it) => it.text), backExists: invB.backExists, invSideCounts: invB.invSideCounts || null };`,
`          const invB = await readAll();
          r1.before = { frontCount: (invB.frontItems || []).length, frontTexts: (invB.frontItems || []).map((it) => it.text), backCount: (invB.backItems || []).length, backTexts: (invB.backItems || []).map((it) => it.text), backExists: invB.backExists, invSideCounts: invB.invSideCounts || null };
          // P1 诊断：版布局（versionCount / current / conflicts）—— 定位单版场景下 versionCount 异常
          const mvInfoB = await bridgeCall("getMultiVersionInfo", {}, "getMultiVersionInfoResult", 10000).catch(() => null);
          r1.mvInfoBefore = mvInfoB ? { ok: mvInfoB.ok, code: mvInfoB.code, vc: mvInfoB.versionCount, tl: mvInfoB.totalLen, cur: mvInfoB.current, li: mvInfoB.dom && mvInfoB.dom.liCount, conflicts: mvInfoB.conflicts, hard: mvInfoB.hardConflicts } : null;`,
  "mvInfo before");

// 2) readAll 透出版维
must(`        if (r && r.front && Array.isArray(r.front.items)) {
          return {
            snapshotHash: r.snapshotHash, page: r.page,`,
`        if (r && r.front && Array.isArray(r.front.items)) {
          return {
            version: (typeof r.version === "number") ? r.version : null,
            versionCount: (typeof r.versionCount === "number") ? r.versionCount : null,
            multi: !!r.multi,
            current: r.current || null,
            snapshotHash: r.snapshotHash, page: r.page,`,
  "readAll version fields");

// 3) 记录本轮快照版维
must(`          if (typeof def.backEmptySlotIdx === "number" && (invB.backItems || [])[def.backEmptySlotIdx]) {`,
`          r1.snapVersion = { version: invB.version, versionCount: invB.versionCount, multi: invB.multi, current: invB.current };
          if (typeof def.backEmptySlotIdx === "number" && (invB.backItems || [])[def.backEmptySlotIdx]) {`,
  "snapVersion record");

// 4) apply 失败时记录状态样本 + confirm 前后版布局
must(`          r1.apply = { done: !!doneA.done, status: doneA.done ? doneA.st.slice(0, 300) : null };
          await SLEEP(1400);`,
`          r1.apply = { done: !!doneA.done, status: doneA.done ? doneA.st.slice(0, 300) : null, samples: doneA.done ? undefined : (doneA.samples || []).slice(-3) };
          const mvInfoA = await bridgeCall("getMultiVersionInfo", {}, "getMultiVersionInfoResult", 10000).catch(() => null);
          r1.mvInfoAfterConfirm = mvInfoA ? { ok: mvInfoA.ok, code: mvInfoA.code, vc: mvInfoA.versionCount, tl: mvInfoA.totalLen, cur: mvInfoA.current, conflicts: mvInfoA.conflicts, hard: mvInfoA.hardConflicts } : null;
          await SLEEP(1400);`,
  "apply samples + mvInfo after");

fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
console.log("46q sampling enhanced.");