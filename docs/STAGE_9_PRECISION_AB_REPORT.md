# Stage 9 V3：Native OCR 精准模式复测 + 字号问题归因

日期：2026-09-20
分支/HEAD：`stage-9-altq-baidu-reconstruction`（v26=印刷体 CaseA / v27=手写体 CaseB，0.3.11.35）
证据：`runtime/reports/stage-9/{precision-discovery,native-ab}.json`、`runtime/reports/stage-8b/real-card-gate-a0-v0321122{6,7}.json`

---

## Q1：网页"更精准识别"对应什么参数？

**实测（precision-discovery）：**
- OCRTool.do「文字识别」工具可选控件 **仅两项**：印刷体 / 手写体（`el-radio` value `1|2`；Vue `$data` 仅 `recogText/textType`）。
- **不存在独立"精准/高精度"开关**。用户选择"手写体"后实际请求：`POST /siteWeb/userCenterJsj/uploadOCR.do`，FormData `[file, textType=2]` —— 与印刷体 `textType=1` 的唯一差异即 `textType` 值。
- 结论：`PRECISION_MODE_PARAM = textType ∈ {1(印刷体), 2(手写体)}`（无额外字段；手写体并非"更高精度"）。

## Q2：Precision(手写体) vs Default(印刷体) 文本差异

（native-ocr-diff，基于 rawText 原样不 trim）

| 指标 | 值 |
|---|---|
| lineCount A/B | 10 / 10 |
| sameLineCount | 5 |
| changedLines | 5/10（全部为标点/空格/邮箱大小写）|
| characterDiffCount | 19（空白 4、标点 5、其余 10 为 `1591317158` 分段与 `ltd→Itd`）|
| added/removed | 0 / 0 |
| Stability | 手写体两轮（H1 vs H2）**逐字节完全一致** |

差异明细：
- `Telephone: +8615913171583` → `Telephone:+86 15913171583`
- `Tel.:0757-88809856` → `Tel.: 0757-88809856`
- `地址：…` → `地址:…`（全角冒号→半角，2 行）
- `E-mail:sandy.wu@shengying.ltd` → `sandy.wu@shengying.Itd`（**手写体把 ltd 误识成 Itd —— 实为更差**）

## Q3：公司名是否稳定？

两模式均稳定识别为 **`佛山盛盈包装制品有限公司`**（v26/v27 created 同；A/B 直调 3 轮同）。旧误识 `回册佛山盛包装制品限`（Tesseract 词级）已被 Native 文本真值取代，与模式无关。

## Q4：Precision 是否改善字号？

**Editor 重建逐块对比（同 geometry，仅 rawText 不同）：**

| 块 | CaseA 印刷体 fs/tgt/ink | CaseB 手写体 fs/tgt/ink |
|---|---|---|
| 0 吴健湘 | 21 / 122×35 / 62×20 | 21 / 122×35 / 62×20 |
| 1 客户经理 | 37 / 189×56 / 146×35 | 37 / 189×56 / 146×35 |
| 2 Telephone… | 89 / 1259×124 / 1168×92 | 89 / 1259×124 / 1168×92 |
| 3 佛山盛盈包装制品有限公司 | 55 / 679×80 / 654×52 | 55 / 679×80 / 654×52 |
| 4 Tel.:0757-888… | 28 / 370×44 / 250×23 | 28 / 370×44 / 256×23 |
| 7 Tel.: 0757-888… | 41 / 701×61 / 374×34 | 41 / 701×61 / 374×34 |
| 8 地址… | 36 / 1117×55 / 1102×35 | 36 / 1102×55 / 1076×35 |

→ **7/7 块 fontSize 与 target 完全一致**；ink 差值 <1%（仅标点宽度带入）。**Precision(手写体) 不改变字号结果**。

## Q5：字号误差归因

```
Native 模式（1 vs 2）影响：可忽略（文本行结构/长度几乎一致，字符差 19/≈130）
→ OCR/Text-Truth 层排除
Line Split：两模式行数恒 10、无 added/removed → Line Split 层排除
Geometry：本轮 geometry 恒定（Case A/B 同几何）→ Geometry 层不影响
→ 字号误差主因 = FONT / Reconstruction（textbox width 保留 OCR 视觉宽策略 + line-box 高度模型）
```

与 P2A 基准（RECONSTRUCTION_PRIMARY：reconWidthMAE 99px/380%）交叉一致。

## GATE 判定

| Gate | 判定 | 依据 |
|---|---|---|
| GATE-9-PRECISION-PROTOCOL | PASS | textType∈{1,2} 实证，无独立精准参数 |
| GATE-9-PRECISION-REPLAY | PASS | 同图 印刷体×1 + 手写体×2 全部 200/10 行 |
| GATE-9-PRECISION-TEXT | PASS | rawText 完整保存不 trim（diff 基原始行） |
| GATE-9-TEXT-TRUTH | PASS | v26/v27 created text === 对应模式 Native rawText（100%）|
| GATE-9-PRECISION-STABILITY | PASS | 手写体 H1==H2 逐字节一致 |
| GATE-9-SIZE-ATTRIBUTION | PASS | 字号误差 = **FONT（重建层）** |

## 下一刀（按 §十九 分支：Precision 文本基本没变化）

→ **直接进入 Font Calibration / Reconstruction 重建层**（textbox width 不再无条件保留 OCR 视觉宽、高度模型 line-box→ink 语义；fs 下限 10 保持）。不做 Geometry/Line Split/Native 侧改动。

## 安全

Cookie 全程仅注入浏览器内存；报告仅记录 cookie 名（SESSION/thirdMember 等已脱敏），无任何原值。runner 新增 flagWrite/modeReadback 诊断（证据工具）。