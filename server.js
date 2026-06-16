// server.js - WordGlance 留言板后端（JSON文件存储版）
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { messages: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/messages', (req, res) => {
  const data = loadData();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const messages = data.messages
    .sort((a, b) => b.id - a.id)
    .slice((page - 1) * limit, page * limit)
    .map(msg => ({ ...msg, time: formatTime(msg.created_at) }));
  res.json({ messages });
});

app.post('/api/messages', (req, res) => {
  const { nickname, avatar, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '留言内容不能为空' });
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: '昵称不能为空' });
  const data = loadData();
  const newId = data.messages.length > 0 ? Math.max(...data.messages.map(m => m.id)) + 1 : 1;
  const newMsg = {
    id: newId,
    nickname: nickname.trim(),
    avatar: avatar || '🐱',
    content: content.trim(),
    created_at: new Date().toISOString()
  };
  data.messages.push(newMsg);
  saveData(data);
  res.json({ success: true, message: { ...newMsg, time: '刚刚' } });
});

app.delete('/api/messages/:id', (req, res) => {
  const data = loadData();
  data.messages = data.messages.filter(m => m.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

function formatTime(dateString) {
  const date = new Date(dateString);
  const diff = new Date() - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return (date.getMonth() + 1) + '/' + date.getDate();
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('WordGlance 留言板后端启动成功！端口：' + PORT);
});
