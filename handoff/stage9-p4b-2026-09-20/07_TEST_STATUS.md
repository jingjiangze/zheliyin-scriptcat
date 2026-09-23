# 07 — Test Status（2026-09-20 本机实时执行结果）

> 以下为交接时刻**实际重新执行**的输出（非推断）。全部 PASS。

## 单测（node）

```
runtime/stage9/image-ink-target.test.js      pass=14 fail=0     ← P4-B（ImageInk + TargetResolver）
runtime/stage9/recognition-mode.test.js      pass=9  fail=0     ← P3（路由/校准/隔离）
runtime/stage9/transaction-identity.test.js  pass=10 fail=0     ← P1（事务身份 + ocrAdjust 门禁）
runtime/stage9/native-ocr-provider.test.js   pass=12 fail=0     ← Native provider + fallback
runtime/stage9/text-truth-gate.test.js       pass=10 fail=0     ← Text Truth
runtime/stage9/baidu-profile.test.js         pass=7  fail=0     ← Baidu profiles
runtime/stage9/native-ocr-diff.test.js       pass=7  fail=0     ← Native A/B diff
runtime/stage9/altq-provider.test.js         pass=10 fail=0
runtime/stage9/text-geometry-matcher.test.js pass=10 fail=0
```

## Legacy 回归（tests/editor-object-model）

```
baidu-provider.test: ALL PASS
common-schema.test:  ALL PASS
```

## 语法检查（node --check）

```
extension/src/editor/image-ink-target.js   : OK
extension/src/editor/font-target-source.js : OK
extension/src/editor/page-bridge.js        : OK
zheliyin-card-assistant.user.js            : OK
```

## 统计

- P4-B 新测试：14/14
- Stage 9 单测合计：89/89（14+9+10+12+10+7+7+10+10）
- legacy：ALL PASS
- node syntax：ALL PASS

## 运行命令速查

```
node runtime/stage9/*.test.js
node tests/editor-object-model/baidu-provider.test.js
node tests/editor-object-model/common-schema.test.js
node runtime/stage8b/generate-runtime-manifest.js   # @require 版本一致性（OK: 0.3.11.40, 25 modules）
```

## 说明

- 未见 “npm test” 脚本；仓库测试均按上述 node 直跑方式执行（与既有开发一致）。
- 真机类证据（E2E / benchmark / audit）不属于单测，见 08 索引；`baidu-geometry-benchmark.js --selftest` 可无限联网做纯函数自检（PASS）。