goog.provide('Zlib.SuffixArray');

goog.require('USE_TYPEDARRAY');

goog.scope(function() {

/**
 * Suffix Array Constructor
 * @constructor
 * @param {!(Array.<number>|Uint8Array)} input
 * @param {Object=} opt_params
 */
Zlib.SuffixArray = function(input, opt_params) {
  opt_params = opt_params || {};

  /** @type {!(Array.<number>|Uint8Array)} */
  this.input = input;
  /** @type {number} */
  this.numberOfSymbols = 'numberOfSymbols' in opt_params ?
    opt_params['numberOfSymbols'] : Zlib.SuffixArray.NumberOfSymbols;
  /** @type {(Array.<number>|Int32Array)} */
  this.suffixArray;
};

/**
 * @enum {number}
 */
Zlib.SuffixArray.Type = {
  L: 0,
  S: 1
};

/**
 * @const
 * @type {number}
 */
Zlib.SuffixArray.NumberOfSymbols = 256;

/**
 * construct Suffix Array
 * @return {(Array.<number>|Int32Array)}
 */
Zlib.SuffixArray.prototype.construct = function() {
  /** @type {number} */
  var length = this.input.length;
  /** @type {(Array.<number>|Int32Array)} */
  var bucket =
    new (USE_TYPEDARRAY ? Int32Array : Array)(length);

  return this.suffixArray =
    this.sais_(this.input, 0, length, bucket, this.numberOfSymbols);
};

Zlib.SuffixArray.prototype.bwt = function() {
  /** @type {Array.<number>|Int32Array} */
  var suffixArray = this.suffixArray || this.construct();
  var length = suffixArray.length;
  var bwt = new (USE_TYPEDARRAY ? Uint8Array : Array)(length);
  var input = this.input;
  var i;

  for (i = 0; i < length; ++i) {
    bwt[i] = suffixArray[i] === 0 ? input[length - 1] : input[suffixArray[i] - 1];
  }

  return bwt;
};

Zlib.SuffixArray.prototype.decodeBWT = function(encoded, numberOfSymbols) {
  var n = encoded.length;
  var decoded = new (USE_TYPEDARRAY ? Uint8Array : Array)(n);
  var count = new (USE_TYPEDARRAY ? Uint32Array : Array)(numberOfSymbols); // Fの情報を累積頻度で持つ
  var lf = new (USE_TYPEDARRAY ? Uint32Array : Array)(n); // シンボル数が256の時は Uint8Array でも良さそう
  var i;
  var next = -1;

  // 出現頻度の取得
  for (i = 0; i < n; ++i) {
    if (encoded[i] === 0) {
      next = i;
    }
    ++count[encoded[i]];
  }

  // 出現頻度を先頭からの合計値にする
  for (i = 1; i < numberOfSymbols; i++) {
    count[i] += count[i-1];
  }

  // LF map
  for (i = n-1; i >= 0; i--) {
    lf[--count[encoded[i]]] = i;
  }

  // LF map を用いて BWT をデコードする
  for (i = 0; i < n; i++){
    next = lf[next];
    decoded[i] = encoded[next];
  }

  return decoded;
};

/**
 * SA-IS 実装本体
 * この実装では文字列の終わりを表す記号 $ を省略して実装してある.
 *
 * @param {(Array.<number>|Uint8Array|Int32Array)} input Suffix Array の元となる入力.
 * @param {number} offset 入力の開始位置.
 * @param {number} length 入力の長さ.
 * @param {(Array.<number>|Int32Array)} bucket Suffix Array 兼 計算領域.
 * @param {number} numberOfSymbols 出現するシンボルの個数.
 * @return {(Array.<number>|Int32Array)}
 * @private
 */
Zlib.SuffixArray.prototype.sais_ = function(input, offset, length, bucket, numberOfSymbols) {
  var suffixType = new (USE_TYPEDARRAY ? Uint8Array : Array)(length);
  // Start, End, Left, Right
  var bucketOffset =
    new (USE_TYPEDARRAY ? Uint32Array : Array)(numberOfSymbols * 4);
  /** @type {Array.<number>} */
  var lms = [];
  /** @type {number} */
  var name;
  /** @type {number} */
  var prev;
  /** @type {number} */
  var index;
  /** @type {boolean} */
  var diff;
  /** @type {number} */
  var n1;
  /** @type {number} */
  var i;
  /** @type {number} */
  var j;

  //---------------------------------------------------------------------------
  // STAGE 1: 入力のクラス付け(S-Type/L-Type), LMS-substring の命名などの準備
  //---------------------------------------------------------------------------
  this.scanInput_(input, offset, length, lms, suffixType, bucket, bucketOffset, numberOfSymbols);
  this.induceSuffixArrayLarge_(input, offset, length, suffixType, bucket, bucketOffset, numberOfSymbols);
  this.induceSuffixArraySmall_(input, offset, length, suffixType, bucket, bucketOffset);
  this.resetBucketOffset_(bucketOffset, numberOfSymbols);

  // Type-S* の位置を取得しソート後の出現順に左詰めで再代入し、LMS-substring の個数を求める
  for (i = 0, n1 = 0; i < length; ++i) {
    if (this.isLeftmostSType_(suffixType, bucket[i])) {
      bucket[n1++] = bucket[i];
    }
  }

  // LMS-Substring の先頭位置以外は初期化する
  for(i = n1; i < length; ++i) {
    bucket[i] = -1;
  }

  // LMS-Substring に通し番号で命名する
  for(i = 0, name = 0, prev = -1; i < n1; ++i) {
    index = bucket[i];
    diff = false;

    for(j = 0; j < length; ++j) {
      if(prev === -1 || input[offset + index + j] !== input[offset + prev + j] || suffixType[index+j] !== suffixType[prev+j]) {
        diff = true;
        break;
      } else if(j > 0 && (this.isLeftmostSType_(suffixType, index + j) || this.isLeftmostSType_(suffixType, prev + j))) {
        break;
      }
    }
    if (diff) {
      name++;
      prev = index;
    }

    index >>>= 1;
    bucket[n1 + index] = name - 1;
  }

  // 命名された LMS-substring を右寄せにする
  // n1 以降は -1 で初期化されているため、0 以上ならば命名された LMS-substring となる
  for (i = j = length - 1; i >= n1; i--) {
    if (bucket[i] >= 0) {
      bucket[j--] = bucket[i];
    }
  }

  //---------------------------------------------------------------------------
  // STAGE 2: LMS-substring のソートを行う準備
  //---------------------------------------------------------------------------

  // LMS-substring の種類と数が一致していなければ
  // (=それぞれの LMS-substring がユニークではなかったら)
  // ユニークになるまで再帰する
  //
  // ユニークだった場合はすでに LMS-substring の順序がわかっているので
  // bucket[length - n1 .. length] (再帰する際の入力部分) から  LMS-substring のソートを行い、
  // 先頭にいれる
  if (name < n1) {
    this.sais_(bucket, length - n1, n1, bucket, name);
  } else {
    for (i = 0; i < n1; ++i) {
      bucket[bucket[length - n1 + i]] = i;
    }
  }

  //---------------------------------------------------------------------------
  // STAGE 3: ソートされた LMS-substring を用いて再度全体をソートする
  //---------------------------------------------------------------------------

  // 再帰で入力として渡した部分を LMS-index で置き換える
  /*
  for (i = 0, j = length - n1; i < n1; ++i) {
    bucket[j++] = lms[n1 - 1 - i];
  }
  */
  for (i = 0, j = length; i < n1; ++i) {
    bucket[--j] = lms[i];
  }

  // bucket の先頭には並び替えた s1, s1 には LMS-index
  // s1[bucket[0 .. n1 - 1]] で bucket の先頭(bucket[0 .. n1 - 1])を正しい並び順にする
  for (i = 0; i < n1; ++i) {
    bucket[i] = bucket[length - n1 + bucket[i]];
  }

  // 初期状態の設定
  // LMS-index を後ろから bucket に insert する
  // LMS は S-type のため、必ず後ろから挿入される
  for(i = n1; i--;) {
    j = bucket[i];
    bucket[--bucketOffset[input[offset + j] * 4 + 3]] = j;
  }

  this.induceSuffixArrayLarge_(input, offset, length, suffixType, bucket, bucketOffset, numberOfSymbols);
  this.induceSuffixArraySmall_(input, offset, length, suffixType, bucket, bucketOffset);

  return bucket;
};

/**
 * decide suffix type and character histogram
 *
 * @param {(Array.<number>|Uint8Array|Int32Array)} input
 * @param {number} offset
 * @param {number} length
 * @param leftmostStype
 * @param {(Array.<number>|Uint8Array)} outputSuffixType
 * @param {(Array.<number>|Int32Array)} outputBucket
 * @param {(Array.<number>|Uint32Array)} outputBucketOffset
 * @param {number} numberOfSymbols
 * @private
 */
Zlib.SuffixArray.prototype.scanInput_ =
function(input, offset, length, leftmostStype, outputSuffixType, outputBucket, outputBucketOffset, numberOfSymbols) {
  /** @type {(Array.<number>|Uint32Array)} */
  var symbolCount = new (USE_TYPEDARRAY ? Uint32Array : Array)(numberOfSymbols);
  /** @type {number} */
  var prevType;
  /** @type {number} */
  var currentType;
  /** @type {number} */
  var bucketOffset;
  /** @type {number} */
  var nLeftmostStype = 0;
  /** @type {number} */
  var pos;
  /** @type {number} */
  var c1;
  /** @type {number} */
  var c2;
  /** @type {number} */
  var i;

  // initialize normal array
  if (!USE_TYPEDARRAY) {
    for (i = 0; i < numberOfSymbols; ++i) {
      symbolCount[i] = 0;
    }
    for (i = 0; i < length; ++i) {
      outputBucket[i] = 0;
    }
  }

  //---------------------------------------------------------------------------
  // クラス分けと LMS
  //---------------------------------------------------------------------------
  i = length;
  if (i--) {
    outputSuffixType[i] = Zlib.SuffixArray.Type.L;
    ++symbolCount[input[offset + i]];
  }

  while (i--) {
    c1 = input[offset + i];
    c2 = input[offset + i + 1];
    ++symbolCount[c1];

    currentType =
      (c1 < c2) ? Zlib.SuffixArray.Type.S :
        (c1 > c2) ? Zlib.SuffixArray.Type.L :
          outputSuffixType[i + 1];

    outputSuffixType[i] = currentType;
    if (currentType !== prevType) {
      prevType = currentType;
    }

    if (this.isLeftmostSType_(outputSuffixType, i + 1)) {
      leftmostStype[nLeftmostStype++] = i + 1;
    }
  }

  //---------------------------------------------------------------------------
  // construct buckets pointer
  //---------------------------------------------------------------------------
  for (i = 0, bucketOffset = 0; i < numberOfSymbols; ++i) {
    pos = i * 4;
    outputBucketOffset[pos    ] = outputBucketOffset[pos + 2] = bucketOffset;
    outputBucketOffset[pos + 1] = outputBucketOffset[pos + 3] = bucketOffset += symbolCount[i];
  }

  //---------------------------------------------------------------------------
  // initialize buckets
  //---------------------------------------------------------------------------
  while (nLeftmostStype--) {
    outputBucket[--outputBucketOffset[input[offset + leftmostStype[nLeftmostStype]] * 4 + 3]] =
      leftmostStype[nLeftmostStype];
  }
};

/**
 * @param {(Array.<number>|Uint8Array|Int32Array)} input
 * @param {number} offset
 * @param {number} length
 * @param {(Array.<number>|Uint8Array)}suffixType
 * @param {(Array.<number>|Int32Array)} bucket
 * @param {(Array.<number>|Uint32Array)} bucketOffset
 * @param {number} numberOfSymbols
 * @private
 */
Zlib.SuffixArray.prototype.induceSuffixArrayLarge_ =
function(input, offset, length, suffixType, bucket, bucketOffset, numberOfSymbols) {
  /** @type {number} */
  var head;
  /** @type {number} */
  var tail;
  /** @type {number} */
  var index;
  /** @type {number} */
  var i;
  /** @type {number} */
  var il;

  index = length - 1;
  bucket[bucketOffset[input[offset + index] * 4 + 2]++] = index;

  for (i = 0, il = numberOfSymbols * 4; i < il; i += 4) {
    // left
    for (head = bucketOffset[i]; head < bucketOffset[i + 2]; ++head) {
      index = bucket[head] - 1;
      if (index >= 0 && suffixType[index] === Zlib.SuffixArray.Type.L) {
        bucket[bucketOffset[input[offset + index] * 4 + 2]++] = index;
      }
    }

    // right
    for (head = bucketOffset[i + 3], tail = bucketOffset[i + 1]; head < tail; ++head) {
      index = bucket[head] - 1;
      if (index >= 0 && suffixType[index] === Zlib.SuffixArray.Type.L) {
        bucket[bucketOffset[input[offset + index] * 4 + 2]++] = index;
      }
    }

    // reset context
    bucketOffset[i + 2] = bucketOffset[i];
    bucketOffset[i + 3] = bucketOffset[i + 1];
  }
};

/**
 * @param {(Array.<number>|Uint8Array|Int32Array)} input
 * @param {number} offset
 * @param {number} length
 * @param {(Array.<number>|Uint8Array)}suffixType
 * @param {(Array.<number>|Int32Array)} bucket
 * @param {(Array.<number>|Uint32Array)} bucketOffset
 * @private
 */
Zlib.SuffixArray.prototype.induceSuffixArraySmall_ =
function(input, offset, length, suffixType, bucket, bucketOffset) {
  /** @type {number} */
  var index;

  // scan tail to head
  while (length--) {
    index = bucket[length] - 1;
    if (suffixType[index] === Zlib.SuffixArray.Type.S) {
      bucket[--bucketOffset[input[offset + index] * 4 + 3]] = index;
    }
  }
};

/**
 * @param {(Array.<number>|Uint32Array)} bucketOffset
 * @param {number} numberOfSymbols
 * @private
 */
Zlib.SuffixArray.prototype.resetBucketOffset_ = function(bucketOffset, numberOfSymbols) {
  while (numberOfSymbols--) {
    bucketOffset[numberOfSymbols * 4 + 2] = bucketOffset[numberOfSymbols * 4    ];
    bucketOffset[numberOfSymbols * 4 + 3] = bucketOffset[numberOfSymbols * 4 + 1];
  }
};

/**
 * @param {(Array.<number>|Uint8Array)} suffixType
 * @param {number} index
 * @return {boolean}
 * @private
 */
Zlib.SuffixArray.prototype.isLeftmostSType_ = function(suffixType, index) {
  return (
    index > 0 &&
    suffixType[index    ] === Zlib.SuffixArray.Type.S &&
    suffixType[index - 1] === Zlib.SuffixArray.Type.L
  );
};

});