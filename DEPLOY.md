# 部署上线（用于视频生成测试）

这个项目需要一个 Node 服务来做三件事：

1. 托管前端静态文件（`dist/`）
2. 同源代理外部 API（避免浏览器 CORS）：`/api/gemini/*`、`/api/dashscope/*`
3. 把本地 `data:image/...` 上传成公网 URL（给 Vidu 参考图用）：`POST /api/upload-dataurl` → `/uploads/*`

入口文件是 [server.mjs](file:///Users/cft/Downloads/pawprint-ai/server.mjs)。

## 1) 需要的环境变量（生产）

在部署平台里配置这些（不要放进 `.env` 提交）：

- `GEMINI_API_KEY`：Gemini Key（服务端使用，不会暴露给浏览器）
- `DASHSCOPE_API_KEY`：DashScope Key（服务端使用，不会暴露给浏览器）
- `APP_URL`：你的线上域名（例如 `https://pawprint.example.com`），用于生成上传图片的公网 URL
- `PORT`：服务监听端口（多数平台会自动注入）
- `HTTP_PROXY`：可选。若你的部署环境访问 Google 需要代理，可以在这里填代理地址

本地开发可以用 `.env.local` / `.env`，并且可以填 `VITE_*`，但线上不要填任何 `VITE_*` key。

## 2) 构建与启动

```bash
npm install
npm run build
npm start
```

`npm start` 会运行 `node server.mjs`，默认监听 `PORT`（不设则 3000）。

## 3) 验证点

- `GET /health` 返回 `{ ok: true }`
- 打开主页能正常加载
- 生成视频时，若参考图来自本地 dataURL，服务会先调用 `POST /api/upload-dataurl`，然后把得到的 `https://.../uploads/...` 作为 Vidu 参考图 URL

