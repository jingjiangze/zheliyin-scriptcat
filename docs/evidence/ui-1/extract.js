// Extract the high-signal parts of ui-audit.json into readable text reports.
const fs = require("fs");
const path = require("path");
const dir = "C:\\Users\\Administrator\\WorkBuddy\\2026-09-16-12-13-35\\ui-audit";
const j = JSON.parse(fs.readFileSync(path.join(dir, "ui-audit.json"), "utf8"));
const a = j.audit || {};
const L = [];
const S = (t) => L.push(t);

S("### url " + j.target);
S("### title " + (a.title || "?"));
S("### viewport " + JSON.stringify(a.viewport) + " dpr=" + a.dpr);
if (j.gotoError) S("### GOTO ERROR " + j.gotoError);
S("");

S("## 1. ID KEYWORDS (" + (a.idKeywords || []).length + " of " + a.idCount + " total ids)");
(a.idKeywords || []).forEach((x) => S("  " + x));
S("");

S("## 2. CLASS KEYWORDS (top by frequency)");
(a.classKeywords || []).forEach((x) => S("  " + x));
S("");

S("## 3. RIGHT BAR");
(a.rightBar || []).forEach((r) => {
  S("  " + r.sel + " -> " + (r.el ? JSON.stringify(r.el) : "null") + " children=" + r.childCount);
});
S("");
S("### 3b. rightBar CHILDREN");
(a.rightBarChildren || []).forEach((c, i) => {
  S("  [" + i + "] " + c.tag + "#" + (c.id || "-") + "." + (c.cls || "-"));
  S("      rect=" + JSON.stringify(c.rect) + " pos=" + c.position + " z=" + c.zIndex);
  S("      text=" + JSON.stringify(c.text));
});
S("");
S("### 3c. rightBar BUTTONS");
(a.rightBarButtons || []).forEach((b, i) => {
  S("  [" + i + "] " + b.tag + "#" + (b.id || "-") + "." + (b.cls || "-") + "  " + JSON.stringify(b.rect));
  S("      text=" + JSON.stringify(b.text) + "  onclick=" + b.onclick + "  data=" + b.dataAttrs);
  S("      bg=" + b.background + " border=" + b.border + " radius=" + b.borderRadius + " font=" + b.fontSize + "/" + b.fontWeight);
});
S("");

S("## 4. BUTTONS (design tokens)");
(a.buttons || []).forEach((b, i) => {
  S("  [" + i + "] " + b.tag + "#" + (b.id || "-") + "." + (b.cls || "-") + " " + JSON.stringify(b.rect));
  S("      h=" + b.rect.h + " font=" + b.fontSize + "/" + b.fontWeight + " pad=" + b.padding + " radius=" + b.borderRadius);
  S("      bg=" + b.background + " color=" + b.color + " border=" + b.border);
  S("      shadow=" + b.boxShadow + " text=" + JSON.stringify(b.text));
});
S("");

S("## 5. INPUTS");
(a.inputs || []).forEach((b, i) => {
  S("  [" + i + "] " + b.tag + "#" + (b.id || "-") + "." + (b.cls || "-") + " " + JSON.stringify(b.rect));
  S("      h=" + b.rect.h + " font=" + b.fontSize + " pad=" + b.padding + " radius=" + b.borderRadius);
  S("      bg=" + b.background + " color=" + b.color + " border=" + b.border);
});
S("");

S("## 6. PANELS / DRAWERS / DIALOGS");
(a.panels || []).forEach((p, i) => {
  S("  [" + i + "] " + p.tag + "#" + (p.id || "-") + "." + (p.cls || "-") + " " + JSON.stringify(p.rect) + " children=" + p.childCount);
  S("      pos=" + p.position + " z=" + p.zIndex + " bg=" + p.background + " radius=" + p.borderRadius);
  S("      shadow=" + p.boxShadow + " border=" + p.border + " transition=" + p.transition);
  S("      text=" + JSON.stringify(p.text));
});
S("");

S("## 7. TYPOGRAPHY (body + common)");
S("  fontFamily tokens: " + [...new Set((a.buttons || []).concat(a.inputs || []).map((x) => x.fontFamily))].join(" | "));
S("  fontSize tokens:   " + [...new Set((a.buttons || []).concat(a.inputs || []).map((x) => x.fontSize))].sort().join(" | "));
S("  fontWeight tokens: " + [...new Set((a.buttons || []).concat(a.inputs || []).map((x) => x.fontWeight))].sort().join(" | "));
S("");

S("## 8. SPACING TOKENS (observed margin/padding/gap frequency)");
(a.spacingTokens || []).forEach((x) => S("  " + x));
S("");

S("## 9. CSS VARIABLES (root)");
const vs = Object.entries(a.cssVars || {});
S("  count=" + vs.length);
vs.slice(0, 80).forEach(([k, v]) => S("  " + k + " = " + v));
S("");

S("## 10. STYLESHEETS");
(a.styleSheets || []).forEach((s) => S("  " + s.rules + "\t" + s.href));
S("");

S("## 11. INJECTED LEGACY UI");
S("  " + JSON.stringify(a.injected, null, 2).split("\n").join("\n  "));
S("");

S("## 12. CONSOLE (last 60)");
(j.consoleLogs || []).forEach((l) => S("  " + l));
S("");
S("## 13. 1920 viewport rightBar");
S("  " + JSON.stringify(j.audit1920));

fs.writeFileSync(path.join(dir, "ui-audit-report.txt"), L.join("\n"), "utf8");
console.log("lines=" + L.length);
