// runtime/stage-7-8/summarize-real.js — Stage 7.8R 真机报告聚合（读 runtime/reports/stage-7-8r/real-calibration-*.json）
"use strict";
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "reports", "stage-7-8r");

const files = fs.readdirSync(DIR).filter((f) => /^real-calibration-.*\.json$/.test(f)).map((f) => path.join(DIR, f));
const rounds = [];
const runs = [];
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  runs.push({ file: path.basename(f), ts: r.ts, ready: r.ready, baiduKeySet: r.baiduKeySet, baiduInject: r.baiduInject, bridge: r.bridge && r.bridge.pageId });
  (r.rounds || []).forEach((x) => {
    const q6 = x.quality6 || (() => { const m = JSON.stringify(x.console || []).match(/"quality6":\{[^}]+\}/); return m ? m[0] : null; })();
    rounds.push({
      caseId: x.caseId, provider: x.provider, modeSwitch: (x.modeSwitch && x.modeSwitch.val) || null,
      status: (x.finalStatus || "").slice(0, 40), createdDelta: x.createdDelta, texts: (x.createdTexts || []).slice(0, 6),
      display: (x.display || []).slice(0, 6), owned: !!(x.assert && x.assert.pageOwned), p0: !!(x.assert && x.assert.p0IsDisplaySafe),
      q6: q6, baiduLines: (() => { const m = JSON.stringify(x.console || []).match(/BAIDU_RECOGNIZING\] lines=(\d+)/); return m ? Number(m[1]) : null; })(),
      localLines: (() => { const m = JSON.stringify(x.console || []).match(/LOCAL_RECOGNIZING\] lines=(\d+)/); return m ? Number(m[1]) : null; })()
    });
  });
}
const byId = {};
rounds.forEach((x) => { byId[x.caseId] = x; });
const summary = {
  generatedAt: new Date().toISOString(), runCount: runs.length, runFiles: runs,
  rounds: rounds,
  result: {
    baiduRounds: rounds.filter((x) => x.provider === "baidu").length,
    localRounds: rounds.filter((x) => x.provider === "local").length,
    createdOk: rounds.filter((x) => x.createdDelta > 0 && x.owned).length,
    allOwned: rounds.every((x) => x.owned),
    allP0IsDisplaySafe: rounds.every((x) => x.p0),
    mixedSizeSplit: { G: byId["fixG"] && byId["fixG"].createdDelta === 2 && byId["fixG"].texts && byId["fixG"].texts.length === 2, H: byId["fixH"] && byId["fixH"].createdDelta === 2 },
    localFallbackPath: byId["localA"] && byId["localA"].provider === "local",
    dualPage: { FRONT: byId["dualFRONT"] && byId["dualFRONT"].owned, BACK: byId["dualBACK"] && byId["dualBACK"].owned }
  }
};
const outPath = path.join(DIR, "summary.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.result, null, 2));
console.log("-> " + outPath);