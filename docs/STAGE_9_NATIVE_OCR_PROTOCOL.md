# Stage 9 站内原生 OCR 协议（脱敏文档）

日期：2026-09-20
结论：**已找到站内原生 OCR 真实协议，并证明可脱离点击直接调用（GATE-9A-NATIVE-OCR-DIRECT = PASS，3/3）。**

## 1. 定位过程（真实浏览器取证）

- `https://diy.zheliyin.com/siteWeb/userCenterJsj/OCRTool.do`（有效登录态）= 站内「文字识别」工具页（印刷体/手写体，支持 Ctrl+V 粘贴 / 选择图片）。
- 页面脚本 `siteWeb/js/jsj/toolUse.js`：`onPaste` → `FormData{file,textType}` → `$.ajaxPromise(POST .../uploadOCR.do)`。
- 全链路 hook（XHR/fetch/WebSocket/beacon/FormData/FileReader/canvas）实捕到同接口 POST 与成功的 OCR 响应。

## 2. 协议（脱敏）

```
POST /siteWeb/userCenterJsj/uploadOCR.do
Content-Type: multipart/form-data（FormData，jQuery ajax contentType:false/processData:false）

FormData:
  file      = 图片 File（粘贴/选择的图片文件；JPG/PNG；≤10MB）
  textType  = "1"（印刷体）| "2"（手写体）；默认 "1"

认证依赖：同域登录 Cookie 会话（SESSION、thirdMember 等；内容不在此文档展示）。
上下文依赖：同源页面（Referer/Origin 由页面 world fetch 天然满足）。
```

响应（HTTP 200, application/json;charset=UTF-8）：

```json
{
  "success": true,
  "message": "0",
  "userData": "吴健湘<br/>客户经理<br/>Telephone: +8615913171583<br/>..."
}
```

- `userData` = 识别文本，行分隔符 `<br/>`（页面侧 `copyOcrText`/`downloadOcrText` 均按 `<br/>`/`<br/>` 拆分）。
- 失败形态：`success=false` 或 `message` 非 "0"。

## 3. 直接调用验证（真实名片 real-card-shengying.png，零点击）

| run | status | 行数 | 真值命中（吴健湘/佛山盛盈包装/1591317158/0757-88809856/sandy.wu） |
|---|---|---|---|
| 1 | 200 | 10 | 全部命中 |
| 2 | 200 | 10 | 全部命中 |
| 3 | 200 | 10 | 全部命中 |

GATE-9A-NATIVE-OCR-DIRECT = PASS（同一图片+同一登录态+页面 world fetch 直接调用，无点击/无 UI/无模拟 Alt+Q；schema 稳定）。

## 4. 能力边界（如实）

- **返回纯文本（无 bbox）** → 按 Stage 9 架构：**Native OCR = Text Truth；Baidu = Geometry Truth**。
- Token/CSRF：未发现额外动态 token；认证即会话 Cookie（运行时自浏览器上下文获得，禁止写入代码/仓库）。
- 接口稳定性：本日 3/3 稳定；部署方可能调整，Provider 层需可配置 basePath 与 textType。

## 5. 安全纪律

- 本页所有 Cookie 原值/Token **未**进入 Git/报告/日志；Provider 运行时从页面会话读取形成。
- 生产只允许「页面上下文 fetch 直调」，禁止通过自动点击/坐标模拟实现（用户硬规则）。