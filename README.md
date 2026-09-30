# dsh-waaagh-ork

WAAAGH! —— 给 DSH 加一个绿皮兽人，把写代码变成兽人式咆哮。

## 为什么做这个

用 AI 写代码的时候，感觉就像战锤里的绿皮兽人——「俺寻思」一下，代码就 WAAAAAGH 地冒出来了。所以做了这个插件：输入框旁边站一个会眨眼的像素绿皮，模型思考/输出时都显示成绿色 `Waaaaaaagh!!!`（点一下看原文），连运行时的 `Deep diving...` 都换成了 `Waaaaaaagh!!!`。

插件**不碰输入框里的草稿**：你输入什么、发出去的就是什么，模型收到的永远是原文。

## 特性

- 绿色皮肤：输入框变成**漫画对话泡泡**（粗墨线 + 硬投影 + 左侧一个小尾巴），主发送按钮是绿色 `Waaagh!` 药丸。
- 绿皮头像：**全身**像素兽人站在漫画泡泡**左侧的页面空白里**（完全不压住泡泡，实测间距 1px）——等待时有两套待机模组（挠头傻笑 / 坐地上发呆，各 3 帧、眨眼是"睁→半闭→闭"的眼皮滚动），载入时随机选一套、每 20 秒换成**另一套**；回合开始时换成三套吼叫模组之一（挥舞双臂 / 抡砍刀 / 突突枪，各 5 帧、约 350ms 一帧、1.75 秒一轮），**每次开跑重抽**，而且**只要模型还在回复，每 9 秒就换一套动作并换一句嚎叫**；头顶绿色爆炸星形喊 `Waaagh!!!`（气泡也在左侧空白，不压聊天记录）。
- 输出遮罩：助手的过程与正文替换成绿色 `Waaaaaaagh!!!`——完成的回合是静态文字，流式回合是逐字生长的动画；点消息看原文，`查看详情` 按钮全局切换。
- 运行提示：`Deep diving...` / `深度求索中，用时 …` 变成绿色 `Waaaaaaagh!!!`，旁边那条鲸鱼尾巴换成会点头的绿皮头像（桌面版 0.2.0 的 `TextShimmer` 把标记从 `data-text-shimmer` 改成了 `data-shimmer`，所以按 `runningText` 类名兜底）。
- 过程行：`正在读取文件` / `准备写入文件` 这类 step-process 行，图标变成绿皮头像、文字变成每行随机嚎叫（点 `查看详情` 恢复原文）。
- 随机嚎叫：每个遮罩的 `a` 串长度都重新随机（`W` + 2~31 个 `a` + `gh` + 1~3 个 `!`）——每条消息一个、流式动画一个、运行提示与喊话气泡各一个。
- 兽人小动作（纯 CSS，`prefers-reduced-motion` 下全部关闭）：
  - 待机：绿皮呼吸式起伏 + 眨眼；输入框一开始有内容它就凑近、颜色更绿。
  - 运行中：整只兽人快速摇摆咆哮、带绿色辉光。
  - 发出消息：你自己的消息落到会话里时，它会吼一下（一次性 0.8s）。
  - 输出遮罩：每条遮罩弹入；流式时一边逐字生长一边左右晃。
  - 过程行：每个绿皮图标随行出现来一次「dakka」闪光，鼠标悬停时凑近。
  - 按钮：`Waaagh!` 药丸悬停鼓起、按下压扁；`查看详情` 按下回弹。
- 过程行图标：工具调用、上下文注入、压缩行的小图标换成绿皮头像（失败时保留红圈）。
- 自定义头像：设置 → 通用里可粘贴图片 URL 或 `data:image` 数据替换内置头像。

## 兼容性

| 运行形态 | DSH 版本 | 状态 |
| --- | --- | --- |
| `dsh web`（浏览器） | 0.1.6-alpha.2 及以上 | ✅ |
| DSH Desktop（Electron 桌面版，自带 0.1.7-rc.2） | 0.1.7-rc.2 | ✅ |

0.1.6 / 0.1.7 把输入框换成了 Lexical 富文本、把提交入口从插槽 action 移到了 composer 自己的键盘面、并把运行中提示从「可见的 live region」挪进了当前回合的过程行——插件已按这些变化改写，同时对老结构保留兼容分支。

## 安装

### Web 配置档

```sh
dsh plugin --profile web add dsh-waaagh-ork
```

然后重启 `dsh web`，刷新页面即可。

### 桌面版

桌面版使用 `~/.dsh/profiles/desktop` 配置档，由 Electron 应用独占管理：

- 推荐：在桌面版里打开 **设置 → 插件**，安装 `dsh-waaagh-ork`；
- 或手工把依赖写进 `~/.dsh/profiles/desktop/package.json`：

  ```json
  {
    "dependencies": { "dsh-waaagh-ork": "^0.2.0" },
    "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-waaagh-ork"] } }
  }
  ```

  再用桌面版自带的 pnpm 安装，然后重启桌面版。

本地开发（两个配置档同理）：

```sh
dsh plugin --profile web add link:/path/to/dsh-waaagh-ork
```

## 开发

源码在 `src/`，`lib/` 与 `src/assets/` 里的 PNG 都是**提交进仓库的生成产物**——DSH 在安装插件时不会构建任何东西，运行时直接读 `lib/client.js`，所以产物必须入库；但产物一律由生成器产出，不允许手改。

```sh
pnpm install          # 安装 esbuild / typescript 与 DSH 类型契约包
pnpm run typecheck    # tsc --noEmit，对真实 .d.ts 检查插槽名、props、选择器字段
pnpm run sprite       # scripts/sprite.mjs → src/assets/ork-open.png（图标用的大头）
pnpm run check-assets # 校验三张精灵图的尺寸/帧数契约（128×160 × 帧）
pnpm run build        # src/ → lib/index.js（host）+ lib/client.js（浏览器半）
pnpm run verify       # typecheck + sprite + check-assets + build，并校验 lib/ 与 ork-open.png 没有漂移
```

**吉祥物是 AI 生成的**（`scripts/mascot.py`）：本机没有可用的国内生图 skill（小云雀要 `XYQ_ACCESS_KEY`，SpriteCook 要它自己的 MCP 服务端），但用户环境里已经有**火山方舟**凭据，于是走 `doubao-seedream-4-0` 的 `images/generations`：

```sh
# ARK_API_KEY / ARK_BASE_URL / VOLC_IMAGE_MODEL 从环境读取；密钥不会被打印
python scripts/mascot.py              # 生成 5 帧 → 组装两条雪碧图
python scripts/mascot.py --raw <dir>  # 用已保存的原图重建，不再消耗额度（CI 走这条）
```

角色一致性靠**参考图链**：第一帧冲锋咆哮作为后续每一帧的 `image` 输入，提示词里再强调一遍设计（绿皮、红眼、尖刺护肩、腰带、金属靴、粗黑描边）。原图统一画在**纯品红背景**上，`mascot.py` 按**色相**抠掉背景和靴子投影（只按颜色距离抠会把投影留成粉色污渍），再裁到角色外接框、等比塞进 128×160、量化到 64 色。

| 文件 | 尺寸 | 内容 | 来源 |
| --- | --- | --- | --- |
| `ork-idle-a.png` | 128×160 ×3 帧 | 等待模组 A：挠头傻笑，眨眼过渡帧 | `scripts/mascot.py`（AI 生成） |
| `ork-idle-b.png` | 128×160 ×3 帧 | 等待模组 B：坐在地上发呆，眨眼过渡帧 | 同上 |
| `ork-shout-a.png` | 128×160 ×5 帧 | 干活模组 A：挥舞双臂、小跳着喊 | 同上 |
| `ork-shout-b.png` | 128×160 ×5 帧 | 干活模组 B：抡小砍刀 | 同上 |
| `ork-shout-c.png` | 128×160 ×5 帧 | 干活模组 C：端着小枪突突 | 同上 |
| `ork-open.png` | 144×144 | 16px 图标用的大头（工具行 / 运行行 / 过程行） | `scripts/sprite.mjs`（手绘） |

模组由 `<html>` 上的 `data-waaagh-idle` / `data-waaagh-set` 选择，CSS 里每套只换 `background-image`；帧数统一（待机 3 帧、干活 5 帧）所以两套翻帧动画共用 keyframes。帧数不是随手定的：3 帧的循环肉眼就是"闪"，5 帧 + 每帧 350ms 才像在动。

多帧动画都拼成**竖直雪碧图**，CSS 只放一个 URL，用 `background-position` 走几步切帧。手绘那张 `node scripts/sprite.mjs --dump` 会打成 ASCII 像素图（`.` 透明、其余是调色板索引）——之前那几轮手绘的 bug 都是靠它定位的。手绘 PNG 用**无压缩 DEFLATE 块 + 自写 CRC/Adler** 编码，字节跨平台一致，所以 CI 能像校验 `lib/` 一样校验它没有漂移；AI 生成的两条雪碧图需要 API 额度，CI 改为校验尺寸契约。

| 路径 | 作用 |
| --- | --- |
| `src/client/index.ts` | 浏览器半：插槽注册、绿皮头像、输入/输出遮罩、运行提示 |
| `src/host/index.ts` | Node 半：有意的空实现，只为让 Loader 条目能激活 |
| `src/assets/*.png` | 精灵图（手绘图标 + AI 生成的吉祥物），构建时内联成 data URL |
| `scripts/sprite.mjs` | 手绘图标头：像素画 + 确定性 PNG 编码 + `--dump` 像素图 |
| `scripts/mascot.py` | AI 生成吉祥物：调火山方舟 doubao-seedream、抠品红背景、拼雪碧图 |
| `scripts/check-assets.mjs` | 校验三张图的尺寸/帧数契约 |
| `scripts/build.mjs` | esbuild 构建：host 出 ESM，浏览器半出「懒 CJS 工厂注册」包 |
| `lib/` | 构建产物，`lib/client.js` 由 `dsh-client-modules` 通过 `/plugins` 提供给页面 |

关于浏览器半的产物格式：DSH 以经典脚本方式加载每个插件的客户端包，脚本必须调用 `window.__ModuleLoader__.load({ id, factory })` 注册一个惰性 CJS 工厂，工厂体拿到的 `require` 是 shell 的冻结模块表（`react` 属于平台种子，必须保持 external）。这正是 `scripts/build.mjs` 用 banner/footer 包住 esbuild CJS 输出的原因。

类型不靠猜：`@deepseek-ai/dsh-client-*` 在 npm 上带 `lib/types/**/*.d.ts`，devDependencies 里按 0.1.7-rc.2 精确锁定后，插槽名（`SlotMap` 声明合并）、seat 的标准 props（`useInput`/`useSession`/`inputActions`）、`InputState` 字段都由编译器把关——写错 slot 名或字段名会直接编译失败。CI 会跑 `typecheck` + `sprite` + `build` + `git diff --exit-code -- lib src/assets`。

## License

MIT
