// pages/practice/add/add.js
// 添加做题记录 - 得分输入

var storage = require('../../../utils/storage.js')

Page({
  data: {
    category: '',
    catList: [],
    typeConfig: [],
    scores: {},
    typeAcc: {},
    totalScored: 0,
    totalFull: 0,
    totalAccuracy: null,
    duration: '',
    note: '',
    canSave: false
  },

  onLoad: function () {
    var config = storage.getPracticeConfig()
    var catList = Object.keys(config).map(function (key) {
      return {
        key: key,
        name: config[key].name,
        icon: config[key].icon
      }
    })
    this.setData({ catList: catList })
  },

  // 选择分类
  selectCat: function (e) {
    var cat = e.currentTarget.dataset.cat
    var config = storage.getPracticeConfig()
    var types = config[cat] ? config[cat].types : []
    var totalFull = 0
    for (var i = 0; i < types.length; i++) {
      totalFull += types[i].fullScore
    }
    this.setData({
      category: cat,
      typeConfig: types,
      scores: {},
      typeAcc: {},
      totalScored: 0,
      totalFull: totalFull,
      totalAccuracy: null,
      canSave: false
    })
  },

  // 得分输入
  onScoreInput: function (e) {
    var key = e.currentTarget.dataset.key
    var value = e.detail.value
    var scores = Object.assign({}, this.data.scores)
    scores[key] = value
    this.calcAccuracy(scores)
  },

  // 计算得分率
  calcAccuracy: function (scores) {
    var types = this.data.typeConfig
    var typeAcc = {}
    var totalScored = 0
    var totalFull = 0
    var hasInput = false

    for (var i = 0; i < types.length; i++) {
      var t = types[i]
      var score = parseFloat(scores[t.key])
      var full = t.fullScore

      if (scores[t.key] !== undefined && scores[t.key] !== '') {
        if (isNaN(score)) score = 0
        if (score > full) score = full  // 不能超过满分
        if (score < 0) score = 0
        typeAcc[t.key] = full > 0 ? Math.round(score / full * 100) : 0
        totalScored += score
        totalFull += full
        hasInput = true
      } else {
        totalFull += full
      }
    }

    var totalAccuracy = totalFull > 0 ? Math.round(totalScored / totalFull * 100) : null
    if (!hasInput) totalAccuracy = null

    this.setData({
      scores: scores,
      typeAcc: typeAcc,
      totalScored: Math.round(totalScored * 10) / 10,
      totalFull: totalFull,
      totalAccuracy: totalAccuracy,
      canSave: hasInput
    })
  },

  // 时长输入
  onDurationInput: function (e) {
    this.setData({ duration: e.detail.value })
  },

  // 备注输入
  onNoteInput: function (e) {
    this.setData({ note: e.detail.value })
  },

  // 保存
  saveRecord: function () {
    if (!this.data.canSave) {
      wx.showToast({ title: '请至少填写一个得分', icon: 'none' })
      return
    }

    var types = this.data.typeConfig.map(function (t) {
      var score = parseFloat(this.data.scores[t.key]) || 0
      if (score > t.fullScore) score = t.fullScore
      if (score < 0) score = 0
      return {
        key: t.key,
        name: t.name,
        score: Math.round(score * 10) / 10,
        fullScore: t.fullScore
      }
    }.bind(this))

    var record = {
      category: this.data.category,
      date: new Date().toISOString(),
      duration: this.data.duration ? parseInt(this.data.duration) : 0,
      note: this.data.note,
      types: types
    }

    var result = storage.addPracticeRecord(record)
    if (result) {
      wx.showToast({ title: '记录成功', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 1000)
    } else {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
