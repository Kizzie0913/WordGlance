// patch_md5.js - 修复 photoTranslate.js 中的 MD5 函数
const fs = require('fs');
const path = 'C:\\Users\\Administrator\\Desktop\\识图跟读助手\\pages\\photoTranslate\\photoTranslate.js';

let content = fs.readFileSync(path, 'utf8');

// 方法：在文件开头添加正确的 md5hex 函数，然后修改 translateUnknown 使用它
// 但更简单：直接替换现有 MD5 函数

// 先找到现有 MD5 函数的位置
const md5Line = 'function md5(s) {';
const md5Start = content.indexOf(md5Line);
console.log('MD5函数开始位置:', md5Start);

if (md5Start < 0) {
  console.log('未找到 MD5 函数');
  process.exit(1);
}

// 找到函数结束位置（匹配大括号）
let brace = 0;
let inFunc = false;
let md5End = -1;
for (let i = md5Start; i < content.length; i++) {
  if (i === md5Start + md5Line.length - 1) inFunc = true;
  if (content[i] === '{' && inFunc) brace++;
  if (content[i] === '}' && inFunc) {
    brace--;
    if (brace === 0) {
      md5End = i;
      break;
    }
  }
}
console.log('MD5函数结束位置:', md5End);
console.log('MD5函数长度:', md5End - md5Start + 1);

// 正确的 MD5 函数（返回十六进制）
const correctMD5 = `function md5(s) {
  function md5cycle(x, k) {
    var a = x[0], b = x[1], c = x[2], d = x[3];
    a=ff(a,b,c,d,k[0],7,-680876936);d=ff(d,a,b,c,k[1],12,-389564586);c=ff(c,d,a,b,k[2],17,606105819);b=ff(b,c,d,a,k[3],22,-1044525330);
    a=ff(a,b,c,d,k[4],7,-176418897);d=ff(d,a,b,c,k[5],12,1200080426);c=ff(c,d,a,b,k[6],17,-1473231341);b=ff(b,c,d,a,k[7],22,-45705983);
    a=ff(a,b,c,d,k[8],7,1770035416);d=ff(d,a,b,c,k[9],12,-1958414417);c=ff(c,d,a,b,k[10],17,-42063);b=ff(b,c,d,a,k[11],22,-1990404162);
    a=ff(a,b,c,d,k[12],7,1804603682);d=ff(d,a,b,c,k[13],12,-40341101);c=ff(c,d,a,b,k[14],17,-1502002290);b=ff(b,c,d,a,k[15],22,1236535329);
    a=gg(a,b,c,d,k[1],5,-165796510);d=gg(d,a,b,c,k[6],9,-1069501632);c=gg(c,d,a,b,k[11],14,643717713);b=gg(b,c,d,a,k[0],20,-373897302);
    a=gg(a,b,c,d,k[5],5,-701558691);d=gg(d,a,b,c,k[10],9,38016083);c=gg(c,d,a,b,k[15],14,-660478335);b=gg(b,c,d,a,k[4],20,-405537848);
    a=gg(a,b,c,d,k[9],5,568446438);d=gg(d,a,b,c,k[14],9,-1019803690);c=gg(c,d,a,b,k[3],14,-187363961);b=gg(b,c,d,a,k[8],20,1163531501);
    a=gg(a,b,c,d,k[13],5,-1444681467);d=gg(d,a,b,c,k[2],9,-51403784);c=gg(c,d,a,b,k[7],14,1735328473);b=gg(b,c,d,a,k[12],20,-1926607734);
    a=hh(a,b,c,d,k[5],4,-378558);d=hh(d,a,b,c,k[8],11,-2022574463);c=hh(c,d,a,b,k[11],16,1839030562);b=hh(b,c,d,a,k[14],23,-35309556);
    a=hh(a,b,c,d,k[1],4,-1530992060);d=hh(d,a,b,c,k[4],11,1272893353);c=hh(c,d,a,b,k[7],16,-155497632);b=hh(b,c,d,a,k[10],23,-1094730640);
    a=hh(a,b,c,d,k[13],4,681279174);d=hh(d,a,b,c,k[0],11,-358537222);c=hh(c,d,a,b,k[3],16,-722521979);b=hh(b,c,d,a,k[6],23,76029189);
    a=hh(a,b,c,d,k[9],4,-640364487);d=hh(d,a,b,c,k[12],11,-421815835);c=hh(c,d,a,b,k[15],16,530742520);b=hh(b,c,d,a,k[2],23,-995338651);
    a=ii(a,b,c,d,k[0],6,-198630844);d=ii(d,a,b,c,k[7],10,1126891415);c=ii(c,d,a,b,k[14],15,-1416354905);b=ii(b,c,d,a,k[5],21,-57434055);
    a=ii(a,b,c,d,k[12],6,1700485571);d=ii(d,a,b,c,k[3],10,-1894986606);c=ii(c,d,a,b,k[10],15,-1051523);b=ii(b,c,d,a,k[1],21,-2054922799);
    a=ii(a,b,c,d,k[8],6,1873313359);d=ii(d,a,b,c,k[15],10,-30611744);c=ii(c,d,a,b,k[6],15,-1560198380);b=ii(b,c,d,a,k[13],21,1309151649);
    a=ii(a,b,c,d,k[4],6,-145523070);d=ii(d,a,b,c,k[11],10,-1120210379);c=ii(c,d,a,b,k[2],15,718787259);b=ii(b,c,d,a,k[9],21,-343485551);
    x[0]=add32(a,x[0]);x[1]=add32(b,x[1]);x[2]=add32(c,x[2]);x[3]=add32(d,x[3]);
  }
  function cmn(q,a,b,x,s,t){return add32(bitrol(add32(add32(a,q),add32(x,t)),b),s);}
  function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}
  function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}
  function md5blk(s){var md5blks=[],i;for(i=0;i<64;i+=4)md5blks[i>>2]=s.charCodeAt(i)+(s.charCodeAt(i+1)<<8)+(s.charCodeAt(i+2)<<16)+(s.charCodeAt(i+3)<<24);return md5blks;}
  function rstrmd5(s){var n=s.length,state=[1732584193,-271733879,-1732584194,271733878],i;for(i=64;i<=n;i+=64)md5cycle(state,md5blk(s.substring(i-64,i)));s=s.substring(i-64);var tail=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(i=0;i<s.length;i+=1)tail[i>>2]|=s.charCodeAt(i)<<((i%4)<<3);tail[i>>2]|=0x80<<((i%4)<<3);if(i>55){md5cycle(state,tail);for(i=0;i<16;i+=1)tail[i]=0;}tail[14]=n*8;md5cycle(state,tail);return state;}
  function hex(x){var hex_chr='0123456789abcdef',s='';for(var i=0;i<4;i+=1)for(var j=0;j<8;j+=2)s+=hex_chr.charAt((x[i]>>>(j*4+4))&0x0F)+hex_chr.charAt((x[i]>>>(j*4))&0x0F);return s;}
  function add32(a,b){return(a+b)&0xFFFFFFFF;}
  function bitrol(num,cnt){return(num<<cnt)|(num>>>(32-cnt));}
  return hex(rstrmd5(s));
}`;

// 替换 MD5 函数
content = content.substring(0, md5Start) + correctMD5 + content.substring(md5End + 1);
fs.writeFileSync(path, content, 'utf8');
console.log('✅ MD5 函数已替换为正确版本');

// 验证语法
try {
  require('vm').createScript(content);
  console.log('✅ JS 语法正确');
} catch(e) {
  console.log('❌ JS 语法错误:', e.message.substring(0, 150));
}
