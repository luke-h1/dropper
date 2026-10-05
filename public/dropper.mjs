#!/usr/bin/env node

// cli/dropper.ts
import { execFileSync } from "node:child_process";
import { openAsBlob } from "node:fs";
import { parseArgs } from "node:util";

// node_modules/uqr/dist/index.mjs
var QrCodeDataType = /* @__PURE__ */ ((QrCodeDataType2) => {
  QrCodeDataType2[QrCodeDataType2["Border"] = -1] = "Border";
  QrCodeDataType2[QrCodeDataType2["Data"] = 0] = "Data";
  QrCodeDataType2[QrCodeDataType2["Function"] = 1] = "Function";
  QrCodeDataType2[QrCodeDataType2["Position"] = 2] = "Position";
  QrCodeDataType2[QrCodeDataType2["Timing"] = 3] = "Timing";
  QrCodeDataType2[QrCodeDataType2["Alignment"] = 4] = "Alignment";
  return QrCodeDataType2;
})(QrCodeDataType || {});
var LOW = [0, 1];
var MEDIUM = [1, 0];
var QUARTILE = [2, 3];
var HIGH = [3, 2];
var EccMap = {
  L: LOW,
  M: MEDIUM,
  Q: QUARTILE,
  H: HIGH
};
var NUMERIC_REGEX = /^\d*$/;
var ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;
var ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
var MIN_VERSION = 1;
var MAX_VERSION = 40;
var PENALTY_N1 = 3;
var PENALTY_N2 = 3;
var PENALTY_N3 = 40;
var PENALTY_N4 = 10;
var ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];
var NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

class QrCode {
  constructor(version, ecc, dataCodewords, msk) {
    this.version = version;
    this.ecc = ecc;
    if (version < MIN_VERSION || version > MAX_VERSION)
      throw new RangeError("Version value out of range");
    if (msk < -1 || msk > 7)
      throw new RangeError("Mask value out of range");
    this.size = version * 4 + 17;
    const row = Array.from({ length: this.size }).fill(false);
    for (let i = 0;i < this.size; i++) {
      this.modules.push(row.slice());
      this.types.push(row.map(() => 0));
    }
    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    if (msk === -1) {
      let minPenalty = 1e9;
      for (let i = 0;i < 8; i++) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          msk = i;
          minPenalty = penalty;
        }
        this.applyMask(i);
      }
    }
    this.mask = msk;
    this.applyMask(msk);
    this.drawFormatBits(msk);
  }
  size;
  mask;
  modules = [];
  types = [];
  getModule(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y][x];
  }
  drawFunctionPatterns() {
    for (let i = 0;i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0, QrCodeDataType.Timing);
      this.setFunctionModule(i, 6, i % 2 === 0, QrCodeDataType.Timing);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);
    const alignPatPos = this.getAlignmentPatternPositions();
    const numAlign = alignPatPos.length;
    for (let i = 0;i < numAlign; i++) {
      for (let j = 0;j < numAlign; j++) {
        if (!(i === 0 && j === 0 || i === 0 && j === numAlign - 1 || i === numAlign - 1 && j === 0))
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }
  drawFormatBits(mask) {
    const data = this.ecc[1] << 3 | mask;
    let rem = data;
    for (let i = 0;i < 10; i++)
      rem = rem << 1 ^ (rem >>> 9) * 1335;
    const bits = (data << 10 | rem) ^ 21522;
    for (let i = 0;i <= 5; i++)
      this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9;i < 15; i++)
      this.setFunctionModule(14 - i, 8, getBit(bits, i));
    for (let i = 0;i < 8; i++)
      this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8;i < 15; i++)
      this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true);
  }
  drawVersion() {
    if (this.version < 7)
      return;
    let rem = this.version;
    for (let i = 0;i < 12; i++)
      rem = rem << 1 ^ (rem >>> 11) * 7973;
    const bits = this.version << 12 | rem;
    for (let i = 0;i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + i % 3;
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }
  drawFinderPattern(x, y) {
    for (let dy = -4;dy <= 4; dy++) {
      for (let dx = -4;dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4, QrCodeDataType.Position);
      }
    }
  }
  drawAlignmentPattern(x, y) {
    for (let dy = -2;dy <= 2; dy++) {
      for (let dx = -2;dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, QrCodeDataType.Alignment);
      }
    }
  }
  setFunctionModule(x, y, isDark, type = QrCodeDataType.Function) {
    this.modules[y][x] = isDark;
    this.types[y][x] = type;
  }
  addEccAndInterleave(data) {
    const ver = this.version;
    const ecl = this.ecc;
    if (data.length !== getNumDataCodewords(ver, ecl))
      throw new RangeError("Invalid argument");
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl[0]][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl[0]][ver];
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const blocks = [];
    const rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0;i < numBlocks; i++) {
      const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks)
        dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const result = [];
    for (let i = 0;i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
          result.push(block[i]);
      });
    }
    return result;
  }
  drawCodewords(data) {
    if (data.length !== Math.floor(getNumRawDataModules(this.version) / 8))
      throw new RangeError("Invalid argument");
    let i = 0;
    for (let right = this.size - 1;right >= 1; right -= 2) {
      if (right === 6)
        right = 5;
      for (let vert = 0;vert < this.size; vert++) {
        for (let j = 0;j < 2; j++) {
          const x = right - j;
          const upward = (right + 1 & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.types[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }
  applyMask(mask) {
    if (mask < 0 || mask > 7)
      throw new RangeError("Mask value out of range");
    for (let y = 0;y < this.size; y++) {
      for (let x = 0;x < this.size; x++) {
        let invert;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = x * y % 2 + x * y % 3 === 0;
            break;
          case 6:
            invert = (x * y % 2 + x * y % 3) % 2 === 0;
            break;
          case 7:
            invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
            break;
          default:
            throw new Error("Unreachable");
        }
        if (!this.types[y][x] && invert)
          this.modules[y][x] = !this.modules[y][x];
      }
    }
  }
  getPenaltyScore() {
    let result = 0;
    for (let y = 0;y < this.size; y++) {
      let runColor = false;
      let runX = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0;x < this.size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5)
            result += PENALTY_N1;
          else if (runX > 5)
            result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
    }
    for (let x = 0;x < this.size; x++) {
      let runColor = false;
      let runY = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0;y < this.size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5)
            result += PENALTY_N1;
          else if (runY > 5)
            result++;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
    }
    for (let y = 0;y < this.size - 1; y++) {
      for (let x = 0;x < this.size - 1; x++) {
        const color = this.modules[y][x];
        if (color === this.modules[y][x + 1] && color === this.modules[y + 1][x] && color === this.modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }
    let dark = 0;
    for (const row of this.modules)
      dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
    const total = this.size * this.size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }
  getAlignmentPatternPositions() {
    if (this.version === 1) {
      return [];
    } else {
      const numAlign = Math.floor(this.version / 7) + 2;
      const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
      const result = [6];
      for (let pos = this.size - 7;result.length < numAlign; pos -= step)
        result.splice(1, 0, pos);
      return result;
    }
  }
  finderPenaltyCountPatterns(runHistory) {
    const n = runHistory[1];
    const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
  }
  finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += this.size;
    this.finderPenaltyAddHistory(currentRunLength, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }
  finderPenaltyAddHistory(currentRunLength, runHistory) {
    if (runHistory[0] === 0)
      currentRunLength += this.size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }
}
function appendBits(val, len, bb) {
  if (len < 0 || len > 31 || val >>> len !== 0)
    throw new RangeError("Value out of range");
  for (let i = len - 1;i >= 0; i--)
    bb.push(val >>> i & 1);
}
function getBit(x, i) {
  return (x >>> i & 1) !== 0;
}

class QrSegment {
  constructor(mode, numChars, bitData) {
    this.mode = mode;
    this.numChars = numChars;
    this.bitData = bitData;
    if (numChars < 0)
      throw new RangeError("Invalid argument");
    this.bitData = bitData.slice();
  }
  getData() {
    return this.bitData.slice();
  }
}
var MODE_NUMERIC = [1, 10, 12, 14];
var MODE_ALPHANUMERIC = [2, 9, 11, 13];
var MODE_BYTE = [4, 8, 16, 16];
function numCharCountBits(mode, ver) {
  return mode[Math.floor((ver + 7) / 17) + 1];
}
function makeBytes(data) {
  const bb = [];
  for (const b of data)
    appendBits(b, 8, bb);
  return new QrSegment(MODE_BYTE, data.length, bb);
}
function makeNumeric(digits) {
  if (!isNumeric(digits))
    throw new RangeError("String contains non-numeric characters");
  const bb = [];
  for (let i = 0;i < digits.length; ) {
    const n = Math.min(digits.length - i, 3);
    appendBits(Number.parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
    i += n;
  }
  return new QrSegment(MODE_NUMERIC, digits.length, bb);
}
function makeAlphanumeric(text) {
  if (!isAlphanumeric(text))
    throw new RangeError("String contains unencodable characters in alphanumeric mode");
  const bb = [];
  let i;
  for (i = 0;i + 2 <= text.length; i += 2) {
    let temp = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
    temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
    appendBits(temp, 11, bb);
  }
  if (i < text.length)
    appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
  return new QrSegment(MODE_ALPHANUMERIC, text.length, bb);
}
function makeSegments(text) {
  if (text === "")
    return [];
  else if (isNumeric(text))
    return [makeNumeric(text)];
  else if (isAlphanumeric(text))
    return [makeAlphanumeric(text)];
  else
    return [makeBytes(toUtf8ByteArray(text))];
}
function isNumeric(text) {
  return NUMERIC_REGEX.test(text);
}
function isAlphanumeric(text) {
  return ALPHANUMERIC_REGEX.test(text);
}
function getTotalBits(segs, version) {
  let result = 0;
  for (const seg of segs) {
    const ccbits = numCharCountBits(seg.mode, version);
    if (seg.numChars >= 1 << ccbits)
      return Number.POSITIVE_INFINITY;
    result += 4 + ccbits + seg.bitData.length;
  }
  return result;
}
function toUtf8ByteArray(str) {
  str = encodeURI(str);
  const result = [];
  for (let i = 0;i < str.length; i++) {
    if (str.charAt(i) !== "%") {
      result.push(str.charCodeAt(i));
    } else {
      result.push(Number.parseInt(str.substring(i + 1, i + 3), 16));
      i += 2;
    }
  }
  return result;
}
function getNumRawDataModules(ver) {
  if (ver < MIN_VERSION || ver > MAX_VERSION)
    throw new RangeError("Version number out of range");
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7)
      result -= 36;
  }
  return result;
}
function getNumDataCodewords(ver, ecl) {
  return Math.floor(getNumRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl[0]][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl[0]][ver];
}
function reedSolomonComputeDivisor(degree) {
  if (degree < 1 || degree > 255)
    throw new RangeError("Degree out of range");
  const result = [];
  for (let i = 0;i < degree - 1; i++)
    result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0;i < degree; i++) {
    for (let j = 0;j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length)
        result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 2);
  }
  return result;
}
function reedSolomonComputeRemainder(data, divisor) {
  const result = divisor.map((_) => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => result[i] ^= reedSolomonMultiply(coef, factor));
  }
  return result;
}
function reedSolomonMultiply(x, y) {
  if (x >>> 8 !== 0 || y >>> 8 !== 0)
    throw new RangeError("Byte out of range");
  let z = 0;
  for (let i = 7;i >= 0; i--) {
    z = z << 1 ^ (z >>> 7) * 285;
    z ^= (y >>> i & 1) * x;
  }
  return z;
}
function encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
  if (!(MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= MAX_VERSION) || mask < -1 || mask > 7) {
    throw new RangeError("Invalid value");
  }
  let version;
  let dataUsedBits;
  for (version = minVersion;; version++) {
    const dataCapacityBits2 = getNumDataCodewords(version, ecl) * 8;
    const usedBits = getTotalBits(segs, version);
    if (usedBits <= dataCapacityBits2) {
      dataUsedBits = usedBits;
      break;
    }
    if (version >= maxVersion)
      throw new RangeError("Data too long");
  }
  for (const newEcl of [MEDIUM, QUARTILE, HIGH]) {
    if (boostEcl && dataUsedBits <= getNumDataCodewords(version, newEcl) * 8)
      ecl = newEcl;
  }
  const bb = [];
  for (const seg of segs) {
    appendBits(seg.mode[0], 4, bb);
    appendBits(seg.numChars, numCharCountBits(seg.mode, version), bb);
    for (const b of seg.getData())
      bb.push(b);
  }
  const dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
  appendBits(0, (8 - bb.length % 8) % 8, bb);
  for (let padByte = 236;bb.length < dataCapacityBits; padByte ^= 236 ^ 17)
    appendBits(padByte, 8, bb);
  const dataCodewords = Array.from({ length: Math.ceil(bb.length / 8) }, () => 0);
  bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << 7 - (i & 7));
  return new QrCode(version, ecl, dataCodewords, mask);
}
function encode(data, options) {
  const {
    ecc = "L",
    boostEcc = false,
    minVersion = 1,
    maxVersion = 40,
    maskPattern = -1,
    border = 1
  } = options || {};
  const segment = typeof data === "string" ? makeSegments(data) : Array.isArray(data) ? [makeBytes(data)] : undefined;
  if (!segment)
    throw new Error(`uqr only supports encoding string and binary data, but got: ${typeof data}`);
  const qr = encodeSegments(segment, EccMap[ecc], minVersion, maxVersion, maskPattern, boostEcc);
  const result = addBorder({
    version: qr.version,
    maskPattern: qr.mask,
    size: qr.size,
    data: qr.modules,
    types: qr.types
  }, border);
  if (options?.invert)
    result.data = result.data.map((row) => row.map((mod) => !mod));
  options?.onEncoded?.(result);
  return result;
}
function addBorder(input, border = 1) {
  if (!border)
    return input;
  const { size } = input;
  const newSize = size + border * 2;
  input.size = newSize;
  input.data.forEach((row) => {
    for (let i = 0;i < border; i++) {
      row.unshift(false);
      row.push(false);
    }
  });
  for (let i = 0;i < border; i++) {
    input.data.unshift(Array.from({ length: newSize }, (_) => false));
    input.data.push(Array.from({ length: newSize }, (_) => false));
  }
  const b = QrCodeDataType.Border;
  input.types.forEach((row) => {
    for (let i = 0;i < border; i++) {
      row.unshift(b);
      row.push(b);
    }
  });
  for (let i = 0;i < border; i++) {
    input.types.unshift(Array.from({ length: newSize }, (_) => b));
    input.types.push(Array.from({ length: newSize }, (_) => b));
  }
  return input;
}
function getDataAt(data, x, y, defaults = false) {
  if (x < 0 || y < 0 || x >= data.length || y >= data.length)
    return defaults;
  return data[y][x];
}
function renderUnicodeCompact(data, options = {}) {
  const palette = {
    WHITE_ALL: "█",
    WHITE_BLACK: "▀",
    BLACK_WHITE: "▄",
    BLACK_ALL: " "
  };
  const result = encode(data, options);
  const WHITE = false;
  const BLACK = true;
  const at = (x, y) => getDataAt(result.data, x, y, true);
  const lines = [];
  let line = "";
  for (let row = 0;row < result.size; row += 2) {
    for (let col = 0;col < result.size; col++) {
      if (at(col, row) === WHITE && at(col, row + 1) === WHITE)
        line += palette.WHITE_ALL;
      else if (at(col, row) === WHITE && at(col, row + 1) === BLACK)
        line += palette.WHITE_BLACK;
      else if (at(col, row) === BLACK && at(col, row + 1) === WHITE)
        line += palette.BLACK_WHITE;
      else
        line += palette.BLACK_ALL;
    }
    lines.push(line);
    line = "";
  }
  return lines.join(`
`);
}

// src/lib/format.ts
function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

// cli/inspect.ts
import { basename, extname } from "node:path";

// cli/android.ts
var RES_STRING_POOL_TYPE = 1;
var RES_TABLE_TYPE = 2;
var RES_XML_TYPE = 3;
var RES_XML_START_ELEMENT_TYPE = 258;
var RES_XML_RESOURCE_MAP_TYPE = 384;
var RES_TABLE_PACKAGE_TYPE = 512;
var RES_TABLE_TYPE_TYPE = 513;
var TYPE_REFERENCE = 1;
var TYPE_STRING = 3;
var TYPE_INT_DEC = 16;
var TYPE_INT_HEX = 17;
var TYPE_INT_BOOLEAN = 18;
var NO_ENTRY = 4294967295;
var ANDROID_ATTRS = {
  16842753: "label",
  16843291: "versionCode",
  16843292: "versionName"
};
function readStringPool(buf, start) {
  const headerSize = buf.readUInt16LE(start + 2);
  const count = buf.readUInt32LE(start + 8);
  const utf8 = (buf.readUInt32LE(start + 16) & 1 << 8) !== 0;
  const stringsStart = start + buf.readUInt32LE(start + 20);
  const strings = [];
  for (let i = 0;i < count; i++) {
    let p = stringsStart + buf.readUInt32LE(start + headerSize + i * 4);
    if (utf8) {
      p += buf[p] & 128 ? 2 : 1;
      let length = buf[p];
      if (length & 128) {
        length = (length & 127) << 8 | buf[p + 1];
        p += 2;
      } else {
        p += 1;
      }
      strings.push(buf.toString("utf8", p, p + length));
    } else {
      let length = buf.readUInt16LE(p);
      if (length & 32768) {
        length = (length & 32767) << 16 | buf.readUInt16LE(p + 2);
        p += 4;
      } else {
        p += 2;
      }
      strings.push(buf.toString("utf16le", p, p + length * 2));
    }
  }
  return strings;
}
function typedValue(dataType, data, strings) {
  switch (dataType) {
    case TYPE_STRING:
      return strings[data];
    case TYPE_REFERENCE:
      return { ref: data };
    case TYPE_INT_DEC:
    case TYPE_INT_HEX:
      return data | 0;
    case TYPE_INT_BOOLEAN:
      return data !== 0;
    default:
      return;
  }
}
function parseManifest(buf) {
  if (buf.readUInt16LE(0) !== RES_XML_TYPE)
    throw new Error("Not a binary Android XML file");
  let strings = [];
  let resourceMap = [];
  const info = {};
  for (let p = buf.readUInt16LE(2);p < buf.length; ) {
    const type = buf.readUInt16LE(p);
    const size = buf.readUInt32LE(p + 4);
    if (type === RES_STRING_POOL_TYPE) {
      strings = readStringPool(buf, p);
    } else if (type === RES_XML_RESOURCE_MAP_TYPE) {
      const headerSize = buf.readUInt16LE(p + 2);
      resourceMap = [];
      for (let q = p + headerSize;q < p + size; q += 4)
        resourceMap.push(buf.readUInt32LE(q));
    } else if (type === RES_XML_START_ELEMENT_TYPE) {
      const ext = p + buf.readUInt16LE(p + 2);
      const element = strings[buf.readUInt32LE(ext + 4)];
      if (element === "manifest" || element === "application") {
        const attrStart = ext + buf.readUInt16LE(ext + 8);
        const attrSize = buf.readUInt16LE(ext + 10);
        const attrCount = buf.readUInt16LE(ext + 12);
        for (let i = 0;i < attrCount; i++) {
          const a = attrStart + i * attrSize;
          const nameIndex = buf.readUInt32LE(a + 4);
          const name = ANDROID_ATTRS[resourceMap[nameIndex] ?? -1] ?? strings[nameIndex];
          const raw = buf.readUInt32LE(a + 8);
          const value = raw !== NO_ENTRY ? strings[raw] : typedValue(buf[a + 15], buf.readUInt32LE(a + 16), strings);
          if (element === "manifest" && name === "package" && typeof value === "string") {
            info.package = value;
          } else if (element === "manifest" && (name === "versionCode" || name === "versionName")) {
            info[name] = value;
          } else if (element === "application" && name === "label") {
            info.label = value;
          }
        }
        if (element === "application")
          break;
      }
    }
    if (size === 0)
      break;
    p += size;
  }
  return info;
}

class ResourceTable {
  buf;
  strings = [];
  types = new Map;
  constructor(buf) {
    this.buf = buf;
    if (buf.readUInt16LE(0) !== RES_TABLE_TYPE)
      throw new Error("Not a resources.arsc file");
    for (let p = buf.readUInt16LE(2);p < buf.length; ) {
      const type = buf.readUInt16LE(p);
      const size = buf.readUInt32LE(p + 4);
      if (type === RES_STRING_POOL_TYPE)
        this.strings = readStringPool(buf, p);
      else if (type === RES_TABLE_PACKAGE_TYPE)
        this.readPackage(p, size);
      if (size === 0)
        break;
      p += size;
    }
  }
  readPackage(start, size) {
    const buf = this.buf;
    const packageId = buf.readUInt32LE(start + 8);
    for (let p = start + buf.readUInt16LE(start + 2);p < start + size; ) {
      const type = buf.readUInt16LE(p);
      const chunkSize = buf.readUInt32LE(p + 4);
      if (type === RES_TABLE_TYPE_TYPE) {
        const typeId = buf[p + 8];
        const configStart = p + 20;
        const configSize = buf.readUInt32LE(configStart);
        const isDefaultConfig = buf.subarray(configStart + 4, configStart + configSize).every((b) => b === 0);
        const key = `${packageId}:${typeId}`;
        const list = this.types.get(key) ?? [];
        if (isDefaultConfig)
          list.unshift({ isDefaultConfig, buf, start: p });
        else
          list.push({ isDefaultConfig, buf, start: p });
        this.types.set(key, list);
      }
      if (chunkSize === 0)
        break;
      p += chunkSize;
    }
  }
  resolve(value, depth = 0) {
    if (value === undefined || typeof value !== "object")
      return value;
    if (depth > 8)
      return;
    const id = value.ref;
    const packageId = id >>> 24;
    const typeId = id >>> 16 & 255;
    const entryId = id & 65535;
    for (const chunk of this.types.get(`${packageId}:${typeId}`) ?? []) {
      const resolved = this.readEntry(chunk, entryId);
      if (resolved !== undefined)
        return this.resolve(resolved, depth + 1);
    }
    return;
  }
  readEntry({ buf, start }, entryId) {
    const flags = buf[start + 9];
    const entryCount = buf.readUInt32LE(start + 12);
    const entriesStart = start + buf.readUInt32LE(start + 16);
    const offsets = start + buf.readUInt16LE(start + 2);
    let offset;
    if (flags & 1) {
      for (let i = 0;i < entryCount; i++) {
        if (buf.readUInt16LE(offsets + i * 4) === entryId) {
          offset = buf.readUInt16LE(offsets + i * 4 + 2) * 4;
          break;
        }
      }
    } else if (entryId < entryCount) {
      if (flags & 2) {
        const raw = buf.readUInt16LE(offsets + entryId * 2);
        offset = raw === 65535 ? undefined : raw * 4;
      } else {
        const raw = buf.readUInt32LE(offsets + entryId * 4);
        offset = raw === NO_ENTRY ? undefined : raw;
      }
    }
    if (offset === undefined)
      return;
    const entry = entriesStart + offset;
    const entryFlags = buf.readUInt16LE(entry + 2);
    if (entryFlags & 8) {
      return typedValue(entryFlags >> 8, buf.readUInt32LE(entry + 4), this.strings);
    }
    if (entryFlags & 1)
      return;
    const value = entry + buf.readUInt16LE(entry);
    return typedValue(buf[value + 3], buf.readUInt32LE(value + 4), this.strings);
  }
}

// cli/plist.ts
function parsePlist(buffer) {
  if (buffer.toString("ascii", 0, 8) === "bplist00")
    return parseBinaryPlist(buffer);
  return parseXmlPlist(buffer.toString("utf8"));
}
function parseBinaryPlist(buffer) {
  const trailer = buffer.subarray(buffer.length - 32);
  const offsetSize = trailer.readUInt8(6);
  const refSize = trailer.readUInt8(7);
  const objectCount = Number(trailer.readBigUInt64BE(8));
  const topObject = Number(trailer.readBigUInt64BE(16));
  const offsetTable = Number(trailer.readBigUInt64BE(24));
  const readUInt = (position, size) => {
    let value = 0;
    for (let i = 0;i < size; i++)
      value = value * 256 + buffer[position + i];
    return value;
  };
  const offsetOf = (ref) => {
    if (ref >= objectCount)
      throw new Error("Invalid binary plist reference");
    return readUInt(offsetTable + ref * offsetSize, offsetSize);
  };
  const parse = (ref, depth) => {
    if (depth > 64)
      throw new Error("Binary plist nested too deeply");
    const offset = offsetOf(ref);
    const marker = buffer[offset];
    const type = marker >> 4;
    const info = marker & 15;
    const lengthAndStart = () => {
      if (info !== 15)
        return [info, offset + 1];
      const intSize = 1 << (buffer[offset + 1] & 15);
      return [readUInt(offset + 2, intSize), offset + 2 + intSize];
    };
    switch (type) {
      case 0:
        if (info === 8)
          return false;
        if (info === 9)
          return true;
        return null;
      case 1: {
        const size = 1 << info;
        if (size === 8)
          return Number(buffer.readBigInt64BE(offset + 1));
        return readUInt(offset + 1, size);
      }
      case 2:
        return info === 2 ? buffer.readFloatBE(offset + 1) : buffer.readDoubleBE(offset + 1);
      case 3:
        return new Date(Date.UTC(2001, 0, 1) + buffer.readDoubleBE(offset + 1) * 1000);
      case 4: {
        const [length, start] = lengthAndStart();
        return Buffer.from(buffer.subarray(start, start + length));
      }
      case 5: {
        const [length, start] = lengthAndStart();
        return buffer.toString("latin1", start, start + length);
      }
      case 6: {
        const [length, start] = lengthAndStart();
        const utf16 = Buffer.from(buffer.subarray(start, start + length * 2));
        return utf16.swap16().toString("utf16le");
      }
      case 8:
        return readUInt(offset + 1, info + 1);
      case 10: {
        const [length, start] = lengthAndStart();
        return Array.from({ length }, (_, i) => parse(readUInt(start + i * refSize, refSize), depth + 1));
      }
      case 13: {
        const [length, start] = lengthAndStart();
        const result = {};
        for (let i = 0;i < length; i++) {
          const key = parse(readUInt(start + i * refSize, refSize), depth + 1);
          const value = parse(readUInt(start + (length + i) * refSize, refSize), depth + 1);
          result[String(key)] = value;
        }
        return result;
      }
      default:
        throw new Error(`Unsupported binary plist type 0x${type.toString(16)}`);
    }
  };
  return parse(topObject, 0);
}
var ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[entity] ?? match;
  });
}
function parseXmlPlist(xml) {
  const start = xml.indexOf("<plist");
  if (start === -1)
    throw new Error("Not a plist");
  const tokens = [...xml.slice(start).matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>|([^<]+)/g)].filter((m) => m[2] || m[4].trim() !== "");
  let i = 0;
  const textUntilClose = (tag) => {
    let text = "";
    while (i < tokens.length && !(tokens[i][1] === "/" && tokens[i][2] === tag)) {
      text += tokens[i][4] ?? "";
      i++;
    }
    i++;
    return decodeEntities(text.trim());
  };
  const parseValue = () => {
    const token = tokens[i++];
    if (!token || !token[2])
      throw new Error("Malformed XML plist");
    const tag = token[2];
    const selfClosing = token[3] === "/";
    switch (tag) {
      case "plist":
        return parseValue();
      case "dict": {
        const result = {};
        if (selfClosing)
          return result;
        while (!(tokens[i]?.[1] === "/" && tokens[i]?.[2] === "dict")) {
          if (tokens[i++]?.[2] !== "key")
            throw new Error("Expected <key> in XML plist");
          const key = textUntilClose("key");
          result[key] = parseValue();
        }
        i++;
        return result;
      }
      case "array": {
        const result = [];
        if (selfClosing)
          return result;
        while (!(tokens[i]?.[1] === "/" && tokens[i]?.[2] === "array"))
          result.push(parseValue());
        i++;
        return result;
      }
      case "true":
        return true;
      case "false":
        return false;
      case "string":
        return selfClosing ? "" : textUntilClose("string");
      case "integer":
      case "real":
        return Number(textUntilClose(tag));
      case "date":
        return new Date(textUntilClose("date"));
      case "data":
        return Buffer.from(textUntilClose("data").replace(/\s+/g, ""), "base64");
      default:
        throw new Error(`Unsupported XML plist tag <${tag}>`);
    }
  };
  return parseValue();
}

// cli/zip.ts
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
var MAX_UINT32 = 4294967295;

class ZipReader {
  fd;
  fileSize;
  entries;
  constructor(path) {
    this.fd = openSync(path, "r");
    this.fileSize = fstatSync(this.fd).size;
    try {
      this.entries = this.readCentralDirectory();
    } catch (error) {
      this.close();
      throw error;
    }
  }
  close() {
    closeSync(this.fd);
  }
  find(pattern) {
    return this.entries.find((entry) => pattern.test(entry.name));
  }
  read(entry) {
    const header = this.readAt(entry.offset, 30);
    if (header.readUInt32LE(0) !== 67324752)
      throw new Error(`Bad local header for ${entry.name}`);
    const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = this.readAt(start, entry.compressedSize);
    if (entry.method === 0)
      return data;
    if (entry.method === 8)
      return inflateRawSync(data);
    throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
  }
  readAt(position, length) {
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const n = readSync(this.fd, buffer, read, length - read, position + read);
      if (n === 0)
        throw new Error("Unexpected end of zip file");
      read += n;
    }
    return buffer;
  }
  readCentralDirectory() {
    const tailLength = Math.min(this.fileSize, 22 + 65535);
    const tailStart = this.fileSize - tailLength;
    const tail = this.readAt(tailStart, tailLength);
    let eocd = -1;
    for (let i = tail.length - 22;i >= 0; i--) {
      if (tail.readUInt32LE(i) === 101010256) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1)
      throw new Error("Not a zip file");
    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === MAX_UINT32 || cdSize === MAX_UINT32 || count === 65535) {
      const locator = eocd - 20;
      if (locator < 0 || tail.readUInt32LE(locator) !== 117853008) {
        throw new Error("Missing zip64 locator");
      }
      const zip64 = this.readAt(Number(tail.readBigUInt64LE(locator + 8)), 56);
      count = Number(zip64.readBigUInt64LE(32));
      cdSize = Number(zip64.readBigUInt64LE(40));
      cdOffset = Number(zip64.readBigUInt64LE(48));
    }
    const cd = this.readAt(cdOffset, cdSize);
    const entries = [];
    let p = 0;
    for (let i = 0;i < count; i++) {
      if (cd.readUInt32LE(p) !== 33639248)
        throw new Error("Bad central directory");
      const nameLength = cd.readUInt16LE(p + 28);
      const extraLength = cd.readUInt16LE(p + 30);
      const commentLength = cd.readUInt16LE(p + 32);
      const entry = {
        name: cd.toString("utf8", p + 46, p + 46 + nameLength),
        method: cd.readUInt16LE(p + 10),
        compressedSize: cd.readUInt32LE(p + 20),
        size: cd.readUInt32LE(p + 24),
        offset: cd.readUInt32LE(p + 42)
      };
      applyZip64Extra(entry, cd.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength));
      entries.push(entry);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }
}
function applyZip64Extra(entry, extra) {
  for (let p = 0;p + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(p);
    const length = extra.readUInt16LE(p + 2);
    if (id === 1) {
      let q = p + 4;
      const next = () => {
        const value = Number(extra.readBigUInt64LE(q));
        q += 8;
        return value;
      };
      if (entry.size === MAX_UINT32)
        entry.size = next();
      if (entry.compressedSize === MAX_UINT32)
        entry.compressedSize = next();
      if (entry.offset === MAX_UINT32)
        entry.offset = next();
      return;
    }
    p += 4 + length;
  }
}

// cli/inspect.ts
var asDict = (value) => value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !Buffer.isBuffer(value) ? value : {};
var asString = (value) => typeof value === "string" || typeof value === "number" ? String(value) : undefined;
function inspectBinary(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".aab")
    throw new Error("App bundles (.aab) can't be installed directly, build an APK instead");
  if (ext !== ".ipa" && ext !== ".apk")
    throw new Error(`Expected an .ipa or .apk file, got ${basename(path)}`);
  const zip = new ZipReader(path);
  try {
    return ext === ".ipa" ? inspectIpa(zip, path) : inspectApk(zip, path);
  } finally {
    zip.close();
  }
}
function inspectIpa(zip, path) {
  const infoEntry = zip.find(/^Payload\/[^/]+\.app\/Info\.plist$/);
  if (!infoEntry)
    throw new Error("No Payload/*.app/Info.plist found, is this an IPA?");
  const info = asDict(parsePlist(zip.read(infoEntry)));
  const bundleId = asString(info.CFBundleIdentifier);
  if (!bundleId)
    throw new Error("Info.plist has no CFBundleIdentifier");
  const appDir = infoEntry.name.slice(0, -"Info.plist".length);
  const profileEntry = zip.entries.find((e) => e.name === `${appDir}embedded.mobileprovision`);
  const profile = profileEntry ? readProvisioningProfile(zip.read(profileEntry)) : {};
  return {
    platform: "ios",
    fileName: basename(path),
    size: zip.fileSize,
    name: asString(info.CFBundleDisplayName) ?? asString(info.CFBundleName) ?? bundleId,
    bundleId,
    version: asString(info.CFBundleShortVersionString) ?? "0",
    buildNumber: asString(info.CFBundleVersion) ?? "0",
    ...profile
  };
}
function readProvisioningProfile(data) {
  const start = data.indexOf("<?xml");
  const end = data.indexOf("</plist>");
  if (start === -1 || end === -1)
    return {};
  const profile = asDict(parseXmlPlist(data.toString("utf8", start, end + "</plist>".length)));
  const entitlements = asDict(profile.Entitlements);
  let distribution = "app-store";
  if (profile.ProvisionsAllDevices === true)
    distribution = "enterprise";
  else if (Array.isArray(profile.ProvisionedDevices)) {
    distribution = entitlements["get-task-allow"] === true ? "development" : "ad-hoc";
  }
  const expires = profile.ExpirationDate;
  return {
    distribution,
    profileExpiresAt: expires instanceof Date ? expires.toISOString() : undefined
  };
}
function inspectApk(zip, path) {
  const manifestEntry = zip.find(/^AndroidManifest\.xml$/);
  if (!manifestEntry) {
    if (zip.find(/^base\/manifest\/AndroidManifest\.xml$/)) {
      throw new Error('This is an app bundle (.aab), set "buildType": "apk" in your EAS profile');
    }
    throw new Error("No AndroidManifest.xml found, is this an APK?");
  }
  const manifest = parseManifest(zip.read(manifestEntry));
  if (!manifest.package)
    throw new Error("AndroidManifest.xml has no package name");
  let label = asString(manifest.label);
  let versionName = asString(manifest.versionName);
  const needsResources = typeof manifest.label === "object" || typeof manifest.versionName === "object";
  const arsc = needsResources ? zip.find(/^resources\.arsc$/) : undefined;
  if (arsc) {
    const table = new ResourceTable(zip.read(arsc));
    label ??= asString(table.resolve(manifest.label));
    versionName ??= asString(table.resolve(manifest.versionName));
  }
  return {
    platform: "android",
    fileName: basename(path),
    size: zip.fileSize,
    name: label ?? manifest.package,
    bundleId: manifest.package,
    version: versionName ?? "0",
    buildNumber: asString(manifest.versionCode) ?? "0"
  };
}

// cli/dropper.ts
var HELP = `dropper - upload IPA/APK builds to your Dropper site

Usage:
  dropper upload <file.ipa|file.apk> [options]
  dropper list
  dropper delete <id>

Upload options:
  --profile <name>   EAS build profile, e.g. development
  --channel <name>   EAS Update channel
  --notes <text>     Release notes shown on the build page
  --name <name>      Override the app name read from the binary
  --no-git           Don't record the current git branch and commit
  --no-qr            Don't print a QR code after uploading

Environment:
  DROPPER_URL        Your Dropper site, e.g. https://dropper.example.com
  DROPPER_TOKEN      The UPLOAD_TOKEN configured on the site
`;
function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}
function config() {
  const url = process.env.DROPPER_URL?.replace(/\/+$/, "");
  const token = process.env.DROPPER_TOKEN;
  if (!url || !token)
    fail("DROPPER_URL and DROPPER_TOKEN must be set");
  return { url, token };
}
async function api(path, init = {}) {
  const { url, token } = config();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    fail(body.error ?? `${init.method ?? "GET"} ${path} failed with ${res.status}`);
  return body;
}
function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return;
  }
}
async function upload(file, options) {
  let info;
  try {
    info = inspectBinary(file);
  } catch (error) {
    fail(error.message);
  }
  const input = {
    ...info,
    name: options.name ?? info.name,
    profile: options.profile,
    channel: options.channel,
    notes: options.notes
  };
  if (options.git !== false) {
    input.gitBranch = git("rev-parse", "--abbrev-ref", "HEAD");
    input.gitCommit = git("rev-parse", "HEAD");
  }
  console.log(`${input.name} ${input.version} (${input.buildNumber}) · ${input.bundleId}`);
  if (input.distribution === "app-store") {
    console.warn('warning: this IPA is signed for App Store distribution and cannot be installed from Dropper. Use an EAS profile with "distribution": "internal".');
  }
  const { id, uploadUrl } = await api("/api/uploads", {
    method: "POST",
    body: JSON.stringify(input)
  });
  console.log(`Uploading ${formatBytes(input.size)}...`);
  const started = Date.now();
  const res = await fetch(uploadUrl, { method: "PUT", body: await openAsBlob(file) });
  if (!res.ok)
    fail(`Upload to storage failed with ${res.status}: ${await res.text()}`);
  const seconds = (Date.now() - started) / 1000;
  console.log(`Uploaded in ${seconds.toFixed(1)}s`);
  const { url } = await api(`/api/uploads/${id}/complete`, { method: "POST" });
  console.log(`
${url}
`);
  if (options.qr !== false)
    console.log(renderUnicodeCompact(url));
}
async function list() {
  const { builds } = await api("/api/builds");
  for (const b of builds) {
    const platform = b.platform === "ios" ? "iOS    " : "Android";
    console.log(`${b.id}  ${platform}  ${b.name} ${b.version} (${b.buildNumber})  ${b.profile ?? ""}  ${b.uploadedAt}`);
  }
  if (builds.length === 0)
    console.log("No builds yet");
}
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      profile: { type: "string" },
      channel: { type: "string" },
      notes: { type: "string" },
      name: { type: "string" },
      git: { type: "boolean" },
      qr: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });
  const [command, arg] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  switch (command) {
    case "upload":
      if (!arg)
        fail("Usage: dropper upload <file.ipa|file.apk>");
      return upload(arg, values);
    case "list":
      return list();
    case "delete":
      if (!arg)
        fail("Usage: dropper delete <id>");
      await api(`/api/builds/${encodeURIComponent(arg)}`, { method: "DELETE" });
      console.log(`Deleted ${arg}`);
      return;
    default:
      fail(`Unknown command ${command}

${HELP}`);
  }
}
await main();
