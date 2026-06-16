# WordGlance 留言板后端

## 部署到 Render

1. 注册 https://render.com （用 GitHub 登录最方便）
2. 点击 "New +" → "Web Service"
3. 连接你的 GitHub 仓库（需要先把这个项目推到 GitHub）
4. 配置：
   - Name: wordglance-message-board
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - 免费计划选 "Free"

5. 部署完成后，获得一个 URL，如：
   `https://wordglance-message-board.onrender.com`

6. 把小程序里的 API 地址改成这个 URL

## 本地测试

```bash
npm install
node server.js
```

访问 http://localhost:3001/api/messages 测试

## API

- GET /api/messages - 获取留言列表
- POST /api/messages - 发布留言 { nickname, avatar, content }
- DELETE /api/messages/:id - 删除留言
