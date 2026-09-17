/**
 * Launcher: 解析 GitHub 凭据后以子进程运行 push-ui2.js。
 * 避免依赖 shell（本沙箱 bash shim 缺 cat/dirname/ls）。
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const GIT = process.env.ZY_GIT || "C:\\Program Files\\Git\\cmd\\git.exe";
const CWD = path.resolve(__dirname, "..", "..");
const NODE = process.execPath;

const credOut = execFileSync(GIT, ["-C", CWD, "credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
});
const kv = {};
for (const line of credOut.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1);
}
if (!kv.password) {
  console.error("[LAUNCH] no credential resolved");
  process.exit(2);
}

const env = Object.assign({}, process.env, {
  ZY_GH_TOKEN: kv.password,
  ZY_OWNER: kv.username || "jingjiangze",
  ZY_CWD: CWD,
  ZY_LOG: path.join(__dirname, process.env.ZY_LOGFILE || "push-ui2b.log"),
  NODE_PATH: "C:\\Users\\Administrator\\.workbuddy\\binaries\\node\\workspace\\node_modules",
});

console.log("[LAUNCH] user=" + env.ZY_OWNER + " token_len=" + kv.password.length + " cwd=" + CWD);

const r = spawnSync(NODE, [path.join(__dirname, "push-ui2.js")], {
  env,
  stdio: "inherit",
  cwd: CWD,
});
process.exit(r.status === null ? 1 : r.status);
