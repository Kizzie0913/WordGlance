// pages/messageBoard/messageBoard.js
var storage = require('../../utils/storage.js')
var levelSystem = require('../../utils/levelSystem.js')
var API_BASE = 'https://wordglance.onrender.com'

Page({
  data: {
    messages: [],
    displayMessages: [],
    newContent: '',
    loading: false,
    submitting: false,
    refreshing: false,
    nickName: '游客',
    avatarEmoji: '🐱',
    userId: '',
    userLevel: 1,
    userTitle: 'Noobslayer',
    userExp: 0,
    inputMode: 'text',
    recording: false,
    recordDuration: 0,
    playingId: null,
    pageSize: 20,
    currentPage: 1,
    hasMore: false,
    friends: [],
    replyTo: null,        // 正在回复的消息ID
    replyContent: '',    // 回复内容
    replyToNickname: '',  // 正在回复的昵称
    showMention: false,   // 是否显示@选择
    mentionFriends: [],   // @可选好友列表
    // 开发者账号列表（昵称或userId）
    developerAccounts: ['Kizzie', 'Kizzie0913']
  },

  // 格式化时间显示
  formatTime: function (timeStr) {
    if (!timeStr) return '刚刚'
    // 如果是已经格式化好的中文字符串，直接返回
    if (timeStr.indexOf('刚刚') !== -1 || timeStr.indexOf('分钟前') !== -1 || timeStr.indexOf('小时前') !== -1) {
      return timeStr
    }
    var now = new Date()
    var d = new Date(timeStr)
    if (!d || isNaN(d.getTime())) return '刚刚'
    var diff = now.getTime() - d.getTime()
    var s = Math.floor(diff / 1000)
    var m = Math.floor(s / 60)
    var h = Math.floor(m / 60)
    var days = Math.floor(h / 24)
    if (s < 60) return '刚刚'
    if (m < 60) return m + '分钟前'
    if (h < 24) return h + '小时前'
    if (days === 1) {
      return '昨天 ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes()
    }
    if (days < 7) return days + '天前'
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes()
  },

  recorderManager: null,
  recordTimer: null,
  cancelRecord: false,
  startY: 0,
  innerAudio: null,
  hasRecordAuth: false,

  onLoad: function () {
    var user = storage.getLoginUser()
    var exp = storage.getExp()
    var levelInfo = levelSystem.getLevelInfo(exp)
    if (user) {
      this.setData({
        nickName: user.nickName || '游客',
        avatarEmoji: user.avatarEmoji || '🐱',
        userId: storage.getUserId(),
        userLevel: levelInfo.level,
        userTitle: levelInfo.title,
        userExp: exp
      })
    }
    var that = this
    wx.getSetting({
      success: function (res) {
        if (res.authSetting['scope.record']) {
          that.hasRecordAuth = true
        }
      }
    })
    this.innerAudio = wx.createInnerAudioContext()
    this.innerAudio.onEnded(function () {
      that.setData({ playingId: null })
    })
    this.innerAudio.onError(function () {
      that.setData({ playingId: null })
    })
    this.recorderManager = wx.getRecorderManager()
    this.recorderManager.onStart(function () {
      that.setData({ recording: true, recordDuration: 0 })
      that.recordTimer = setInterval(function () {
        var d = that.data.recordDuration + 1
        that.setData({ recordDuration: d })
        if (d >= 30) that.stopRecord()
      }, 1000)
    })
    this.recorderManager.onStop(function (res) {
      clearInterval(that.recordTimer)
      that.setData({ recording: false })
      if (that.cancelRecord) {
        wx.showToast({ title: '已取消', icon: 'none' })
        return
      }
      if (res.duration < 800) {
        wx.showToast({ title: '说话时间太短', icon: 'none' })
        return
      }
      that.uploadVoice(res.tempFilePath, Math.round(res.duration / 1000))
    })
  },

  onUnload: function () {
    if (this.innerAudio) this.innerAudio.destroy()
    if (this.recordTimer) clearInterval(this.recordTimer)
    if (this.recorderManager && this.data.recording) this.recorderManager.stop()
  },

  onShow: function () {
    this.loadMessages()
    this.syncUserProfile()
  },

  // 同步用户最新数据到服务器
  syncUserProfile: function () {
    var user = storage.getLoginUser()
    var userId = storage.getUserId()
    if (!user || !userId) return

    var exp = storage.getExp()
    var levelInfo = levelSystem.getLevelInfo(exp)

    wx.request({
      url: API_BASE + '/api/users/sync',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        userId: userId,
        nickname: user.nickName,
        level: levelInfo.level,
        title: levelInfo.title,
        exp: exp,
        avatar: user.avatarEmoji || '🐱'
      },
      fail: function () {
        console.log('[sync] 同步用户数据失败，不影响使用')
      }
    })
  },

  loadMessages: function () {
    var that = this
    that.setData({ loading: true })
    var uid = that.data.userId || ''
    var ts = Date.now()
    wx.request({
      url: API_BASE + '/api/messages' + (uid ? '?userId=' + uid + '&_t=' + ts : '?_t=' + ts),
      method: 'GET',
      timeout: 15000,
      success: function (res) {
        var msgs = res.data && res.data.messages ? res.data.messages : []
        // 格式化时间 + 标记开发者账号
        var devAccounts = that.data.developerAccounts || []
        msgs = msgs.map(function (msg) {
          msg.timeText = that.formatTime(msg.time || msg.createdAt || msg.timestamp)
          if (devAccounts.indexOf(msg.nickname) !== -1 || devAccounts.indexOf(msg.userId) !== -1) {
            msg.isDeveloper = true
          }
          // 格式化回复时间
          if (msg.replies && msg.replies.length > 0) {
            msg.replies = msg.replies.map(function (reply) {
              reply.timeText = that.formatTime(reply.createdAt || reply.time)
              return reply
            })
          }
          return msg
        })
        // 按时间排序，确保语音和文字消息混合正确排列
        msgs.sort(function (a, b) {
          var ta = a.createdAt || a.time || a.timestamp || 0
          var tb = b.createdAt || b.time || b.timestamp || 0
          return new Date(tb).getTime() - new Date(ta).getTime()
        })
        var ps = that.data.pageSize
        that.setData({
          loading: false,
          messages: msgs,
          displayMessages: msgs.slice(0, ps),
          currentPage: 1,
          hasMore: msgs.length > ps
        })
      },
      fail: function () {
        that.setData({ loading: false })
        wx.showToast({ title: '网络连接失败', icon: 'none' })
      }
    })
  },

  onRefresh: function () {
    var that = this
    that.setData({ refreshing: true })
    var uid = that.data.userId || ''
    var ts = Date.now()
    wx.request({
      url: API_BASE + '/api/messages' + (uid ? '?userId=' + uid + '&_t=' + ts : '?_t=' + ts),
      method: 'GET',
      timeout: 15000,
      success: function (res) {
        var msgs = res.data && res.data.messages ? res.data.messages : []
        // 格式化时间 + 标记开发者账号
        var devAccounts = that.data.developerAccounts || []
        msgs = msgs.map(function (msg) {
          msg.timeText = that.formatTime(msg.time || msg.createdAt || msg.timestamp)
          if (devAccounts.indexOf(msg.nickname) !== -1 || devAccounts.indexOf(msg.userId) !== -1) {
            msg.isDeveloper = true
          }
          // 格式化回复时间
          if (msg.replies && msg.replies.length > 0) {
            msg.replies = msg.replies.map(function (reply) {
              reply.timeText = that.formatTime(reply.createdAt || reply.time)
              return reply
            })
          }
          return msg
        })
        // 按时间排序，确保语音和文字消息混合正确排列
        msgs.sort(function (a, b) {
          var ta = a.createdAt || a.time || a.timestamp || 0
          var tb = b.createdAt || b.time || b.timestamp || 0
          return new Date(tb).getTime() - new Date(ta).getTime()
        })
        var ps = that.data.pageSize
        that.setData({
          refreshing: false,
          messages: msgs,
          displayMessages: msgs.slice(0, ps),
          currentPage: 1,
          hasMore: msgs.length > ps
        })
      },
      fail: function () {
        that.setData({ refreshing: false })
        wx.showToast({ title: '刷新失败', icon: 'none' })
      }
    })
  },

  loadMore: function () {
    var that = this
    var np = that.data.currentPage + 1
    var ps = that.data.pageSize
    var msgs = that.data.messages
    that.setData({
      currentPage: np,
      displayMessages: msgs.slice(0, np * ps),
      hasMore: np * ps < msgs.length
    })
  },

  toggleInputMode: function () {
    var that = this
    var next = this.data.inputMode === 'text' ? 'voice' : 'text'
    if (next === 'voice' && !that.hasRecordAuth) {
      wx.authorize({
        scope: 'scope.record',
        success: function () {
          that.hasRecordAuth = true
          that.setData({ inputMode: 'voice' })
        },
        fail: function () {
          wx.showModal({
            title: '需要录音权限',
            content: '请在设置中开启录音权限',
            confirmText: '去设置',
            success: function (r) {
              if (r.confirm) wx.openSetting()
            }
          })
        }
      })
    } else {
      this.setData({ inputMode: next })
    }
  },

  onInputContent: function (e) {
    this.setData({ newContent: e.detail.value })
  },

  submitMessage: function () {
    var that = this
    var content = this.data.newContent.trim()
    if (!content) {
      wx.showToast({ title: '写点什么吧', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    that.setData({ submitting: true })
    wx.request({
      url: API_BASE + '/api/messages',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      timeout: 15000,
      data: {
        nickname: that.data.nickName,
        avatar: that.data.avatarEmoji,
        content: content,
        type: 'text',
        userId: that.data.userId
      },
      success: function (res) {
        that.setData({ submitting: false })
        if (res.data && res.data.success) {
          that.setData({ newContent: '' })
          wx.showToast({ title: '发送成功', icon: 'success' })
          that.loadMessages()
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '发送失败', icon: 'none' })
        }
      },
      fail: function () {
        that.setData({ submitting: false })
        wx.showToast({ title: '网络连接失败', icon: 'none' })
      }
    })
  },

  startRecord: function (e) {
    this.cancelRecord = false
    this.startY = e.touches[0].clientY
    this.doStartRecord()
  },

  doStartRecord: function () {
    if (!this.recorderManager) return
    this.recorderManager.start({
      format: 'mp3',
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      duration: 30000
    })
  },

  onTouchEnd: function () { this.stopRecord() },
  onTouchCancel: function () { this.cancelRecord = true; this.stopRecord() },

  stopRecord: function () {
    if (this.recorderManager) this.recorderManager.stop()
  },

  onRecordMove: function (e) {
    this.cancelRecord = (this.startY - e.touches[0].clientY > 80)
  },

  uploadVoice: function (tempFilePath, duration) {
    var that = this
    wx.showLoading({ title: '发送中...' })
    wx.getFileSystemManager().readFile({
      filePath: tempFilePath,
      encoding: 'base64',
      success: function (res) {
        wx.request({
          url: API_BASE + '/api/messages/voice',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          timeout: 30000,
          data: {
            nickname: that.data.nickName,
            avatar: that.data.avatarEmoji,
            audioData: 'data:audio/mp3;base64,' + res.data,
            duration: duration,
            userId: that.data.userId
          },
          success: function (r) {
            wx.hideLoading()
            if (r.data && r.data.success) {
              wx.showToast({ title: '发送成功', icon: 'success' })
              that.loadMessages()
            } else {
              wx.showToast({ title: '发送失败', icon: 'none' })
            }
          },
          fail: function () {
            wx.hideLoading()
            wx.showToast({ title: '网络连接失败', icon: 'none' })
          }
        })
      },
      fail: function () {
        wx.hideLoading()
        wx.showToast({ title: '音频读取失败', icon: 'none' })
      }
    })
  },

  playVoice: function (e) {
    var id = e.currentTarget.dataset.id
    var url = e.currentTarget.dataset.url
    if (this.data.playingId === id) {
      this.innerAudio.stop()
      this.setData({ playingId: null })
      return
    }
    this.innerAudio.src = API_BASE + url
    this.innerAudio.play()
    this.setData({ playingId: id })
  },

  deleteMessage: function (e) {
    var id = e.currentTarget.dataset.id
    var nickname = e.currentTarget.dataset.nickname
    var that = this
    if (nickname !== that.data.nickName) {
      wx.showToast({ title: '只能删除自己的留言', icon: 'none' })
      return
    }
    wx.showModal({
      title: '删除留言',
      content: '确定删除这条留言吗？',
      confirmColor: '#ff4757',
      success: function (r) {
        if (r.confirm) {
          wx.request({
            url: API_BASE + '/api/messages/' + id,
            method: 'DELETE',
            header: { 'Content-Type': 'application/json' },
            timeout: 10000,
            data: {
              userId: that.data.userId,
              nickname: that.data.nickName
            },
            success: function (r2) {
              if (r2.data && r2.data.success) {
                wx.showToast({ title: '已删除', icon: 'success' })
                that.loadMessages()
              } else {
                wx.showToast({ title: (r2.data && r2.data.error) || '删除失败', icon: 'none' })
              }
            },
            fail: function () {
              wx.showToast({ title: '网络连接失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  addFriend: function (e) {
    var nickname = e.currentTarget.dataset.nickname
    var avatar = e.currentTarget.dataset.avatar
    var that = this
    if (that.data.nickName === '游客') {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.showModal({
      title: '添加好友',
      content: '发送好友请求给「' + nickname + '」？',
      confirmText: '发送',
      confirmColor: '#07c160',
      success: function (r) {
        if (r.confirm) {
          wx.request({
            url: API_BASE + '/api/friends/request',
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            timeout: 10000,
            data: {
              fromNickname: that.data.nickName,
              fromAvatar: that.data.avatarEmoji,
              fromLevel: that.data.userLevel,
              fromTitle: that.data.userTitle,
              fromExp: that.data.userExp,
              fromUserId: that.data.userId,
              toNickname: nickname
            },
            success: function (r2) {
              if (r2.data && r2.data.success) {
                wx.showToast({ title: r2.data.autoAccepted ? '你们已是好友！' : '好友请求已发送', icon: 'success' })
              } else {
                wx.showToast({ title: (r2.data && r2.data.error) || '发送失败', icon: 'none' })
              }
            },
            fail: function () {
              wx.showToast({ title: '网络错误', icon: 'none' })
            }
          })
        }
      }
    })
  },

  // ========== 回复功能 ==========
  onReply: function (e) {
    var id = e.currentTarget.dataset.id
    var nickname = e.currentTarget.dataset.nickname
    this.setData({
      replyTo: id,
      replyToNickname: nickname,
      replyContent: ''
    })
  },

  onInputReply: function (e) {
    this.setData({ replyContent: e.detail.value })
  },

  submitReply: function () {
    var that = this
    var content = this.data.replyContent.trim()
    if (!content) {
      wx.showToast({ title: '写点回复吧', icon: 'none' })
      return
    }
    if (!that.data.replyTo) return

    wx.request({
      url: API_BASE + '/api/messages/' + that.data.replyTo + '/reply',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      timeout: 15000,
      data: {
        userId: that.data.userId,
        nickname: that.data.nickName,
        avatar: that.data.avatarEmoji,
        content: content,
        mentionUsers: []
      },
      success: function (res) {
        console.log('[回复] 服务器响应:', res.data);
        if (res.data && res.data.success) {
          wx.showToast({ title: '回复成功', icon: 'success' })
          that.setData({ replyTo: null, replyContent: '' })
          that.loadMessages()
        } else {
          var errMsg = (res.data && res.data.error) || '回复失败(状态码:' + res.statusCode + ')'
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 })
        }
      },
      fail: function (err) {
        console.error('[回复] 网络错误:', err);
        wx.showToast({ title: '网络连接失败', icon: 'none' })
      }
    })
  },

  cancelReply: function () {
    this.setData({ replyTo: null, replyContent: '' })
  },

  // 删除回复
  deleteReply: function (e) {
    var msgId = e.currentTarget.dataset.msgId
    var replyId = e.currentTarget.dataset.replyId
    var that = this

    wx.showModal({
      title: '删除回复',
      content: '确定删除这条回复吗？',
      confirmColor: '#ff4757',
      success: function (r) {
        if (r.confirm) {
          wx.request({
            url: API_BASE + '/api/messages/' + msgId + '/replies/' + replyId + '?userId=' + that.data.userId,
            method: 'DELETE',
            header: { 'Content-Type': 'application/json' },
            timeout: 10000,
            success: function (r2) {
              if (r2.data && r2.data.success) {
                wx.showToast({ title: '已删除', icon: 'success' })
                that.loadMessages()
              } else {
                var errMsg = (r2.data && r2.data.error) || '删除失败(状态码:' + r2.statusCode + ')'
                wx.showToast({ title: errMsg, icon: 'none', duration: 2000 })
              }
            },
            fail: function (err) {
              wx.showToast({ title: '网络连接失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  // 加载好友列表（用于@功能）
  loadFriends: function () {
    var that = this
    if (!that.data.userId) return
    wx.request({
      url: API_BASE + '/api/friends?userId=' + that.data.userId,
      method: 'GET',
      timeout: 10000,
      success: function (res) {
        if (res.data && res.data.friends) {
          that.setData({ mentionFriends: res.data.friends })
        }
      }
    })
  },

  onShow: function () {
    this.loadMessages()
    this.syncUserProfile()
    this.loadFriends()
  }
})
