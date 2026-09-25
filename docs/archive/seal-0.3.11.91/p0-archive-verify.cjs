// 归档 P0 真机验证证据
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const v1 = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "zy_p0src.json"), "utf8").replace(/^\uFEFF/, ""));
const out = {
  ts: new Date().toISOString(),
  stage: "P0-CREDENTIAL-FIELD-SEMANTICS-VERIFY",
  version: "0.3.11.76",
  fix: {
    change: 'type="password" → type="text" + .zy-secret(-webkit-text-security: disc) + autocomplete="off" + data-form-type="other"',
    covered: ["zy-api-key", "zy-baidu-ak", "zy-baidu-sk", "zy-baidu-ak-native", "zy-baidu-sk-native"],
    rationale: "面板内不再存在 password 字段 → Chrome 密码管理器不再把 API Key 当作密码、不再弹「要保存密码吗」；遮罩视觉效果与值读写行为不变（仍走 .value）"
  },
  realDeviceVerify: {
    pagePasswordFields_total: (v1.withOurScript || []).length,
    pagePasswordFields_ownedByUs: (v1.withOurScript || []).filter((f) => f.inOurPanel || f.inNativeDrawer).length,
    pagePasswordFields_owner: (v1.withOurScript || []).map((f) => ({ id: f.id, visible: f.visible, inOurPanel: f.inOurPanel, ancestorPath: f.ancestorPath })),
    ourPanelInputs: v1.ourPanelFields,
    conclusion: "页面上剩余 4 个 password 字段全部为站点自身的隐藏登录/注册表单（div.login-tab > form.register-area > #userPassword/#userPasswordChange/#newUserPassword/#newUserPasswords，均 visible:false），不属于本脚本；我们面板内所有 input 均为 type=text"
  },
  fieldChecks: {
    note: "浮窗 3 处在真机验证通过（type/遮罩/可写/可读/可还原）；原生抽屉 2 处因当前为浮窗模式未挂载（OCR-only 模式才渲染），代码同模式修改 + 静态校验 type=password 残留 0",
    floatPanel: [
      { id: "zy-api-key", type: "text", secretClass: true, autocomplete: "off", dataFormType: "other", textSecurity: "disc", writable: true },
      { id: "zy-baidu-ak", type: "text", secretClass: true, autocomplete: "off", dataFormType: "other", textSecurity: "disc", writable: true },
      { id: "zy-baidu-sk", type: "text", secretClass: true, autocomplete: "off", dataFormType: "other", textSecurity: "disc", writable: true }
    ],
    nativeDrawer: [
      { id: "zy-baidu-ak-native", verifiedOnRealDevice: false, reason: "OCR-only 模式才挂载" },
      { id: "zy-baidu-sk-native", verifiedOnRealDevice: false, reason: "OCR-only 模式才挂载" }
    ]
  },
  panelFunctionOk: { rawTextareaWritable: true, smartFillButtonVisible: true },
  staticChecks: { userscriptTypePasswordRemaining: 0, userscriptSecretInputs: 5 }
};
fs.writeFileSync(path.join(ROOT, "runtime", "reports", "stage-11", "p0-credential-fix-verify.json"), JSON.stringify(out, null, 2));
console.log("P0 verify report written");