

goog.provide('Algorithm.FID');

/**
 * @param {(Array.<number>|Uint8Array)} bwt
 * @constructor
 */
Algorithm.FID = function(bwt) {
  /** @type {Array.<number>|Uint8Array} */
  this.input = bwt;
  /** @type {Array.<number>|Uint32Array} */
  this.largeBlocks;
  /** @type {Array.<number>|Uint8Array} */
  this.smallBlocks;
  /** @type {number} */
  this.largeBlockSize = 256;
  /** @type {number} */
  this.smallBlockSize = 32;
};

Algorithm.FID.prototype.build = function() {
  /** @type {Array.<number>|Uint8Array} */
  var input = this.input;
  /** @type {Array.<number>|Uint8Array} */
  var largeBlocks = this.largeBlocks = new (
    USE_TYPEDARRAY ? Uint32Array : Array
    )((input.length * 8 / this.largeBlockSize | 0) + 1);
  /** @type {(Array.<number>|Uint8Array|Uint32Array)} */
  var smallBlocks = this.smallBlocks = new (
    USE_TYPEDARRAY ?
      this.largeBlockSize <= 256 ?
                      Uint8Array : Uint32Array :
      Array
    )((input.length * 8 / this.smallBlockSize | 0) + 1);
  /** @type {number} */
  var count = 0;
  /** @type {number} */
  var popCount;
  /** @type {number} */
  var reset = this.largeBlockSize / this.smallBlockSize;
  /** @type {number} */
  var i;
  /** @type {number} */
  var il;
  /** @type {number} */
  var j;

  for (i = 0, il = smallBlocks.length - 1, j = 1; i < il; ++i) {
    popCount = Algorithm.FID.popCount32_(
      (input[i * 4    ] << 24) +
      (input[i * 4 + 1] << 16) +
      (input[i * 4 + 2] <<  8) +
      (input[i * 4 + 3]      )
    );

    largeBlocks[j] += popCount;
    smallBlocks[i + 1] = count += popCount;

    if ((i + 1) % reset === 0) {
      largeBlocks[j + 1] = largeBlocks[j];
      ++j;
      smallBlocks[i + 1] = count = 0;
    }
  }
};

/**
 * @param {number} index
 * @param {number} bit
 * @return {number}
 */
Algorithm.FID.prototype.rank = function(index, bit) {
  /** @type {Array.<number>|Uint8Array} */
  var input = this.input;
  /** @type {number} */
  var lbIndex = index / this.largeBlockSize | 0;
  /** @type {number} */
  var sbIndex = index / this.smallBlockSize | 0;
  /** @type {number} */
  var pos = sbIndex * this.smallBlockSize / 8;
  /** @type {number} */
  var octet;
  /** @type {number} */
  var tmp = 0;
  /** @type {number} */
  var i;
  /** @type {number} */
  var il;

  if (index > input.length * 8) {
    throw new Error('wrong index');
  }

  if (bit !== 0 && bit !== 1) {
    throw new Error('wrong bit');
  }

  for (i = 0, il = index % this.smallBlockSize, octet = input[pos]; i < il; ++i) {
    if ((octet & 1) === 1) {
      tmp++;
    }
    octet >>>= 1;

    if ((i + 1) % 8 === 0) {
      ++pos;
      octet = input[pos];
    }
  }

  tmp = this.largeBlocks[lbIndex] + this.smallBlocks[sbIndex] + tmp;

  return bit === 0 ? index - tmp : tmp;
};

Algorithm.FID.prototype.createSelectTable = function() {
  var USE_TYPEDARRAY = false;
  var table = new (USE_TYPEDARRAY ? Uint8Array : Array)(8 * 256);
  var row;
  var col;
  var pos;
  var octet;

  for (row = 0; row < 256; ++row) {
    octet = row;
    col = 0;

    for (pos = 0; pos < 8; ++pos) {
      if ((octet & 1) === 1) {
        table[row * 8 + col++] = pos + 1;
      }
      octet >>>= 1;
    }

    // 非 typed array では sparce array になってしまうので 0 で埋める
    if (!USE_TYPEDARRAY) {
      while (col < 8) {
        table[row * 8 + col++] = 0;
      }
    }
  }

  return table;
};

/**
 *
 */
Algorithm.FID.createRankTable_ = function() {
  var table = new (USE_TYPEDARRAY ? Uint8Array : Array)(256);
  var n;
  var i;
  var j;
  var count;

  for (i = 0; i < 256; ++i) {
    n = i;
    count = 0;

    for (j = 0; j < 8; ++j) {
      if ((n & 1) === 1) {
        ++count;
      }
      n >>>= 1;
    }

    table[i] = count;
  }

  return table;
};

Algorithm.FID.RankTable = Algorithm.FID.createRankTable_();

Algorithm.FID.prototype.select = function(n, bit) {
  /** @type {Array.<number>|Uint8Array} */
  var input = this.input;
  /** @type {number} */
  var left;
  /** @type {number} */
  var right;
  /** @type {number} */
  var tmp;
  /** @type {Array.<number>|Uint8Array} */
  var largeBlocks = this.largeBlocks;
  /** @type {number} */
  var largeBlockSize = this.largeBlockSize;
  /** @type {Array.<number>|Uint8Array|Uint32Array} */
  var smallBlocks = this.smallBlocks;
  /** @type {number} */
  var smallBlockSize = this.smallBlockSize;
  /** @type {number} */
  var rank;

  // Large Block

  left = 0;
  right = largeBlocks.length - 1;

  while (left < right) {
    tmp = (left + right) / 2 | 0;
    rank = bit === 0 ?
      tmp * largeBlockSize - largeBlocks[tmp] :
      largeBlocks[tmp];

    if (n < rank) {
      right = tmp;
    } else {
      left = tmp + 1;
    }
  }
  var lbValue = rank;
  --left;

  // Small Block

  left = left * largeBlockSize / smallBlockSize;
  right = left + largeBlockSize / smallBlockSize;

  while (left < right) {
    tmp = (left + right) / 2 | 0;
    rank = lbValue + (
      bit === 0 ?
      tmp * smallBlockSize - smallBlocks[tmp] :
      smallBlocks[tmp]
    );

    if (n < rank) {
      right = tmp;
    } else {
      left = tmp + 1;
    }
  }
  --left;

  console.log(rank);
};

Algorithm.FID.select_ = function(index, n, bit) {
  var input = this.input;
  var octet;
  var pos = 0;
  var table = Algorithm.FID.RankTable;
  var currentRank = 0;
  var i;

  while (true) {
    octet = input[pos];

    if (bit === 0) {
      octet = ~octet;
    }

    if (currentRank + table[octet] < n) {
      currentRank += table[octet];
    } else {
      for (i = 0; i < 8; ++i) {
        if (currentRank === n) {
          return pos * 8 + i;
        }
      }
    }

    ++pos;
  }
};

/**
 * @param {number} n
 * @return {number}
 * @private
 */
Algorithm.FID.popCount32_ = function(n) {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);

  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};