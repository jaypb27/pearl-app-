/* PEARL App — DEMO MODE ONLY.
 * Imitates Google Sheets / Drive / Apps Script services inside the browser so the real
 * Code.gs logic can run without internet (data is kept on this device only). */
(function (G) {
  var LS = (function () { try { localStorage.setItem('__t', '1'); return localStorage; } catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; } })();
  var PFX = 'pearl_demo_';
  /* ---------- SHA-256 (sync) ---------- */
  function sha256Bytes(bytes) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length, m = bytes.slice(); m.push(0x80);
    while (m.length % 64 !== 56) m.push(0);
    var bl = l * 8; for (var i = 7; i >= 0; i--) m.push(i > 3 ? 0 : (bl >>> (i * 8)) & 255);
    var w = new Array(64);
    for (var o = 0; o < m.length; o += 64) {
      for (var t = 0; t < 16; t++) w[t] = (m[o + t * 4] << 24) | (m[o + t * 4 + 1] << 16) | (m[o + t * 4 + 2] << 8) | m[o + t * 4 + 3];
      for (t = 16; t < 64; t++) {
        var a0 = w[t - 15], a1 = w[t - 2];
        var s0 = ((a0 >>> 7) | (a0 << 25)) ^ ((a0 >>> 18) | (a0 << 14)) ^ (a0 >>> 3);
        var s1 = ((a1 >>> 17) | (a1 << 15)) ^ ((a1 >>> 19) | (a1 << 13)) ^ (a1 >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = []; H.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
    return out;
  }
  function utf8(s) { return Array.prototype.slice.call(new TextEncoder().encode(String(s))); }
  function signed(arr) { return arr.map(function (x) { return x > 127 ? x - 256 : x; }); }
  function unsigned(arr) { return arr.map(function (x) { return x < 0 ? x + 256 : x; }); }
  function hmac(msg, key) {
    var k = utf8(key); if (k.length > 64) k = sha256Bytes(k); while (k.length < 64) k.push(0);
    var ip = k.map(function (x) { return x ^ 0x36; }), op = k.map(function (x) { return x ^ 0x5c; });
    return sha256Bytes(op.concat(sha256Bytes(ip.concat(utf8(msg)))));
  }
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function unb64(s) { var bin = atob(s), a = []; for (var i = 0; i < bin.length; i++) a.push(bin.charCodeAt(i)); return a; }

  function Blob_(bytes, mime, name) { this.b = bytes; this.m = mime; this.n = name; }
  Blob_.prototype.getBytes = function () { return signed(this.b); };
  Blob_.prototype.getDataAsString = function () { return new TextDecoder().decode(new Uint8Array(this.b)); };
  Blob_.prototype.getContentType = function () { return this.m; };

  G.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: function (alg, s) { return signed(sha256Bytes(utf8(s))); },
    computeHmacSha256Signature: function (msg, key) { return signed(hmac(msg, key)); },
    base64EncodeWebSafe: function (x) { var bytes = typeof x === 'string' ? utf8(x) : unsigned(x); return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_'); },
    base64DecodeWebSafe: function (s) { return signed(unb64(s.replace(/-/g, '+').replace(/_/g, '/'))); },
    base64Encode: function (x) { return b64(unsigned(x)); },
    base64Decode: function (s) { return signed(unb64(s)); },
    newBlob: function (data, mime, name) { return new Blob_(typeof data === 'string' ? utf8(data) : unsigned(data), mime, name); },
    getUuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  };

  /* ---------- Spreadsheet (active file + archive copies) ---------- */
  function makeSS(key, id) {
    var DB = null, saveT = null;
    function load() { if (DB) return DB; try { DB = JSON.parse(LS.getItem(PFX + key) || '{}'); } catch (e) { DB = {}; } return DB; }
    function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { LS.setItem(PFX + key, JSON.stringify(DB)); } catch (e) { console.warn('Demo storage full', e); } }, 50); }
    function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    Range.prototype.getValues = function () {
      var d = load()[this.sh], out = [];
      for (var i = 0; i < this.nr; i++) { var row = d[this.r - 1 + i] || [], o = []; for (var j = 0; j < this.nc; j++) { var v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); } out.push(o); }
      return out;
    };
    Range.prototype.setValues = function (v) {
      var d = load()[this.sh];
      for (var i = 0; i < v.length; i++) { var ri = this.r - 1 + i; d[ri] = d[ri] || []; for (var j = 0; j < v[i].length; j++) d[ri][this.c - 1 + j] = v[i][j]; }
      save(); return this;
    };
    Range.prototype.clearContent = function () {
      var d = load()[this.sh];
      for (var i = 0; i < this.nr; i++) { var row = d[this.r - 1 + i]; if (row) for (var j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; }
      while (d.length && d[d.length - 1].every(function (x) { return x === '' || x == null; })) d.pop();
      save(); return this;
    };
    Range.prototype.setFontWeight = Range.prototype.setBackground = Range.prototype.setNumberFormat = function () { return this; };
    function Sheet(name) { this.name = name; }
    Sheet.prototype.getLastRow = function () { return (load()[this.name] || []).length; };
    Sheet.prototype.getMaxRows = function () { return Math.max(1000, this.getLastRow()); };
    Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this.name, r, c, nr || 1, nc || 1); };
    Sheet.prototype.appendRow = function (row) { load()[this.name].push(row.slice()); save(); return this; };
    Sheet.prototype.setFrozenRows = function () { return this; };
    return {
      getId: function () { return id; }, getUrl: function () { return '#demo-archive-' + id; },
      getSheetByName: function (n) { return load()[n] ? new Sheet(n) : null; },
      insertSheet: function (n) { load()[n] = []; save(); return new Sheet(n); },
      getSheets: function () { return Object.keys(load()).map(function (n) { return new Sheet(n); }); },
      deleteSheet: function (sh) { delete load()[sh.name]; save(); },
      copy: function (name) {
        var nid = 'arch' + Date.now().toString(36); clearTimeout(saveT);
        try { LS.setItem(PFX + 'ss_' + nid, JSON.stringify(load())); } catch (e) { throw new Error('Demo storage is full; cannot archive.'); }
        return (REG[nid] = makeSS('ss_' + nid, nid));
      }
    };
  }
  var ACTIVE = makeSS('sheets', 'active'), REG = {};
  G.SpreadsheetApp = { getActiveSpreadsheet: function () { return ACTIVE; }, openById: function (id) { if (REG[id]) return REG[id]; if (!LS.getItem(PFX + 'ss_' + id)) throw new Error('Archive not found'); return (REG[id] = makeSS('ss_' + id, id)); } };

  G.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return LS.getItem(PFX + 'prop_' + k); }, setProperty: function (k, v) { LS.setItem(PFX + 'prop_' + k, v); } }; } };
  G.LockService = { getScriptLock: function () { return { waitLock: function () { }, releaseLock: function () { } }; } };

  /* ---------- Drive (audio kept in memory + IndexedDB for the demo) ---------- */
  var FILES = {}, FOLDERS = {};
  function Folder(id, name) { this.id = id; this.name = name; }
  Folder.prototype.getId = function () { return this.id; };
  Folder.prototype.getFoldersByName = function (n) { var me = this, list = Object.keys(FOLDERS).map(function (k) { return FOLDERS[k]; }).filter(function (f) { return f.parent === me.id && f.name === n; }), i = 0; return { hasNext: function () { return i < list.length; }, next: function () { return list[i++]; } }; };
  Folder.prototype.createFolder = function (n) { var f = new Folder('fld' + Date.now() + Math.random(), n); f.parent = this.id; FOLDERS[f.id] = f; return f; };
  Folder.prototype.createFile = function (blob) {
    var id = 'demo-file-' + Utilities.getUuid(); FILES[id] = blob;
    try { if (G.PEARL_DEMO_FILES) G.PEARL_DEMO_FILES.put(id, blob); } catch (e) { }
    return { getId: function () { return id; }, getUrl: function () { return '#demo-audio-' + id; } };
  };
  G.DriveApp = {
    createFolder: function (n) { var f = new Folder('root' + Date.now(), n); FOLDERS[f.id] = f; return f; },
    getFolderById: function (id) { if (!FOLDERS[id]) { FOLDERS[id] = new Folder(id, 'PEARL App Audio Recordings'); } return FOLDERS[id]; },
    getFileById: function (id) { if (/^arch/.test(id)) return { moveTo: function () { } }; var b = FILES[id]; if (!b && G.PEARL_DEMO_FILES) b = G.PEARL_DEMO_FILES.getSync(id); if (!b) throw new Error('Audio file not available in demo (recordings are kept only until the page is reloaded).'); return { getBlob: function () { return b; } }; }
  };
  G.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: function (s) { return { s: s, setMimeType: function () { return this; }, getContent: function () { return s; } }; } };
  G.Logger = { log: function () { console.log.apply(console, arguments); } };
  G.PEARL_DEMO_RESET = function () { Object.keys(LS).forEach(function (k) { if (k.indexOf(PFX) === 0) LS.removeItem(k); }); ACTIVE = makeSS('sheets', 'active'); REG = {}; };
})(typeof window !== 'undefined' ? window : globalThis);
