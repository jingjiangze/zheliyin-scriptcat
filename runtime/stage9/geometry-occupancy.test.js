// runtime/stage9/geometry-occupancy.test.js — OCR-P1 Commit 4.3（§十一/§十二）
const path = require("path");
const assert = require("assert");
const OC = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "geometry-occupancy.js"));

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass += 1; } catch (e) { fail += 1; console.error("FAIL " + name + ": " + String(e && e.message || e)); } }

t("occupy first then overlap reject", () => {
  const mgr = OC.createOccupancy({ pageId: "p1", side: "front" });
  const a = mgr.occupy({ pageId: "p1", side: "front", bbox: { x: 0, y: 0, width: 100, height: 40 } });
  assert.strictEqual(a.accepted, true);
  const b = mgr.occupy({ pageId: "p1", side: "front", bbox: { x: 10, y: 5, width: 90, height: 30 } });
  assert.strictEqual(b.accepted, false);
  assert.strictEqual(b.rejectionReason, "OVERLAP_OCCUPIED");
});
t("non-overlap occupied accepted", () => {
  const mgr = OC.createOccupancy({ pageId: "p1", side: "front" });
  mgr.occupy({ pageId: "p1", side: "front", bbox: { x: 0, y: 0, width: 50, height: 20 } });
  const b = mgr.occupy({ pageId: "p1", side: "front", bbox: { x: 100, y: 100, width: 50, height: 20 } });
  assert.strictEqual(b.accepted, true);
});
t("scope mismatch front/back rejected", () => {
  const mgr = OC.createOccupancy({ pageId: "p1", side: "front", imageFingerprint: "img-a" });
  const b = mgr.occupy({ pageId: "p1", side: "back", imageFingerprint: "img-a", bbox: { x: 0, y: 0, width: 10, height: 10 } });
  assert.strictEqual(b.rejected, true);
  assert.strictEqual(b.rejectionReason, "SCOPE_MISMATCH");
});
t("scope mismatch different fingerprint rejected", () => {
  const mgr = OC.createOccupancy({ pageId: "p1", side: "front", imageFingerprint: "img-a" });
  const b = mgr.occupy({ pageId: "p1", side: "front", imageFingerprint: "img-b", bbox: { x: 0, y: 0, width: 10, height: 10 } });
  assert.strictEqual(b.rejected, true);
});
t("invalid geometry rejected", () => {
  const mgr = OC.createOccupancy({ pageId: "p1", side: "front" });
  const b = mgr.occupy({ pageId: "p1", side: "front", bbox: { x: 0, y: 0, width: 0, height: 10 } });
  assert.strictEqual(b.rejectionReason, "GEOMETRY_INVALID");
});
t("tryOccupy standalone checked not registered", () => {
  const occ = [{ bbox: { x: 0, y: 0, width: 100, height: 40 } }];
  assert.strictEqual(OC.tryOccupy(occ, { bbox: { x: 10, y: 10, width: 5, height: 5 } }).accepted, false);
  assert.strictEqual(OC.tryOccupy(occ, { bbox: { x: 200, y: 200, width: 5, height: 5 } }).accepted, true);
});
t("x0y0x1y1 bbox tolerated", () => {
  const mgr = OC.createOccupancy({ pageId: "p1", side: "front" });
  const b = mgr.occupy({ pageId: "p1", side: "front", bbox: { x0: 0, y0: 0, x1: 12, y1: 8 } });
  assert.strictEqual(b.accepted, true);
});
console.log("geometry-occupancy.test: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
