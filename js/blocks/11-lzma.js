/* ============================================
   LZMA 解壓縮(只解不壓)
   ────────────────────────────────────────────
   為什麼專案裡會有這種東西:MakeCode 的 .hex 檔把專案原始碼夾在裡面,
   而且是 **LZMA 壓縮**過的(檔頭寫著 {"compression":"LZMA"})。
   不解開就拿不到那份 main.ts,老師就只能手動複製貼上。

   這是「LZMA alone」格式的最小解碼器:
     第 0 個位元組   props(把 lc / lp / pb 包在一起)
     第 1~4 個      字典大小
     第 5~12 個     解開之後有多大(全 FF = 不知道)
     之後           range coder 的位元流

   ── 為什麼自己寫,不抓現成的 ──
   這個專案是純前端、沒有打包步驟,全部靠 <script> 載入,而且要能在
   學校的網路環境下開得起來。為了一個檔案去掛一個 CDN 相依,
   等於把「老師打不開系統」的風險接進來。演算法本身是固定的,
   而且我們有一個真的 .hex 當測試資料,解出來對不對驗得出來。

   只解壓、不壓縮 —— 我們永遠只讀老師給的檔案,不產生 .hex。
============================================ */

const LZMA = {
  /* props 位元組拆成 lc / lp / pb */
  _props(b) {
    if (b > 224) throw new Error('LZMA props 不合法');
    const lc = b % 9;
    const r = (b - lc) / 9;
    const lp = r % 5;
    const pb = (r - lp) / 5;
    return { lc, lp, pb };
  },

  /* ---------- range decoder ----------
     機率模型全部是 11 位元定點數(kNumBitModelTotalBits = 11),
     初始值一律是中間值 1024。 */
  _rc(buf, pos) {
    const rc = {
      buf, pos,
      range: 0xFFFFFFFF,
      code: 0,
      byte() { return this.pos < this.buf.length ? this.buf[this.pos++] : 0; },
      norm() {
        if (this.range < 0x1000000) {
          this.range = (this.range * 256) >>> 0;
          this.code = ((this.code * 256) + this.byte()) >>> 0;
        }
      },
      bit(probs, i) {
        const v = probs[i];
        // range >>> 11 再乘上機率 —— 兩者都小於 2^21 / 2^11,不會溢位
        const bound = (this.range >>> 11) * v;
        let sym;
        if ((this.code >>> 0) < bound) {
          probs[i] = v + ((2048 - v) >>> 5);
          this.range = bound;
          sym = 0;
        } else {
          probs[i] = v - (v >>> 5);
          this.code = (this.code - bound) >>> 0;
          this.range = (this.range - bound) >>> 0;
          sym = 1;
        }
        this.norm();
        return sym;
      },
      direct(n) {
        let res = 0;
        do {
          this.range = this.range >>> 1;
          this.code = (this.code - this.range) >>> 0;
          const t = 0 - (this.code >>> 31);
          this.code = (this.code + (this.range & t)) >>> 0;
          this.norm();
          res = ((res * 2) + t + 1) >>> 0;
        } while (--n);
        return res >>> 0;
      }
    };
    rc.byte();                       // 第一個位元組一律忽略
    for (let i = 0; i < 4; i++) rc.code = ((rc.code * 256) + rc.byte()) >>> 0;
    return rc;
  },

  _probs(n) { return new Uint16Array(n).fill(1024); },

  /* 位元樹:由高位往低位解,回傳 0 ~ 2^bits−1 */
  _tree(rc, probs, off, bits) {
    let m = 1;
    for (let i = 0; i < bits; i++) m = (m << 1) + rc.bit(probs, off + m);
    return m - (1 << bits);
  },

  /* 反向位元樹:由低位往高位解(距離的低位用這個) */
  _treeRev(rc, probs, off, bits) {
    let m = 1, sym = 0;
    for (let i = 0; i < bits; i++) {
      const b = rc.bit(probs, off + m);
      m = (m << 1) + b;
      sym |= b << i;
    }
    return sym;
  },

  _lenDec() {
    return { choice: this._probs(2), low: this._probs(16 * 8),
             mid: this._probs(16 * 8), high: this._probs(256) };
  },

  _len(rc, d, posState) {
    if (rc.bit(d.choice, 0) === 0) return this._tree(rc, d.low, posState * 8, 3);
    if (rc.bit(d.choice, 1) === 0) return 8 + this._tree(rc, d.mid, posState * 8, 3);
    return 16 + this._tree(rc, d.high, 0, 8);
  },

  /* ---------- 主流程 ----------
     bytes 是整個 alone 格式的資料。回傳 Uint8Array。 */
  decode(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 13) throw new Error('LZMA 資料太短');
    const { lc, lp, pb } = this._props(b[0]);
    const dictSize = (b[1] | (b[2] << 8) | (b[3] << 16) | (b[4] << 24)) >>> 0;

    // 解開之後有多大。高 4 個位元組我們當成 0 —— 超過 4GB 的檔案不可能出現在這裡
    let outSize = 0, known = false;
    for (let i = 0; i < 8; i++) {
      if (b[5 + i] !== 0xFF) known = true;
    }
    if (known) {
      outSize = b[5] + b[6] * 256 + b[7] * 65536 + b[8] * 16777216;
      for (let i = 4; i < 8; i++) if (b[5 + i] !== 0) throw new Error('LZMA 檔案太大');
    } else {
      outSize = 1 << 22;      // 不知道大小就先給 4MB,不夠再長
    }

    const rc = this._rc(b, 13);
    const out = new Uint8Array(outSize);
    let outPos = 0;
    const put = v => {
      if (outPos >= out.length) throw new Error('LZMA 解出來的資料超過預期');
      out[outPos++] = v;
    };
    const back = d => out[outPos - d];

    const pbMask = (1 << pb) - 1;
    const lpMask = (1 << lp) - 1;

    const lit = this._probs(0x300 << (lc + lp));
    const isMatch = this._probs(12 << 4);
    const isRep = this._probs(12);
    const isRepG0 = this._probs(12);
    const isRepG1 = this._probs(12);
    const isRepG2 = this._probs(12);
    const isRep0Long = this._probs(12 << 4);
    const posSlot = this._probs(4 * 64);
    const posDec = this._probs(115);
    const align = this._probs(16);
    const lenDec = this._lenDec();
    const repLenDec = this._lenDec();

    let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;

    for (;;) {
      if (known && outPos >= outSize) break;
      const posState = outPos & pbMask;

      if (rc.bit(isMatch, (state << 4) + posState) === 0) {
        // ── 字面值 ──
        const prev = outPos === 0 ? 0 : out[outPos - 1];
        const litState = ((outPos & lpMask) << lc) + (prev >>> (8 - lc));
        const off = 0x300 * litState;
        let sym = 1;
        if (state >= 7) {
          let matchByte = back(rep0 + 1);
          do {
            const mb = (matchByte >>> 7) & 1;
            matchByte = (matchByte << 1) & 0xFF;
            const bit = rc.bit(lit, off + ((1 + mb) << 8) + sym);
            sym = (sym << 1) | bit;
            if (mb !== bit) break;
          } while (sym < 0x100);
        }
        while (sym < 0x100) sym = (sym << 1) | rc.bit(lit, off + sym);
        put(sym & 0xFF);
        state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
        continue;
      }

      let len;
      if (rc.bit(isRep, state) !== 0) {
        // ── 重複用前面某一段距離 ──
        if (outPos === 0) throw new Error('LZMA 資料壞了');
        if (rc.bit(isRepG0, state) === 0) {
          if (rc.bit(isRep0Long, (state << 4) + posState) === 0) {
            state = state < 7 ? 9 : 11;
            put(back(rep0 + 1));
            continue;
          }
        } else {
          let dist;
          if (rc.bit(isRepG1, state) === 0) dist = rep1;
          else {
            if (rc.bit(isRepG2, state) === 0) dist = rep2;
            else { dist = rep3; rep3 = rep2; }
            rep2 = rep1;
          }
          rep1 = rep0;
          rep0 = dist;
        }
        len = this._len(rc, repLenDec, posState);
        state = state < 7 ? 8 : 11;
      } else {
        // ── 新的距離 ──
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        len = this._len(rc, lenDec, posState);
        state = state < 7 ? 7 : 10;

        const lenState = len < 4 ? len : 3;
        const slot = this._tree(rc, posSlot, lenState * 64, 6);
        if (slot < 4) rep0 = slot;
        else {
          const nd = (slot >>> 1) - 1;
          let dist = (2 | (slot & 1)) << nd;
          if (slot < 14) dist += this._treeRev(rc, posDec, dist - slot, nd);
          else {
            dist += rc.direct(nd - 4) * 16;
            dist += this._treeRev(rc, align, 0, 4);
          }
          rep0 = dist >>> 0;
        }
        if (rep0 === 0xFFFFFFFF) break;        // 結束標記
        if (rep0 >= dictSize || rep0 >= outPos) throw new Error('LZMA 距離不合法');
      }

      len += 2;
      for (let i = 0; i < len; i++) {
        if (known && outPos >= outSize) break;
        put(back(rep0 + 1));
      }
    }

    return outPos === out.length ? out : out.subarray(0, outPos);
  }
};
