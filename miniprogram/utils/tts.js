// utils/tts.js
// 通用发音工具 —— 英文用有道TTS（标准美音），中文用浏览器TTS兜底

var audioCtx = null   // 单例，避免多个音频同时播放

/**
 * 播放英文发音（有道TTS，标准美音）
 * 支持：单词、词组、整句
 */
function playEnglish(text) {
  if (!text) return
  stopAudio()
  audioCtx = wx.createInnerAudioContext()
  // type=0 美音（标准），type=1 英音
  // 有道TTS支持整句发音，不只是单词
  audioCtx.src = 'http://dict.youdao.com/dictvoice?type=0&audio=' + encodeURIComponent(text.trim())
  audioCtx.play()
  audioCtx.onError(function (err) {
    console.log('有道TTS播放失败', err)
    // 兜底：用微信内置TTS
    wx.showToast({ title: text, icon: 'none', duration: 1500 })
  })
}

/**
 * 播放中文发音（微信内置语音合成，无需额外配置）
 */
function playChinese(text) {
  if (!text) return
  stopAudio()
  // 微信小程序内置语音合成（基础库 2.1.0+）
  if (wx.createInnerAudioContext) {
    audioCtx = wx.createInnerAudioContext()
    // 用百度翻译的免费TTS（中文）
    audioCtx.src = 'https://fanyi.baidu.com/gettts?lang=zh&text=' + encodeURIComponent(text) + '&spd=4&source=web'
    audioCtx.play()
    audioCtx.onError(function (err) {
      console.log('中文TTS播放失败', err)
      wx.showToast({ title: text, icon: 'none', duration: 1500 })
    })
  }
}

/** 停止并销毁当前音频 */
function stopAudio() {
  if (audioCtx) {
    audioCtx.stop()
    try { audioCtx.destroy() } catch (e) {}
    audioCtx = null
  }
}

/**
 * 智能发音：自动判断中英文
 */
function play(text) {
  if (!text) return
  var hasChinese = /[\u4e00-\u9fa5]/.test(text)
  if (hasChinese) {
    playChinese(text)
  } else {
    playEnglish(text)
  }
}

module.exports = {
  playEnglish: playEnglish,
  playChinese: playChinese,
  play: play
}
