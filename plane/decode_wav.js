/**
 * decode_wav.js —— 把 IMA ADPCM WAV 转码为浏览器可播放的 PCM WAV（16bit）。
 * 用法：node decode_wav.js <file1> <file2> ...   （原文件会先备份为 .adpcm.bak）
 */
'use strict';
var fs = require('fs');

// 标准 IMA ADPCM 步长表（89 项）
var stepTable = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 409, 451, 497, 548, 604, 665, 733, 808, 890, 981,
  1081, 1191, 1312, 1445, 1592, 1753, 1931, 2127, 2343, 2581, 2842, 3131, 3449,
  3800, 4186, 4612, 5083, 5600, 6168, 6795, 7488, 8249, 9089, 10014, 11033,
  12156, 13393, 14754, 16256, 17911, 19732, 21743, 23957, 26399, 29093, 32048,
  32767
];
var indexTable = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

function findChunk(buf, id) {
  var off = 12;
  while (off + 8 <= buf.length) {
    if (buf.toString('ascii', off, off + 4) === id) return off;
    var size = buf.readUInt32LE(off + 4);
    off += 8 + size + (size & 1);
  }
  return -1;
}

// 解码单个 block，返回 spb 个样本（第一个为 header 中的 predictor）
function decodeBlock(block, spb) {
  var predictor = block.readInt16LE(0);
  var index = block.readUInt8(2);
  var out = [predictor];
  var sample = predictor;
  var i = 4;
  while (out.length < spb && i < block.length) {
    var byte = block[i++];
    for (var n = 0; n < 2 && out.length < spb; n++) {
      var code = n === 0 ? (byte & 0x0F) : ((byte >> 4) & 0x0F);
      var step = stepTable[index];
      var diff = step >> 3;
      if (code & 4) diff += step;
      if (code & 2) diff += step >> 1;
      if (code & 1) diff += step >> 2;
      sample = (code & 8) ? predictor - diff : predictor + diff;
      if (sample > 32767) sample = 32767;
      if (sample < -32768) sample = -32768;
      predictor = sample;
      index += indexTable[code];
      if (index < 0) index = 0;
      if (index > 88) index = 88;
      out.push(sample);
    }
  }
  return out;
}

function writePcm(file, samples, channels, rate) {
  var dataSize = samples.length * 2;
  var buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (var i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  fs.writeFileSync(file, buf);
}

function decodeFile(file) {
  var b = fs.readFileSync(file);
  var fmtOff = findChunk(b, 'fmt ');
  var dataOff = findChunk(b, 'data');
  if (fmtOff < 0 || dataOff < 0) { console.log(file, '格式异常，跳过'); return; }
  var fmtSize = b.readUInt32LE(fmtOff + 4);
  var fmt = b.subarray(fmtOff + 8, fmtOff + 8 + fmtSize);
  var tag = fmt.readUInt16LE(0);
  var channels = fmt.readUInt16LE(2);
  var rate = fmt.readUInt32LE(4);
  var blockAlign = fmt.readUInt16LE(12);
  var extra = fmtSize > 16 ? fmt.readUInt16LE(16) : 0;
  var spb = extra >= 2 ? fmt.readUInt16LE(18) : 0;
  if (tag !== 0x11) { console.log(file, '非 IMA ADPCM（tag=' + tag.toString(16) + '），跳过'); return; }
  var data = b.subarray(dataOff + 8);
  var out = [];
  for (var off = 0; off + blockAlign <= data.length; off += blockAlign) {
    var samples = decodeBlock(data.subarray(off, off + blockAlign), spb);
    for (var j = 0; j < samples.length; j++) out.push(samples[j]);
  }
  fs.writeFileSync(file + '.adpcm.bak', b);   // 备份原始文件
  writePcm(file, out, channels, rate);
  console.log(file, '转码完成 -> PCM, 样本数', out.length, ', 时长', (out.length / rate).toFixed(2) + 's');
}

var files = process.argv.slice(2);
if (!files.length) { console.log('用法: node decode_wav.js <wav...>'); process.exit(1); }
files.forEach(decodeFile);
