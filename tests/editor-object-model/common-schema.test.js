// tests/editor-object-model/common-schema.test.js — Stage 7.8 §四/§五：Common OCR Result schema
// 覆盖：Baidu Provider 候选 id/sourceProvider/rawMeta/lineIndex/wordIndex；unifyCandidates 透传；
//       LOCAL 路径 aggregateLineCandidates 打标 LOCal；id 确定性。
"use strict";
const path = require("path");
const bp = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "baidu-provider.js"));
const cn = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "candidate-normalizer.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function mockHttp(routes) {
  return {
    request: async (method, url, opts) => {
      for (const r of routes) {
        if (r.method === method && url.indexOf(r.urlMatch) >= 0) {
          const txt = typeof r.responseText === "function" ? await r.responseText(opts) : r.responseText;
          return { status: r.status != null ? r.status : 200, responseText: txt };
        }
      }
      return { status: 500, responseText: JSON.stringify({ error: "no route", error_description: url }) };
    }
  };
}

(async () => {
  // ---- Baidu Provider 候选补齐 Common OCR Result ----
  const http = mockHttp([
    { method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "T1", expires_in: 2592000 }) },
    { method: "POST", urlMatch: "/rest/2.0/ocr/v1/general", responseText: JSON.stringify({ words_result_num: 2, words_result: [
      { words: "测试公司", location: { left: 10, top: 20, width: 100, height: 24 }, probability: 0.99 },
      { words: "13800138000", location: { left: 5, top: 60, width: 160, height: 20 } }
    ] }) }
  ]);
  const p = bp.createBaiduProvider({ getConfig: () => ({ apiKey: "AK", secretKey: "SK" }), http, storage: {}, now: () => 1000000 });
  const r = await p.recognize("data:image/png;base64,QUJD", { imageWidth: 800, imageHeight: 600 });
  const c0 = r.candidates[0];
  t("baidu.sourceProvider", c0.sourceProvider === "BAIDU", JSON.stringify(c0.sourceProvider));
  t("baidu.id-present", typeof c0.id === "string" && c0.id.length > 0, JSON.stringify(c0.id));
  t("baidu.lineIndex", c0.lineIndex === 0 && r.candidates[1].lineIndex === 1);
  t("baidu.wordIndex-default", c0.wordIndex === 0);
  t("baidu.rawMeta", c0.rawMeta && c0.rawMeta.words === "测试公司" && c0.rawMeta.location.left === 10 && c0.rawMeta.probability === 0.99, JSON.stringify(c0.rawMeta));
  t("baidu.id-deterministic", bp.candidateId("BAIDU", 0) === bp.candidateId("BAIDU", 0) && bp.candidateId("BAIDU", 0) !== bp.candidateId("BAIDU", 1));
  t("baidu.id-stable-across-calls", cn.candidateId("BAIDU", 0) === bp.candidateId("BAIDU", 0), cn.candidateId("BAIDU", 0) + " vs " + bp.candidateId("BAIDU", 0));

  // ---- unifyCandidates 透传（Baidu 已自带）----
  const unified = cn.unifyCandidates(r.candidates, { width: 800, height: 600 });
  t("unify.passthrough-sourceProvider", unified[0].sourceProvider === "BAIDU");
  t("unify.passthrough-id", unified[0].id === c0.id);
  t("unify.passthrough-rawMeta", unified[0].rawMeta && unified[0].rawMeta.words === "测试公司");
  t("unify.passthrough-lineIndex", unified[0].lineIndex === 0);

  // ---- unifyCandidates opts.sourceProvider（LOCAL 兜底路径打标）----
  const localFallback = cn.unifyCandidates([{ text: "张三", bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } }], { width: 100, height: 80 }, { sourceProvider: "LOCAL" });
  t("unify.opts-sourceProvider", localFallback[0].sourceProvider === "LOCAL", JSON.stringify(localFallback[0].sourceProvider));
  t("unify.opts-id", typeof localFallback[0].id === "string" && localFallback[0].id.length > 0 && localFallback[0].id === cn.candidateId("LOCAL", 0), JSON.stringify(localFallback[0].id));
  t("unify.legacy-no-opts", cn.unifyCandidates([{ text: "旧", bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }]).length === 1);

  // ---- aggregateLineCandidates（LOCAL word 级聚类）打标 ----
  const words = [
    { text: "销", bbox: { x0: 0, y0: 0, x1: 20, y1: 20 } },
    { text: "售", bbox: { x0: 20, y0: 0, x1: 40, y1: 20 } }
  ];
  const agg = cn.aggregateLineCandidates(words, { width: 200, height: 100 }, [{ text: "销售", bbox: { x0: 0, y0: 0, x1: 40, y1: 20 } }]);
  t("local.tag", agg.length === 1 && agg[0].sourceProvider === "LOCAL" && agg[0].text === "销售", JSON.stringify(agg));
  t("local.id", typeof agg[0].id === "string" && agg[0].id === cn.candidateId("LOCAL", 0));
  t("local.lineIndex", agg[0].lineIndex === 0);

  console.log(results.join("\n"));
  failures.forEach((f) => console.log("  > " + f));
  console.log("common-schema: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error("test runner error", e); process.exit(1); });