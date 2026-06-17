// server.js - WordGlance 后端（GitHub 永久存储版）
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// GitHub 配置（Token 通过环境变量 GITHUB_TOKEN 传入，不在代码中写死）
const GITHUB_REPO = 'Kizzie0913/WordGlance';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const DATA_FILE_PATH = 'server-data.json';

const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_FILE = path.join(__dirname, 'data.backup.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// 从 GitHub 加载数据
async function loadDataFromGitHub() {
  if (!GITHUB_TOKEN) {
    console.log('未配置 GITHUB_TOKEN，使用本地文件');
    return loadFromLocal();
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'WordGlance',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.ok) {
      const file = await response.json();
      const content = Buffer.from(file.content, 'base64').toString('utf8');
      const data = JSON.parse(content);
      
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2), 'utf8');
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
      
      console.log('从 GitHub 加载数据成功');
      return { data, sha: file.sha };
    } else if (response.status === 404) {
      console.log('server-data.json 不存在，创建新的...');
      const initialData = { users: [], messages: [], friends: [], friendRequests: [], pkRecords: [] };
      const sha = await saveDataToGitHub(initialData, null);
      return { data: initialData, sha };
    } else {
      console.error('GitHub API 错误:', response.status);
      return loadFromLocal();
    }
  } catch (err) {
    console.error('从 GitHub 加载失败:', err.message);
    return loadFromLocal();
  }
}

function loadFromLocal() {
  if (fs.existsSync(BACKUP_FILE)) {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf8');
    console.log('从本地备份加载数据');
    return { data: JSON.parse(raw), sha: null };
  }
  console.log('使用空数据');
  return { data: { users: [], messages: [], friends: [], friendRequests: [], pkRecords: [] }, sha: null };
}

// 保存数据到 GitHub
async function saveDataToGitHub(data, sha = null) {
  if (!GITHUB_TOKEN) {
    console.log('未配置 GITHUB_TOKEN，只保存到本地');
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(BACKUP_FILE, content, 'utf8');
    fs.writeFileSync(DATA_FILE, content, 'utf8');
    return sha;
  }

  try {
    const content = JSON.stringify(data, null, 2);
    const body = {
      message: '更新数据 ' + new Date().toISOString(),
      content: Buffer.from(content).toString('base64')
    };
    
    if (sha) {
      body.sha = sha;
    }
    
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'WordGlance',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      const result = await response.json();
      fs.writeFileSync(BACKUP_FILE, content, 'utf8');
      fs.writeFileSync(DATA_FILE, content, 'utf8');
      console.log('数据已保存到 GitHub');
      return result.content.sha;
    } else {
      const errText = await response.text();
      console.error('保存到 GitHub 失败:', errText);
      fs.writeFileSync(BACKUP_FILE, content, 'utf8');
      return sha;
    }
  } catch (err) {
    console.error('保存到 GitHub 失败:', err.message);
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(BACKUP_FILE, content, 'utf8');
    return sha;
  }
}

// 内存缓存
let dataCache = null;
let dataSha = null;
let lastLoadTime = 0;
const CACHE_TTL = 0; // 每次都从GitHub读取最新数据，确保同步

async function loadData() {
  const now = Date.now();
  if (dataCache && (now - lastLoadTime) < CACHE_TTL) {
    return dataCache;
  }
  
  const result = await loadDataFromGitHub();
  dataCache = result.data;
  dataSha = result.sha;
  lastLoadTime = now;
  return dataCache;
}

async function saveData(data) {
  dataCache = data;
  lastLoadTime = Date.now();
  dataSha = await saveDataToGitHub(data, dataSha);
}

// ========== 用户资料 API ==========

app.post('/api/users/register', async (req, res) => {
  const { userId, nickname, avatar } = req.body;
  if (!userId || !nickname) return res.status(400).json({ error: '参数不完整' });

  const trimmedName = nickname.trim();
  
  try {
    const data = await loadData();

    const existingUser = data.users.find(u => u.nickname === trimmedName && u.userId !== userId);
    if (existingUser) {
      return res.status(409).json({ error: '该昵称已被使用，请换一个独特的昵称' });
    }

    let user = data.users.find(u => u.userId === userId);
    const oldNickname = user ? user.nickname : null;

    if (user) {
      user.nickname = trimmedName;
      if (avatar) user.avatar = avatar;
      user.lastLogin = new Date().toISOString();

      data.messages.forEach(msg => {
        if (msg.userId === userId) {
          msg.nickname = trimmedName;
          if (avatar) msg.avatar = avatar;
        }
      });

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

      await saveData(data);
      return res.json({ success: true, user, isNew: false });
    } else {
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
      await saveData(data);
      return res.json({ success: true, user: newUser, isNew: true });
    }
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/users/profile', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId不能为空' });

  try {
    const data = await loadData();
    const user = data.users.find(u => u.userId === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 同步用户最新数据（等级/经验/头衔）
app.post('/api/users/sync', async (req, res) => {
  const { userId, nickname, level, title, exp, avatar } = req.body;
  if (!userId && !nickname) return res.status(400).json({ error: 'userId或nickname不能为空' });

  try {
    const data = await loadData();
    let user = null;

    if (userId) {
      user = data.users.find(u => u.userId === userId);
    }
    if (!user && nickname) {
      user = data.users.find(u => u.nickname === nickname);
    }

    if (user) {
      if (level !== undefined) user.level = level;
      if (title !== undefined) user.title = title;
      if (exp !== undefined) user.exp = exp;
      if (avatar !== undefined) user.avatar = avatar;
      user.lastSync = new Date().toISOString();

      // 同步更新 friends 表中该用户的数据
      data.friends.forEach(f => {
        if (f.user1Id === userId || f.user1 === nickname) {
          f.user1Level = user.level;
          f.user1Title = user.title;
          f.user1Exp = user.exp;
          if (avatar) f.user1Avatar = user.avatar;
        }
        if (f.user2Id === userId || f.user2 === nickname) {
          f.user2Level = user.level;
          f.user2Title = user.title;
          f.user2Exp = user.exp;
          if (avatar) f.user2Avatar = user.avatar;
        }
      });

      await saveData(data);
      return res.json({ success: true, user });
    } else {
      // 用户不存在，自动创建
      const newUser = {
        userId: userId || '',
        nickname: nickname || '',
        avatar: avatar || '🐱',
        level: level || 1,
        title: title || 'Noobslayer',
        exp: exp || 0,
        createdAt: new Date().toISOString(),
        lastSync: new Date().toISOString()
      };
      data.users.push(newUser);
      await saveData(data);
      return res.json({ success: true, user: newUser, isNew: true });
    }
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// ========== 留言板 API ==========

app.get('/api/messages', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const userId = req.query.userId || '';

  try {
    const data = await loadData();
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

app.post('/api/messages', async (req, res) => {
  const { nickname, avatar, content, userId } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '留言内容不能为空' });
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = await loadData();
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
    await saveData(data);

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

app.post('/api/messages/:id/like', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId不能为空' });

  try {
    const data = await loadData();
    const messageId = parseInt(req.params.id);
    const msg = data.messages.find(m => m.id === messageId);
    
    if (!msg) return res.status(404).json({ error: '留言不存在' });
    
    const likedUsers = msg.likedUsers || [];
    const userIndex = likedUsers.indexOf(userId);

    if (userIndex === -1) {
      likedUsers.push(userId);
      msg.likedUsers = likedUsers;
      msg.likes = likedUsers.length;
      await saveData(data);
      res.json({ success: true, liked: true, likes: likedUsers.length });
    } else {
      likedUsers.splice(userIndex, 1);
      msg.likedUsers = likedUsers;
      msg.likes = likedUsers.length;
      await saveData(data);
      res.json({ success: true, liked: false, likes: likedUsers.length });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除留言
app.delete('/api/messages/:id', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId不能为空' });

  try {
    const data = await loadData();
    const messageId = parseInt(req.params.id);
    const msg = data.messages.find(m => m.id === messageId);
    
    if (!msg) return res.status(404).json({ error: '留言不存在' });
    if (msg.userId !== userId) return res.status(403).json({ error: '只能删除自己的留言' });
    
    data.messages = data.messages.filter(m => m.id !== messageId);
    await saveData(data);
    
    res.json({ success: true, message: '留言已删除' });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 语音留言上传
app.post('/api/messages/voice', async (req, res) => {
  const { nickname, avatar, audioData, duration, userId } = req.body;
  if (!audioData) return res.status(400).json({ error: '音频数据不能为空' });
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = await loadData();
    
    // 生成唯一文件名
    const msgId = Date.now();
    const audioFilename = `audio_${msgId}.mp3`;
    const audioUrl = `/audio/${audioFilename}`;
    
    // 保存音频文件
    const audioDir = path.join(__dirname, 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    
    // 解码base64并保存
    const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, '');
    fs.writeFileSync(path.join(audioDir, audioFilename), Buffer.from(base64Data, 'base64'));
    
    // 创建留言记录
    const newMsg = {
      id: msgId,
      userId: userId || '',
      nickname: nickname,
      avatar: avatar || '🐱',
      content: '[语音]',
      type: 'voice',
      audioUrl: audioUrl,
      duration: duration || 0,
      likes: 0,
      likedUsers: [],
      createdAt: new Date().toISOString()
    };
    
    data.messages.unshift(newMsg);
    await saveData(data);
    
    res.json({ success: true, message: newMsg });
  } catch (err) {
    console.error('Voice message error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 提供音频文件
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const audioPath = path.join(__dirname, 'audio', filename);
  
  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ error: '音频文件不存在' });
  }
  
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(audioPath).pipe(res);
});

// ========== 好友系统 API ==========

app.post('/api/friends/request', async (req, res) => {
  const { fromNickname, fromAvatar, fromLevel, fromTitle, fromExp, toNickname, fromUserId } = req.body;
  if (!fromNickname || !toNickname) return res.status(400).json({ error: '昵称不能为空' });
  if (fromNickname === toNickname) return res.status(400).json({ error: '不能添加自己为好友' });

  try {
    const data = await loadData();

    const toUser = data.users.find(u => u.nickname === toNickname);
    const toUserId = toUser ? toUser.userId : '';

    const isFriend = data.friends.some(f => {
      if (f.user1Id && f.user2Id && fromUserId && toUserId) {
        return (f.user1Id === fromUserId && f.user2Id === toUserId) ||
               (f.user1Id === toUserId && f.user2Id === fromUserId);
      }
      return (f.user1 === fromNickname && f.user2 === toNickname) ||
             (f.user1 === toNickname && f.user2 === fromNickname);
    });

    if (isFriend) return res.status(400).json({ error: '你们已经是好友了' });

    const existingReq = data.friendRequests.find(r => 
      r.sender === fromNickname && r.recver === toNickname && r.status === 'pending'
    );
    if (existingReq) {
      return res.status(400).json({ error: '已发送过好友请求，等待对方确认' });
    }

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

      await saveData(data);
      return res.json({ success: true, autoAccepted: true, message: '已自动成为好友' });
    }

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

    await saveData(data);
    res.json({ success: true, message: '好友请求已发送' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/friends/requests', async (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = await loadData();
    const requests = data.friendRequests.filter(r => 
      r.recver === nickname && r.status === 'pending'
    ).map(r => ({
      id: r.id,
      from: r.sender,
      fromAvatar: r.senderAvatar,
      fromLevel: r.senderLevel,
      fromTitle: r.senderTitle,
      fromExp: r.senderExp,
      created_at: r.createdAt
    }));
    res.json({ requests });
  } catch (err) {
    console.error('Friend requests error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/friends/respond', async (req, res) => {
  const { requestId, accept, toNickname, toAvatar, toLevel, toTitle, toExp, toUserId } = req.body;
  if (!requestId || !toNickname) return res.status(400).json({ error: '参数不完整' });

  try {
    const data = await loadData();
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

      await saveData(data);
      res.json({ success: true, message: '已添加好友' });
    } else {
      request.status = 'rejected';
      await saveData(data);
      res.json({ success: true, message: '已拒绝好友请求' });
    }
  } catch (err) {
    console.error('Friend respond error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/friends', async (req, res) => {
  const { nickname, userId } = req.query;
  if (!nickname && !userId) return res.status(400).json({ error: '参数不完整' });

  try {
    const data = await loadData();
    let friendsData = data.friends;

    const friends = friendsData.filter(f => {
      if (userId) {
        return f.user1Id === userId || f.user2Id === userId;
      } else {
        return f.user1 === nickname || f.user2 === nickname;
      }
    }).map(f => {
      const isUser1 = userId ? (f.user1Id === userId) : (f.user1 === nickname);
      const friendNickname = isUser1 ? f.user2 : f.user1;
      const friendUserId = isUser1 ? (f.user2Id || '') : (f.user1Id || '');

      // 从 friends 表取基础数据
      let friendLevel = isUser1 ? f.user2Level : f.user1Level;
      let friendTitle = isUser1 ? f.user2Title : f.user1Title;
      let friendExp = isUser1 ? f.user2Exp : f.user1Exp;
      let friendAvatar = isUser1 ? f.user2Avatar : f.user1Avatar;

      // 尝试从 users 表获取最新数据
      const friendUser = data.users.find(u =>
        (friendUserId && u.userId === friendUserId) || u.nickname === friendNickname
      );
      if (friendUser) {
        friendLevel = friendUser.level || friendLevel;
        friendTitle = friendUser.title || friendTitle;
        friendExp = friendUser.exp !== undefined ? friendUser.exp : friendExp;
        friendAvatar = friendUser.avatar || friendAvatar;
      }

      return {
        nickname: friendNickname,
        userId: friendUserId,
        avatar: friendAvatar,
        level: friendLevel,
        title: friendTitle,
        exp: friendExp,
        friendSince: f.createdAt
      };
    });

    res.json({ friends });
  } catch (err) {
    console.error('Friends list error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.delete('/api/friends', async (req, res) => {
  const { nickname, friendNickname, userId } = req.body;
  if ((!nickname && !userId) || !friendNickname) return res.status(400).json({ error: '参数不完整' });

  try {
    const data = await loadData();
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

    await saveData(data);
    res.json({ success: true, message: '好友已删除' });
  } catch (err) {
    console.error('Delete friend error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== PK 功能 ==========

app.post('/api/friends/pk', async (req, res) => {
  const { myNickname, myLevel, myTitle, myExp, myAvatar,
          friendNickname, friendLevel, friendTitle, friendExp, friendAvatar } = req.body;

  if (!myNickname || !friendNickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = await loadData();

    const isFriend = data.friends.some(f =>
      (f.user1 === myNickname && f.user2 === friendNickname) ||
      (f.user1 === friendNickname && f.user2 === myNickname)
    );

    if (!isFriend) return res.status(400).json({ error: '你们不是好友，不能PK' });

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

    await saveData(data);

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

app.get('/api/friends/pk/history', async (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const data = await loadData();
    const records = data.pkRecords.filter(r => 
      r.challenger === nickname || r.defender === nickname
    ).slice(-20).reverse();
    
    res.json({ records });
  } catch (err) {
    console.error('PK history error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

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
