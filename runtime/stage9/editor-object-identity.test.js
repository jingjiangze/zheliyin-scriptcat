// runtime/stage9/editor-object-identity.test.js — OCR-P1 Commit 4.2（任务书 §五 四类测试）
const path = require("path");
const assert = require("assert");
const ID = require(path.join(__dirname, "..", "..", "runtime", "editor-object-identity.js"));

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass += 1; } catch (e) { fail += 1; console.error("FAIL " + name + ": " + String(e && e.message || e)); } }

// 1. 同一 Native textbox 前后 snapshot identity 不变
t("same textbox snapshot identity stable", () => {
  const before = { uuid: "abc-123", multiUuid: "m-1", text: "夏祝莲", _snapshot: 1 };
  const after = { uuid: "abc-123", multiUuid: "m-1", text: "夏祝莲", _snapshot: 2, dirty: true };
  assert.strictEqual(ID.sameIdentity(before, after), true);
  assert.deepStrictEqual(ID.snapshotIdentity(after).strong, { uuid: "abc-123", multiUuid: "m-1" });
});
// 2. refresh 前后 identity mapping 可验证
t("refresh mapping verifiable via multiUuid fallback", () => {
  const pre = { multiUuid: "guid-99", uuid: null };
  const post = { multiUuid: "guid-99", uuid: null };
  assert.strictEqual(ID.sameIdentity(pre, post), true);
  const other = { multiUuid: "guid-100", uuid: null };
  assert.strictEqual(ID.sameIdentity(pre, other), false);
});
// 3. 同一 block 不产生多个 object identity
t("single identity per block", () => {
  const objs = [
    { zyOcrObjectId: { transactionId: "tx1", pageId: "p1", blockId: 0 }, uuid: "u1" },
    { zyOcrObjectId: { transactionId: "tx1", pageId: "p1", blockId: 1 }, uuid: "u2" }
  ];
  const r = ID.assertSingleIdentityPerBlock(objs);
  assert.strictEqual(r.ok, true);
});
t("duplicate identity per block flagged", () => {
  const objs = [
    { zyOcrObjectId: { transactionId: "tx1", pageId: "p1", blockId: 2 }, uuid: "u1" },
    { zyOcrObjectId: { transactionId: "tx1", pageId: "p1", blockId: 2 }, uuid: "u2" }
  ];
  const r = ID.assertSingleIdentityPerBlock(objs);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.violations.length, 1);
});
// 4. anchor 失败时不得伪造 identity
t("never fabricate identity on anchor fail", () => {
  const phantom = { left: 10, top: 20, text: "x" }; // 无 uuid/multiUuid 也无 zyOcrObjectId
  const r = ID.neverFabricateIdentity(phantom);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "NO_IDENTITY");
});
t("weak identity ok reported as weak", () => {
  const o = { zyOcrKey: "zy-ocr-tx1-0", left: 1, top: 2 };
  const r = ID.neverFabricateIdentity(o);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, "weak");
});
t("different uuid same block different identity", () => {
  const a = { uuid: "u1" }, b = { uuid: "u2" };
  assert.strictEqual(ID.sameIdentity(a, b), false);
});
t("null objects rejected", () => {
  assert.strictEqual(ID.sameIdentity(null, { uuid: "u1" }), false);
  assert.strictEqual(ID.snapshotIdentity(null).ok, false);
});

console.log("editor-object-identity.test: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
