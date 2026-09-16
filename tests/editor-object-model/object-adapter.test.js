// tests/editor-object-model/object-adapter.test.js — Stage 5.0 §四十二：Object Adapter 单测（无浏览器）
"use strict";
const path = require("path");
const adapter = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "object-adapter.js"));
const fixture = require(path.join(__dirname, "..", "fixtures", "editor-object-textbox.json"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// ---- isTextObject（§二十七，判据与 page-bridge 一致）----
t("isText.textbox", adapter.zyIsTextObject({ type: "textbox" }) === true);
t("isText.text-string", adapter.zyIsTextObject({ type: "zzz", text: "hi" }) === true);
t("isText.mediaText", adapter.zyIsTextObject({ type: "zzz", mediaMediaType: "text" }) === true);
t("isText.rect-false", adapter.zyIsTextObject({ type: "rect" }) === false);
t("isText.null", adapter.zyIsTextObject(null) === false);

// ---- readObject: fixture → model ----
const m = adapter.zyReadObject(fixture.raw, "front", 0);
t("read.model", m && m.identity.kind === "text" && m.content.textLen === 15);

// ---- getIdentity / getGeometry / getStyle（只读子集）----
const idn = adapter.zyGetIdentity(fixture.raw);
t("identity.subset", idn.markuuid === fixture.expect.markuuid && idn.uuid === "SESSION-UUID-0000" && idn.type === "textbox");
const geo = adapter.zyGetGeometry(fixture.raw);
t("geometry.subset", geo.width === 95.27115 && geo.left === 26.16865675953352 && geo.angle === 0);
const sty = adapter.zyGetStyle(fixture.raw);
t("style.subset", sty.fontSize === 31 && sty.fontFamily === "阿里普惠体Regular");

// ---- zyGetVisualBounds（§5.1：fabric AABB 优先，effective fallback）----
const withRect = { left: 10, top: 20, width: 100, height: 50, scaleX: 2, scaleY: 1, angle: 45, getBoundingRect: function () { return { left: 5, top: 9, width: 200, height: 300 }; } };
const vb = adapter.zyGetVisualBounds(withRect);
t("visualBounds.getBoundingRect", vb.source === "getBoundingRect" && vb.width === 200 && vb.height === 300 && vb.left === 5);
const fallback = adapter.zyGetVisualBounds({ left: 10, top: 20, width: 100, height: 50, scaleX: 2, scaleY: 0.5 });
t("visualBounds.fallback", fallback.source === "effective-fallback" && fallback.width === 200 && fallback.height === 25);

// ---- writeText（最小 text mutation，§二十七/§二十八；mock raw 记录调用）----
const calls = [];
const mockRaw = {
  text: "[REDACTED_TEXT]",
  dirty: false,
  setText: function (v) { this.text = v; calls.push(["setText", v]); },
  initDimensions: function () { calls.push(["initDimensions"]); },
  setCoords: function () { calls.push(["setCoords"]); }
};
const wrote = adapter.zyWriteText(mockRaw, "NEW_VALUE");
t("write.returns-true", wrote === true);
t("write.text", mockRaw.text === "NEW_VALUE");
t("write.dirty", mockRaw.dirty === true);
t("write.inits", calls.some((c) => c[0] === "initDimensions") && calls.some((c) => c[0] === "setCoords"));
t("write.null-guard", adapter.zyWriteText(mockRaw, null) === false && mockRaw.text === "NEW_VALUE");

// ---- writeText 不触碰其它属性（§三十四：只改预期字段）----
const mockFull = { text: "A", other: { nested: 1 }, left: 10, fontSize: 20 };
adapter.zyWriteText(mockFull, "LONG_VALUE_MUTATION");
t("write.side-effect-free", mockFull.left === 10 && mockFull.fontSize === 20 && JSON.stringify(mockFull.other) === '{"nested":1}');

console.log(results.join("\n"));
console.log("object-adapter: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }