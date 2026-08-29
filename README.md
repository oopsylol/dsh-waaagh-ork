# dsh-waaagh-ork

WAAAGH! —— 给 DSH Web 加一个绿色像素绿皮兽人，把 AI 写代码的过程变成兽人式咆哮。

## 功能

- **绿色输入框**：composer 卡片加绿色边框 + 绿光。
- **提交按钮 = Waaagh!**：发送按钮变成绿色 `Waaagh!` 胶囊按钮（停止按钮也变绿）。
- **点头绿皮**：输入框左侧工具行里一个内联 SVG 像素兽人，一直点头（魔性动画）。
- **输入掩码**：输入需求按回车后，输入框文字被替换成随机长度的 `waaaaaaaagh`，消息暂不发送；点绿皮还原真实需求，再回车才真正发送。模型永远收到真实需求。
- **输出掩码**：模型运行时的思考（Think）与正文一律显示为绿色 `waaagh`，工具调用行保持可见；输入框右侧的「查看详情」总开关点开才显示原文，再点回到掩码。
- **运行指示器**：`Deep diving...` → 绿色 `waaagh`。

## 安装

```sh
dsh plugin --profile web add link:D:/MacShare/waaagh
```

然后重启 `dsh web`，刷新页面即可。

## 结构

- `cordis.patch.yml` — 插入 `{ id: waaagh-ork, name: 'dsh-waaagh-ork' }` loader 条目。
- `lib/index.js` — 宿主半体（no-op）。
- `lib/client.js` — 浏览器半体（全部 UI 逻辑，手写 JS，无需构建）。
