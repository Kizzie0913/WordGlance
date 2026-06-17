// 给 photoTranslate.js 添加详细日志，追踪识别流程
const fs = require('fs');
const path = 'C:\\Users\\Administrator\\Desktop\\识图跟读助手\\pages\\photoTranslate\\photoTranslate.js';

let content = fs.readFileSync(path, 'utf8');

// 1. 在 recognizeImage 函数开头添加日志
const oldRecognize = `recognizeImage: function (imgPath) {
    var that = this
    that.setData({ debugInfo: (that.data.debugInfo || '') + '\\n[2] 开始识别图片...' })
    console.log('[识图] 开始识别图片:', imgPath);`;
const newRecognize = `recognizeImage: function (imgPath) {
    var that = this
    that.setData({ debugInfo: (that.data.debugInfo || '') + '\\n[2] 开始识别图片...' })
    console.log('[识图] 开始识别图片:', imgPath);
    console.log('[识图] 图片路径类型:', typeof imgPath, imgPath ? imgPath.substring(0, 50) : 'null');`;
if (content.includes(oldRecognize)) {
  content = content.replace(oldRecognize, newRecognize);
  console.log('✅ 已添加 recognizeImage 日志');
} else {
  console.log('⚠️  recognizeImage 日志已存在或格式不匹配');
}

// 2. 在 getBaiduToken 的 success 回调里添加日志（确认 token 获取成功）
const oldTokenOk = `if (res.data && res.data.access_token) {
          that.setData({ debugInfo: (that.data.debugInfo || '') + '\\n[1] token获取成功' })
          callback(res.data.access_token)`;
const newTokenOk = `if (res.data && res.data.access_token) {
          console.log('[识图] ✅ token获取成功，准备调用识别API');
          that.setData({ debugInfo: (that.data.debugInfo || '') + '\\n[1] token获取成功' })
          callback(res.data.access_token)`;
if (content.includes(oldTokenOk)) {
  content = content.replace(oldTokenOk, newTokenOk);
  console.log('✅ 已添加 token 成功日志');
}

// 3. 在识别API的 success 回调里添加日志
const oldRecognizeSuccess = `success: function (res) {
        console.log('[识图] 识别返回：', JSON.stringify(res.data))
        that.setData({ debugInfo: (that.data.debugInfo || '') + '\\n[3] 识别成功，结果:' + (res.data && res.data.result ? res.data.result.length : 0) + '个' })`;
const newRecognizeSuccess = `success: function (res) {
        console.log('[识图] 识别返回：', JSON.stringify(res.data))
        console.log('[识图] 识别返回状态码:', res.statusCode);
        if (res.data && res.data.result) {
          console.log('[识图] 识别到的关键词:', res.data.result.map(function(r){ return r.keyword; }));
        } else {
          console.log('[识图] 识别返回异常:', res.data);
        }
        that.setData({ debugInfo: (that.data.debugInfo || '') + '\\n[3] 识别成功，结果:' + (res.data && res.data.result ? res.data.result.length : 0) + '个' })`;
if (content.includes(oldRecognizeSuccess)) {
  content = content.replace(oldRecognizeSuccess, newRecognizeSuccess);
  console.log('✅ 已添加识别返回日志');
}

// 4. 在识别API的 fail 回调里添加日志
const oldFail = `fail: function (err) {
        console.log('[识图] 识别请求失败：', JSON.stringify(err))
        that.setData({ loading: false, debugInfo: (that.data.debugInfo || '') + '\\n识别失败:' + JSON.stringify(err) })
        wx.hideLoading()
        wx.showModal({ title: '识别失败', content: '无法连接百度AI识别服务，请检查网络', showCancel: false })
      }`;
const newFail = `fail: function (err) {
        console.log('[识图] ❌ 识别请求失败：', JSON.stringify(err))
        console.log('[识图] 失败详情:', err);
        that.setData({ loading: false, debugInfo: (that.data.debugInfo || '') + '\\n识别失败:' + JSON.stringify(err) })
        wx.hideLoading()
        wx.showModal({ title: '识别失败', content: '无法连接百度AI识别服务，请检查网络。错误:' + JSON.stringify(err), showCancel: false })
      }`;
if (content.includes(oldFail)) {
  content = content.replace(oldFail, newFail);
  console.log('✅ 已添加识别失败日志');
}

fs.writeFileSync(path, content, 'utf8');
console.log('✅ 日志添加完成，请重新编译测试');
