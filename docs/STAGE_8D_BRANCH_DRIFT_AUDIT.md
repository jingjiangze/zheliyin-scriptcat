# Stage 8D 分支漂移审计（Branch Drift Audit）

审计时间：2026-09-20（8D 启动冻结期）

## 1. 分支与基线

| 项 | 值 |
|---|---|
| test | `5da807ba01454cc8ea98d0e85e14ac155c101741` |
| stage-8b-ocr-reconstruction-engine | `e74ffc6ae9cd3ba2ada8c87c0d88cbb9cfdfaa02` |
| stage-8d-ocr-quality-reconstruction（本轮） | `e74ffc6`（= stage-8b HEAD，快进合并后） |
| merge-base | `5da807b`（即 test HEAD） |
| version | test / stage-8b 均为 `0.3.11.20` |

## 2. 结论摘要

- **test 是 stage-8b 的严格祖先**：`test..stage-8b` 有 7 个 commit，`stage-8b..test` 为空 → test 不包含 stage-8b 缺失的任何修改。
- **test 与 stage-8b 之间的生产代码差异 = 0**：`git diff test e74ffc6` 仅命中 6 个 runtime/ 文件（审计报告 + 测试 runner），`zheliyin-card-assistant.user.js` / `extension/` / `docs/` 零差异。
- **没有未回到 dev 的 production changes**。
- 因此 stage-8d 直接从 test 创建后再快进合并 stage-8b 是安全的：不丢失生产代码，且带上了 8B 的测试工具与证据。

## 3. `test..stage-8b` 的 7 个 commit 分类

| commit | 类型 | 内容 | 是否生产 |
|---|---|---|---|
| `c3229ef` | evidence | v0.3.11.19 复跑证据（旧 gate 角差归类复原） | 否（报告） |
| `c9e237d` | evidence | v0.3.11.20 最终 Gate 证据（控制组 4/4、真实名片 13+4保留/0拒绝） | 否（报告） |
| `6c9b10e` | evidence | 旋转案矩阵 Gate 证据（B10 3/3、C30 2/2、D45s05 2/2 ok） | 否（报告） |
| `b909ecc` | evidence | runner 支持 ZY_OUT 短输出名；first 路由矩阵证据 | 否（报告+runner） |
| `28ad822` | test-fix | runner 矩阵隔离修复（rollback b8r- 前缀、armHook listener 清理） | 否（runtime runner） |
| `8ec9eed` | evidence | 54 矩阵重跑证据（bg/active 有效；first 因模板自带图片干扰弃用） | 否（报告） |
| `e74ffc6` | evidence | 删除无效 first 路由矩阵报告 | 否（报告删除） |

## 4. first 路由弃用说明（8D §30 相关）

`page-bridge.js` 的 first-image 命中为 `canvas.getObjects().find(o => o.type === "image")`（第 735 行）。
模板 252438 自带图片对象排在注入图之前 → first 路由恒定命中模板图，注入的目标四边不生效。
结论：**first 路由在含自带图片的模板上不可用**，54 矩阵降级为 Regression 后采用 background / active 两路由。

## 5. 54 矩阵状态（8D §30 降级）

已完成 v0.3.11.20 收尾重跑，作为 Regression 基线入库（不再作为根因发现手段）：

- `runtime/reports/stage-8b/matrix-54-bg-v0321120.json`（background，18 case × 3 块）
- `runtime/reports/stage-8b/matrix-54-active-v0321120.json`（active，18 case × 3 块）
- 页面侧 Gate：0 拒绝、0 崩溃；运行期位置误差亚像素、角度 0、fontSize 命中源字号（控制组口径）。宽/高差异按 8B 定案语义仅诊断（advance 比宽、fs sanity 验高）。

等 8D 三 Gate（OCR-QUALITY / TEXT-FIT / REAL-IMAGE）通过后，再按 3 routes × 6 angles × 3 scales 复跑回归。

## 6. 后续流程约定（延续既有纪律）

```
开发分支 (stage-8d-ocr-quality-reconstruction)
  ↓ 每一步独立 commit
  ↓ push origin stage-8d-ocr-quality-reconstruction
  ↓ test fast-forward（production 变化时同步）
新增：production 改动 → 五处统一升版（userscript @version / const VERSION / @require ?v / extension manifest / extension/assistant.js）
禁止：force push；在 test 上直接堆生产代码；假定期望分支包含 test 全部修改
```