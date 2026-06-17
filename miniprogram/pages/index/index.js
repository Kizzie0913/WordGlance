// pages/index/index.js
// 首页 - 功能入口和学习概览 + 等级显示 + 修改资料

var storage = require('../../utils/storage.js')
var levelSystem = require('../../utils/levelSystem.js')

var API_BASE = 'https://wordglance.onrender.com'

Page({
  data: {
    nickName: '游客',
    isGuest: true,
    avatarEmoji: '\uD83D\uDC64',  // 👤 默认头像
    vocabCount: 0,
    corpusCount: 0,
    todayCount: 0,
    // 等级相关
    level: 1,
    title: 'Noobslayer',
    levelEmoji: '\uD83D\uDC23',  // 🐣
    levelDesc: '菜鸟杀手',
    exp: 0,
    nextLevelExp: 20,
    progress: 0,
    isMaxLevel: false,
    // 修改资料弹窗
    showProfileEditor: false,
    editNickname: '',
    editAvatar: '',
    editUserId: '',  // 用户ID，用于账号找回
    isWechatBound: false  // 是否已绑定微信账号
  },

  onShow: function () {
    this.refreshData()
  },

  // 刷新数据
  refreshData: function () {
    var user = storage.getLoginUser()
    var vocabList = storage.getVocabList()
    var corpusList = storage.getCorpusList()
    var exp = storage.getExp()

    // 计算今日新增
    var today = new Date()
    today.setHours(0, 0, 0, 0)
    var todayTs = today.getTime()
    var todayCount = 0
    for (var i = 0; i < vocabList.length; i++) {
      if (vocabList[i].addTime && vocabList[i].addTime >= todayTs) {
        todayCount++
      }
    }

    // 如果用户没有 avatarEmoji，自动分配一个随机头像
    var avatarEmoji = '\uD83D\uDC64'
    if (user) {
      if (user.avatarEmoji) {
        avatarEmoji = user.avatarEmoji
      } else {
        // 旧用户没有随机头像，补发一个
        avatarEmoji = levelSystem.getRandomAvatar()
        user.avatarEmoji = avatarEmoji
        storage.saveLoginUser(user)
      }
    }

    // 获取等级信息
    var levelInfo = levelSystem.getLevelInfo(exp)

    this.setData({
      nickName: user ? user.nickName : '游客',
      isGuest: user ? user.isGuest : true,
      avatarEmoji: avatarEmoji,
      vocabCount: vocabList.length,
      corpusCount: corpusList.length,
      todayCount: todayCount,
      // 等级相关
      level: levelInfo.level,
      title: levelInfo.title,
      levelEmoji: levelInfo.emoji,
      levelDesc: levelInfo.desc,
      exp: levelInfo.exp,
      nextLevelExp: levelInfo.nextLevelExp,
      progress: levelInfo.progress,
      isMaxLevel: levelInfo.isMaxLevel
    })
  },

  // 跳转到登录
  goLogin: function () {
    var user = storage.getLoginUser()
    if (!user || user.isGuest) {
      wx.navigateTo({ url: '/pages/login/login' })
    } else {
      // 已登录用户点击头像：打开修改资料弹窗，并检查微信绑定状态
      var that = this
      that.setData({
        showProfileEditor: true,
        editNickname: that.data.nickName,
        editAvatar: that.data.avatarEmoji,
        editUserId: storage.getUserId() || '',
        isWechatBound: false  // 先假设未绑定
      })

      // 从服务器检查是否已绑定微信
      var userId = storage.getUserId()
      if (userId) {
        wx.request({
          url: API_BASE + '/api/users/profile?userId=' + encodeURIComponent(userId),
          method: 'GET',
          timeout: 8000,
          success: function (res) {
            if (res.data && res.data.user && res.data.user.openid) {
              that.setData({ isWechatBound: true })
            }
          }
        })
      }
    }
  },

  // ========== 修改资料 ==========

  onEditNicknameInput: function (e) {
    this.setData({ editNickname: e.detail.value })
  },

  refreshEditAvatar: function () {
    this.setData({
      editAvatar: levelSystem.getRandomAvatar()
    })
  },

  // 复制用户ID
  copyUserId: function () {
    var userId = this.data.editUserId
    if (!userId) {
      wx.showToast({ title: '用户ID为空', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: userId,
      success: function () {
        wx.showToast({ title: '已复制用户ID', icon: 'success' })
      }
    })
  },

  // 保存资料修改
  saveProfile: function () {
    var newName = this.data.editNickname.trim()
    if (!newName) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }

    var that = this
    var userId = storage.getUserId()
    var newAvatar = this.data.editAvatar

    // 先同步到服务器，检查昵称是否可用
    wx.showLoading({ title: '保存中...' })

    wx.request({
      url: API_BASE + '/api/users/register',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        userId: userId,
        nickname: newName,
        avatar: newAvatar
      },
      success: function (res) {
        wx.hideLoading()
        if (res.statusCode === 409) {
          // 昵称已被使用
          wx.showModal({
            title: '昵称不可用',
            content: (res.data && res.data.error) || '该昵称已被使用，请换一个独特的昵称',
            showCancel: false,
            confirmText: '好的'
          })
          return
        }

        // 更新本地存储
        storage.updateLoginUser({
          nickName: newName,
          avatarEmoji: newAvatar
        })

        that.setData({
          nickName: newName,
          avatarEmoji: newAvatar,
          showProfileEditor: false
        })
        wx.showToast({ title: '资料已更新', icon: 'success' })
        // 通知其他页面刷新（留言板、好友列表）
        var pages = getCurrentPages()
        // 留言板页面如果在栈中则刷新
        if (getApp().globalData.shouldRefreshMessages) {
          getApp().globalData.shouldRefreshMessages = true
        }
        // 用全局标记通知留言板和好友页刷新
        getApp().globalData.profileUpdated = Date.now()
      },
      fail: function () {
        wx.hideLoading()
        // 网络失败也允许本地保存（离线模式）
        storage.updateLoginUser({
          nickName: newName,
          avatarEmoji: newAvatar
        })
        that.setData({
          nickName: newName,
          avatarEmoji: newAvatar,
          showProfileEditor: false
        })
        wx.showToast({ title: '资料已更新（离线模式）', icon: 'success' })
      }
    })
  },

  // 取消修改
  cancelEditProfile: function () {
    this.setData({ showProfileEditor: false })
  },

  // 绑定微信账号
  bindWechatAccount: function () {
    var that = this

    // 如果已绑定，提示用户
    if (that.data.isWechatBound) {
      wx.showToast({ title: '已绑定微信账号', icon: 'none' })
      return
    }

    wx.showLoading({ title: '绑定中...' })

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          wx.hideLoading()
          wx.showToast({ title: '获取微信登录状态失败', icon: 'none' })
          return
        }

        var code = loginRes.code
        var userId = storage.getUserId()

        // 第一步：用 code 换 openid
        wx.request({
          url: API_BASE + '/api/wechat/exchange-code',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: code },
          timeout: 8000,
          success: function (res) {
            if (!res.data || !res.data.openid) {
              wx.hideLoading()
              wx.showToast({ title: '微信登录失败', icon: 'none' })
              return
            }

            var openid = res.data.openid

            // 第二步：绑定 openid 到用户账号
            wx.request({
              url: API_BASE + '/api/wechat/bind',
              method: 'POST',
              header: { 'Content-Type': 'application/json' },
              data: {
                userId: userId,
                openid: openid
              },
              timeout: 8000,
              success: function (bindRes) {
                wx.hideLoading()
                if (bindRes.data && bindRes.data.success) {
                  that.setData({ isWechatBound: true })
                  wx.showToast({ title: '微信账号绑定成功！', icon: 'success' })
                } else if (bindRes.data && bindRes.data.error) {
                  wx.showModal({
                    title: '绑定失败',
                    content: bindRes.data.error,
                    showCancel: false
                  })
                } else {
                  wx.showToast({ title: '绑定失败，请重试', icon: 'none' })
                }
              },
              fail: function () {
                wx.hideLoading()
                wx.showToast({ title: '网络错误，请重试', icon: 'none' })
              }
            })
          },
          fail: function () {
            wx.hideLoading()
            wx.showToast({ title: '网络错误，请重试', icon: 'none' })
          }
        })
      },
      fail: function () {
        wx.hideLoading()
        wx.showToast({ title: '微信登录失败', icon: 'none' })
      }
    })
  },

  // 跳转到识图翻译
  goTranslate: function () {
    wx.switchTab({ url: '/pages/photoTranslate/photoTranslate' })
  },

  // 跳转到生词库
  goLibrary: function () {
    wx.switchTab({ url: '/pages/vocabularyLibrary/vocabularyLibrary' })
  },

  // 跳转到留言板
  goMessageBoard: function () {
    wx.navigateTo({ url: '/pages/messageBoard/messageBoard' })
  },

  // 跳转到做题记录
  goPractice: function () {
    wx.navigateTo({ url: '/pages/practice/practice' })
  },

  // 跳转到番茄钟
  goPomodoro: function () {
    wx.navigateTo({ url: '/pages/pomodoro/pomodoro' })
  },

  // 跳转到网站导航
  goWebsiteNav: function () {
    wx.navigateTo({ url: '/pages/websiteNav/websiteNav' })
  },

  // 跳转到场景对话生成
  goSceneDialog: function () {
    wx.navigateTo({ url: '/pages/sceneDialog/sceneDialog' })
  },

  // 退出登录
  onLogout: function () {
    var that = this
    wx.showModal({
      title: '退出登录',
      content: '退出后生词和经验值不会丢失，下次登录可继续使用',
      confirmText: '退出',
      confirmColor: '#ff3b30',
      success: function (res) {
        if (res.confirm) {
          storage.logout()
          wx.showToast({ title: '已退出登录', icon: 'success' })
          // 跳转到登录页
          setTimeout(function () {
            wx.reLaunch({ url: '/pages/login/login' })
          }, 800)
        }
      }
    })
  }
})
