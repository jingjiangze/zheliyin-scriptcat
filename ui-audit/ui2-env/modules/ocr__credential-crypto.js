// =====================================================================
// 折立印名片套版助手 - 百度凭据加密存储（用户要求：百度 api 需要加密）
// ---------------------------------------------------------------------
// 实现：AES-256-GCM 加密落库（WebCrypto）。
//   - KEK：crypto.getRandomValues 32B → base64 存 storage("zyBaiduCryptoKek")（每次加密/解密使用）
//   - 密文格式：v1:<iv(base64)>.<ciphertext(base64)>
//   - 每次加密生成新随机 IV；提供 isCiphertext 供迁移判断
// 诚实边界（P4-J/§21）：本方案保证明文不出现在 GM 存储/日志/DOM/Git；
//   但 KEK 与密文同存于本机，能读取本机扩展存储的攻击者仍可解密 → 属"客户端可访问凭据"，
//   不能声称绝对安全；更高级保护（用户口令派生 KEK）留作后续项。
// 纯函数：crypto/storage 均可注入（Node 单测与浏览器同源）。
// =====================================================================
"use strict";

function b64encode(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}
function b64decode(str) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(str, "base64"));
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
function isCiphertext(v) { return typeof v === "string" && v.indexOf("v1:") === 0; }
function getKek(cryptoObj, storage) {
  const existing = storage.get("zyBaiduCryptoKek");
  if (existing && typeof existing === "string" && existing.length >= 20) return b64decode(existing);
  const raw = cryptoObj.getRandomValues(new Uint8Array(32));
  storage.set("zyBaiduCryptoKek", b64encode(raw));
  return raw;
}
async function deriveKey(cryptoObj, kekBytes) {
  const key = await cryptoObj.subtle.importKey("raw", kekBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return key;
}
// 加密：发方知道明文 → 返回 v1:<iv>.<ct>
async function encryptSecret(cryptoObj, storage, plain) {
  if (!plain) return "";
  const kek = getKek(cryptoObj, storage);
  const key = await deriveKey(cryptoObj, kek);
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const ct = await cryptoObj.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(String(plain)));
  return "v1:" + b64encode(iv) + "." + b64encode(new Uint8Array(ct));
}
// 解密：非法/损坏/密钥不匹配 → null（调用方视为未配置，不得抛错把密文带进日志）
async function decryptSecret(cryptoObj, storage, cipher) {
  if (!isCiphertext(cipher)) return null;
  try {
    const [ivb64, ctb64] = cipher.slice(3).split(".");
    if (!ivb64 || !ctb64) return null;
    const kek = getKek(cryptoObj, storage);
    const key = await deriveKey(cryptoObj, kek);
    const pt = await cryptoObj.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(ivb64) },
      key,
      b64decode(ctb64)
    );
    return new TextDecoder().decode(pt);
  } catch (e) {
    return null; // 密文损坏/密钥变更 → 静默 null
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = { encryptSecret, decryptSecret, isCiphertext };