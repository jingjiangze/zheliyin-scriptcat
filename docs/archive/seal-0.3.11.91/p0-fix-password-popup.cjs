// P0：消除 Chrome「要保存密码吗」弹窗
// 根因：5 个凭据输入框为 type="password" 且无 autocomplete → Chrome 密码管理器误判为登录表单。
// 修法：type="password" → type="text" + CSS -webkit-text-security: disc（视觉仍是圆点遮罩），
//       并加 autocomplete="off" / data-form-type="other" / spellcheck="false"（非登录语义）。
// 效果：面板内不存在任何 password 字段 → 密码管理器不再触发保存提示；值读写逻辑不变（仍走 .value）。
"use strict";
const fs = require("fs");
const US = "D:\\zheliyin-scriptcat\\zheliyin-card-assistant.user.js";
let src = fs.readFileSync(US, "utf8");

// 1) CSS：遮罩类（放在 .zy-input 规则之后）
const cssAnchor = '      .zy-textarea { min-height: 112px; resize: vertical; }';
if (src.indexOf(cssAnchor) < 0) { console.error("FATAL: CSS 锚点未命中"); process.exit(1); }
const cssNew = cssAnchor + '\n      /* P0：凭据输入框遮罩 —— 用 type=text + text-security 替代 type=password，避免 Chrome 密码管理器误判为登录表单 */\n      .zy-secret { -webkit-text-security: disc; }';
src = src.replace(cssAnchor, cssNew);

// 2) 5 个凭据输入框
const IDS = ["zy-api-key", "zy-baidu-ak", "zy-baidu-sk", "zy-baidu-ak-native", "zy-baidu-sk-native"];
const ATTRS = ' type="text" autocomplete="off" data-form-type="other" spellcheck="false" autocapitalize="off"';
let n = 0;
for (const id of IDS) {
  const re = new RegExp('<input class="zy-input" id="' + id + '" type="password"');
  if (!re.test(src)) { console.error("FATAL: 锚点未命中 " + id); process.exit(1); }
  src = src.replace(re, '<input class="zy-input zy-secret" id="' + id + '"' + ATTRS);
  n += 1;
}

fs.writeFileSync(US, src, "utf8");
console.log("P0 patched: css + " + n + " inputs");

// 校验
const left = (src.match(/type="password"/g) || []).length;
console.log("remaining type=password = " + left);
console.log("zy-secret inputs = " + (src.match(/class="zy-input zy-secret"/g) || []).length);
process.exit(left ? 1 : 0);