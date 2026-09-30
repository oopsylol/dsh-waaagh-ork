# dsh-waaagh-ork

WAAAGH! —— 给 DSH 加一个绿皮兽人，把写代码变成兽人式咆哮。

## 为什么做这个

用 AI 写代码的时候，感觉就像战锤里的绿皮兽人——「俺寻思」一下，代码就 WAAAAAGH 地冒出来了。所以做了这个插件：输入框旁边站一个会眨眼的像素绿皮，模型思考/输出时都显示成绿色 `Waaaaaaagh!!!`（点一下看原文），连运行时的 `Deep diving...` 都换成了 `Waaaaaaagh!!!`。

插件**不碰输入框里的草稿**：你输入什么、发出去的就是什么，模型收到的永远是原文。

## 特性

- 绿色皮肤：输入框卡片绿边框 + 发光，主发送按钮变成绿色 `Waaagh!` 药丸。
- 绿皮头像：输入框左侧一个会眨眼的 192×192 像素兽人；回合运行时它会把输入框占位符换成循环兽人台词（`More dakka!`、`俺寻思这能成……`）。
- 输出遮罩：助手的过程与正文替换成绿色 `Waaaaaaagh!!!`——完成的回合是静态文字，流式回合是逐字生长的动画；点消息看原文，`查看详情` 按钮全局切换。
- 运行提示：`Deep diving...` / `深度求索中，用时 …` 变成绿色 `Waaaaaaagh!!!`（桌面版那条蓝色 RunningStatus 也认）。
- 随机嚎叫：每个遮罩的 `a` 串长度都重新随机（`W` + 2~31 个 `a` + `gh` + 1~3 个 `!`）——每条消息一个、流式动画一个、运行提示每回合一个，不会两次长得一样。
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

源码在 `src/`，`lib/` 是**提交进仓库的构建产物**——DSH 在安装插件时不会构建任何东西，运行时直接读 `lib/client.js`，所以产物必须入库；但产物一律由构建生成，不允许手改。

```sh
pnpm install          # 安装 esbuild / typescript 与 DSH 类型契约包
pnpm run typecheck    # tsc --noEmit，对真实 .d.ts 检查插槽名、props、选择器字段
pnpm run build        # src/ → lib/index.js（host）+ lib/client.js（浏览器半）
pnpm run verify       # typecheck + build + 校验 lib/ 没有漂移
```

| 路径 | 作用 |
| --- | --- |
| `src/client/index.ts` | 浏览器半：插槽注册、绿皮头像、输入/输出遮罩、运行提示 |
| `src/host/index.ts` | Node 半：有意的空实现，只为让 Loader 条目能激活 |
| `src/assets/*.png` | 精灵图，构建时内联成 data URL |
| `scripts/build.mjs` | esbuild 构建：host 出 ESM，浏览器半出「懒 CJS 工厂注册」包 |
| `lib/` | 构建产物，`lib/client.js` 由 `dsh-client-modules` 通过 `/plugins` 提供给页面 |

关于浏览器半的产物格式：DSH 以经典脚本方式加载每个插件的客户端包，脚本必须调用 `window.__ModuleLoader__.load({ id, factory })` 注册一个惰性 CJS 工厂，工厂体拿到的 `require` 是 shell 的冻结模块表（`react` 属于平台种子，必须保持 external）。这正是 `scripts/build.mjs` 用 banner/footer 包住 esbuild CJS 输出的原因。

类型不靠猜：`@deepseek-ai/dsh-client-*` 在 npm 上带 `lib/types/**/*.d.ts`，devDependencies 里按 0.1.7-rc.2 精确锁定后，插槽名（`SlotMap` 声明合并）、seat 的标准 props（`useInput`/`useSession`/`inputActions`）、`InputState` 字段都由编译器把关——写错 slot 名或字段名会直接编译失败。CI 会跑 `typecheck` + `build` + `git diff --exit-code -- lib`。

## License

MIT
