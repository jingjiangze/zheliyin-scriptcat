// tests/editor-object-model/object-model.test.js — Stage 5.0 §四十二：Object Model 纯数据单测（无浏览器）
"use strict";
const path = require("path");
const assert = require("assert");
const model = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "object-model.js"));
const fixture = require(path.join(__dirname, "..", "fixtures", "editor-object-textbox.json"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ---- parseEditorObject：textbox fixture → 模型（§二十五/§二十六 纯数据）----
const m = model.parseEditorObject(fixture.raw, "front", 4);
t("parse.kind=text", m.identity.kind === "text", m.identity.kind);
t("parse.isText", m.identity.isText === true);
t("parse.side/index", m.identity.side === "front" && m.identity.index === 4);
t("parse.markuuid", m.identity.markuuid === fixture.expect.markuuid);
t("parse.uuid", m.identity.uuid === "SESSION-UUID-0000");
t("parse.geometry", m.geometry.width === fixture.expect.width && m.geometry.left === 26.16865675953352 && m.geometry.scaleX === 1 && m.geometry.angle === 0);
t("parse.style", m.style.fontSize === 31 && m.style.fontFamily === "阿里普惠体Regular" && m.style.lineHeight === 1.16);
t("parse.content", m.content.textLen === fixture.expect.textLen && m.content.text === "[REDACTED_TEXT]");
t("parse.editor", m.editor.layerNum === 4 && m.editor.locationRotation === 0 && m.editor.mediaMediaType === "text");
t("parse.transform", m.transform.visible === true && m.transform.opacity === 1);
t("parse.interaction", m.interaction.selectable === true && m.interaction.evented === true);
t("parse.runtimeFlags", m.runtimeFlags.isDesign === true && m.runtimeFlags.isLineText === true && m.runtimeFlags.isDisplay === false);
t("parse.pure-data", model.assertPureData(m) === true);

// ---- 纯数据约束（§二十六）：模型可 JSON.stringify，不持有 raw 引用 ----
const json = JSON.parse(JSON.stringify(m));
t("pure.serializable", json.identity.kind === "text" && json.content.textLen === 15);

// ---- Object Kind 分类（§二十四 真实 6 类型）----
t("kind.textbox", model.zyObjectKind({ type: "textbox" }) === "text");
t("kind.image", model.zyObjectKind({ type: "image" }) === "image");
t("kind.path-graphic", model.zyObjectKind({ type: "path" }) === "graphic");
t("kind.rect-graphic", model.zyObjectKind({ type: "rect" }) === "graphic");
t("kind.group", model.zyObjectKind({ type: "group" }) === "group");
t("kind.line", model.zyObjectKind({ type: "line" }) === "line");
t("kind.unknown", model.zyObjectKind({ type: "zzz" }) === "unknown");

// ---- 归一（§九：值类型安全）----
t("num.invalid->null", model.zyNum("abc") === null && model.zyNum(undefined) === null);
t("num.valid", model.zyNum(3.14) === 3.14);
t("str.null", model.zyStr(null) === null);
t("bool.coerce", model.zyBool(1) === false && model.zyBool(true) === true);

// ---- 非文字对象（line 参考线，无业务字段）----
const line = model.parseEditorObject({ type: "line", left: 0, top: 0, width: 585, height: 0 }, "front", 13);
t("line.kind", line.identity.kind === "line");
t("line.no-content", line.content === null);
t("line.null-fields", line.style.fontSize === null && line.editor.layerNum === null);

console.log(results.join("\n"));
console.log("object-model: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }