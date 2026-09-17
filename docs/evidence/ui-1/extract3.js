// flatten ui-audit3.json into a compact aligned report
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "ui-audit3.json");
const data = JSON.parse(fs.readFileSync(p, "utf8"));

const lines = [];
const K = (o) =>
  o && o.rect
    ? `${o.rect.w}x${o.rect.h}@${o.rect.x},${o.rect.y} right=${o.right} pos=${o.pos} z=${o.z} vis=${o.visible}`
    : "null";

lines.push("### MULTI-VIEWPORT GEOMETRY PROBE (real page, read-only)");
lines.push("");

for (const r of data) {
  lines.push(`## viewport ${r.tag}  (${r.viewport.w}x${r.viewport.h})`);
  if (r.error) {
    lines.push(`  ERROR ${r.error}`);
    lines.push("");
    continue;
  }
  lines.push(`  hasHScroll=${r.hasHScroll} scrollW=${r.scrollW} docW=${r.docW}`);
  lines.push(`  rightBar      = ${K(r.rightBar)}`);
  lines.push(`  switchContent = ${K(r.switchContent)}`);
  lines.push(`  btnSwitch     = ${K(r.btnSwitch)}`);
  lines.push(`  tabPageLayer  = ${K(r.tabPageLayer)}`);
  lines.push(`  layerWrap     = ${K(r.layerWrap)}`);
  lines.push(`  bgMaterial    = ${K(r.bgMaterial)}`);
  lines.push(`  toolBar       = ${K(r.toolBar)}`);
  lines.push(`  extraBar      = ${K(r.extraBar)}`);
  lines.push(`  leftMenu      = ${K(r.leftPanel)}`);
  lines.push(`  rectCanvas    = ${K(r.canvasHost)}`);
  lines.push(`  canvasBground = ${K(r.canvasBground)}`);
  lines.push(`  aiFangzhi     = ${K(r.aiFangzhi)}`);
  lines.push(`  aiSheji       = ${K(r.aiSheji)}`);
  if (r.derived) {
    lines.push(`  derived       = ${JSON.stringify(r.derived)}`);
  }
  lines.push("");
}

// cross-viewport delta table for the right rail
lines.push("### RIGHT-RAIL ACROSS VIEWPORTS");
lines.push(
  "tag    vpW   rbX   rbW   rbRight  bgMatX  bgMatW  tabX  switchX  canvasW"
);
for (const r of data) {
  if (r.error) continue;
  const g = (o) => (o && o.rect ? o.rect : { x: "-", w: "-" });
  const rb = g(r.rightBar),
    bm = g(r.bgMaterial),
    tb = g(r.tabPageLayer),
    sc = g(r.switchContent),
    cv = g(r.canvasHost);
  lines.push(
    [
      r.tag.padEnd(6),
      String(r.viewport.w).padEnd(5),
      String(rb.x).padEnd(5),
      String(rb.w).padEnd(5),
      String(r.rightBar ? r.rightBar.right : "-").padEnd(8),
      String(bm.x).padEnd(7),
      String(bm.w).padEnd(7),
      String(tb.x).padEnd(5),
      String(sc.x).padEnd(8),
      String(cv.w).padEnd(7),
    ].join(" ")
  );
}

fs.writeFileSync(
  path.join(__dirname, "ui-audit3-report.txt"),
  lines.join("\n"),
  "utf8"
);
console.log("ok");
