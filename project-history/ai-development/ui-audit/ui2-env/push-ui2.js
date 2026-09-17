/**
 * UI-2 推送：经 GitHub Git Data API 重放 commit（绕过被阻断的 git-receive-pack）。
 * 依据 skill: github-push-when-receive-pack-blocked
 * 特点：8 次重试 + i*2500ms 退避 + Connection: close + 60s 超时 + 逐 blob 增量日志
 */
const https = require("https");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.ZY_GH_TOKEN;
const OWNER = process.env.ZY_OWNER || "jingjiangze";
const REPO = process.env.ZY_REPO || "zheliyin-scriptcat";
const BRANCH = process.env.ZY_BRANCH || "ai2-repo-governance";
const GIT = process.env.ZY_GIT || "C:\\Program Files\\Git\\cmd\\git.exe";
const CWD = process.env.ZY_CWD;
const LOG = process.env.ZY_LOG || path.join(__dirname, "push-ui2.log");

if (!TOKEN || !CWD) { console.error("usage: ZY_GH_TOKEN=... ZY_CWD=... node push-ui2.js"); process.exit(2); }

const log = (...a) => {
  const line = a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  fs.appendFileSync(LOG, line + "\n", "utf8");
  console.log(line);
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function api(method, apiPath, body) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const r = https.request({
      host: "api.github.com", path: apiPath, method,
      headers: Object.assign({
        "Authorization": "token " + TOKEN,
        "User-Agent": "zy-ui2-push",
        "Accept": "application/vnd.github+json",
        "Connection": "close",
      }, data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
      timeout: 60000,
    }, (res) => {
      let b = "";
      res.on("data", d => b += d);
      res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(new Error("request timeout")); });
    if (data) r.write(data);
    r.end();
  });
}

async function apiRetry(method, apiPath, body, label) {
  let lastErr;
  for (let i = 1; i <= 8; i++) {
    let fatal = null;   // 不可重试的客户端错误
    try {
      const r = await api(method, apiPath, body);
      if (r.status >= 200 && r.status < 300) return r;
      if (r.status >= 400 && r.status < 500 && r.status !== 429) {
        // 4xx（除 429）是确定性错误：立即失败，不要空转重试
        fatal = new Error(`HTTP ${r.status} ${label}: ${r.body.slice(0, 400)}`);
      } else {
        lastErr = new Error(`HTTP ${r.status} ${label}: ${r.body.slice(0, 200)}`);
      }
    } catch (e) {
      lastErr = e;      // 网络/TLS 类错误：可重试
    }
    if (fatal) throw fatal;
    log(`  retry ${i}/8 ${label} :: ${String(lastErr.message).slice(0, 120)}`);
    await sleep(i * 2500);
  }
  throw lastErr;
}

const git = (args) => execFileSync(GIT, ["-C", CWD, ...args], { maxBuffer: 256 * 1024 * 1024 });

(async () => {
  fs.writeFileSync(LOG, "", "utf8");
  log("[START] " + new Date().toISOString());

  const localHead = git(["rev-parse", "HEAD"]).toString().trim();
  const localTree = git(["rev-parse", "HEAD^{tree}"]).toString().trim();
  log("[LOCAL] head=" + localHead + " tree=" + localTree);

  // 远端当前 tip
  const refRes = await apiRetry("GET", `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, null, "get-ref");
  const remoteTip = JSON.parse(refRes.body).object.sha;
  log("[REMOTE] tip=" + remoteTip);

  // 计算 BASE..HEAD 的提交链
  let commits;
  try {
    commits = git(["rev-list", "--reverse", `${remoteTip}..${localHead}`]).toString().trim().split("\n").filter(Boolean);
  } catch (e) {
    log("[FATAL] cannot compute commit range (remote tip may not be an ancestor). " + e.message);
    throw e;
  }
  log("[COMMITS] count=" + commits.length + " -> " + commits.map(c => c.slice(0, 7)).join(" "));
  if (!commits.length) { log("[DONE] nothing to push"); return; }

  // 预统计 blob
  const allFiles = git(["ls-tree", "-r", "--name-only", localHead]).toString().trim().split("\n").filter(Boolean);
  log("[TREE] files=" + allFiles.length);

  // 缓存 blob sha（内容寻址，可跨 commit 复用，避免重复上传二进制）
  // 持久化到磁盘：重跑时跳过已成功上传的 blob（一次失败不白费 9 分钟）
  const CACHE_FILE = path.join(__dirname, ".blobcache.json");
  let blobCache = new Map();
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const j = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      for (const [k, v] of Object.entries(j)) blobCache.set(k, v);
      log("[CACHE] loaded " + blobCache.size + " blob mappings");
    }
  } catch (e) { log("[CACHE] load failed: " + e.message); blobCache = new Map(); }
  const saveCache = () => {
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(blobCache)), "utf8"); } catch (_) {}
  };
  let blobCount = 0;
  let uploadTotal = 0;
  const totalBlobsEst = allFiles.length;

  async function uploadBlob(gitBlobSha, filePath) {
    if (blobCache.has(gitBlobSha)) return blobCache.get(gitBlobSha);
    const buf = git(["cat-file", "blob", gitBlobSha]);   // raw bytes
    blobCount++;
    uploadTotal++;
    const res = await apiRetry("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString("base64"),
      encoding: "base64",
    }, `blob ${blobCount} ${filePath} (${buf.length}B)`);
    const sha = JSON.parse(res.body).sha;
    blobCache.set(gitBlobSha, sha);
    if (uploadTotal % 10 === 0) saveCache();
    log(`  blob ${blobCount}/${totalBlobsEst} ${filePath} ${buf.length}B -> ${sha.slice(0, 10)}`);
    return sha;
  }

  // 递归建 tree
  // 关键（skill 明确警告的坑）：type=tree 的条目，sha 必须是【已创建的子树对象 sha】，
  // 不能内联数组，否则 GitHub 返回 422 `tree.sha [...]`。
  async function buildTree(gitTreeSha, prefix) {
    const raw = git(["ls-tree", "-z", gitTreeSha]);
    const entries = raw.toString("utf8").split("\0").filter(Boolean);
    const out = [];
    for (const line of entries) {
      // <mode> SP <type> SP <sha> TAB <name>
      const m = line.match(/^(\d+)\s+(\w+)\s+([0-9a-f]{40})\t(.*)$/);
      if (!m) continue;
      const [, mode, type, sha, name] = m;
      const p = prefix ? prefix + "/" + name : name;
      if (type === "tree") {
        const subEntries = await buildTree(sha, p);          // 先递归算出子树条目
        const subRes = await apiRetry("POST", `/repos/${OWNER}/${REPO}/git/trees`,
          { tree: subEntries }, `subtree ${p} (${subEntries.length})`);
        const subSha = JSON.parse(subRes.body).sha;          // 用返回的 sha 字符串
        log(`  subtree ${p} (${subEntries.length} entries) -> ${subSha.slice(0, 10)}`);
        out.push({ path: name, mode: "040000", type: "tree", sha: subSha });
      } else if (type === "blob") {
        const apisha = await uploadBlob(sha, p);
        out.push({ path: name, mode, type: "blob", sha: apisha });
      }
    }
    return out;
  }

  let runningTip = remoteTip;
  for (const c of commits) {
    const short = c.slice(0, 7);
    log(`[COMMIT ${short}] building tree...`);
    const treeSha = git(["rev-parse", `${c}^{tree}`]).toString().trim();
    const rootEntries = await buildTree(treeSha, "");
    log(`[COMMIT ${short}] creating tree (${rootEntries.length} entries)...`);
    const tRes = await apiRetry("POST", `/repos/${OWNER}/${REPO}/git/trees`, { tree: rootEntries }, `tree ${short}`);
    const newTree = JSON.parse(tRes.body).sha;
    const msg = git(["log", "-1", "--format=%B", c]).toString();
    log(`[COMMIT ${short}] creating commit...`);
    const cRes = await apiRetry("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
      message: msg, tree: newTree, parents: [runningTip],
    }, `commit ${short}`);
    const newCommit = JSON.parse(cRes.body).sha;
    log(`[COMMIT ${short}] -> ${newCommit}`);
    runningTip = newCommit;
  }

  // 更新 ref
  saveCache();
  log("[REF] patching " + BRANCH + " -> " + runningTip);
  await apiRetry("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: runningTip, force: false }, "patch-ref");

  // 校验
  const vRes = await apiRetry("GET", `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, null, "verify-ref");
  const finalSha = JSON.parse(vRes.body).object.sha;
  const cRes2 = await apiRetry("GET", `/repos/${OWNER}/${REPO}/git/commits/${finalSha}`, null, "verify-commit");
  const remoteTree = JSON.parse(cRes2.body).tree.sha;
  log("[VERIFY] remote_sha=" + finalSha);
  log("[VERIFY] remote_tree=" + remoteTree);
  log("[VERIFY] local_tree =" + localTree);
  log("[VERIFY] TREE_MATCH=" + (remoteTree === localTree));
  log("[RESULT] PUSHED remote_tip=" + finalSha + " tree_match=" + (remoteTree === localTree));
  log("[END] " + new Date().toISOString());
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
