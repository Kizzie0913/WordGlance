// server.js - WordGlance 后端（JSON文件存储版）
// 支持留言板 + 好友系统 + PK

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { messages: [], friends: [], friendRequests: [], pkRecords: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ========== 留言板 API ==========

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

// 语音留言
app.post('/api/messages/voice', (req, res) => {
  const { nickname, avatar, audioData, duration } = req.body;
  if (!audioData) return res.status(400).json({ error: '音频数据不能为空' });
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: '昵称不能为空' });

  const data = loadData();

  // 保存音频文件
  const audioDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const audioId = Date.now();
  const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, '');
  const audioPath = path.join(audioDir, `voice_${audioId}.mp3`);
  fs.writeFileSync(audioPath, Buffer.from(base64Data, 'base64'));

  const newId = data.messages.length > 0 ? Math.max(...data.messages.map(m => m.id)) + 1 : 1;
  const newMsg = {
    id: newId,
    nickname: nickname.trim(),
    avatar: avatar || '🐱',
    type: 'voice',
    audioUrl: `/uploads/voice_${audioId}.mp3`,
    duration: duration || 0,
    created_at: new Date().toISOString()
  };
  data.messages.push(newMsg);
  saveData(data);
  res.json({ success: true, message: { ...newMsg, time: '刚刚' } });
});

// 静态文件服务（音频文件）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.delete('/api/messages/:id', (req, res) => {
  const data = loadData();
  data.messages = data.messages.filter(m => m.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// ========== 好友系统 API ==========

// 发送好友请求
app.post('/api/friends/request', (req, res) => {
  const { fromNickname, fromAvatar, fromLevel, fromTitle, fromExp, toNickname } = req.body;
  if (!fromNickname || !toNickname) return res.status(400).json({ error: '昵称不能为空' });
  if (fromNickname === toNickname) return res.status(400).json({ error: '不能添加自己为好友' });

  const data = loadData();

  // 检查是否已经是好友
  const isFriend = data.friends.some(f =>
    (f.user1 === fromNickname && f.user2 === toNickname) ||
    (f.user1 === toNickname && f.user2 === fromNickname)
  );
  if (isFriend) return res.status(400).json({ error: '你们已经是好友了' });

  // 检查是否已有待处理的请求
  const existingReq = data.friendRequests.find(r =>
    r.from === fromNickname && r.to === toNickname && r.status === 'pending'
  );
  if (existingReq) return res.status(400).json({ error: '已发送过好友请求，等待对方确认' });

  // 检查对方是否已向你发送请求（自动接受）
  const reverseReq = data.friendRequests.find(r =>
    r.from === toNickname && r.to === fromNickname && r.status === 'pending'
  );
  if (reverseReq) {
    // 自动成为好友
    reverseReq.status = 'accepted';
    data.friends.push({
      user1: fromNickname,
      user2: toNickname,
      user1Avatar: fromAvatar,
      user2Avatar: reverseReq.fromAvatar,
      user1Level: fromLevel,
      user2Level: reverseReq.fromLevel,
      user1Title: fromTitle,
      user2Title: reverseReq.fromTitle,
      user1Exp: fromExp,
      user2Exp: reverseReq.fromExp,
      created_at: new Date().toISOString()
    });
    saveData(data);
    return res.json({ success: true, autoAccepted: true, message: '已自动成为好友' });
  }

  const reqId = data.friendRequests.length > 0
    ? Math.max(...data.friendRequests.map(r => r.id)) + 1
    : 1;

  data.friendRequests.push({
    id: reqId,
    from: fromNickname,
    fromAvatar: fromAvatar || '🐱',
    fromLevel: fromLevel || 1,
    fromTitle: fromTitle || 'Noobslayer',
    fromExp: fromExp || 0,
    to: toNickname,
    status: 'pending',
    created_at: new Date().toISOString()
  });
  saveData(data);
  res.json({ success: true, message: '好友请求已发送' });
});

// 获取收到的好友请求
app.get('/api/friends/requests', (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  const data = loadData();
  const requests = data.friendRequests
    .filter(r => r.to === nickname && r.status === 'pending')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ requests });
});

// 接受/拒绝好友请求
app.post('/api/friends/respond', (req, res) => {
  const { requestId, accept, toNickname, toAvatar, toLevel, toTitle, toExp } = req.body;
  if (!requestId || !toNickname) return res.status(400).json({ error: '参数不完整' });

  const data = loadData();
  const request = data.friendRequests.find(r => r.id === requestId);
  if (!request) return res.status(404).json({ error: '请求不存在' });
  if (request.to !== toNickname) return res.status(403).json({ error: '无权操作' });
  if (request.status !== 'pending') return res.status(400).json({ error: '请求已处理' });

  if (accept) {
    request.status = 'accepted';
    data.friends.push({
      user1: request.from,
      user2: toNickname,
      user1Avatar: request.fromAvatar,
      user2Avatar: toAvatar || '🐱',
      user1Level: request.fromLevel,
      user2Level: toLevel || 1,
      user1Title: request.fromTitle,
      user2Title: toTitle || 'Noobslayer',
      user1Exp: request.fromExp,
      user2Exp: toExp || 0,
      created_at: new Date().toISOString()
    });
    saveData(data);
    res.json({ success: true, message: '已添加好友' });
  } else {
    request.status = 'rejected';
    saveData(data);
    res.json({ success: true, message: '已拒绝好友请求' });
  }
});

// 获取好友列表
app.get('/api/friends', (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  const data = loadData();
  const friendships = data.friends.filter(f =>
    f.user1 === nickname || f.user2 === nickname
  );

  // 转换为好友视角
  const friends = friendships.map(f => {
    const isUser1 = f.user1 === nickname;
    return {
      nickname: isUser1 ? f.user2 : f.user1,
      avatar: isUser1 ? f.user2Avatar : f.user1Avatar,
      level: isUser1 ? f.user2Level : f.user1Level,
      title: isUser1 ? f.user2Title : f.user1Title,
      exp: isUser1 ? f.user2Exp : f.user1Exp,
      friendSince: f.created_at
    };
  });

  res.json({ friends });
});

// 删除好友
app.delete('/api/friends', (req, res) => {
  const { nickname, friendNickname } = req.body;
  if (!nickname || !friendNickname) return res.status(400).json({ error: '参数不完整' });

  const data = loadData();
  const before = data.friends.length;
  data.friends = data.friends.filter(f =>
    !((f.user1 === nickname && f.user2 === friendNickname) ||
      (f.user1 === friendNickname && f.user2 === nickname))
  );
  if (data.friends.length === before) {
    return res.status(404).json({ error: '好友关系不存在' });
  }
  saveData(data);
  res.json({ success: true, message: '已删除好友' });
});

// ========== PK 系统 API ==========

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

// 根据等级差获取随机评语
function getPkComment(myLevel, friendLevel, iWin) {
  const diff = Math.abs(myLevel - friendLevel);

  if (diff === 0) {
    // 平局
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

// PK 接口
app.post('/api/friends/pk', (req, res) => {
  const { myNickname, myLevel, myTitle, myExp, myAvatar,
          friendNickname, friendLevel, friendTitle, friendExp, friendAvatar } = req.body;

  if (!myNickname || !friendNickname) return res.status(400).json({ error: '参数不完整' });

  const data = loadData();

  // 检查是否为好友
  const isFriend = data.friends.some(f =>
    (f.user1 === myNickname && f.user2 === friendNickname) ||
    (f.user1 === friendNickname && f.user2 === myNickname)
  );
  if (!isFriend) return res.status(400).json({ error: '只能和好友PK' });

  // PK逻辑：等级为主，经验值为辅，加随机因素
  // 基础战斗力 = 等级 * 100 + 经验值
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

  // 保存PK记录
  const pkId = data.pkRecords.length > 0
    ? Math.max(...data.pkRecords.map(r => r.id)) + 1
    : 1;

  data.pkRecords.push({
    id: pkId,
    challenger: myNickname,
    challengerLevel: myLevel,
    defender: friendNickname,
    defenderLevel: friendLevel,
    result: result,
    comment: comment,
    created_at: new Date().toISOString()
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
});

// 获取PK记录
app.get('/api/friends/pk/history', (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  const data = loadData();
  const records = data.pkRecords
    .filter(r => r.challenger === nickname || r.defender === nickname)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20);

  res.json({ records });
});

// ========== 工具函数 ==========

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
  console.log('WordGlance 后端启动成功！端口：' + PORT);
});
