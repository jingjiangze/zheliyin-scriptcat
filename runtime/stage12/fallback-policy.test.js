// runtime/stage12/fallback-policy.test.js — Stage 12：主路由（无云端 → 本地直出）+ 本地辅助决策（云端空/不全 → 本地补齐）
"use strict";
const assert = require("assert");
const F = require("../../extension/src/ocr/fallback-policy.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}

// ---- T1 主路由：未输入云端 API Key → 本地直出（不发起注定失败的云端请求）----
t("T1 auto + 未配置云端 → local（local-no-cloud），绝不 cloud", () => {
  const r = F.decideOcrRoute({ mode: "auto", baiduEnabled: false });
  assert.strictEqual(r.action, "local");
  assert.strictEqual(r.route, "local-no-cloud");
  assert.strictEqual(r.engine, "local");
});
t("T2 auto + 已配置云端 → cloud（cloud-primary）", () => {
  const r = F.decideOcrRoute({ mode: "auto", baiduEnabled: true });
  assert.strictEqual(r.action, "cloud");
  assert.strictEqual(r.route, "cloud-primary");
});
t("T3 manual local → 本地；manual baidu + 未配置 → 仍本地（manual 优先于未配置判定）", () => {
  assert.strictEqual(F.decideOcrRoute({ mode: "local", baiduEnabled: false }).route, "manual-local");
  assert.strictEqual(F.decideOcrRoute({ mode: "baidu", baiduEnabled: true }).route, "manual-baidu");
});
t("T4 baiduEnabled 缺省 → 视同未配置 → 本地（防虚配）", () => {
  const r = F.decideOcrRoute({ mode: "auto" });
  assert.strictEqual(r.action, "local");
});

// ---- T2 本地辅助：云端未返回结果 → 本地几何全量接管 ----
t("T5 cloud 0 行（未返回结果）→ assist scope=all", () => {
  const r = F.decideLocalAssist({ mode: "auto", cloudRows: 0, cloudQualityOk: true, nativeTotal: 10, nativeUnmatched: 10 });
  assert.strictEqual(r.assist, true);
  assert.strictEqual(r.scope, "all");
  assert.strictEqual(r.reason, "cloud-empty");
  assert.strictEqual(r.cloudEmpty, true);
});
t("T6 cloud 质量门失败（有行但不过关）→ assist scope=all", () => {
  const r = F.decideLocalAssist({ mode: "auto", cloudRows: 5, cloudQualityOk: false, nativeTotal: 10, nativeUnmatched: 8 });
  assert.strictEqual(r.assist, true);
  assert.strictEqual(r.scope, "all");
  assert.strictEqual(r.reason, "cloud-quality-fail");
  assert.strictEqual(r.cloudQualityFail, true);
});

// ---- T3 本地辅助：云端结果不全 → 本地补位 ----
t("T7 cloud 有行但 Native 未全定位 → assist scope=unmatched（补位）", () => {
  const r = F.decideLocalAssist({ mode: "auto", cloudRows: 8, cloudQualityOk: true, nativeTotal: 10, nativeUnmatched: 2 });
  assert.strictEqual(r.assist, true);
  assert.strictEqual(r.scope, "unmatched");
  assert.strictEqual(r.reason, "native-unmatched");
  assert.strictEqual(r.nativeIncomplete, true);
});
t("T8 cloud 完整覆盖（native 全定位）→ assist=false 零开销", () => {
  const r = F.decideLocalAssist({ mode: "auto", cloudRows: 10, cloudQualityOk: true, nativeTotal: 10, nativeUnmatched: 0 });
  assert.strictEqual(r.assist, false);
  assert.strictEqual(r.scope, "none");
  assert.strictEqual(r.reason, "complete");
});
t("T9 manual 模式（local/baidu）→ 本地辅助不生效", () => {
  assert.strictEqual(F.decideLocalAssist({ mode: "local", cloudRows: 0 }).scope, "none");
  assert.strictEqual(F.decideLocalAssist({ mode: "baidu", cloudRows: 0 }).scope, "none");
});
t("T10 输入缺失稳健：native 数缺省按 0（无 native 信息 → 不触发 unmatched 补位）", () => {
  const r = F.decideLocalAssist({ mode: "auto", cloudRows: 6, cloudQualityOk: true });
  assert.strictEqual(r.assist, false);
  const r2 = F.decideLocalAssist({ mode: "auto", cloudRows: 0 });
  assert.strictEqual(r2.scope, "all");
});

// ---- T4 回归：原 decideFallback 语义不变 ----
t("T11 回归：auto + cloud 失败（empty-result）→ local（Cloud Primary → Local FALLBACK）", () => {
  const r = F.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "CLOUD_EMPTY", failReason: "empty-result" });
  assert.strictEqual(r.action, "local");
  assert.strictEqual(r.fallback, true);
});
t("T12 回归：manual local / manual baidu 任何失败 → stop（不换路）", () => {
  assert.strictEqual(F.decideFallback({ mode: "local", failReason: "empty-result" }).action, "stop");
  assert.strictEqual(F.decideFallback({ mode: "baidu", failReason: "empty-result" }).action, "stop");
});

console.log("fallback-policy.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);
