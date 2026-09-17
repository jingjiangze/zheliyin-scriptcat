// =====================================================================
// 折立印名片套版助手 - Config 核心纯函数模块（Stage 2）
// ---------------------------------------------------------------------
// 单一事实来源（与 field-core 同模式，三形态共享：userscript @require /
// 扩展 manifest 按序加载 / exe 内嵌 extension/ 目录）。
// 职责：只做「存储快照 → 规范化配置 → 迁移判定 → 回写快照」的纯逻辑。
// 本文件禁止 DOM / GM_* / AI / 页面对象；存储读写由调用方（userscript 的
// getConfig/saveConfig）通过 GM_* 完成，测试可注入任意 storage 快照。
// 兼容策略：历史 key `zyBaseUrl` 保留为只读兼容来源；读取优先级
// zyArkBaseUrl > zyBaseUrl > DEFAULT；回写时两个 key 同步，避免再次漂移。
// =====================================================================
"use strict";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL = "doubao-seed-2-0-mini-260428";

function emptyConfig() {
  return { apiKey: "", baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL };
}

// storage 形如：{ zyArkApiKey, zyArkBaseUrl, zyBaseUrl, zyArkModel }（GM key 直读）
// 返回：{ apiKey, baseUrl, model, usedLegacy }
function resolveConfig(storage) {
  const s = storage || {};
  const arkBase = String(s.zyArkBaseUrl || "").trim();
  const legacyBase = String(s.zyBaseUrl || "").trim();
  const apiKey = String(s.zyArkApiKey || "").trim();
  const model = String(s.zyArkModel || "").trim();
  return {
    apiKey: apiKey,
    baseUrl: arkBase || legacyBase || DEFAULT_BASE_URL,
    model: model || DEFAULT_MODEL,
    usedLegacy: !arkBase && !!legacyBase
  };
}

// 配置 → 存储快照（baseUrl 双 key 同步，兼容旧读取方）
function configToStorage(config) {
  const c = config || {};
  const baseUrl = String(c.baseUrl || DEFAULT_BASE_URL);
  return {
    zyArkApiKey: String(c.apiKey || ""),
    zyArkBaseUrl: baseUrl,
    zyBaseUrl: baseUrl,
    zyArkModel: String(c.model || DEFAULT_MODEL)
  };
}