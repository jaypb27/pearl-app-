/* PEARL App — core: storage, API, offline sync, helpers
 * Developed by Joy P. Bacala, Samal Senior High School */
(function () {
  'use strict';
  var P = window.P = {};
  P.VERSION = '1.5.1';
  P.views = {};
  P.DEV = 'Joy P. Bacala';
  P.LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
  P.STEP_NAMES = [['📖', 'Words'], ['📰', 'Read'], ['✅', 'Quiz'], ['✍️', 'Write'], ['🎙️', 'Speak']];

  P.DEFAULT_SETTINGS = {
    appName: 'PEARL', programFull: 'Proficiency in English and Reading Literacy Program',
    tagline: 'Reading with purpose, speaking with confidence.',
    schoolName: 'Samal Senior High School', schoolId: '', schoolAddress: 'Sitio Pasig, Brgy. Peñaplata, District II, Island Garden City of Samal',
    region: 'Davao Region', division: 'Schools Division of Island Garden City of Samal', schoolYear: '2026–2027',
    programLogo: '', schoolLogo: '', depedSeal: '',
    levelAlias: { Beginner: 'Emerging', Intermediate: 'Developing', Advanced: 'At Grade Level' },
    totalDays: 40, releasedDay: 40, unlockMode: 'sequential', showTimer: true, stepMinutes: 5,
    minWords: { Beginner: 8, Intermediate: 15, Advanced: 25 }, targetAudioSec: 60, maxAudioSec: 180,
    points: { written: 50, audio: 50, monthly: 50 }, passPct: 75, placement: { Intermediate: 50, Advanced: 80 },
    watchName: 'WATCH', watchFull: 'We Advocate Time Consciousness and Honesty',
    coordinator: '', coordinatorTitle: 'PEARL Program Coordinator', principal: '', principalTitle: 'School Principal',
    programStart: '',
    deviceLock: true, onePerPhone: true, sharedDevices: [], protect: true, pauseOnLeave: true, maxLeavesTest: 3
  };

  P.state = { settings: Object.assign({}, P.DEFAULT_SETTINGS), students: [], lessons: [], assessments: [], users: [], stamps: {}, salt: '', session: null, online: navigator.onLine, pending: 0, syncing: false, lastSync: '' };

  /* ---------------- helpers ---------------- */
  P.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  P.$ = function (sel, root) { return (root || document).querySelector(sel); };
  P.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  P.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  var DEV = null;
  P.deviceId = function () {
    if (DEV) return DEV;
    try { DEV = localStorage.getItem('pearl_device'); } catch (e) { }
    if (!DEV) { DEV = 'PH-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toUpperCase(); try { localStorage.setItem('pearl_device', DEV); } catch (e) { } }
    return DEV;
  };
  P.restoreDevice = function () { // keep the same phone ID even if only one storage was cleared
    return P.kvGet('device').then(function (saved) {
      var cur = null; try { cur = localStorage.getItem('pearl_device'); } catch (e) { }
      if (saved && !cur) { DEV = saved; try { localStorage.setItem('pearl_device', saved); } catch (e) { } }
      else if (!saved) P.kvSet('device', P.deviceId());
    });
  };
  P.deviceInfo = function () {
    var ua = navigator.userAgent, os = /Android\s([\d.]+)/.exec(ua), m = /;\s?([^;)]+)\sBuild/.exec(ua);
    var b = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
    return (m ? m[1].trim() + ' · ' : '') + (os ? 'Android ' + os[1] : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Other') + ' · ' + b;
  };
  P.shortDev = function (d) { return d ? String(d).slice(-5) : '—'; };

  /* security / activity log (kept on the phone, uploaded when online) */
  P.logEvent = function (event, detail, who) {
    var s = who || P.state.session || {};
    var e = { at: new Date().toISOString(), lrn: s.lrn || '', pinHash: s.pinHash || '', device: P.deviceId(), event: event, detail: detail || '', info: P.deviceInfo() };
    return P.kvGet('events').then(function (list) { list = list || []; list.push(e); if (list.length > 400) list = list.slice(-400); return P.kvSet('events', list); });
  };
  P.flushEvents = function () {
    return P.kvGet('events').then(function (list) {
      if (!list || !list.length) return;
      return P.api('logEvents', { events: list }).then(function () { return P.kvGet('events').then(function (now) { return P.kvSet('events', (now || []).slice(list.length)); }); });
    });
  };
  P.fmtDate = function (iso, withTime) {
    if (!iso) return '—'; var d = new Date(iso); if (isNaN(d)) return String(iso);
    var o = { month: 'short', day: 'numeric', year: 'numeric' }; if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return d.toLocaleString('en-PH', o);
  };
  P.fmtTime = function (iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' }); };
  P.dayKey = function (iso) { var d = iso ? new Date(iso) : new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  P.mmss = function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
  P.pct = function (a, b) { return b ? Math.round(a / b * 100) : 0; };
  P.words = function (t) { return (String(t || '').trim().match(/[A-Za-z0-9'’-]+/g) || []).length; };
  P.name = function (s) { return s ? (s.last + ', ' + s.first + (s.middle ? ' ' + String(s.middle).charAt(0) + '.' : '')) : ''; };
  P.cap = function (s) { return String(s || '').toLowerCase().replace(/(^|[\s-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); };
  P.short = function (s) { return s ? s.first + ' ' + String(s.last || '').charAt(0) + '.' : ''; };
  P.alias = function (lv) { var a = (P.state.settings.levelAlias || {})[lv]; return a ? lv + ' (' + a + ')' : lv; };
  P.lvChip = function (lv) { return '<span class="chip ' + P.esc(lv) + '">' + P.esc(lv || '—') + '</span>'; };
  P.sum = function (a) { return a.reduce(function (x, y) { return x + (Number(y) || 0); }, 0); };
  P.avg = function (a) { return a.length ? P.sum(a) / a.length : 0; };
  P.groupBy = function (arr, fn) { var m = {}; arr.forEach(function (x) { var k = fn(x); (m[k] = m[k] || []).push(x); }); return m; };
  P.sortBy = function (arr, fn) { return arr.slice().sort(function (a, b) { var x = fn(a), y = fn(b); return x < y ? -1 : x > y ? 1 : 0; }); };
  P.sections = function () { var m = {}; P.state.students.forEach(function (s) { if (s.section) m[s.section] = 1; }); return Object.keys(m).sort(); };
  P.logo = function () { return P.state.settings.programLogo || 'icons/pearl-logo.png'; };
  P.loadScript = function (src) { if ((src === 'gas-shim.js' && window.Utilities) || (src === 'demo-server.js' && window.handle_)) return Promise.resolve(); return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }); };

  P.sha = function (text) {
    if (window.crypto && crypto.subtle && window.isSecureContext !== false) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      });
    }
    return (window.Utilities ? Promise.resolve() : P.loadScript('gas-shim.js')).then(function () {
      return Utilities.computeDigest(0, text).map(function (x) { return ('0' + (x < 0 ? x + 256 : x).toString(16)).slice(-2); }).join('');
    });
  };
  P.pinHash = function (lrn, pin) { return P.sha(P.state.salt + '|' + String(lrn) + '|' + String(pin)); };
  P.passHash = function (user, pass) { return P.sha(P.state.salt + '|' + String(user).trim().toLowerCase() + '|' + String(pass)); };
  P.blobToB64 = function (blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob); }); };
  P.b64ToBlob = function (b64, mime) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime || 'audio/webm' }); };


  /* ---------------- icons (inline SVG, work offline) ---------------- */
  var IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    tick: '<path d="m5 12 5 5 9-10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.5 2.3 3.5 5.5"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
    trending: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    upload: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8"/><path d="M12 12v8M9 15l3-3 3 3"/>',
    offline: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-2.5-1.8M2 8.5a15 15 0 0 1 4-2.4M22 8.5A15 15 0 0 0 11 5"/><circle cx="12" cy="20" r="1"/>',
    cap: '<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
    board: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 21h8M7 9h6M7 12h9"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    flame: '<path d="M12 21c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7z"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    pearl: '<circle cx="12" cy="12" r="8"/><path d="M8.5 10a4 4 0 0 1 3.5-3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    words: '<path d="M4 6h10M4 12h16M4 18h7"/>',
    read: '<path d="M2 5c3-1 7-1 10 1 3-2 7-2 10-1v14c-3-1-7-1-10 1-3-2-7-2-10-1z"/><path d="M12 6v14"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a3 3 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'
  };
  P.icon = function (name, size, extra) {
    var s = size || 20;
    return '<svg class="ic ' + (extra || '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || IC.star) + '</svg>';
  };

  /* ---------------- UI helpers ---------------- */
  P.toast = function (msg, type, ms) {
    var el = document.createElement('div'); el.className = 'toast ' + (type || ''); el.textContent = msg;
    P.$('#toast-root').appendChild(el); setTimeout(function () { el.remove(); }, ms || 3200);
  };
  P.modal = function (title, body, opts) {
    opts = opts || {};
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '"><div class="mh"><h3>' + title + '</h3><button class="icon-btn" data-x aria-label="Close">' + P.icon('close', 20) + '</button></div><div class="mb">' + body + '</div>' + (opts.foot ? '<div class="mf">' + opts.foot + '</div>' : '') + '</div>';
    P.$('#modal-root').appendChild(bg);
    var close = function () { bg.remove(); if (opts.onClose) opts.onClose(); };
    bg.addEventListener('click', function (e) { if (e.target === bg && !opts.sticky) close(); if (e.target.closest('[data-x]')) close(); });
    bg.close = close;
    return bg;
  };
  P.confirm = function (msg, okText, danger) {
    return new Promise(function (res) {
      var m = P.modal('Please confirm', '<p>' + msg + '</p>', { foot: '<button class="btn ghost sm" data-no>Cancel</button><button class="btn sm ' + (danger ? 'bad' : '') + '" data-yes>' + (okText || 'Yes') + '</button>', onClose: function () { res(false); } });
      m.querySelector('[data-no]').onclick = function () { m.close(); };
      m.querySelector('[data-yes]').onclick = function () { m.remove(); res(true); };
    });
  };
  P.busy = function (btn, on, text) {
    if (!btn) return; if (on) { btn._t = btn.innerHTML; btn.disabled = true; btn.innerHTML = (text || 'Please wait') + '…'; } else { btn.disabled = false; if (btn._t) btn.innerHTML = btn._t; }
  };
  P.confetti = function (n) {
    var box = document.createElement('div'); box.className = 'confetti';
    var cols = ['#B0306F', '#F59E5B', '#E8B04B', '#1E9A5A', '#0F5E7A', '#F5B9D3'];
    for (var i = 0; i < (n || 90); i++) { var c = document.createElement('i'); c.style.left = Math.random() * 100 + '%'; c.style.background = cols[i % cols.length]; c.style.animationDuration = (1.6 + Math.random() * 1.8) + 's'; c.style.animationDelay = Math.random() * .5 + 's'; box.appendChild(c); }
    document.body.appendChild(box); setTimeout(function () { box.remove(); }, 4200);
  };
  P.speak = function (text, onEnd, rate) {
    if (!('speechSynthesis' in window)) { P.toast('Read-aloud voice is not available on this device.'); return; }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = rate || 0.9;
    var v = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); }); if (v.length) u.voice = v.find(function (x) { return /US|GB|PH/.test(x.lang); }) || v[0];
    if (onEnd) u.onend = onEnd;
    speechSynthesis.speak(u); return u;
  };

  /* ---------------- IndexedDB ---------------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('pearl-app', 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('kv'); d.createObjectStore('outbox', { keyPath: 'id' }); d.createObjectStore('blobs'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out; var r = fn(s);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error('Storage aborted (device storage may be full)')); };
      });
    });
  }
  P.kvGet = function (k) { return tx('kv', 'readonly', function (s) { return s.get(k); }); };
  P.kvSet = function (k, v) { return tx('kv', 'readwrite', function (s) { return s.put(v, k); }); };
  P.kvDel = function (k) { return tx('kv', 'readwrite', function (s) { return s.delete(k); }); };
  P.blobGet = function (k) { return tx('blobs', 'readonly', function (s) { return s.get(k); }); };
  P.blobSet = function (k, v) { return tx('blobs', 'readwrite', function (s) { return s.put(v, k); }); };
  P.blobDel = function (k) { return tx('blobs', 'readwrite', function (s) { return s.delete(k); }); };
  P.outboxAll = function () { return tx('outbox', 'readonly', function (s) { return s.getAll(); }).then(function (a) { return a || []; }); };
  P.outboxPut = function (item) { return tx('outbox', 'readwrite', function (s) { return s.put(item); }); };
  P.outboxDel = function (id) { return tx('outbox', 'readwrite', function (s) { return s.delete(id); }); };

  /* ---------------- connection / API ---------------- */
  P.apiUrl = function () { return localStorage.getItem('pearl_api') || (window.PEARL_CONFIG && PEARL_CONFIG.apiUrl) || ''; };
  P.isDemo = function () { return P.apiUrl() === 'demo'; };

  P.api = function (action, data, timeoutMs) {
    var req = Object.assign({ action: action }, data || {});
    if (P.state.session && P.state.session.token && !req.token) req.token = P.state.session.token;
    if (P.state.viewSy && req.token && req.sy === undefined && ['login', 'info', 'pull', 'closeYear'].indexOf(action) < 0) req.sy = P.state.viewSy;
    if (req.sy === null) delete req.sy;
    if (P.isDemo()) return P.Demo.call(req);
    var url = P.apiUrl();
    if (!url) return Promise.reject(new Error('Not connected to a PEARL database yet.'));
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || 90000);
    return fetch(url, { method: 'POST', body: JSON.stringify(req), signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('Server error ' + r.status); return r.json(); })
      .then(function (j) {
        if (j && j.auth === false && P.state.session && P.state.session.role === 'teacher') { P.toast('Session expired. Please log in again.', 'bad'); }
        if (!j.ok) { var e = new Error(j.error || 'Request failed'); e.server = true; throw e; }
        return j;
      }, function (err) { clearTimeout(to); if (err.server) throw err; var e = new Error(err.name === 'AbortError' ? 'The connection timed out.' : (navigator.onLine ? 'Cannot reach the PEARL database. Open your Web App link in a browser: it must show {"ok":true…}. In Apps Script, check Deploy → Manage deployments → Who has access: Anyone, then deploy a New version.' : 'No internet connection.')); e.network = true; e.db = navigator.onLine; throw e; });
  };

  /* ---------------- data cache ---------------- */
  P.loadCache = function () {
    return Promise.all(['settings', 'students', 'lessons', 'assessments', 'users', 'stamps', 'salt', 'session', 'lastSync'].map(function (k) { return P.kvGet(k); }))
      .then(function (v) {
        var s = P.state;
        if (v[0]) s.settings = Object.assign({}, P.DEFAULT_SETTINGS, v[0]);
        s.students = v[1] || []; s.lessons = v[2] || []; s.assessments = v[3] || []; s.users = v[4] || [];
        s.stamps = v[5] || {}; s.salt = v[6] || ''; s.session = v[7] || null; s.lastSync = v[8] || '';
        return P.refreshPending();
      });
  };
  P.saveSession = function (sess) { P.state.session = sess; return sess ? P.kvSet('session', sess) : P.kvDel('session'); };

  P.applyPull = function (res) {
    var s = P.state, jobs = [];
    if (res.salt) { s.salt = res.salt; jobs.push(P.kvSet('salt', res.salt)); }
    if (res.settings) { s.settings = Object.assign({}, P.DEFAULT_SETTINGS, res.settings); jobs.push(P.kvSet('settings', res.settings)); }
    if (res.students) { s.students = res.students; jobs.push(P.kvSet('students', res.students)); }
    if (res.lessons) { s.lessons = res.lessons; jobs.push(P.kvSet('lessons', res.lessons)); }
    if (res.assessments) { s.assessments = res.assessments; jobs.push(P.kvSet('assessments', res.assessments)); }
    if (res.users) { s.users = res.users; jobs.push(P.kvSet('users', res.users)); }
    if (res.stamps) {
      // only remember stamps for collections we actually received (users only for admins)
      var st = Object.assign({}, s.stamps);
      ['settings', 'students', 'lessons', 'assessments', 'users'].forEach(function (k) { if (res[k] !== undefined || st[k] === res.stamps[k]) st[k] = res.stamps[k]; });
      s.stamps = st; jobs.push(P.kvSet('stamps', st));
    }
    s.lastSync = new Date().toISOString(); jobs.push(P.kvSet('lastSync', s.lastSync));
    return Promise.all(jobs);
  };

  P.pull = function (force) {
    return P.api('pull', { have: force ? {} : P.state.stamps }).then(function (res) { return P.applyPull(res).then(function () { return res; }); });
  };

  /* ---------------- outbox (offline queue) ---------------- */
  P.refreshPending = function () { return P.outboxAll().then(function (a) { P.state.pending = a.length; P.emit('sync'); return a; }); };
  P.queue = function (kind, payload, blobs) {
    var item = { id: payload.rec.id, kind: kind, payload: payload, blobs: blobs || [], createdAt: new Date().toISOString(), tries: 0 };
    return P.outboxPut(item).then(P.refreshPending).then(function () { P.syncSoon(300); return item; });
  };

  var flushing = null;
  P.flush = function () {
    if (flushing) return flushing;
    flushing = P.outboxAll().then(function (items) {
      items.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
      var done = 0, failed = 0, lastErr = null;
      return items.reduce(function (pr, it) {
        return pr.then(function () {
          if (lastErr && lastErr.network) return; // stop trying when offline
          var p = Object.assign({}, it.payload);
          return Promise.all((it.blobs || []).map(function (b) { return P.blobGet(b.key).then(function (blob) { return blob ? P.blobToB64(blob).then(function (b64) { return { itemId: b.itemId, b64: b64, mime: blob.type || b.mime }; }) : null; }); }))
            .then(function (arr) {
              arr = arr.filter(Boolean);
              if (it.kind === 'daily') { if (arr[0]) p.audio = { b64: arr[0].b64, mime: arr[0].mime }; return P.api('submitDaily', p, 180000); }
              p.audios = arr; return P.api('submitResult', p, 180000);
            })
            .then(function (res) {
              done++;
              return P.markSynced(it, res.syncedAt || new Date().toISOString()).then(function () { return P.outboxDel(it.id); });
            }, function (err) {
              failed++; lastErr = err; it.tries = (it.tries || 0) + 1; it.lastError = err.message; it.lastTry = new Date().toISOString();
              return P.outboxPut(it);
            });
        });
      }, Promise.resolve()).then(function () { return { done: done, failed: failed, error: lastErr }; });
    }).then(function (r) { flushing = null; return P.refreshPending().then(function () { return r; }); }, function (e) { flushing = null; throw e; });
    return flushing;
  };
  P.markSynced = function (it, at) {
    var lrn = it.payload.lrn;
    return P.getProgress(lrn).then(function (pg) {
      var r = it.payload.rec;
      if (it.kind === 'daily' && pg.lessons[r.lessonId]) pg.lessons[r.lessonId].syncedAt = at;
      if (it.kind === 'result' && pg.results[r.assessmentId]) pg.results[r.assessmentId].syncedAt = at;
      return P.setProgress(lrn, pg);
    });
  };

  var syncT = null, backoff = 5000;
  P.syncSoon = function (ms) { clearTimeout(syncT); syncT = setTimeout(function () { P.sync({ silent: true }); }, ms || 1000); };
  P.sync = function (opt) {
    opt = opt || {};
    if (P.state.syncing) return Promise.resolve();
    if (!P.apiUrl()) return Promise.resolve();
    P.state.syncing = true; P.emit('sync');
    var out = {};
    return P.flush().then(function (r) {
      out.flush = r;
      if (r.error && r.error.network) throw r.error;
      return P.flushEvents().catch(function () { }).then(function () { return P.checkBind(); }).then(function () {
        if (P.state.viewSy) return; // viewing a past school year: keep its data on screen
        return P.pull(opt.force).catch(function (e) { if (e.network) throw e; out.pullError = e; });
      });
    }).then(function () {
      P.state.online = true; P.state.dbDown = false; backoff = 5000;
      if (!opt.silent) {
        if (out.flush.failed) P.toast(out.flush.failed + ' item(s) could not upload yet: ' + (out.flush.error && out.flush.error.message), 'bad', 5000);
        else P.toast('All data is synced ✓', 'ok');
      }
      if (out.flush.done) P.emit('uploaded', out.flush);
    }).catch(function (e) {
      if (e.network) { P.state.online = false; P.state.dbDown = !!e.db; }
      if (!opt.silent) P.toast(e.message + (P.state.pending ? ' Your work is saved on this device and will upload later.' : ''), 'bad', 5000);
      backoff = Math.min(backoff * 2, 5 * 60000);
    }).then(function () {
      P.state.syncing = false; P.emit('sync');
      if (P.state.pending) P.syncSoon(backoff + Math.random() * 4000); // jitter spreads 400 devices
    });
  };
  window.addEventListener('online', function () { P.state.online = true; P.emit('sync'); P.syncSoon(1500 + Math.random() * 5000); });
  window.addEventListener('offline', function () { P.state.online = false; P.emit('sync'); });

  /* a learner who logged in offline on a new phone is registered (or rejected) at the next sync */
  P.checkBind = function () {
    var s = P.state.session;
    if (!s || s.role !== 'student' || s.bound) return Promise.resolve();
    return P.api('bindDevice', { lrn: s.lrn, pinHash: s.pinHash, device: P.deviceId(), info: P.deviceInfo() }).then(function () {
      s.bound = true; return P.saveSession(s);
    }, function (e) {
      if (e.network) return;
      if (/another phone|already registered/i.test(e.message)) { P.saveSession(null).then(function () { P.go('home', {}, true); P.modal('Account locked to another phone', '<p>' + P.esc(e.message) + '</p>'); }); }
    });
  };

  /* ---------------- tiny event bus ---------------- */
  var ev = {};
  P.on = function (n, fn) { (ev[n] = ev[n] || []).push(fn); return function () { ev[n] = (ev[n] || []).filter(function (f) { return f !== fn; }); }; };
  P.emit = function (n, d) { (ev[n] || []).forEach(function (f) { try { f(d); } catch (e) { console.error(e); } }); };

  P.syncChip = function () {
    var s = P.state, cls = 'ok', txt = P.icon('check', 15) + 'Synced';
    if (P.isDemo()) { cls = 'pend'; txt = P.icon('star', 15) + 'Demo'; }
    if (s.syncing) { cls = 'pend'; txt = P.icon('refresh', 15, 'spin') + 'Syncing'; }
    else if (s.pending) { cls = 'pend'; txt = P.icon('upload', 15) + s.pending + ' to upload'; }
    else if (!s.online && s.dbDown) { cls = 'off'; txt = P.icon('alert', 15) + 'Database not reachable'; }
    else if (!s.online) { cls = 'off'; txt = P.icon('offline', 15) + 'Offline'; }
    return '<button class="sync ' + cls + '" data-sync title="Last sync: ' + P.esc(P.fmtDate(s.lastSync, true)) + '">' + txt + '</button>';
  };
  P.on('sync', function () { P.$$('[data-sync]').forEach(function (b) { b.outerHTML = P.syncChip(); }); });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-sync]')) P.sync({ force: false }); });

  /* ---------------- student progress (local) ---------------- */
  P.pgKey = function (lrn) { var y = P.state.settings.syId; return 'progress:' + (y ? y + ':' : '') + lrn; }; // progress is kept per school year
  P.getProgress = function (lrn) { return P.kvGet(P.pgKey(lrn)).then(function (p) { p = p || {}; p.lessons = p.lessons || {}; p.results = p.results || {}; p.drafts = p.drafts || {}; p.badges = p.badges || {}; return p; }); };
  P.setProgress = function (lrn, p) { return P.kvSet(P.pgKey(lrn), p); };

  /* ---------------- checking assignments (same rules as pickCheckers_ in Code.gs) ---------------- */
  P.sectionTeachers = function (section) {
    var k = String(section || '').trim().toLowerCase();
    return (P.state.users || []).filter(function (u) {
      if (u.active === false) return false;
      var secs = String(u.sections || '').split(',').map(function (x) { return x.trim().toLowerCase(); });
      return secs.indexOf('all') < 0 && secs.indexOf(k) >= 0;
    }).map(function (u) { return u.username; }).sort();
  };
  P.pickCheckers = function (cfg, tlist, learner, level, day) {
    if (!tlist || tlist.length < 2 || !cfg || !cfg.mode || cfg.mode === 'shared') return tlist || [];
    var map = cfg.map || {}, out = [];
    if (cfg.mode === 'level') out = tlist.filter(function (u) { return (map[u] || []).indexOf(level) >= 0; });
    else if (cfg.mode === 'name') {
      var ch = String(learner && learner.last || '').trim().charAt(0).toUpperCase();
      out = tlist.filter(function (u) { var rg = String(map[u] || '').toUpperCase().replace(/[^A-Z-]/g, '').split('-'); return rg[0] && ch >= rg[0] && ch <= (rg[1] || rg[0]); });
    } else if (cfg.mode === 'day') {
      if (!day) return tlist;
      var order = (cfg.order || []).filter(function (u) { return tlist.indexOf(u) >= 0; });
      tlist.forEach(function (u) { if (order.indexOf(u) < 0) order.push(u); });
      out = [order[(Number(day) - 1) % order.length]];
    }
    return out.length ? out : tlist;
  };
  P.assignees = function (learner, level, day) {
    if (!learner) return [];
    var k = String(learner.section || '').trim().toLowerCase();
    return P.pickCheckers((P.state.settings.checkSplit || {})[k], P.sectionTeachers(learner.section), learner, level || learner.level, day);
  };
  P.userName = function (u) { var x = (P.state.users || []).find(function (y) { return y.username === u; }); return x ? x.name : u; };

  /* ---------------- lessons ---------------- */
  P.lessonsFor = function (level) { return P.sortBy(P.state.lessons.filter(function (l) { return l.level === level && (l.kind || 'daily') === 'daily'; }), function (l) { return Number(l.day) || 0; }); };
  P.extrasFor = function (level) { return P.state.lessons.filter(function (l) { return l.kind === 'extra' && (l.level === level || l.level === 'ALL'); }); };
  P.lessonById = function (id) { return P.state.lessons.find(function (l) { return l.id === id; }); };

  /* ---------------- scoring helpers for teachers ---------------- */
  P.assessmentItems = function (A) { var out = []; (A.sections || []).forEach(function (s, si) { (s.items || []).forEach(function (it) { out.push(Object.assign({ section: si }, it)); }); }); return out; };
  P.resultPct = function (r, A) {
    var items = A ? P.assessmentItems(A) : [];
    var total = items.length ? P.sum(items.map(function (i) { return Number(i.pts) || 1; })) : (Number(r.autoTotal) + Number(r.manualPending || 0));
    var manual = r.grade ? P.sum(Object.keys(r.grade.scores || {}).map(function (k) { return r.grade.scores[k]; })) : 0;
    var score = Number(r.autoScore || 0) + manual;
    return { score: score, total: total, pct: total ? Math.round(score / total * 100) : 0, pendingManual: Number(r.manualPending || 0) > 0 && !r.grade };
  };

  /* ---------------- DEMO MODE ---------------- */
  P.Demo = {
    ready: null,
    init: function () {
      if (this.ready) return this.ready;
      this.ready = P.loadScript('gas-shim.js').then(function () { return P.loadScript('demo-server.js'); }).then(function () {
        var info = handle_({ action: 'info' });
        if (info.needsSetup) P.Demo.seed(info.salt);
      });
      return this.ready;
    },
    call: function (req) {
      return P.Demo.init().then(function () {
        return new Promise(function (res, rej) {
          setTimeout(function () {
            var out = JSON.parse(JSON.stringify(handle_(JSON.parse(JSON.stringify(req)))));
            if (!out.ok) { var e = new Error(out.error); e.server = true; rej(e); } else res(out);
          }, 120);
        });
      });
    },
    seed: function (salt) {
      var H = function (s) { return sha_(s); };
      var st = handle_({ action: 'setup', admin: { username: 'demo', name: 'Demo Coordinator', passHash: H(salt + '|demo|demo1234') }, settings: { schoolYear: '2025–2026' } });
      var T = st.token;
      handle_({ action: 'saveLessons', token: T, lessons: window.PEARL_DEFAULT_LESSONS, replaceAll: true });
      var As = JSON.parse(JSON.stringify(window.PEARL_DEFAULT_ASSESSMENTS)); As[0].open = true; As[2].open = true;
      handle_({ action: 'saveAssessment', token: T, assessments: As });
      // last school year (archived): a few graduates with their work, so the School year menu has a past year to open
      var old = ['Ramos', 'Tan', 'Lim', 'Uy', 'Go', 'Sy'].map(function (ln, i) { return { lrn: '1268' + ('00000000' + (52000 + i * 11)).slice(-8), first: ['Paula', 'Ken', 'Mika', 'Jun', 'Ella', 'Rey'][i], last: ln, middle: '', sex: i % 2 ? 'M' : 'F', grade: '12', section: '12-HUMSS', level: ['Beginner', 'Intermediate', 'Advanced'][i % 3] }; });
      handle_({ action: 'saveStudents', token: T, students: old });
      var past = new Date(); past.setDate(past.getDate() - 300);
      old.forEach(function (s, i) {
        var pin = H(salt + '|' + s.lrn + '|' + s.lrn.slice(-4));
        for (var d = 1; d <= 8 + i * 4; d++) handle_({ action: 'submitDaily', lrn: s.lrn, pinHash: pin, rec: { id: 'old-' + i + '-' + d, level: s.level, day: d, lessonId: s.level.charAt(0) + '-' + ('0' + d).slice(-2), title: 'Day ' + d, score: 2 + (i + d) % 4, total: 5, written: ['I learned something new today.'], wordCount: 20, audioStatus: 'recorded', audioSec: 60, completedAt: new Date(past.getTime() + d * 864e5).toISOString() } });
        handle_({ action: 'submitResult', lrn: s.lrn, pinHash: pin, rec: { id: 'oldpre-' + i, assessmentId: 'PRE-SAMPLE', title: 'PEARL Pre-Test (Sample)', type: 'pre', autoScore: 10 + i, autoTotal: 35, manualPending: 0, level: s.level, completedAt: past.toISOString() } });
      });
      handle_({ action: 'closeYear', token: T, newSy: '2026–2027', keep: 'none' });
      handle_({ action: 'saveSettings', token: T, settings: { releasedDay: 40 } });
      handle_({ action: 'saveAssessment', token: T, assessments: [As[0], As[2]] }); // tests are closed at year start; reopen the samples for the demo
      var firsts = ['Angel', 'Mark', 'Jhon', 'Kyla', 'Bea', 'Carlo', 'Princess', 'Ralph', 'Jasmine', 'Kenneth', 'Mae', 'Joshua', 'Rica', 'Paolo', 'Lovely', 'Jericho', 'Trisha', 'Vince', 'Nicole', 'Aldrin', 'Shaira', 'Ivan', 'Cherry', 'Ronnel', 'Hazel', 'Dexter', 'Grace', 'Jomar', 'Kim', 'Rose'];
      var lasts = ['Abella', 'Bautista', 'Cabahug', 'Dalisay', 'Escaño', 'Flores', 'Gonzaga', 'Hilario', 'Ibañez', 'Jumawan', 'Lumapas', 'Macalisang', 'Navarro', 'Ompad', 'Pacatang', 'Quiñones', 'Rosales', 'Sumalinog', 'Tumulak', 'Ubas', 'Villanueva', 'Yap', 'Zamora', 'Alcantara', 'Borres', 'Cuizon', 'Dumdum', 'Gallardo', 'Lagura', 'Sarmiento'];
      var secs = ['11-HUMSS A', '11-TVL HE', '12-STEM', '12-TVL ICT'], levels = ['Beginner', 'Beginner', 'Beginner', 'Intermediate', 'Intermediate', 'Advanced'];
      var students = firsts.map(function (f, i) { return { lrn: '1278' + ('00000000' + (31000 + i * 37)).slice(-8), first: f, last: lasts[i], middle: '', sex: i % 2 ? 'M' : 'F', grade: secs[i % 4].slice(0, 2), section: secs[i % 4], level: levels[i % 6] }; });
      students.push({ lrn: '123456789012', first: 'Juan', last: 'Dela Cruz', middle: 'Santos', sex: 'M', grade: '11', section: '11-HUMSS A', level: 'Beginner' });
      handle_({ action: 'saveStudents', token: T, students: students });
      var base = new Date(), seeded = []; base.setHours(7, 30, 0, 0);
      students.slice(0, 30).forEach(function (s, i) {
        var pin = H(salt + '|' + s.lrn + '|' + s.lrn.slice(-4)), done = 3 + (i * 7) % 6, skill = 0.45 + (i % 5) * 0.11;
        for (var d = 1; d <= done; d++) {
          var when = new Date(base.getTime() - (8 - d) * 864e5 + (i * 3 + d * 5) * 60000);
          var score = Math.max(1, Math.min(5, Math.round(5 * (skill + d * 0.035) + ((i + d) % 3 - 1) * 0.6)));
          var lid = s.level.charAt(0) + '-' + ('0' + d).slice(-2), L = (window.PEARL_DEFAULT_LESSONS || []).find(function (x) { return x.id === lid; }) || { discussion: [], vocab: [] };
          var vw = (L.vocab || []).map(function (v) { return v.word.toLowerCase(); });
          var written = (L.discussion || []).map(function (q, k) {
            var t = (i * 3 + d + k) % 7, w1 = vw[(i + k) % Math.max(1, vw.length)] || 'learn', w2 = vw[(i + k + 2) % Math.max(1, vw.length)] || 'read';
            var core = q.replace(/\?$/, '').replace(/^(why|how|what|do|does|is|are|where|when|which|who|can|should|would)\s+/i, '').toLowerCase();
            return [
              'In my opinion, ' + core + ' matters to me because I want to ' + w1 + ' and grow every day. For example, my classmates and I talk about it after class.',
              'I think ' + core + ' is important. When I ' + w1 + ' something new, I feel more ' + w2 + ' and confident.',
              'i think ' + core + ' because it is good',
              'Based on the article, ' + core + ' can change how we live. I agree, and I will try to ' + w1 + ' more carefully at home and in school.',
              'For me, ' + core + ' is about being honest and careful. The word ' + w2 + ' reminds me to think before I act.',
              'Yes. ' + core + '.',
              'This is important because people need to ' + w1 + ' and ' + w2 + '. My family taught me this when I was young, and I still believe it today.'
            ][t];
          });
          var ac = window.PEARL_CHECK ? PEARL_CHECK.writing(L, written, s.level === 'Beginner' ? 8 : s.level === 'Intermediate' ? 15 : 25) : null; if (ac) delete ac.items;
          seeded.push({ id: 'seed-' + i + '-' + d, section: s.section, score: score, ac: ac });
          handle_({ action: 'submitDaily', lrn: s.lrn, pinHash: pin, rec: { id: 'seed-' + i + '-' + d, level: s.level, day: d, lessonId: lid, title: L.title || 'Day ' + d, score: score, total: 5, quiz: [], written: written, autoCheck: ac, wordCount: written.join(' ').split(/\s+/).length, vocabUsed: ac ? ac.used : [], reflection: { clear: 1 + (i % 3), smooth: 1 + ((i + d) % 3), words: 2 }, audioStatus: (i + d) % 6 ? 'recorded' : 'live', audioSec: 45 + (i * 5) % 50, completedAt: when.toISOString() } });
        }
        if (i < 26) handle_({ action: 'bindDevice', lrn: s.lrn, pinHash: pin, device: 'PH-DEMO' + (100 + i), info: ['Samsung A14', 'Redmi 12C', 'Vivo Y17s', 'OPPO A58', 'realme C55'][i % 5] + ' · Android 13 · Chrome' });
        var evs = [];
        if (i % 4 === 1) for (var k = 0; k < 1 + i % 5; k++) evs.push({ at: new Date(base.getTime() - k * 864e5).toISOString(), lrn: s.lrn, pinHash: pin, device: 'PH-DEMO' + (100 + i), event: 'left-app', detail: 'Day ' + (k + 1) + ' ' + s.level + ' (' + (k + 1) + 'x)' });
        if (i === 7) evs.push({ at: base.toISOString(), lrn: s.lrn, pinHash: pin, device: 'PH-DEMO' + (100 + i), event: 'screenshot-key', detail: 'Day 3 ' + s.level });
        if (evs.length) handle_({ action: 'logEvents', events: evs });
        var pre = Math.round(30 * (skill - 0.15)), post = Math.min(30, pre + 3 + i % 7);
        handle_({ action: 'submitResult', lrn: s.lrn, pinHash: pin, rec: { id: 'pre-' + i, assessmentId: 'PRE-SAMPLE', title: 'PEARL Pre-Test (Sample)', type: 'pre', autoScore: pre, autoTotal: 35, manualPending: 0, level: s.level, completedAt: new Date(base.getTime() - 20 * 864e5).toISOString() } });
        if (i % 3 !== 0) handle_({ action: 'submitResult', lrn: s.lrn, pinHash: pin, rec: { id: 'post-' + i, assessmentId: 'POST-SAMPLE', title: 'PEARL Post-Test (Sample)', type: 'post', autoScore: post, autoTotal: 35, manualPending: 0, level: s.level, completedAt: new Date().toISOString() } });
      });
      // demo teachers: assigned sections and some checking already done (Teachers & Recognition)
      [['msantos', 'Maria Santos', '11-HUMSS A', 0.9, 1], ['jreyes', 'Jose Reyes', '11-TVL HE', 0.55, 0], ['acruz', 'Ana Cruz', '12-STEM', 1, 1]].forEach(function (t) {
        handle_({ action: 'saveUser', token: T, user: { username: t[0], name: t[1], role: 'teacher', sections: t[2], passHash: H(salt + '|' + t[0] + '|teach1234') } });
        var tok = handle_({ action: 'login', username: t[0], passHash: H(salt + '|' + t[0] + '|teach1234') }).token;
        var mine = seeded.filter(function (x) { return x.section === t[2]; }), n = Math.round(mine.length * t[3]);
        handle_({ action: 'gradeMany', token: tok, items: mine.slice(0, n).map(function (x, k) { return { recId: x.id, kind: 'daily', grade: { writingScore: x.ac ? x.ac.total : 9, writingMax: 12, stars: Math.max(1, x.score), comment: t[4] && k % 2 ? 'Good work! Try to use more of the new words next time.' : (t[4] ? 'Excellent! Your answers are clear and complete.' : ''), auto: !t[4] } }; }) });
      });
      // two teachers share 11-HUMSS A: the checking is split by learners' last names
      handle_({ action: 'saveUser', token: T, user: { username: 'lgarcia', name: 'Liza Garcia', role: 'teacher', sections: '11-HUMSS A', passHash: H(salt + '|lgarcia|teach1234') } });
      handle_({ action: 'saveSettings', token: T, settings: { checkSplit: { '11-humss a': { mode: 'name', map: { msantos: 'A-M', lgarcia: 'N-Z' }, order: ['lgarcia', 'msantos'] } } } });
      // a learner who tried to log in on a classmate's phone (shows in the Security tab)
      var s26 = students[26], s3 = students[3];
      handle_({ action: 'bindDevice', lrn: s26.lrn, pinHash: H(salt + '|' + s26.lrn + '|' + s26.lrn.slice(-4)), device: 'PH-DEMO103', info: 'OPPO A58 · Android 13 · Chrome' });
      handle_({ action: 'logEvents', events: [{ at: base.toISOString(), lrn: s3.lrn, pinHash: H(salt + '|' + s3.lrn + '|' + s3.lrn.slice(-4)), device: 'PH-DEMO126', event: 'blocked-other-phone', detail: 'Registered phone …MO103' }] });
    },
    reset: function () { if (window.PEARL_DEMO_RESET) PEARL_DEMO_RESET(); }
  };
})();
