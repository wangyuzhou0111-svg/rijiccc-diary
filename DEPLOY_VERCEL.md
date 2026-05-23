# 部署到 Vercel

现在已经部署成功的地址：

`https://rijiccc-diary.vercel.app`

想使用的自定义域名：

`https://rijiccc.kingstar.xin`

## 第一步：部署项目

这个项目已经准备好给 Vercel 使用：

- `public/index.html` 是网页。
- `public/styles.css` 是样式。
- `public/app.js` 是前端功能。
- `api/deepseek.js` 是 Vercel 上调用 DeepSeek 的接口。
- `api/health.js` 是检查接口。
- `vercel.json` 是 Vercel 配置。

## 第二步：设置环境变量

在 Vercel 项目的 Environment Variables 里添加：

```text
DEEPSEEK_API_KEY=你的 DeepSeek Token
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

不要把 Token 写进代码。

## 第三步：绑定域名

在 Vercel 项目里添加域名：

`rijiccc.kingstar.xin`

现在测试结果：当前 Vercel 账号还没有这个域名的权限，所以 Vercel 返回了 `domain_not_owned`。这不是代码问题，是域名还没有在这个 Vercel 账号里完成拥有者验证。

然后去域名 DNS 管理页面设置 Vercel 给你的记录。常见情况是：

```text
类型：CNAME
名称：rijiccc
值：cname.vercel-dns.com
```

如果 Vercel 给你的值不一样，以 Vercel 页面显示的为准。
