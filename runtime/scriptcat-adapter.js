// runtime/scriptcat-adapter.js — RUNTIME-8.2 ScriptCat 安装适配器
// 仅封装已从源码确认的接口（§26）：
//   - installByCode: serviceWorker/script/installByCode {uuid, code, upsertBy}
//   - install:       serviceWorker/script/install {script, code, upsertBy}（无需 meta 解析时）
//   - getAllScripts: serviceWorker/script/getAllScripts
// 信封（源码证据 chunk.js:25735）: chrome.runtime.sendMessage({action: "serviceWorker/script/<method>", data: <payload>})
// 响应: {data: <result>}；s.code 存在则抛错。
"use strict";

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const BASE = "serviceWorker/script";

async function call(page, method, data) {
  const r = await page.evaluate(async ({ base, m, d }) => {
    const res = await chrome.runtime.sendMessage({ action: base + "/" + m, data: d });
    if (res && res.code) throw new Error("scriptcat error: " + res.message || res.code);
    return res && res.data;
  }, { base: BASE, m: method, d: data });
  return r;
}

async function openOptions(page, hash = "#/script/list") {
  await page.goto("chrome-extension://" + EXT_ID + "/src/options.html" + hash, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(2500);
}

// 安装（code 已含完整 userscript 头）——uuid 由调用方生成
async function installByCode(page, { uuid, code, upsertBy = "user" }) {
  await openOptions(page, "#/script/editor");
  return call(page, "installByCode", { uuid, code, upsertBy });
}

async function getAllScripts(page) {
  await openOptions(page, "#/script/list");
  return call(page, "getAllScripts", {});
}

async function isInstalled(page, name) {
  const all = await getAllScripts(page) || [];
  return all.find((s) => s && (s.name === name || (s.metadata && s.metadata.name === name))) || null;
}

async function removeScript(page, uuid) {
  // deletes 契约（源码: deletes(e){return this.do("deletes", e)}，e 为 uuid 数组）
  await openOptions(page, "#/script/list");
  return call(page, "deletes", [uuid]);
}

module.exports = { EXT_ID, installByCode, getAllScripts, isInstalled, removeScript, call };