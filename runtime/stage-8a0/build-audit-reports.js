// runtime/stage-8a0/build-audit-reports.js — Stage 8A-0 证据聚合：resolution/coordinate 链 + 最终 JSON
"use strict";
const fs = require("fs");
const path = require("path");
const RD = path.join(__dirname, "..", "reports", "stage-8a0");
const route = JSON.parse(fs.readFileSync(path.join(RD, "ocr-runtime-route.json"), "utf8"));
const src = JSON.parse(fs.readFileSync(path.join(RD, "ocr-source-image.json"), "utf8"));
const prov = JSON.parse(fs.readFileSync(path.join(RD, "ocr-provider-route.json"), "utf8"));

const now = new Date().toISOString();

// ---- CODE FACT（零代码修改，从源码摘录，逐条注明出处） ----
const codeFacts = {
  handleOcrImage: "user.js：点击识别 → waitForCanvasReady → waitForOcrTarget(ocrPrepare 消息) → img{dataUrl,width,height}=prep；ocrTarget.geo=prep.geometry；runBaiduOcr / runLocalOcr 共用 img",
  ocrPrepare_build: "page-bridge.js buildOcrPrepare：当前编辑页画布 → active image → backgroundImage → first image（find type==='image'）→ 无则 IMAGE_UNAVAILABLE",
  extractImagePayload: "page-bridge.js：取 target._element/getElement() → w=el.naturalWidth||el.width||target.width；离屏 canvas(w×h) drawImage → toDataURL('image/png')；geometry{left,top,width:target.width,height:target.height,scaleX:target.scaleX||1,scaleY:target.scaleY||1,angle}；背景无 left/top 时画布居中兜底",
  route_class: "ROUTE = IMAGE_SOURCE→RERENDER（原分辨率 element→offscreen canvas→PNG dataURL），非截图（无 viewport/无 crop/无 downscale）",
  reencode: "toDataURL('image/png') → PNG 无损重编码（无 JPEG 降质；base64 体积大）",
  baidu_provider: "baidu-provider.js：recognize(dataUrl,{imageWidth,imageHeight})；side>4096 或 base64>4M → resizeImage 等比压缩；其余原图",
  local_executor: "user.js runLocalOcr：同一 img.dataUrl 注入 Tesseract executor → Baidu/Local CODE FACT 输入相同（runtime hash 未取证，标注 UNKNOWN）",
  font_size: "user.js buildItemsFromOcr：avgLineH=block 内行 bbox 高均值；fs=round(avgLineH*sy/0.969)，clamp 10..160；textbox height=lineCount*fs*1.3+8；width=estimateTextLayout()；不传 scaleX/scaleY（fabric 默认 1）",
  coords: "buildItemsFromOcr：ux=b.bbox.x/w-0.5, uy=b.bbox.y/h-0.5（w,h=ocrPrepare 显示几何宽高=源 natural 尺寸）；px=cx+dx*sx*cos…（水平文本 left/top；θ≠0 center/angle）—— OCR bbox(IMAGE_PIXEL) → canvas 中心偏移映射，无独立 scale 链",
  create_schema: "ocrCreate 消息携带 left/top/width/height/fontSize/text/pageId/side/isDisplay=0（P0 结构）；page-bridge Native drawText 创建"
};

// ---- 尺寸/坐标链（REAL：唯一真机数字来自 audit JSON；INFERENCE 标注） ----
const resolution = {
  generatedAt: now,
  unitNote: "单位链：SOURCE_IMAGE_PIXEL(image natural) → EDITOR_CANVAS_PIXEL(fabric canvas w/h) → 渲染视图（DIP/显示 px 未取证 UNKNOWN）；禁止混用 mm/CSS px",
  fixtures: (route.fixtures || []).map((f) => {
    const s = (src.fixtures || []).find((x) => x.id === f.id) || {};
    const p0 = ((s.pageAudit || {}).pages || [])[0] || {};
    return {
      id: f.id, accessible: f.accessible || false,
      canvas: { width: p0.canvasWidth, height: p0.canvasHeight, unit: "EDITOR_CANVAS_PIXEL(fabric)" },
      imagesObjects: (p0.images || []).length,
      backgroundImage: p0.backgroundImage ? { width: p0.backgroundImage.width, height: p0.backgroundImage.height, scaleX: p0.backgroundImage.scaleX, scaleY: p0.backgroundImage.scaleY, cropX: p0.backgroundImage.cropX, cropY: p0.backgroundImage.cropY } : null,
      ocrInput: null, // 模板无 fabric image → OCR 无输入（见 note）
      note: "模板画布无 type==='image' 对象且无 backgroundImage → buildOcrPrepare 走 IMAGE_UNAVAILABLE（REAL）。7.8R 已知：需注入 fabric.Image 后 kind=active-image"
    };
  })
};

const coordinate = {
  generatedAt: now,
  chain: ["SOURCE_IMAGE_PIXEL(OCR bbox; candidate-normalizer coordinateSpace='image-pixel')", "→ (buildItemsFromOcr) ux=x/w-0.5 以 源natural 尺寸归一化（CODE FACT, page-bridge geometry.width/height=target.width）", "→ cx,cy + dx*sx,dy*sy（editor 画布中心 + image 显示 scale）", "→ Native drawText(left/top/width/height/fontSize)（EDITOR_CANVAS_PIXEL）"],
  knownSpace: "candidate-normalizer 统一输出 coordinateSpace='image-pixel'（CODE FACT + Stage7.8 单测）",
  unknownSpace: "Canvas 显示 DIP 与 EDITOR_CANVAS_PIXEL 的比例关系、fontSize 单位→渲染 px 映射 = UNKNOWN（Stage 8A Typography 校准目标）"
};

fs.writeFileSync(path.join(RD, "ocr-resolution-chain.json"), JSON.stringify(resolution, null, 2));
fs.writeFileSync(path.join(RD, "ocr-coordinate-chain.json"), JSON.stringify(coordinate, null, 2));
fs.writeFileSync(path.join(RD, "ocr-code-facts.json"), JSON.stringify({ generatedAt: now, codeFacts }, null, 2));
// provider-route 补充 codeFacts 引用
prov.generatedAt = now;
prov.codeFactsRef = "see ocr-code-facts.json";
fs.writeFileSync(path.join(RD, "ocr-provider-route.json"), JSON.stringify(prov, null, 2));
console.log("reports written -> " + RD);
console.log("fixtures:", (route.fixtures || []).map((f) => f.id + ":" + (f.accessible ? "ok" : "no-image")) .join(", "));