// server.js - WordGlance 后端（Supabase 版本）
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase 配置
const SUPABASE_URL = 'https://cdawnrlixevumhcayycw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYXZucmxpeGV2dW1oY2F5eWN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTYyNzc1MiwiZXhwIjoyMDk3MjAzNzUyfQ.tHUiI_6V4zL65uZBQVIveAbq3_1LG6IsCZ7jeQKpsQM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// ========== 用户资料 API ==========

// 注册/更新用户资料
app.post('/api/users/register', async (req, res) => {
  const { userId, nickname, avatar } = req.body;
  if (!userId || !nickname) return res.status(400).json({ error: '参数不完整' });

  const trimmedName = nickname.trim();
  
  try {
    // 检查昵称是否已被其他用户使用
    const { data: existingUsers } = await supabase
      .from('users')
      .select('user_id, nickname')
      .eq('nickname', trimmedName);
    
    if (existingUsers && existingUsers.length > 0 && existingUsers[0].user_id !== userId) {
      return res.status(409).json({ error: '该昵称已被使用，请换一个独特的昵称' });
    }

    // 查找用户
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId);
    
    const user = userData && userData.length > 0 ? userData[0] : null;
    const oldNickname = user ? user.nickname : null;

    if (user) {
      // 老用户：更新昵称和头像
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update({
          nickname: trimmedName,
          avatar: avatar || user.avatar,
          last_login: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select();
      
      if (error) throw error;

      // 同步更新所有旧留言中的昵称和头像
      await supabase
        .from('messages')
        .update({
          nickname: trimmedName,
          avatar: avatar || user.avatar
        })
        .eq('user_id', userId);

      // 同步更新好友关系中的信息
      await supabase
        .from('friends')
        .update({
          user1: trimmedName,
          user1_avatar: avatar || user.avatar
        })
        .or(`user1_id.eq.${userId},user1.eq.${oldNickname}`);

      await supabase
        .from('friends')
        .update({
          user2: trimmedName,
          user2_avatar: avatar || user.avatar
        })
        .or(`user2_id.eq.${userId},user2.eq.${oldNickname}`);

      return res.json({ success: true, user: updatedUser[0], isNew: false });
    } else {
      // 新用户
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([{
          user_id: userId,
          nickname: trimmedName,
          avatar: avatar || '🐱',
          level: 1,
          title: 'Noobslayer',
          exp: 0
        }])
        .select();
      
      if (error) throw error;
      return res.json({ success: true, user: newUser[0], isNew: true });
    }
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户资料
app.get('/api/users/profile', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId不能为空' });

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId);
    
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: '用户不存在' });
    
    res.json({ user: data[0] });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== 留言板 API ==========

app.get('/api/messages', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const userId = req.query.userId || '';

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('id', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    
    if (error) throw error;

    const messages = (data || []).map(msg => {
      const msgData = {
        ...msg,
        time: msg.created_at
      };
      // 如果提供了userId，返回当前用户是否点过赞
      if (userId && msg.liked_users) {
        msgData.isLiked = msg.liked_users.includes(userId);
      } else {
        msgData.isLiked = false;
      }
      return msgData;
    });

    res.json({ messages });
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
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        user_id: userId || '',
        nickname: nickname.trim(),
        avatar: avatar || '🐱',
        content: content.trim(),
        type: 'text',
        likes: 0,
        liked_users: []
      }])
      .select();
    
    if (error) throw error;

    res.json({
      success: true,
      message: {
        ...data[0],
        time: '刚刚'
      }
    });
  } catch (err) {
    console.error('Post message error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 点赞/取消点赞
app.post('/api/messages/:id/like', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId不能为空' });

  try {
    const messageId = parseInt(req.params.id);
    
    // 获取当前留言
    const { data: msgData, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId);
    
    if (fetchError) throw fetchError;
    if (!msgData || msgData.length === 0) return res.status(404).json({ error: '留言不存在' });
    
    const msg = msgData[0];
    const likedUsers = msg.liked_users || [];

    const userIndex = likedUsers.indexOf(userId);

    if (userIndex === -1) {
      // 未点赞，添加点赞
      likedUsers.push(userId);
      
      const { error: updateError } = await supabase
        .from('messages')
        .update({
          liked_users: likedUsers,
          likes: likedUsers.length
        })
        .eq('id', messageId);
      
      if (updateError) throw updateError;

      res.json({ success: true, liked: true, likes: likedUsers.length });
    } else {
      // 已点赞，取消点赞
      likedUsers.splice(userIndex, 1);
      
      const { error: updateError } = await supabase
        .from('messages')
        .update({
          liked_users: likedUsers,
          likes: likedUsers.length
        })
        .eq('id', messageId);
      
      if (updateError) throw updateError;

      res.json({ success: true, liked: false, likes: likedUsers.length });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== 好友系统 API ==========

// 发送好友请求
app.post('/api/friends/request', async (req, res) => {
  const { fromNickname, fromAvatar, fromLevel, fromTitle, fromExp, toNickname, fromUserId } = req.body;
  if (!fromNickname || !toNickname) return res.status(400).json({ error: '昵称不能为空' });
  if (fromNickname === toNickname) return res.status(400).json({ error: '不能添加自己为好友' });

  try {
    // 查找对方的 userId
    const { data: toUserData } = await supabase
      .from('users')
      .select('user_id')
      .eq('nickname', toNickname);
    
    const toUserId = toUserData && toUserData.length > 0 ? toUserData[0].user_id : '';

    // 检查是否已经是好友（优先用userId匹配）
    const { data: friendsData } = await supabase
      .from('friends')
      .select('*');
    
    const isFriend = friendsData && friendsData.some(f => {
      if (f.user1_id && f.user2_id && fromUserId && toUserId) {
        return (f.user1_id === fromUserId && f.user2_id === toUserId) ||
               (f.user1_id === toUserId && f.user2_id === fromUserId);
      }
      // 兼容旧数据
      return (f.user1 === fromNickname && f.user2 === toNickname) ||
             (f.user1 === toNickname && f.user2 === fromNickname);
    });

    if (isFriend) return res.status(400).json({ error: '你们已经是好友了' });

    // 检查是否已有待处理的请求
    const { data: existingReq } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('sender', fromNickname)
      .eq('recver', toNickname)
      .eq('status', 'pending');
    
    if (existingReq && existingReq.length > 0) {
      return res.status(400).json({ error: '已发送过好友请求，等待对方确认' });
    }

    // 检查对方是否已向你发送请求（自动接受）
    const { data: reverseReq } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('sender', toNickname)
      .eq('recver', fromNickname)
      .eq('status', 'pending');
    
    if (reverseReq && reverseReq.length > 0) {
      // 自动成为好友
      await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', reverseReq[0].id);

      await supabase
        .from('friends')
        .insert([{
          user1_id: fromUserId || '',
          user1: fromNickname,
          user1_avatar: fromAvatar || '🐱',
          user1_level: fromLevel || 1,
          user1_title: fromTitle || 'Noobslayer',
          user1_exp: fromExp || 0,
          user2_id: reverseReq[0].sender_user_id || '',
          user2: toNickname,
          user2_avatar: reverseReq[0].sender_avatar,
          user2_level: reverseReq[0].sender_level,
          user2_title: reverseReq[0].sender_title,
          user2_exp: reverseReq[0].sender_exp
        }]);

      return res.json({ success: true, autoAccepted: true, message: '已自动成为好友' });
    }

    // 创建新的好友请求
    const { error } = await supabase
      .from('friend_requests')
      .insert([{
        sender: fromNickname,
        sender_user_id: fromUserId || '',
        sender_avatar: fromAvatar || '🐱',
        sender_level: fromLevel || 1,
        sender_title: fromTitle || 'Noobslayer',
        sender_exp: fromExp || 0,
        recver: toNickname,
        status: 'pending'
      }]);
    
    if (error) throw error;

    res.json({ success: true, message: '好友请求已发送' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取收到的好友请求
app.get('/api/friends/requests', async (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('recver', nickname)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (error) throw error;

    res.json({ requests: data || [] });
  } catch (err) {
    console.error('Friend requests error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 接受/拒绝好友请求
app.post('/api/friends/respond', async (req, res) => {
  const { requestId, accept, toNickname, toAvatar, toLevel, toTitle, toExp, toUserId } = req.body;
  if (!requestId || !toNickname) return res.status(400).json({ error: '参数不完整' });

  try {
    // 获取请求
    const { data: requestData, error: fetchError } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('id', requestId);
    
    if (fetchError) throw fetchError;
    if (!requestData || requestData.length === 0) return res.status(404).json({ error: '请求不存在' });
    
    const request = requestData[0];

    if (request.recver !== toNickname) return res.status(403).json({ error: '无权操作' });
    if (request.status !== 'pending') return res.status(400).json({ error: '请求已处理' });

    if (accept) {
      // 接受：更新请求状态 + 创建好友关系
      await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      await supabase
        .from('friends')
        .insert([{
          user1_id: request.sender_user_id || '',
          user1: request.sender,
          user1_avatar: request.sender_avatar,
          user1_level: request.sender_level,
          user1_title: request.sender_title,
          user1_exp: request.sender_exp,
          user2_id: toUserId || '',
          user2: toNickname,
          user2_avatar: toAvatar || '🐱',
          user2_level: toLevel || 1,
          user2_title: toTitle || 'Noobslayer',
          user2_exp: toExp || 0
        }]);

      res.json({ success: true, message: '已添加好友' });
    } else {
      // 拒绝
      await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      res.json({ success: true, message: '已拒绝好友请求' });
    }
  } catch (err) {
    console.error('Friend respond error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取好友列表
app.get('/api/friends', async (req, res) => {
  const { nickname, userId } = req.query;
  if (!nickname && !userId) return res.status(400).json({ error: '参数不完整' });

  try {
    let friendsData;

    if (userId) {
      // 优先用 userId 查询
      const { data, error } = await supabase
        .from('friends')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
      
      if (error) throw error;
      friendsData = data;
    } else {
      // fallback：用 nickname 查询
      const { data, error } = await supabase
        .from('friends')
        .select('*')
        .or(`user1.eq.${nickname},user2.eq.${nickname}`);
      
      if (error) throw error;
      friendsData = data;
    }

    const friends = (friendsData || []).map(f => {
      const isUser1 = userId ? (f.user1_id === userId) : (f.user1 === nickname);
      return {
        nickname: isUser1 ? f.user2 : f.user1,
        userId: isUser1 ? (f.user2_id || '') : (f.user1_id || ''),
        avatar: isUser1 ? f.user2_avatar : f.user1_avatar,
        level: isUser1 ? f.user2_level : f.user1_level,
        title: isUser1 ? f.user2_title : f.user1_title,
        exp: isUser1 ? f.user2_exp : f.user1_exp,
        friendSince: f.created_at
      };
    });

    res.json({ friends });
  } catch (err) {
    console.error('Friends list error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除好友
app.delete('/api/friends', async (req, res) => {
  const { nickname, friendNickname, userId } = req.body;
  if ((!nickname && !userId) || !friendNickname) return res.status(400).json({ error: '参数不完整' });

  try {
    // 查找并删除好友关系
    const { data: friendsData, error: fetchError } = await supabase
      .from('friends')
      .select('*');
    
    if (fetchError) throw fetchError;

    let deleted = false;
    for (const f of (friendsData || [])) {
      let shouldDelete = false;
        
      if (userId && f.user1_id && f.user2_id) {
        const mySide = f.user1_id === userId ? 'user1' : (f.user2_id === userId ? 'user2' : '');
        if (mySide) {
          const otherNickname = mySide === 'user1' ? f.user2 : f.user1;
          shouldDelete = otherNickname === friendNickname;
        }
      } else {
        shouldDelete = (f.user1 === nickname && f.user2 === friendNickname) ||
                      (f.user1 === friendNickname && f.user2 === nickname);
      }

      if (shouldDelete) {
        const { error: deleteError } = await supabase
          .from('friends')
          .delete()
          .eq('id', f.id);
          
        if (deleteError) throw deleteError;
        deleted = true;
      }
    }

    if (!deleted) return res.status(404).json({ error: '好友关系不存在' });

    res.json({ success: true, message: '好友已删除' });
  } catch (err) {
    console.error('Delete friend error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========== PK 功能 ==========

function getPkComment(myLevel, friendLevel, iWin) {
  const diff = Math.abs(myLevel - friendLevel);
  
  if (diff === 0) {
    // 旗鼓相当
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
        `以弱胜强！${friendLevel}级的对手输给了${myLevel}级的我！🎉`,
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
        `输给${friendLevel}级的对手，差距太大了...😭`,
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

app.post('/api/friends/pk', async (req, res) => {
  const { myNickname, myLevel, myTitle, myExp, myAvatar,
          friendNickname, friendLevel, friendTitle, friendExp, friendAvatar } = req.body;

  if (!myNickname || !friendNickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    // 检查是否好友
    const { data: friendsData } = await supabase
      .from('friends')
      .select('*');
    
    const isFriend = friendsData && friendsData.some(f =>
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
    await supabase
      .from('pk_records')
      .insert([{
        challenger: myNickname,
        challenger_level: myLevel,
        defender: friendNickname,
        defender_level: friendLevel,
        result: result,
        comment: comment
      }]);

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
app.get('/api/friends/pk/history', async (req, res) => {
  const { nickname } = req.query;
  if (!nickname) return res.status(400).json({ error: '昵称不能为空' });

  try {
    const { data, error } = await supabase
      .from('pk_records')
      .select('*')
      .or(`challenger.eq.${nickname},defender.eq.${nickname}`)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) throw error;

    res.json({ records: data || [] });
  } catch (err) {
    console.error('PK history error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 时间格式化函数
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
  console.log(`WordGlance 后端运行在端口 ${PORT}`);
});
