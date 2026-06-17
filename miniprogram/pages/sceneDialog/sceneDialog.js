// pages/sceneDialog/sceneDialog.js
var storage = require('../../utils/storage.js')
var API_BASE = 'https://wordglance.onrender.com'

Page({
  data: {
    scenes: ['出行','购物','校园','餐厅','医院','工作','家庭','社交'],
    selectedScene: '',
    corpusList: [],
    selectedCorpus: [],
    loading: false,
    dialog: null
  },

  onLoad: function () { this.loadCorpus() },

  loadCorpus: function () {
    var list = storage.getCorpusList() || []
    this.setData({ corpusList: list })
  },

  selectScene: function (e) {
    this.setData({ selectedScene: e.currentTarget.dataset.scene, dialog: null })
  },

  toggleCorpus: function (e) {
    var id = e.currentTarget.dataset.id
    var selected = this.data.selectedCorpus
    var idx = selected.indexOf(id)
    if (idx >= 0) selected.splice(idx, 1)
    else selected.push(id)
    this.setData({ selectedCorpus: selected })
  },

  generateDialog: function () {
    if (!this.data.selectedScene) {
      wx.showToast({ title: '请先选择场景', icon: 'none' })
      return
    }
    var corpusItems = this.data.selectedCorpus.map(function (id) {
      return storage.getCorpusList().find(function (c) { return c.id === id })
    }).filter(Boolean)

    this.setData({ loading: true, dialog: null })
    var that = this
    wx.request({
      url: API_BASE + '/api/tools/scene-dialog',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      timeout: 10000,
      data: { scene: that.data.selectedScene, corpusItems: corpusItems },
      success: function (res) {
        that.setData({ loading: false })
        if (res.data && res.data.success) {
          that.setData({ dialog: res.data.dialog })
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' })
        }
      },
      fail: function () {
        that.setData({ loading: false })
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  }
})
