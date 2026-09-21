# Stage 10-A 报告：Native Font Color Audit + Native Color Production Wiring

- 基线：`a86a97a`　升版：`0.3.11.48 → 0.3.11.49`
- 目标：OCR 重建 Native textbox 尽可能恢复源图文字颜色；优先调用网页原生功能，不自行模拟 Native Editor 行为。
- 硬规则执行：颜色来自 Source Image（ImageInk 前景像素，非 OCR、非 bbox 平均）；Image-Space 为唯一采样坐标源；UNKNOWN → 保留 Native default，无证据不强制设黑。

---

## 0. 结论总览

| 项目 | 结论 |
|---|---|
| Native Color API（P0） | **PASS** —— `media.font.fontColor` → `obj.fill` 6 色 EXACT |
| Native UI Color Setter（P1） | **PASS（存在性）** —— `ItemDataModel.setObjectFill` + 40 个颜色控件 |
| Fabric fill 行为（P2） | **PASS** —— `obj.set({fill})` + render 像素级改变 |
| Serializer（P3） | **PASS（局部）** —— fabric toJSON 含 fill；站点产品 JSON 全链路 **BLOCKED**（会话写权限） |
| Save/Reload | **UNRESOLVED（服务端）** —— 真实“保存”按钮未触发网络写（本会话受限）；模板原生锚 fill=#000000 跨 reload 保持（应用级持久性证据） |
| 颜色提取 | **PASS** —— C1-C10 全矩阵 delta ≤ 4.24 |
| 真机 Create | **PASS** —— requestedFill == actualFill = EXACT ×10 |
| 回归（Stage 9 全套） | **PASS** —— S99 Part A 26+ 场景（见 §8） |
| Mixed Typography evidence | **PASS（仅记录）** —— 未改动字号算法 |

**STAGE 10-A = PASS（Native Color 链路闭环；save/reload 服务端持久化受会话限制，已在“限制”如实记录）**
**NEXT BLOCKER = 提供可写会话补测 uploadOCR/save 全链路（Case A-D 与保存持久化）**
**NEXT STAGE = Stage 10-B（Text Run / Mixed Typography Segmentation）**

---

## 1. Native Color Audit（runtime/reports/stage-10/native-color-audit.json）

### 1.1 P0 Native Editor Color API —— PASS

真实 textbox（模板 1234075）读回：`fill="#000000"`、`strokeWidth=1`、`opacity=1`。

原生 drawText 带 `font.fontColor` 变体 6 色（#ff0000/#00ff00/#0000ff/#000000/#ffffff/#ffd700）创建 probe → `obj.fill` **全部 EXACT 一致**。结论：Native 官方颜色入口 = `media.font.fontColor`（页面桥 buildTextMediaEntry 已构造该字段，此前硬编码 #000000）。生产接线即：`it.fill`（有证据时）→ `fontColor` → `obj.fill`。

### 1.2 P1 Native UI Color Setter —— PASS（存在性）

选中 textbox 后页面存在 40 个颜色控件 + 20 个颜色绑定，含 **`ItemDataModel.setObjectFill`**、`fabric.Color`、`ColorValueConversion(colorHex/colorRgb/colorDecimal)`。UI 路径真实存在；生产选择 P0 API（不经 UI）。

### 1.3 P2 Fabric fill + render —— PASS

probe `obj.set({fill:"#00aa33", stroke:"#00aa33", strokeWidth:1})` → `fillChanged=true` 且区域 toDataURL 哈希 `a35f4c27 → cb12c787`（renderChanged=true，像素级证据）。

### 1.4 P3 Serializer —— PASS（局部）/ BLOCKED（全链）

- fabric toJSON 对象级序列化含 `fill`（probe fill=#ff6600 → JSON.fill=#ff6600）。
- 站点产品 JSON 保存/回读全链路：真实“保存”点击成功但本会话未捕获写网络（登录/写权限受限）→ **标记 BLOCKED**，且如实记录：模板原生锚（#000000）跨 reload 保持，为应用级持久性证据。生产接线仍安全（走与模板锚相同的 fill 字段序列化）。

---

## 2. 颜色提取（Native Color Adapter 纯模块）

新增 `extension/src/editor/native-color.js`（纯数据/纯逻辑，不持 DOM/Fabric）：

- `normalizeColor` / `isValidColor` / `extractFill` / `compareColor`
- `extractForegroundColor({data,width,height,bbox})`：局部 Otsu 少数类前景 → RGB 16 级分桶 → 邻域合并求稳定主色；黑/白浓度优先，抗锯齿不拉灰；排除 alpha<32。
- 单测 `tests/editor-object-model/native-color.test.js`：**30/30 PASS**（黑/白/蓝/红/深灰/棋盘金/抗锯齿/无文字/越界裁剪/颜色 compare EXACT-NEAR-MISMATCH-UNKNOWN）。

## 3. 生产接线（0.3.11.49）

```
buildItemsFromOcr
  └─ 事务级解码 img.dataUrl → RGBA（仅循环一次）
       └─ 每 workBlock：复用 inkByBlock.inkBox（ImageInk）or bbox
            → extractForegroundColor → colorByBlock[bi]
             └─ item.fill（有证据时）+ zy8bFillEvidence{confidence,sampleCount,coverage}
                → browser item.fill
                   -> page-bridge buildTextMediaEntry fontColor: it.fill||#000000  （P0 API）
                   -> page-bridge 复用路径：MATCH 时 set({fill})（仅当 it.fill 存在）
                   -> page-bridge 创建双保险：drawText 后 fill 不一致则 set
UNKNOWN（无证据）→ 不设 fill → 保留 Native Anchor/default（模板锚 #000000）并记
fillEvidence.missing=true（§十六禁无证据强设黑）
```

未破坏：Native Truth / Anchor / Image Transform / Containment / Typography / Native Create（改动仅新增 fill 字段注入）。

## 4. 真机颜色矩阵 C1-C10（runtime/reports/stage-10/native-color-matrix.json）—— 10/10 PASS

| Case | 场景 | source | detected | delta | colorLevel | fillPass |
|---|---|---|---|---|---|---|
| C1 | 黑白底黑字 #111111 | #111111 | #121212 | 1.73 | NEAR | EXACT |
| C2 | 深底白字 #f8f8f8 | #f8f8f8 | #f7f7f7 | 1.73 | NEAR | EXACT |
| C3 | 蓝字浅底 #0057b8 | #0057b8 | #0158b8 | 1.41 | NEAR | EXACT |
| C4 | 红字浅底 #d92b2b | #d92b2b | #d92e2e | 4.24 | NEAR | EXACT |
| C5 | 深灰 #4d4d4d | #4d4d4d | #4d4d4d | 0 | EXACT | EXACT |
| C6 | 金 #e6b800 棋盘底 | #e6b800 | #e6b802 | 2 | NEAR | EXACT |
| C7 | 单行 #1e1e1e | #1e1e1e | #1e1e1e | 0 | EXACT | EXACT |
| C8 | 双行同色 #191919 | #191919 | #191919 | 0 | EXACT | EXACT |
| C9 | 旋转图片（image 30°） | #282828 | #282828 | 0 | EXACT | EXACT |
| C10 | 非均匀缩放（sx .6 / sy 1.1） | #282828 | #282828 | 0 | EXACT | EXACT |

- 采样一律 IMAGE_PIXEL（natural image getImageData + inverse(imageTransform) 语义）；C9/C10 在对象旋转/非均匀时 delta=0 → 证明不依赖 Canvas CSS/viewport/DPR。
- requestedFill vs actualFill：10/10 `EXACT`（normalizeColor 后比较；实际返回同为 hex）。

## 5. 黑色 / 白色 / 彩色专项
- 黑：C1/C7/C8/C9/C10 黑系文字 → darkish 聚类稳定，delta≤1.73（未平均成灰）。
- 白：C2 #f8f8f8 → #f7f7f7（whitish 聚类，正确）。
- 彩色：C3 蓝 /C4 红 /C6 金 均近源色（delta≤4.24）。
- 抗锯齿：单测 F7 证明主色不因 AA 边拉灰。

## 6. Mixed Typography Evidence（仅记录，不改算法）—— C8 双行
- `lineInkHeights [18, 70]`（浏览器实际 ink 测量）、`inkRatio 0.257`、`suspectedMixedTypography true`。
- 本轮未因 mixed 修改 per-line median / 字号公式（Stage 10-A 范围外；Stage 10-B 处理）。

## 7. 回归

- 单元测试：editor-object-model 全量 —— Stage 9 各套 PASS（image-containment 28、image-space、multiline-typography 24、native-anchor-matcher 18、native-create-measure 19、text-fit、page-model 18 …）；仅既有 4 套基线失败（candidate-normalizer 10 / merge-golden-word 2 / merge-guard 2 / textblock-fields 3，与 a86a97a 基线一致，非本轮引入）。
- 真机 S99 Part A（0.3.11.49）：anchor reuse/create/uncertain/wrong-page、measure closure、idempotence ×3、pageIdentity、image-space ×4、containment ×4、typography T1-T7+collapse/wrap、P0-1/2/3 —— 全部 PASS（见 runtime/reports/stage-9/stage-9-9-full-pipeline.json 0.3.11.49 版）。

## 8. 限制与诚实清单
- 服务端 save/reload 颜色持久化：BLOCKED（本会话无写权限；模板锚跨 reload 保持为应用级证据；fabric toJSON 含 fill 为序列化层证据）。
- Native OCR Truth 全链路（Stage 9.9 BLOCKED 项）仍受 uploadOCR 登录会话限制，非本轮回归范围。
- C8 合成气字形 ink 高（46px 行测得 18px）为浏览器回退字形渲染实测值；仅用于 mixed evidence，不影响颜色结论。

## 9. Git

- 独立 commit：`feat(stage-10): wire native font color (0.3.11.49)`
- 四源升版：userscript @version/VERSION / @require?v= / assistant.js / manifest.json / runtime-manifest（modules 27→28）
- stage → test（ff）→ demo（ff）同步；禁 force push。