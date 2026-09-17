// tests/editor-object-model/credential-crypto.test.js — Stage 5.5B P4+：凭据加密存储单测（Node ≥19 crypto.subtle）
"use strict";
const path = require("path");
const cc = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "credential-crypto.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function memStorage() { const m = {}; return { get: (k) => m[k], set: (k, v) => { m[k] = v; }, raw: m }; }
// 注入与浏览器同源的 WebCrypto
async function scenario() {
  const cryptoObj = globalThis.crypto;
  const st = memStorage();

  // 1. 加密-解密往返，密文不含明文
  const cipher = await cc.encryptSecret(cryptoObj, st, "sTjToKxznvyyidHKtsga5692");
  t("encrypt.format", cc.isCiphertext(cipher) && /^v1:/.test(cipher), cipher);
  t("encrypt.no-plaintext", cipher.indexOf("sTjToKxznvyyidHKtsga5692") < 0, "cipher leaked plaintext");
  t("kek-stored", typeof st.raw.zyBaiduCryptoKek === "string" && st.raw.zyBaiduCryptoKek.length >= 20, st.raw.zyBaiduCryptoKek);
  const dec = await cc.decryptSecret(cryptoObj, st, cipher);
  t("roundtrip", dec === "sTjToKxznvyyidHKtsga5692", "dec=" + dec);

  // 2. 每次加密 IV 不同（密文不同）
  const c2 = await cc.encryptSecret(cryptoObj, st, "sTjToKxznvyyidHKtsga5692");
  t("iv-randomized", cipher !== c2, "c2==cipher");

  // 3. 损坏/篡改密文 → null（不抛错）
  const bad = "v1:" + cipher.slice(3).split(".")[0] + ".AAAA";
  const decBad = await cc.decryptSecret(cryptoObj, st, bad);
  t("corrupt->null", decBad === null, "decBad=" + decBad);

  // 4. 密文无法用错误 KEK 解密 → null
  const st2 = memStorage();
  st2.raw.zyBaiduCryptoKek = "v1:" + btoa(String.fromCharCode.apply(null, cryptoObj.getRandomValues(new Uint8Array(32))));
  const decWrong = await cc.decryptSecret(cryptoObj, st2, cipher);
  t("wrong-kek->null", decWrong === null, "decWrong=" + decWrong);

  // 5. 空/非密文 → 空/null
  t("empty->cipher-empty", (await cc.encryptSecret(cryptoObj, st, "")) === "", "");
  t("plain-format-not-cipher", cc.isCiphertext("sTjToKx...") === false);

  console.log(results.join("\n"));
  console.log("credential-crypto: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
  process.exit(failures.length ? 1 : 0);
}
scenario().catch((e) => { console.error("scenario error", e); process.exit(1); });