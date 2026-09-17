const fs = require("fs"); const path = require("path");
const dir = "C:\\Users\\Administrator\\WorkBuddy\\2026-09-16-12-13-35\\ui-audit";
const r = JSON.parse(fs.readFileSync(path.join(dir, "ui-audit2.json"), "utf8"));
const L = []; const S = (t) => L.push(t);
const R = (x) => x ? (x.rect ? `${x.rect.w}x${x.rect.h}@${x.rect.x},${x.rect.y}` : "") : "";

S("## A. NATIVE DESIGN-SYSTEM CSS (design-ai.css + ocr.css) = " + (r.designCssRules||[]).length + " rules");
(r.designCssRules||[]).forEach((x) => S("  " + x));
S("");

S("## B. AI PANEL INSTANCES (live)");
(r.aiPanels||[]).forEach((p, i) => {
  S(`[${i}] ${p.tag}#${p.id||"-"}.${p.cls} ${R(p)} pos=${p.position} z=${p.zIndex} w=${p.width}`);
  S(`    bg=${p.background} radius=${p.borderRadius} shadow=${p.boxShadow} border=${p.border}`);
  S(`    font=${p.fontSize}/${p.fontWeight} ${p.fontFamily}`);
  S(`    transition=${p.transition} text=${JSON.stringify(p.text)}`);
  (p.sub||[]).forEach((s) => S(`      · ${s.tag}#${s.id||"-"}.${s.cls} ${R(s)} fs=${s.fontSize} fw=${s.fontWeight} color=${s.color} bg=${s.background} pad=${s.padding} border=${s.border} text=${JSON.stringify(s.text)}`));
  (p.buttons||[]).forEach((b) => S(`      ▸ ${b.tag}#${b.id||"-"}.${b.cls} ${R(b)} h=${b.rect.h} fs=${b.fontSize} pad=${b.padding} radius=${b.borderRadius} bg=${b.background} color=${b.color} border=${b.border} text=${JSON.stringify(b.text)}`));
});
S("");
S("### B2. AI PANELS CURRENTLY VISIBLE");
(r.aiPanelsVisible||[]).forEach((p, i) => S(`  [${i}] #${p.id||"-"}.${p.cls} ${R(p)}`));
S("");

S("## C. NATIVE OCR DOM NODES (" + (r.ocrNodes||[]).length + ")");
(r.ocrNodes||[]).forEach((n, i) => S(`  [${i}] ${n.tag}#${n.id||"-"}.${n.cls} ${R(n)} display=${n.display} text=${JSON.stringify(n.text)}`));
S("");
S("### C2. NAMED OCR ELEMENTS");
(r.ocrLianDan||[]).forEach((n, i) => S(`  [${i}] ${n.tag}#${n.id||"-"}.${n.cls} ${R(n)} display=${n.display} text=${JSON.stringify(n.text)}`));
S("");

S("## D. NATIVE OCR ENTRY CANDIDATES (" + (r.ocrEntryCandidates||[]).length + ")");
(r.ocrEntryCandidates||[]).forEach((e, i) => {
  S(`  [${i}] ${e.tag}#${e.id||"-"}.${e.cls} ${R(e)} fs=${e.fontSize} color=${e.color}`);
  S(`      html=${e.html}`);
  S(`      parent=${e.parent ? e.parent.tag + "#" + (e.parent.id||"-") + "." + e.parent.cls + " " + R(e.parent) : "-"}`);
});
S("");

S("## E. TOOLBAR STRUCTURE");
S("  toolBar  = " + JSON.stringify(r.toolBar && { cls: r.toolBar.cls, rect: r.toolBar.rect, bg: r.toolBar.background, border: r.toolBar.border }));
S("  editBar  = " + JSON.stringify(r.editBar && { cls: r.editBar.cls, rect: r.editBar.rect, bg: r.editBar.background, h: r.editBar.rect.h }));
S("  editBarR = " + JSON.stringify(r.editBarR && { cls: r.editBarR.cls, rect: r.editBarR.rect }));
S("  extraBar = " + JSON.stringify(r.extraBar && { cls: r.extraBar.cls, rect: r.extraBar.rect }));
S("");
S("### E2. toolGroups (" + (r.toolGroups||[]).length + ")");
(r.toolGroups||[]).forEach((g, i) => {
  S(`  [${i}] ${g.cls} ${R(g)} bg=${g.background} border=${g.border} radius=${g.borderRadius}`);
  (g.items||[]).forEach((x) => S(`      · ${x.tag}#${x.id||"-"}.${x.cls} "${x.title||""}" ${JSON.stringify(x.rect)} text=${JSON.stringify(x.text)}`));
});
S("");

S("## F. tabPageLayer (rightBar tab controller)");
if (r.tabPageLayer) {
  S("  " + JSON.stringify({ cls: r.tabPageLayer.cls, rect: r.tabPageLayer.rect, h: r.tabPageLayer.rect.h, bg: r.tabPageLayer.background }));
  S("  html=" + r.tabPageLayer.html);
  (r.tabPageLayer.children||[]).forEach((c, i) => S(`    [${i}] ${c.tag}#${c.id||"-"}.${c.cls} text=${JSON.stringify(c.text)}`));
  S("    child html: " + (r.tabPageLayer.children||[]).map(c=>c.html).join(" || ").slice(0,800));
}
S("");

S("## G. .bg-material (260px sliding panel)");
if (r.bgMaterial) {
  S("  " + JSON.stringify({ cls: r.bgMaterial.cls, rect: r.bgMaterial.rect, pos: r.bgMaterial.position, z: r.bgMaterial.zIndex, bg: r.bgMaterial.background, shadow: r.bgMaterial.boxShadow, border: r.bgMaterial.border }));
  S("  html=" + (r.bgMaterial.html || "").slice(0, 700));
}
S("");

S("## H. switch/content pull-tab");
S("  switchContent = " + JSON.stringify(r.switchContent && { cls: r.switchContent.cls, rect: r.switchContent.rect, pos: r.switchContent.position, w: r.switchContent.width, bg: r.switchContent.background, fontSize: r.switchContent.fontSize, color: r.switchContent.color }));
S("  switchContent.html = " + (r.switchContent && r.switchContent.html || "").slice(0, 500));
S("  btnSwitch = " + JSON.stringify(r.btnSwitch && { cls: r.btnSwitch.cls, rect: r.btnSwitch.rect, pos: r.btnSwitch.position, bg: r.btnSwitch.background, radius: r.btnSwitch.borderRadius, border: r.btnSwitch.border, fontSize: r.btnSwitch.fontSize }));
S("  btnSwitch.html = " + (r.btnSwitch && r.btnSwitch.html || "").slice(0, 400));
S("");

S("## I. ICON FONT SAMPLES (" + (r.iconFontSample||[]).length + ")");
(r.iconFontSample||[]).slice(0, 30).forEach((x) => S(`  ${x.cls} ::before=${x.content} ff=${x.fontFamily}`));
S("");

S("## J. FRAMEWORKS");
S("  " + JSON.stringify(r.frameworks));

fs.writeFileSync(path.join(dir, "ui-audit2-report.txt"), L.join("\n"), "utf8");
console.log("lines=" + L.length);
