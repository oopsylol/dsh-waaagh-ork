# dsh-waaagh-ork

WAAAGH! —— 给 DSH Web 加一个绿色像素绿皮兽人，把 AI 写代码的过程变成兽人式咆哮。

## 功能

- **绿皮兽人头像**：输入框左侧一个会眨眼的像素绿皮（3/4 侧脸、獠牙 + 金属下颚板），面对输入框。
- **绿色输入框**：composer 卡片加绿色边框 + 绿光；发送按钮变成绿色 `Waaagh!` 胶囊。
- **输入掩码**：输入需求按回车后，输入框文字被替换成随机长度的 `waaaaaaaagh`，消息暂不发送；点绿皮还原真实需求，再回车才真正发送（模型永远收到真实需求）。
- **输出掩码**：模型运行时的思考（Think）与正文一律显示为绿色 `Waaaaaaagh!!!`，工具调用行保持可见。**点击任意被掩码的消息**或输入框右侧的「查看详情」开关即可显示原文；「查看详情」再点回到掩码。
- **运行指示器**：`Deep diving...` → 绿色 `Waaaaaaagh!!!`。
- **自定义头像**：设置 → 通用设置 → 底部「绿皮头像」，粘贴图片 URL 或 `data:image` 数据替换默认兽人头像。

## 安装

```sh
dsh plugin --profile web add link:D:/MacShare/waaagh
```

然后重启 `dsh web`，刷新页面即可。

## 结构

- `cordis.patch.yml` — 插入 `{ id: waaagh-ork, name: 'dsh-waaagh-ork' }` loader 条目。
- `lib/index.js` — 宿主半体（no-op）。
- `lib/client.js` — 浏览器半体（全部 UI 逻辑，手写 JS，无需构建）。
