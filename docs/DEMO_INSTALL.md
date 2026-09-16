# Demo 安装（持续更新试装版）

> 这是 **OCR Demo 试装版**，非正式稳定版。用于真实 ScriptCat 真机测试「识别图片文字」闭环。

## 安装

1. 安装 [ScriptCat](https://scriptcat.org/)（浏览器扩展）
2. 在 ScriptCat 中「从链接安装」，打开：
   `https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js`
3. 安装脚本（版本号以 0.3.x 开头即 Demo 版）
4. 打开折立印编辑器（diy.zheliyin.com 设计页）

## 使用

1. 用网页正常上传 / 粘贴一张带文字的图片
2. **选中该图片**（画布上点击图片）
3. 点助手面板中的 **「识别图片文字」**
4. 等待（首次需加载本地 OCR 引擎 + 中文语言包，约 3~10 秒；第二次开始走 IndexedDB 缓存，约 1 秒）
5. 生成的真实 Textbox 出现在图片对应位置附近
6. 双击文字即可继续编辑

## 更新

Demo 分支每次推送后，ScriptCat「检查更新」即可拉取新版本（`@updateURL` 已指向 demo 分支，`@version` 递增）。

## 隐私

- OCR = 本地 **Tesseract.js**（WebAssembly，浏览器内运行）
- **图片不会上传到任何 OCR 服务/第三方**（仅经 GM 请求拉取 Tesseract 引擎脚本与语言数据，均为公开开源资源）