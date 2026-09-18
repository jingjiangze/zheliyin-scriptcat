# Stage 7.8 OCR Fixture 图集（§九）

> 生成命令：`node runtime/stage-7-8/fixtures/gen-fixtures.js`（零依赖）

## 矩阵

| Key | 名称 | 验证焦点 | 页面 |
| --- | --- | --- | --- |
| A | single-size | 单一字号：全部 32px，应稳定合成 1 个段落块（每行独立也可接受，但禁止错误跨块/丢字） | front |
| B | title-plus-body | 大标题 44px + 小正文 20px×3：标题必须与正文拆成不同 TextBlock（False Merge Rate 重点） | front |
| C | big-small-digits | 大字 44 + 小字 18 + 数字 26：三种相对字号应分别归属不同 sizeCluster | front |
| G | same-line-mixed-size | 同一水平线上大字34+小字14：该『同一行大+小』不得被粗暴合并/丢失字高差（§二十取证样本；groupWordsToLines 字高容差 0.5 行为以真机证据为准） | front |
| H | stacked-different-size | 上下两行字号明显不同（40 / 16）：必须拆 2 个 TextBlock（§二十三/§二十七 宁拆勿合） | front |
| I | decorative-symbols | 装饰性特殊符号：★◆●▲♥ 不应被粗暴过滤，safeText 原样保留（§十 禁止 /[^一-龥a-zA-Z0-9]/g） | front |
| J | cjk-punctuation | 常见中文标点：，。！？、；：『引号』（）《》…—— 全部 SAFE 保留（§十二） | front |
| K | ascii-structure | 英文/数字/结构字符：ABC Ltd. +86 1380-013-8000 zhang@mail.com https://www.example.com 结构不得被空格打散 | front |
| L | exotic-unicode | 非常规 Unicode：①② Ⅳ ½ ℃ ™ ®。行为按羊羊真机证据记录（§十五 不因特殊就删；emoji 非 BMP 需真机验证 DIY 行为后定级） | front |
| M | zero-width-invisible | 零宽/不可见字符（​ ZWSP）：视觉上与普通文本相同，sanitizer 应移除不可见字符且不留空白（§十五 首轮审计） | front |

## 限制（如实记录，不冒充 PASS）

- 离线产出的 `.svg` 是矢量源；OCR 需要的位图（`.png`）必须由**真机浏览器**渲染：`canvas` + `ctx.fillText('SimHei')` + `toDataURL`（真机第八章做法）。纯 Node 重造 CJK 字形属于过度工程，本阶段不做。
- Fixture L：`①② Ⅳ ½ ℃ ™ ®` 在 BMP 内；emoji（非 BMP）行为待真机验证后才定 SAFE/NORMALIZABLE/BLOCKED（§十五）。
- Fixture M：零宽字符不可见，视觉上等同普通文本；是否被 OCR 引擎直接忽略、sanitizer 是否清理干净 → 真机证据。
