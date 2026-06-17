// pages/pomodoro/pomodoro.js
var storage = require('../../utils/storage')
var API_BASE = 'https://wordglance.onrender.com'

var TIPS = [
  '专注25分钟，休息5分钟，效率翻倍！',
  '番茄钟进行时，手机放远一点效果更好～',
  '完成4个番茄钟后，给自己一个长休息吧！',
  '专注期间不要切换页面哦，坚持就是胜利！',
  '今天的你已经很棒了，继续保持！',
  '番茄工作法：25分钟专注 + 5分钟休息 = 1个番茄',
  '完成任务后记得奖励自己一个小番茄🍅'
]

// 预设配置：专注时长 → [短休息, 长休息]
var PRESETS = {
  '25': { work: 25, shortBreak: 5,  longBreak: 15 },
  '30': { work: 30, shortBreak: 5,  longBreak: 15 },
  '45': { work: 45, shortBreak: 10, longBreak: 20 },
  '60': { work: 60, shortBreak: 10, longBreak: 30 }
}

Page({
  data: {
    // 当前预设
    preset: '25',
    // 时长（分钟）
    workMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    // 模式
    mode: 'work',
    phaseName: '专注模式',
    isRunning: false,
    isPaused: false,
    totalSeconds: 25 * 60,
    remainSeconds: 25 * 60,
    displayTime: '25:00',
    ringColor: '#ff6347',
    // 统计
    todayCount: 0,
    totalPomodoros: 0,
    dailyGoal: 8,
    goalPercent: 0,
    showTip: true,
    tipText: '',
    sessionCount: 0,
    // 时长编辑弹窗
    showDurationEditor: false,
    editType: 'work',
    editTypeLabel: '专注',
    editMinutes: 25,
    // 设置弹窗
    showSettings: false,
    // 用户信息（用于同步）
    userId: '',
    nickName: ''
  },

  timer: null,
  canvas: null,
  ctx: null,
  canvasW: 0,
  dpr: 1,

  onLoad: function () {
    var that = this
    that.dpr = wx.getSystemInfoSync().pixelRatio || 2
    that.loadSettings()
    that.loadData()
    that.setMode('work')
    that.showRandomTip()
    setTimeout(function () { that.initCanvas() }, 500)
    // 加载用户信息
    var user = storage.getLoginUser()
    if (user) {
      that.setData({
        userId: storage.getUserId(),
        nickName: user.nickName || ''
      })
      console.log('[番茄钟] 用户信息加载成功:', that.data.userId)
    } else {
      console.log('[番茄钟] 未登录，无法同步')
    }
  },

  onShow: function () {
    this.loadData()
    this.drawRing(0)
  },

  onUnload: function () { this.stopTimer() },

  /* ============ 加载/保存设置 ============ */
  loadSettings: function () {
    try {
      var s = wx.getStorageSync('pomodoro_settings')
      if (s) {
        this.setData({
          preset: s.preset || '25',
          workMin: s.workMin || 25,
          shortBreakMin: s.shortBreakMin || 5,
          longBreakMin: s.longBreakMin || 15
        })
      }
    } catch (e) {}
  },

  saveSettings: function () {
    try {
      wx.setStorageSync('pomodoro_settings', {
        preset: this.data.preset,
        workMin: this.data.workMin,
        shortBreakMin: this.data.shortBreakMin,
        longBreakMin: this.data.longBreakMin
      })
    } catch (e) {}
  },

  /* ============ 预设选择 ============ */
  pickPreset: function (e) {
    var p = e.currentTarget.dataset.preset
    if (this.data.isRunning) {
      wx.showToast({ title: '请先暂停计时器', icon: 'none' })
      return
    }
    var cfg = PRESETS[p]
    if (!cfg) return
    this.setData({
      preset: p,
      workMin: cfg.work,
      shortBreakMin: cfg.shortBreak,
      longBreakMin: cfg.longBreak
    })
    this.saveSettings()
    this.setMode(this.data.mode)
  },

  /* ============ 设置弹窗 ============ */
  openSettings: function () {
    if (this.data.isRunning) {
      wx.showToast({ title: '请先暂停计时器', icon: 'none' })
      return
    }
    this.setData({ showSettings: true })
  },

  closeSettings: function () {
    this.setData({ showSettings: false })
  },

  editSetting: function (e) {
    var type = e.currentTarget.dataset.type
    var labelMap = { work: '专注', shortBreak: '短休息', longBreak: '长休息' }
    var minMap = { work: this.data.workMin, shortBreak: this.data.shortBreakMin, longBreak: this.data.longBreakMin }
    this.setData({
      showSettings: false,
      showDurationEditor: true,
      editType: type,
      editTypeLabel: labelMap[type] || '专注',
      editMinutes: minMap[type] || 25
    })
  },

  /* ============ 时长编辑弹窗 ============ */
  preventBubble: function () {},

  editDuration: function (e) {
    if (this.data.isRunning) {
      wx.showToast({ title: '请先暂停计时器', icon: 'none' })
      return
    }
    var type = e.currentTarget.dataset.type
    var labelMap = { work: '专注', shortBreak: '短休息', longBreak: '长休息' }
    var minMap = { work: this.data.workMin, shortBreak: this.data.shortBreakMin, longBreak: this.data.longBreakMin }
    this.setData({
      showDurationEditor: true,
      editType: type,
      editTypeLabel: labelMap[type] || '专注',
      editMinutes: minMap[type] || 25
    })
  },

  stepperChange: function (e) {
    var delta = parseInt(e.currentTarget.dataset.delta)
    var newVal = Math.max(1, Math.min(120, this.data.editMinutes + delta))
    this.setData({ editMinutes: newVal })
  },

  saveDuration: function () {
    var type = this.data.editType
    var min = this.data.editMinutes
    var update = {}
    if (type === 'work') update.workMin = min
    if (type === 'shortBreak') update.shortBreakMin = min
    if (type === 'longBreak') update.longBreakMin = min
    update.preset = 'custom'
    update.showDurationEditor = false
    this.setData(update)
    this.saveSettings()
    this.setMode(this.data.mode)
  },

  closeDurationEditor: function () {
    this.setData({ showDurationEditor: false })
  },

  /* ============ Canvas ============ */
  initCanvas: function () {
    var that = this
    var query = wx.createSelectorQuery().in(this)
    query.select('#timerCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          setTimeout(function () { that.initCanvas() }, 800)
          return
        }
        var canvas = res[0].node
        var width = res[0].width
        that.canvasW = width
        that.canvas = canvas
        canvas.width = width * that.dpr
        canvas.height = width * that.dpr
        var ctx = canvas.getContext('2d')
        ctx.scale(that.dpr, that.dpr)
        that.ctx = ctx
        that.drawRing(0)
      })
  },

  drawRing: function (progress) {
    if (progress === undefined) {
      var total = this.data.totalSeconds
      var remain = this.data.remainSeconds
      progress = total > 0 ? (total - remain) / total : 0
    }
    progress = Math.max(0, Math.min(1, progress))
    var ctx = this.ctx
    var w = this.canvasW
    if (!ctx || !w) return

    ctx.clearRect(0, 0, w, w)
    var center = w / 2
    var radius = w / 2 - 14
    var lineWidth = 10

    // 背景环
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.strokeStyle = '#f0f0f0'
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.stroke()

    // 进度弧
    if (progress > 0) {
      ctx.beginPath()
      ctx.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
      ctx.strokeStyle = this.data.ringColor
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  },

  /* ============ 数据 ============ */
  loadData: function () {
    var today = this.getDateStr()
    var records = storage.getPomodoroRecords() || []
    var todayList = records.filter(function (r) { return r.date === today })
    var total = records.length
    var goal = storage.getPomodoroGoal() || 8
    this.setData({
      todayCount: todayList.length,
      totalPomodoros: total,
      dailyGoal: goal,
      goalPercent: goal > 0 ? Math.min(100, Math.round(todayList.length / goal * 100)) : 0
    })
  },

  /* ============ 模式 ============ */
  setMode: function (mode) {
    var config = {
      work:       { min: this.data.workMin, name: '专注模式', color: '#ff6347' },
      shortBreak: { min: this.data.shortBreakMin, name: '短休息', color: '#4cd964' },
      longBreak:  { min: this.data.longBreakMin, name: '长休息', color: '#5ac8fa' }
    }
    var c = config[mode] || config.work
    var totalSec = c.min * 60
    this.setData({
      mode: mode,
      phaseName: c.name,
      ringColor: c.color,
      totalSeconds: totalSec,
      remainSeconds: totalSec,
      displayTime: this.formatTime(totalSec),
      isRunning: false,
      isPaused: false
    })
    this.drawRing(0)
  },

  switchMode: function (e) {
    if (this.data.isRunning) {
      wx.showToast({ title: '请先暂停计时器', icon: 'none' })
      return
    }
    this.setMode(e.currentTarget.dataset.mode)
  },

  /* ============ 计时 ============ */
  toggleTimer: function () {
    this.data.isRunning ? this.pauseTimer() : this.startTimer()
  },

  startTimer: function () {
    var that = this
    that.setData({ isRunning: true, isPaused: false })
    that.timer = setInterval(function () {
      var remain = that.data.remainSeconds - 1
      var total = that.data.totalSeconds
      if (remain <= 0) {
        that.stopTimer()
        that.setData({ remainSeconds: 0, displayTime: '00:00', isRunning: false })
        that.drawRing(1)
        that.onTimerComplete()
        return
      }
      var progress = (total - remain) / total
      that.setData({ remainSeconds: remain, displayTime: that.formatTime(remain) })
      that.drawRing(progress)
    }, 1000)
  },

  pauseTimer: function () {
    this.stopTimer()
    this.setData({ isRunning: false, isPaused: true })
  },

  resetTimer: function () {
    this.stopTimer()
    this.setMode(this.data.mode)
  },

  skipPhase: function () {
    this.stopTimer()
    this.onPhaseSkip()
  },

  onTimerComplete: function () {
    var that = this
    var mode = this.data.mode
    if (wx.vibrateLong) wx.vibrateLong({ fail: function(){} })
    wx.showModal({
      title: mode === 'work' ? '🍅 专注完成！' : '✅ 休息结束！',
      content: mode === 'work' ? '辛苦了！休息一下吧～' : '休息好了，继续加油！',
      showCancel: false,
      confirmText: '好的'
    })
    if (mode === 'work') {
      var today = that.getDateStr()
      var records = storage.getPomodoroRecords() || []
      records.push({
        id: 'pomo_' + Date.now(),
        date: today,
        completedAt: new Date().toISOString(),
        duration: that.data.workMin
      })
      storage.savePomodoroRecords(records)
      // 同步到后端
      if (that.data.userId) {
        wx.request({
          url: API_BASE + '/api/pomodoro/sync',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          timeout: 8000,
          data: {
            userId: that.data.userId,
            nickname: that.data.nickName,
            duration: that.data.workMin * 60,
            type: 'focus',
            completedAt: new Date().toISOString()
          },
          fail: function () {}
        })
      }
      var sc = that.data.sessionCount + 1
      that.setData({ sessionCount: sc })
      that.setMode(sc % 4 === 0 ? 'longBreak' : 'shortBreak')
    } else {
      that.setMode('work')
    }
    that.loadData()
    that.showRandomTip()
  },

  onPhaseSkip: function () {
    var mode = this.data.mode
    if (mode === 'work') {
      var sc = this.data.sessionCount + 1
      this.setData({ sessionCount: sc })
      this.setMode(sc % 4 === 0 ? 'longBreak' : 'shortBreak')
    } else {
      this.setMode('work')
    }
  },

  stopTimer: function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  },

  /* ============ 目标 ============ */
  adjustGoal: function (e) {
    var delta = parseInt(e.currentTarget.dataset.delta)
    var newGoal = Math.max(1, Math.min(20, this.data.dailyGoal + delta))
    this.setData({
      dailyGoal: newGoal,
      goalPercent: newGoal > 0 ? Math.min(100, Math.round(this.data.todayCount / newGoal * 100)) : 0
    })
    storage.savePomodoroGoal(newGoal)
  },

  showRandomTip: function () {
    var idx = Math.floor(Math.random() * TIPS.length)
    this.setData({ showTip: true, tipText: TIPS[idx] })
  },

  formatTime: function (s) {
    var m = Math.floor(s / 60), sec = s % 60
    return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec)
  },

  getDateStr: function () {
    var d = new Date()
    var mm = d.getMonth() + 1, dd = d.getDate()
    return d.getFullYear() + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd)
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack({ delta: 1 })
  }
})
