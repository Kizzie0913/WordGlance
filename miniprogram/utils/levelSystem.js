// utils/levelSystem.js
// 等级头衔系统 - 潮酷抽象风格
// 注意：emoji 用 Unicode 编码，避免文件编码损坏

// 等级配置：经验值需求、头衔、颜文字头像
var LEVEL_CONFIG = [
  { level: 1,  expNeeded: 0,     title: "Noobslayer",       emoji: "\uD83D\uDC23", desc: "菜鸟杀手" },
  { level: 2,  expNeeded: 20,    title: "Word Sniffer",      emoji: "\uD83D\uDC3D", desc: "单词嗅探者" },
  { level: 3,  expNeeded: 50,    title: "Grammar Bandit",    emoji: "\uD83E\uDD39", desc: "语法强盗" },
  { level: 4,  expNeeded: 100,   title: "Fluffy Linguist",   emoji: "\uD83D\uDC4F", desc: "毛茸茸语言学家" },
  { level: 5,  expNeeded: 200,   title: "Slang Goblin",      emoji: "\uD83D\uDC7D", desc: "俚语哥布林" },
  { level: 6,  expNeeded: 350,   title: "Vocab Witch",       emoji: "\uD83E\uDDE4", desc: "词汇女巫" },
  { level: 7,  expNeeded: 500,   title: "Syntax Panda",      emoji: "\uD83D\uDC3C", desc: "语法熊猫" },
  { level: 8,  expNeeded: 700,   title: "Rogue Flirt",       emoji: "\uD83D\uDE0F", desc: "流氓调情者" },
  { level: 9,  expNeeded: 950,   title: "Mochi Mage",        emoji: "\uD83E\uDDE1", desc: "麻薯法师" },
  { level: 10, expNeeded: 1200,  title: "Dictionary Destroyer", emoji: "\uD83D\uDCA5", desc: "词典毁灭者" },
  { level: 11, expNeeded: 1500,  title: "Phonetic Phoenix",   emoji: "\uD83E\uDD89", desc: "音标凤凰" },
  { level: 12, expNeeded: 1900,  title: "Idiom Itachi",      emoji: "\uD83E\uDD9D", desc: "习语鼬" },
  { level: 13, expNeeded: 2400,  title: "Translation Tiger",   emoji: "\uD83D\uDC2F", desc: "翻译老虎" },
  { level: 14, expNeeded: 3000,  title: "Accent Alien",       emoji: "\uD83D\uDC7D", desc: "口音外星人" },
  { level: 15, expNeeded: 3700,  title: "Polyglot Panda",     emoji: "\uD83D\uDC3C", desc: "多语言熊猫" },
  { level: 16, expNeeded: 4500,  title: "Linguistic Narwhal", emoji: "\uD83E\uDD84", desc: "语言独角鲸" },
  { level: 17, expNeeded: 5500,  title: "Sentence Samurai",    emoji: "\u2694\uFE0F", desc: "句子武士" },
  { level: 18, expNeeded: 7000,  title: "Word Wizard",        emoji: "\uD83E\uDDE4", desc: "单词巫师" },
  { level: 19, expNeeded: 9000,  title: "Language Liger",      emoji: "\uD83E\uDD81", desc: "语言狮虎" },
  { level: 20, expNeeded: 12000, title: "Grammar God",        emoji: "\uD83D\uDC51", desc: "语法之神" }
]

// 随机颜文字头像库（用于用户头像，用 Unicode 编码避免乱码）
var EMOJI_AVATARS = [
  "\uD83D\uDE48", "\uD83D\uDC80", "\uD83D\uDC7B", "\uD83E\uDD80", "\uD83D\uDC7D",
  "\uD83E\uDD20", "\uD83E\uDDB8", "\uD83E\uDD13", "\uD83E\uDDEC", "\uD83E\uDDB4",
  "\uD83D\uDE48", "\uD83E\uDEE2", "\uD83E\uDDB6", "\uD83E\uDD2F", "\uD83E\uDD2C",
  "\uD83E\uDEE0", "\uD83D\uDC7E", "\uD83D\uDC32", "\uD83E\uDD84", "\uD83D\uDC09",
  "\uD83C\uDF5C", "\uD83C\uDF83", "\uD83C\uDF69", "\uD83E\uDDE1", "\uD83C\uDFE1",
  "\uD83C\uDFDE", "\uD83E\uDDEC", "\uD83E\uDD30", "\uD83D\uDC7B", "\uD83D\uDC3C",
  "\uD83D\uDC38", "\uD83D\uDC30", "\uD83D\uDC2F", "\uD83D\uDC35", "\uD83D\uDC28",
  "\uD83D\uDC27", "\uD83D\uDC08", "\uD83D\uDC11", "\uD83D\uDC2C", "\uD83D\uDC22",
  "\uD83D\uDC24", "\uD83D\uDE49", "\uD83D\uDC3B", "\uD83D\uDC14", "\uD83D\uDC37"
]

// 获取用户等级信息
function getLevelInfo(exp) {
  var currentLevel = LEVEL_CONFIG[0]
  var nextLevel = LEVEL_CONFIG[1]

  for (var i = LEVEL_CONFIG.length - 1; i >= 0; i--) {
    if (exp >= LEVEL_CONFIG[i].expNeeded) {
      currentLevel = LEVEL_CONFIG[i]
      nextLevel = LEVEL_CONFIG[i + 1] || null
      break
    }
  }

  // 计算当前等级进度
  var currentLevelExp = currentLevel.expNeeded
  var nextLevelExp = nextLevel ? nextLevel.expNeeded : currentLevelExp
  var expInCurrentLevel = exp - currentLevelExp
  var expNeededForNext = nextLevelExp - currentLevelExp
  var progress = nextLevel ? (expInCurrentLevel / expNeededForNext) * 100 : 100

  return {
    level: currentLevel.level,
    title: currentLevel.title,
    emoji: currentLevel.emoji,
    desc: currentLevel.desc,
    exp: exp,
    currentLevelExp: currentLevelExp,
    nextLevelExp: nextLevelExp,
    expInCurrentLevel: expInCurrentLevel,
    expNeededForNext: expNeededForNext,
    progress: Math.min(progress, 100),
    isMaxLevel: !nextLevel
  }
}

// 获取随机颜文字头像
function getRandomAvatar() {
  var index = Math.floor(Math.random() * EMOJI_AVATARS.length)
  return EMOJI_AVATARS[index]
}

// 根据经验值获取头衔
function getTitleByExp(exp) {
  var levelInfo = getLevelInfo(exp)
  return levelInfo.title
}

module.exports = {
  LEVEL_CONFIG: LEVEL_CONFIG,
  EMOJI_AVATARS: EMOJI_AVATARS,
  getLevelInfo: getLevelInfo,
  getRandomAvatar: getRandomAvatar,
  getTitleByExp: getTitleByExp
}
