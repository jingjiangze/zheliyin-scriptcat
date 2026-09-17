/** 验证 GitHub 凭据有效性（token 只从环境变量读取，不落盘） */
const https = require("https");

const TOKEN = process.env.ZY_GH_TOKEN;
if (!TOKEN) { console.error("NO TOKEN"); process.exit(2); }

const req = (path) => new Promise((resolve, reject) => {
  const r = https.request({
    host: "api.github.com", path, method: "GET",
    headers: {
      "Authorization": "token " + TOKEN,
      "User-Agent": "zy-ui2-verify",
      "Accept": "application/vnd.github+json",
      "Connection": "close",
    },
    timeout: 30000,
  }, (res) => {
    let b = "";
    res.on("data", d => b += d);
    res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
  });
  r.on("error", reject);
  r.on("timeout", () => { r.destroy(new Error("timeout")); });
  r.end();
});

(async () => {
  try {
    const u = await req("/user");
    console.log("USER status=" + u.status + " login=" + (JSON.parse(u.body || "{}").login));
    console.log("SCOPES=" + (u.headers["x-oauth-scopes"] || "(none)"));
    const r = await req("/repos/jingjiangze/zheliyin-scriptcat");
    const j = JSON.parse(r.body || "{}");
    console.log("REPO status=" + r.status + " default_branch=" + j.default_branch + " private=" + j.private);
    const ref = await req("/repos/jingjiangze/zheliyin-scriptcat/git/ref/heads/ai2-repo-governance");
    const rj = JSON.parse(ref.body || "{}");
    console.log("GOV_REF status=" + ref.status + " sha=" + (rj.object ? rj.object.sha : "(n/a)"));
  } catch (e) {
    console.log("ERR " + e.message);
  }
})();
