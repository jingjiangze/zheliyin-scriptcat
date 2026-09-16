// tests/editor-object-model/image-mapper.test.js — Stage 5.3 §十五/§十六/§十七：Image Coordinate Mapper 单测（无浏览器）
"use strict";
const path = require("path");
const im = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "image-mapper.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }
function close(a, b) { return Math.abs(a - b) < 1e-6; }

// 基准 image：scale=1 angle=0（真实背景图形态）
const img = { left: 26, top: 40, width: 200, height: 100, scaleX: 1, scaleY: 1, angle: 0 };

// §十七 scale=1 且非整幅：局部矩形 → 简单 offset 等价（验证正确基准）
const r1 = im.imageLocalRectToCanvas(img, { x: 50, y: 25, width: 40, height: 20 });
t("scale1.offset", close(r1.left, 26 + 50) && close(r1.top, 40 + 25) && close(r1.width, 40) && close(r1.height, 20), JSON.stringify(r1));

// scale = 0.5（缩小显示）：局部 40px → 画布 20px
const r2 = im.imageLocalRectToCanvas(Object.assign({}, img, { scaleX: 0.5, scaleY: 0.5 }), { x: 50, y: 25, width: 40, height: 20 });
t("scale0_5", close(r2.width, 20) && close(r2.height, 10) && close(r2.left, 26 + 25) && close(r2.top, 40 + 12.5), JSON.stringify(r2));

// scale = 2（放大）：局部 40px → 画布 80px
const r3 = im.imageLocalRectToCanvas(Object.assign({}, img, { scaleX: 2, scaleY: 2 }), { x: 50, y: 25, width: 40, height: 20 });
t("scale2", close(r3.width, 80) && close(r3.height, 40), JSON.stringify(r3));

// 整幅映射（scale=1）：canvas 矩形 == 对象 bbox
const rFull = im.imageLocalRectToCanvas(img, { x: 0, y: 0, width: 200, height: 100 });
t("full.map", close(rFull.left, 26) && close(rFull.top, 40) && close(rFull.width, 200) && close(rFull.height, 100), JSON.stringify(rFull));

// angle = 45°，中心矩形 → AABB 计算（中心不变）
const rRot = im.imageLocalRectToCanvas(Object.assign({}, img, { angle: 45 }), { x: 0, y: 0, width: 200, height: 100 });
t("rot45.center", close(rRot.centerX, 26 + 100) && close(rRot.centerY, 40 + 50), "cx/cy=" + rRot.centerX + "/" + rRot.centerY);
t("rot45.aabb", close(rRot.width, (200 + 100) / Math.SQRT2) && close(rRot.height, (200 + 100) / Math.SQRT2), "aabb=" + rRot.width + "x" + rRot.height);

// 归一化 0..1 往返（fixture 坐标接入，§十九）
const n = im.imageLocalNormalized(img, { x: 0.25, y: 0.5, width: 0.2, height: 0.1 });
t("norm01", close(n.x, 50) && close(n.y, 50) && close(n.width, 40) && close(n.height, 10), JSON.stringify(n));

// 无效输入 → null
t("invalid.null", im.imageLocalRectToCanvas({}, { x: 0, y: 0, width: 10, height: 10 }) === null);

console.log(results.join("\n"));
console.log("image-mapper: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }