// app.js - 小程序入口文件
var storage = require('./utils/storage.js')

var API_BASE = 'https://wordglance.onrender.com'

App({
  onLaunch: function () {
    // 尝试微信自动登录
    this.tryWechatAutoLogin()

    console.log('WordGlance启动')
  },

  // 尝试微信自动登录
  tryWechatAutoLogin: function () {
    var that = this

    // 如果已登录，直接返回
    if (storage.isLoggedIn()) {
      var user = storage.getLoginUser()
      that.globalData.userInfo = user
      return
    }

    // 调用 wx.login() 获取 code
    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          // 获取 code 失败，使用本地存储
          var user = storage.getLoginUser()
          if (user) {
            that.globalData.userInfo = user
          }
          return
        }

        // 发送 code 到后端换取 openid
        wx.request({
          url: API_BASE + '/api/wechat/exchange-code',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: loginRes.code },
          timeout: 8000,
          success: function (res) {
            if (res.data && res.data.openid) {
              // 用 openid 尝试登录
              that.loginWithOpenid(res.data.openid)
            } else {
              // 换取 openid 失败，使用本地存储
              var user = storage.getLoginUser()
              if (user) {
                that.globalData.userInfo = user
              }
            }
          },
          fail: function () {
            // 网络失败，使用本地存储
            var user = storage.getLoginUser()
            if (user) {
              that.globalData.userInfo = user
            }
          }
        })
      },
      fail: function () {
        // 微信登录失败，使用本地存储
        var user = storage.getLoginUser()
        if (user) {
          that.globalData.userInfo = user
        }
      }
    })
  },

  // 用 openid 登录
  loginWithOpenid: function (openid) {
    var that = this

    wx.request({
      url: API_BASE + '/api/wechat/login',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { openid: openid },
      timeout: 8000,
      success: function (res) {
        if (res.data && res.data.user) {
          // 登录成功，保存到本地
          var user = res.data.user
          var userInfo = {
            userId: user.userId,
            nickName: user.nickname || '',
            avatarUrl: '',
            avatarEmoji: user.avatar || '🐱',
            isGuest: false,
            loginTime: Date.now()
          }
          storage.saveLoginUser(userInfo)
          that.globalData.userInfo = userInfo

          // 跳转到首页
          wx.switchTab({ url: '/pages/index/index' })
        } else {
          // 未找到绑定的账号，使用本地存储
          var localUser = storage.getLoginUser()
          if (localUser) {
            that.globalData.userInfo = localUser
          }
        }
      },
      fail: function () {
        // 网络失败，使用本地存储
        var user = storage.getLoginUser()
        if (user) {
          that.globalData.userInfo = user
        }
      }
    })
  },

  globalData: {
    userInfo: null
  }
})
