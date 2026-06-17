// app.js - 小程序入口文件
var storage = require('./utils/storage.js')

App({
  onLaunch: function () {
    // 从本地存储恢复登录信息到内存
    var user = storage.getLoginUser()
    if (user) {
      this.globalData.userInfo = user
    }
    console.log('WordGlance启动')
  },

  globalData: {
    userInfo: null
  }
})
