// pages/websiteNav/websiteNav.js
// 英语学习网站导航

Page({
  data: {
    sites: [
      {
        name: '扇贝单词',
        url: 'https://www.shanbay.com/',
        desc: '科学的单词记忆系统，艾宾浩斯遗忘曲线',
        icon: '📗'
      },
      {
        name: '可可英语',
        url: 'https://www.kekenet.com/',
        desc: '丰富的英语学习资源，听力、口语、阅读',
        icon: '🎧'
      },
      {
        name: '每日英语听力',
        url: 'https://dict.eudic.net/',
        desc: '每日更新听力材料，提升听力水平',
        icon: '📻'
      },
      {
        name: 'BBC Learning English',
        url: 'https://www.bbc.co.uk/learningenglish/',
        desc: '英国BBC官方英语学习平台',
        icon: '🇬🇧'
      },
      {
        name: 'VOA Learning English',
        url: 'https://learningenglish.voanews.com/',
        desc: '美国之音英语学习，美式英语',
        icon: '🇺🇸'
      },
      {
        name: '沪江英语',
        url: 'https://www.hujiang.com/',
        desc: '老牌英语学习社区，海量学习资料',
        icon: '🏫'
      },
      {
        name: 'SkELL',
        url: 'https://skell.sketchengine.eu/#home?lang=en',
        desc: '在线语料库，提供例句、词汇搭配、近义词查询',
        icon: '1️⃣'
      },
      {
        name: 'Youglish',
        url: 'https://youglish.com/',
        desc: '通过YouTube视频学习单词在真实语境中的发音和用法',
        icon: '2️⃣'
      },
      {
        name: 'playphrase.me',
        url: 'https://www.playphrase.me/#/search?language=en',
        desc: '在电影和美剧片段中听到单词或短语的地道发音',
        icon: '3️⃣'
      },
      {
        name: 'TED官网',
        url: 'https://www.ted.com/',
        desc: '全球演讲，长短素材，适合跟读模仿，提升听力+口语逻辑',
        icon: '🎤'
      }
    ]
  },

  // 复制链接
  copyUrl: function (e) {
    var url = e.currentTarget.dataset.url
    var name = e.currentTarget.dataset.name
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({
          title: name + ' 链接已复制',
          icon: 'none',
          duration: 2000
        })
      }
    })
  }
})
