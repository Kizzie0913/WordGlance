// server.js - WordGlance 后端（GitHub Gist 数据存储版本）
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// GitHub Gist 配置（用于存储 data.json）
const GIST_ID = 'YOUR_GIST_ID'; // 需要创建一个 Gist
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// 加载数据（优先从 GitHub Gist 加载，失败则从本地文件加载）
async function loadData() {
  try {
    if (GITHUB_TOKEN && GIST_ID !== 'YOUR_GIST_ID') {
      const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'WordGlance'
        }
      });
      if (response.ok) {
        const gist = await response.json();
        if (gist.files && gist.files['data.json']) {
          const content = gist.files['data.json'].content;
          fs.writeFileSync(DATA_FILE, content, 'utf8');
          return JSON.parse(content);
        }
      }
    }
  } catch (err) {
    console.error('从 Gist 加载失败，使用本地文件:', err.message);
  }

  // 从本地文件加载
  if (!fs.existsSync(DATA_FILE)) {
    return { users: [], messages: [], friends: [], friendRequests: [], pkRecords: [] };
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw || '{"users":[],"messages":[],"friends":[],"friendRequests":[],"pkRecords":[]}');
}

// 保存数据（同时保存到本地和 GitHub Gist）
async function saveData(data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(DATA_FILE, json, 'utf8');

  // 同步到 GitHub Gist
  if (GITHUB_TOKEN && GIST_ID !== 'YOUR_GIST_ID') {
    try {
      await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'WordGlance'
        },
        body: JSON.stringify({
          files: {
            'data.json': {
              content: json
            }
          }
        })
      });
    } catch (err) {
      console.error('同步到 Gist 失败:', err.message);
    }
  }
}

// ========== 用户资料 API ==========

// 注册/更新用户资料
app.post('/api/users/register', async (req, res) => {
  const { userId, nickname, avatar } = req.body;
  if (!userId || !nickname) return res.status(400).json({ error: '参数不完整' });

  const trimmedName = nickname.trim();
  
  try {
    const data = loadData();

    // 检查昵称是否已被其他用户使用
    const existingUser = data.users.find(u => u.nickname === trimmedName && u.userId !== userId);
    if (existingUser) {
      return res.status(409).json({ error: '该昵称已被使用，请换一个独特的昵称' });
    }

    let user = data.users.find(u => u.userId === userId);
    const oldNickname = user ? user.nickname : null;

    if (user) {
      // 老用户：更新昵称和头像
      user.nickname = trimmedName;
      if (avatar) user.avatar = avatar;
      user.lastLogin = new Date().toISOString();

      // 同步更新所有旧留言中的昵称和头像
      data.messages.forEach(msg => {
        if (msg.userId === userId) {
          msg.nickname = trimmedName;
          if (avatar) msg.avatar = avatar;
        }
      });

      // 同步更新好友关系中的信息（兼容旧数据：同时用userId和旧昵称匹配）
      data.friends.forEach(f => {
        if (f.user1Id === userId) {
          f.user1 = trimmedName;
          if (avatar) f.user1Avatar = avatar;
        } else if (f.user1 === oldNickname) {
          f.user1 = trimmedName;
          f.user1Id = userId;
          if (avatar) f.user1Avatar = avatar;
        }
        if (f.user2Id === userId) {
          f.user2 = trimmedName;
          if (avatar) f.user2Avatar = avatar;
        } else if (f.user2 === oldNickname) {
          f.user2 = trimmedName;
          f.user2Id = userId;
          if (avatar) f.user2Avatar = avatar;
        }
      });

      saveData(data);
      return res.json({ success: true, user, isNew: false });
    } else {
      // 新用户
      const newUser = {
        userId: userId,
        nickname: trimmedName,
        avatar: avatar || '🐱',
        level: 1,
        title: 'Noobslayer',
        exp: 0,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      data.users.push(newUser);
      saveData(data);
      return res.json({ success: true, user: newUser, isNew: true });
    }
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户资料
app.get('/api/users/profile', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId不能为空' });

  try {
    const data = loadData();
    const user = data.users.find(u => u.userId === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== 留言板 API ==========

app.get('/api/messages', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const userId = req.query.userId || '';

  try {
    const data = loadData();
    const start = (page - 1) * limit;
    const end = start + limit;
    const messages = data.messages.slice(-end).reverse().slice(0, limit);

    const result = messages.map(msg => {
      const msgData = {
        ...msg,
        time: msg.createdAt || msg.time
      };
      if (userId && msg.likedUsers) {
        msgData.isLiked = msg.likedUsers.includes(userId);
      } else {
        msgData.isLiked = false;
      }
      return msgData;
    });

    res.json({ messages: result });
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/messages', (req, res) => {
  const { nickname, avatar, content, userId } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '留言内容不能为空' });
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = loadData();
    const newMessage = {
      id: Date.now(),
      userId: userId || '',
      nickname: nickname.trim(),
      avatar: avatar || '🐱',
      content: content.trim(),
      type: 'text',
      likes: 0,
      likedUsers: [],
      createdAt: new Date().toISOString()
    };
    data.messages.push(newMessage);
    saveData(data);

    res.json({
      success: true,
      message: {
        ...newMessage,
        time: '刚刚'
      }
    });
  } catch (err) {
    console.error('Post message error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 点赞/取消点赞
app.post('/api/messages/:id/like', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId不能为空' });

  try {
    const data = loadData();
    const messageId = parseInt(req.params.id);
    const msg = data.messages.find(m => m.id === messageId);
    
    if (!msg) return res.status(404).json({ error: '留言不存在' });
    
    const likedUsers = msg.likedUsers || [];
    const userIndex = likedUsers.indexOf(userId);

    if (userIndex === -1) {
      likedUsers.push(userId);
      msg.likedUsers = likedUsers;
      msg.likes = likedUsers.length;
      saveData(data);
      res.json({ success: true, liked: true, likes: likedUsers.length });
    } else {
      likedUsers.splice(userIndex, 1);
      msg.likedUsers = likedUsers;
      msg.likes = likedUsers.length;
      saveData(data);
      res.json({ success: true, liked: false, likes: likedUsers.length });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== 好友系统 API ==========

// 发送好友请求
app.post('/api/friends/request', (req, res) => {
  const { fromNickname, fromAvatar, fromLevel, fromTitle, fromExp, toNickname, fromUserId } = req.body;
  if (!fromNickname || !toNickname) return res.status(400).json({ error: '昵称不能为空' });
  if (fromNickname === toNickname) return res.status(400).json({ error: '不能添加自己为好友' });

  try {
    const data = loadData();

    // 查找对方的 userId
    const toUser = data.users.find(u => u.nickname === toNickname);
    const toUserId = toUser ? toUser.userId : '';

    // 检查是否已经是好友（优先用userId匹配）
    const isFriend = data.friends.some(f => {
      if (f.user1Id && f.user2Id && fromUserId && toUserId) {
        return (f.user1Id === fromUserId && f.user2Id === toUserId) ||
               (f.user1Id === toUserId && f.user2Id === fromUserId);
      }
      return (f.user1 === fromNickname && f.user2 === toNickname) ||
             (f.user1 === toNickname && f.user2 === fromNickname);
    });

    if (isFriend) return res.status(400).json({ error: '你们已经是好友了' });

    // 检查是否已有待处理的请求
    const existingReq = data.friendRequests.find(r => 
      r.sender === fromNickname && r.recver === toNickname && r.status === 'pending'
    );
    if (existingReq) {
      return res.status(400).json({ error: '已发送过好友请求，等待对方确认' });
    }

    // 检查对方是否已向你发送请求（自动接受）
    const reverseReq = data.friendRequests.find(r => 
      r.sender === toNickname && r.recver === fromNickname && r.status === 'pending'
    );
    
    if (reverseReq) {
      reverseReq.status = 'accepted';

      data.friends.push({
        id: Date.now(),
        user1Id: fromUserId || '',
        user1: fromNickname,
        user1Avatar: fromAvatar || '🐱',
        user1Level: fromLevel || 1,
        user1Title: fromTitle || 'Noobslayer',
        user1Exp: fromExp || 0,
        user2Id: reverseReq.senderUserId || '',
        user2: toNickname,
        user2Avatar: reverseReq.senderAvatar,
        user2Level: reverseReq.senderLevel,
        user2Title: reverseReq.senderTitle,
        user2Exp: reverseReq.senderExp,
        createdAt: new Date().toISOString()
      });

      saveData(data);
      return res.json({ success: true, autoAccepted: true, message: '已自动成为好友' });
    }

    // 创建新的好友请求
    data.friendRequests.push({
      id: Date.now(),
      sender: fromNickname,
      senderUserId: fromUserId || '',
      senderAvatar: fromAvatar || '🐱',
      senderLevel: fromLevel || 1,
      senderTitle: fromTitle || 'Noobslayer',
      senderExp: fromExp || 0,
      recver: toNickname,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    saveData(data);
    res.json({ success: true, message: '好友请求已发送' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取收到的好友请求
app.get('/api/friends/requests', (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = loadData();
    const requests = data.friendRequests.filter(r => 
      r.recver === nickname && r.status === 'pending'
    );
    res.json({ requests });
  } catch (err) {
    console.error('Friend requests error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 接受/拒绝好友请求
app.post('/api/friends/respond', (req, res) => {
  const { requestId, accept, toNickname, toAvatar, toLevel, toTitle, toExp, toUserId } = req.body;
  if (!requestId || !toNickname) return res.status(400).json({ error: '参数不完整' });

  try {
    const data = loadData();
    const request = data.friendRequests.find(r => r.id === requestId);
    
    if (!request) return res.status(404).json({ error: '请求不存在' });
    if (request.recver !== toNickname) return res.status(403).json({ error: '无权操作' });
    if (request.status !== 'pending') return res.status(400).json({ error: '请求已处理' });

    if (accept) {
      request.status = 'accepted';

      data.friends.push({
        id: Date.now(),
        user1Id: request.senderUserId || '',
        user1: request.sender,
        user1Avatar: request.senderAvatar,
        user1Level: request.senderLevel,
        user1Title: request.senderTitle,
        user1Exp: request.senderExp,
        user2Id: toUserId || '',
        user2: toNickname,
        user2Avatar: toAvatar || '🐱',
        user2Level: toLevel || 1,
        user2Title: toTitle || 'Noobslayer',
        user2Exp: toExp || 0,
        createdAt: new Date().toISOString()
      });

      saveData(data);
      res.json({ success: true, message: '已添加好友' });
    } else {
      request.status = 'rejected';
      saveData(data);
      res.json({ success: true, message: '已拒绝好友请求' });
    }
  } catch (err) {
    console.error('Friend respond error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取好友列表
app.get('/api/friends', (req, res) => {
  const { nickname, userId } = req.query;
  if (!nickname && !userId) return res.status(400).json({ error: '参数不完整' });

  try {
    const data = loadData();
    let friendsData = data.friends;

    const friends = friendsData.filter(f => {
      if (userId) {
        return f.user1Id === userId || f.user2Id === userId;
      } else {
        return f.user1 === nickname || f.user2 === nickname;
      }
    }).map(f => {
      const isUser1 = userId ? (f.user1Id === userId) : (f.user1 === nickname);
      return {
        nickname: isUser1 ? f.user2 : f.user1,
        userId: isUser1 ? (f.user2Id || '') : (f.user1Id || ''),
        avatar: isUser1 ? f.user2Avatar : f.user1Avatar,
        level: isUser1 ? f.user2Level : f.user1Level,
        title: isUser1 ? f.user2Title : f.user1Title,
        exp: isUser1 ? f.user2Exp : f.user1Exp,
        friendSince: f.createdAt
      };
    });

    res.json({ friends });
  } catch (err) {
    console.error('Friends list error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除好友
app.delete('/api/friends', (req, res) => {
  const { nickname, friendNickname, userId } = req.body;
  if ((!nickname && !userId) || !friendNickname) return res.status(400).json({ error: '参数不完整' });

  try {
    const data = loadData();
    const before = data.friends.length;

    data.friends = data.friends.filter(f => {
      if (userId) {
        const mySide = f.user1Id === userId ? 'user1' : (f.user2Id === userId ? 'user2' : '');
        if (!mySide) return true;
        const otherNickname = mySide === 'user1' ? f.user2 : f.user1;
        return otherNickname !== friendNickname;
      } else {
        return !((f.user1 === nickname && f.user2 === friendNickname) ||
                 (f.user1 === friendNickname && f.user2 === nickname));
      }
    });

    if (data.friends.length === before) {
      return res.status(404).json({ error: '好友关系不存在' });
    }

    saveData(data);
    res.json({ success: true, message: '好友已删除' });
  } catch (err) {
    console.error('Delete friend error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== PK 功能 ==========

app.post('/api/friends/pk', (req, res) => {
  const { myNickname, myLevel, myTitle, myExp, myAvatar,
          friendNickname, friendLevel, friendTitle, friendExp, friendAvatar } = req.body;

  if (!myNickname || !friendNickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = loadData();

    // 检查是否好友
    const isFriend = data.friends.some(f =>
      (f.user1 === myNickname && f.user2 === friendNickname) ||
      (f.user1 === friendNickname && f.user2 === myNickname)
    );

    if (!isFriend) return res.status(400).json({ error: '你们不是好友，不能PK' });

    // 计算战力
    const myPower = myLevel * 100 + myExp + Math.floor(Math.random() * 200);
    const friendPower = friendLevel * 100 + friendExp + Math.floor(Math.random() * 200);

    const iWin = myPower >= friendPower;
    const isDraw = myPower === friendPower;

    let result, comment;
    if (isDraw) {
      result = 'draw';
      comment = getPkComment(myLevel, friendLevel, true);
    } else if (iWin) {
      result = 'win';
      comment = getPkComment(myLevel, friendLevel, true);
    } else {
      result = 'lose';
      comment = getPkComment(myLevel, friendLevel, false);
    }

    // 保存 PK 记录
    data.pkRecords.push({
      id: Date.now(),
      challenger: myNickname,
      challengerLevel: myLevel,
      defender: friendNickname,
      defenderLevel: friendLevel,
      result: result,
      comment: comment,
      createdAt: new Date().toISOString()
    });

    saveData(data);

    res.json({
      success: true,
      result: result,
      comment: comment,
      myPower: myPower,
      friendPower: friendPower,
      myLevel: myLevel,
      friendLevel: friendLevel,
      myTitle: myTitle,
      friendTitle: friendTitle
    });
  } catch (err) {
    console.error('PK error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取 PK 记录
app.get('/api/friends/pk/history', (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = loadData();
    const records = data.pkRecords.filter(r => 
      r.challenger === nickname || r.defender === nickname
    ).slice(-20).reverse();
    
    res.json({ records });
  } catch (err) {
    console.error('PK history error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// PK 评语生成函数
function getPkComment(myLevel, friendLevel, iWin) {
  const diff = Math.abs(myLevel - friendLevel);
  
  if (diff === 0) {
    const comments = [
      '旗鼓相当！下次再战！⚔️',
      '高手过招，精彩！👏',
      '不分伯仲，友谊第一！🤝'
    ];
    return comments[Math.floor(Math.random() * comments.length)];
  }

  const isBig = diff >= 5;
  
  if (iWin) {
    if (isBig) {
      const winComments = [
        `以弱胜强！${friendLevel}级的${friendNickname}输给了${myLevel}级的我！🎉`,
        '逆风翻盘！太燃了！🔥',
        '不愧是我！弱者也能胜利！💪'
      ];
      return winComments[Math.floor(Math.random() * winComments.length)];
    } else {
      const winComments = [
        '轻松取胜！💪',
        '实力获胜！👍',
        '赢得漂亮！✨'
      ];
      return winComments[Math.floor(Math.random() * winComments.length)];
    }
  } else {
    if (isBig) {
      const loseComments = [
        `输给${friendLevel}级的${friendNickname}，差距太大了...😭`,
        '级别差距太大，认了...📉',
        '强者面前，我还需努力💦'
      ];
      return loseComments[Math.floor(Math.random() * loseComments.length)];
    } else {
      const loseComments = [
        '可惜了，下次一定赢！💪',
        '运气不好，再来！🎲',
        '不服，再战！⚔️'
      ];
      return loseComments[Math.floor(Math.random() * loseComments.length)];
    }
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WordGlance 后端运行在端口 ${PORT}`);
});
