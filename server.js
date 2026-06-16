// server.js - WordGlance 留言板后端
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'messages.db');

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 初始化数据库
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('数据库连接成功');
    initDatabase();
  }
});

// 创建表
function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      avatar TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('创建表失败:', err);
    } else {
      console.log('数据库初始化完成');
    }
  });
}

// ========== API 接口 ==========

// 获取所有留言（按时间倒序）
app.get('/api/messages', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  db.all(
    'SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: '获取留言失败' });
      } else {
        // 格式化时间
        const messages = rows.map(row => ({
          id: row.id,
          nickname: row.nickname,
          avatar: row.avatar,
          content: row.content,
          time: formatTime(row.created_at)
        }));
        res.json({ messages });
      }
    }
  );
});

// 发布留言
app.post('/api/messages', (req, res) => {
  const { nickname, avatar, content } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '留言内容不能为空' });
  }

  if (!nickname || nickname.trim() === '') {
    return res.status(400).json({ error: '昵称不能为空' });
  }

  db.run(
    'INSERT INTO messages (nickname, avatar, content) VALUES (?, ?, ?)',
    [nickname.trim(), avatar || '🐱', content.trim()],
    function(err) {
      if (err) {
        res.status(500).json({ error: '发布失败' });
      } else {
        res.json({
          success: true,
          message: {
            id: this.lastID,
            nickname: nickname.trim(),
            avatar: avatar || '🐱',
            content: content.trim(),
            time: '刚刚'
          }
        });
      }
    }
  );
});

// 删除留言（可选功能）
app.delete('/api/messages/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM messages WHERE id = ?', [id], (err) => {
    if (err) {
      res.status(500).json({ error: '删除失败' });
    } else {
      res.json({ success: true });
    }
  });
});

// 格式化时间
function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

  return date.getMonth() + 1 + '/' + date.getDate();
}

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('  WordGlance 留言板后端启动成功！');
  console.log('  地址: http://localhost:' + PORT);
  console.log('=================================');
  console.log('');
  console.log('API 接口:');
  console.log('  GET  http://localhost:' + PORT + '/api/messages');
  console.log('  POST http://localhost:' + PORT + '/api/messages');
  console.log('');
});
