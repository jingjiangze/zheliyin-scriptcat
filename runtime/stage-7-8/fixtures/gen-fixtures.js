// runtime/stage-7-8/fixtures/gen-fixtures.js — Stage 7.8 §九：OCR Fixture 图集生成器（零依赖，纯 Node）
// ---------------------------------------------------------------------
// 输出（runtime/stage-7-8/fixtures/）：
//   ocr-fixture-{key}.svg       矢量源（font-family=SimHei/YaHei；真机步骤在浏览器 canvas
//                               fillText 光栅化为 PNG，天然使用系统真实字形，避免纯 Node 重造字形）
//   ocr-fixture-{key}.json      人工标注黄金基准（§三十九）：blocks[{text, bbox{left,top,width,height},
//                               fontSizePx(视觉字高代理), sizeClass, page}]
//   fixtures-README.md          Fixture 矩阵说明 + 每张图的验证焦点 + 限制（UNKNOWN 如实记录）
//
// 首版覆盖（§九）：A 单一字号 / B 大标题+小正文 / C 大字+小字+数字 / G 同一水平线大字+小字 /
//   H 上下两行字号明显不同 / I 装饰符号 / J 中文标点 / K 英文标点结构 / L 非常规 Unicode /
//   M 零宽不可见字符。
// PNG 像素版本渲染路径：真机浏览器（document.createElement('canvas') + ctx.fillText，系统字体
//   SimHei）-> toDataURL -> 注入 OCR —— 本阶段离线只产 SVG + 标注，PNG 生成在真机步骤（第八章）。
//
// 用法：node runtime/stage-7-8/fixtures/gen-fixtures.js
"use strict";
const fs = require("fs");
const path = require("path");

const OUT = __dirname;

// 字符宽高估算（示意布局用）：CJK≈宽度1em，ASCII≈0.55em
function emW(ch) {
  const cp = ch.codePointAt(0);
  return cp > 0x2e7f ? 1 : 0.55;
}
function textWidth(text, size) {
  return Array.from(String(text)).reduce((w, ch) => w + emW(ch), 0) * size;
}

// Fixture 定义：{key, spec(章节), name, w, h, page, focus(验收焦点), blocks:[{text, x, y, size, sizeClass}]}
// size = 视觉字高代理（pixel height proxy，§十八 numeric size proxy 语义；SVG font-size 近似同值）
const FIXTURES = [
  {
    key: "A", spec: "§九 Fixture A", name: "single-size", page: "front",
    w: 560, h: 300, focus: "单一字号：全部 32px，应稳定合成 1 个段落块（每行独立也可接受，但禁止错误跨块/丢字）",
    blocks: [
      { text: "武汉高端科技有限公司", x: 40, y: 40, size: 32, sizeClass: "MEDIUM" },
      { text: "张三", x: 40, y: 100, size: 32, sizeClass: "MEDIUM" },
      { text: "13800138000", x: 40, y: 160, size: 32, sizeClass: "MEDIUM" },
      { text: "市场部经理", x: 40, y: 220, size: 32, sizeClass: "MEDIUM" }
    ]
  },
  {
    key: "B", spec: "§九 Fixture B", name: "title-plus-body", page: "front",
    w: 560, h: 320, focus: "大标题 44px + 小正文 20px×3：标题必须与正文拆成不同 TextBlock（False Merge Rate 重点）",
    blocks: [
      { text: "星辰创意设计工作室", x: 40, y: 36, size: 44, sizeClass: "LARGE" },
      { text: "李四", x: 40, y: 110, size: 20, sizeClass: "MEDIUM" },
      { text: "13912345678", x: 40, y: 150, size: 20, sizeClass: "MEDIUM" },
      { text: "资深平面设计师", x: 40, y: 190, size: 20, sizeClass: "MEDIUM" }
    ]
  },
  {
    key: "C", spec: "§九 Fixture C", name: "big-small-digits", page: "front",
    w: 560, h: 320, focus: "大字 44 + 小字 18 + 数字 26：三种相对字号应分别归属不同 sizeCluster",
    blocks: [
      { text: "云端智能科技", x: 40, y: 36, size: 44, sizeClass: "LARGE" },
      { text: "王五", x: 40, y: 110, size: 18, sizeClass: "SMALL" },
      { text: "VIP 客户 2026", x: 40, y: 220, size: 26, sizeClass: "MEDIUM" }
    ]
  },
  {
    key: "G", spec: "§九 Fixture G", name: "same-line-mixed-size", page: "front",
    w: 560, h: 200, focus: "同一水平线上大字34+小字14：该『同一行大+小』不得被粗暴合并/丢失字高差（§二十取证样本；groupWordsToLines 字高容差 0.5 行为以真机证据为准）",
    blocks: [
      { text: "优", x: 40, y: 60, size: 34, sizeClass: "LARGE" },
      { text: "惠", x: 82, y: 60, size: 34, sizeClass: "LARGE" },
      { text: "全场五折", x: 130, y: 76, size: 14, sizeClass: "SMALL" }
    ]
  },
  {
    key: "H", spec: "§九 Fixture H", name: "stacked-different-size", page: "front",
    w: 560, h: 220, focus: "上下两行字号明显不同（40 / 16）：必须拆 2 个 TextBlock（§二十三/§二十七 宁拆勿合）",
    blocks: [
      { text: "年度盛典", x: 40, y: 36, size: 40, sizeClass: "LARGE" },
      { text: "诚邀莅临指导", x: 40, y: 140, size: 16, sizeClass: "SMALL" }
    ]
  },
  {
    key: "I", spec: "§九 Fixture I", name: "decorative-symbols", page: "front",
    w: 560, h: 240, focus: "装饰性特殊符号：★◆●▲♥ 不应被粗暴过滤，safeText 原样保留（§十 禁止 /[^一-龥a-zA-Z0-9]/g）",
    blocks: [
      { text: "★ 至尊会员专属 ★", x: 40, y: 46, size: 30, sizeClass: "MEDIUM" },
      { text: "◆●▲♥ 品质保证", x: 40, y: 130, size: 24, sizeClass: "MEDIUM" }
    ]
  },
  {
    key: "J", spec: "§九 Fixture J", name: "cjk-punctuation", page: "front",
    w: 560, h: 200, focus: "常见中文标点：，。！？、；：『引号』（）《》…—— 全部 SAFE 保留（§十二）",
    blocks: [
      { text: "联系电话：13800138000；邮箱：a@b.com", x: 40, y: 60, size: 26, sizeClass: "MEDIUM" },
      { text: "网址：www.example.com（备用）", x: 40, y: 120, size: 26, sizeClass: "MEDIUM" }
    ]
  },
  {
    key: "K", spec: "§九 Fixture K", name: "ascii-structure", page: "front",
    w: 620, h: 220, focus: "英文/数字/结构字符：ABC Ltd. +86 1380-013-8000 zhang@mail.com https://www.example.com 结构不得被空格打散",
    blocks: [
      { text: "John Zhong, Sales Manager", x: 40, y: 50, size: 24, sizeClass: "MEDIUM" },
      { text: "Tel: +86 1380-013-8000", x: 40, y: 110, size: 24, sizeClass: "MEDIUM" },
      { text: "E-mail: j.zhong@example.com.cn", x: 40, y: 170, size: 24, sizeClass: "MEDIUM" }
    ]
  },
  {
    key: "L", spec: "§九 Fixture L", name: "exotic-unicode", page: "front",
    w: 560, h: 260, focus: "非常规 Unicode：①② Ⅳ ½ ℃ ™ ®。行为按羊羊真机证据记录（§十五 不因特殊就删；emoji 非 BMP 需真机验证 DIY 行为后定级）",
    blocks: [
      { text: "会员等级：① Ⅳ ¼ ½", x: 40, y: 60, size: 30, sizeClass: "MEDIUM" },
      { text: "温度 25℃ 商标™®", x: 40, y: 150, size: 30, sizeClass: "MEDIUM" }
    ]
  },
  {
    key: "M", spec: "§九 Fixture M", name: "zero-width-invisible", page: "front",
    w: 560, h: 200, focus: "零宽/不可见字符（\u200b ZWSP）：视觉上与普通文本相同，sanitizer 应移除不可见字符且不留空白（§十五 首轮审计）",
    blocks: [
      { text: "联系\u200b人：\u200b赵六", x: 40, y: 60, size: 28, sizeClass: "MEDIUM" },
      { text: "电话：136\u200b0000\u200b1111", x: 40, y: 120, size: 28, sizeClass: "MEDIUM" }
    ]
  }
];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\u200b/g, "");
}

function svgOf(f) {
  const lines = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}" height="${f.h}" viewBox="0 0 ${f.w} ${f.h}">`);
  lines.push(`  <rect width="${f.w}" height="${f.h}" fill="#ffffff"/>`);
  f.blocks.forEach((b) => {
    const estW = textWidth(b.text, b.size);
    lines.push(`  <text x="${b.x}" y="${b.y + b.size}" font-family="SimHei, Microsoft YaHei, sans-serif" font-size="${b.size}" fill="#000000">${esc(b.text)}</text>`);
    // 边界框（诊断用途，不渲染）
    lines.push(`  <!-- block: "${esc(b.text)}" x=${b.x} top=${b.y} width=${Math.round(estW)} height=${b.size} sizeClass=${b.sizeClass} -->`);
  });
  lines.push("</svg>");
  return lines.join("\n");
}

function jsonOf(f) {
  return {
    fixture: f.key, spec: f.spec, name: f.name, page: f.page, width: f.w, height: f.h, focus: f.focus,
    generatedBy: "runtime/stage-7-8/fixtures/gen-fixtures.js",
    renderNote: "离线 SVG 源；像素 PNG 需真机浏览器 canvas fillText 光栅化（系统字体 SimHei）",
    blocks: f.blocks.map((b) => ({
      text: b.text, page: f.page,
      bbox: { left: b.x, top: b.y, width: Math.round(textWidth(b.text, b.size)), height: b.size },
      fontSizePx: b.size, // 视觉字高代理（§十八 numeric size proxy）
      sizeClass: b.sizeClass
    }))
  };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const readme = [];
  readme.push("# Stage 7.8 OCR Fixture 图集（§九）\n");
  readme.push("> 生成命令：`node runtime/stage-7-8/fixtures/gen-fixtures.js`（零依赖）\n");
  readme.push("## 矩阵\n");
  readme.push("| Key | 名称 | 验证焦点 | 页面 |");
  readme.push("| --- | --- | --- | --- |");
  FIXTURES.forEach((f) => {
    const svg = svgOf(f);
    const j = jsonOf(f);
    fs.writeFileSync(path.join(OUT, `ocr-fixture-${f.key}.svg`), svg, "utf8");
    fs.writeFileSync(path.join(OUT, `ocr-fixture-${f.key}.json`), JSON.stringify(j, null, 2) + "\n", "utf8");
    readme.push(`| ${f.key} | ${f.name} | ${f.focus} | ${f.page} |`);
    // 自校验
    const parsed = JSON.parse(fs.readFileSync(path.join(OUT, `ocr-fixture-${f.key}.json`), "utf8"));
    if (!Array.isArray(parsed.blocks) || !parsed.blocks.length) throw new Error("fixture " + f.key + " golden json 有误");
  });
  readme.push("\n## 限制（如实记录，不冒充 PASS）\n");
  readme.push("- 离线产出的 `.svg` 是矢量源；OCR 需要的位图（`.png`）必须由**真机浏览器**渲染：`canvas` + `ctx.fillText('SimHei')` + `toDataURL`（真机第八章做法）。纯 Node 重造 CJK 字形属于过度工程，本阶段不做。");
  readme.push("- Fixture L：`①② Ⅳ ½ ℃ ™ ®` 在 BMP 内；emoji（非 BMP）行为待真机验证后才定 SAFE/NORMALIZABLE/BLOCKED（§十五）。");
  readme.push("- Fixture M：零宽字符不可见，视觉上等同普通文本；是否被 OCR 引擎直接忽略、sanitizer 是否清理干净 → 真机证据。");
  fs.writeFileSync(path.join(OUT, "fixtures-README.md"), readme.join("\n") + "\n", "utf8");
  console.log("generated " + FIXTURES.length + " fixture sets -> " + OUT);
  FIXTURES.forEach((f) => console.log("  " + f.key + " " + f.name + " blocks=" + f.blocks.length + " " + f.w + "x" + f.h));
}
main();