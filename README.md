# dsh-waaagh-ork

WAAAGH! —— 给 DSH 加一个绿皮兽人，把写代码变成兽人式咆哮。

## 为什么做这个

用 AI 写代码的时候，感觉就像战锤里的绿皮兽人——「俺寻思」一下，代码就 WAAAAAGH 地冒出来了。所以做了这个插件：输入框旁边站一个会眨眼的像素绿皮，模型思考/输出时都显示成绿色 `Waaaaaaagh!!!`（点一下看原文），连运行时的 `Deep diving...` 都换成了 `Waaaaaaagh!!!`。

## 兼容性

| 运行形态 | DSH 版本 | 状态 |
| --- | --- | --- |
| `dsh web`（浏览器） | 0.1.6-alpha.2 及以上 | ✅ |
| DSH Desktop（Electron 桌面版，自带 0.1.7-rc.2） | 0.1.7-rc.2 | ✅ |

0.1.6 / 0.1.7 把输入框换成了 Lexical 富文本、把提交入口从插槽 action 移到了composer 自己的键盘面、并把运行中提示从「可见的 live region」挪进了当前回合的过程行——插件已按这些变化改写，同时对老结构保留兼容分支。

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

## License

MIT
