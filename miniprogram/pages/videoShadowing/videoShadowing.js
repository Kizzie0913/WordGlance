// pages/videoShadowing/videoShadowing.js
// 视频影子跟读

var storage = require('../../utils/storage.js')
var tts = require('../../utils/tts.js')
var md5 = require('../../utils/md5.js')
var levelSystem = require('../../utils/levelSystem.js')

// 百度翻译API配置
var BAIDU_APPID = 'rp4VoTfe7FicxFkdbxB4i6LJ'
var BAIDU_SECRET = 'Xqito83o714KNw94AmsyP08yRXQasAbZ'

Page({
  data: {
    step: 0,
    videoSrc: '',
    videoName: '',
    subtitleText: '',
    subtitles: [],
    playbackRate: 1,
    isLooping: false,
    isRecording: false,
    recordSrc: '',
    extractedWords: [],
    currentTime: 0,
    loopStart: 0,
    loopEnd: 0,
    isTranslating: false
  },

  videoCtx: null,
  recorderManager: null,
  innerAudioCtx: null,

  onLoad: function () {
    console.log('[videoShadowing] onLoad')
    this.videoCtx = wx.createVideoContext('myVideo')
    this.recorderManager = wx.getRecorderManager()
    var that = this
    this.recorderManager.onStop(function (res) {
      that.setData({ recordSrc: res.tempFilePath })
      wx.showToast({ title: '录音完成', icon: 'success' })
    })
    wx.showToast({ title: '页面加载成功', icon: 'success', duration: 1000 })
  },

  // ========== 步骤0：选择视频 ==========
  // 真机兼容写法：先用 chooseVideo（最广泛兼容），失败后再提示
  chooseVideo: function () {
    var that = this
    console.log('[chooseVideo] 点击上传按钮')
    // 真机兼容：直接调用 chooseVideo，不做任何异步操作
    wx.chooseVideo({
      sourceType: ['album'],
      maxDuration: 600,
      success: function (res) {
        console.log('[chooseVideo] 成功', res.tempFilePath)
        that.onVideoChosen(res.tempFilePath, res.duration)
      },
      fail: function (err) {
        console.log('[chooseVideo] 失败', JSON.stringify(err))
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return
        // 失败后试用 chooseMedia（新机型）
        if (wx.chooseMedia) {
          console.log('[chooseVideo] 尝试 chooseMedia')
          wx.chooseMedia({
            count: 1,
            mediaType: ['video'],
            sourceType: ['album'],
            maxDuration: 600,
            success: function (res) {
              console.log('[chooseMedia] 成功', res.tempFiles[0].tempFilePath)
              var tempUrl = res.tempFiles[0].tempFilePath
              that.onVideoChosen(tempUrl, res.tempFiles[0].duration || 0)
            },
            fail: function (err2) {
              console.log('[chooseMedia] 失败', JSON.stringify(err2))
              if (err2.errMsg && err2.errMsg.indexOf('cancel') !== -1) return
              wx.showToast({ title: '选择视频失败', icon: 'none' })
            }
          })
        } else {
          wx.showToast({ title: '请升级微信版本', icon: 'none' })
        }
      }
    })
  },

  // 视频选择成功后的公共处理
  onVideoChosen: function (tempUrl, duration) {
    this.setData({
      step: 1,
      videoSrc: tempUrl,
      videoName: '视频 ' + Math.floor(duration) + '秒',
      subtitleText: '',
      subtitles: [],
      extractedWords: [],
      recordSrc: ''
    })
    wx.showToast({ title: '视频已加载', icon: 'success' })
  },

  // ========== 步骤1：字幕处理 ==========
  onSubtitleInput: function (e) {
    this.setData({ subtitleText: e.detail.value })
  },

  loadExample: function () {
    var example = '1\n00:00:01,000 --> 00:00:04,000\nHello everyone, welcome to today\'s video.\n大家好，欢迎来到今天的视频。\n\n' +
      '2\n00:00:04,000 --> 00:00:08,000\nToday we are going to learn English through shadowing.\n今天我们将通过影子跟读学习英语。\n\n' +
      '3\n00:00:08,000 --> 00:00:12,000\nShadowing is a very effective learning method.\n影子跟读是一种非常有效的学习方法。'
    this.setData({ subtitleText: example })
    wx.showToast({ title: '已加载示例', icon: 'success' })
  },

  // 解析SRT字幕
  parseSRT: function (text) {
    var blocks = text.split(/\n\s*\n/)
    var result = []
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].trim()
      if (!block) continue
      var lines = block.split('\n')
      // 找包含 --> 的那一行
      var timeIdx = -1
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].indexOf('-->') !== -1) {
          timeIdx = j
          break
        }
      }
      if (timeIdx === -1) continue
      var parts = lines[timeIdx].split('-->')
      if (parts.length !== 2) continue
      var start = this.timeStrToSec(parts[0].trim())
      var end = this.timeStrToSec(parts[1].trim())
      var en = (lines[timeIdx + 1] || '').trim()
      var cn = (lines[timeIdx + 2] || '').trim()
      if (!cn) cn = en
      if (en) {
        result.push({ startTime: start, endTime: end, en: en, cn: cn, active: false })
      }
    }
    return result
  },

  // 解析纯文本（无时间戳）
  parsePlainText: function (text) {
    var lines = text.split('\n').filter(function (l) { return l.trim() })
    var result = []
    for (var i = 0; i < lines.length; i++) {
      result.push({ startTime: i * 5, endTime: (i + 1) * 5, en: lines[i].trim(), cn: '', active: false })
    }
    return result
  },

  timeStrToSec: function (str) {
    str = str.replace(',', '.')
    var parts = str.split(':')
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
    }
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    }
    return parseFloat(str) || 0
  },

  confirmSubtitles: function () {
    var text = this.data.subtitleText.trim()
    if (!text) {
      wx.showToast({ title: '请先输入或粘贴字幕', icon: 'none' })
      return
    }
    var subs
    if (text.indexOf('-->') !== -1) {
      subs = this.parseSRT(text)
    } else {
      subs = this.parsePlainText(text)
    }
    if (subs.length === 0) {
      wx.showToast({ title: '未识别到字幕内容', icon: 'none' })
      return
    }
    this.setData({ step: 2, subtitles: subs })
    wx.showToast({ title: '已加载' + subs.length + '条字幕', icon: 'success' })
  },

  // ========== 步骤2：播放跟读 ==========
  setSpeed: function (e) {
    var rate = Number(e.currentTarget.dataset.rate)
    this.setData({ playbackRate: rate })
    this.videoCtx.playbackRate(rate)
  },

  toggleLoop: function () {
    var isLooping = !this.data.isLooping
    if (isLooping) {
      var current = this.data.currentTime
      var subs = this.data.subtitles
      for (var i = 0; i < subs.length; i++) {
        if (current >= subs[i].startTime && current < subs[i].endTime) {
          this.setData({ isLooping: true, loopStart: subs[i].startTime, loopEnd: subs[i].endTime })
          wx.showToast({ title: '单句循环开启', icon: 'none' })
          return
        }
      }
      if (subs.length > 0) {
        this.setData({ isLooping: true, loopStart: subs[0].startTime, loopEnd: subs[0].endTime })
      }
    } else {
      this.setData({ isLooping: false })
      wx.showToast({ title: '循环已关闭', icon: 'none' })
    }
  },

  onTimeUpdate: function (e) {
    var time = e.detail.currentTime
    this.setData({ currentTime: time })
    if (this.data.isLooping && time >= this.data.loopEnd) {
      this.videoCtx.seek(this.data.loopStart)
    }
    var subs = this.data.subtitles
    var changed = false
    for (var i = 0; i < subs.length; i++) {
      var shouldBeActive = time >= subs[i].startTime && time < subs[i].endTime
      if (subs[i].active !== shouldBeActive) {
        subs[i].active = shouldBeActive
        changed = true
      }
    }
    if (changed) this.setData({ subtitles: subs })
  },

  onPlay: function () {},
  onPause: function () {},

  seekTo: function (e) {
    this.videoCtx.seek(e.currentTarget.dataset.time)
  },

  // ========== 提取单词 + 翻译 ==========
  extractWords: function () {
    var that = this
    var subs = this.data.subtitles
    if (subs.length === 0) {
      wx.showToast({ title: '请先加载字幕', icon: 'none' })
      return
    }
    var allText = ''
    for (var i = 0; i < subs.length; i++) {
      allText += subs[i].en + ' '
    }
    // 提取英文单词（去重）
    var raw = allText.match(/[a-zA-Z]+/g) || []
    var wordMap = {}
    for (var j = 0; j < raw.length; j++) {
      var w = raw[j].toLowerCase()
      if (w.length < 2) continue
      wordMap[w] = true
    }
    var unique = Object.keys(wordMap)
    if (unique.length === 0) {
      wx.showToast({ title: '未提取到单词', icon: 'none' })
      return
    }

    wx.showLoading({ title: '正在翻译...' })
    that.setData({ isTranslating: true })

    // 批量翻译（每次最多10个）
    var batchSize = 10
    var results = []
    var done = 0

    function doBatch() {
      var start = done
      var end = Math.min(start + batchSize, unique.length)
      var batch = unique.slice(start, end)
      var q = batch.join('\n')
      var salt = Date.now().toString()
      var sign = md5(BAIDU_APPID + q + salt + BAIDU_SECRET)
      wx.request({
        url: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
        method: 'GET',
        data: {
          q: q,
          from: 'en',
          to: 'zh',
          appid: BAIDU_APPID,
          salt: salt,
          sign: sign
        },
        success: function (res) {
          if (res.data && res.data.trans_result) {
            for (var k = 0; k < batch.length; k++) {
              results.push({
                english: batch[k],
                phonetic: '/  /',
                chinese: (res.data.trans_result[k] || {}).dst || batch[k],
                collected: false
              })
            }
          }
          done = end
          if (done >= unique.length) {
            // 完成
            var vocabList = storage.getVocabList()
            for (var m = 0; m < results.length; m++) {
              for (var n = 0; n < vocabList.length; n++) {
                if (vocabList[n].english === results[m].english) {
                  results[m].collected = true
                  break
                }
              }
            }
            that.setData({ extractedWords: results, isTranslating: false })
            wx.hideLoading()
            wx.showToast({ title: '已提取' + results.length + '个单词', icon: 'none' })
          } else {
            doBatch()
          }
        },
        fail: function () {
          done = end
          if (done >= unique.length) {
            that.setData({ isTranslating: false })
            wx.hideLoading()
          } else {
            doBatch()
          }
        }
      })
    }
    doBatch()
  },

  addWordFromVideo: function (e) {
    var word = e.currentTarget.dataset.word
    if (word.collected) {
      wx.showToast({ title: '已收藏', icon: 'none' })
      return
    }
    var success = storage.addVocab({
      english: word.english,
      phonetic: word.phonetic,
      chinese: word.chinese,
      source: 'video'
    })
    if (success) {
      wx.showToast({ title: '已加入生词本', icon: 'success' })
      var words = this.data.extractedWords
      for (var i = 0; i < words.length; i++) {
        if (words[i].english === word.english) {
          words[i].collected = true
          break
        }
      }
      this.setData({ extractedWords: words })
    }
  },

  // ========== 播放句子发音 ==========
  playSentence: function (e) {
    var text = e.currentTarget.dataset.text
    if (text) tts.playEnglish(text)
  },

  // ========== 录音 ==========
  toggleRecord: function () {
    if (this.data.isRecording) {
      this.recorderManager.stop()
      this.setData({ isRecording: false })
      // 完成跟读练习，增加经验值
      var newExp = storage.addExp(10)
      // 检查是否升级
      var oldLevel = levelSystem.getLevelInfo(newExp - 10).level
      var newLevel = levelSystem.getLevelInfo(newExp).level
      if (newLevel > oldLevel) {
        wx.showToast({ title: '升级了！Lv' + newLevel, icon: 'success', duration: 2000 })
      }
    } else {
      this.recorderManager.start({ format: 'mp3' })
      this.setData({ isRecording: true })
      wx.showToast({ title: '开始录音', icon: 'none' })
    }
  },

  playRecording: function () {
    if (this.data.recordSrc) {
      if (!this.innerAudioCtx) this.innerAudioCtx = wx.createInnerAudioContext()
      this.innerAudioCtx.src = this.data.recordSrc
      this.innerAudioCtx.play()
    }
  },

  playOriginal: function () {
    this.videoCtx.play()
  },

  // ========== 返回上一步 ==========
  goBackStep: function () {
    if (this.data.step === 2) {
      this.setData({ step: 1 })
    } else if (this.data.step === 1) {
      this.setData({ step: 0, videoSrc: '', subtitleText: '', subtitles: [] })
    }
  }
})
