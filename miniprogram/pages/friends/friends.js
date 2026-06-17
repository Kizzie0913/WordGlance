// pages/friends/friends.js
// 好友系统 - 好友列表、添加好友、PK

var storage = require('../../utils/storage.js')
var levelSystem = require('../../utils/levelSystem.js')

// 后端 API 地址
var API_BASE = 'https://wordglance.onrender.com'

Page({
  data: {
    nickName: '游客',
    avatarEmoji: '🐱',
    userId: '',
    level: 1,
    title: 'Noobslayer',
    exp: 0,
    // Tab切换: friends | requests | add
    activeTab: 'friends',
    // 好友列表
    friends: [],
    // 好友请求
    requests: [],
    // 添加好友
    searchName: '',
    searchResult: null,
    searching: false,
    // PK相关
    pkResult: null,
    pkLoading: false,
    showPkAnim: false,
    // 当前正在操作的PK好友
    pkTarget: null
  },

  onShow: function () {
    this.refreshUser()
    this.syncUserProfile()
    if (this.data.activeTab === 'friends') {
      this.loadFriends()
    } else if (this.data.activeTab === 'requests') {
      this.loadRequests()
    }
  },

  // 同步用户最新数据到服务器
  syncUserProfile: function () {
    var user = storage.getLoginUser()
    if (!user || !this.data.userId) return

    var exp = storage.getExp()
    var levelInfo = levelSystem.getLevelInfo(exp)

    wx.request({
      url: API_BASE + '/api/users/sync',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        userId: this.data.userId,
        nickname: this.data.nickName,
        level: levelInfo.level,
        title: levelInfo.title,
        exp: exp,
        avatar: this.data.avatarEmoji
      },
      fail: function () {
        console.log('[sync] 同步用户数据失败，不影响使用')
      }
    })
  },

  // 刷新用户信息
  refreshUser: function () {
    var user = storage.getLoginUser()
    var exp = storage.getExp()
    var levelInfo = levelSystem.getLevelInfo(exp)
    this.setData({
      nickName: user ? user.nickName : '游客',
      avatarEmoji: user ? (user.avatarEmoji || '🐱') : '🐱',
      userId: storage.getUserId(),
      level: levelInfo.level,
      title: levelInfo.title,
      exp: exp
    })
  },

  // 切换Tab
  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab, pkResult: null })
    if (tab === 'friends') {
      this.loadFriends()
    } else if (tab === 'requests') {
      this.loadRequests()
    }
  },

  // ========== 好友列表 ==========

  loadFriends: function () {
    var that = this
    // 每次都从服务器拉取最新数据（确保昵称/头像同步）
    wx.request({
      url: API_BASE + '/api/friends?userId=' + encodeURIComponent(that.data.userId) + '&nickname=' + encodeURIComponent(that.data.nickName) + '&_t=' + Date.now(),
      method: 'GET',
      timeout: 10000,
      success: function (res) {
        if (res.data && res.data.friends) {
          that.setData({ friends: res.data.friends })
          wx.setStorageSync('local_friends', res.data.friends)
        }
      },
      fail: function () {
        // 网络失败时读本地缓存
        var cached = wx.getStorageSync('local_friends') || []
        if (cached.length > 0) {
          that.setData({ friends: cached })
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
      }
    })
  },

  // 删除好友
  deleteFriend: function (e) {
    var name = e.currentTarget.dataset.name
    var that = this
    wx.showModal({
      title: '删除好友',
      content: '确定删除好友 "' + name + '" 吗？',
      confirmColor: '#ff4757',
      success: function (res) {
        if (res.confirm) {
          wx.request({
            url: API_BASE + '/api/friends',
            method: 'DELETE',
            header: { 'Content-Type': 'application/json' },
            data: {
              nickname: that.data.nickName,
              friendNickname: name,
              userId: that.data.userId
            },
            success: function (res2) {
              if (res2.data && res2.data.success) {
                wx.showToast({ title: '已删除', icon: 'success' })
                that.loadFriends()
              } else {
                wx.showToast({ title: '操作失败', icon: 'none' })
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

  // ========== 好友请求 ==========

  loadRequests: function () {
    var that = this
    wx.request({
      url: API_BASE + '/api/friends/requests?nickname=' + encodeURIComponent(that.data.nickName) + '&_t=' + Date.now(),
      method: 'GET',
      timeout: 10000,
      success: function (res) {
        if (res.data && res.data.requests) {
          that.setData({ requests: res.data.requests })
        }
      },
      fail: function () {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  },

  // 接受好友请求
  acceptRequest: function (e) {
    var reqId = e.currentTarget.dataset.id
    var that = this
    wx.request({
      url: API_BASE + '/api/friends/respond',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        requestId: reqId,
        accept: true,
        toNickname: that.data.nickName,
        toAvatar: that.data.avatarEmoji,
        toLevel: that.data.level,
        toTitle: that.data.title,
        toExp: that.data.exp,
        toUserId: that.data.userId
      },
      success: function (res) {
        if (res.data && res.data.success) {
          wx.showToast({ title: '已添加好友', icon: 'success' })
          that.loadRequests()
          that.loadFriends()
        } else {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      },
      fail: function () {
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  // 拒绝好友请求
  rejectRequest: function (e) {
    var reqId = e.currentTarget.dataset.id
    var that = this
    wx.request({
      url: API_BASE + '/api/friends/respond',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        requestId: reqId,
        accept: false,
        toNickname: that.data.nickName
      },
      success: function () {
        that.loadRequests()
      }
    })
  },

  // ========== 添加好友 ==========

  onSearchInput: function (e) {
    this.setData({ searchName: e.detail.value, searchResult: null })
  },

  // 搜索用户（从留言板获取所有昵称列表）
  searchUser: function () {
    var name = this.data.searchName.trim()
    if (!name) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (name === this.data.nickName) {
      wx.showToast({ title: '不能添加自己', icon: 'none' })
      return
    }

    var that = this
    that.setData({ searching: true })

    // 先从留言板获取所有用户，找到匹配昵称的用户
    wx.request({
      url: API_BASE + '/api/messages?limit=200',
      method: 'GET',
      timeout: 10000,
      success: function (res) {
        that.setData({ searching: false })
        if (!res.data || !res.data.messages) {
          wx.showToast({ title: '未找到该用户', icon: 'none' })
          return
        }

        // 提取所有唯一昵称
        var userMap = {}
        res.data.messages.forEach(function (msg) {
          if (!userMap[msg.nickname]) {
            userMap[msg.nickname] = {
              nickname: msg.nickname,
              avatar: msg.avatar || '🐱',
              lastActive: msg.created_at
            }
          }
        })

        var matchedUser = userMap[name]
        if (!matchedUser) {
          wx.showToast({ title: '未找到该用户，请确认昵称', icon: 'none' })
          return
        }

        // 检查是否已经是好友（严格匹配昵称和头像，防止误判）
        var isFriend = false
        var searchName = name.trim()
        if (searchName && that.data.friends && that.data.friends.length > 0) {
          isFriend = that.data.friends.some(function (f) {
            return f && f.nickname && f.nickname.trim() === searchName
          })
        }

        // 调试日志（可在开发者工具控制台查看）
        console.log('[搜索] 搜索昵称:', searchName, '| 好友列表:', that.data.friends, '| 是否是好友:', isFriend)

        that.setData({
          searchResult: {
            nickname: matchedUser.nickname,
            avatar: matchedUser.avatar,
            isFriend: isFriend,
            requested: false
          }
        })
      },
      fail: function () {
        that.setData({ searching: false })
        wx.showToast({ title: '搜索失败', icon: 'none' })
      }
    })
  },

  // 发送好友请求
  sendFriendRequest: function () {
    var result = this.data.searchResult
    if (!result) return

    var that = this
    wx.request({
      url: API_BASE + '/api/friends/request',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        fromNickname: that.data.nickName,
        fromAvatar: that.data.avatarEmoji,
        fromLevel: that.data.level,
        fromTitle: that.data.title,
        fromExp: that.data.exp,
        fromUserId: that.data.userId,
        toNickname: result.nickname
      },
      success: function (res) {
        if (res.data && res.data.success) {
          if (res.data.autoAccepted) {
            wx.showToast({ title: '你们已是好友！', icon: 'success' })
            that.setData({ searchResult: null, searchName: '' })
            that.loadFriends()
          } else {
            wx.showToast({ title: '好友请求已发送', icon: 'success' })
            that.setData({ 'searchResult.requested': true })
          }
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '发送失败', icon: 'none' })
        }
      },
      fail: function () {
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  // ========== PK 功能 ==========

  // 打开PK确认弹窗
  openPk: function (e) {
    var name = e.currentTarget.dataset.name
    var avatar = e.currentTarget.dataset.avatar
    var level = e.currentTarget.dataset.level
    var title = e.currentTarget.dataset.title
    var exp = e.currentTarget.dataset.exp || 0
    this.setData({
      pkTarget: { nickname: name, avatar: avatar, level: level, title: title, exp: exp },
      pkResult: null
    })
  },

  // 关闭PK弹窗
  closePk: function () {
    this.setData({ pkTarget: null, pkResult: null })
  },

  // 执行PK
  doPk: function () {
    var target = this.data.pkTarget
    if (!target) return

    var that = this
    that.setData({ pkLoading: true, showPkAnim: true, pkResult: null })

    // PK动画效果
    setTimeout(function () {
      wx.request({
        url: API_BASE + '/api/friends/pk',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        timeout: 15000,
        data: {
          myNickname: that.data.nickName,
          myLevel: that.data.level,
          myTitle: that.data.title,
          myExp: that.data.exp,
          myAvatar: that.data.avatarEmoji,
          myUserId: that.data.userId,
          friendNickname: target.nickname,
          friendLevel: target.level,
          friendTitle: target.title,
          friendExp: target.exp || 0,
          friendAvatar: target.avatar
        },
        success: function (res) {
          that.setData({ pkLoading: false })
          if (res.data && res.data.success) {
            that.setData({
              pkResult: {
                result: res.data.result,
                comment: res.data.comment,
                myLevel: res.data.myLevel,
                friendLevel: res.data.friendLevel,
                myTitle: res.data.myTitle,
                friendTitle: res.data.friendTitle,
                myPower: res.data.myPower,
                friendPower: res.data.friendPower
              }
            })
            // 3秒后关闭PK动画
            setTimeout(function () {
              that.setData({ showPkAnim: false })
            }, 3000)
          } else {
            that.setData({ showPkAnim: false })
            wx.showToast({ title: 'PK失败', icon: 'none' })
          }
        },
        fail: function () {
          that.setData({ pkLoading: false, showPkAnim: false })
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
      })
    }, 2000) // PK动画持续2秒
  },

  // 阻止冒泡
  preventBubble: function () {}
})
