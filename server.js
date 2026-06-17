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

// 内存缓存 + 写入锁（防止并发写入覆盖数据）
let dataCache = null;
let dataSha = null;
let lastLoadTime = 0;
const CACHE_TTL = 5000; // 5秒缓存，减少GitHub API调用

// 写入锁队列：确保一次只有一个写操作，防止并发覆盖
let writeLock = Promise.resolve();

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
  // 最多重试3次，防止SHA冲突导致保存失败
  let attempts = 0;
  while (attempts < 3) {
    try {
      const result = await saveDataToGitHub(data, dataSha);
      dataSha = result;
      return;
    } catch (err) {
      attempts++;
      console.error(`保存失败 (第${attempts}次):`, err.message);
      if (attempts >= 3) break;
      // 重新加载数据获取最新SHA
      const fresh = await loadDataFromGitHub();
      dataSha = fresh.sha;
      // 合并：将当前修改应用到最新数据上
      fresh.data.messages = data.messages;
      fresh.data.friends = data.friends;
      fresh.data.friendRequests = data.friendRequests;
      fresh.data.pkRecords = data.pkRecords;
      // 合并users表：保留最新的用户数据
      data.users.forEach(u => {
        const idx = fresh.data.users.findIndex(fu => fu.userId === u.userId);
        if (idx >= 0) {
          // 如果有lastSync，用更新的版本
          if (u.lastSync && (!fresh.data.users[idx].lastSync || u.lastSync > fresh.data.users[idx].lastSync)) {
            fresh.data.users[idx] = u;
          }
        } else {
          fresh.data.users.push(u);
        }
      });
      dataCache = fresh.data;
    }
  }
}

// 带写入锁的数据修改：确保一次只有一个操作修改数据
async function withWriteLock(modifyFn) {
  return new Promise((resolve, reject) => {
    writeLock = writeLock.then(async () => {
      try {
        const data = await loadData();
        await modifyFn(data);
        await saveData(data);
        resolve();
      } catch (err) {
        console.error('写入锁内操作失败:', err);
        reject(err);
      }
    });
  });
}

// ========== 用户资料 API ==========

app.post('/api/users/register', async (req, res) => {
  const { userId, nickname, avatar } = req.body;
  if (!userId || !nickname) return res.status(400).json({ error: '参数不完整' });

  const trimmedName = nickname.trim();

  try {
    let resultUser = null;
    let isNew = false;

    await withWriteLock(data => {
      const existingUser = data.users.find(u => u.nickname === trimmedName && u.userId !== userId);
      if (existingUser) {
        throw Object.assign(new Error('该昵称已被使用，请换一个独特的昵称'), { status: 409 });
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

        resultUser = user;
        isNew = false;
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
        resultUser = newUser;
        isNew = true;
      }
    });

    return res.json({ success: true, user: resultUser, isNew });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
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
    let resultUser = null;
    let isNew = false;

    await withWriteLock(data => {
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

        resultUser = user;
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
        resultUser = newUser;
        isNew = true;
      }
    });

    res.json({ success: true, user: resultUser, isNew });
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
      // 不返回base64音频数据，节省流量
      delete msgData.audioBase64;
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

    await withWriteLock(data => {
      data.messages.push(newMessage);
    });

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
    const messageId = parseInt(req.params.id);
    let result = null;

    await withWriteLock(data => {
      const msg = data.messages.find(m => m.id === messageId);
      if (!msg) { result = { error: '留言不存在', status: 404 }; return; }

      const likedUsers = msg.likedUsers || [];
      const userIndex = likedUsers.indexOf(userId);

      if (userIndex === -1) {
        likedUsers.push(userId);
        msg.likedUsers = likedUsers;
        msg.likes = likedUsers.length;
        result = { liked: true, likes: likedUsers.length };
      } else {
        likedUsers.splice(userIndex, 1);
        msg.likedUsers = likedUsers;
        msg.likes = likedUsers.length;
        result = { liked: false, likes: likedUsers.length };
      }
    });

    if (result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ success: true, ...result });
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
    const messageId = parseInt(req.params.id);
    let result = null;

    await withWriteLock(data => {
      const msg = data.messages.find(m => m.id === messageId);
      if (!msg) { result = { error: '留言不存在', status: 404 }; return; }
      if (msg.userId !== userId) { result = { error: '只能删除自己的留言', status: 403 }; return; }

      data.messages = data.messages.filter(m => m.id !== messageId);
      result = { deleted: true };
    });

    if (result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }
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
    const msgId = Date.now();
    const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, '');

    // 保存音频到磁盘（缓存加速）
    const audioDir = path.join(__dirname, 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    const audioFilename = `audio_${msgId}.mp3`;
    fs.writeFileSync(path.join(audioDir, audioFilename), Buffer.from(base64Data, 'base64'));

    // 创建留言记录 - base64存在数据中，服务重启不会丢
    const newMsg = {
      id: msgId,
      userId: userId || '',
      nickname: nickname,
      avatar: avatar || '🐱',
      content: '[语音]',
      type: 'voice',
      audioUrl: `/api/messages/${msgId}/audio`,
      audioBase64: base64Data,
      duration: duration || 0,
      likes: 0,
      likedUsers: [],
      createdAt: new Date().toISOString()
    };

    // 使用写入锁，防止并发覆盖导致语音消息丢失
    await withWriteLock(data => {
      data.messages.push(newMsg);
    });

    // 返回给客户端时不带base64（节省流量）
    const responseMsg = { ...newMsg };
    delete responseMsg.audioBase64;

    res.json({ success: true, message: responseMsg });
  } catch (err) {
    console.error('Voice message error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 通过消息ID获取音频（优先磁盘缓存，回退base64数据）
app.get('/api/messages/:id/audio', async (req, res) => {
  const messageId = parseInt(req.params.id);
  
  try {
    // 先尝试磁盘缓存
    const audioFilename = `audio_${messageId}.mp3`;
    const audioPath = path.join(__dirname, 'audio', audioFilename);
    
    if (fs.existsSync(audioPath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      fs.createReadStream(audioPath).pipe(res);
      return;
    }
    
    // 磁盘没有，从数据中恢复
    const data = await loadData();
    const msg = data.messages.find(m => m.id === messageId);
    
    if (!msg || msg.type !== 'voice') {
      return res.status(404).json({ error: '音频不存在' });
    }
    
    if (!msg.audioBase64) {
      // 兼容旧数据：尝试旧路径 /audio/audio_*.mp3
      return res.status(404).json({ error: '音频数据已丢失' });
    }
    
    // 从base64恢复文件到磁盘缓存
    const audioDir = path.join(__dirname, 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    const audioBuffer = Buffer.from(msg.audioBase64, 'base64');
    fs.writeFileSync(audioPath, audioBuffer);
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (err) {
    console.error('Audio serve error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== 好友系统 API ==========

app.post('/api/friends/request', async (req, res) => {
  const { fromNickname, fromAvatar, fromLevel, fromTitle, fromExp, toNickname, fromUserId } = req.body;
  if (!fromNickname || !toNickname) return res.status(400).json({ error: '昵称不能为空' });
  if (fromNickname === toNickname) return res.status(400).json({ error: '不能添加自己为好友' });

  try {
    let result = null;

    await withWriteLock(data => {
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

      if (isFriend) { result = { error: '你们已经是好友了', status: 400 }; return; }

      const existingReq = data.friendRequests.find(r =>
        r.sender === fromNickname && r.recver === toNickname && r.status === 'pending'
      );
      if (existingReq) { result = { error: '已发送过好友请求，等待对方确认', status: 400 }; return; }

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

        result = { autoAccepted: true, message: '已自动成为好友' };
        return;
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

      result = { message: '好友请求已发送' };
    });

    if (result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ success: true, ...result });
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
    let result = null;

    await withWriteLock(data => {
      const request = data.friendRequests.find(r => r.id === requestId);

      if (!request) { result = { error: '请求不存在', status: 404 }; return; }
      if (request.recver !== toNickname) { result = { error: '无权操作', status: 403 }; return; }
      if (request.status !== 'pending') { result = { error: '请求已处理', status: 400 }; return; }

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

        result = { message: '已添加好友' };
      } else {
        request.status = 'rejected';
        result = { message: '已拒绝好友请求' };
      }
    });

    if (result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ success: true, ...result });
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

      // 直接从 friends 表取数据（friends表由sync接口维护，数据更准确）
      let friendLevel = isUser1 ? f.user2Level : f.user1Level;
      let friendTitle = isUser1 ? f.user2Title : f.user1Title;
      let friendExp = isUser1 ? f.user2Exp : f.user1Exp;
      let friendAvatar = isUser1 ? f.user2Avatar : f.user1Avatar;

      // 仅当friends表数据缺失时，才从users表补充
      if ((!friendLevel && friendLevel !== 0) || friendLevel === undefined) {
        const friendUser = data.users.find(u =>
          (friendUserId && u.userId === friendUserId) || u.nickname === friendNickname
        );
        if (friendUser) {
          friendLevel = friendUser.level || friendLevel;
          friendTitle = friendUser.title || friendTitle;
          friendExp = friendUser.exp !== undefined ? friendUser.exp : friendExp;
          friendAvatar = friendUser.avatar || friendAvatar;
        }
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
    let result = null;

    await withWriteLock(data => {
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
        result = { error: '好友关系不存在', status: 404 };
      } else {
        result = { deleted: true, message: '好友已删除' };
      }
    });

    if (result && result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Delete friend error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== PK 功能 ==========

app.post('/api/friends/pk', async (req, res) => {
  const { myNickname, myLevel, myTitle, myExp, myAvatar, myUserId,
          friendNickname, friendLevel, friendTitle, friendExp, friendAvatar } = req.body;

  if (!myNickname || !friendNickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    // PK 只读+追加，用 loadData 即可
    const data = await loadData();

    // 好友匹配：同时支持 nickname 和 userId
    const isFriend = data.friends.some(f => {
      if (myUserId) {
        const mySide = f.user1Id === myUserId ? 'user1' : (f.user2Id === myUserId ? 'user2' : '');
        if (mySide) {
          const otherNickname = mySide === 'user1' ? f.user2 : f.user1;
          return otherNickname === friendNickname;
        }
      }
      return (f.user1 === myNickname && f.user2 === friendNickname) ||
             (f.user1 === friendNickname && f.user2 === myNickname);
    });

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

    // 用写入锁保存PK记录
    await withWriteLock(d => {
      d.pkRecords.push({
        id: Date.now(),
        challenger: myNickname,
        challengerLevel: myLevel,
        defender: friendNickname,
        defenderLevel: friendLevel,
        result: result,
        comment: comment,
        createdAt: new Date().toISOString()
      });
    });

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

// 搞笑PK评语库
const PK_COMMENTS = {
  // 完胜（等级差 >= 5）
  bigWin: [
    '这根本不是PK，这是降维打击！🐜 vs 🦖',
    '对手：我是谁？我在哪？发生了什么？😵',
    '这波属于是让了五条街还赢了🏃‍♂️💨',
    '对手：我怀疑你在开挂，而且我有证据 🕵️',
    '级别碾压局，建议对手回去重修英语 ABC 📖',
    '这差距，大概是小学和博士的区別 🎓',
    '对手的英语水平：abandon... 然后真的 abandon 了 💔',
    '这不是PK，这是老师在给学生上课 👩‍🏫',
    '对手：我想回家 😭',
    '强者恐怖如斯！对手表示已卸载App 📱🗑️'
  ],
  // 小胜（等级差 1-4）
  closeWin: [
    '险胜！但胜了就是胜了 💪😎',
    '赢是赢了，但赢得心虚 🫣',
    '就赢了一点点，不多，就亿点点 🤏',
    '差一点就翻车了！还好没翻 🚗',
    '对手：下次一定！这次不算！😤',
    '胜利虽然勉强，但头还是要昂起来的 🦒',
    '赢了！但对手表示不服要二番战 🥊',
    '这场PK告诉我们：稳住，我们能赢 ✊',
    '勉强续命成功，下次还敢 😏'
  ],
  // 平局
  draw: [
    '势均力敌！建议用石头剪刀布决胜负 ✊✋✌️',
    '旗鼓相当！你们是失散多年的英语双胞胎吗？👯',
    '平局！友谊的小船说翻没翻 🚣',
    '实力太接近了，建议加赛一轮 🔁',
    '你俩是约好的吧？这么默契 🤔',
    '打了个平手！你们该不会是同一个老师教的吧？👨‍🏫',
    '棋逢对手！建议搞个加时赛 ⏰',
    '半斤八两，谁也别笑谁 🤭'
  ],
  // 小败（等级差 1-4）
  closeLose: [
    '惜败！但败了就是败了 😢 没开玩笑',
    '差点就赢了！差的就是亿点点 🤏',
    '虽然输了，但精神可嘉！给个安慰奖 🎀',
    '对手赢了一点点，真的只有一点点 😤',
    '这次不算！我状态不好！下次一定！😤',
    '输人不输阵！头可断发型不能乱 💇',
    '微弱劣势落败，下次我准备好了 🔥',
    '败了？不可能！一定是计时器坏了 ⏱️'
  ],
  // 完败（等级差 >= 5）
  bigLose: [
    '被打得找不着北了...北在哪？🧭❓',
    '这差距有点大，建议回家背单词 📚',
    '对手：谢谢惠顾~ 你：再来一瓶！🎰',
    '被碾压了...但没关系，失败是成功之母 🤰',
    '对手：还有谁？你：...我还在 🙋',
    '实力悬殊！但记住：学霸也曾是学渣 📖',
    '被吊打了...建议先去背10个abandon冷静一下 😌',
    '对手的词典有10000词，你的词典...还在路上 📮',
    '这不是输，这是战略性撤退！🏃‍♂️💨',
    '被完虐！但今天的我已不是昨天的我 💪'
  ]
};

function getPkComment(myLevel, friendLevel, iWin) {
  const diff = Math.abs(myLevel - friendLevel);

  if (diff === 0) {
    const comments = PK_COMMENTS.draw;
    return comments[Math.floor(Math.random() * comments.length)];
  }

  const isBig = diff >= 5;

  if (iWin) {
    const pool = isBig ? PK_COMMENTS.bigWin : PK_COMMENTS.closeWin;
    return pool[Math.floor(Math.random() * pool.length)];
  } else {
    const pool = isBig ? PK_COMMENTS.bigLose : PK_COMMENTS.closeLose;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WordGlance 后端运行在端口 ${PORT}`);
});
