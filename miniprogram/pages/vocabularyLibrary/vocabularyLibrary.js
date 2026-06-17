// pages/vocabularyLibrary/vocabularyLibrary.js
// 页面3：我的生词语料库 - 本地数据展示

var storage = require('../../utils/storage.js')
var tts = require('../../utils/tts.js')

Page({
  data: {
    activeTab: 'vocab',
    vocabList: [],
    corpusList: [],
    nickName: '游客',
    isGuest: true,
    // 词典详情弹窗
    showDictDetail: false,
    dictDetail: {
      word: '',
      usphone: '',
      ukphone: '',
      meanings: [],
      forms: [],
      examples: [],
      loading: false
    },
    // 场景筛选
    sceneFilter: '全部',
    sceneList: ['全部', '出行', '购物', '校园', '餐厅', '医院', '工作', '家庭', '社交', '天气', '运动', '其他']
  },

  onShow: function () {
    this.loadData()
  },

  // 加载数据
  loadData: function () {
    var that = this
    var user = storage.getLoginUser()
    var vocabList = storage.getVocabList()
    var corpusList = storage.getCorpusList()
    var sceneFilter = that.data.sceneFilter

    // 迁移旧语料：补上 scene 字段
    var needSave = false
    for (var i = 0; i < corpusList.length; i++) {
      if (!corpusList[i].scene) {
        corpusList[i].scene = that.detectScene(corpusList[i].sentence || '', corpusList[i].translation || '')
        needSave = true
      }
      corpusList[i].addTimeText = new Date(corpusList[i].addTime).toLocaleString()
    }
    if (needSave) {
      try { wx.setStorageSync('corpus_list', corpusList) } catch(e) {}
    }

    // 按场景筛选
    var filteredCorpus = corpusList
    if (sceneFilter && sceneFilter !== '全部') {
      filteredCorpus = corpusList.filter(function (c) {
        return (c.scene || '其他') === sceneFilter
      })
    }

    that.setData({
      vocabList: vocabList,
      corpusList: filteredCorpus,
      nickName: user ? user.nickName : '游客',
      isGuest: user ? user.isGuest : true
    })
  },

  // 场景筛选
  filterByScene: function (e) {
    var scene = e.currentTarget.dataset.scene
    this.setData({ sceneFilter: scene })
    this.loadData()
  },

  // 前端场景识别（与 storage.js 保持一致）
  detectScene: function (sentence, translation) {
    var text = (sentence || '') + ' ' + (translation || '')
    text = text.toLowerCase()
    var keywords = {
      '出行': ['airport','train','station','taxi','bus','hotel','trip','travel','flight'],
      '购物': ['shop','buy','store','market','price','cost','cheap','expensive'],
      '校园': ['school','class','teacher','student','campus','library','exam','homework'],
      '餐厅': ['restaurant','food','menu','order','dish','eat','hungry'],
      '医院': ['hospital','doctor','sick','pain','medicine','health'],
      '工作': ['work','job','office','meeting','boss','colleague','career'],
      '家庭': ['family','home','parent','mother','father','brother','sister'],
      '社交': ['friend','party','meet','talk','chat','social'],
      '天气': ['weather','rain','snow','sunny','cold','hot'],
      '运动': ['sport','run','swim','gym','game','match','exercise']
    }
    var bestScene = '其他'
    var bestScore = 0
    for (var scene in keywords) {
      var score = 0
      var kws = keywords[scene]
      for (var j = 0; j < kws.length; j++) {
        if (text.indexOf(kws[j]) !== -1) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestScene = scene
      }
    }
    return bestScore > 0 ? bestScene : '其他'
  },

  // Tab切换
  switchTab: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  // ========== 点击单词 → 查词典详情 ==========
  showWordDetail: function (e) {
    var that = this
    var idx = e.currentTarget.dataset.idx
    var word = this.data.vocabList[idx]
    if (!word) return

    // 确保使用英文单词查询词典
    var queryWord = word.english || word.chinese
    var hasChinese = /[\u4e00-\u9fa5]/.test(queryWord)

    // 如果英文单词本身是中文（不应该但防万一），先用有道翻译成英文
    if (hasChinese) {
      that.setData({
        showDictDetail: true,
        dictDetail: {
          word: queryWord,
          chinese: word.chinese,
          usphone: '',
          ukphone: '',
          meanings: [],
          forms: [],
          loading: true
        }
      })
      // 先翻译成英文再查词典
      wx.request({
        url: 'https://dict.youdao.com/suggest',
        data: { q: queryWord, le: 'eng', num: 1, doctype: 'json' },
        success: function (res) {
          var enWord = queryWord
          if (res.data && res.data.data && res.data.data.entries && res.data.data.entries.length > 0) {
            var explain = res.data.data.entries[0].explain || ''
            enWord = explain.split(';')[0].trim() || queryWord
            if (/[\u4e00-\u9fa5]/.test(enWord)) enWord = queryWord
          }
          that.setData({ 'dictDetail.word': enWord })
          that.queryYoudaoDict(enWord, word.chinese)
        },
        fail: function () {
          that.queryYoudaoDict(queryWord, word.chinese)
        }
      })
    } else {
      that.setData({
        showDictDetail: true,
        dictDetail: {
          word: queryWord,
          chinese: word.chinese,
          usphone: '',
          ukphone: '',
          meanings: [],
          forms: [],
          loading: true
        }
      })
      that.queryYoudaoDict(queryWord, word.chinese)
    }
  },

  // 查询有道词典详情
  queryYoudaoDict: function (enWord, zhWord) {
    var that = this
    wx.request({
      url: 'https://dict.youdao.com/jsonapi',
      data: { q: enWord, le: 'eng' },
      success: function (res) {
        var detail = that.parseYoudaoResult(res.data, enWord, zhWord)
        detail.loading = false
        that.setData({ dictDetail: detail })
      },
      fail: function () {
        that.setData({
          'dictDetail.loading': false,
          'dictDetail.meanings': [{ pos: '', defs: [zhWord] }]
        })
      }
    })
  },

  // 解析有道词典返回数据
  parseYoudaoResult: function (data, enWord, zhWord) {
    var result = {
      word: enWord,
      chinese: zhWord,
      usphone: '',
      ukphone: '',
      meanings: [],
      forms: [],
      examples: []
    }
    if (!data) return result

    // 提取音标和释义（ec字段 = English-Chinese 词典）
    if (data.ec && data.ec.word && data.ec.word.length > 0) {
      var ecWord = data.ec.word[0]
      result.usphone = ecWord.usphone || ''
      result.ukphone = ecWord.ukphone || ''

      // 提取释义
      if (ecWord.trs && ecWord.trs.length > 0) {
        for (var i = 0; i < ecWord.trs.length; i++) {
          var tr = ecWord.trs[i]
          if (tr.tr && tr.tr[0] && tr.tr[0].l && tr.tr[0].l.i) {
            var meaningText = ''
            var items = tr.tr[0].l.i
            if (Array.isArray(items)) {
              for (var j = 0; j < items.length; j++) {
                if (typeof items[j] === 'string') {
                  meaningText += items[j]
                } else if (items[j]['#text']) {
                  meaningText += items[j]['#text']
                }
              }
            } else if (typeof items === 'string') {
              meaningText = items
            }
            if (meaningText) {
              var posMatch = meaningText.match(/^([a-z]+\.)\s*/i)
              if (posMatch) {
                var pos = posMatch[1]
                var def = meaningText.replace(posMatch[0], '')
                var found = false
                for (var k = 0; k < result.meanings.length; k++) {
                  if (result.meanings[k].pos === pos) {
                    result.meanings[k].defs.push(def)
                    found = true
                    break
                  }
                }
                if (!found) {
                  result.meanings.push({ pos: pos, defs: [def] })
                }
              } else {
                if (result.meanings.length > 0 && !result.meanings[result.meanings.length - 1].pos) {
                  result.meanings[result.meanings.length - 1].defs.push(meaningText)
                } else {
                  result.meanings.push({ pos: '', defs: [meaningText] })
                }
              }
            }
          }
        }
      }

      // 词形变化
      if (ecWord.wfs && ecWord.wfs.length > 0) {
        for (var m = 0; m < ecWord.wfs.length; m++) {
          if (ecWord.wfs[m].wf) {
            result.forms.push({
              name: ecWord.wfs[m].wf.name || '',
              value: ecWord.wfs[m].wf.value || ''
            })
          }
        }
      }
    }

    // 补充音标
    if (!result.usphone && data.simple && data.simple.word && data.simple.word.length > 0) {
      result.usphone = data.simple.word[0].usphone || ''
      result.ukphone = data.simple.word[0].ukphone || ''
    }

    // 提取双语例句
    if (data.blng_sents_part && data.blng_sents_part['sentence-pair']) {
      var pairs = data.blng_sents_part['sentence-pair']
      var maxExamples = Math.min(pairs.length, 3)
      for (var p = 0; p < maxExamples; p++) {
        var pair = pairs[p]
        var enSent = pair['sentence'] || pair['sentence-eng'] || ''
        var zhSent = pair['sentence-translation'] || ''
        enSent = enSent.replace(/<\/?[^>]+>/g, '')
        zhSent = zhSent.replace(/<\/?[^>]+>/g, '')
        if (enSent && zhSent) {
          result.examples.push({ en: enSent, zh: zhSent })
        }
      }
    }

    if (result.meanings.length === 0) {
      result.meanings.push({ pos: '', defs: [zhWord] })
    }
    return result
  },

  // 关闭词典弹窗
  closeDictDetail: function () {
    this.setData({ showDictDetail: false })
  },

  // 阻止冒泡
  preventBubble: function () {},

  // 在详情页播放发音
  playDetailSound: function (e) {
    var type = e.currentTarget.dataset.type
    var word = this.data.dictDetail.word
    if (!word) return
    if (type === 'uk') {
      var audioCtx = wx.createInnerAudioContext()
      audioCtx.src = 'http://dict.youdao.com/dictvoice?type=1&audio=' + encodeURIComponent(word.trim())
      audioCtx.play()
      audioCtx.onError(function () {
        wx.showToast({ title: word, icon: 'none', duration: 1500 })
      })
    } else {
      tts.playEnglish(word)
    }
  },

  // 朗读单词（保留，用于发音按钮）
  pronounceWord: function (e) {
    var word = e.currentTarget.dataset.word || ''
    if (word) tts.play(word)
  },

  deleteVocab: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定删除这个生词吗？',
      success: function (res) {
        if (res.confirm) {
          storage.removeVocab(id)
          that.loadData()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  clearAllVocab: function () {
    var that = this
    wx.showModal({
      title: '确认清空',
      content: '确定清空所有生词吗？此操作不可撤销！',
      success: function (res) {
        if (res.confirm) {
          storage.clearVocab()
          that.loadData()
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  deleteCorpus: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定删除这条语料吗？',
      success: function (res) {
        if (res.confirm) {
          storage.removeCorpus(id)
          that.loadData()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  clearAllCorpus: function () {
    var that = this
    wx.showModal({
      title: '确认清空',
      content: '确定清空所有语料吗？此操作不可撤销！',
      success: function (res) {
        if (res.confirm) {
          storage.clearCorpus()
          that.loadData()
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  showCorpusDetail: function (e) {
    var index = e.currentTarget.dataset.index
    var item = this.data.corpusList[index]
    if (item) {
      wx.showModal({
        title: item.title,
        content: item.content,
        showCancel: false,
        confirmText: '关闭'
      })
    }
  },

  goLogin: function () {
    var user = storage.getLoginUser()
    if (!user || user.isGuest) {
      wx.navigateTo({ url: '/pages/login/login' })
    }
  }
})
