# 日记记录表网站

这个文件夹是日记记录表的网站版本。

## 网站域名

准备使用的域名：

`https://rijiccc.kingstar.xin`

现在检查到这个域名还没有解析成功。

简单说：域名像门牌号，现在还没有告诉互联网“这个门牌号对应哪一台服务器”。

## 本地打开

直接打开这个文件就能在电脑上试用：

`/Users/wangyuzhou/Documents/rijiccc.kingstar.xin/index.html`

也可以用本机网站地址打开：

`http://127.0.0.1:7811/`

注意：这个地址只能在这台电脑上用。如果关掉本机网站服务，就需要重新开启。

## 启动带 DeepSeek 的本机网站

现在网站有一个本地后端 `server.js`，它负责安全调用 DeepSeek。

启动方式：

```bash
cd /Users/wangyuzhou/Documents/rijiccc.kingstar.xin
node server.js
```

然后打开：

`http://127.0.0.1:7811/`

## DeepSeek 配置

不要把 Token 写进 `app.js` 或 `index.html`。

可以复制 `.env.example` 为 `.env.local`，再把 DeepSeek Token 放进去：

```bash
cp .env.example .env.local
```

`.env.local` 不会提交到 Git 仓库。

需要的配置：

```text
DEEPSEEK_API_KEY=你的 DeepSeek Token
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## 文件说明

- `index.html`：网页的骨架。
- `styles.css`：网页的颜色、大小、布局。
- `app.js`：日记功能代码。
- `PLAN.md`：一条一条的开发计划。
- `CNAME`：告诉静态网站托管平台，这个网站要使用 `rijiccc.kingstar.xin`。

## 已有功能

- 暖色背景和纸张感页面。
- 左侧 AI 协助工具。
- 左侧保存目录，点击目录里的日记可以查看保存内容。
- 顶部有“增加”“新建”“保存”“退出”等按钮。
- 按 `Command + S` 可以保存。Windows 键盘也可以用 `Ctrl + S`。
- 点击“退出”会询问是否保存。
- 关闭或刷新页面时，如果还有没保存的内容，会提醒用户。
- 新建日记。
- 打字写日记。
- 自动保存到浏览器本地。
- 搜索日记。
- 心情、天气、标签。
- 调文字颜色。
- 调文字大小。
- 粗体、斜体、下划线。
- 列表和格式整理。
- 上传图片。
- 图片说明和删除图片。
- DeepSeek AI 润色：用户自己打字或语音告诉 AI 要怎么改。
- 语音输入尝试。
- 写作提示和日记模板。
- 导出 Markdown。
- 导出 JSON。

## 部署到真正网站的下一步

要让 `https://rijiccc.kingstar.xin` 真正打开这个网站，需要做两件事：

1. 把这个文件夹上传到静态网站托管平台，比如 GitHub Pages、Cloudflare Pages、Vercel 或 Netlify。
2. 在域名 DNS 管理页面里添加解析记录，让 `rijiccc.kingstar.xin` 指向托管平台。

## 重要安全提醒

不要把 AI API 密钥写进前端代码里。

API 密钥像家门钥匙，如果放在网页代码里，别人打开网页时可能看见它。

现在已经加了本地后端 `server.js`，用它来安全调用 DeepSeek。
