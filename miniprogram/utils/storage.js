// utils/storage.js - 本地存储封装
// 统一管理生词、语料、登录用户数据、经验值、userId

var KEYS = {
  VOCAB: 'vocab_list',
  CORPUS: 'corpus_list',
  LOGIN: 'login_user',
  EXP: 'user_exp',
  USER_ID: 'persistent_user_id',
  PRACTICE: 'practice_records',
  POMODORO: 'pomodoro_records',
  POMODORO_GOAL: 'pomodoro_goal'
}

// ========== 生词管理 ==========

// 获取所有生词
function getVocabList() {
  try {
    return wx.getStorageSync(KEYS.VOCAB) || []
  } catch (e) {
    return []
  }
}

// 添加生词（重复则跳过）
function addVocab(word) {
  try {
    var list = getVocabList()
    // 检查是否已存在
    for (var i = 0; i < list.length; i++) {
      if (list[i].english === word.english) {
        return false
      }
    }
    word.id = 'w_' + Date.now()
    word.addTime = Date.now()
    list.unshift(word)
    wx.setStorageSync(KEYS.VOCAB, list)
    return true
  } catch (e) {
    return false
  }
}

// 删除生词
function removeVocab(id) {
  try {
    var list = getVocabList()
    var newList = []
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) {
        newList.push(list[i])
      }
    }
    wx.setStorageSync(KEYS.VOCAB, newList)
    return true
  } catch (e) {
    return false
  }
}

// 清空所有生词
function clearVocab() {
  try {
    wx.setStorageSync(KEYS.VOCAB, [])
    return true
  } catch (e) {
    return false
  }
}

// ========== 语料管理 ==========

// 获取所有语料
function getCorpusList() {
  try {
    return wx.getStorageSync(KEYS.CORPUS) || []
  } catch (e) {
    return []
  }
}

// 添加语料
function addCorpus(corpus) {
  try {
    var list = getCorpusList()
    corpus.id = 'c_' + Date.now()
    corpus.addTime = Date.now()
    // 自动识别场景
    if (!corpus.scene) {
      corpus.scene = detectScene(corpus.sentence || '', corpus.translation || '')
    }
    list.unshift(corpus)
    wx.setStorageSync(KEYS.CORPUS, list)
    return true
  } catch (e) {
    return false
  }
}

// 场景关键词（与后端保持一致）
var SCENE_KEYWORDS = {
  '出行': ['airport','train','station','taxi','bus','hotel','trip','travel','flight','subway','metro','go to','leave','arrive','depart','destination','ticket','passport','visa','luggage','suitcase','boarding','gate','terminal'],
  '购物': ['shop','store','buy','sell','price','cost','cheap','expensive','market','mall','cart','cash','card','pay','discount','sale','bargain','try on','size','color','refund','receipt'],
  '校园': ['school','class','teacher','student','campus','dorm','library','exam','test','homework','assignment','lecture','course','degree','professor','classmate','dormitory','cafeteria','graduation','semester'],
  '餐厅': ['restaurant','food','menu','order','dish','eat','hungry','breakfast','lunch','dinner','waiter','chef','reservation','table','delicious','taste','spicy','sweet','bill','tip','drink'],
  '医院': ['hospital','doctor','sick','pain','medicine','health','clinic','nurse','fever','cold','headache','prescription','treatment','symptom','injury','emergency','surgery','recover','appointment'],
  '工作': ['work','job','office','meeting','boss','colleague','career','salary','project','deadline','interview','resume','promotion','company','business','client','report','presentation','overtime'],
  '家庭': ['family','home','parent','mother','father','brother','sister','husband','wife','child','kid','baby','grandma','grandpa','relative','dinner','kitchen','living room','bedroom','garden'],
  '社交': ['friend','party','meet','talk','chat','social','hang out','date','invite','birthday','celebrate','gift','surprise','together','weekend','holiday','travel together','visit'],
  '天气': ['weather','rain','snow','sunny','cloudy','wind','storm','temperature','hot','cold','warm','cool','forecast','umbrella','coat','sweater'],
  '运动': ['sport','run','swim','gym','ball','game','match','win','lose','coach','team','practice','exercise','fitness','marathon','cycling','yoga','muscle','workout']
}

function detectScene(sentence, translation) {
  var text = (sentence || '') + ' ' + (translation || '')
  text = text.toLowerCase()
  var bestScene = '其他'
  var bestScore = 0
  for (var scene in SCENE_KEYWORDS) {
    var keywords = SCENE_KEYWORDS[scene]
    var score = 0
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) !== -1) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestScene = scene
    }
  }
  return bestScore > 0 ? bestScene : '其他'
}

// 删除语料
function removeCorpus(id) {
  try {
    var list = getCorpusList()
    var newList = []
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) {
        newList.push(list[i])
      }
    }
    wx.setStorageSync(KEYS.CORPUS, newList)
    return true
  } catch (e) {
    return false
  }
}

// 清空所有语料
function clearCorpus() {
  try {
    wx.setStorageSync(KEYS.CORPUS, [])
    return true
  } catch (e) {
    return false
  }
}

// ========== userId 持久化身份 ==========

// 获取持久化userId（退出登录也不删除）
function getUserId() {
  try {
    var id = wx.getStorageSync(KEYS.USER_ID)
    if (!id) {
      // 首次使用，生成唯一ID
      id = 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
      wx.setStorageSync(KEYS.USER_ID, id)
    }
    return id
  } catch (e) {
    return 'u_' + Date.now()
  }
}

// 是否已有userId（用于判断是否是老用户回来）
function hasUserId() {
  try {
    return !!wx.getStorageSync(KEYS.USER_ID)
  } catch (e) {
    return false
  }
}

// ========== 登录用户管理 ==========

// 保存登录信息
function saveLoginUser(userInfo) {
  try {
    // 自动附加userId（从持久化读取，确保不变）
    if (!userInfo.userId) {
      userInfo.userId = getUserId()
    }
    // 同时保存到主key和备份key
    wx.setStorageSync(KEYS.LOGIN, userInfo)
    wx.setStorageSync(KEYS.LOGIN + '_backup', userInfo)
    // 关键：把 userId 固化到 persistent_user_id（防止清缓存后丢失）
    wx.setStorageSync(KEYS.USER_ID, userInfo.userId)
    return true
  } catch (e) {
    return false
  }
}

// 获取登录信息（带备份恢复）
function getLoginUser() {
  try {
    var user = wx.getStorageSync(KEYS.LOGIN)
    if (user) return user
    // 主key失败，尝试读备份
    user = wx.getStorageSync(KEYS.LOGIN + '_backup')
    if (user) {
      // 恢复备份到主key
      wx.setStorageSync(KEYS.LOGIN, user)
    }
    return user || null
  } catch (e) {
    return null
  }
}

// 是否已登录
function isLoggedIn() {
  return getLoginUser() !== null
}

// 退出登录（保留userId和经验值，只清空登录状态）
function logout() {
  try {
    wx.removeStorageSync(KEYS.LOGIN)
    wx.removeStorageSync(KEYS.LOGIN + '_backup')
    // 清除内存中的用户信息
    try {
      var app = getApp()
      if (app) app.globalData.userInfo = null
    } catch (e) {}
    return true
  } catch (e) {
    return false
  }
}

// 更新用户资料（改昵称/头像等）
function updateLoginUser(updates) {
  try {
    var user = getLoginUser()
    if (!user) return false
    for (var key in updates) {
      user[key] = updates[key]
    }
    wx.setStorageSync(KEYS.LOGIN, user)
    wx.setStorageSync(KEYS.LOGIN + '_backup', user)
    // 同步更新内存
    try {
      var app = getApp()
      if (app) app.globalData.userInfo = user
    } catch (e) {}
    return true
  } catch (e) {
    return false
  }
}

// ========== 经验值管理 ==========

// 获取用户经验值
function getExp() {
  try {
    return wx.getStorageSync(KEYS.EXP) || 0
  } catch (e) {
    return 0
  }
}

// 增加经验值
function addExp(amount) {
  try {
    var currentExp = getExp()
    var newExp = currentExp + amount
    wx.setStorageSync(KEYS.EXP, newExp)
    return newExp
  } catch (e) {
    return getExp()
  }
}

// 设置经验值
function setExp(exp) {
  try {
    wx.setStorageSync(KEYS.EXP, exp)
    return true
  } catch (e) {
    return false
  }
}

// ========== 做题记录管理 ==========

// 做题分类配置（fullScore = 该题型满分）
var PRACTICE_CONFIG = {
  highSchool: {
    name: '高考英语',
    icon: '📝',
    types: [
      { key: 'listen', name: '听力', fullScore: 30 },
      { key: 'read', name: '阅读理解', fullScore: 37.5 },
      { key: 'seven', name: '七选五', fullScore: 12.5 },
      { key: 'cloze', name: '完形填空', fullScore: 15 },
      { key: 'grammar', name: '语法填空', fullScore: 15 },
      { key: 'writing', name: '书面表达', fullScore: 40 }
    ]
  },
  cet46: {
    name: '英语四六级',
    icon: '🎓',
    types: [
      { key: 'writing', name: '写作', fullScore: 106.5 },
      { key: 'listen', name: '听力', fullScore: 248.5 },
      { key: 'read', name: '阅读理解', fullScore: 248.5 },
      { key: 'translate', name: '翻译', fullScore: 106.5 }
    ]
  },
  fujianMiddleSchool: {
    name: '福建中考英语',
    icon: '🏫',
    types: [
      { key: 'listen', name: '听力理解', fullScore: 30 },
      { key: 'choice', name: '单项选择', fullScore: 15 },
      { key: 'cloze', name: '完形填空', fullScore: 15 },
      { key: 'read', name: '阅读理解', fullScore: 45 },
      { key: 'communication', name: '情景交际', fullScore: 10 },
      { key: 'pictureWriting', name: '看图写话', fullScore: 10 },
      { key: 'passageFill', name: '短文填空', fullScore: 10 },
      { key: 'writing', name: '书面表达', fullScore: 15 }
    ]
  },
  ielts: {
    name: '雅思',
    icon: '🌍',
    types: [
      { key: 'listen', name: '听力', fullScore: 9 },
      { key: 'read', name: '阅读', fullScore: 9 },
      { key: 'writing', name: '写作', fullScore: 9 },
      { key: 'speaking', name: '口语', fullScore: 9 }
    ]
  }
}

// 获取做题分类配置
function getPracticeConfig() {
  return PRACTICE_CONFIG
}

// 获取所有做题记录
function getPracticeRecords() {
  try {
    return wx.getStorageSync(KEYS.PRACTICE) || []
  } catch (e) {
    return []
  }
}

// 添加做题记录
// record: { category, date, duration(分钟), types: [{key, name, score, fullScore}], note }
function addPracticeRecord(record) {
  try {
    var list = getPracticeRecords()
    record.id = 'p_' + Date.now()
    record.date = record.date || new Date().toISOString()
    record.createdAt = Date.now()

    // 计算得分率
    var totalScored = 0
    var totalFull = 0
    for (var i = 0; i < record.types.length; i++) {
      totalScored += record.types[i].score || 0
      totalFull += record.types[i].fullScore || 0
    }
    record.totalScored = Math.round(totalScored * 10) / 10
    record.totalFull = totalFull
    record.accuracy = totalFull > 0 ? Math.round(totalScored / totalFull * 100) : 0

    list.unshift(record)
    wx.setStorageSync(KEYS.PRACTICE, list)
    return record
  } catch (e) {
    return null
  }
}

// 删除做题记录
function deletePracticeRecord(id) {
  try {
    var list = getPracticeRecords()
    var newList = []
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) {
        newList.push(list[i])
      }
    }
    wx.setStorageSync(KEYS.PRACTICE, newList)
    return true
  } catch (e) {
    return false
  }
}

// 计算最近N次的平均正确率
function getRecentPracticeAvg(category, count) {
  count = count || 5
  try {
    var list = getPracticeRecords()
    var filtered = category ? list.filter(function (r) { return r.category === category }) : list
    var recent = filtered.slice(0, count)
    if (recent.length === 0) return null

    var totalAcc = 0
    for (var i = 0; i < recent.length; i++) {
      totalAcc += recent[i].accuracy || 0
    }
    return {
      count: recent.length,
      avgAccuracy: Math.round(totalAcc / recent.length)
    }
  } catch (e) {
    return null
  }
}

// ========== 番茄钟记录管理 ==========

// 获取番茄钟记录
function getPomodoroRecords() {
  try {
    return wx.getStorageSync(KEYS.POMODORO) || []
  } catch (e) {
    return []
  }
}

// 保存番茄钟记录
function savePomodoroRecords(records) {
  try {
    wx.setStorageSync(KEYS.POMODORO, records)
    return true
  } catch (e) {
    return false
  }
}

// 获取每日目标
function getPomodoroGoal() {
  try {
    return wx.getStorageSync(KEYS.POMODORO_GOAL) || 8
  } catch (e) {
    return 8
  }
}

// 保存每日目标
function savePomodoroGoal(goal) {
  try {
    wx.setStorageSync(KEYS.POMODORO_GOAL, goal)
    return true
  } catch (e) {
    return false
  }
}

module.exports = {
  getVocabList: getVocabList,
  addVocab: addVocab,
  removeVocab: removeVocab,
  clearVocab: clearVocab,
  getCorpusList: getCorpusList,
  addCorpus: addCorpus,
  removeCorpus: removeCorpus,
  clearCorpus: clearCorpus,
  getUserId: getUserId,
  hasUserId: hasUserId,
  saveLoginUser: saveLoginUser,
  getLoginUser: getLoginUser,
  isLoggedIn: isLoggedIn,
  logout: logout,
  updateLoginUser: updateLoginUser,
  getExp: getExp,
  addExp: addExp,
  setExp: setExp,
  getPracticeRecords: getPracticeRecords,
  addPracticeRecord: addPracticeRecord,
  deletePracticeRecord: deletePracticeRecord,
  getPracticeConfig: getPracticeConfig,
  getPomodoroRecords: getPomodoroRecords,
  savePomodoroRecords: savePomodoroRecords,
  getPomodoroGoal: getPomodoroGoal,
  savePomodoroGoal: savePomodoroGoal
}