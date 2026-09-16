// tests/editor-object-model/object-matcher.test.js — Stage 5.2 §二十六：Object Matcher 单测（无浏览器）
"use strict";
const path = require("path");
const matcher = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "object-matcher.js"));
const fixture = require(path.join(__dirname, "..", "fixtures", "editor-objects-52.json"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }
const objs = fixture.objects;
const CW = fixture.canvas.width, CH = fixture.canvas.height;

// 工具：用对象 visualBounds 生成 candidate（文本语义脱敏用 "公司 示例公司" 匹配 company/name）
function candFor(o, overrides) { return Object.assign({ text: "[CANDIDATE_TEXT]", bbox: { x: o.visualBounds.left, y: o.visualBounds.top, width: o.visualBounds.width, height: o.visualBounds.height }, confidence: 0.95, source: "manual" }, overrides || {}); }

// ---- exact match（§二十九：candidate.bbox = object.visualBounds → same object）----
const rExact = matcher.match(candFor(objs[0]), objs, { canvasWidth: CW, canvasHeight: CH });
t("exact.matched", rExact.status === "MATCHED", JSON.stringify(rExact));
t("exact.selected-index", rExact.selected && rExact.selected.index === 4, "index=" + (rExact.selected && rExact.selected.index));
t("exact.persisted", rExact.selected && rExact.selected.persistedId === "AD4636D5227B49399987EA16FC0FF3EA");

// ---- bbox overlap（小偏移仍命中同对象；score 应略降）----
const rShift = matcher.match(candFor(objs[2], { bbox: { x: 30, y: 200, width: 100, height: 20 } }), objs, { canvasWidth: CW, canvasHeight: CH });
t("overlap.matched", rShift.status === "MATCHED" && rShift.selected.index === 8, JSON.stringify(rShift));

// ---- 故意大幅偏移 → NOT_FOUND（§十四 禁止强制匹配）----
const rFar = matcher.match({ text: "[CANDIDATE_TEXT]", bbox: { x: 500, y: 20, width: 60, height: 20 }, confidence: 0.9, source: "manual" }, objs, { canvasWidth: CW, canvasHeight: CH });
t("far.not-found", rFar.status === "NOT_FOUND", JSON.stringify(rFar));

// ---- AMBIGUOUS：两个空间接近的 textbox（top 差 4px）被同一候选覆盖 → 双候选分接近 → AMBIGUOUS（§三十 不得 pickObject[0]）----
const nearA = { identity: { index: 20, side: "front", kind: "text", isText: true, subType: "text", runtimeId: "near-a", persistedId: null, identityKind: "persisted-candidate", type: "textbox" }, geometry: { left: 100, top: 100, width: 80, height: 18, scaleX: 1, scaleY: 1, angle: 0 }, visualBounds: { left: 100, top: 100, width: 80, height: 18 }, content: { text: "[REDACTED:A]", textLen: 1 } };
const nearB = { identity: { index: 21, side: "front", kind: "text", isText: true, subType: "text", runtimeId: "near-b", persistedId: null, identityKind: "persisted-candidate", type: "textbox" }, geometry: { left: 100, top: 104, width: 84, height: 18, scaleX: 1, scaleY: 1, angle: 0 }, visualBounds: { left: 100, top: 104, width: 84, height: 18 }, content: { text: "[REDACTED:B]", textLen: 1 } };
const rAmbi = matcher.match({ text: "[CANDIDATE_TEXT]", bbox: { x: 95, y: 98, width: 95, height: 30 }, confidence: 0.9, source: "manual" }, [nearA, nearB], { canvasWidth: CW, canvasHeight: CH });
t("ambiguous.protected", rAmbi.status === "AMBIGUOUS", "status=" + rAmbi.status + " top/second=" + [rAmbi.topScore, rAmbi.secondScore].join("/") + " " + JSON.stringify(rAmbi).slice(0, 260));

// ---- rotated visualBounds（§十七：geometry angle≠0 → aabbFromGeometry 展开；45°: AABB=(w+h)/√2 正方形）----
const rotatedObj = { identity: { index: 99, side: "front", kind: "text", isText: true, subType: "text", runtimeId: "r-rot", persistedId: null, identityKind: "persisted-candidate", type: "textbox" }, geometry: { left: 300, top: 150, width: 100, height: 20, scaleX: 1, scaleY: 1, angle: 45 } };
const aabbRot = matcher.aabbFromGeometry(rotatedObj.geometry);
const expectSide = (100 + 20) / Math.SQRT2;
t("aabb.rotated-expanded", Math.abs(aabbRot.width - expectSide) < 1e-6 && Math.abs(aabbRot.height - expectSide) < 1e-6 && Math.abs(aabbRot.left - (350 - expectSide / 2)) < 1e-6 && Math.abs(aabbRot.top - (160 - expectSide / 2)) < 1e-6, JSON.stringify(aabbRot));
const rRot = matcher.match({ text: "[CANDIDATE_TEXT]", bbox: { x: aabbRot.left, y: aabbRot.top, width: aabbRot.width, height: aabbRot.height }, confidence: 0.9, source: "manual" }, [rotatedObj], { canvasWidth: CW, canvasHeight: CH });
t("rotated.matched", rRot.status === "MATCHED" && rRot.selected.index === 99, JSON.stringify(rRot));

// ---- missing identity：无 persistedId 仍可匹配（identityKind 如实）----
t("missing-identity.reasons", rRot.reasons.indexOf("identity-available") < 0, "no identity-available reason");

// ---- line/group 排除（§二十/§二十一）----
const withLine = objs.concat([{ identity: { index: 13, kind: "line", isText: false, type: "line" }, geometry: { left: 0, top: 0, width: 500, height: 0 } }]);
const poolSize = matcher.candidateObjects(withLine).length;
t("line.excluded", poolSize === objs.length, "pool=" + poolSize);
const withGroupChild = objs.concat([{ identity: { index: 200, kind: "text", isText: true, type: "textbox" }, groupChild: true, geometry: { left: 0, top: 0, width: 10, height: 10 } }]);
t("group-child.excluded", matcher.candidateObjects(withGroupChild).length === objs.length, "pool=" + matcher.candidateObjects(withGroupChild).length);

// ---- invalid candidate → ERROR（§五十四 不 throw）----
const rBad = matcher.match({ text: "x", bbox: null }, objs, { canvasWidth: CW, canvasHeight: CH });
t("error.invalid-candidate", rBad.status === "ERROR" && rBad.errorCode === "INVALID_CANDIDATE");

// ---- 归一化坐标（§十九）----
const n = matcher.normalizeRect({ x: 100, y: 50, width: 200, height: 100 }, 619.5, 376.86);
const d = matcher.denormalizeRect(n, 619.5, 376.86);
t("normalize.0-1", Math.abs(n.x - 100 / 619.5) < 1e-6 && Math.abs(n.height - 100 / 376.86) < 1e-6);
t("denormalize.roundtrip", Math.abs(d.x - 100) < 1e-3 && Math.abs(d.height - 100) < 1e-3);

// ---- textKind 语义（字段分类一致性，§十六）----
t("textkind.phone", matcher.textKind("13800138000") === "phone");
t("textkind.wechat", matcher.textKind("微信：abc") === "wechat");
t("textkind.email", matcher.textKind("a@b.com") === "email");
t("textkind.address", matcher.textKind("深圳市南山区深南大道1号") === "address");
t("textkind.company", matcher.textKind("华创科技有限公司") === "company");
t("textkind.name", matcher.textKind("张三") === "name");
t("textkind.unknown", matcher.textKind("[[placeholder]]") === "unknown");

console.log(results.join("\n"));
console.log("object-matcher: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }