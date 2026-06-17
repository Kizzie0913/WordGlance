// pages/login/login.js
// 登录页 - 老用户直接登录 / 新用户注册
// 老用户：只显示欢迎回来 + 登录按钮（不允许修改资料）
// 新用户：设置昵称 + 随机头像 + 确认登录
// 登录后修改资料请到首页资料编辑

var storage = require('../../utils/storage.js')
var levelSystem = require('../../utils/levelSystem.js')

var API_BASE = 'https://wordglance.onrender.com'

Page({
  data: {
    nickname: '',
    avatarEmoji: '',
    isReturningUser: false,  // 是否是老用户回来
    showRecoverInput: false,  // 是否显示找回账号输入
    recoverUserId: ''  // 找回账号的输入值
  },

  onLoad: function () {
    // 如果已登录，直接跳转首页
    if (storage.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }

    var that = this

    // 检查是否是老用户回来（有userId但没有登录状态）
    if (storage.hasUserId()) {
      var userId = storage.getUserId()
      // 从服务器获取之前的资料
      wx.request({
        url: API_BASE + '/api/users/profile?userId=' + encodeURIComponent(userId),
        method: 'GET',
        timeout: 8000,
        success: function (res) {
          if (res.data && res.data.user) {
            // 服务器有资料：老用户，只显示登录按钮
            that.setData({
              nickname: res.data.user.nickname || '',
              avatarEmoji: res.data.user.avatar || levelSystem.getRandomAvatar(),
              isReturningUser: true
            })
          } else {
            // userId在服务器没记录（服务器数据丢失），当作新用户
            that.setData({
              avatarEmoji: levelSystem.getRandomAvatar(),
              isReturningUser: false
            })
          }
        },
        fail: function () {
          // 网络失败：尝试用本地缓存的用户信息判断
          var oldUser = storage.getLoginUser()
          if (oldUser && oldUser.nickName) {
            // 本地有昵称缓存，当作老用户
            that.setData({
              nickname: oldUser.nickName,
              avatarEmoji: oldUser.avatarEmoji || levelSystem.getRandomAvatar(),
              isReturningUser: true
            })
          } else {
            // 本地也没有资料，当作新用户
            that.setData({
              avatarEmoji: levelSystem.getRandomAvatar(),
              isReturningUser: false
            })
          }
        }
      })
    } else {
      // 全新用户：生成随机头像，显示注册表单
      this.setData({
        avatarEmoji: levelSystem.getRandomAvatar(),
        isReturningUser: false
      })
    }
  },

  // 昵称输入（仅新用户使用）
  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value })
  },

  // 刷新头像（仅新用户使用）
  refreshAvatar: function () {
    this.setData({
      avatarEmoji: levelSystem.getRandomAvatar()
    })
  },

  // 确认登录
  onConfirmLogin: function () {
    var that = this

    // ========== 老用户：直接登录 ==========
    if (this.data.isReturningUser) {
      var userId = storage.getUserId()
      var nickname = this.data.nickname
      var avatarEmoji = this.data.avatarEmoji

      wx.showLoading({ title: '登录中...' })

      // 同步到服务器（更新最后登录时间）
      wx.request({
        url: API_BASE + '/api/users/register',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: {
          userId: userId,
          nickname: nickname,
          avatar: avatarEmoji
        },
        success: function (res) {
          wx.hideLoading()
          if (res.statusCode === 409) {
            // 昵称被其他人占用（极小概率）
            wx.showModal({
              title: '昵称被占用',
              content: '你的昵称已被其他用户使用，请联系客服或重新注册',
              confirmText: '重新注册',
              success: function (modalRes) {
                if (modalRes.confirm) {
                  // 清除旧userId，当作新用户
                  wx.removeStorageSync('persistent_user_id')
                  that.setData({
                    isReturningUser: false,
                    nickname: '',
                    avatarEmoji: levelSystem.getRandomAvatar()
                  })
                }
              }
            })
            return
          }
          that.doLocalLogin(userId, nickname, avatarEmoji)
        },
        fail: function () {
          wx.hideLoading()
          // 离线模式：仍然允许登录
          that.doLocalLogin(userId, nickname, avatarEmoji)
        }
      })
      return
    }

    // ========== 新用户：验证昵称后注册 ==========
    var nickname = this.data.nickname
    if (!nickname || nickname.trim() === '') {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    var userId = storage.getUserId()
    var avatarEmoji = this.data.avatarEmoji

    // 先检查昵称是否已存在（用于账号找回）
    wx.showLoading({ title: '检查昵称...' })

    wx.request({
      url: API_BASE + '/api/users/profile?nickname=' + encodeURIComponent(nickname.trim()),
      method: 'GET',
      timeout: 10000,
      success: function (res) {
        wx.hideLoading()
        
        if (res.data && res.data.user) {
          // 找到了！询问是否找回账号
          var user = res.data.user
          wx.showModal({
            title: '找到你的账号了！',
            content: '昵称：' + user.nickname + '\n等级：' + (user.level || 1) + '级\n经验：' + (user.exp || 0) + '\n\n是否找回这个账号？',
            confirmText: '找回账号',
            confirmColor: '#07c160',
            cancelText: '创建新账号',
            success: function (modalRes) {
              if (modalRes.confirm) {
                // 找回账号
                var userInfo = {
                  userId: user.userId,
                  nickName: user.nickname || '',
                  avatarUrl: '',
                  avatarEmoji: user.avatar || '🐱',
                  isGuest: false,
                  loginTime: Date.now()
                }
                storage.saveLoginUser(userInfo)

                wx.showToast({ title: '欢迎回来！', icon: 'success' })
                setTimeout(function () {
                  wx.switchTab({ url: '/pages/index/index' })
                }, 1200)
              } else {
                // 用户选择创建新账号，提示换昵称
                wx.showToast({ title: '请换一个昵称', icon: 'none' })
              }
            }
          })
        } else {
          // 昵称不存在，正常注册
          doRegister()
        }
      },
      fail: function () {
        wx.hideLoading()
        // 网络失败，仍允许注册（离线模式）
        doRegister()
      }
    })

    function doRegister() {
      wx.showLoading({ title: '登录中...' })

      wx.request({
        url: API_BASE + '/api/users/register',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: {
          userId: userId,
          nickname: nickname.trim(),
          avatar: avatarEmoji
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

          that.doLocalLogin(userId, nickname.trim(), avatarEmoji)
        },
        fail: function () {
          wx.hideLoading()
          // 网络失败也允许本地登录（离线模式）
          that.doLocalLogin(userId, nickname.trim(), avatarEmoji)
        }
      })
    }
  },

  // 本地登录（公共逻辑）
  doLocalLogin: function (userId, nickname, avatarEmoji) {
    var userInfo = {
      userId: userId,
      nickName: nickname,
      avatarUrl: '',
      avatarEmoji: avatarEmoji,
      isGuest: false,
      loginTime: Date.now()
    }
    storage.saveLoginUser(userInfo)
    // 同时更新内存，防止存储失败
    getApp().globalData.userInfo = userInfo

    // 初始化经验值（如果还没有）
    if (!storage.getExp() && storage.getExp() !== 0) {
      storage.setExp(0)
    }

    wx.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(function () {
      wx.switchTab({ url: '/pages/index/index' })
    }, 1200)
  },

  // 隐私协议
  showPrivacy: function () {
    wx.showModal({
      title: '用户协议与隐私政策',
      content: '本小程序重视用户隐私保护。\n\n1. 仅获取您设置的昵称和随机头像\n2. 收藏的生词和语料仅存储在您的手机本地\n3. 不会上传数据到境外服务器\n4. 不会共享给第三方',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  // ========== 找回账号功能 ==========
  showRecover: function () {
    this.setData({
      showRecoverInput: !this.data.showRecoverInput,
      recoverUserId: ''
    })
  },

  onRecoverInput: function (e) {
    this.setData({ recoverUserId: e.detail.value })
  },

  doRecover: function () {
    var input = this.data.recoverUserId.trim()
    if (!input) {
      wx.showToast({ title: '请输入用户ID或昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '查找账号中...' })

    // 先尝试用输入内容作为 userId 查找
    wx.request({
      url: API_BASE + '/api/users/profile?userId=' + encodeURIComponent(input),
      method: 'GET',
      timeout: 10000,
      success: function (res) {
        if (res.data && res.data.user) {
          // 找到了！直接登录
          doLogin(res.data.user)
          return
        }
        // userId 没找到，尝试用昵称查找
        wx.request({
          url: API_BASE + '/api/users/profile?nickname=' + encodeURIComponent(input),
          method: 'GET',
          timeout: 10000,
          success: function (res2) {
            wx.hideLoading()
            if (res2.data && res2.data.user) {
              // 找到了！直接登录
              doLogin(res2.data.user)
            } else {
              wx.showToast({ title: '未找到该用户ID或昵称', icon: 'none' })
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
        wx.showToast({ title: '网络连接失败', icon: 'none' })
      }
    })

    function doLogin(user) {
      wx.hideLoading()
      var userInfo = {
        userId: user.userId,
        nickName: user.nickname || '',
        avatarUrl: '',
        avatarEmoji: user.avatar || '🐱',
        isGuest: false,
        loginTime: Date.now()
      }
      storage.saveLoginUser(userInfo)

      wx.showToast({ title: '找回成功！欢迎回来', icon: 'success' })
      setTimeout(function () {
        wx.switchTab({ url: '/pages/index/index' })
      }, 1200)
    }
  }
})
