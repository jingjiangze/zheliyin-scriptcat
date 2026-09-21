// =====================================================================
// 折立印名片套版助手 - Editor 边界（页面侧 Bridge，Stage 3）
// ---------------------------------------------------------------------
// 单一事实来源：与 field-core/config-core/ai-client 同模式（userscript
// @require / 扩展 manifest 按序加载 / exe 内嵌 extension/ 目录）。
// 职责：页面侧编辑器能力的唯一实现（canvas 定位 / 文字层读取与匹配 /
// 文字层创建与样式克隆 / 助手层清理 / probe 只读自检）。
// 本模块页面码保持与 Golden Master（main 6c19b46，v0.3.0.0）逐字一致，
// 注入方式不变（内容侧 installPageBridge 以 pageBridge.toString() 注入页面）。
// 约束：只读自检（probe）不得修改画布；不得包含字段业务/分面/merge。
// =====================================================================
"use strict";

// 页面注入入口：消息协议与主脚本 BRIDGE_SOURCE/PAGE_SOURCE 保持兼容，
// 未引入 requestId（当前调用严格串行，见 STAGE_3_REPORT §20/§21）。
function pageBridge() {
    // Stage 4.0（AUDIT-BRIDGE-002, P1）：跨 userscript 实例幂等 —— 页面主世界稳定 marker。
    // 同窗口内任何实例/热更新/重复执行的注入只会安装一次 listener；页面刷新后 window 重置自动重建。
    // （升级兼容：旧版本注入的 bridge 未设置 marker，热升级瞬间可能共存双 listener——见 STAGE_4.0_AUDIT 记录，属一次性的低概率窗口。）
    if (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) return;
    const BRIDGE_SOURCE_IN_PAGE = "zy-card-assistant";
    const PAGE_SOURCE_IN_PAGE = "zy-card-assistant-page";
    window.addEventListener("message", function (event) {

    // Stage 9 P4-D：Editor Actual Ink 测量（复用 ink-measure/measureFabricObjectInk；不可用返回 null，行为不变）
    function measureFabInkFor(obj) {
      try {
        if (!window.__zy8dInk || typeof window.__zy8dInk.measureFabricObjectInk !== 'function' || !obj) return null;
        var r = window.__zy8dInk.measureFabricObjectInk(obj);
        return (r && r.ok && typeof r.inkHeight === 'number') ? { inkWidth: r.inkWidth, inkHeight: r.inkHeight, lineCount: r.lineCount != null ? r.lineCount : null, method: r.method || null } : null;
      } catch (e) { return null; }
    }
      if (event.source !== window || !event.data || event.data.source !== BRIDGE_SOURCE_IN_PAGE) return;
      if (event.data.type === "probe") {
        post("probeResult", buildProbeResult());
        return;
      }
      if (event.data.type === "apply") {
        const side = event.data.side || "front";
        if (side === "both") {
          const frontCanvas = findCanvasForSide("front");
          const backCanvas = findCanvasForSide("back");
          const results = [];
          if (frontCanvas) results.push(applyFields(frontCanvas, event.data.fields || {}, "front"));
          if (backCanvas) results.push(applyFields(backCanvas, event.data.fields || {}, "back"));
          const applied = [];
          results.forEach(function (result) { applied.push.apply(applied, result.applied || []); });
          if (applied.length) post("applyResult", { ok: true, applied: applied });
          else post("applyResult", { ok: false, message: "未找到正反面可填入的文字图层。", applied: [] });
          return;
        }
        const canvas = findCanvasForSide(side);
        if (!canvas) {
          post("applyResult", { ok: false, message: "未找到" + (side === "back" ? "反面" : "正面") + "画布，请等待模板加载完成。", applied: [] });
          return;
        }
        post("applyResult", applyFields(canvas, event.data.fields || {}, side));
      }
      if (event.data.type === "ocrCreate") {
        // Stage 5.5A-R2（Demo）：OCR 重建入口 —— 按 OCR TextBlock 在正面画布创建真实 textbox。
        // Stage 5.6 P0（真机 BUILDING 卡死）：任何创建异常都必须兜底回复，禁止让调用方死等。
        // Stage 6.1 §16/§17：事务语义 —— 1 TextBlock = 1 textbox（§8 硬规则）；
        //   任一 block 创建失败 → 全量回滚本批已建对象 → 恢复创建前状态 → created=0，
        //   回复 {ok, detectedBlocks, createdCount, created[], failedBlockIndex, error}。
        // Stage 6 P0（2026-09-17 强制补充）：OCR 对象必须尽量接入编辑器对象模型/历史
        //   —— 用编辑器原生生成器（sundry.guid）赋 multiUuid，镜像 location*/printLocation*/
        //   mediaMediaType/layerNum 等编辑器业务字段（§七/§八），并在创建前后尝试调用
        //   原生 Undo.getInstance().save()（仅使用编辑器自身 API，不伪造历史，§十三）。
        // Stage 7.7（Page Ownership，2026-09-18）：显式 sourcePageId → 创建前硬门禁。
        // sourcePageId === 激活页才允许创建；否则 CREATE_BLOCKED_PAGE_NOT_FOUND /
        // CREATE_BLOCKED_PAGE_UNKNOWN / CREATE_BLOCKED_PAGE_IDENTITY_CONFLICT /
        // CREATE_BLOCKED_WRONG_PAGE → 立即 STOP。
        // 绝对禁止：fallback FRONT / 静默写当前激活页 / 跨页创建。
        // 旧调用（无 pageId）保留兼容：走下方既有 Current Page Resolver（Stage 7.1 行为）。
        const sourcePageId = event.data.pageId || null;
        const sourceSide = event.data.side || null;
        // Stage 9 V4 P1（§三/§四）：OCR Transaction Identity —— transactionId/imageFingerprint 从调用方冻结，
        // 随对象 key / 对象身份 / 回复逐级透传（正反面各自独立 Session，禁跨页共享）。
        const txId = event.data.transactionId || null;
        const txFp = event.data.imageFingerprint || null;
        if (sourcePageId) {
          const inv = buildPageInventory();
          const known = inv.ok && (inv.pages || []).some(function (p) { return p.pageId === sourcePageId; });
          if (!known) {
            post("ocrCreateResult", { ok: false, code: "CREATE_BLOCKED_PAGE_NOT_FOUND", message: "OCR 结果属于未知页面（" + sourcePageId + "），已停止创建（CREATE_BLOCKED_PAGE_NOT_FOUND）。", detectedBlocks: Array.isArray(event.data.items) ? event.data.items.length : 0, createdCount: 0, created: [], failedBlockIndex: null, error: "CREATE_BLOCKED_PAGE_NOT_FOUND", editorIntegration: { mode: "page-gate-blocked", gate: { sourcePageId: sourcePageId, reason: "page not found in inventory", activePageId: null } } });
            return;
          }
          const curPage = buildCurrentPageInfo();
          const gate = validatePageOwnership(sourcePageId, curPage);
          if (!gate.ok) {
            post("ocrCreateResult", {
              ok: false, code: gate.code,
              message: "OCR 结果属于 " + sourcePageId + "，但当前激活页为 " + (curPage && curPage.ok ? curPage.pageId : ("unknown(" + ((curPage && curPage.code) || "CURRENT_PAGE_UNKNOWN") + ")")) + "，已停止跨页创建（" + gate.code + "）。请先切回源页面后再点击识别。",
              detectedBlocks: Array.isArray(event.data.items) ? event.data.items.length : 0,
              createdCount: 0, created: [], failedBlockIndex: null, error: gate.code,
              editorIntegration: { mode: "page-gate-blocked", gate: { sourcePageId: sourcePageId, sourceSide: sourceSide, activePageId: curPage && curPage.pageId ? curPage.pageId : null, activeSide: curPage && curPage.side ? curPage.side : null, currentCanvasNum: curPage && curPage.currentCanvasNum != null ? curPage.currentCanvasNum : null, reason: gate.reason } }
            });
            return;
          }
        }
        // Stage 7.1：OCR 创建入口 —— 由 Current Page Resolver 判定「当前实际编辑页面」。
        // CURRENT_PAGE_UNKNOWN → 停止创建；严禁静默写入 front。
        const resolution = resolveCurrentEditorPage();
        if (!resolution || resolution.status !== "ok") {
          const reason = (resolution && resolution.reason) || "resolver failed";
          post("ocrCreateResult", { ok: false, code: "CURRENT_PAGE_UNKNOWN", message: "无法识别当前编辑页面（" + reason + "），已停止创建。", detectedBlocks: 0, createdCount: 0, created: [], failedBlockIndex: null, error: "CURRENT_PAGE_UNKNOWN", editorIntegration: resolution || { mode: "stopped-unknown-page" } });
          return;
        }
        const canvas = resolution.canvas;
        if (!canvas) { post("ocrCreateResult", { ok: false, code: "CURRENT_PAGE_UNKNOWN", message: "当前编辑页画布不可用，已停止创建。", detectedBlocks: 0, createdCount: 0, created: [], failedBlockIndex: null, error: "CURRENT_PAGE_UNKNOWN" }); return; }
        const items = Array.isArray(event.data.items) ? event.data.items : [];
        // =====================================================================
        // Stage 6.2 §十二~§十七：Native-first —— OCR 创建改走编辑器原生新增文字入口。
        // 找到 252438 真机原生入口：CanvasDiy.drawText(text, fontSize, left, top, mediaJson, layerNum)
        //   → createObjProductJsonDetail（media→身份/样式字段）+ canvas.add + 图层注册
        //     （canvasObjInfo.canvasToProductObjArr.push）+ 原生 uuid + checkObjsInProductJson。
        // OCR 只提供 text/position/size/style（media JSON），身份字段由原生流程负责（§十七）。
        // 原生路径不可用时回退到下方既有镜像路径（Level 1-2），并在 editorIntegration.mode 标明。
        // =====================================================================
        // ---- Stage 9 Commit 6：Native Anchor Resolver（页面世界镜像）----
        // 单一事实来源 = extension/src/editor/native-anchor-matcher.js（node 纯模块 + 单测）。
        // 本处为 page-world 运行时镜像，逻辑逐字一致：page 门控 + 多因子打分 + MATCH/UNCERTAIN/NO_MATCH。
        function zyScriptType(t) { const s = String(t == null ? "" : t); let cjk = 0, latin = 0, digit = 0; for (let i = 0; i < s.length; i += 1) { const c = s.charCodeAt(i); if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff)) cjk += 1; else if (c >= 0x30 && c <= 0x39) digit += 1; else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin += 1; else if (c > 0x20 && c !== 0x2e && c !== 0x3a && c !== 0x2d && c !== 0x40 && c !== 0x2f) latin += 1; } if (!s.trim()) return "empty"; if (cjk && !latin && !digit) return "cjk"; if (latin && !cjk && !digit) return "latin"; if (digit && !cjk && !latin) return "digit"; return "mixed"; }
        function zyAnchorCollect(canvas, pageId, side) {
          const anchors = [];
          try { if (typeof canvas.setCoords === "function") canvas.setCoords(); } catch (e) {}
          (canvas.getObjects() || []).forEach(function (o) {
            if (!o) return;
            const ty = String(o.type || "");
            if (ty !== "textbox" && ty !== "i-text" && ty !== "text") return;
            try { if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
            const ac = o.aCoords;
            if (!ac || !ac.tl || !ac.br) return;
            const cx = (ac.tl.x + ac.tr.x + ac.br.x + ac.bl.x) / 4, cy = (ac.tl.y + ac.tr.y + ac.br.y + ac.bl.y) / 4;
            const vw = (Math.hypot(ac.tr.x - ac.tl.x, ac.tr.y - ac.tl.y) + Math.hypot(ac.br.x - ac.bl.x, ac.br.y - ac.bl.y)) / 2;
            const vh = (Math.hypot(ac.bl.x - ac.tl.x, ac.bl.y - ac.tl.y) + Math.hypot(ac.br.x - ac.tr.x, ac.br.y - ac.tr.y)) / 2;
            let ink = null; try { ink = measureFabInkFor(o); } catch (e) {}
            anchors.push({ pageId: pageId, side: side, sourceText: { rawText: typeof o.text === "string" ? o.text : null }, style: { fontSize: typeof o.fontSize === "number" ? o.fontSize : null, fontFamily: o.fontFamily != null ? String(o.fontFamily) : null }, geometry: { center: { x: cx, y: cy }, visualWidth: vw, visualHeight: vh }, actualInk: { lineCount: ink ? ink.lineCount : null }, layerNum: typeof o.layerNum === "number" ? o.layerNum : null, identity: { uuid: o.uuid != null ? String(o.uuid) : null, multiUuid: o.multiUuid != null ? String(o.multiUuid) : null }, object: o });
          });
          return anchors;
        }
        function zyAnchorMatch(anchors, block) {
          const MATCH_THRESHOLD = 0.55, UNCERTAIN_MARGIN = 0.15;
          const nz = function (v) { return (typeof v === "number" && isFinite(v)) ? v : null; };
          const sType = function (t) { try { return zyScriptType(t); } catch (e) { return "unknown"; } };
          const shapeSim = function (a, b) { const sa = String(a == null ? "" : a), sb = String(b == null ? "" : b); if (!sa && !sb) return 1; const lenSim = 1 / (1 + Math.abs(sa.length - sb.length) / 8); const scSim = sType(sa) === sType(sb) ? 1 : 0.4; return lenSim * 0.6 + scSim * 0.4; };
          const fsSim = function (x, y) { const fx = nz(x), fy = nz(y); if (fx == null || fy == null || fx <= 0 || fy <= 0) return 0.5; return 1 / (1 + Math.abs(Math.log(fx) - Math.log(fy)) * 4); };
          const styleSim = function (bl, an) { const f = fsSim(bl.fontSize, an.style.fontSize); let fam = 0.5; const bf = String(bl.fontFamily || ""), af = String(an.style.fontFamily || ""); if (bf && af) { const bl2 = bf.split(/[\s,]/).filter(Boolean).pop() || ""; const al2 = af.split(/[\s,]/).filter(Boolean).pop() || ""; fam = (bl2 && al2 && bl2 === al2) ? 1 : 0.3; } else if (!bf && !af) fam = 0.5; return f * 0.7 + fam * 0.3; };
          const layerSim = function (bl, an) { const b = nz(bl.layerNum), a = nz(an.layerNum); if (b == null || a == null) return 0.5; return 1 / (1 + Math.abs(b - a) * 2); };
          const sizeSim = function (an, bl) { const aw = nz(an.geometry.visualWidth), ah = nz(an.geometry.visualHeight), bw = nz(bl.width), bh = nz(bl.height); if (aw == null || ah == null || bw == null || bh == null || aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0.5; return ((Math.min(aw, bw) / Math.max(aw, bw)) + (Math.min(ah, bh) / Math.max(ah, bh))) / 2; };
          const scores = [];
          (anchors || []).forEach(function (an, i) {
            let gate = "PASS";
            if (!an.pageId || !block.pageId || an.pageId !== block.pageId) gate = "PAGE_MISMATCH";
            else if (!an.side || !block.side || an.side !== block.side) gate = "SIDE_MISMATCH";
            if (gate !== "PASS") return;
            const c = an.geometry.center;
            const d = Math.hypot(block.center.x - c.x, block.center.y - c.y);
            const scale = nz(an.geometry.visualWidth) != null && nz(an.geometry.visualWidth) > 0 ? nz(an.geometry.visualWidth) : 100;
            const spatial = 1 / (1 + d / scale);
            const sh = shapeSim(block.sourceText, an.sourceText.rawText);
            const st = styleSim(block, an);
            const lay = layerSim(block, an);
            const sz = sizeSim(an, block);
            const total = spatial * 0.35 + sz * 0.15 + st * 0.12 + sh * 0.15 + 0.08 + lay * 0.15;
            scores.push({ anchorIndex: i, total: Math.round(total * 10000) / 10000, factors: { spatial: Math.round(spatial * 10000) / 10000, size: sz, shape: sh, style: st, layer: lay } });
          });
          if (!scores.length) return { verdict: "NO_MATCH", reason: "page-gate: no candidate", matchedIndex: null, matchScore: null, margin: null };
          const sorted = scores.slice().sort(function (x, y) { return y.total - x.total; });
          const best = sorted[0], second = sorted[1];
          const margin = second ? best.total - second.total : 1;
          if (best.total < MATCH_THRESHOLD) return { verdict: "NO_MATCH", reason: "below-threshold", matchedIndex: best.anchorIndex, matchScore: best.total, margin: margin };
          if (margin >= UNCERTAIN_MARGIN) return { verdict: "MATCH", reason: "unique-winner-with-margin", matchedIndex: best.anchorIndex, matchScore: best.total, margin: margin };
          return { verdict: "NATIVE_ANCHOR_UNCERTAIN", reason: "runner-up-too-close", matchedIndex: best.anchorIndex, matchScore: best.total, margin: margin };
        }
        const diy = resolution.canvasDiy;
        if (diy) {
          const editorInteg2 = { mode: "native", nativeUndoFound: false, undoSavePre: false, undoSavePost: false, drawTextBatch: 0, failedBlockIndex: -1, layerNumBase: diy.canvasObjInfo.canvasToProductObjArr.length, identityApplied: 0, uv4Total: 0, layerMax: -1 };
          try {
            const U2 = getNativeUndoInstance();
            if (U2 && typeof U2.save === "function") { editorInteg2.nativeUndoFound = true; U2.save(); editorInteg2.undoSavePre = true; }
          } catch (eUndoNat) {}
          const fontId = getEditorDefaultFontId();
          // Commit 6：创建前一次性解析当前页原生 textbox 为 Anchor（P0 aCoords；只读）
          const nativeAnchors = zyAnchorCollect(diy.canvas, sourcePageId, sourceSide || null);
          let createdNat = [];
          const batchNat = [];
          let failedBlockIndex = null;
          let failMsg = "";
          try {
            for (let idx = 0; idx < items.length; idx += 1) {
              const it = items[idx];
              const layerNum = editorInteg2.layerNumBase + idx;
              // Commit 6：Native Anchor Resolver —— MATCH → 复用现有 textbox（以 Native OCR text truth 更新文本，保留原生身份/位置/样式）；
              //   UNCERTAIN → 禁止强制复用（走创建）；NO_MATCH / 无 anchor → 走原生创建。
              if (!editorInteg2.anchorResolver) { editorInteg2.anchorResolver = { anchorCount: 0, reused: 0, created: 0, uncertain: 0, unmatched: 0 }; }
              if (nativeAnchors && nativeAnchors.length) {
                if (editorInteg2.anchorResolver.anchorCount === 0) editorInteg2.anchorResolver.anchorCount = nativeAnchors.length;
                const blkCx = (it.left != null ? it.left : 0) + (it.width || 0) / 2;
                const blkCy = (it.top != null ? it.top : 0) + (it.height || 0) / 2;
                const block = { pageId: sourcePageId, side: sourceSide || null, sourceText: String(it.text || ""), center: { x: blkCx, y: blkCy }, width: it.width != null ? it.width : null, height: it.height != null ? it.height : null, fontSize: it.fontSize != null ? it.fontSize : null, fontFamily: it.fontFamily || null, layerNum: layerNum };
                const reuseMatch = zyAnchorMatch(nativeAnchors, block);
                if (reuseMatch.verdict === "MATCH" && reuseMatch.matchedIndex != null && nativeAnchors[reuseMatch.matchedIndex]) {
                  const reusedObj = nativeAnchors[reuseMatch.matchedIndex].object || null;
                  if (reusedObj) {
                    try { if (String(reusedObj.text || "") !== String(it.text || "") && typeof it.text === "string") { if (typeof reusedObj.setText === "function") reusedObj.setText(it.text); else reusedObj.text = it.text; } } catch (eSet) {}
                    try { if (it.fill && typeof reusedObj.set === "function") reusedObj.set({ fill: it.fill }); else if (it.fill) reusedObj.fill = it.fill; } catch (eFillReuse) {} // Stage 10-A：仅在有前景证据时更新颜色
                    const bIdxNat2 = it.blockIndex != null ? it.blockIndex : idx;
                    reusedObj.zyOcrKey = txId ? ("zy-ocr-" + txId + "-" + bIdxNat2) : ("zy-ocr-" + bIdxNat2);
                    reusedObj.zyOcrObjectId = { transactionId: txId, pageId: sourcePageId, blockId: bIdxNat2, objectUuid: reusedObj.uuid || reusedObj.multiUuid || null };
                    try { if (it.diagnostics) reusedObj.zyOcrDiagnostics = it.diagnostics; } catch (eDiag) {}
                    const gRe = measureObjectGeometry(diy.canvas, reusedObj);
                    createdNat.push({ blockIndex: bIdxNat2, objectIndex: diy.canvas.getObjects().indexOf(reusedObj), uuid: reusedObj.uuid || reusedObj.multiUuid || null, text: String(it.text || "").slice(0, 16), pageId: sourcePageId, side: sourceSide, geometry: gRe, reused: true, anchorMatch: { verdict: reuseMatch.verdict, score: reuseMatch.matchScore, margin: reuseMatch.margin } });
                    editorInteg2.anchorResolver.reused += 1;
                    continue;
                  }
                } else if (reuseMatch.verdict === "NATIVE_ANCHOR_UNCERTAIN") {
                  editorInteg2.anchorResolver.uncertain += 1;
                } else {
                  editorInteg2.anchorResolver.unmatched += 1;
                }
              }
              editorInteg2.anchorResolver.created += 1;
              const entry = buildTextMediaEntry(it, layerNum, fontId);
              let obj = null;
              try {
                diy.drawText(String(it.text || ""), null, null, null, entry, layerNum);
                editorInteg2.drawTextBatch += 1;
                obj = findOcrObject(diy, it, layerNum);
                // Stage 10-C：Native Layer Contract 硬校验（创建后立即，§3 A-D；任一失败 → CREATE_NATIVE_LAYER_FAILED + 整批回滚）
                const layerVerify10C = verifyNativeLayer10C(diy, obj, { registryDelta: diy.canvasObjInfo.canvasToProductObjArr.length - editorInteg2.layerNumBase });
                if (!layerVerify10C.ok) {
                  failMsg = "native layer item" + idx + ": " + String(layerVerify10C.failed || []).join("|");
                  failedBlockIndex = idx;
                  break;
                }
                editorInteg2.layerVerified = (editorInteg2.layerVerified || 0) + 1;
                editorInteg2.layerVerify = { code: layerVerify10C.code, product: layerVerify10C.checks && layerVerify10C.checks.product ? layerVerify10C.checks.product.code : null };
                if (obj) {
                  // t4 画后双保险: 原生 drawText 若未透传 entry 顶层字段, 直接补对象字段
                  obj.topEnable = obj.topEnable !== undefined ? obj.topEnable : 1;
                  obj.resourceType = obj.resourceType !== undefined ? obj.resourceType : 0;
                  obj.maskEnable = obj.maskEnable !== undefined ? obj.maskEnable : 0;
                  obj.lowPixelFlag = obj.lowPixelFlag !== undefined ? obj.lowPixelFlag : 0;
                  obj.selectEnabled = obj.selectEnabled !== undefined ? obj.selectEnabled : 1;
                  obj.isDesign = obj.isDesign !== undefined ? obj.isDesign : 1;
                  obj.isComposite = obj.isComposite !== undefined ? obj.isComposite : 0;
                  obj.isPreview = obj.isPreview !== undefined ? obj.isPreview : 0;
                  obj.isDesignShape = obj.isDesignShape !== undefined ? obj.isDesignShape : 0;
                  batchNat.push(obj);
                  if (it.fill && obj.fill !== it.fill) { try { if (typeof obj.set === "function") obj.set({ fill: it.fill }); else obj.fill = it.fill; } catch (eFill) {} } // Stage 10-A：drawText 双保险透传 fill
                  if (typeof obj.multiUuid === "string" && /^[0-9a-fA-F-]{12,}$/.test(obj.multiUuid)) editorInteg2.uv4Total += 1;
                  try { if (it.diagnostics) obj.zyOcrDiagnostics = it.diagnostics; } catch (eDiag) {}
                  // Stage 8B STEP 4（Phase B/C）：测量本对象真实几何 + 业务字段初始同步 + 定位 key
                  // Stage 9 V4 P1（§六）：key 升级 zy-ocr-{transactionId}-{blockIndex}，杜绝正反 blockIndex 碰撞；
                  //   对象同时挂 zyOcrObjectId（transactionId/pageId/blockId/objectUuid 完整身份）。
                  const bIdxNat = it.blockIndex != null ? it.blockIndex : idx;
                  obj.zyOcrKey = txId ? ("zy-ocr-" + txId + "-" + bIdxNat) : ("zy-ocr-" + bIdxNat);
                  obj.zyOcrObjectId = { transactionId: txId, pageId: sourcePageId, blockId: bIdxNat, objectUuid: obj.uuid || obj.multiUuid || null };
                  const gNat = measureObjectGeometry(diy.canvas, obj);
                  syncBusinessFieldsFromObject(obj);
                  createdNat.push({ blockIndex: it.blockIndex != null ? it.blockIndex : idx, objectIndex: diy.canvas.getObjects().indexOf(obj), uuid: obj ? (obj.uuid || obj.multiUuid || null) : null, text: String(it.text || "").slice(0, 16), pageId: sourcePageId, side: sourceSide, geometry: gNat });
                }
              } catch (e2) {
                failMsg = "native item" + idx + ": " + String(e2 && e2.message || e2).slice(0, 120);
                failedBlockIndex = idx;
                break;
              }
            }
          } catch (eBatch) {
            failMsg = "native batch: " + String(eBatch && eBatch.message || eBatch).slice(0, 160);
            failedBlockIndex = failedBlockIndex != null ? failedBlockIndex : (items.length - 1);
          }
          if (failedBlockIndex != null) {
            // §16 事务回滚：移除本批已建对象（canvas + 图层数组），恢复创建前状态
            batchNat.forEach(function (o) {
              try { const li = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o); if (li >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(li, 1); diy.canvas.remove(o); } catch (eR) {}
            });
            createdNat = [];
          }
          try {
            const U2 = getNativeUndoInstance();
            if (U2 && typeof U2.save === "function") { U2.save(); editorInteg2.undoSavePost = true; }
          } catch (eUndoNat2) {}
          if (diy.canvas.requestRenderAll) diy.canvas.requestRenderAll();
          const detectedBlocks = items.length;
          const createdCount = createdNat.length;
          editorInteg2.identityApplied = createdCount;
          post("ocrCreateResult", {
            ok: createdCount === detectedBlocks && detectedBlocks > 0,
            detectedBlocks: detectedBlocks,
            createdCount: createdCount,
            created: createdNat,
            failedBlockIndex: failedBlockIndex,
            error: failMsg || (detectedBlocks === 0 ? "empty items" : undefined),
            pageId: sourcePageId, side: sourceSide,
            transactionId: txId, imageFingerprint: txFp,
            editorIntegration: editorInteg2
          });
          return;
        }
        // Stage 10-C: OCR auto-create is Native-only; diy unavailable => CREATE_NATIVE_UNAVAILABLE stop
        post("ocrCreateResult", {
          ok: false, code: "CREATE_NATIVE_UNAVAILABLE",
          message: "native text entry (CanvasDiy.drawText) unavailable, OCR auto-create stopped",
          detectedBlocks: items.length, createdCount: 0, created: [], failedBlockIndex: 0,
          error: "CREATE_NATIVE_UNAVAILABLE", pageId: sourcePageId, side: sourceSide,
          transactionId: txId, imageFingerprint: txFp,
          editorIntegration: { mode: "native-unavailable", mirrorFallbackForbidden: true }
        });
        return;
      }
      if (event.data.type === "ocrAdjust") {
        // Stage 8B STEP 4（Phase C）：创建后几何自动闭环校正 —— 按定位 key（zyOcrKey）定位本批 OCR 对象，
        // 应用 fontSize/width/height/left/top/angle 修正，重新实测并同步业务字段。
        // 只操作本批创建的 zyOcrKey 对象；无对象时报错不抛异常。
        // Stage 9 V4 P1（§四/§五）：Adjust 同样强制 Page Ownership —— 携带 pageId 的校准请求：
        //   resolvePageInfo(pageId) → 当前页必须仍为 source page（canvas === source page canvas），
        //   current.pageId !== request.pageId → PAGE_IDENTITY_CHANGED → 整批 STOP（禁止自动找另一个画布）；
        //   key 按 transactionId 限定（zy-ocr-{txId}-{blockIndex}），杜绝正反 blockIndex 碰撞。
        // 旧调用（无 pageId/transactionId）保留兼容：走 findCanvasForSide + 旧 key（仅旧探针/测试路径）。
        const adjPageId = event.data.pageId || null;
        const adjTxId = event.data.transactionId || null;
        const adjFp = event.data.imageFingerprint || null;
        const itemsAdj = Array.isArray(event.data.items) ? event.data.items : [];
        let canvasAdj = null;
        if (adjPageId) {
          const invAdj = buildPageInventory();
          const knownAdj = invAdj.ok && (invAdj.pages || []).some(function (p) { return p.pageId === adjPageId; });
          if (!knownAdj) {
            post("ocrAdjustResult", { ok: false, code: "ADJUST_BLOCKED_PAGE_NOT_FOUND", message: "校准请求属于未知页面（" + adjPageId + "），已停止校准（禁止跨页自动找画布）。", items: [], pageId: adjPageId, transactionId: adjTxId, imageFingerprint: adjFp });
            return;
          }
          const curAdj = buildCurrentPageInfo();
          const gateAdj = validatePageOwnership(adjPageId, curAdj);
          if (!gateAdj.ok) {
            // §五：current.pageId !== request.pageId → PAGE_IDENTITY_CHANGED → STOP
            const codeAdj = gateAdj.code === "CREATE_BLOCKED_WRONG_PAGE" ? "PAGE_IDENTITY_CHANGED" : String(gateAdj.code || "ADJUST_BLOCKED").replace(/^CREATE_BLOCKED_/, "ADJUST_BLOCKED_");
            post("ocrAdjustResult", { ok: false, code: codeAdj, message: "校准期间页面已变化或无法验证（" + gateAdj.reason + "），已停止校准（" + codeAdj + "）。请重新识别当前页。", items: [], pageId: adjPageId, transactionId: adjTxId, imageFingerprint: adjFp, activePageId: (curAdj && curAdj.pageId) || null });
            return;
          }
          // 仅允许「当前编辑页面」画布（gate 已保证 === source page canvas），禁止 findCanvasForSide 跨页寻找
          const resoAdj = resolveCurrentEditorPage();
          canvasAdj = (resoAdj && resoAdj.canvas) || null;
          if (!canvasAdj) {
            post("ocrAdjustResult", { ok: false, code: "ADJUST_BLOCKED_CANVAS_UNREADY", message: "当前页画布不可用，已停止校准。", items: [], pageId: adjPageId, transactionId: adjTxId, imageFingerprint: adjFp });
            return;
          }
        } else {
          // 旧调用（无 pageId）：side 定位（仅旧探针/测试兼容）
          canvasAdj = findCanvasForSide(event.data.side || "front");
        }
        const resultsAdj = [];
        itemsAdj.forEach(function (adj) {
          const res = { blockIndex: adj.blockIndex, ok: false, error: null, geometry: null };
          try {
            const idxAdj = adj.blockIndex != null ? adj.blockIndex : -1;
            const key = adjTxId ? ("zy-ocr-" + adjTxId + "-" + idxAdj) : ("zy-ocr-" + idxAdj);
            const objsAdj = canvasAdj ? canvasAdj.getObjects() : [];
            let found = null;
            for (let i = objsAdj.length - 1; i >= 0; i -= 1) { if (objsAdj[i] && objsAdj[i].zyOcrKey === key) { found = objsAdj[i]; break; } }
            if (!found) { res.error = "object-not-found"; resultsAdj.push(res); return; }
            const c = adj.corrections || {};
            const cfg = {};
            if (typeof c.fontSize === "number" && c.fontSize >= 8 && c.fontSize <= 160) cfg.fontSize = c.fontSize;
            if (typeof c.width === "number" && c.width >= 20) cfg.width = c.width;
            if (typeof c.height === "number" && c.height >= 14) cfg.height = c.height;
            if (typeof c.left === "number" && isFinite(c.left)) cfg.left = c.left;
            if (typeof c.top === "number" && isFinite(c.top)) cfg.top = c.top;
            if (typeof c.angle === "number" && isFinite(c.angle)) cfg.angle = c.angle;
            found.set(cfg);
            if (adj.syncBusiness !== false) syncBusinessFieldsFromObject(found);
            res.geometry = measureObjectGeometry(canvasAdj, found);
            res.ink = measureFabInkFor(found); // P4-D：Editor Actual Ink（fontSize 校准依据）
            res.ok = true;
          } catch (eAdj) { res.error = String(eAdj && eAdj.message || eAdj).slice(0, 120); }
          resultsAdj.push(res);
        });
        if (canvasAdj && canvasAdj.requestRenderAll) canvasAdj.requestRenderAll();
        post("ocrAdjustResult", { ok: true, items: resultsAdj, pageId: adjPageId, transactionId: adjTxId, imageFingerprint: adjFp });
        return;
      }
      if (event.data.type === "getTextInventory") {
        // Stage 9 V4 §21/§22：只读 —— 当前编辑页文字对象清单（ExistingTextObjectSnapshot），
        // 供 Recognition Mode Resolver（NEW/CALIBRATION/RETRY）判定；不改画布。
        const resoInv = resolveCurrentEditorPage();
        if (!resoInv || resoInv.status !== "ok" || !resoInv.canvas) {
          post("getTextInventoryResult", { ok: false, code: "CURRENT_PAGE_UNKNOWN", pageId: null, items: [] });
          return;
        }
        const invItems = getTextObjects(resoInv.canvas).map(function (o) {
          const cx = typeof o.left === "number" ? o.left + (typeof o.width === "number" ? o.width / 2 : 0) : null;
          const cy = typeof o.top === "number" ? o.top + (typeof o.height === "number" ? o.height / 2 : 0) : null;
          return {
            objectUuid: o.uuid || o.multiUuid || o.markuuid || null,
            text: String(o.text != null ? o.text : ""),
            left: typeof o.left === "number" ? o.left : null,
            top: typeof o.top === "number" ? o.top : null,
            width: typeof o.width === "number" ? o.width : null,
            height: typeof o.height === "number" ? o.height : null,
            fontSize: typeof o.fontSize === "number" ? o.fontSize : null,
            fontFamily: o.fontFamily != null ? String(o.fontFamily) : null,
            fontWeight: o.fontWeight != null ? String(o.fontWeight) : null,
            fontStyle: o.fontStyle != null ? String(o.fontStyle) : null,
            angle: typeof o.angle === "number" ? o.angle : 0,
            center: (cx != null && cy != null) ? { x: cx, y: cy } : null
          };
        });
        post("getTextInventoryResult", { ok: true, code: "OK", pageId: (function () { const cInv = buildCurrentPageInfo(); return (cInv && cInv.pageId) || resoInv.pageId; })(), side: resoInv.side, items: invItems });
        return;
      }
      if (event.data.type === "inkMeasure") {
        // Stage 9 P4-B §四/§五：只读 —— 对源图各 OCR block 区域测量「局部 Otsu 少数类前景墨迹 bbox」。
        // 注：页桥以 toString 注入为自包含字符串，无法引用沙箱 @require 模块；此处内联实现与
        // extension/src/editor/image-ink-target.js 同构（node 单测以模块为真源）。
        // 只读不改画布；失败显式 reason（NO_REGION/NO_INK/NO_IMAGE_SOURCE/CROSS_ORIGIN_IMAGE），禁伪造 inkWidth。
        const resoM = resolveCurrentEditorPage();
        if (!resoM || resoM.status !== "ok" || !resoM.canvas) { post("inkMeasureResult", { ok: false, reason: "CURRENT_PAGE_UNKNOWN", items: [] }); return; }
        const canvasM = resoM.canvas;
        const activeM = canvasM.getActiveObject ? canvasM.getActiveObject() : null;
        const targetM = (activeM && String(activeM.type) === "image") ? activeM
          : ((canvasM.backgroundImage && String(canvasM.backgroundImage.type) === "image") ? canvasM.backgroundImage
            : ((canvasM.getObjects && canvasM.getObjects().find ? canvasM.getObjects().find(function (o) { return o && String(o.type) === "image"; }) : null) || null));
        if (!targetM) { post("inkMeasureResult", { ok: false, reason: "NO_IMAGE_SOURCE", items: [] }); return; }
        const elM = (targetM._element) || (targetM.getElement && targetM.getElement());
        if (!elM) { post("inkMeasureResult", { ok: false, reason: "NO_IMAGE_ELEMENT", items: [] }); return; }
        const iwM = elM.naturalWidth || elM.width || targetM.width;
        const ihM = elM.naturalHeight || elM.height || targetM.height;
        if (!iwM || !ihM) { post("inkMeasureResult", { ok: false, reason: "NO_IMAGE_SIZE", items: [] }); return; }
        const cvM = document.createElement("canvas"); cvM.width = iwM; cvM.height = ihM;
        const c2M = cvM.getContext && cvM.getContext("2d");
        if (!c2M) { post("inkMeasureResult", { ok: false, reason: "NO_CANVAS_CTX", items: [] }); return; }
        let dM = null;
        try { c2M.drawImage(elM, 0, 0); dM = c2M.getImageData(0, 0, iwM, ihM).data; } catch (e) { dM = null; }
        if (!dM) { post("inkMeasureResult", { ok: false, reason: "CROSS_ORIGIN_IMAGE", items: [] }); return; }
        const grayM = new Uint8Array(iwM * ihM);
        for (let iM = 0; iM < iwM * ihM; iM += 1) { const jM = iM * 4; grayM[iM] = Math.round(0.299 * dM[jM] + 0.587 * dM[jM + 1] + 0.114 * dM[jM + 2]); }
        const reqInk = Array.isArray(event.data.items) ? event.data.items : [];
        const itemsM = reqInk.map(function (it) {
          const bb = it.bbox || {};
          const x0 = Math.max(0, Math.floor(bb.x || 0)), y0 = Math.max(0, Math.floor(bb.y || 0));
          const x1 = Math.min(iwM - 1, Math.ceil((bb.x || 0) + (bb.width || 0)));
          const y1 = Math.min(ihM - 1, Math.ceil((bb.y || 0) + (bb.height || 0)));
          const ws = x1 - x0, hs = y1 - y0;
          const base = { blockIndex: it.blockIndex != null ? it.blockIndex : null, lineIndex: it.lineIndex != null ? it.lineIndex : null };
          if (ws < 2 || hs < 2 || x1 < x0 || y1 < y0) return Object.assign(base, { ok: false, reason: "NO_REGION", inkWidth: null, inkHeight: null, inkBox: null, coverage: null });
          const hist = new Array(256).fill(0); let sum = 0, total = 0;
          for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const g = grayM[y * iwM + x]; hist[g] += 1; total += 1; sum += g; }
          if (total < 16) return Object.assign(base, { ok: false, reason: "NO_INK", inkWidth: null, inkHeight: null, inkBox: null, coverage: null });
          let sumB = 0, wB = 0, maxVar = 0, th = 128, found = false;
          for (let t = 0; t < 256; t += 1) {
            wB += hist[t]; if (wB === 0) continue;
            const wF = total - wB; if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const v = wB * wF * (mB - mF) * (mB - mF);
            if (v > maxVar) { maxVar = v; th = t; found = true; }
          }
          if (!found) return Object.assign(base, { ok: false, reason: "NO_INK", inkWidth: null, inkHeight: null, inkBox: null, coverage: null });
          let dark = 0;
          for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (grayM[y * iwM + x] <= th) dark += 1;
          const takeDark = dark <= total - dark;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cnt = 0;
          for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
              const g = grayM[y * iwM + x];
              const fg = takeDark ? (g <= th) : (g > th);
              if (!fg) continue;
              cnt += 1;
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          if (!(cnt >= 6 && maxX >= minX && maxY >= minY) || !isFinite(minX)) return Object.assign(base, { ok: false, reason: "NO_INK", inkWidth: null, inkHeight: null, inkBox: null, coverage: null });
          const inkW = maxX - minX + 1, inkH = maxY - minY + 1;
          return Object.assign(base, { ok: true, reason: "OK", inkWidth: inkW, inkHeight: inkH, inkBox: { x: minX, y: minY, width: inkW, height: inkH }, coverage: Math.round((cnt / total) * 10000) / 10000 });
        });
        post("inkMeasureResult", { ok: true, reason: "OK", imageWidth: iwM, imageHeight: ihM, items: itemsM });
        return;
      }
      if (event.data.type === "ocrCalibrate") {
        // Stage 9 V4 §二十/§二十四：CALIBRATION_RECOGNITION / RECOGNITION_RETRY —— 更新现有 textbox，
        // 不创建重复对象。错误行为：删除 A 重建 B（禁止）——保持 object identity，只改 text/样式/几何。
        // 匹配策略（§23，文字只作 hint）：pageId + 阅读顺序（top 排序）一对一定位；
        //   existing 不足 → 仅补齐缺失行（新建），多余不复制。
        // 所有权（§四/§五）：与 ocrAdjust 同硬门禁 —— PAGE_IDENTITY_CHANGED → 整批 STOP。
        const calPageId = event.data.pageId || null;
        const calTxId = event.data.transactionId || null;
        const calFp = event.data.imageFingerprint || null;
        const calItems = Array.isArray(event.data.items) ? event.data.items : [];
        if (!calPageId) {
          post("ocrCalibrateResult", { ok: false, code: "CALIBRATE_BLOCKED_NO_PAGE", message: "校准请求缺少 pageId，已停止。", items: [], pageId: null, transactionId: calTxId, imageFingerprint: calFp });
          return;
        }
        const invCal = buildPageInventory();
        const knownCal = invCal.ok && (invCal.pages || []).some(function (p) { return p.pageId === calPageId; });
        if (!knownCal) {
          post("ocrCalibrateResult", { ok: false, code: "CALIBRATE_BLOCKED_PAGE_NOT_FOUND", message: "校准请求属于未知页面（" + calPageId + "），已停止（禁止跨页自动找画布）。", items: [], pageId: calPageId, transactionId: calTxId, imageFingerprint: calFp });
          return;
        }
        const curCal = buildCurrentPageInfo();
        const gateCal = validatePageOwnership(calPageId, curCal);
        if (!gateCal.ok) {
          const codeCal = gateCal.code === "CREATE_BLOCKED_WRONG_PAGE" ? "PAGE_IDENTITY_CHANGED" : String(gateCal.code || "CALIBRATE_BLOCKED").replace(/^CREATE_BLOCKED_/, "CALIBRATE_BLOCKED_");
          post("ocrCalibrateResult", { ok: false, code: codeCal, message: "校准期间页面已变化或无法验证（" + gateCal.reason + "），已停止校准（" + codeCal + "）。", items: [], pageId: calPageId, transactionId: calTxId, imageFingerprint: calFp, activePageId: (curCal && curCal.pageId) || null });
          return;
        }
        const resoCal = resolveCurrentEditorPage();
        const canvasCal = (resoCal && resoCal.canvas) || null;
        if (!canvasCal) {
          post("ocrCalibrateResult", { ok: false, code: "CALIBRATE_BLOCKED_CANVAS_UNREADY", message: "当前页画布不可用，已停止校准。", items: [], pageId: calPageId, transactionId: calTxId, imageFingerprint: calFp });
          return;
        }
        // 阅读序对象池（top 升序；对 zyOcrKey 助手对象与模板对象一视同仁）
        const poolCal = getTextObjects(canvasCal).sort(function (a, b) { return (Number(a.top || 0) - Number(b.top || 0)) || (Number(a.left || 0) - Number(b.left || 0)); });
        const itemsSorted = calItems.slice().sort(function (a, b) { return (Number(a.top != null ? a.top : 0) - Number(b.top != null ? b.top : 0)) || (Number(a.left != null ? a.left : 0) - Number(b.left != null ? b.left : 0)); });
        const calOut = [];
        const createdOut = [];
        itemsSorted.forEach(function (it, i) {
          try {
            const target = poolCal[i] || null;
            const text = String(it.text != null ? it.text : "");
            const cfg = {};
            if (typeof it.fontSize === "number" && it.fontSize >= 8 && it.fontSize <= 160) cfg.fontSize = it.fontSize;
            if (typeof it.width === "number" && it.width >= 20) cfg.width = it.width;
            if (typeof it.height === "number" && it.height >= 14) cfg.height = it.height;
            if (typeof it.left === "number" && isFinite(it.left)) cfg.left = it.left;
            if (typeof it.top === "number" && isFinite(it.top)) cfg.top = it.top;
            if (typeof it.angle === "number" && isFinite(it.angle)) cfg.angle = it.angle;
            if (it.fontFamily) cfg.fontFamily = it.fontFamily;
            if (it.fontWeight) cfg.fontWeight = it.fontWeight;
            if (it.fontStyle) cfg.fontStyle = it.fontStyle;
            if (target) {
              setObjectText(target, text);
              target.set(cfg);
              if (it.diagnostics) { try { target.zyOcrDiagnostics = it.diagnostics; } catch (eDiagC) {} }
              const effTxC = it.transactionId || calTxId;
              try { if (effTxC) target.zyOcrObjectId = { transactionId: effTxC, pageId: calPageId, blockId: it.blockIndex != null ? it.blockIndex : i, objectUuid: target.uuid || target.multiUuid || null }; } catch (eOid) {}
              try { if (effTxC) target.zyOcrKey = "zy-ocr-" + effTxC + "-" + (it.blockIndex != null ? it.blockIndex : i); } catch (eKeyC) {}
              syncBusinessFieldsFromObject(target);
              calOut.push({ blockIndex: it.blockIndex != null ? it.blockIndex : i, objectUuid: target.uuid || target.multiUuid || null, text: String(text).slice(0, 16), updated: true, geometry: measureObjectGeometry(canvasCal, target) });
            } else {
              // 池外新建（缺失行补齐；不复制已有内容）
              const obj = createTextObject(canvasCal, text, null, i, null);
              if (!obj) return;
              obj.set(cfg);
              setObjectText(obj, text);
              const effTxN = it.transactionId || calTxId;
              try { if (effTxN) { obj.zyOcrKey = "zy-ocr-" + effTxN + "-" + (it.blockIndex != null ? it.blockIndex : i); obj.zyOcrObjectId = { transactionId: effTxN, pageId: calPageId, blockId: it.blockIndex != null ? it.blockIndex : i, objectUuid: obj.uuid || obj.multiUuid || null }; } } catch (eOidC) {}
              syncBusinessFieldsFromObject(obj);
              createdOut.push({ blockIndex: it.blockIndex != null ? it.blockIndex : i, objectUuid: obj.uuid || obj.multiUuid || null, text: String(text).slice(0, 16), geometry: measureObjectGeometry(canvasCal, obj) });
            }
          } catch (eCal) { calOut.push({ blockIndex: it.blockIndex != null ? it.blockIndex : i, updated: false, error: String(eCal && eCal.message || eCal).slice(0, 120) }); }
        });
        if (canvasCal.requestRenderAll) canvasCal.requestRenderAll();
        post("ocrCalibrateResult", { ok: true, calibrated: calOut, created: createdOut, pageId: calPageId, side: event.data.side || null, transactionId: calTxId, imageFingerprint: calFp });
        return;
      }
      if (event.data.type === "getCanvasInfo") {
        // Stage 5.5B P1：只读画布自检 —— 隔离世界读不到页面 world 的 requirejs 注册表，
        // 由页面世界回传画布状态（供 waitForCanvasReady / 诊断）。
        post("getCanvasInfoResult", buildCanvasInfo());
        return;
      }
      if (event.data.type === "ocrPrepare") {
        // Stage 5.5B P1：OCR 目标准备 —— 页面世界解析目标图（active→背景图→首图）、
        // 提取 element→toDataURL、返回显示几何。只读，不修改画布。
        // Stage 7.6（Page Ownership）：同帧回传当前 PageIdentity（page），供调用方冻结 OCR Source Page。
        post("ocrPrepareResult", Object.assign({}, buildOcrPrepare(), { page: buildCurrentPageInfo() }));
        return;
      }
      if (event.data.type === "getPages") {
        // Stage 7.6 只读：Page 清单（动态 materialize 全量枚举，pageId 稳定身份）
        post("getPagesResult", buildPageInventory());
        return;
      }
      if (event.data.type === "getCurrentPage") {
        // Stage 7.6 只读：当前激活页 PageIdentity（.page-group.current × currentCanvasNum 交叉 + 冲突检测）
        post("getCurrentPageResult", buildCurrentPageInfo());
        return;
      }
      if (event.data.type === "resolvePage") {
        // Stage 7.6 只读：按 pageId 解析单页（归属验证/诊断用）
        post("resolvePageResult", resolvePageInfo(event.data.pageId));
        return;
      }
    });

    function post(type, payload) {
      window.postMessage(Object.assign({ source: PAGE_SOURCE_IN_PAGE, type: type }, payload), location.origin);
    }

// ---- Stage 7.1（2026-09-17）：Current Page Resolver —— OCR 编辑页判定入口 ----
    // 真机证据（252438 单面模板，2026-09-17）：
    //   - CanvasObjVO.totalCanvasArray = 页面世界画布数组（CanvasDiy 实例，drawText 在原型链，
    //     with canvas / canvasObjInfo / idName）
    //   - CurrentCanvas.getCurrentCanvas() 返回当前编辑画布；真机比对确认与
    //     totalCanvasArray 内某条目的 .canvas 同一实例（isSameAsCurrent=true）→ 身份匹配即当前页
    //   - CanvasObjVO.currentCanvasNum（1 基）/ canvasPagesNum / frontImgPathStr / backImgPathStr
    //     是真实业务字段（正/背底图路径 ∈ 业务模型，非序号惯例）
    // 判定次序（均为运行时证据，不猜索引、不依赖 front=0/back=1）：
    //   1) 身份匹配：CurrentCanvas.getCurrentCanvas() === 某条目 .canvas → 该条即当前页
    //   2) 序号匹配：CanvasObjVO.currentCanvasNum（1 基）指向 totalCanvasArray 条目
    //   3) 单条兜底：totalCanvasArray.length===1 且 frontImgPathStr 业务字段存在 → 唯一正面页
    // 任何判定无证据 → {status:"UNKNOWN", code:"CURRENT_PAGE_UNKNOWN"} —— OCR 创建必须 STOP，
    //   严禁静默 fallback 到 front（本页桥 callers 必须检查 status 后才允许创建）。
    // 输出 {pageId, side, version, canvas, canvasDiy, canvasInfo, source, confidence}；
    // side/version 仅在业务字段可见时给出，否则 null（如实，不作推断）。
    function resolveCurrentEditorPage() {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = ctx && ctx.defined ? ctx.defined : {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      if (!CV) return { status: "UNKNOWN", code: "CURRENT_PAGE_UNKNOWN", reason: "no CanvasObjVO", source: null, confidence: 0, pageId: null, side: null, version: null, canvas: null, canvasDiy: null, canvasInfo: null };
      const total = CV.totalCanvasArray;
      if (!Array.isArray(total) || !total.length) return { status: "UNKNOWN", code: "CURRENT_PAGE_UNKNOWN", reason: "no totalCanvasArray", source: null, confidence: 0, pageId: null, side: null, version: null, canvas: null, canvasDiy: null, canvasInfo: null };
      const unwrap = function (v) { if (!v) return null; if (typeof v.getObjects === "function" && (typeof v.renderAll === "function" || typeof v.requestRenderAll === "function")) return v; return (v && v.canvas) || null; };
      let matchedIndex = -1;
      let matchedSource = null;
      // 1) 身份匹配（最可信）
      const CC = defs.CurrentCanvas || window.CurrentCanvas || null;
      if (CC && typeof CC.getCurrentCanvas === "function") {
        let cur = null;
        try { cur = CC.getCurrentCanvas(); } catch (eCC) { cur = null; }
        const curC = unwrap(cur) || cur;
        if (curC && typeof curC.getObjects === "function") {
          for (let i = 0; i < total.length; i += 1) {
            const c = unwrap(total[i]) || (total[i] && total[i].canvas) || null;
            if (c === curC) { matchedIndex = i; matchedSource = "currentCanvas-identity"; break; }
          }
        }
      }
      // 2) 序号匹配（CurrentCanvas 不可用/未命中时）
      if (matchedIndex < 0 && typeof CV.currentCanvasNum === "number" && CV.currentCanvasNum >= 1 && CV.currentCanvasNum <= total.length) {
        matchedIndex = CV.currentCanvasNum - 1;
        matchedSource = "canvasObjVO.currentCanvasNum";
      }
      // 3) 单条正面兜底（仅当业务字段可证明唯一正面页；多页歧义不得猜测）
      if (matchedIndex < 0 && total.length === 1 && CV.frontImgPathStr) {
        matchedIndex = 0;
        matchedSource = "sole-entry-frontImgPathStr";
      }
      if (matchedIndex < 0) return { status: "UNKNOWN", code: "CURRENT_PAGE_UNKNOWN", reason: "no matched current canvas", source: "identity+currentCanvasNum failed", confidence: 0, pageId: null, side: null, version: null, canvas: null, canvasDiy: null, canvasInfo: null };
      const entry = total[matchedIndex];
      const canvas = unwrap(entry) || null;
      if (!canvas) return { status: "UNKNOWN", code: "CURRENT_PAGE_UNKNOWN", reason: "matched entry has no canvas", source: matchedSource, confidence: 0, pageId: null, side: null, version: null, canvas: null, canvasDiy: null, canvasInfo: null };
      // 侧别：仅在业务字段给出方向时填（matchedIndex===0 且存在正面底图字段 → front；否则 null 不猜）
      let side = null;
      let sideSource = "no biz side field";
      if (matchedIndex === 0 && CV.frontImgPathStr) { side = "front"; sideSource = "frontImgPathStr"; }
      else if (matchedIndex === total.length - 1 && CV.backImgPathStr && !CV.frontImgPathStr) { side = "back"; sideSource = "backImgPathStr"; }
      const canvasDiy = (entry && typeof entry.drawText === "function") ? entry : null;
      const canvasInfo = (entry && entry.canvasObjInfo) || null;
      const pageId = (entry && entry.idName) || ("page-" + (matchedIndex + 1));
      // 无业务 version 字段暴露（真机未观测到）→ 如实 null
      const version = (entry && entry.version) || CV.version || null;
      return { status: "ok", pageId: pageId, side: side, sideSource: sideSource, version: version, canvas: canvas, canvasDiy: canvasDiy, canvasInfo: canvasInfo, pageIndex: matchedIndex, source: matchedSource, confidence: matchedSource === "currentCanvas-identity" ? 3 : matchedSource === "canvasObjVO.currentCanvasNum" ? 2 : 1 };
    }
    // ---- Stage 7.6（Page Ownership，2026-09-18）：PageIdentity 只读消息与创建硬门禁（页面世界适配器）----
    // 事实来源与 page-model.js（@require 只读核心；单测/探针权威纯函数版本）一致：
    //   CanvasObjVO.currentCanvasNum（1 基）＋ totalCanvasArray 动态 materialize ＋ .page-group.current ＋
    //   canvas idName 稳定身份。pageId = "canvas:" + idName（退化 "page:N"）。
    // 铁律：禁裸数组 index 当唯一 identity；side 只允许 FRONT/BACK/UNKNOWN；多源冲突 → PAGE_IDENTITY_CONFLICT。
    // 用户脚本世界 ≠ 页面世界，因此本边界自足实现（不依赖跨世界注入）。OCP：只读消息 + 门禁，不改创建核心。
    function getCanvasObjVO() {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      return (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null;
    }
    function stablePageIdentity(entry, index) {
      const canvas = unwrapCanvas(entry) || null;
      const idName = entry && entry.idName ? String(entry.idName) : null;
      return {
        pageId: idName ? "canvas:" + idName : "page:" + (Number(index) + 1),
        pageIndex: Number(index), canvasIndex: Number(index),
        pageName: entry && (typeof entry.pageName === "string" ? entry.pageName : (typeof entry.title === "string" ? entry.title : null)) || null,
        canvasId: idName,
        width: canvas ? (canvas.width || (canvas.getWidth && canvas.getWidth())) : null,
        height: canvas ? (canvas.height || (canvas.getHeight && canvas.getHeight())) : null,
        objectCount: canvas && typeof canvas.getObjects === "function" ? canvas.getObjects().length : null
      };
    }
    function buildPageInventory() {
      const CV = getCanvasObjVO();
      if (!CV || !Array.isArray(CV.totalCanvasArray) || !CV.totalCanvasArray.length) {
        return { ok: false, code: "CURRENT_PAGE_UNKNOWN", reason: "no totalCanvasArray", currentCanvasNum: CV && CV.currentCanvasNum != null ? CV.currentCanvasNum : null, pages: [] };
      }
      const pages = CV.totalCanvasArray.map(stablePageIdentity);
      return { ok: true, code: "OK", currentCanvasNum: CV.currentCanvasNum != null ? CV.currentCanvasNum : null, count: pages.length, pages: pages };
    }
    function uiSideFromPageGroup() {
      try {
        const el = document.querySelector(".page-group.current");
        const txt = el ? String(el.textContent || "").trim() : "";
        if (/正面|front/i.test(txt)) return "FRONT";
        if (/反面|背面|back/i.test(txt)) return "BACK";
      } catch (e) {}
      return null;
    }
    function buildCurrentPageInfo() {
      const inv = buildPageInventory();
      if (!inv.ok) {
        return { ok: false, status: "unknown", code: inv.code, reason: inv.reason, pageId: null, side: "UNKNOWN", sideSource: null, currentCanvasNum: inv.currentCanvasNum, canvasId: null, canvasIndex: null, width: null, height: null, pages: [] };
      }
      const cc = inv.currentCanvasNum;
      const pages = inv.pages;
      let resolved = null;
      if (typeof cc === "number" && cc >= 1 && cc <= pages.length) resolved = pages[cc - 1];
      if (!resolved) {
        return { ok: false, status: "unknown", code: "CURRENT_PAGE_UNKNOWN", reason: "currentCanvasNum out of range", pageId: null, side: "UNKNOWN", sideSource: null, currentCanvasNum: cc, canvasId: null, canvasIndex: null, width: null, height: null, pages: pages };
      }
      const uiSide = uiSideFromPageGroup();
      const led = resolveCurrentEditorPage();
      let bizSide = "UNKNOWN", bizSource = null;
      if (led && led.side) { bizSide = led.side === "front" ? "FRONT" : led.side === "back" ? "BACK" : "UNKNOWN"; bizSource = led.sideSource || "resolver"; }
      let side = "UNKNOWN", sideSource = null;
      if (uiSide) { side = uiSide; sideSource = "page-group.current"; }
      else if (bizSide !== "UNKNOWN") { side = bizSide; sideSource = bizSource; }
      const implicit = resolved.canvasIndex === 0 ? "FRONT" : (resolved.canvasIndex === 1 ? "BACK" : "UNKNOWN");
      if (uiSide && implicit !== "UNKNOWN" && uiSide !== implicit) {
        return { ok: false, status: "conflict", code: "PAGE_IDENTITY_CONFLICT", reason: "page-group.current conflicts canvas index", pageId: null, side: "UNKNOWN", sideSource: null, currentCanvasNum: cc, canvasId: resolved.canvasId, canvasIndex: resolved.canvasIndex, evidence: { currentCanvasNum: cc, uiSide: uiSide, canvasId: resolved.canvasId, conflictingImplicit: implicit }, pages: pages, width: resolved.width, height: resolved.height };
      }
      return { ok: true, status: "ok", code: "OK", pageId: resolved.pageId, side: side, sideSource: sideSource, currentCanvasNum: cc, canvasId: resolved.canvasId, canvasIndex: resolved.canvasIndex, pageName: resolved.pageName, width: resolved.width, height: resolved.height, objectCount: resolved.objectCount, pages: pages };
    }
    function resolvePageInfo(pageId) {
      const inv = buildPageInventory();
      const hit = (inv.pages || []).filter(function (p) { return p.pageId === pageId; })[0] || null;
      return { ok: !!hit, code: hit ? "OK" : "PAGE_NOT_FOUND", pageId: pageId || null, page: hit || null, pages: inv.pages || [] };
    }
    // §26 跨页硬保护：sourcePageId 必须等于激活页 pageId
    function validatePageOwnership(sourcePageId, current) {
      if (!sourcePageId) return { ok: false, code: "CREATE_BLOCKED_PAGE_UNKNOWN", reason: "source pageId missing" };
      if (!current || !current.ok) {
        const c = (current && current.code) || "CURRENT_PAGE_UNKNOWN";
        return { ok: false, code: c === "PAGE_IDENTITY_CONFLICT" ? "CREATE_BLOCKED_PAGE_IDENTITY_CONFLICT" : "CREATE_BLOCKED_PAGE_UNKNOWN", reason: (current && current.reason) || "active page unverifiable", current: current || null };
      }
      if (current.pageId !== sourcePageId) return { ok: false, code: "CREATE_BLOCKED_WRONG_PAGE", reason: "OCR source page differs active page", sourcePageId: sourcePageId, activePageId: current.pageId, activeSide: current.side, current: current };
      return { ok: true, code: "OK", pageId: sourcePageId, page: current };
    }
    // ---- Stage 6 P0：原生编辑器接入辅助（252438 真机审计所得字段 schema；仅用编辑器自身 API）----
    function getNativeUndoInstance() {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const U = ctx && ctx.defined && ctx.defined.Undo;
      if (U && typeof U.getInstance === "function") return U.getInstance();
      return null;
    }
    function currentLayerMax(canvas) {
      let maxL = -1;
      try {
        (canvas.getObjects() || []).forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxL) maxL = o.layerNum; });
      } catch (e) {}
      return maxL;
    }
    // 给 OCR 新建 textbox 镜像编辑器对象模型字段（审计：原生 rect/textbox schema）。
    // multiUuid：优先编辑器原生生成器 sundry.guid()（§八 复用原生流程）；markuuid 保持原生空串约定。
    function mirrorEditorObjectModel(canvas, obj) {
      if (!obj) return false;
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = ctx && ctx.defined ? ctx.defined : {};
      const sundry = defs["sundry"];
      let guid = null;
      try { if (sundry && typeof sundry.guid === "function") guid = sundry.guid(); } catch (e) {}
      if (!guid) { try { if (window.crypto && typeof window.crypto.randomUUID === "function") guid = window.crypto.randomUUID(); } catch (e) {} }
      if (!guid) guid = "zz-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      obj.multiUuid = guid;
      obj.markuuid = "";                            // 原生新对象 markuuid 为空串
      obj.mediaMediaType = "text";
      obj.isDesign = true;
      obj.isEdit = false;
      obj.isLineText = false;
      obj.deleteState = false;
      const gx = { left: obj.left != null ? obj.left : 0, top: obj.top != null ? obj.top : 0, width: obj.width != null ? obj.width : 60, height: obj.height != null ? obj.height : 20, rotation: obj.angle || 0 };
      obj.locationX = gx.left; obj.locationY = gx.top;
      obj.locationWidth = gx.width; obj.locationHeight = gx.height; obj.locationRotation = gx.rotation;
      obj.printLocationX = gx.left; obj.printLocationY = gx.top;
      obj.printLocationWidth = gx.width; obj.printLocationHeight = gx.height; obj.printLocationRotation = gx.rotation;
      try { obj.layerNum = currentLayerMax(canvas) + 1; } catch (e) {}
      return true;
    }

    // ---- Stage 6.2 §十三~§十七：原生新增文字入口辅助（CanvasDiy 包装 + media JSON 构造）----
    // 真机审计：CanvasDiy.drawText(a,b,c,d,e,f)，e=media JSON 时将身份/location/样式字段注入对象，
    // 并把对象注册进图层数组（canvasObjInfo.canvasToProductObjArr）与产品 JSON（checkObjsInProductJson）。
    function getCanvasDiyForSide(side) {
      const CanvasObjVO = getLoadedModule("CanvasObjVO") || window.CanvasObjVO;
      const total = CanvasObjVO && CanvasObjVO.totalCanvasArray;
      const index = side === "back" ? 1 : 0;
      if (Array.isArray(total)) {
        const pick = function (d) { return d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo ? d : null; };
        if (total[index]) { const r = pick(total[index]); if (r) return r; }
        for (let i = 0; i < total.length; i += 1) { const r = pick(total[i]); if (r) return r; }
      }
      return null;
    }
    function getEditorDefaultFontId() {
      try {
        const li = document.querySelector(".fontFamily li") || document.querySelector(".editFontFamily li");
        if (li && li.getAttribute("fontid")) return li.getAttribute("fontid");
      } catch (e) {}
      return null;
    }
    // 按 OCR 输入（text/position/size/style）构造最小 TEXT media 条目，交给原生 drawText 消费（§十七）
    function buildTextMediaEntry(it, layerNum, fontId) {
      const text = String(it.text || "").trim();
      const size = Math.max(8, it.fontSize || 14);
      const w = Math.max(20, it.width || 60);
      const h = Math.max(14, it.height || Math.round(size * 1.3 + 8));
      const rot = it.angle && it.angle !== 0 ? it.angle : 0;
      const x = it.left != null ? Math.round(it.left) : 20;
      const y = it.top != null ? Math.round(it.top) : 20;
      return {
        media: {
          mediaType: "text", text: text,
          font: { pointSize: size, fontColor: it.fill || "#000000", isHorizontal: 1, gravity: "left",
            id: fontId || "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 },
          charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: ""
        },
        location: { x: x, y: y, width: w, height: h, factWidth: w, factHeight: h, rotation: rot },
        printLocation: { x: x, y: y, width: w, height: h, rotation: rot },
        layer: { alpha: 1 },
        layerNum: layerNum,
        isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
        multiUuid: nativeIdentityGuid(), markuuid: "",
        // Stage 7.3 t4 (v16 根因修复): Q() 序列化对以下字段裸拼接, 缺省会拼出 ":undefined" -> JSON 非法 -> 被判错误素材删除
        topEnable: 1, resourceType: 0, maskEnable: 0,
        lowPixelFlag: 0, selectEnabled: 1, isDesign: 1,
        isComposite: 0, isPreview: 0, isDesignShape: 0
      };
    }
    function nativeIdentityGuid() {
      const sundry = getLoadedModule("sundry");
      try { if (sundry && typeof sundry.guid === "function") { const g = sundry.guid(); if (g) return g; } } catch (e) {}
      try { if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID(); } catch (e) {}
      return "zy-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }
    // 定位 drawText 创建的对象：text 内容 + layerNum 双匹配（取最后一个）
    function findOcrObject(diy, it, layerNum) {
      const target = String(it.text || "").trim();
      const objs = diy.canvas.getObjects();
      let found = null;
      for (let i = objs.length - 1; i >= 0; i -= 1) {
        const o = objs[i];
        if (o && String(o.text || "").trim() === target && (o.layerNum === layerNum || layerNum == null)) { found = o; break; }
      }
      return found;
    }
    // ---- Stage 10-C：Native Layer Contract 硬校验（页面世界镜像，逻辑与 native-layer-contract.js 逐字一致）----
    // Canvas textbox ≠ Native Layer：仅看清画布对象不算创建成功；必须 canvasObject +
    // 原生图层数组（canvasToProductObjArr）包含 / 原生身份字段 / 产品序列化链可见。
    // 字段名以既有真机审计为准（252438 schema，见 STAGE_8A2 系列与 stage-6-2 报告）；禁止猜测。
    // D 层（product/serializer）在页面世界可验证时判定；不可验证记为 UNKNOWN（不误杀），
    // 由真机审计补测（契约 §3 D/E；本轮 A/B/C 为硬门禁）。
    function verifyNativeLayer10C(diy, obj, o) {
      const e = o || {};
      try {
        const canvas = diy && diy.canvas;
        const layerArr = (diy && diy.canvasObjInfo && Array.isArray(diy.canvasObjInfo.canvasToProductObjArr)) ? diy.canvasObjInfo.canvasToProductObjArr : null;
        const canvasObject = !!(canvas && obj && canvas.getObjects().indexOf(obj) >= 0);
        const layerArrayHas = !!layerArr && obj != null && layerArr.indexOf(obj) >= 0;
        const registryDelta = (e.registryDelta != null) ? e.registryDelta : null;
        const layerOk = canvasObject && (layerArrayHas || registryDelta === 1);
        const uuid = obj && obj.uuid != null ? String(obj.uuid) : null;
        const multiUuid = obj && obj.multiUuid != null ? String(obj.multiUuid) : null;
        const markuuid = obj && obj.markuuid != null ? String(obj.markuuid) : null;
        const layerNum = (obj && typeof obj.layerNum === "number" && isFinite(obj.layerNum)) ? obj.layerNum : null;
        const identityOk = !!(uuid || multiUuid || layerNum || (markuuid && markuuid !== ""));
        // D 层：产品序列化链可见性探测（真机审计所得，不可验证 → UNKNOWN 不误杀）
        let product = { ok: null, productRegistered: null, code: "PRODUCT_UNKNOWN" };
        try {
          const pi = diy && diy.canvasObjInfo;
          const probeFn = (pi && typeof pi.checkObjsInProductJson === "function") ? pi.checkObjsInProductJson : null;
          if (typeof probeFn === "function") {
            const c1 = probeFn.call(pi);
            const c2 = (Array.isArray(pi.canvasToProductObjArr) && pi.canvasToProductObjArr.indexOf(obj) >= 0);
            product = { ok: !!(c1 !== false || c2), productRegistered: !!(c1 !== false || c2), code: c1 !== false ? "PRODUCT_REGISTERED" : (c2 ? "PRODUCT_REGISTERED_VIA_LAYER" : "PRODUCT_NOT_REGISTERED") };
          }
        } catch (eProd) { product = { ok: null, productRegistered: null, code: "PRODUCT_UNKNOWN" }; }
        const checks = { layer: { ok: layerOk, canvasObject: canvasObject, nativeLayerRegistered: layerArrayHas, registryDelta: registryDelta }, identity: { ok: identityOk, uuid: uuid, multiUuid: multiUuid, layerNum: layerNum, markuuid: markuuid }, product: product };
        const failed = [];
        if (!layerOk) failed.push("LAYER:" + (canvasObject ? (layerArrayHas ? "REGISTRY_NO_LAYER_ARR" : "CANVAS_WITHOUT_LAYER") : "NO_CANVAS_OBJECT"));
        if (!identityOk) failed.push("IDENTITY:NO_IDENTITY_FIELD");
        if (product.code === "PRODUCT_NOT_REGISTERED") failed.push("PRODUCT:NOT_REGISTERED");
        if (failed.length) return { ok: false, code: "CREATE_NATIVE_LAYER_FAILED", failed: failed, checks: checks, layerNum: layerNum, uuid: uuid, multiUuid: multiUuid };
        return { ok: true, code: "OK", productUnknown: product.ok === null, failed: [], checks: checks, layerNum: layerNum, uuid: uuid, multiUuid: multiUuid };
      } catch (eL) {
        return { ok: false, code: "CREATE_NATIVE_LAYER_FAILED", failed: ["VERIFY_EXCEPTION:" + String(eL && eL.message || eL).slice(0, 80)], checks: null };
      }
    }

    // ---- Stage 8B STEP 4（Phase B/D）：创建后实测与业务字段同步 ----
    // aCoords 为 CANVAS_LOGICAL 真值（fabric calcCoords 不含 viewportTransform）。仅序列化数字，禁止回传对象。
    function measureObjectGeometry(canvas, obj) {
      try {
        if (!obj || typeof obj.setCoords !== "function") return null;
        if (canvas && typeof canvas.setCoords === "function") canvas.setCoords();
        else obj.setCoords();
        const ac = obj.aCoords;
        if (!ac || !ac.tl || !ac.tr || !ac.br || !ac.bl || typeof ac.tl.x !== "number") return null;
        const quad = [ac.tl, ac.tr, ac.br, ac.bl].map(function (p) { return { x: p.x, y: p.y }; });
        const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
        const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
        const d = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
        const width = (d(quad[0], quad[1]) + d(quad[2], quad[3])) / 2;
        const height = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
        const angle = (Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x) * 180) / Math.PI;
        // Stage 8B STEP 6（§12）：渲染行数 —— 单行 OCR 不得渲染成多行（WRAP_DETECTED）
        let renderedLineCount = null;
        try {
          if (obj._textLines && obj._textLines.length) renderedLineCount = obj._textLines.length;
          else {
            const lh = (typeof obj.lineHeight === "number" && obj.lineHeight > 0) ? obj.lineHeight : 1.16;
            const fsN = obj.fontSize || 16;
            const perLine = fsN * lh;
            renderedLineCount = Math.max(1, Math.round(height / Math.max(perLine, 1e-6)));
          }
        } catch (eR) { renderedLineCount = null; }
        return {
          quad: quad, center: { x: cx, y: cy }, width: width, height: height, angle: angle,
          left: typeof obj.left === "number" ? obj.left : null,
          top: typeof obj.top === "number" ? obj.top : null,
          fontSize: typeof obj.fontSize === "number" ? obj.fontSize : null,
          textboxWidth: typeof obj.width === "number" ? obj.width : null,
          textboxHeight: typeof obj.height === "number" ? obj.height : null,
          lineHeight: typeof obj.lineHeight === "number" ? obj.lineHeight : null,
          renderedLineCount: renderedLineCount
        };
      } catch (eM) { return null; }
    }
    // Phase D：几何收敛后把最终 fabric 几何同步回站点业务字段（location*/printLocation* + location 子对象）。
    function syncBusinessFieldsFromObject(obj) {
      try {
        if (!obj) return false;
        const gx = { left: obj.left != null ? obj.left : 0, top: obj.top != null ? obj.top : 0, width: obj.width != null ? obj.width : 60, height: obj.height != null ? obj.height : 20, rotation: obj.angle || 0 };
        obj.locationX = gx.left; obj.locationY = gx.top;
        obj.locationWidth = gx.width; obj.locationHeight = gx.height; obj.locationRotation = gx.rotation;
        if (obj.location && typeof obj.location === "object") {
          obj.location.x = Math.round(gx.left); obj.location.y = Math.round(gx.top);
          obj.location.width = Math.round(gx.width); obj.location.height = Math.round(gx.height);
          obj.location.factWidth = Math.round(gx.width); obj.location.factHeight = Math.round(gx.height);
          obj.location.rotation = gx.rotation;
        }
        if (obj.printLocation && typeof obj.printLocation === "object") {
          obj.printLocation.x = Math.round(gx.left); obj.printLocation.y = Math.round(gx.top);
          obj.printLocation.width = Math.round(gx.width); obj.printLocation.height = Math.round(gx.height);
          obj.printLocation.rotation = gx.rotation;
        }
        return true;
      } catch (eS) { return false; }
    }

    // ---- Stage 5.5B P1：只读画布信息 / OCR 目标准备（页面世界执行，隔离世界不可见）----
    function buildCanvasInfo() {
      const canvas = findCanvasForSide("front");
      if (!canvas) return { ok: false, message: "未找到正面画布" };
      const objs = canvas.getObjects();
      const texts = objs.filter(isTextObject);
      const images = objs.filter(function (o) { return o && String(o.type) === "image"; });
      const active = canvas.getActiveObject ? canvas.getActiveObject() : null;
      return {
        ok: true,
        width: canvas.width,
        height: canvas.height,
        objs: objs.length,
        textTotal: texts.length,
        imageTotal: images.length,
        bgImage: !!canvas.backgroundImage,
        bgImageType: canvas.backgroundImage ? String(canvas.backgroundImage.type || "") : null,
        activeType: active ? String(active.type || "") : null,
        activeIsImage: !!(active && String(active.type) === "image")
      };
    }

    // 目标图解析（优先级 active→背景图→首图，§11/§12/§52）→ 提取 element→toDataURL → 显示几何
    function extractImagePayload(target, kind, canvas) {
      const el = target._element || (target.getElement && target.getElement());
      if (!el) return { ok: false, code: kind === "background-image" ? "BACKGROUND_IMAGE_UNAVAILABLE" : "IMAGE_UNAVAILABLE", message: "图片对象缺少图像数据，无法识别" };
      let w = el.naturalWidth || el.width || target.width;
      let h = el.naturalHeight || el.height || target.height;
      if (!w || !h) return { ok: false, code: "IMAGE_UNAVAILABLE", message: "图片尺寸无效，无法识别" };
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const c2 = cv.getContext && cv.getContext("2d");
      if (!c2) return { ok: false, code: "IMAGE_EXPORT_FAILED", message: "图片导出失败" };
      let dataUrl = null;
      try { c2.drawImage(el, 0, 0); dataUrl = cv.toDataURL("image/png"); } catch (e) { dataUrl = null; }
      if (!dataUrl) return { ok: false, code: "CROSS_ORIGIN_IMAGE", message: "图片来自跨域，浏览器禁止读取像素；请使用画布内上传的图片" };
      // 显示几何：背景图（fabric.backgroundImage）可能不携带 left/top，用画布居中兜底（§13 不建复杂定位系统）
      let left = target.left, top = target.top;
      if (!isFinite(left)) left = (canvas.width - w * (target.scaleX || 1)) / 2;
      if (!isFinite(top)) top = (canvas.height - h * (target.scaleY || 1)) / 2;
      // Stage 8B STEP 4（Phase 0）：aCoords 真值采集 —— setCoords() 后读四角（CANVAS_LOGICAL，
      // fabric calcCoords 不含 viewportTransform/zoom），供 image-space.js 建立「source→canvas」
      // 唯一仿射（坐标合同 §3）；无 aCoords 时调用方降级旧路径，禁止用 left/top 猜测。
      let aCoords = null;
      try {
        if (typeof target.setCoords === "function") target.setCoords();
        const ac = target.aCoords;
        if (ac && ac.tl && ac.tr && ac.br && ac.bl && typeof ac.tl.x === "number") {
          aCoords = {
            tl: { x: ac.tl.x, y: ac.tl.y }, tr: { x: ac.tr.x, y: ac.tr.y },
            br: { x: ac.br.x, y: ac.br.y }, bl: { x: ac.bl.x, y: ac.bl.y }
          };
        }
      } catch (eAc) { aCoords = null; }
      return {
        ok: true,
        kind: kind,
        dataUrl: dataUrl,
        width: w,
        height: h,
        geometry: {
          left: left, top: top,
          width: target.width, height: target.height,
          scaleX: target.scaleX || 1, scaleY: target.scaleY || 1,
          angle: target.angle || 0,
          // Stage 8B STEP 4：画布逻辑尺寸 / natural 尺寸 / aCoords 真值（缺省 null，调用方降级）
          canvasWidth: canvas ? (canvas.width != null ? canvas.width : null) : null,
          canvasHeight: canvas ? (canvas.height != null ? canvas.height : null) : null,
          naturalWidth: w, naturalHeight: h,
          aCoords: aCoords
        }
      };
    }

    function buildOcrPrepare() {
      // Stage 7.1：OCR 目标准备 —— 使用当前编辑页画布（resolver 判定），不再默认 front。
      const resolution = resolveCurrentEditorPage();
      if (!resolution || resolution.status !== "ok" || !resolution.canvas) return { ok: false, code: "CURRENT_PAGE_UNKNOWN", currentPage: resolution || null, message: "当前编辑页面无法识别，无法准备 OCR 目标图（CURRENT_PAGE_UNKNOWN）" };
      const canvas = resolution.canvas;
      if (!canvas) return { ok: false, code: "CANVAS_NOT_READY", message: "画布未就绪，请等待模板加载完成" };
      // Stage 8B STEP 5（§3/§4）：真实模板字体采样 —— StyleCandidate 来源 1（当前模板真实 textbox）。
      // 禁止硬编码"思源黑体 Regular"；模板无文字对象时为 null（调用方走 fallback 并标记 fontMismatch）。
      const templateFont = sampleTemplateFont(canvas);
      const active = canvas.getActiveObject ? canvas.getActiveObject() : null;
      if (active && String(active.type) === "image") return Object.assign(extractImagePayload(active, "active-image", canvas), { templateFont: templateFont });
      if (canvas.backgroundImage && String(canvas.backgroundImage.type) === "image") return Object.assign(extractImagePayload(canvas.backgroundImage, "background-image", canvas), { templateFont: templateFont });
      const first = canvas.getObjects().find(function (o) { return o && String(o.type) === "image"; });
      if (first) return Object.assign(extractImagePayload(first, "first-image", canvas), { templateFont: templateFont });
      return { ok: false, code: "IMAGE_UNAVAILABLE", message: "未找到可识别的图片：请先在画布选中一张图片，或填充一张背景图" };
    }
    // Stage 8B STEP 5（§3）：真实模板字体采样 —— 多数派 fontFamily + 代表性样式
    function sampleTemplateFont(canvas) {
      try {
        const counts = {};
        let best = null, bestN = 0, sample = null;
        (canvas.getObjects() || []).forEach(function (o) {
          if (!o || typeof o.text !== "string" || !String(o.text || "").trim()) return;
          const fm = String(o.fontFamily || "").trim();
          if (!fm) return;
          counts[fm] = (counts[fm] || 0) + 1;
          if (counts[fm] > bestN) { bestN = counts[fm]; best = fm; sample = o; }
        });
        if (!best) return null;
        return {
          fontFamily: best,
          fontWeight: sample.fontWeight != null ? sample.fontWeight : null,
          fontStyle: sample.fontStyle != null ? sample.fontStyle : null,
          lineHeight: sample.lineHeight != null ? sample.lineHeight : null,
          fontSizeSample: sample.fontSize != null ? sample.fontSize : null,
          count: bestN
        };
      } catch (e) { return null; }
    }
    function findCanvasForSide(side) {
      const CanvasObjVO = getLoadedModule("CanvasObjVO") || window.CanvasObjVO;
      const total = CanvasObjVO && CanvasObjVO.totalCanvasArray;
      const index = side === "back" ? 1 : 0;
      if (Array.isArray(total) && total[index]) {
        const selected = unwrapCanvas(total[index]) || findCanvasIn(total[index]);
        if (selected) return selected;
      }
      const CurrentCanvas = getLoadedModule("CurrentCanvas") || window.CurrentCanvas;
      if (side !== "back" && CurrentCanvas && CurrentCanvas.getCurrentCanvas) {
        const current = CurrentCanvas.getCurrentCanvas();
        const currentCanvas = unwrapCanvas(current) || findCanvasIn(current);
        if (currentCanvas) return currentCanvas;
      }
      if (Array.isArray(total) && total.length) {
        for (let i = 0; i < total.length; i += 1) {
          const found = unwrapCanvas(total[i]) || findCanvasIn(total[i]);
          if (found) return found;
        }
      }
      return findCanvasFromGlobals();
    }

    function getLoadedModule(name) {
      const req = window.requirejs || window.require;
      const context = req && req.s && req.s.contexts && req.s.contexts._;
      if (context && context.defined && context.defined[name]) return context.defined[name];
      return null;
    }

    function findCanvasFromGlobals() {
      const candidates = [];
      ["canvas", "currentCanvas", "canvasDiy", "diyCanvas", "CanvasDiy", "CanvasObjVO"].forEach(function (key) {
        if (window[key]) candidates.push(window[key]);
      });
      const loaded = getLoadedModule("CanvasObjVO");
      if (loaded) candidates.push(loaded);
      for (let i = 0; i < candidates.length; i += 1) {
        const found = findCanvasIn(candidates[i]);
        if (found) return found;
      }
      return null;
    }

    function findCanvasIn(root) {
      const seen = [];
      function walk(value, depth) {
        if (!value || depth > 4) return null;
        if (seen.indexOf(value) >= 0) return null;
        seen.push(value);
        const unwrapped = unwrapCanvas(value);
        if (unwrapped) return unwrapped;
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i += 1) {
            const found = walk(value[i], depth + 1);
            if (found) return found;
          }
          return null;
        }
        if (typeof value === "object") {
          const keys = ["canvas", "_canvas", "fabricCanvas", "lowerCanvas", "currentCanvas", "stage", "totalCanvasArray"];
          for (let i = 0; i < keys.length; i += 1) {
            const found = walk(value[keys[i]], depth + 1);
            if (found) return found;
          }
        }
        return null;
      }
      return walk(root, 0);
    }

    function unwrapCanvas(value) {
      if (!value) return null;
      if (typeof value.getObjects === "function" && (typeof value.renderAll === "function" || typeof value.requestRenderAll === "function")) return value;
      if (value.canvas && typeof value.canvas.getObjects === "function") return value.canvas;
      return null;
    }

    function getTextObjects(canvas) {
      return canvas.getObjects().filter(isTextObject);
    }

    function isTextObject(obj) {
      if (!obj) return false;
      const type = String(obj.type || "").toLowerCase();
      if (["text", "textbox", "i-text", "curvedtext"].indexOf(type) >= 0) return true;
      if (obj.text != null && typeof obj.set === "function") return true;
      const mediaType = String(obj.mediaMediaType || (obj.media && obj.media.mediaType) || "").toLowerCase();
      return mediaType.indexOf("text") >= 0;
    }

    function applyFields(canvas, fields, side) {
      const items = buildItems(fields || {}, side || "front");
      if (!items.length) return { ok: false, message: "没有可填入的字段。", applied: [] };

      const objects = getTextObjects(canvas).sort(function (a, b) {
        return Number(a.top || 0) - Number(b.top || 0) || Number(a.left || 0) - Number(b.left || 0);
      });
      removeAssistantExtras(canvas, objects, items);
      const used = [];
      const applied = [];
      const layout = analyzeLayout(canvas, objects);

      items.forEach(function (item, index) {
        let obj = pickObject(objects, used, item);
        let created = false;
        const reference = obj || findReferenceObject(objects, used, index);
        if (!obj) {
          obj = createTextObject(canvas, item.text, reference, index, layout);
          if (obj) {
            objects.push(obj);
            created = true;
          }
        }
        if (!obj) return;
        used.push(obj);
        setObjectText(obj, item.text);
        if (created) placeCreatedObject(obj, reference, index, layout);
        obj.zyFieldKey = item.key;
        applied.push((side === "back" ? "反面 " : "正面 ") + item.label + " -> " + item.text);
      });

      if (canvas.requestRenderAll) canvas.requestRenderAll();
      else if (canvas.renderAll) canvas.renderAll();
      return applied.length ? { ok: true, applied: applied } : { ok: false, message: "识别到了字段，但没有匹配到合适的文字图层。", applied: [] };
    }

    function buildItems(fields, side) {
      const items = [];
      if (side === "back") {
        // C3：多个主营项拆成多个图层面板，第一个带“主营范围：”前缀，其余直接放内容。
        const biz = (fields.business || []).filter(Boolean);
        if (biz.length === 1) addItem(items, "business", "主营范围", "主营范围：" + biz[0]);
        else biz.forEach(function (value, i) { addItem(items, "business", "主营范围", i === 0 ? "主营范围：" + value : value); });
        (fields.back_extra || []).forEach(function (value) { addItem(items, "back_extra", "反面补充", value); });
        return items;
      }
      addItem(items, "company_cn", "中文公司", fields.company_cn);
      addItem(items, "company_en", "英文公司", fields.company_en);
      addItem(items, "name", "姓名", fields.name);
      addItem(items, "title", "职位", fields.title);
      addMultiItems(items, "phone", "电话", fields.phones);
      addMultiItems(items, "wechat", "微信", fields.wechats);
      addMultiItems(items, "email", "邮箱", fields.emails);
      addMultiItems(items, "website", "网址", fields.websites);
      addMultiItems(items, "address", "地址", fields.addresses);
      return items;
    }

    // C2：每个多值字段最多生成 3 个图层项，超出部分并入最后一项，避免图层数量过多导致溢出/重叠。
    function addMultiItems(items, key, label, values) {
      const list = (values || []).filter(Boolean);
      const cap = 3;
      list.slice(0, cap).forEach(function (value) { addItem(items, key, label, line(label, value)); });
      const rest = list.slice(cap);
      if (rest.length && items.length) {
        const last = items[items.length - 1];
        last.text = last.text + "；" + rest.join("；");
      }
    }

    function addItem(items, key, label, text) {
      const value = String(text || "").trim();
      if (value) items.push({ key: key, label: label, text: value });
    }

    function line(label, value) {
      const text = String(value || "").trim();
      return text ? label + "：" + text : "";
    }

    function pickObject(objects, used, item) {
      let best = null;
      let bestScore = -9999;
      objects.forEach(function (obj, index) {
        if (used.indexOf(obj) >= 0) return;
        const text = String(obj.text || obj._text || "").trim();
        const score = scoreObject(obj, text, item, index, objects.length);
        if (score > bestScore) {
          best = obj;
          bestScore = score;
        }
      });
      if (bestScore >= 35) return best;
      // C1：分数不足时只接受“轻度不匹配”（还有位置/排版依据）的对象；
      // 明显错位（分数过低）宁可返回 null 由上层新建图层，也不乱填已有图层。
      if (best && bestScore >= -20) return best;
      return null;
    }

    function removeAssistantExtras(canvas, objects, items) {
      const wanted = {};
      items.forEach(function (item) { wanted[item.key] = (wanted[item.key] || 0) + 1; });
      const kept = {};
      objects.slice().forEach(function (obj) {
        if (!obj || !obj.zyCreatedByAssistant) return;
        const key = obj.zyFieldKey || "";
        kept[key] = (kept[key] || 0) + 1;
        if (!wanted[key] || kept[key] > wanted[key]) {
          canvas.remove(obj);
          const index = objects.indexOf(obj);
          if (index >= 0) objects.splice(index, 1);
        }
      });
    }

    function scoreObject(obj, text, item, index, total) {
      const key = item.key;
      const lower = text.toLowerCase();
      const size = Number(obj.fontSize || obj.size || 12);
      const topRank = total ? (total - index) / total : 0;
      let score = topRank * 8;
      if (text === item.text) score += 100;
      if (/示例|样稿|请输入|点击|双击/.test(text)) score += 8;
      if (key === "company_cn") score += /公司|集团|科技|贸易|有限公司|厂/.test(text) ? 90 : topRank * 18 + size / 2;
      if (key === "company_en") score += /\b(co|ltd|limited|company|trading|technology|group)\b/i.test(text) ? 90 : /[a-z]/i.test(text) ? 12 : -8;
      if (key === "name") score += /^[\u4e00-\u9fa5]{2,4}$/.test(text) ? 90 : size > 16 ? 15 : 0;
      if (key === "title") score += /经理|总监|工程师|销售|主管|负责人|manager|director|engineer/i.test(text) ? 90 : 0;
      if (key === "phone") score += /1[3-9]\d{9}|电话|手机|tel|phone|mobile/i.test(text) ? 95 : -5;
      if (key === "wechat") score += /微信|wechat|wx/i.test(text) ? 95 : -5;
      if (key === "email") score += /@|邮箱|mail|email/i.test(lower) ? 95 : -8;
      if (key === "website") score += /网址|网站|web|www\.|https?:\/\//i.test(text) ? 95 : -8;
      if (key === "address") score += /地址|address|省|市|区|街道|路|大厦|楼|室|工业园/i.test(text) ? 95 : index > total * .55 ? 12 : -4;
      if (key === "business") score += /主营|业务|产品|芯片|服务器|DDR|贸易|进出口/i.test(text) ? 90 : index > total * .55 ? 8 : -4;
      return score;
    }

    function findReferenceObject(objects, used, index) {
      if (used.length) return used[used.length - 1];
      if (objects[index]) return objects[index];
      return objects.length ? objects[objects.length - 1] : null;
    }

    function analyzeLayout(canvas, objects) {
      const width = Number(canvas.width || (canvas.getWidth && canvas.getWidth()) || 360);
      const height = Number(canvas.height || (canvas.getHeight && canvas.getHeight()) || 216);
      const gaps = [];
      for (let i = 1; i < objects.length; i += 1) {
        const gap = Number(objects[i].top || 0) - Number(objects[i - 1].top || 0);
        if (gap > 4 && gap < height * 0.5) gaps.push(gap);
      }
      gaps.sort(function (a, b) { return a - b; });
      const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 24;
      return {
        width: width,
        height: height,
        left: width * 0.1,
        top: height * 0.12,
        contentWidth: width * 0.8,
        step: Math.max(18, medianGap)
      };
    }

    function createTextObject(canvas, text, reference, index, layout) {
      const fabric = window.fabric || (canvas.constructor && canvas.constructor.fabric);
      const style = getReferenceStyle(reference);
      let obj = null;
      // A1：优先“克隆”参考文字图层——复用设计器自己的文字类并继承其自定义属性
      // （字体标识、可编辑标记、数据模型等），这样新图层可双击编辑、字体与周边一致、不会与画布割裂。
      if (reference && reference.constructor) {
        try {
          const Klass = reference.constructor;
          if (typeof Klass === "function") {
            obj = new Klass("", {
              left: style.left,
              top: style.top,
              width: style.width,
              fontSize: style.fontSize,
              fill: style.fill,
              fontFamily: style.fontFamily,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
              lineHeight: style.lineHeight,
              textAlign: style.textAlign,
              charSpacing: style.charSpacing,
              editable: true
            });
            inheritReferenceProps(obj, reference);
          }
        } catch (_error) {
          obj = null;
        }
      }
      if (!obj) {
        if (!fabric) return null;
        const Klass = fabric.Textbox || fabric.IText || fabric.Text;
        if (!Klass) return null;
        // Stage 5.6 P0（真机：空白模板无文字层时 reference=null 且 layout=null → layout.left 抛错）：
        // 无参考层/无布局时给安全默认（位置/尺寸随后由 ocrCreate 的 obj.set 覆盖）。
        const fbLeft = reference ? style.left : (layout ? layout.left : 20 + index * 24);
        const fbTop = reference ? style.top + Math.max(style.height, style.fontSize * 1.55) : (layout ? layout.top + index * layout.step : 20 + index * 30);
        const fbWidth = reference ? style.width : (layout ? layout.contentWidth : 240);
        obj = new Klass(text, {
          left: fbLeft,
          top: fbTop,
          width: fbWidth,
          fontSize: style.fontSize,
          fill: style.fill,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          lineHeight: style.lineHeight,
          textAlign: style.textAlign,
          charSpacing: style.charSpacing,
          editable: true
        });
      }
      obj.zyCreatedByAssistant = true;
      obj.zyFieldKey = null;
      canvas.add(obj);
      return obj;
    }

    // A1：把参考对象（含其原型链）上的自有属性拷到新对象上，只跳过内部/画布引用类字段。
    // Stage 5.1（STAGE5.1-CRE-01, P1）修复：追加跳过 identity / 度量缓存 / 事件 / 编辑回退字段，
    // 防止新对象继承 reference 的 markuuid（破坏 textbox markuuid 唯一性）与陈旧缓存/监听器/回退文本。
    function inheritReferenceProps(obj, reference) {
      const skipBox = new Set(["canvas", "_canvas", "group", "_group", "ctx", "_ctx", "scene", "_scene", "_cacheCanvas", "_cacheContext", "_cacheCanvasDimensions", "clipPath", "text", "_text", "textLines", "_textLines", "lineWidths", "_lineWidths", "dirty", "zyCreatedByAssistant", "zyFieldKey", "markuuid", "uuid", "__charBounds", "__lineHeights", "__lineWidths", "_styleMap", "__eventListeners", "aCoords", "oCoords", "lastSafeText"]);
      const collected = {};
      let current = reference;
      while (current && current !== Object.prototype) {
        Object.getOwnPropertyNames(current).forEach(function (name) {
          if (skipBox.has(name) || name in collected) return;
          try { collected[name] = reference[name]; } catch (_error) {}
        });
        current = Object.getPrototypeOf(current);
      }
      Object.keys(collected).forEach(function (name) {
        if (skipBox.has(name)) return;
        try { obj[name] = collected[name]; } catch (_error) {}
      });
      return obj;
    }

    function getReferenceStyle(reference) {
      return {
        left: Number(reference && reference.left != null ? reference.left : 32),
        top: Number(reference && reference.top != null ? reference.top : 32),
        width: Number(reference && reference.width || 240),
        height: Number(reference && reference.height || 20),
        fontSize: Number(reference && reference.fontSize || 16),
        fill: reference && reference.fill || "#1f2937",
        fontFamily: reference && reference.fontFamily || "Microsoft YaHei, Arial",
        fontWeight: reference && reference.fontWeight || "normal",
        fontStyle: reference && reference.fontStyle || "normal",
        lineHeight: Number(reference && reference.lineHeight || 1.25),
        textAlign: reference && reference.textAlign || "left",
        charSpacing: Number(reference && reference.charSpacing || 0)
      };
    }

    function placeCreatedObject(obj, reference, index, layout) {
      const style = getReferenceStyle(reference);
      const step = Math.max(style.height, style.fontSize * 1.55, layout && layout.step || 0);
      let top = layout ? layout.top + index * step : style.top + index * step;
      if (reference) top = Math.min(style.top + step, top);
      // A2/C2：新图层 top 统一钳制在画布内，避免溢出/重叠；去掉原先覆盖计算值的旧逻辑。
      const maxTop = layout && layout.height ? Math.max(4, layout.height - step) : top;
      top = Math.max(4, Math.min(top, maxTop));
      const options = {
        left: reference ? style.left : layout.left,
        top: top,
        width: reference ? style.width : layout.contentWidth,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fill: style.fill,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textAlign: style.textAlign,
        charSpacing: style.charSpacing
      };
      if (typeof obj.set === "function") obj.set(options);
      else Object.assign(obj, options);
      if (typeof obj.setCoords === "function") obj.setCoords();
    }

    function setObjectText(obj, value) {
      const text = String(value || "");
      if (typeof obj.setText === "function") obj.setText(text);
      else if (typeof obj.set === "function") obj.set("text", text);
      else obj.text = text;
      obj.text = text;
      obj.dirty = true;
      if (typeof obj.initDimensions === "function") obj.initDimensions();
      if (typeof obj.setCoords === "function") obj.setCoords();
    }

    // 自检：报告当前页面/画布状态，帮助定位“本地填不进去”的根因。只读，不修改画布。
    function buildProbeResult() {
      const canvases = ["front", "back"].map(function (side) {
        try {
          const canvas = findCanvasForSide(side);
          return {
            side: side,
            found: !!canvas,
            ctor: canvas && canvas.constructor ? canvas.constructor.name : null,
            width: canvas && (canvas.width || (canvas.getWidth && canvas.getWidth())) || 0,
            height: canvas && (canvas.height || (canvas.getHeight && canvas.getHeight())) || 0,
            textObjects: canvas ? getTextObjects(canvas).length : 0
          };
        } catch (error) {
          return { side: side, found: false, ctor: null, error: String(error && error.message || error) };
        }
      });
      return { ok: true, href: location.href, canvases: canvases };
    }

    // 安装成功后才落 marker，保证 listener 注册异常时不留下“已安装”假象（可重试）。
    window.__ZY_CARD_ASSISTANT_BRIDGE__ = { installed: true, ts: Date.now() };
  }
