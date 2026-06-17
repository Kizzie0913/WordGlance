// pages/practice/practice.js
// 做题记录 - 列表 + 统计

var storage = require('../../utils/storage.js')

Page({
  data: {
    activeCategory: 'all',
    catList: [],
    records: [],
    avgData: null,
    typeAvgs: [],
    chartData: [],
    chartMax: 100
  },

  onShow: function () {
    var config = storage.getPracticeConfig()
    var catList = Object.keys(config).map(function (key) {
      return {
        key: key,
        name: config[key].name,
        icon: config[key].icon
      }
    })
    this.setData({ catList: catList })
    this.loadRecords()
    this.calcStats()
  },

  // 切换分类
  switchCategory: function (e) {
    var cat = e.currentTarget.dataset.cat
    this.setData({ activeCategory: cat })
    this.loadRecords()
    this.calcStats()
  },

  // 加载记录
  loadRecords: function () {
    var list = storage.getPracticeRecords()
    var cat = this.data.activeCategory
    var filtered = cat === 'all' ? list : list.filter(function (r) { return r.category === cat })
    var config = storage.getPracticeConfig()

    // 格式化日期 + 附加考试类型名称
    var formatted = filtered.map(function (r) {
      var d = new Date(r.date || r.createdAt)
      var mm = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1)
      var dd = (d.getDate() < 10 ? '0' : '') + d.getDate()
      var catInfo = config[r.category]
      return Object.assign({}, r, {
        dateStr: d.getFullYear() + '-' + mm + '-' + dd,
        categoryName: catInfo ? catInfo.name : r.category,
        categoryIcon: catInfo ? catInfo.icon : '📄'
      })
    })

    this.setData({ records: formatted })
  },

  // 计算统计数据
  calcStats: function () {
    var list = storage.getPracticeRecords()
    var cat = this.data.activeCategory
    var filtered = cat === 'all' ? list : list.filter(function (r) { return r.category === cat })
    var recent = filtered.slice(0, 5)
    if (recent.length === 0) {
      this.setData({ avgData: null, typeAvgs: [] })
      return
    }

    // 总平均
    var totalAcc = 0
    for (var i = 0; i < recent.length; i++) {
      totalAcc += recent[i].accuracy || 0
    }
    var avgData = {
      count: recent.length,
      avgAccuracy: Math.round(totalAcc / recent.length)
    }

    // 各题型平均（仅当选中具体分类时）
    var typeAvgs = []
    if (cat !== 'all') {
      var config = storage.getPracticeConfig()
      var typeConf = config[cat] ? config[cat].types : []
      typeAvgs = typeConf.map(function (tc) {
        var sum = 0
        var count = 0
        recent.forEach(function (r) {
          var t = (r.types || []).find(function (tt) { return tt.key === tc.key })
          if (t && t.fullScore > 0) {
            sum += Math.round((t.score || 0) / t.fullScore * 100)
            count++
          }
        })
        return {
          key: tc.key,
          name: tc.name,
          avg: count > 0 ? Math.round(sum / count) : 0
        }
      }).filter(function (t) { return t.avg > 0 })
    }

    // 最近一次得分率
    var lastRecord = filtered.length > 0 ? filtered[0] : null
    var lastAccuracy = lastRecord ? (lastRecord.accuracy || 0) : 0

    this.setData({ avgData: avgData, typeAvgs: typeAvgs, lastAccuracy: lastAccuracy })
    this.calcChartData()
  },

  // 计算柱状图数据（最近10次正确率）
  calcChartData: function () {
    var list = storage.getPracticeRecords()
    var cat = this.data.activeCategory
    var filtered = cat === 'all' ? list : list.filter(function (r) { return r.category === cat })
    // 按时间正序排列，方便图表从左到右显示
    var recent = filtered.slice(0, 10).reverse()

    var chartData = recent.map(function (r, idx) {
      var acc = r.accuracy || 0
      return {
        id: r.id,
        accuracy: acc,
        height: Math.max(8, Math.round(acc / 100 * 200)),
        color: acc >= 80 ? '#07c160' : acc >= 60 ? '#ff9500' : '#ff3b30',
        label: (idx + 1).toString(),
        dateStr: (function () {
          var d = new Date(r.date || r.createdAt)
          return (d.getMonth() + 1) + '/' + d.getDate()
        })()
      }
    })

    this.setData({ chartData: chartData })
  },

  // 删除记录
  deleteRecord: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条做题记录吗？',
      confirmColor: '#ff4757',
      success: function (res) {
        if (res.confirm) {
          storage.deletePracticeRecord(id)
          that.loadRecords()
          that.calcStats()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // 跳转添加
  goAdd: function () {
    wx.navigateTo({ url: '/pages/practice/add/add' })
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack({ delta: 1 })
  }
})
