// pages/photoTranslate/photoTranslate.js
// 拍照识图翻译——百度识图 + 有道词典（免费无需密钥）

var storage = require('../../utils/storage.js')
var tts = require('../../utils/tts.js')
var levelSystem = require('../../utils/levelSystem.js')

// 百度识图AI配置（用于图像识别，非翻译）
var BAIDU_API_KEY = 'rp4VoTfe7FicxFkdbxB4i6LJ'
var BAIDU_SECRET_KEY = 'Xqito83o714KNw94AmsyP08yRXQasAbZ'

// ========== 页面逻辑 ==========
Page({
  data: {
    imageUrl: '',
    resultWords: [],
    loading: false,
    debugInfo: '',
    showDebug: false,
    // 词典详情弹窗
    showDictDetail: false,
    dictDetail: {
      word: '',
      collected: false,
      usphone: '',
      ukphone: '',
      meanings: [],   // [{pos: 'n.', defs: ['苹果', '家伙']}]
      forms: [],      // [{name: '复数', value: 'apples'}]
      examples: []    // [{en: 'She ate an apple.', zh: '她吃了一个苹果。'}]
    }
  },

  onLoad: function () {},

  // ========== 选择图片 ==========
  chooseImage: function () {
    var that = this
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempFile = res.tempFilePaths[0]
        that.setData({ imageUrl: tempFile, resultWords: [], loading: true, debugInfo: '' })
        that.recognizeImage(tempFile)
      },
      fail: function (err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return
        if (wx.chooseMedia) {
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: function (res) {
              var tempFile = res.tempFiles[0].tempFilePath
              that.setData({ imageUrl: tempFile, resultWords: [], loading: true, debugInfo: '' })
              that.recognizeImage(tempFile)
            }
          })
        }
      }
    })
  },

  // ========== 调用百度识图 ==========
  recognizeImage: function (imageUrl) {
    var that = this
    wx.showLoading({ title: '识别中...' })
    that.getBaiduToken(function (token) {
      wx.compressImage({
        src: imageUrl,
        quality: 60,
        success: function (compRes) {
          that.readAndRequest(compRes.tempFilePath || imageUrl, token)
        },
        fail: function () {
          that.readAndRequest(imageUrl, token)
        }
      })
    })
  },

  readAndRequest: function (filePath, token) {
    var that = this
    var fs = wx.getFileSystemManager()
    fs.readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (fileRes) {
        wx.request({
          url: 'https://aip.baidubce.com/rest/2.0/image-classify/v2/advanced_general?access_token=' + token,
          method: 'POST',
          header: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: { image: fileRes.data, baike_num: 0 },
          success: function (apiRes) {
            wx.hideLoading()
            if (apiRes.data && apiRes.data.error_code) {
              that.setData({
                loading: false,
                debugInfo: '百度错误：' + (apiRes.data.error_msg || apiRes.data.error_code)
              })
              wx.showModal({
                title: '识别失败',
                content: '错误：' + (apiRes.data.error_msg || '') + '\n请确认百度AI控制台已开通"通用物体和场景识别"接口。',
                showCancel: false
              })
            } else if (apiRes.data && apiRes.data.result && apiRes.data.result.length > 0) {
              that.translateKeywords(apiRes.data.result)
            } else {
              that.setData({ loading: false })
              wx.showToast({ title: '未识别到物体，请换张图片', icon: 'none' })
            }
          },
          fail: function (err) {
            wx.hideLoading()
            that.setData({ loading: false, debugInfo: '请求失败：' + JSON.stringify(err) })
            wx.showToast({ title: '网络请求失败', icon: 'none' })
          }
        })
      },
      fail: function () {
        wx.hideLoading()
        that.setData({ loading: false })
        wx.showToast({ title: '读取图片失败', icon: 'none' })
      }
    })
  },

  // ========== 把识图关键词翻译 ==========
  // 只取置信度最高的1-3个主体物品
  // 使用有道词典免费接口翻译（无需申请密钥）
  translateKeywords: function (resultList) {
    var that = this
    var keywords = []
    var used = {}
    var maxCount = 3
    for (var i = 0; i < resultList.length && keywords.length < maxCount; i++) {
      var score = resultList[i].score || resultList[i].confidence || 0
      if (score < 0.15 && keywords.length > 0) continue
      var kw = (resultList[i].keyword || resultList[i].name || '').trim()
      if (kw && !used[kw]) {
        used[kw] = true
        keywords.push(kw)
      }
    }
    if (keywords.length === 0) {
      that.setData({ loading: false })
      wx.showToast({ title: '未识别到已知物体', icon: 'none' })
      return
    }

    // 百度识图返回的keyword是中文，逐个翻译成英文
    wx.showLoading({ title: '翻译中...' })
    var translated = []
    var translateNext = function (index) {
      if (index >= keywords.length) {
        wx.hideLoading()
        that.setData({ resultWords: translated, loading: false })
        that.saveToHistory(translated)
        var newExp = storage.addExp(3)
        var oldLevel = levelSystem.getLevelInfo(newExp - 3).level
        var newLevel = levelSystem.getLevelInfo(newExp).level
        if (newLevel > oldLevel) {
          wx.showToast({ title: '升级了！Lv' + newLevel, icon: 'success', duration: 2000 })
        }
        return
      }

      var kw = keywords[index]
      var hasChinese = /[\u4e00-\u9fa5]/.test(kw)

      if (hasChinese) {
        // 中文→英文：用有道词典suggest获取英文名
        that.youdaoSuggest(kw, function (enWord) {
          translated.push({
            id: translated.length,
            english: enWord,
            phonetic: '',
            chinese: kw,
            collected: false
          })
          translateNext(index + 1)
        })
      } else {
        // 已经是英文→中文
        that.youdaoSuggest(kw, function (zhWord) {
          translated.push({
            id: translated.length,
            english: kw,
            phonetic: '',
            chinese: zhWord,
            collected: false
          })
          translateNext(index + 1)
        })
      }
    }
    translateNext(0)
  },

  // ========== 有道suggest接口（快速获取中英对照）==========
  youdaoSuggest: function (word, callback) {
    var that = this
    var hasChinese = /[\u4e00-\u9fa5]/.test(word)
    wx.request({
      url: 'https://dict.youdao.com/suggest',
      data: { q: word, le: 'eng', num: 1, doctype: 'json' },
      success: function (res) {
        if (res.data && res.data.data && res.data.data.entries && res.data.data.entries.length > 0) {
          var entry = res.data.data.entries[0]
          var explain = entry.explain || ''
          if (hasChinese) {
            // 需要英文结果：explain格式 "apple; pear" 取第一个
            var enWord = explain.split(';')[0].trim() || word
            if (/[\u4e00-\u9fa5]/.test(enWord)) {
              that.youdaoApiTranslate(word, 'zh', 'en', callback)
              return
            }
            callback(enWord)
          } else {
            // 需要中文结果：explain格式 "n. 苹果" 取中文部分
            var zhWord = explain || word
            zhWord = zhWord.replace(/^[a-z]+\.\s*/i, '').split(';')[0].trim() || word
            if (!/[\u4e00-\u9fa5]/.test(zhWord)) {
              that.youdaoApiTranslate(word, 'en', 'zh', callback)
              return
            }
            callback(zhWord)
          }
        } else {
          that.youdaoApiTranslate(word, hasChinese ? 'zh' : 'en', hasChinese ? 'en' : 'zh', callback)
        }
      },
      fail: function () {
        that.youdaoApiTranslate(word, hasChinese ? 'zh' : 'en', hasChinese ? 'en' : 'zh', callback)
      }
    })
  },

  // ========== 有道翻译API（备选方案）==========
  youdaoApiTranslate: function (word, from, to, callback) {
    var type = from === 'zh' ? 'ZH_CN2EN' : 'EN2ZH_CN'
    wx.request({
      url: 'https://fanyi.youdao.com/translate',
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: { doctype: 'json', type: type, i: word },
      success: function (res) {
        if (res.data && res.data.translateResult && res.data.translateResult.length > 0
          && res.data.translateResult[0].length > 0) {
          callback(res.data.translateResult[0][0].tgt || word)
        } else {
          callback(word)
        }
      },
      fail: function () {
        callback(word)
      }
    })
  },

  // ========== 点击单词 → 查词典详情 ==========
  showWordDetail: function (e) {
    var that = this
    var idx = e.currentTarget.dataset.idx
    var word = this.data.resultWords[idx]
    if (!word) return

    // 检查是否已被收藏
    var vocabList = storage.getVocab ? storage.getVocab() : (wx.getStorageSync('vocabList') || [])
    var isCollected = false
    for (var v = 0; v < vocabList.length; v++) {
      if (vocabList[v].english === word.english) {
        isCollected = true
        break
      }
    }

    // 确保使用英文单词查询词典（英文→中文释义）
    var queryWord = word.english || word.chinese
    var hasChinese = /[\u4e00-\u9fa5]/.test(queryWord)

    // 先显示弹窗
    that.setData({
      showDictDetail: true,
      dictDetail: {
        word: queryWord,
        chinese: word.chinese,
        collected: isCollected,
        usphone: '',
        ukphone: '',
        meanings: [],
        forms: [],
        loading: true
      }
    })

    // 如果英文单词本身包含中文，先翻译成英文再查词典
    if (hasChinese) {
      that.youdaoSuggest(queryWord, function (enWord) {
        that.setData({ 'dictDetail.word': enWord })
        that.queryYoudaoDict(enWord, word.chinese)
      })
    } else {
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

  // ========== 解析有道词典返回数据 ==========
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

    // 提取音标（ec 或 simple 字段）
    if (data.ec && data.ec.word && data.ec.word.length > 0) {
      var ecWord = data.ec.word[0]
      result.usphone = ecWord.usphone || ''
      result.ukphone = ecWord.ukphone || ''

      // 提取释义（trs字段）
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
              // 解析词性标注（如 "n. 苹果" → pos="n.", def="苹果"）
              var posMatch = meaningText.match(/^([a-z]+\.)\s*/i)
              if (posMatch) {
                var pos = posMatch[1]
                var def = meaningText.replace(posMatch[0], '')
                // 查找是否已有此词性的分组
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
                // 没有词性标注
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

      // 提取词形变化（wfs字段）
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

    // 如果ec没有数据，尝试simple字段获取音标
    if (!result.usphone && data.simple && data.simple.word && data.simple.word.length > 0) {
      result.usphone = data.simple.word[0].usphone || ''
      result.ukphone = data.simple.word[0].ukphone || ''
    }

    // 提取双语例句（blng_sents_part字段）
    if (data.blng_sents_part && data.blng_sents_part['sentence-pair']) {
      var pairs = data.blng_sents_part['sentence-pair']
      var maxExamples = Math.min(pairs.length, 3)
      for (var p = 0; p < maxExamples; p++) {
        var pair = pairs[p]
        var enSent = pair['sentence'] || pair['sentence-eng'] || ''
        var zhSent = pair['sentence-translation'] || ''
        // 清除HTML标签（有道返回的例句中关键词会被<b>包裹）
        enSent = enSent.replace(/<\/?[^>]+>/g, '')
        zhSent = zhSent.replace(/<\/?[^>]+>/g, '')
        if (enSent && zhSent) {
          result.examples.push({ en: enSent, zh: zhSent })
        }
      }
    }

    // 如果没有获取到释义，使用默认的中文释义
    if (result.meanings.length === 0) {
      result.meanings.push({ pos: '', defs: [zhWord] })
    }

    return result
  },

  // ========== 关闭词典详情弹窗 ==========
  closeDictDetail: function () {
    this.setData({ showDictDetail: false })
  },

  // ========== 防止弹窗内容区点击冒泡关闭 ==========
  preventBubble: function () {},

  // ========== 在详情页播放发音 ==========
  playDetailSound: function (e) {
    var type = e.currentTarget.dataset.type
    var word = this.data.dictDetail.word
    if (!word) return
    if (type === 'us') {
      tts.playEnglish(word)
    } else if (type === 'uk') {
      // 英音：有道TTS type=1
      var audioCtx = wx.createInnerAudioContext()
      audioCtx.src = 'http://dict.youdao.com/dictvoice?type=1&audio=' + encodeURIComponent(word.trim())
      audioCtx.play()
      audioCtx.onError(function () {
        wx.showToast({ title: word, icon: 'none', duration: 1500 })
      })
    } else {
      tts.play(word)
    }
  },

  // ========== 播放发音（列表页，点击音标区）==========
  playSound: function (e) {
    var word = e.currentTarget.dataset.word
    if (word) tts.play(word)
  },

  // ========== 保存到历史 ==========
  saveToHistory: function (words) {
    var history = wx.getStorageSync('photoHistory') || []
    history.unshift({
      time: new Date().toLocaleString(),
      imageUrl: this.data.imageUrl || '',
      words: words
    })
    if (history.length > 3) history = history.slice(0, 3)
    wx.setStorageSync('photoHistory', history)
  },

  // ========== 查看历史记录列表 ==========
  showHistoryList: function () {
    var history = wx.getStorageSync('photoHistory') || []
    if (history.length === 0) {
      wx.showToast({ title: '暂无历史记录', icon: 'none' })
      return
    }
    var items = history.map(function (h, i) {
      return (i === 0 ? '最新 · ' : '第' + (i + 1) + '条 · ') + h.time
    })
    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        var record = history[res.tapIndex]
        // 恢复该记录的图片和单词
        if (record.imageUrl) {
          this.setData({ imageUrl: record.imageUrl })
        }
        this.setData({ resultWords: record.words || [] })
        wx.showToast({ title: '已加载第' + (res.tapIndex + 1) + '条记录', icon: 'none' })
      }.bind(this)
    })
  },

  // ========== 收藏/取消收藏 ==========
  toggleCollect: function (e) {
    var idx = e.currentTarget.dataset.idx
    var key = 'resultWords[' + idx + '].collected'
    var collected = !this.data.resultWords[idx].collected
    this.setData({ [key]: collected })
    var word = this.data.resultWords[idx]
    if (collected) {
      var success = storage.addVocab({
        english: word.english,
        phonetic: word.phonetic,
        chinese: word.chinese,
        source: 'photo'
      })
      if (success) {
        wx.showToast({ title: '已收藏', icon: 'success', duration: 1000 })
        var newExp = storage.addExp(5)
        var oldLevel = levelSystem.getLevelInfo(newExp - 5).level
        var newLevel = levelSystem.getLevelInfo(newExp).level
        if (newLevel > oldLevel) {
          wx.showToast({ title: '升级了！Lv' + newLevel, icon: 'success', duration: 2000 })
        }
      }
    } else {
      storage.removeVocab(word.english)
      wx.showToast({ title: '已取消收藏', icon: 'none', duration: 1000 })
    }
  },

  // ========== 释义窗口内 收藏/取消收藏 ==========
  toggleCollectFromDetail: function () {
    var that = this
    var detail = this.data.dictDetail
    var word = detail.word
    var chinese = detail.chinese || ''
    var collected = !detail.collected

    // 同步更新 resultWords 中对应词的收藏状态
    var resultWords = this.data.resultWords
    for (var i = 0; i < resultWords.length; i++) {
      if (resultWords[i].english === word) {
        var key = 'resultWords[' + i + '].collected'
        that.setData({ [key]: collected })
        break
      }
    }

    that.setData({ 'dictDetail.collected': collected })

    if (collected) {
      var success = storage.addVocab({
        english: word,
        phonetic: detail.usphone || detail.ukphone || '',
        chinese: chinese,
        source: 'photo'
      })
      if (success) {
        wx.showToast({ title: '已收藏', icon: 'success', duration: 1000 })
        var newExp = storage.addExp(5)
        var oldLevel = levelSystem.getLevelInfo(newExp - 5).level
        var newLevel = levelSystem.getLevelInfo(newExp).level
        if (newLevel > oldLevel) {
          wx.showToast({ title: '升级了！Lv' + newLevel, icon: 'success', duration: 2000 })
        }
      }
    } else {
      storage.removeVocab(word)
      wx.showToast({ title: '已取消收藏', icon: 'none', duration: 1000 })
    }
  },

  // ========== 清空 ==========
  clearImage: function () {
    this.setData({ imageUrl: '', resultWords: [], loading: false, showDictDetail: false })
  },

  // ========== 调试 ==========
  toggleDebug: function () {
    this.setData({ showDebug: !this.data.showDebug })
  },

  // ========== 获取百度AI访问令牌 ==========
  getBaiduToken: function (callback) {
    var that = this
    var cached = wx.getStorageSync('baidu_token')
    var expireTime = wx.getStorageSync('baidu_token_expire')
    if (cached && expireTime && Date.now() < expireTime) {
      callback && callback(cached)
      return
    }
    wx.request({
      url: 'https://aip.baidubce.com/oauth/2.0/token',
      method: 'POST',
      header: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: {
        grant_type: 'client_credentials',
        client_id: BAIDU_API_KEY,
        client_secret: BAIDU_SECRET_KEY
      },
      success: function (res) {
        if (res.data && res.data.access_token) {
          wx.setStorageSync('baidu_token', res.data.access_token)
          wx.setStorageSync('baidu_token_expire', Date.now() + (res.data.expires_in - 300) * 1000)
          callback && callback(res.data.access_token)
        } else {
          wx.hideLoading()
          that.setData({ loading: false })
          wx.showToast({ title: '获取访问令牌失败', icon: 'none' })
        }
      },
      fail: function () {
        wx.hideLoading()
        that.setData({ loading: false })
        wx.showToast({ title: '网络错误，请检查域名配置', icon: 'none' })
      }
    })
  }
})
