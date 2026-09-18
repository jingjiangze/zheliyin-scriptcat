# Save / Reload 运行时审计报告（SAVE_RELOAD_RUNTIME_REPORT）

- Date: 2026-09-18
- Baseline: `test` HEAD `a0ff1fd`（v0.3.9.0）
- 目标编辑器: `https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do`
- 本轮性质: 审计 + 真机取证，**生产代码修改 = 0**（新增 runtime 探针与报告，不升版）

## 结论先行

> **SAVE_RELOAD = BLOCKED（业务前置）**
>
> 保存链路存在**真实订单前置状态**：自动化（合法登录的 External profile）在
> `thirdDiyAdd.do` 添加模式上下文下，`#diyId` 为空 → 订单检查
> `IfDiyOrderidExit.do` 返回 `{"data":"","status":"error"}` → 前端终止保存，
> **全程零写库请求（未出现 `third/saveThirdUserDesign.do`）**，刷新后对象不恢复。
> 该 Blocker 属于产品业务流（添加模式保存 = 提交印刷订单），自动化红线禁止伪造订单，
> 故自动化无法合法解除；需要有效订单上下文（真实设计 URL / 用户手动保存一次）。

## 1. 保存链路审计（源码级，CustomerHeadMenuBarThird.js v=20260707017）

保存按钮 handler（`.rightBtn .save`）：

```js
Ha = "save";
var b = a("#diyId").val();
a.ajax({
  url: "third/IfDiyOrderidExit.do?designId=" + b,   // 订单前置检查（同步 async:false）
  type: "post",
  success: function (b) {
    if ("1" == b.testThirdOrderNo) { l.alert("作品已经提交制作，不能再次提交"); E = !1; }
    else {
      // 检查 worksStatus / isAdmin / canEdit（提交状态锁）
      // 检查图片容器（isNoExistImgForRq / eachImgisExitArray）
      // 弹「设计信息」表单（pb("save") 生成，sourceId==999 走 pb 分支）
      // 表单「确定」→ Ya() 字段校验 → U("save", d, ub)
    }
  }
});
```

写库函数 U()（`U=function` @61431）：

```js
var m = "third/saveThirdUserDesign.do";   // 真正写库 URL
// 前置：multiBiaoQianFlag 空白页检查 / aa 定时保存锁 / E 提交锁 / #checkOperate
// 图片检查：isMaskImgEmpty(c) → "您使用的相框素材没有放入图片，请放入图片以后再保存或提交！"
// 通过后发送 saveThirdUserDesign.do（携带 diyId 等）
```

字段校验 Ya()（@51273）：

```js
workName: 必填、≤40 字符、仅文字数字英文
userName: 必填、仅文字数字英文
telNo:    非空才校验手机号格式（本设计上下文无此字段注入）
remarkInfor: 仅 137/12/282/13/48 类才强制（typeid=12 → 不强制）
```

## 2. 真机取证（probe3–probe7，External Chrome profile-usc3 真实登录）

### probe3 — 保存点击后请求序列与响应体

```
jq.post third/IfDiyOrderidExit.do?designId=            ← designId 参数为空
POST   third/IfDiyOrderidExit.do?designId= ->200
       body={"data":"","status":"error"}               ← 订单检查失败
```
- 弹层「设计信息」：`作品名：*用户名：*备注信息：*印刷格式：PDF CDR(x4) JPG TIF 色彩模式：CMYK RGB 顾客信息：以下信息由订单号获取，确认当前设计与客户信息是否一致 确定 取消`
- 之后刷新：对象不恢复（probeOnCanvas=0），收尾验证画布回到 9 对象基线。

### probe4 — 填写必填项 + 点确定后

- 成功填写 `#workName`=P4测试作品、`#userName`=P4测试用户，点击 modal「确定」（confirm="clicked"）
- **网络序列仍只有 IfDiyOrderidExit error，无 saveThirdUserDesign.do 写库**，刷新不恢复。
- 说明确定回调被前端校验/前置拦截（结合 probe7 字段审计，最可能为校验失败或写库前置图片检查）。

### probe5 — thirdDiyEdit.do 编辑模式

- External 会话打开 `252438/.../thirdDiyEdit.do`：60s 未进入编辑器（无 CanvasObjVO/drawText、无保存按钮），
  该编辑上下文对当前会话不可用。

### probe6 — IfDiyOrderidExit 调用源码定位

- 命中 `CustomerHeadMenuBarThird.js`（保存/提交共用订单检查逻辑），确认 designId 来自 `#diyId`。

### probe7 — 关键隐藏字段审计 + 完整请求序列

| 字段 | 值 | 含义 |
|---|---|---|
| `#diyId` | **（空）** | 保存/订单检查的 designId 来源为空 → 订单检查必然 error |
| `#sourceId` | 999 | 模板来源（走 pb 表单分支） |
| `#worksStatus` | 0 | 未提交（通过） |
| `#isAdmin` | 0 | 非管理员 |
| `#thirdOrderNo` | （空） | 订单检查 error → 未注入订单号 |
| `#typeid` | 12 | 名片类 |
| `#diyTypeNumCup` | 02 | 名片子类 |

保存表单字段（modal 内枚举）：`#workName`（可见必填）、`#userName`（可见必填）、
`#remarkInfor`（隐藏）、`#printingtype`（隐藏，默认 pdf）、`#colorspace`（隐藏，默认 cmyk）。
**无 telNo/address 注入**（顾客信息由订单号获取，error 时为空）。

保存点击后完整请求序列（含响应体）：
```
GET  FormatCard/getDicItem.do?code=M001        （字段下拉数据）
GET  commontool/queryWebInfo.do?sourceId=999   （站点信息，webName=简设计）
POST diy/findTemplateById.do                  （模板数据）
POST diy/findAllFont.do                       （字体列表）
POST third/IfDiyOrderidExit.do?designId= -> {"data":"","status":"error"}   ← 终点，无写库
```

## 3. Blocker 清单

| # | Blocker | 证据 | 能否自动化解除 |
|---|---|---|---|
| B1 | 订单前置检查：`IfDiyOrderidExit.do?designId=`(空) → `status:error` | probe3/4/7 | **否**（需有效订单；红线禁止伪造订单） |
| B2 | `#diyId` 为空 → 写库 `saveThirdUserDesign.do` 无有效 designId | probe7 audit | **否**（添加模式无设计 ID 上下文） |
| B3 | 保存前图片/相框检查（isMaskImgEmpty / eachImgisExitArray） | 源码 U() | 视模板而定（本次未到达此层） |
| B4 | thirdDiyEdit.do 编辑模式对当前会话不可达 | probe5 | **否**（会话权限） |

## 4. 判定

```
SAVE_RELOAD = BLOCKED
- reloadStability（本地草稿）: 不成立（刷新后对象不恢复，probe3/4 一致）
- serverSavePersistence（服务端写回）: 不可达（保存被订单前置拦截，零写库请求）
- 原因分类: 真实业务前置（添加模式保存需有效订单），非自动化脚本缺陷、非本地缓存问题
- 红线遵守: 未伪造订单、未绕过校验、未修改服务端、未读取/复制 Cookie
```

## 5. 解锁路径（需用户决策）

1. **提供有效订单上下文的设计 URL**：例如真实下单后生成的 `thirdDiyEdit.do` 或带 `#diyId` 的添加页；
   —— 保存流程可在该上下文中重新探测。
2. **用户手动完成一次保存**：在 External Chrome（或用户自己的浏览器）对 252438 做一次真实保存
   （填写设计信息 + 确定），然后我们验证 reload 后对象恢复，完成闭环证据。
3. **提供测试订单号**：在保存表单中注入真实订单号（`#thirdOrderNo`/`#tbOrderNo`），
   使订单检查通过（需用户提供有效订单号，且须符合站点业务）。

## 6. 证据文件

- `runtime/stage-6-2-save-reload-probe3.js` / `probe4.js` / `probe5.js` / `probe6.js` / `probe7.js`
- `runtime/reports/stage-6-2-save-reload-probe3.json` ~ `probe7.json`
- 先例：`runtime/reports/stage-6-2-save-reload-probe.json`（v1，刷新恢复误判为 SERVER-SAVE-PERSISTED）、
  `stage-6-2-save-reload-probe2.json`（v2，接受弹窗后不恢复 → PENDING）——本轮 probe3/4 以
  响应体级证据定案 BLOCKED。

## 7. 遗留

- 解锁路径任一落地后，重跑最小 1 对象 Save/Reload 闭环（text/x/y/width/height/rotation/uuid/markuuid 逐项比较）。
- Stage 7 验证报告（`docs/stage-7-validation-report.md`）仍未产出。
