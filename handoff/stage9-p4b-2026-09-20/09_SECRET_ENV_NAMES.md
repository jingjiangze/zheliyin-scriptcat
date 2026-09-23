# 09 — Secret / Env 变量名索引（不存值）

> 本文件只记录环境变量**名称**与用途；任何真实值一律 NOT_STORED / REDACTED。
> 交接包、日志、JSON、Git diff 中**不得出现**真实 Cookie / AK / SK / Token / 密码。

```
ZY_STAGE9_COOKIE
  status = required-for-real-E2E（编辑器会话）
  value  = NOT_STORED
  source = 当前会话运行时注入（用户浏览器 DevTools → Application → Cookies → diy.zheliyin.com）
  logging= NAME_ONLY（e2e 报告只记 cookie 名，如 SESSION / diy-User-third）

ZY_BAIDU_AK / ZY_BAIDU_SK
  status = required-for-standard-vs-accurate-A/B（Baidu OCR 凭据）
  value  = NOT_STORED
  logging= REDACTED（baidu-geometry-benchmark / font-target-ab 报告不含凭据）

ZY_BG_FILE
  status = optional（默认 runtime/stage8b/assets/real-card-shengying.png）
  value  = 非敏感路径

ZY_STAGE9_FONT_INK_TARGET / ZY_STAGE9_NATIVE_TRUTH / ZY_STAGE9_NATIVE_OCR_MODE
  status = 实验开关（userscript 初始化读取；A/B 需 fresh runtime 注入 GM/localStorage）
  value  = 明文布尔/模式，非凭据，可记录
```

## 使用纪律

1. 凭据仅在 runner 进程 env 注入（PowerShell `$env:...`），不写入任何文件。
2. 报告/证据只输出 cookie 名称或 `cookiePresent=true/false`。
3. 若工具需要凭据但未注入 → 必须显式报缺并终止（不伪造、不占位）。
4. 凭据泄露检查：`git grep -iE "SESSION=|diy-User-third|access_token|client_secret"` 应无可疑（交接提交前建议执行）。