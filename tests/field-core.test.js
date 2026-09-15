// 折立印 field-core 单元测试（无框架，浏览器/Node 双跑）
// 运行方式：浏览器打开 tests/run-tests.html；或后续 Node 加载后手动调用
"use strict";
(function () {
  var results = [];
  var failures = 0;

  function eq(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
  function case_(name, cond) {
    results.push(name + (cond ? " PASS" : " FAIL"));
    if (!cond) failures += 1;
  }

  // ---- clean ----
  case_("clean trims and collapses", clean("  张  三  ") === "张 三");
  case_("clean strips leading punct", clean("：电话 138") === "电话 138");
  case_("clean strips trailing punct", clean("138-") === "138");
  case_("clean handles null/undefined", clean(null) === "" && clean(undefined) === "");

  // ---- unique ----
  case_("unique dedupes case-insensitive", eq(unique(["A", "a", "B"]), ["A", "B"]));
  case_("unique drops empties", eq(unique(["x", "", " "]), ["x"]));

  // ---- stripLabel / business / back_extra ----
  case_("stripLabel strips address label", stripLabel("地址：深圳市南山区") === "深圳市南山区");
  case_("stripBusinessLabel strips 主营", stripBusinessLabel("主营范围：包装定制") === "包装定制");
  case_("stripBackExtraLabel strips bare 简介", stripBackExtraLabel("简介：我们专业") === "我们专业");
  // 已知怪癖（Golden Master 原行为，不改）：带"公司"前缀的"公司简介："不会被剥
  case_("stripBackExtraLabel keeps 公司简介 prefix", stripBackExtraLabel("公司简介：我们专业") === "公司简介：我们专业");
  case_("stripTrailingDept removes dept tail", stripTrailingDept("深圳市华创科技有限公司营销部") === "深圳市华创科技有限公司");

  // ---- 行类别（地址 vs 主营混淆）----
  case_("isAddressLine true for address", isAddressLine("广东省深圳市南山区深南大道9988号"));
  case_("isAddressLine false for short", isAddressLine("深圳市") === false);
  case_("isAddressLine false for business", isAddressLine("主营：电子元器件、服务器") === false);
  case_("isBusinessLine true for 主营词", isBusinessLine("主营业务：电子元器件"));
  case_("isBusinessLine true for industry", isBusinessLine("批发零售：五金塑胶"));
  case_("isBusinessLine false for pure address", isBusinessLine("广东省深圳市南山区快速发展大道1号") === false);
  case_("isBackExtraLine true for 简介", isBackExtraLine("公司简介：专注15年"));
  case_("isNameExcluded blocks 产品中心", isNameExcluded("产品中心") === true && isNameExcluded("服务热线") === true);
  case_("isNameExcluded allows 张伟", isNameExcluded("张伟") === false);

  // ---- normalizeFields ----
  var norm = normalizeFields({
    company_cn: "  深圳市华创科技有限公司 ",
    phones: "13800138000；13700137000；13800138000",
    websites: "www.x.com",
    business: ["电子元器件", "电子元器件", "深圳市华创科技有限公司", "13800138000", "www.x.com"],
    back_extra: ["二维码提示", "扫码关注", "广东省深圳市南山区xxx", "微信客服"]
  });
  case_("normalize cleans company", norm.company_cn === "深圳市华创科技有限公司");
  // 单数兜底仅在复数 key 为空时生效（真实行为）
  var normSingle = normalizeFields({ phone: "13900139000" });
  case_("normalize plural absent -> singular fallback", eq(normSingle.phones, ["13900139000"]));
  case_("normalize plural wins, singular ignored", eq(norm.phones, ["13800138000", "13700137000"]));
  // business 去重 + 剔除与主字段完全相等的项（依赖 websites 已抽出）
  case_("normalize dedupes business and drops main-field dups", eq(norm.business, ["电子元器件"]));
  // back_extra：normalize 只剔除与主字段完全相等的项；数组项会过 stripLabel
  // 已知怪癖（Golden Master 原行为，不改）："微信客服" 的"微信"前缀会被 stripLabel 剥掉 -> "客服"
  case_("normalize back_extra dedupe only", eq(norm.back_extra, ["二维码提示", "扫码关注", "广东省深圳市南山区xxx", "客服"]));

  // ---- rawIncludes ----
  case_("rawIncludes ignores whitespace", rawIncludes("电话：138 0013 8000", "13800138000") === true);
  case_("rawIncludes false for absent", rawIncludes("abc", "xyz") === false);

  // ---- cleanMultiline ----
  case_("cleanMultiline joins and cleans", cleanMultiline("  a \r\n\r\n b \n ") === "a\nb");

  // ---- parseJsonFromText ----
  case_("parseJsonFromText plain JSON", eq(parseJsonFromText('{"a":1}'), { a: 1 }));
  case_("parseJsonFromText markdown", eq(parseJsonFromText('```json\n{"a":1}\n```'), { a: 1 }));
  case_("parseJsonFromText with explanation", eq(parseJsonFromText('结果是：{"a":1} 就是这样'), { a: 1 }));
  case_("parseJsonFromText garbage -> {}", eq(parseJsonFromText("hello world"), {}));
  case_("parseJsonFromText empty -> {}", eq(parseJsonFromText(""), {}));

  // ---- mergeTwoFields（追加语义）----
  var base = normalizeFields({ name: "张三", phones: "13800138000", business: ["电子元器件"] });
  var extra = normalizeFields({ name: "李四", phones: "13700137000", business: ["电子元器件", "智能硬件"] });
  var merged = mergeTwoFields(base, extra);
  case_("mergeTwo keeps existing name", merged.name === "张三");
  case_("mergeTwo appends phones dedupe", eq(merged.phones, ["13800138000", "13700137000"]));
  case_("mergeTwo appends business dedupe", eq(merged.business, ["电子元器件", "智能硬件"]));

  // ---- mergeFields（本地优先 + AI 只补空/必须命中原文）----
  var raw = "张三 深圳市华创科技有限公司 电话 13800138000 主营 电子元器件 深圳市南山区xxx路1号楼";
  var rule = normalizeFields({ name: "张三", company_cn: "深圳市华创科技有限公司", phones: "13800138000", business: ["电子元器件"] });
  var aiOk = normalizeFields({ name: "张三", title: "销售经理", phones: "13800138001", addresses: ["深圳市南山区xxx路1号楼"], business: ["电子元器件", "智能硬件"] });
  var asis = mergeFields(rule, aiOk, raw);
  case_("merge keeps local name", asis.name === "张三");
  // 真实语义：补空字段不要求原文命中；替换已有值才要求命中原文
  case_("merge AI fills missing title (fill-empty no raw required)", asis.title === "销售经理");
  case_("merge AI phone not in raw is dropped", eq(asis.phones, ["13800138000"]));
  case_("merge AI address passes isAddressLine+raw", eq(asis.addresses, ["深圳市南山区xxx路1号楼"]));
  case_("merge AI business only raw+isBusinessLine", eq(asis.business, ["电子元器件"]));
  // 替换已有值必须命中原文
  var ruleWithTitle = normalizeFields({ name: "张三", title: "经理" });
  var aiOtherTitle = normalizeFields({ title: "销售总监" });
  var replaced = mergeFields(ruleWithTitle, aiOtherTitle, "张三 经理 13800138000");
  case_("merge keeps existing title when AI value not in raw", replaced.title === "经理");
  var aiFake = normalizeFields({ business: ["服务器、内存条"], addresses: ["某某科技园"] });
  var mergedFake = mergeFields(rule, aiFake, "张三 深圳市华创科技有限公司 电话 13800138000 主营 电子元器件");
  case_("merge rejects AI values not in raw", eq(mergedFake.business, ["电子元器件"]) && eq(mergedFake.addresses, []));

  // ---- 输出 ----
  var summary = failures === 0 ? "ALL-PASS (" + results.length + ")" : "FAIL " + failures + "/" + results.length;
  var lines = results.join("\n");
  try {
    document.title = "zy-tests: " + summary;
    var out = document.getElementById("zy_test_result");
    if (out) out.textContent = summary + "\n" + lines;
  } catch (_e) { /* Node 环境跳过 DOM */ }
  if (typeof console !== "undefined") console.info("[field-core tests]", summary);
})();