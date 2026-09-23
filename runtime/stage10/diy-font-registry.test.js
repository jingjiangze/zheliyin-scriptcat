// runtime/stage10/diy-font-registry.test.js — Stage 10-D Commit A：DIY 字体目录解析/检索单测
"use strict";
const { buildRegistry, normName } = require("../../extension/src/editor/diy-font-registry.js");
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass += 1; console.log("  ok  " + name); } else { fail += 1; console.log("  FAIL " + name); } };

// 真实数据形状：findAllFontMin [{id,fontname,fontclassify,defaultimage}]
const FAKE_ALL = [
  { id: 708, fontname: "BebasNeue Bold", searchword: "BebasNeue Bold", fontclassify: "隐藏使用", defaultimage: "d1.png", fontpath: "a.ttf", fontpathwoff: "a.woff" },
  { id: 614, fontname: "思源黑体 Regular", searchword: "思源黑体", fontclassify: "正文", defaultimage: "d2.png" },
  { id: 52, fontname: "思源黑体 Bold", searchword: "思源黑体", fontclassify: "标题" },
  { id: 248, fontname: "方正黑体简体", searchword: "方正黑体" },
  { id: 768, fontname: "世纪开元黑体 W8", searchword: "世纪开元黑体" },
  { id: 100, fontname: "汉仪旗黑", searchword: "汉仪旗黑" },
  { id: 88, fontname: "", searchword: "空名占位" }
];
const reg = buildRegistry(FAKE_ALL);

// 1. byId
t("byId hit", reg.byId("708") && reg.byId("708").id === "708");
t("byId miss", reg.byId("9999") === null);
t("byId empty-name entry included", reg.byId("88") !== null);

// 2. 名称精确
t("exact chinese name", reg.resolve("思源黑体 Regular").id === "614" && reg.resolve("思源黑体 Regular").source === "name");
t("exact latin name", reg.resolve("BebasNeue Bold").id === "708");

// 3. 空格归一（首尾冗余空白压缩；内部空格属汉字名语义，不删）
t("space trim normalize", reg.byName("  思源黑体 Regular  ").id === "614");
t("space trim resolve", reg.resolve("  思源黑体 Regular\t").id === "614");

// 4. 大小写归一
t("case insensitive", reg.resolve("bebasneue BOLD").id === "708");

// 5. 括号宽松（页面 fontFamily 常带括号注释）
t("bracket loose", reg.resolve("思源黑体（Regular）").id === "614" && reg.resolve("思源黑体（Regular）").score === 0.92);

// 6. 同族字重/字符重叠：'思源黑体 Bold' 精确命中；'思源黑体 W8' 重叠 0.44 低于门槛 0.6 → 拒绝（防误配不同族字体）
{
  t("bold weight exact", reg.resolve("思源黑体 Bold").id === "52");
  const r = reg.resolve("思源黑体 W8");
  t("low-overlap rejected", r.id === null);
}

// 7. 缺省回退
t("missing font -> null", reg.resolve("不存在的字体名称").id === null && reg.resolve("不存在的字体名称").source === null);
t("empty fontName -> null", reg.resolve("").id === null && reg.resolve(null).id === null);

// 8. 快照字段映射（Commit A 取证）：页面对象 mediafontId 直取；缺失时 fontFamily→registry 回退
{
  const objA = { mediafontId: "708", fontFamily: "BebasNeue Bold" };
  t("snapshot mediafontId direct", String(objA.mediafontId) === "708");
  const objB = { fontFamily: "思源黑体（Regular）" };
  const fallback = reg.resolve(objB.fontFamily);
  t("snapshot fontFamily fallback", fallback.id === "614");
  const objC = { fontFamily: "未知字体 X1" };
  t("snapshot unknown family null", reg.resolve(objC.fontFamily).id === null);
}

// 9. min 目录压缩（去 fontpath 等文件字段）
{
  const minArr = reg.toMinDict();
  const b = minArr.find((m) => m.id === "708");
  t("min dict strips file fields", !!b && b.fontpath === undefined && b.fontpathwoff === undefined && b.fontname === "BebasNeue Bold");
  t("min dict keeps classify/image", minArr.length === 7 && minArr.every((m) => m.id && m.fontname !== undefined));
}

// 10. 空输入
{
  const r0 = buildRegistry([]);
  t("empty registry", r0.size === 0 && r0.resolve("x").id === null);
}

// 11. normName 工具
t("normName compress whitespace", normName("思源黑体   Regular ") === "思源黑体 regular");

const res = { pass: pass, fail: fail };
console.log("diy-font-registry.test: pass=" + res.pass + " fail=" + res.fail);
process.exit(res.fail > 0 ? 1 : 0);