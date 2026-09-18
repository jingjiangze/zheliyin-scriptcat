# AI_COMMANDS.md — 实际使用过的命令清单

> 全部在 `D:\zheliyin-scriptcat` 下运行（PowerShell）。

## 1. P0 Runner（核心）

```powershell
cd D:\zheliyin-scriptcat

# 全流程（默认）
node runtime/p0/runner.js

# 断点续跑（实例每次启动读了 resume-state.json）
node runtime/p0/runner.js --from-proof      # 从核稿阶段开始（需已建对象）
node runtime/p0/runner.js --from-print      # 从印刷阶段开始
node runtime/p0/runner.js --from-check      # 直接从「去检查」+红框定位开始

# 专项
node runtime/p0/runner.js --case-font-schema   # A/B 对象 schema 对照（不印刷）
node runtime/p0/runner.js --variant=display0   # 单变量实验：isDisplay=0（--variant=<字段><值>）
node runtime/p0/runner.js --submit-probe       # 仅提交探测（观测 submitUserDesign.do 响应）
node runtime/p0/runner.js --control-empty      # 空控件对照实验
node runtime/p0/runner.js --control-manual     # 手工控件对照实验
node runtime/p0/runner.js --adopt-session      # 会话收养模式
node runtime/p0/runner.js --relogin            # 强制重新登录
node runtime/p0/runner.js --resume=<stage>     # 指定阶段恢复
```

关键行为：
- 启动 Playwright persistent context（profile：默认 `runtime/browser/profile-usc3`，env `P0_PROFILE` 覆盖）。
- 页面 URL：`https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`
- 前置凭据环境变量（只读，勿入库）：
```powershell
$env:P0_LOGIN_USER = "..."     # 仅本机会话设置
$env:P0_LOGIN_PASS = "..."
```
- 输出：`runtime/reports/p0/{run-summary,proof-result,suspect-object,manual-vs-script-diff,control-result,submit-probe,resume-state}.json`

## 2. 其他 P0 工具

```powershell
node runtime/p0/ocr-real-runner.js     # 真实 OCR 链路（ScriptCat 真实 userscript + #zy-native-ocr-btn）
node runtime/p0/ocr-boot-probe.js      # OCR 引导探针（OCR 前后状态 + 截图）
node runtime/p0/debug-print.js         # 对象模型 debug print（脚本 vs 手工对照）
node runtime/p0/session-adopt.js       # 会话收养探针（验证持久化 profile 登录态）
```

## 3. 单测

```powershell
node tests/editor-object-model/run.js      # 13 suites（object-model/adapter/matcher/diff + ocr 各模块）
# 期望输出尾部：editor-object-model: ALL 13 SUITES PASS
```

## 4. 语法检查（每次改代码后）

```powershell
node --check zheliyin-card-assistant.user.js
node --check extension/assistant.js
node --check runtime/p0/runner.js
# 其余模块同理
```

## 5. package.json scripts（Playwright runtime harness）

```powershell
npm run runtime:check       # node runtime/check.js
npm run runtime:full        # node runtime/full.js
npm run runtime:attach      # node runtime/attach.js（外部浏览器 attach？见 runtime map）
npm run runtime:scriptcat   # node runtime/runtime8-full-chain.js
```

## 6. 版本同步（升版时一次性执行）

```powershell
# 1) 确认全部版本字符串（应只有 0.3.10.2）
Select-String -Path zheliyin-card-assistant.user.js -Pattern "@version|@require.*\?v=|const VERSION"
# 2) 同步地方：userscript(@version + 9×@require ?v= + const VERSION)、manifest version_name、README、CHANGELOG
# 3) 提交："fix: 同步 @require 缓存版本 x -> y (N 模块一致, 防 ScriptCat 旧缓存)"
```

## 7. Git 常规

```powershell
git status
git add <具体文件>          # 不用 git add -A（防误入敏感/大文件）
git commit -m "fix: <单一目的描述>"
git push origin test
# 验证对齐
git rev-parse HEAD; git rev-parse origin/test    # 应相等
git status                                       # working tree clean
```

## 8. 证据浏览

```powershell
Get-Content runtime/reports/p0/run-summary.json -TotalCount 80   # 最近运行概况
Get-ChildItem runtime/reports/p0/ocr-runtime/                    # OCR 全链路证据
# 截图：View ocr-boot.png / ocr-runtime/*.png
```

## 9. 安全扫描（提交证据前）

```powershell
Get-ChildItem runtime -Recurse -File | Select-String -Pattern "password|access_token|secret|P0_LOGIN" -SimpleMatch
# 期望：空
```