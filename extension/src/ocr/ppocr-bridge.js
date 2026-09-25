// =====================================================================
// 折立印名片套版助手 - PP-OCRv6 页面世界桥（Stage 12 M3c）
// ---------------------------------------------------------------------
// 职责（单一职责）：生成「沙箱 ↔ 页面世界」之间的纯文本契约，避免手写长字符串埋雷：
//   1. buildPpocrRequest(opts)          → 沙箱 postMessage 的请求对象（字段唯一来源 PPOCR_REQUEST_KEYS）
//   2. parsePpocrRequest(msg)           → 请求解析 + 校验（与 1 同源，字段不漂移）
//   3. buildPpocrExecutorSource(opts)   → 页面世界执行器源码（内联 ORT + ppocr 模块 + 消息驱动）
//   4. parsePpocrResult(raw)            → 结果解析 + 归一（成功/失败都带 err，兼容既有本地失败分支）
// 为什么独立成模块：执行器是「字符串代码」，离线可测（new Function 语法校验 + 字段/属性契约断言）
//   —— 历史上已有「括号不平衡 → 脚本未执行 → 死等超时」的教训，故把语法/字段纳入单测护栏。
// 契约（页面世界动作，全部复用既有已验证实现）：
//   createOrtSessions({ort, assets:{det,rec,cls}, ortEnv:{numThreads:1, proxy:false, wasmPaths}})
//   buildRecCharset(dict, {useSpaceChar:false})   ← PP-OCRv6 字典第 617 行本身含全角空格（实测必须 false）
//   createPaddleOcrProvider({session, charset, tier, channelOrder:'bgr'}) → recognize(image,{scenario:'card'})
//   结果写 document.documentElement 属性（主链 = 主桥属性；sidecar = sidecar 桥属性）
// 纯函数、自包含（无 require/无 DOM/无网络）；node 可单测。
// =====================================================================
"use strict";

var PPOCR_REQUEST_SOURCE = "zy-ppocr-req";
var PPOCR_REQUEST_KEYS = ["dataUrl", "dict", "tier", "ortDist", "det", "rec", "cls"];
var PPOCR_OPTIONAL_KEYS = { cls: 1 };
var PPOCR_DEFAULT_ATTRS = {
  mainAttr: "data-zy-ocr-result",
  sideAttr: "data-zy-sidecar-result",
  readyAttr: "data-zy-ppocr-ready"
};
var PPOCR_TARGETS = { main: 1, sidecar: 1 };
// provider 依赖函数名（= ppocr-provider.ppocrResolveDeps 的 10 个 pick 键）
// 为什么执行器必须显式注入：执行器是 IIFE，模块顶层函数声明只在该作用域内可见，
// provider 的 globalThis 探测在页面世界拿不到（M3c 真实浏览器实测 provider:DEPS_MISSING）。
// 走官方注入点 ops：不污染宿主页面全局、无 eval（CSP 安全）。
var PPOCR_DEP_NAMES = [
  "resolveDetParams", "planDetResize", "dbDetPostprocess", "mapDetBoxesToImage", "buildDetTensor",
  "buildRecTensor", "buildClsTensor", "rectFromPolygon", "ctcGreedyDecode", "clsDecode"
];

function zyBrIsNum(v) { return typeof v === "number" && isFinite(v); }

// 执行器 → 沙箱：结果归一（ok/err/lines/words/w/h/boxes/ms）
function ppocrFail(code, message) {
  return { ok: false, code: code, message: String(message == null ? code : message).slice(0, 200) };
}

// ---- 1. 请求构造（沙箱侧；attrs 由调用方传入，保持与执行器一致） ----
// opts: {target:"main"|"sidecar", dataUrl, dict, tier, ortDist, assets:{det,rec,cls}, source?}
function buildPpocrRequest(opts) {
  var o = opts || {};
  var target = PPOCR_TARGETS[o.target] ? o.target : "main";
  var assets = o.assets || {};
  return {
    source: o.source || PPOCR_REQUEST_SOURCE,
    target: target,
    dataUrl: o.dataUrl != null ? o.dataUrl : null,
    dict: o.dict != null ? o.dict : null,
    tier: o.tier || "tiny",
    ortDist: o.ortDist != null ? o.ortDist : null,
    det: (assets.det && assets.det.buffer) ? assets.det.buffer : null,
    rec: (assets.rec && assets.rec.buffer) ? assets.rec.buffer : null,
    cls: (assets.cls && assets.cls.buffer) ? assets.cls.buffer : null
  };
}

// ---- 2. 请求解析（与 1 同源字段表；执行器内联的是同一校验逻辑的生成文本） ----
function parsePpocrRequest(msg) {
  var d = msg || {};
  if (d.source !== PPOCR_REQUEST_SOURCE) return ppocrFail("REQUEST_SOURCE_MISMATCH", String(d.source));
  for (var i = 0; i < PPOCR_REQUEST_KEYS.length; i += 1) {
    var k = PPOCR_REQUEST_KEYS[i];
    if (d[k] == null && !PPOCR_OPTIONAL_KEYS[k]) return ppocrFail("REQUEST_MISSING_" + k.toUpperCase(), k);
  }
  if (!d.dataUrl || !d.dict) return ppocrFail("REQUEST_EMPTY_PAYLOAD", "dataUrl/dict 为空");
  if (!d.det || !d.rec) return ppocrFail("REQUEST_MODEL_MISSING", "det/rec 字节缺失");
  return {
    ok: true,
    target: PPOCR_TARGETS[d.target] ? d.target : "main",
    dataUrl: d.dataUrl,
    dict: d.dict,
    tier: d.tier || "tiny",
    ortDist: d.ortDist || null,
    det: d.det,
    rec: d.rec,
    cls: d.cls || null
  };
}

// ---- 3. 结果解析（沙箱侧；err 字段与既有本地失败分支兼容） ----
function parsePpocrResult(raw) {
  var r = null;
  if (typeof raw === "string") {
    try { r = JSON.parse(raw); } catch (e) { return ppocrFail("RESULT_NOT_JSON", e && e.message); }
  } else {
    r = raw;
  }
  if (!r || typeof r !== "object") return ppocrFail("RESULT_INVALID", "空结果");
  if (!r.ok) return ppocrFail(r.code || "ENGINE_FAILED", r.err || r.message || "未知失败");
  var lines = Array.isArray(r.lines) ? r.lines : [];
  var out = [];
  for (var i = 0; i < lines.length; i += 1) {
    var l = lines[i];
    if (!l || l.text == null || !l.bbox) continue;
    if (!String(l.text).trim()) continue; // 空行对下游无意义（与 unifyCandidates 语义一致：无文字不产候选）
    out.push({
      text: String(l.text),
      bbox: l.bbox,
      confidence: zyBrIsNum(l.confidence) ? l.confidence : null,
      rotation: zyBrIsNum(l.rotation) ? l.rotation : null
    });
  }
  return {
    ok: true,
    engine: r.engine || "ppocr",
    lines: out,
    words: Array.isArray(r.words) ? r.words : [],
    width: zyBrIsNum(r.w) ? r.w : null,
    height: zyBrIsNum(r.h) ? r.h : null,
    boxes: zyBrIsNum(r.boxes) ? r.boxes : null,
    elapsed: zyBrIsNum(r.ms) ? r.ms : null
  };
}

// 生成执行器内的校验片段（由 PPOCR_REQUEST_KEYS 派生 → 字段表单一来源）
function buildRequestGuardSource() {
  var required = PPOCR_REQUEST_KEYS.filter(function (k) { return !PPOCR_OPTIONAL_KEYS[k]; });
  return "var zyNeed=" + JSON.stringify(required) + ";for(var i=0;i<zyNeed.length;i+=1){if(d[zyNeed[i]]==null){zyFail(attr,'request-missing:'+zyNeed[i]);return;}}if(!d.dataUrl||!d.dict){zyFail(attr,'request-empty');return;}";
}

// 生成执行器内的依赖注入片段（typeof 保护：模块缺失 → null，由 provider 明确报 DEPS_MISSING 而非崩溃）
function buildOpsSource() {
  return "var ZY_OPS={};" + PPOCR_DEP_NAMES.map(function (n) {
    return "ZY_OPS." + n + "=(typeof " + n + "==='function')?" + n + ":null;";
  }).join("");
}

// ---- 4. 执行器源码（页面世界） ----
// opts: {
//   ortText: string, modulesText: string,        // 必需：内联的 ORT 与 ppocr 模块源码
//   mainAttr/sideAttr/readyAttr: string,         // 缺省用 PPOCR_DEFAULT_ATTRS
//   requestSource: string,                       // 缺省 PPOCR_REQUEST_SOURCE
//   onStatus?: boolean                           // 预留（当前执行器不回调沙箱控制台）
// }
function buildPpocrExecutorSource(opts) {
  var o = opts || {};
  var mainAttr = o.mainAttr || PPOCR_DEFAULT_ATTRS.mainAttr;
  var sideAttr = o.sideAttr || PPOCR_DEFAULT_ATTRS.sideAttr;
  var readyAttr = o.readyAttr || PPOCR_DEFAULT_ATTRS.readyAttr;
  var source = o.requestSource || PPOCR_REQUEST_SOURCE;
  if (typeof o.ortText !== "string" || typeof o.modulesText !== "string") {
    throw new Error("PPOCR_EXECUTOR_INPUT_INVALID");
  }
  var s = [];
  s.push("(function(){");
  s.push("\"use strict\";");
  s.push("var module={exports:{}};var exports=module.exports;var define;var require;");
  s.push(o.ortText);
  s.push("\nvar ZY_ORT=(module.exports&&module.exports.InferenceSession)?module.exports:((typeof window!=='undefined'&&window.ort)||(typeof globalThis!=='undefined'&&globalThis.ort)||null);");
  s.push("module={exports:{}};exports=module.exports;");
  s.push(o.modulesText);
  s.push("\nvar ZY_SESS=null;var ZY_MAIN=" + JSON.stringify(mainAttr) + ";var ZY_SIDE=" + JSON.stringify(sideAttr) + ";var ZY_SRC=" + JSON.stringify(source) + ";");
  s.push(buildOpsSource());
  s.push("function zyPut(a,o){try{document.documentElement.setAttribute(a,JSON.stringify(o));}catch(e){}}");
  s.push("function zyFail(a,c,m){zyPut(a,{ok:false,code:c,message:String(m==null?c:m).slice(0,160),err:String(c)+': '+String(m==null?'':m).slice(0,120)});}");
  s.push("function zyDone(a,payload){zyPut(a,payload);}");
  s.push("window.addEventListener('message',function(ev){");
  s.push("var d=ev.data;if(!d||d.source!==ZY_SRC)return;");
  s.push("var attr=(d.target==='sidecar')?ZY_SIDE:ZY_MAIN;");
  s.push(buildRequestGuardSource());
  s.push("if(!ZY_ORT){zyFail(attr,'ort-missing','ONNX 运行时未就绪');return;}");
  s.push("if(typeof createOrtSessions!=='function'||typeof createPaddleOcrProvider!=='function'||typeof buildRecCharset!=='function'){zyFail(attr,'modules-missing','ppocr 模块未注入');return;}");
  // 会话一次性创建（同页复用；单线程 + 不建 worker，规避 CSP worker-src 限制）
  s.push("var go=ZY_SESS?Promise.resolve(ZY_SESS):createOrtSessions({ort:ZY_ORT,assets:{det:new Uint8Array(d.det),rec:new Uint8Array(d.rec),cls:d.cls?new Uint8Array(d.cls):null},ortEnv:{numThreads:1,proxy:false,wasmPaths:d.ortDist}}).then(function(r){if(!r.ok){throw new Error('sessions:'+(r.errorCode||'')+' '+JSON.stringify(r.errors||[]).slice(0,140));}ZY_SESS=r.sessions;return ZY_SESS;});");
  s.push("go.then(function(sess){");
  s.push("var cs=buildRecCharset(d.dict,{useSpaceChar:false});");
  s.push("if(!cs.ok){zyFail(attr,'charset-invalid','字典为空');return;}");
  s.push("var im=new Image();");
  s.push("im.onload=function(){try{");
  s.push("var cv=document.createElement('canvas');cv.width=im.naturalWidth||im.width;cv.height=im.naturalHeight||im.height;");
  s.push("var g=cv.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);");
  s.push("var idata=g.getImageData(0,0,cv.width,cv.height);");
  s.push("var provider=createPaddleOcrProvider({session:sess,charset:cs.charset,tier:d.tier||'tiny',channelOrder:'bgr',ops:ZY_OPS});");
  s.push("provider.recognize({data:idata.data,width:cv.width,height:cv.height,channels:4},{scenario:'card'}).then(function(r){");
  s.push("if(r&&r.error){zyFail(attr,'provider:'+r.error.errorCode,r.error.errorMessage);return;}");
  s.push("var lines=(r.candidates||[]).map(function(c){return {text:c.text,bbox:c.bbox,confidence:c.confidence,rotation:c.rotation};});");
  s.push("zyDone(attr,{ok:true,engine:'ppocr',lines:lines,words:[],w:cv.width,h:cv.height,boxes:(r.meta&&r.meta.det&&r.meta.det.boxes)||0,ms:(r.meta&&r.meta.elapsed)||0,candidates:(r.candidates||[]).length});");
  s.push("}).catch(function(e){zyFail(attr,'recognize',String(e&&e.message||e));});");
  s.push("}catch(e){zyFail(attr,'draw',String(e&&e.message||e));}};");
  s.push("im.onerror=function(){zyFail(attr,'image-load','图片解码失败');};");
  s.push("im.src=d.dataUrl;");
  s.push("}).catch(function(e){zyFail(attr,'engine',String(e&&e.message||e));});");
  s.push("});");
  s.push("document.documentElement.setAttribute(" + JSON.stringify(readyAttr) + ",'1');");
  s.push("})();");
  return s.join("");
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  PPOCR_REQUEST_SOURCE: PPOCR_REQUEST_SOURCE,
  PPOCR_REQUEST_KEYS: PPOCR_REQUEST_KEYS,
  PPOCR_DEFAULT_ATTRS: PPOCR_DEFAULT_ATTRS,
  PPOCR_DEP_NAMES: PPOCR_DEP_NAMES,
  buildPpocrRequest: buildPpocrRequest,
  parsePpocrRequest: parsePpocrRequest,
  parsePpocrResult: parsePpocrResult,
  buildRequestGuardSource: buildRequestGuardSource,
  buildOpsSource: buildOpsSource,
  buildPpocrExecutorSource: buildPpocrExecutorSource
};
