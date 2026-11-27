/* PEARL App — boot, routing, landing, connection, setup and logins */
(function () {
  'use strict';
  var P = window.P, esc = P.esc;
  P.views = P.views || {};
  P.views.notFound = function () { P.$('#app').innerHTML = '<div class="narrow"><div class="card">Page not found. <button class="btn sm" onclick="P.go(\'home\')">Home</button></div></div>'; };
  var current = null;

  P.go = function (view, params, replace) {
    var st = { v: view, p: params || {} };
    if (replace) history.replaceState(st, ''); else history.pushState(st, '');
    render(st);
  };
  function render(st) {
    if (P.cleanup) { try { P.cleanup(); } catch (e) { } P.cleanup = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    current = st; window.scrollTo(0, 0);
    var fn = P.views[st.v] || P.views.notFound;
    try { fn(st.p || {}); } catch (e) { console.error(e); P.$('#app').innerHTML = '<div class="narrow"><div class="card"><h3>Something went wrong</h3><p class="muted">' + esc(e.message) + '</p><button class="btn" onclick="P.go(\'home\')">Back to start</button></div></div>'; }
  }
  P.rerender = function () { if (current) render(current); };
  window.addEventListener('popstate', function (e) { if (e.state && e.state.v) render(e.state); else render({ v: 'home' }); });

  P.credit = function () {
    var s = P.state.settings;
    return '<div class="credit">' + esc(s.appName) + ' App v' + P.VERSION + ' · ' + esc(s.programFull) + '<br>Developed by <b>' + esc(P.DEV) + '</b>, Samal Senior High School' + (/samal senior high/i.test(s.schoolName) ? '' : ' · Used by ' + esc(s.schoolName)) + '</div>';
  };

  /* ---------- landing ---------- */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; var b = P.$('[data-install]'); if (b) b.classList.remove('hide'); });

  P.views.home = function () {
    var s = P.state.settings, st = P.state;
    if (!P.apiUrl()) return P.go('connect', {}, true);
    if (session()) return;
    var ready = st.lessons.length ? (st.lessons.length + ' lessons · ' + st.students.length + ' learners ready offline') : 'Not yet downloaded for offline use';
    P.$('#app').innerHTML = '<div class="land"><div class="land-top">' +
      '<div class="land-logos">' + (s.depedSeal ? '<img src="' + esc(s.depedSeal) + '" alt="DepEd seal">' : '') + '<img class="main" src="' + esc(P.logo()) + '" alt="Program logo">' + (s.schoolLogo ? '<img src="' + esc(s.schoolLogo) + '" alt="School logo">' : '') + '</div>' +
      '<div class="school">' + esc(s.schoolName) + '</div><h1>' + esc(s.appName) + '</h1><div class="prog">' + esc(s.programFull) + '</div><div class="tagline">“' + esc(s.tagline) + '”</div></div>' +
      '<div class="land-body"><div class="role-cards"><div class="role" data-r="student"><div class="e">' + P.icon('cap', 32) + '</div><b>Learner</b><span class="small muted">Read, answer, write & speak</span></div>' +
      '<div class="role t" data-r="teacher"><div class="e">' + P.icon('board', 32) + '</div><b>Teacher</b><span class="small muted">Monitor, check & assess</span></div></div>' +
      '<div class="card flat status-card small"><div class="row" style="justify-content:center">' + P.syncChip() + '<span class="muted">' + esc(ready) + '</span></div>' +
      '<div class="row" style="justify-content:center"><button class="btn soft sm" data-dl>' + P.icon('download', 16) + ' Update data</button><button class="btn soft sm hide" data-install>' + P.icon('phone', 16) + ' Install app</button><button class="btn ghost sm" data-conn>' + P.icon('link', 16) + ' Connection</button></div></div>' +
      (P.isDemo() ? '<div class="note info" style="margin-top:12px"><b>Demo mode.</b> Learner: LRN <span class="kbd">123456789012</span> PIN <span class="kbd">9012</span>. Teacher: <span class="kbd">demo</span> / <span class="kbd">demo1234</span>. Data stays on this device only.</div>' : '') +
      '</div>' + P.credit() + '</div>';
    P.$$('.role').forEach(function (el) { el.onclick = function () { P.go(el.dataset.r === 'student' ? 'studentLogin' : 'teacherLogin'); }; });
    P.$('[data-conn]').onclick = function () { P.go('connect'); };
    if (installEvt) P.$('[data-install]').classList.remove('hide');
    P.$('[data-install]').onclick = function () { if (installEvt) { installEvt.prompt(); installEvt = null; } };
    P.$('[data-dl]').onclick = function (e) {
      var b = e.currentTarget; P.busy(b, true, 'Downloading');
      P.sync({ force: true }).then(function () { P.busy(b, false); P.rerender(); });
    };
  };
  function session() {
    var s = P.state.session;
    if (!s) return false;
    if (s.role === 'student' && P.state.students.some(function (x) { return x.lrn === s.lrn; })) { P.go('student', {}, true); return true; }
    if (s.role === 'teacher') { P.go('teacher', {}, true); return true; }
    return false;
  }

  /* ---------- connection ---------- */
  P.views.connect = function () {
    var cur = P.apiUrl();
    P.$('#app').innerHTML = '<div class="auth-top"><img src="' + esc(P.logo()) + '" alt=""><h2>Connect to your school\'s PEARL database</h2><p class="small">Paste the Web App URL of your school\'s Google Apps Script deployment.<br>Your teacher or coordinator will give this to you (or a link that sets it automatically).</p></div>' +
      '<div class="auth-card"><div class="card"><label class="f">Web App URL</label><input class="in" id="u" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(cur === 'demo' ? '' : cur) + '">' +
      '<div class="row" style="margin-top:12px"><button class="btn grow" id="go">Connect</button></div><p class="small muted" id="msg"></p></div>' +
      '<div class="card flat center" style="margin-top:12px"><p class="small">Just looking around? Try the app with sample data. Nothing is uploaded.</p><button class="btn gold" id="demo">✨ Try Demo Mode</button></div>' +
      (cur ? '<p class="center"><button class="btn ghost sm" id="back">← Back</button></p>' : '') + '</div>' + P.credit();
    P.$('#go').onclick = function (e) {
      var u = P.$('#u').value.trim(), b = e.currentTarget, msg = P.$('#msg');
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u)) { msg.textContent = 'That does not look like an Apps Script Web App URL (it should start with https://script.google.com/macros/s/…).'; return; }
      P.busy(b, true, 'Connecting'); var old = localStorage.getItem('pearl_api'); localStorage.setItem('pearl_api', u);
      P.api('info').then(function (info) {
        return resetLocal().then(function () { P.state.salt = info.salt; return P.kvSet('salt', info.salt); }).then(function () {
          if (info.needsSetup) return P.go('setup', {}, true);
          return P.sync({ force: true, silent: true }).then(function () { P.toast('Connected to ' + ((info.settings || {}).schoolName || 'your school') + ' ✓', 'ok'); P.go('home', {}, true); });
        });
      }).catch(function (err) { if (old) localStorage.setItem('pearl_api', old); else localStorage.removeItem('pearl_api'); P.busy(b, false); msg.innerHTML = '<b>Could not connect.</b> ' + esc(err.message) + '<br><span class="tiny">Checklist: the link ends in <b>/exec</b> · Deploy → Manage deployments → Who has access: <b>Anyone</b> · deploy a <b>New version</b> after pasting Code.gs.</span>'; });
    };
    P.$('#demo').onclick = function (e) {
      P.busy(e.currentTarget, true, 'Preparing demo');
      localStorage.setItem('pearl_api', 'demo');
      resetLocal().then(function () { return P.Demo.init(); }).then(function () { return P.sync({ force: true, silent: true }); }).then(function () { P.go('home', {}, true); });
    };
    var bk = P.$('#back'); if (bk) bk.onclick = function () { history.back(); };
  };
  function resetLocal() {
    var s = P.state; s.settings = Object.assign({}, P.DEFAULT_SETTINGS); s.students = []; s.lessons = []; s.assessments = []; s.users = []; s.stamps = {}; s.session = null;
    return Promise.all(['settings', 'students', 'lessons', 'assessments', 'users', 'stamps', 'session', 'dash', 'lastSync'].map(P.kvDel));
  }
  P.resetLocal = resetLocal;

  /* ---------- first-time setup ---------- */
  P.views.setup = function () {
    var d = P.DEFAULT_SETTINGS;
    P.$('#app').innerHTML = '<div class="auth-top"><img src="icons/pearl-logo.png" alt=""><h2>Welcome! Let\'s set up your school</h2><p class="small">This is a new, empty PEARL database. Create the Program Coordinator (admin) account. You can change everything later in Settings.</p></div>' +
      '<div class="auth-card" style="max-width:560px"><div class="card stack"><h3>School</h3>' +
      fld('schoolName', 'School name', d.schoolName) + fld('schoolId', 'School ID', '') + fld('schoolAddress', 'School address', d.schoolAddress) +
      '<div class="grid g2">' + fld('region', 'Region', d.region) + fld('division', 'Schools Division', d.division) + '</div>' + fld('schoolYear', 'School Year', d.schoolYear) + '</div>' +
      '<div class="card stack" style="margin-top:12px"><h3>Coordinator account</h3>' + fld('name', 'Full name', '') + fld('username', 'Username', '') +
      '<div class="field"><label class="f">Password (at least 6 characters)</label><input class="in" type="password" id="pw"></div>' +
      '<label class="check"><input type="checkbox" id="seed" checked> Load the 120 PEARL lessons (Beginner, Intermediate, Advanced · Weeks 1–8) and sample tests</label>' +
      '<button class="btn block lg" id="go">Create & Start</button><p class="small muted" id="msg"></p></div></div>' + P.credit();
    function fld(id, label, val) { return '<div class="field"><label class="f">' + label + '</label><input class="in" id="' + id + '" value="' + esc(val) + '"></div>'; }
    P.$('#go').onclick = function (e) {
      var v = function (id) { return P.$('#' + id).value.trim(); }, b = e.currentTarget, msg = P.$('#msg');
      if (!v('username') || P.$('#pw').value.length < 6) { msg.textContent = 'Please enter a username and a password of at least 6 characters.'; return; }
      P.busy(b, true, 'Setting up');
      var settings = { schoolName: v('schoolName'), schoolId: v('schoolId'), schoolAddress: v('schoolAddress'), region: v('region'), division: v('division'), schoolYear: v('schoolYear'), coordinator: v('name') };
      P.passHash(v('username'), P.$('#pw').value).then(function (h) {
        return P.api('setup', { admin: { username: v('username'), name: v('name') || v('username'), passHash: h }, settings: settings });
      }).then(function (res) {
        return P.saveSession({ role: 'teacher', token: res.token, user: res.user }).then(function () {
          if (!P.$('#seed').checked) return;
          msg.textContent = 'Loading lessons…';
          return P.api('saveLessons', { lessons: window.PEARL_DEFAULT_LESSONS, replaceAll: true }, 180000).then(function () { return P.api('saveAssessment', { assessments: window.PEARL_DEFAULT_ASSESSMENTS }); });
        });
      }).then(function () { return P.sync({ force: true, silent: true }); }).then(function () { P.toast('Your PEARL database is ready!', 'ok'); P.go('teacher', {}, true); })
        .catch(function (err) { P.busy(b, false); msg.textContent = err.message; });
    };
  };

  function authTop(title, sub) {
    return '<div class="auth-top"><button class="icon-btn back" onclick="history.back()" aria-label="Back">' + P.icon('back', 22) + '</button><img src="' + esc(P.logo()) + '" alt=""><h2>' + title + '</h2><p>' + sub + '</p></div>';
  }
  P.authTop = authTop;

  /* ---------- student login ---------- */
  P.views.studentLogin = function () {
    var s = P.state.settings;
    P.$('#app').innerHTML = authTop('Hello, Learner!', 'Log in with your LRN and PIN') + '<div class="auth-card">' +
      '<div class="card stack"><div class="field"><label class="f">LRN (Learner Reference Number)</label><input class="in big" id="lrn" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="12-digit LRN"></div>' +
      '<div class="field"><label class="f">PIN</label><input class="in big" id="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" placeholder="••••"></div>' +
      '<button class="btn block lg" id="go">Start reading</button><p class="small muted center" id="msg">First time? Your PIN is the last 4 digits of your LRN unless your teacher gave you a different one.</p></div>' +
      '<div class="center small muted" style="margin-top:12px">' + P.icon('shield', 14) + ' Your account works on one phone only.</div><div class="center" style="margin-top:10px">' + P.syncChip() + '</div></div>' + P.credit();
    var go = function () {
      var lrn = P.$('#lrn').value.replace(/\D/g, ''), pin = P.$('#pin').value.trim(), msg = P.$('#msg');
      if (!lrn || !pin) { msg.textContent = 'Please type your LRN and PIN.'; return; }
      var ensure = P.state.students.length ? Promise.resolve() : P.pull(true).catch(function (e) { throw new Error('This device has no learner list yet. Connect to the internet once and try again. (' + e.message + ')'); });
      ensure.then(function () {
        var st = P.state.students.find(function (x) { return x.lrn === lrn; });
        if (!st) {
          // maybe newly added: try refreshing once if online
          return P.pull().then(function () { return P.state.students.find(function (x) { return x.lrn === lrn; }); }, function () { return null; });
        }
        return st;
      }).then(function (st) {
        if (!st || st.active === false) throw new Error('LRN not found. Please check it or ask your teacher.');
        return P.pinHash(lrn, pin).then(function (h) {
          if (h !== st.pin) throw new Error('Wrong PIN. Try again or ask your teacher to reset it.');
          var set = P.state.settings, dev = P.deviceId(), who = { lrn: lrn, pinHash: h };
          if (set.deviceLock !== false && st.device && st.device !== dev) {
            P.logEvent('blocked-other-phone', 'Registered phone ' + P.shortDev(st.device), who); P.syncSoon(500);
            throw new Error('This account is registered to another phone. One phone per learner — ask your teacher to reset your phone if you changed phones.');
          }
          var shared = (set.sharedDevices || []).indexOf(dev) >= 0;
          var other = set.onePerPhone !== false && !shared && P.state.students.find(function (x) { return x.device === dev && x.lrn !== lrn && x.active !== false; });
          if (other) {
            P.logEvent('blocked-phone-used', 'Phone belongs to ' + other.lrn, who); P.syncSoon(500);
            throw new Error('This phone is registered to another learner (' + P.cap(other.first) + ' ' + String(other.last).charAt(0) + '.). One account per phone only.');
          }
          return P.api('bindDevice', { lrn: lrn, pinHash: h, device: dev, info: P.deviceInfo() }).then(function () { return true; }, function (e) { if (e.network) return false; throw e; })
            .then(function (bound) {
              if (!bound) P.logEvent('login-offline', '', who);
              st.device = dev; P.kvSet('students', P.state.students);
              return P.saveSession({ role: 'student', lrn: lrn, pinHash: h, bound: bound });
            });
        });
      }).then(function () { P.go('student', {}, true); }).catch(function (e) { msg.textContent = e.message; msg.style.color = 'var(--bad)'; });
    };
    P.$('#go').onclick = go;
    P.$('#pin').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  };

  /* ---------- teacher login ---------- */
  P.views.teacherLogin = function () {
    P.$('#app').innerHTML = authTop('Teacher Login', 'Monitor progress, check work, run assessments') + '<div class="auth-card">' +
      '<div class="card stack"><div class="field"><label class="f">Username</label><input class="in" id="u" autocomplete="username"></div>' +
      '<div class="field"><label class="f">Password</label><input class="in" id="pw" type="password" autocomplete="current-password"></div>' +
      '<button class="btn block lg" id="go">Log in</button><p class="small muted center" id="msg"></p></div></div>' + P.credit();
    var go = function (e) {
      var u = P.$('#u').value.trim(), pw = P.$('#pw').value, msg = P.$('#msg'), b = P.$('#go');
      if (!u || !pw) { msg.textContent = 'Enter your username and password.'; return; }
      if (/^https?:\/\//i.test(u)) { msg.textContent = 'Please type your username, not the Web App URL.'; msg.style.color = 'var(--bad)'; return; }
      P.busy(b, true, 'Logging in');
      var ensureSalt = P.state.salt ? Promise.resolve() : P.api('info').then(function (i) { P.state.salt = i.salt; return P.kvSet('salt', i.salt); });
      ensureSalt.then(function () { return P.passHash(u, pw); }).then(function (h) {
        return P.api('login', { username: u, passHash: h }).then(function (res) {
          return P.kvSet('cred:' + u.toLowerCase(), { h: h, user: res.user, token: res.token }).then(function () { return P.saveSession({ role: 'teacher', token: res.token, user: res.user }); });
        }, function (err) {
          if (!err.network) throw err;
          return P.kvGet('cred:' + u.toLowerCase()).then(function (c) {
            if (!c || c.h !== h) throw new Error('You are offline. Log in once with internet on this device to enable offline access.');
            P.toast('Offline login — showing data saved on this device.');
            return P.saveSession({ role: 'teacher', token: c.token, user: c.user, offline: true });
          });
        });
      }).then(function () { P.sync({ silent: true }); P.go('teacher', {}, true); }).catch(function (err) { P.busy(b, false); msg.textContent = err.message; msg.style.color = 'var(--bad)'; });
    };
    P.$('#go').onclick = go; P.$('#pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    P.$('#u').oninput = function () { if (/^https?:\/\//i.test(P.$('#u').value.trim())) { P.$('#msg').textContent = 'That is the Web App URL. Type your own username here (the one you created on the Welcome screen), e.g. joy.'; P.$('#msg').style.color = 'var(--bad)'; } };
    // a brand-new database has no accounts yet: go to the Welcome (setup) screen
    if (P.apiUrl() && !P.isDemo()) P.api('info').then(function (i) {
      if (i.salt) { P.state.salt = i.salt; P.kvSet('salt', i.salt); }
      if (i.needsSetup) { P.toast('This database is new. Let\'s set up your school first.'); P.go('setup', {}, true); }
    }).catch(function () { });
  };

  P.logout = function () {
    P.saveSession(null).then(function () { P.go('home', {}, true); });
  };

  /* ---------- boot ---------- */
  function boot() {
    var q = new URLSearchParams(location.search);
    if (q.get('api')) { localStorage.setItem('pearl_api', q.get('api')); history.replaceState(null, '', location.pathname); }
    if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.PEARL_DEMO_BUILD) navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW', e); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });
    P.loadCache().then(function () { return P.restoreDevice(); }).then(function () {
      if (P.isDemo()) return P.Demo.init();
    }).then(function () {
      P.go('home', {}, true);
      if (P.apiUrl()) P.syncSoon(800 + Math.random() * 3000);
      setInterval(function () { if (P.state.pending || Date.now() - new Date(P.state.lastSync || 0).getTime() > 10 * 60000) P.sync({ silent: true }); }, 60000);
    }).catch(function (e) { P.$('#app').innerHTML = '<div class="narrow"><div class="card"><h3>Could not start</h3><p>' + esc(e.message) + '</p><p class="small muted">If you are in private/incognito mode, please open the app normally so it can save data on this device.</p></div></div>'; });
  }
  boot();
})();
