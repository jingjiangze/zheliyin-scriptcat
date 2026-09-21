// tests/editor-object-model/native-layer-contract.test.js — Stage 10-C：Native Layer Contract 纯模块单测
// 覆盖 identityFields / layerRegistrationEvidence / productRegistrationEvidence /
//   verifyNativeLayer（四层证据 A-D）/ inventoryDeltaEvidence / nativeUnavailable / rollbackContract
"use strict";
const path = require("path");
const NLC = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "native-layer-contract.js"));
const { identityFields, layerRegistrationEvidence, productRegistrationEvidence, verifyNativeLayer, inventoryDeltaEvidence, nativeUnavailable, rollbackContract } = NLC;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }

// ================= identityFields =================
t("id-all", identityFields({ uuid: "u1", multiUuid: "m1", markuuid: "", layerNum: 7 }).ok === true);
t("id-uuid-only", identityFields({ uuid: "u1" }).ok === true);
t("id-multi-only", identityFields({ multiUuid: "m1" }).ok === true);
t("id-layer-only", identityFields({ layerNum: 9 }).ok === true);
t("id-none", identityFields({}).ok === false && identityFields({}).reason === "NO_IDENTITY_FIELD");
t("id-markuuid-empty-notcount", identityFields({ markuuid: "" }).ok === false);
t("id-null", identityFields(null) === null);
t("id-layer-0", identityFields({ layerNum: 0 }).ok === true, "", identityFields({ layerNum: 0 }));

// ================= layerRegistrationEvidence =================
t("layer-canvas+array", layerRegistrationEvidence({ canvasObject: true, layerArrayHas: true }).ok === true);
t("layer-canvas+registryDelta", layerRegistrationEvidence({ canvasObject: true, layerArrayHas: false, registryDelta: 1 }).ok === true);
t("layer-canvas-only-mismatch", layerRegistrationEvidence({ canvasObject: true, layerArrayHas: false, registryDelta: 0 }).ok === false);
t("layer-canvas-only-mismatch-code", layerRegistrationEvidence({ canvasObject: true, layerArrayHas: false }).code === "CANVAS_WITHOUT_LAYER");
t("layer-no-canvas", layerRegistrationEvidence({ canvasObject: false, layerArrayHas: true }).ok === false);

// ================= productRegistrationEvidence =================
t("prod-serializer", productRegistrationEvidence({ serializerSees: true }).ok === true);
t("prod-json", productRegistrationEvidence({ productJsonSees: true }).ok === true);
t("prod-missing", productRegistrationEvidence({ serializerSees: false }).ok === false && productRegistrationEvidence({ serializerSees: false }).code === "PRODUCT_NOT_REGISTERED");
t("prod-unknown", productRegistrationEvidence({}).ok === false && productRegistrationEvidence({}).unknown === true);

// ================= verifyNativeLayer（四层汇总）================
const full = verifyNativeLayer({ canvasObject: true, layerArrayHas: true, uuid: "u", multiUuid: "m", layerNum: 3, serializerSees: true });
t("verify-full-ok", full.ok === true && full.code === "OK");
t("verify-full-checks", full.checks.layer.ok === true && full.checks.identity.ok === true && full.checks.product.ok === true);
const onlyCanvas = verifyNativeLayer({ canvasObject: true, layerArrayHas: false, registryDelta: 0, multiUuid: "m", layerNum: 3 });
t("verify-canvas-only-fail", onlyCanvas.ok === false && onlyCanvas.code === "CREATE_NATIVE_LAYER_FAILED");
t("verify-canvas-only-failed-list", (onlyCanvas.failed || []).join(",").indexOf("LAYER") >= 0);
const noIdentity = verifyNativeLayer({ canvasObject: true, layerArrayHas: true, serializerSees: true });
t("verify-no-identity-fail", noIdentity.ok === false && (noIdentity.failed || []).join(",").indexOf("IDENTITY") >= 0);
const prodMissing = verifyNativeLayer({ canvasObject: true, layerArrayHas: true, uuid: "u", layerNum: 1, serializerSees: false });
t("verify-prod-missing-fail", prodMissing.ok === false && prodMissing.code === "CREATE_NATIVE_LAYER_FAILED");
const prodUnknown = verifyNativeLayer({ canvasObject: true, layerArrayHas: true, uuid: "u", layerNum: 1 });
t("verify-prod-unknown-not-fail", prodUnknown.ok === true && prodUnknown.productUnknown === true);

// ================= inventoryDeltaEvidence =================
t("inv-plus1", inventoryDeltaEvidence({ beforeCount: 5, afterCount: 6, layerBeforeCount: 5, layerAfterCount: 6 }).ok === true);
t("inv-canvas-only", inventoryDeltaEvidence({ beforeCount: 5, afterCount: 6, layerBeforeCount: 5, layerAfterCount: 5 }).ok === false);
t("inv-unknown", inventoryDeltaEvidence({}).ok === null);

// ================= nativeUnavailable / rollbackContract =================
const na = nativeUnavailable("no-diy");
t("native-unavailable", na.ok === false && na.code === "CREATE_NATIVE_UNAVAILABLE" && na.mirrorFallbackForbidden === true);
const rc = rollbackContract({ createdObjects: [1, 2], detectedBlocks: 3 });
t("rollback-created-zero", rc.createdZero === true && rc.reply.createdCount === 0 && rc.reply.created.length === 0);
t("rollback-reply-code", rc.reply.code === "CREATE_NATIVE_LAYER_FAILED" && rc.reply.detectedBlocks === 3);

// ================= 汇总 =================
console.log("stage-10c native-layer-contract: " + results.filter((r) => r.indexOf("PASS") > 0).length + "/" + results.length + " PASS");
if (failures.length) { console.error("FAILURES:\n" + failures.join("\n")); process.exit(1); }
