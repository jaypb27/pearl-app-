/* PEARL App — Learner experience */
(function () {
  'use strict';
  var P = window.P, esc = P.esc;

  function me() { var s = P.state.session; return s && P.state.students.find(function (x) { return x.lrn === s.lrn; }); }
  function S() { return P.state.settings; }
  /* when a teacher restarts a learner (failed releveling), start a fresh round from Day 1 */
  function loadPg(st) {
    return P.getProgress(st.lrn).then(function (pg) {
      var cyc = Number(st.cycle) || 0;
      if ((Number(pg.cycle) || 0) === cyc) return pg;
      pg.history = pg.history || {};
      pg.history['round' + ((Number(pg.cycle) || 0) + 1)] = { lessons: pg.lessons, endedAt: new Date().toISOString() };
      pg.lessons = {};
      Object.keys(pg.drafts).forEach(function (k) { if (k.indexOf('A:') !== 0) delete pg.drafts[k]; });
      Object.keys(pg.results).forEach(function (k) { if (pg.results[k].type === 'releveling') { pg.history['test-' + k + '-' + cyc] = pg.results[k]; delete pg.results[k]; } });
      pg.cycle = cyc; pg.restarted = new Date().toISOString();
      return P.setProgress(st.lrn, pg).then(function () { return pg; });
    });
  }
  P.loadPg = loadPg;

  /* ---------------- progress & unlocking ---------------- */
  function firstDay(st, pg) {
    var other = Object.keys(pg.lessons).map(function (id) { var L = P.lessonById(id); return L && L.level !== st.level ? Number(L.day) || 0 : 0; });
    var m = other.length ? Math.max.apply(null, other) : 0;
    return m ? m + 1 : 1;
  }
  P.dayStatus = function (st, pg, L) {
    if (pg.lessons[L.id]) return pg.lessons[L.id].syncedAt || pg.lessons[L.id].fromServer ? 'done' : 'pending';
    if (Number(L.day) > Number(S().releasedDay || 40)) return 'lock';
    if (S().unlockMode === 'open') return 'open';
    var fd = firstDay(st, pg);
    if (Number(L.day) <= fd) return 'open';
    var prev = P.lessonsFor(st.level).filter(function (x) { return Number(x.day) < Number(L.day) && Number(x.day) >= fd; });
    return prev.every(function (x) { return pg.lessons[x.id]; }) ? 'open' : 'lock';
  };
  function stats(st, pg) {
    var done = Object.keys(pg.lessons).map(function (k) { return pg.lessons[k]; });
    var total = Number(S().totalDays) || 40, pts = S().points || {};
    var written = done.filter(function (d) { return d.wordCount > 0 || d.written !== false; }).length;
    var audio = done.filter(function (d) { return d.audioStatus === 'recorded' || d.audioStatus === 'live'; }).length;
    var monthly = Object.keys(pg.results).map(function (k) { return pg.results[k]; }).filter(function (r) { return r.type === 'monthly'; });
    var mPts = monthly.length ? P.avg(monthly.map(function (r) { return r.autoTotal ? r.autoScore / r.autoTotal : 0; })) * (pts.monthly || 50) : 0;
    var points = Math.round(Math.min(1, written / total) * (pts.written || 50) + Math.min(1, audio / total) * (pts.audio || 50) + mPts);
    var quiz = done.filter(function (d) { return d.total; });
    var avg = quiz.length ? Math.round(P.avg(quiz.map(function (d) { return d.score / d.total * 100; }))) : 0;
    // streak of school days (Mon-Fri) with a completed pearl
    var days = {}; done.forEach(function (d) { if (d.completedAt) days[P.dayKey(d.completedAt)] = 1; });
    var streak = 0, t = new Date(); if (!days[P.dayKey(t)]) t.setDate(t.getDate() - 1);
    for (var i = 0; i < 400; i++) { var wd = t.getDay(); if (wd !== 0 && wd !== 6) { if (days[P.dayKey(t)]) streak++; else break; } t.setDate(t.getDate() - 1); }
    return { pearls: done.length, points: points, avg: avg, streak: streak, done: done };
  }
  var BADGES = [
    ['first', '🐚', 'First Pearl', function (x) { return x.pearls >= 1; }],
    ['perfect', '🎯', 'Perfect Quiz', function (x) { return x.done.some(function (d) { return d.total && d.score === d.total; }); }],
    ['week', '📅', 'Week Complete', function (x, pg) { var w = {}; Object.keys(pg.lessons).forEach(function (id) { var L = P.lessonById(id); if (L) w[L.level + L.week] = (w[L.level + L.week] || 0) + 1; }); return Object.keys(w).some(function (k) { return w[k] >= 5; }); }],
    ['streak5', '🔥', '5-Day Streak', function (x) { return x.streak >= 5; }],
    ['words', '🪄', 'Word Wizard', function (x, pg) { return !!pg.badges.words; }],
    ['voice', '🎤', 'Voice Star', function (x) { return x.done.filter(function (d) { return d.audioStatus === 'recorded'; }).length >= 10; }],
    ['early', '⏰', 'Early Bird', function (x, pg) { return !!pg.badges.early; }],
    ['ten', '💎', '10 Pearls', function (x) { return x.pearls >= 10; }],
    ['sharp', '🧠', 'Sharp Reader', function (x) { return x.done.filter(function (d) { return d.total && d.score === d.total; }).length >= 5; }],
    ['twenty', '🌊', 'Halfway There', function (x) { return x.pearls >= 20; }],
    ['necklace', '📿', 'Pearl Necklace', function (x) { return x.pearls >= 40; }]
  ];
  function earned(x, pg) { return BADGES.filter(function (b) { return b[3](x, pg); }).map(function (b) { return b[0]; }); }

  function mergeServer(st, pg) {
    var sess = P.state.session;
    return P.api('myProgress', { lrn: st.lrn, pinHash: sess.pinHash }).then(function (res) {
      var changed = false;
      (res.daily || []).forEach(function (d) {
        var cur = pg.lessons[d.lessonId];
        if (!cur) { pg.lessons[d.lessonId] = { score: d.score, total: d.total, completedAt: d.completedAt, syncedAt: d.syncedAt, audioStatus: d.audioStatus, audioSec: d.audioSec, fromServer: true, written: d.written, quiz: d.quiz, feedback: d.feedback }; changed = true; }
        else { if (!cur.syncedAt) { cur.syncedAt = d.syncedAt; changed = true; } if (d.feedback && JSON.stringify(cur.feedback) !== JSON.stringify(d.feedback)) { cur.feedback = d.feedback; changed = true; } }
      });
      (res.results || []).forEach(function (r) {
        var cur = pg.results[r.assessmentId];
        var A0 = P.state.assessments.find(function (a) { return a.id === r.assessmentId; });
        if (!cur && A0 && A0.type === 'releveling' && st.cycleAt && String(r.completedAt) < String(st.cycleAt)) return;
        if (!cur) { pg.results[r.assessmentId] = { autoScore: r.autoScore, autoTotal: r.autoTotal, manualPending: r.manualPending, completedAt: r.completedAt, syncedAt: r.completedAt, grade: r.grade, fromServer: true }; changed = true; }
        else if (r.grade && JSON.stringify(cur.grade) !== JSON.stringify(r.grade)) { cur.grade = r.grade; changed = true; }
      });
      return changed ? P.setProgress(st.lrn, pg).then(function () { return true; }) : false;
    }).catch(function () { return false; });
  }

  /* ---------------- student home ---------------- */
  P.views.student = function () {
    var st = me();
    if (!st) { P.saveSession(null); return P.go('studentLogin', {}, true); }
    loadPg(st).then(function (pg) {
      renderHome(st, pg);
      if (!P._merged) { P._merged = true; mergeServer(st, pg).then(function (ch) { if (ch) renderHome(st, pg); }); }
      loadBoard(st, pg);
    });
    var off = function () { loadPg(st).then(function (pg) { if (P.$('#s-home')) renderHome(st, pg); }); };
    var un = P.on('uploaded', off);
    P.cleanup = function () { P._merged = false; un(); };
  };

  function topbar(right) {
    var s = S();
    return '<div class="topbar"><div class="in-bar"><div class="brand grow"><img src="' + esc(P.logo()) + '" alt=""><div style="min-width:0"><div class="t">' + esc(s.appName) + '</div><div class="s">' + esc(s.schoolName) + '</div></div></div>' + P.syncChip() + (right || '') + '</div></div>';
  }
  P.topbar = topbar;

  function renderHome(st, pg) {
    var x = stats(st, pg), lessons = P.lessonsFor(st.level), s = S();
    var next = lessons.find(function (L) { var k = P.dayStatus(st, pg, L); return k === 'open'; });
    var draft = next && pg.drafts[next.id];
    var got = earned(x, pg);
    var tests = P.state.assessments.filter(function (A) { return A.open && ((A.levels || []).indexOf('ALL') >= 0 || (A.levels || []).indexOf(st.level) >= 0); });
    var weeks = P.groupBy(lessons, function (L) { return L.week || Math.ceil(L.day / 5); });
    var ini = (st.first || '?').charAt(0) + (st.last || '').charAt(0);
    var TL = { pre: 'Pre-Test', post: 'Post-Test', releveling: 'Releveling Exam', monthly: 'Monthly Long Quiz', exam: 'Term Exam' };
    var need = Math.min(Number(s.releasedDay) || 40, Number(s.totalDays) || 40);
    var retakeLocked = function (A) { return A.type === 'releveling' && Number(st.cycle) > 0 && pg.history && Object.keys(pg.history).some(function (k) { return k.indexOf('test-' + A.id + '-') === 0; }) && x.pearls < need; };
    var due = tests.filter(function (A) { return !pg.results[A.id] && !retakeLocked(A); });
    var tab = P._stab || 'home';
    var C = 2 * Math.PI * 30, pc = Math.min(1, x.pearls / (Number(s.totalDays) || 40));
    var h = topbar('<button class="icon-btn" data-out title="Log out">' + P.icon('logout', 20) + '</button>') + '<div class="s-app lv-' + esc(st.level) + '" id="s-home">';
    /* HOME */
    h += '<section data-panel="home"' + (tab === 'home' ? '' : ' class="hide"') + '>' +
      '<div class="s-hero"><div class="row" style="flex-wrap:nowrap"><div class="avatar">' + esc(ini) + '</div><div class="grow" style="position:relative;z-index:1;min-width:0"><h2>Hi, ' + esc(P.cap(st.first)) + '!</h2><div class="small" style="opacity:.92">' + esc(st.section) + ' · <b>' + esc(P.alias(st.level)) + '</b>' + (Number(st.cycle) ? ' · Round ' + (Number(st.cycle) + 1) : '') + '</div></div>' +
      '<div class="ring"><svg width="70" height="70"><circle cx="35" cy="35" r="30" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="7"/><circle cx="35" cy="35" r="30" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pc)) + '"/></svg><b>' + Math.round(pc * 100) + '%</b></div></div>' +
      '<div class="s-stats"><div><b>' + x.pearls + '</b><span>' + P.icon('pearl', 12) + ' Pearls</span></div><div><b>' + x.points + '</b><span>' + P.icon('star', 12) + ' Points</span></div><div><b>' + x.streak + '</b><span>' + P.icon('flame', 12) + ' Streak</span></div><div><b>' + (x.avg ? x.avg + '%' : '—') + '</b><span>' + P.icon('target', 12) + ' Quiz avg</span></div></div></div>';
    if (Number(st.cycle) > 0 && !x.pearls) h += '<div class="note info" style="margin-top:14px"><b>Fresh start!</b> You are continuing in the <b>' + esc(st.level) + '</b> level and starting again from <b>Day 1</b>. Every pearl counts — you can do it!</div>';
    h += '<div class="panel-title"><h2>Today</h2><span class="small muted">' + esc(new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })) + '</span></div>';
    if (next) {
      h += '<div class="card next-card"><div class="row between"><span class="chip ' + esc(st.level) + '">Day ' + esc(next.day) + ' · Week ' + esc(next.week) + '</span><span class="small muted">' + P.icon('clock', 14) + ' ' + (draft ? 'Step ' + ((draft.step || 0) + 1) + ' of 5' : '25 minutes') + '</span></div>' +
        '<div class="news-title" style="margin:12px 0 6px">' + esc(next.title) + '</div><div class="row small muted" style="gap:14px"><span>' + P.icon('words', 15) + ' ' + esc((next.vocab || []).length) + ' words</span><span>' + P.icon('check', 15) + ' ' + esc((next.questions || []).length) + ' questions</span><span>' + P.icon('mic', 15) + ' speaking</span></div>' +
        '<button class="btn block lg" style="margin-top:14px" data-open="' + esc(next.id) + '">' + (draft ? 'Continue' : 'Start today\'s pearl') + ' ' + P.icon('play', 16) + '</button></div>';
    } else if (lessons.length) {
      h += '<div class="card center"><div class="big-pearl" style="width:70px;height:70px"></div><h3 style="justify-content:center">You\'re all caught up!</h3><p class="muted small">New pearls open as your teacher releases them.</p></div>';
    } else {
      h += '<div class="card center"><p class="muted">No lessons downloaded for your level yet. Connect to the internet and tap the sync button.</p></div>';
    }
    if (due.length) h += '<div class="card" style="margin-top:12px">' + due.map(function (A) { return '<div class="list-row"><div class="list-ic">' + P.icon('clipboard', 20) + '</div><div class="grow"><b>' + esc(A.title) + '</b><div class="small muted">' + (TL[A.type] || 'Assessment') + (A.timeMin ? ' · ' + A.timeMin + ' min' : '') + '</div></div><button class="btn sm" data-test="' + esc(A.id) + '">Take test</button></div>'; }).join('') + '</div>';
    h += '<div class="card" style="margin-top:12px" id="board"><h3>' + P.icon('clock', 18) + ' ' + esc(s.watchName) + ' Board</h3><div class="small muted">Connect to the internet to see who finished first.</div></div></section>';
    /* JOURNEY */
    h += '<section data-panel="journey"' + (tab === 'journey' ? '' : ' class="hide"') + '><div class="panel-title"><h2>My Pearl Journey</h2><span class="chip ' + esc(st.level) + '">' + x.pearls + ' / ' + (s.totalDays || 40) + '</span></div><div class="card journey">';
    Object.keys(weeks).sort(function (a, b) { return a - b; }).forEach(function (w) {
      h += '<div class="wk"><span>Week ' + esc(w) + '</span><div class="shells">' + weeks[w].map(function (L) {
        var k = P.dayStatus(st, pg, L), cls = k === 'done' ? 'done' : k === 'pending' ? 'done pending' : k === 'lock' ? 'lock' : (next && next.id === L.id ? 'cur' : '');
        return '<div class="shell ' + cls + '" data-day="' + esc(L.id) + '" data-k="' + k + '" title="Day ' + esc(L.day) + ': ' + esc(L.title) + '">' + (k === 'lock' ? P.icon('lock', 14) : esc(L.day)) + '</div>';
      }).join('') + '</div></div>';
    });
    h += '<div class="row tiny muted" style="margin-top:10px;gap:14px"><span><span class="dot" style="background:var(--ok)"></span> finished</span><span><span class="dot" style="background:#F2B33D"></span> waiting for internet</span><span>' + P.icon('lock', 12) + ' not yet open</span></div></div>';
    var extras = P.extrasFor(st.level);
    if (extras.length) h += '<div class="panel-title"><h2>Extra Reading</h2></div><div class="card">' + extras.map(function (L) { return '<div class="list-row"><div class="list-ic">' + P.icon('book', 20) + '</div><span class="grow"><b>' + esc(L.title) + '</b></span><button class="btn soft sm" data-extra="' + esc(L.id) + '">Read</button></div>'; }).join('') + '</div>';
    h += '</section>';
    /* TESTS */
    h += '<section data-panel="tests"' + (tab === 'tests' ? '' : ' class="hide"') + '><div class="panel-title"><h2>Tests & Assessments</h2></div><div class="card">' + (tests.length ? tests.map(function (A) {
      var r = pg.results[A.id];
      return '<div class="list-row"><div class="list-ic">' + P.icon('clipboard', 20) + '</div><div class="grow"><b>' + esc(A.title) + '</b><div class="small muted">' + (TL[A.type] || 'Assessment') + (A.timeMin ? ' · ' + A.timeMin + ' min' : '') + '</div></div>' +
        (r ? '<span class="chip ok">' + P.icon('tick', 13) + ' Done' + (r.autoTotal ? ' · ' + r.autoScore + '/' + r.autoTotal : '') + '</span>' : retakeLocked(A) ? '<span class="chip gray" title="Finish your pearls first">' + P.icon('lock', 13) + ' After Day ' + need + '</span>' : '<button class="btn sm" data-test="' + esc(A.id) + '">Take test</button>') + '</div>';
    }).join('') : '<div class="empty">No open tests right now.</div>') + '</div></section>';
    /* ME */
    h += '<section data-panel="me"' + (tab === 'me' ? '' : ' class="hide"') + '><div class="panel-title"><h2>My Profile</h2></div>' +
      '<div class="card"><div class="row" style="flex-wrap:nowrap"><div class="avatar" style="background:var(--brand-soft)">' + esc(ini) + '</div><div class="grow"><b>' + esc(P.cap(st.first) + ' ' + P.cap(st.last)) + '</b><div class="small muted">LRN ' + esc(st.lrn) + ' · ' + esc(st.section) + '</div></div>' + P.lvChip(st.level) + '</div>' +
      '<div class="small muted" style="margin-top:10px">' + P.icon('shield', 14) + ' This account is registered to this phone.</div></div>' +
      '<div class="panel-title"><h2>Badges</h2><span class="small muted">' + got.length + ' of ' + BADGES.length + '</span></div><div class="card"><div class="badges">' + BADGES.map(function (b) { return '<div class="badge ' + (got.indexOf(b[0]) >= 0 ? 'got' : '') + '"><div class="b">' + b[1] + '</div>' + esc(b[2]) + '</div>'; }).join('') + '</div></div>' +
      '<div class="panel-title"><h2>My Voice Journey</h2></div><div class="card" id="voice"><p class="small muted" style="margin-top:0">Compare your first recording with your latest. Can you hear your progress?</p><div id="voice-in" class="small muted">No recordings on this phone yet.</div></div>' +
      '<div class="row" style="justify-content:center;margin:18px 0"><button class="btn ghost sm" data-pin>' + P.icon('key', 16) + ' Change my PIN</button><button class="btn ghost sm" data-out>' + P.icon('logout', 16) + ' Log out</button></div>' + P.credit() + '</section>';
    h += '</div><nav class="bnav"><div class="in">' + [['home', 'home', 'Home'], ['journey', 'map', 'Journey'], ['tests', 'clipboard', 'Tests'], ['me', 'user', 'Me']].map(function (t) {
      return '<button data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + P.icon(t[1], 22) + t[2] + (t[0] === 'tests' && due.length ? '<span class="badge-n">' + due.length + '</span>' : '') + '</button>';
    }).join('') + '</div></nav>';
    P.$('#app').innerHTML = h;
    P.$$('.bnav [data-tab]').forEach(function (b) { b.onclick = function () { P._stab = b.dataset.tab; P.$$('[data-panel]').forEach(function (p) { p.classList.toggle('hide', p.dataset.panel !== P._stab); }); P.$$('.bnav [data-tab]').forEach(function (x) { x.classList.toggle('on', x === b); }); window.scrollTo(0, 0); }; });
    P.$$('[data-out]').forEach(function (b) { b.onclick = P.logout; });
    P.$$('[data-open]').forEach(function (b) { b.onclick = function () { P.go('lesson', { id: b.dataset.open }); }; });
    P.$$('[data-test]').forEach(function (b) { b.onclick = function () { P.go('assess', { id: b.dataset.test }); }; });
    P.$$('[data-extra]').forEach(function (b) { b.onclick = function () { P.go('lesson', { id: b.dataset.extra, extra: 1 }); }; });
    P.$$('.shell').forEach(function (el) {
      el.onclick = function () {
        var k = el.dataset.k;
        if (k === 'lock') return P.toast('Finish the earlier pearls first.');
        P.go('lesson', { id: el.dataset.day, review: k === 'done' || k === 'pending' ? 1 : 0 });
      };
    });
    P.$('[data-pin]').onclick = function () { changePin(st); };
    voiceJourney(st, pg);
    // badge notification
    var newB = got.filter(function (b) { return !pg.badges['seen_' + b]; });
    if (newB.length) { newB.forEach(function (b) { pg.badges['seen_' + b] = 1; }); P.setProgress(st.lrn, pg); }
    if (P._boardCache) paintBoard(P._boardCache, st);
  }

  function loadBoard(st, pg) {
    var ids = Object.keys(pg.lessons).filter(function (id) { var L = P.lessonById(id); return L && L.level === st.level; });
    var last = P.sortBy(ids.map(P.lessonById), function (L) { return -Number(L.day); })[0];
    var target = last || P.lessonsFor(st.level)[0];
    if (!target || !P.apiUrl()) return;
    P.api('board', { lessonId: target.id, lrn: st.lrn }).then(function (res) {
      P._boardCache = { lesson: target, list: res.list };
      var mine = res.list.findIndex(function (x) { return x.me; });
      if (mine >= 0 && mine < 3 && !pg.badges.early) { pg.badges.early = 1; P.setProgress(st.lrn, pg); }
      if (P.$('#board')) paintBoard(P._boardCache, st);
    }).catch(function () { });
  }
  function paintBoard(c, st) {
    var s = S(), el = P.$('#board'); if (!el) return;
    var list = c.list.slice(0, 10);
    el.innerHTML = '<h3>' + P.icon('clock', 18) + ' ' + esc(s.watchName) + ' Board</h3><p class="small muted" style="margin-top:-6px">' + esc(s.watchFull) + '<br>First to finish <b>Day ' + esc(c.lesson.day) + ': ' + esc(c.lesson.title) + '</b></p>' +
      (list.length ? '<div class="board"><ol>' + list.map(function (x, i) { return '<li class="' + (x.me ? 'me-row' : '') + '"><span class="rank r' + (i + 1) + '">' + (i + 1) + '</span><span class="grow"><b>' + esc(x.name) + '</b>' + (x.me ? ' (you!)' : '') + '<div class="tiny muted">' + esc(x.section) + '</div></span><span class="small muted">' + esc(P.fmtDate(x.at, true)) + '</span></li>'; }).join('') + '</ol></div>' : '<p class="small muted">Nobody has finished yet. Be the first! 🏁</p>');
  }

  function voiceJourney(st, pg) {
    var done = P.sortBy(Object.keys(pg.lessons).map(function (id) { return { id: id, d: pg.lessons[id] }; }).filter(function (x) { return x.d.audioStatus === 'recorded'; }), function (x) { return x.d.completedAt || ''; });
    Promise.all([P.blobGet('voice-first:' + st.lrn), done.length ? P.blobGet('rec:' + st.lrn + ':' + done[done.length - 1].id) : null]).then(function (b) {
      var el = P.$('#voice-in'); if (!el || (!b[0] && !b[1])) return;
      var h = '<div class="grid g2">';
      if (b[0]) h += '<div><div class="small"><b>First recording</b></div><audio controls src="' + URL.createObjectURL(b[0]) + '"></audio></div>';
      if (b[1] && done.length > 1) h += '<div><div class="small"><b>Latest recording</b> (Day ' + esc((P.lessonById(done[done.length - 1].id) || {}).day) + ')</div><audio controls src="' + URL.createObjectURL(b[1]) + '"></audio></div>';
      el.innerHTML = h + '</div>';
    });
  }

  function changePin(st) {
    var m = P.modal('Change my PIN', '<div class="field"><label class="f">Current PIN</label><input class="in big" type="password" inputmode="numeric" id="p0"></div><div class="field"><label class="f">New PIN (4–8 digits)</label><input class="in big" type="password" inputmode="numeric" id="p1"></div><div class="field"><label class="f">Type new PIN again</label><input class="in big" type="password" inputmode="numeric" id="p2"></div><p class="small muted">You need internet to change your PIN.</p><p class="small" id="pm"></p>', { foot: '<button class="btn" id="ps">Save PIN</button>' });
    m.querySelector('#ps').onclick = function (e) {
      var a = m.querySelector('#p0').value, b = m.querySelector('#p1').value, c = m.querySelector('#p2').value, msg = m.querySelector('#pm');
      if (!/^\d{4,8}$/.test(b)) { msg.textContent = 'PIN must be 4 to 8 digits.'; return; }
      if (b !== c) { msg.textContent = 'The new PINs do not match.'; return; }
      P.busy(e.target, true);
      Promise.all([P.pinHash(st.lrn, a), P.pinHash(st.lrn, b)]).then(function (h) {
        return P.api('changePin', { lrn: st.lrn, pinHash: h[0], newHash: h[1] }).then(function () {
          st.pin = h[1]; P.kvSet('students', P.state.students); return P.saveSession(Object.assign({}, P.state.session, { pinHash: h[1] }));
        });
      }).then(function () { m.close(); P.toast('PIN changed ✓', 'ok'); }).catch(function (err) { P.busy(e.target, false); msg.textContent = err.message; });
    };
  }

  /* ---------------- leak protection (watermark, no copy/print, pause when leaving) ---------------- */
  var Guard = P.Guard = { on: false };
  Guard.start = function (st, label, opts) {
    opts = opts || {};
    var set = S(); if (set.protect === false) { Guard.on = false; return function () { }; }
    Guard.on = true; Guard.leaves = 0; Guard.label = label;
    document.body.classList.add('protect');
    var txt = (P.cap(st.first) + ' ' + P.cap(st.last) + ' · ' + st.lrn + ' · ' + new Date().toLocaleDateString('en-PH')).replace(/[<&>]/g, '');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="170"><text x="10" y="110" transform="rotate(-22 180 85)" font-family="Arial" font-size="15" fill="rgb(120,30,90)" fill-opacity="0.10">' + txt + '</text></svg>';
    var wm = document.createElement('div'); wm.className = 'wm'; wm.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    document.body.appendChild(wm);
    var veil = null, logged = 0;
    var showVeil = function (why) {
      if (veil || set.pauseOnLeave === false) return;
      veil = document.createElement('div'); veil.className = 'veil';
      veil.innerHTML = '<div class="veil-box"><div class="veil-ic">' + P.icon('pause', 34) + '</div><h3>Paused</h3><p>' + P.esc(why) + '</p>' + (opts.leaveNote ? '<p class="small" style="color:#FFD6E5">' + P.esc(opts.leaveNote(Guard.leaves)) + '</p>' : '') + '<button class="btn lg">Continue</button></div>';
      document.body.appendChild(veil);
      veil.querySelector('button').onclick = function () { veil.remove(); veil = null; };
    };
    var left = function () {
      Guard.leaves++;
      if (logged++ < 25) P.logEvent('left-app', label + ' (' + Guard.leaves + 'x)');
      showVeil('You left the app. Your work is saved — tap Continue to go on.');
      if (opts.onLeave) opts.onLeave(Guard.leaves);
    };
    var onVis = function () { if (document.hidden) left(); };
    var onBlur = function () { if (!document.hidden && !document.hasFocus()) showVeil('The app is in the background.'); };
    var stop = function (e) { if (e.target.closest && e.target.closest('textarea, input')) return; e.preventDefault(); };
    var onCopy = function (e) { if (e.target.closest && e.target.closest('textarea, input')) return; e.preventDefault(); P.logEvent('copy-attempt', label); P.toast('Copying is turned off for PEARL materials.'); };
    var onKey = function (e) { if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && /^[345s]$/i.test(e.key))) { P.logEvent('screenshot-key', label); try { navigator.clipboard.writeText(''); } catch (x) { } showVeil('Screenshots are not allowed. This was recorded.'); } };
    var onPrint = function () { P.logEvent('print-attempt', label); };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onBlur);
    document.addEventListener('contextmenu', stop); document.addEventListener('copy', onCopy); document.addEventListener('cut', onCopy);
    document.addEventListener('keyup', onKey); window.addEventListener('beforeprint', onPrint);
    return function () {
      Guard.on = false; document.body.classList.remove('protect'); wm.remove(); if (veil) veil.remove();
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur);
      document.removeEventListener('contextmenu', stop); document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCopy);
      document.removeEventListener('keyup', onKey); window.removeEventListener('beforeprint', onPrint);
    };
  };

  /* ---------------- recorder ---------------- */
  P.Recorder = function () { this.chunks = []; };
  P.Recorder.prototype.start = function (onTick) {
    var self = this;
    if (!navigator.mediaDevices || !window.MediaRecorder) return Promise.reject(new Error('Recording is not supported on this browser. Please use Chrome or update your phone\'s browser.'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
      self.stream = stream;
      var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'], mime = types.find(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); });
      var opts = { audioBitsPerSecond: 24000 }; if (mime) opts.mimeType = mime;
      try { self.mr = new MediaRecorder(stream, opts); } catch (e) { self.mr = new MediaRecorder(stream); }
      self.chunks = []; self.mr.ondataavailable = function (e) { if (e.data && e.data.size) self.chunks.push(e.data); };
      self.mr.start(1000); self.t0 = Date.now();
      try {
        var AC = window.AudioContext || window.webkitAudioContext; self.ac = new AC(); var src = self.ac.createMediaStreamSource(stream);
        self.an = self.ac.createAnalyser(); self.an.fftSize = 512; src.connect(self.an); self.buf = new Uint8Array(self.an.fftSize);
      } catch (e) { self.an = null; }
      self.iv = setInterval(function () {
        var lvl = 0;
        if (self.an) { self.an.getByteTimeDomainData(self.buf); var m = 0; for (var i = 0; i < self.buf.length; i++) m = Math.max(m, Math.abs(self.buf[i] - 128)); lvl = Math.min(1, m / 70); }
        onTick && onTick((Date.now() - self.t0) / 1000, lvl);
      }, 100);
    });
  };
  P.Recorder.prototype.stop = function () {
    var self = this;
    return new Promise(function (res) {
      clearInterval(self.iv);
      var sec = (Date.now() - self.t0) / 1000;
      var finish = function () {
        try { self.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
        try { self.ac && self.ac.close(); } catch (e) { }
        res({ blob: new Blob(self.chunks, { type: (self.mr && self.mr.mimeType) || 'audio/webm' }), sec: Math.round(sec) });
      };
      if (self.mr && self.mr.state !== 'inactive') { self.mr.onstop = finish; self.mr.stop(); } else finish();
    });
  };
  P.Recorder.prototype.cancel = function () { try { clearInterval(this.iv); this.mr && this.mr.state !== 'inactive' && this.mr.stop(); this.stream && this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { } };

  /* ---------------- vocabulary helpers ---------------- */
  function vocabRegex(words) {
    var parts = words.filter(Boolean).map(function (w) { var b = w.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); if (/e$/.test(b)) b = b.slice(0, -1) + 'e?'; if (/y$/.test(b)) b = b.slice(0, -1) + '(?:y|i)'; return b + '(?:s|es|d|ed|ing|ly|er|est)?'; });
    parts.sort(function (a, b) { return b.length - a.length; });
    return parts.length ? new RegExp('\\b(' + parts.join('|') + ')\\b', 'gi') : null;
  }
  function usedVocab(L, text) {
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    return (L.vocab || []).map(function (v) { return v.word; }).filter(function (w) { var re = vocabRegex([w]); return re && re.test(t); });
  }
  function highlight(L, text) {
    var re = vocabRegex((L.vocab || []).map(function (v) { return v.word; }));
    var e = esc(text); if (!re) return e;
    return e.replace(re, function (m) { return '<span class="vw" data-w="' + esc(m) + '">' + m + '</span>'; });
  }
  function findVocab(L, w) {
    w = String(w).toLowerCase();
    return (L.vocab || []).find(function (v) { var re = vocabRegex([v.word]); re.lastIndex = 0; return re.test(w); });
  }

  function whyBox(ex) {
    if (!ex || !ex.why) return '';
    var lbl = ex.source === 'teacher' ? 'Why?' : ex.kind === 'vocabulary' ? 'Word meaning' : ex.kind === 'inference' ? 'Clue from the passage' : ex.kind === 'knowledge' ? 'Think about it' : 'Proof from the passage';
    return '<div class="why"><b>💡 ' + lbl + ':</b> ' + esc(ex.why) + '</div>';
  }
  P.whyBox = whyBox;

  /* ---------------- lesson player ---------------- */
  var STARTERS = {
    Beginner: ['I think', 'I believe that', 'In my opinion,', 'For example,', 'This is important because', 'I usually'],
    Intermediate: ['Based on the article,', 'One reason is that', 'This shows that', 'I agree because', 'I disagree because', 'In my experience,'],
    Advanced: ['The author suggests that', 'Evidence from the text shows', 'On the other hand,', 'This implies that', 'In conclusion,']
  };

  P.views.lesson = function (params) {
    var st = me(); if (!st) return P.go('studentLogin', {}, true);
    var L = P.lessonById(params.id); if (!L) { P.toast('Lesson not found on this device. Please sync.'); return P.go('student', {}, true); }
    loadPg(st).then(function (pg) {
      if (params.review || params.extra) return renderReview(st, pg, L, !!params.extra);
      runLesson(st, pg, L);
    });
  };

  function renderReview(st, pg, L, isExtra) {
    var d = pg.lessons[L.id] || {};
    var h = '<div class="lesson-top lv-' + esc(L.level) + '"><div class="row"><button class="icon-btn" onclick="history.back()">' + P.icon('back', 22) + '</button><div class="grow"><div class="small muted">' + (isExtra ? 'Extra Reading' : 'Day ' + esc(L.day) + ' · Review') + '</div><b>' + esc(L.title) + '</b></div>' + P.lvChip(L.level) + '</div></div>' +
      '<div class="wrap lv-' + esc(L.level) + '" style="max-width:760px">';
    if (!isExtra) {
      h += '<div class="card"><div class="row between"><h3 style="margin:0">Your result</h3>' + (d.syncedAt || d.fromServer ? '<span class="chip ok">Uploaded ✓</span>' : '<span class="chip warn">⏳ Waiting for internet</span>') + '</div>' +
        '<div class="grid g3" style="margin-top:10px"><div class="kpi card flat"><div class="v">' + esc(d.score) + '/' + esc(d.total) + '</div><div class="l">Quiz score</div></div><div class="kpi card flat"><div class="v">' + esc(d.wordCount || '✓') + '</div><div class="l">Words written</div></div><div class="kpi card flat"><div class="v">' + (d.audioStatus === 'live' ? 'Live' : P.mmss(d.audioSec || 0)) + '</div><div class="l">Speaking</div></div></div>';
      if (d.feedback) { var f = d.feedback; h += '<div class="note info" style="margin-top:10px"><b>Teacher feedback:</b> ' + (f.stars ? '⭐'.repeat(f.stars) + ' ' : '') + esc(f.comment || '') + '</div>'; }
      if (d.feedback && d.feedback.writingScore != null) h += '<div class="small" style="margin-top:6px"><b>Writing score:</b> ' + esc(d.feedback.writingScore) + '/' + esc(d.feedback.writingMax || 12) + '</div>';
      if ((L.questions || []).length) h += '<h3 style="margin-top:14px">Quiz review</h3>' + L.questions.map(function (q, i) { var a = (d.quiz || [])[i]; return '<div class="card flat" style="margin-bottom:8px"><div class="small"><b>' + (a ? (a === q.ans ? '✅ ' : '❌ ') : '') + (i + 1) + '. ' + esc(q.q) + '</b></div><div class="small muted">' + (a ? 'Your answer: ' + esc(a) + ' · ' : '') + 'Correct: <b>' + esc(q.ans) + ') ' + esc(q.opts['ABCD'.indexOf(q.ans)] || '') + '</b></div>' + whyBox(P.Check.explain(L, i)) + '</div>'; }).join('');
      if (d.written && d.written.length) h += '<h3 style="margin-top:14px">What you wrote</h3>' + (L.discussion || []).map(function (q, i) { return '<p class="small muted" style="margin:6px 0 2px"><b>' + esc(q) + '</b></p><p>' + esc((d.written || [])[i] || '') + '</p>'; }).join('');
      h += '<div id="rv-audio"></div></div>';
    }
    h += '<h3 style="margin-top:16px">Vocabulary</h3><div class="grid g2">' + (L.vocab || []).map(function (v) { return '<div class="card flat"><div class="row between"><b style="font-family:var(--head);font-size:1.15rem">' + esc(v.word) + '</b><button class="icon-btn" data-say="' + esc(v.word) + '">🔊</button></div><div class="tiny muted">' + esc(v.pos) + ' ' + esc(v.ipa) + '</div><div class="small">' + esc(v.def) + '</div><div class="small muted"><i>' + esc(v.ex) + '</i></div></div>'; }).join('') + '</div>' +
      '<h3 style="margin-top:16px">Passage</h3><div class="passage">' + (L.passage || []).map(function (p) { return '<p>' + highlight(L, p) + '</p>'; }).join('') + '</div>' +
      (L.author ? '<p class="tiny muted">Author: ' + esc(L.author) + (L.link ? ' · Source: ' + esc(L.link) : '') + '</p>' : '') +
      (isExtra && (L.questions || []).length ? '<h3>Questions to think about</h3><ol>' + L.questions.map(function (q) { return '<li>' + esc(q.q) + '</li>'; }).join('') + '</ol>' : '') +
      '<div style="height:30px"></div></div>';
    P.$('#app').innerHTML = h;
    var unguard = Guard.start(st, (isExtra ? 'Extra reading ' : 'Review Day ' + L.day + ' ') + L.level);
    P.cleanup = unguard;
    bindVocabTaps(L);
    P.$$('[data-say]').forEach(function (b) { b.onclick = function () { P.speak(b.dataset.say); }; });
    P.blobGet('rec:' + st.lrn + ':' + L.id).then(function (b) { var el = P.$('#rv-audio'); if (b && el) el.innerHTML = '<h3 style="margin-top:12px">Your recording</h3><audio controls src="' + URL.createObjectURL(b) + '"></audio>'; });
  }
  function bindVocabTaps(L) {
    P.$$('.vw').forEach(function (el) { el.onclick = function () { var v = findVocab(L, el.dataset.w); if (v) P.toast(v.word + ' (' + v.pos + '): ' + v.def, '', 5000); }; });
  }

  function runLesson(st, pg, L) {
    var key = 'rec:' + st.lrn + ':' + L.id;
    var D = pg.drafts[L.id] || { step: 0, said: {}, read: false, answers: [], quizDone: false, written: [], reflection: {}, startedAt: new Date().toISOString(), stepSec: [0, 0, 0, 0, 0] };
    pg.drafts[L.id] = D;
    var saveT = null, rec = null, stepT0 = Date.now(), tick = null, audioURL = null;
    var save = function () { clearTimeout(saveT); saveT = setTimeout(function () { P.setProgress(st.lrn, pg); }, 300); };
    var canGo = function (i) { if (i === 0) return true; if (i >= 1 && !allSaid()) return false; if (i >= 2 && !D.read) return false; if (i >= 3 && !D.quizDone) return false; if (i >= 4 && !writeOk()) return false; return true; };
    var allSaid = function () { return (L.vocab || []).every(function (v) { return D.said[v.word]; }); };
    var minW = function () { return Number((S().minWords || {})[L.level]) || 8; };
    var writeOk = function () { return (L.discussion || []).every(function (q, i) { return P.words(D.written[i]) >= minW(); }); };

    P.$('#app').innerHTML = '<div class="lv-' + esc(L.level) + '"><div class="lesson-top"><div class="row" style="flex-wrap:nowrap"><button class="icon-btn" data-back>' + P.icon('back', 22) + '</button><div class="grow" style="min-width:0"><div class="small muted">Day ' + esc(L.day) + ' · Week ' + esc(L.week) + ' · ' + esc(L.level) + '</div><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(L.title) + '</div></div>' + (S().showTimer ? '<span class="timer">' + P.icon('clock', 14) + '<span id="tm">5:00</span></span>' : '') + '</div><div class="steps" id="steps"></div></div><div class="wrap" style="max-width:820px" id="stage"></div></div>';
    P.$('[data-back]').onclick = function () { save(); history.back(); };
    var unguard = Guard.start(st, 'Day ' + L.day + ' ' + L.level, { onLeave: function (n) { D.leaves = n + (D.leavesBefore || 0); save(); } });
    D.leavesBefore = D.leaves || 0;
    P.cleanup = function () { unguard(); clearInterval(tick); if (rec) rec.cancel(); P.setProgress(st.lrn, pg); if (audioURL) URL.revokeObjectURL(audioURL); };
    tick = setInterval(function () {
      var el = P.$('#tm'); var spent = (D.stepSec[D.step] || 0) + (Date.now() - stepT0) / 1000; var left = (Number(S().stepMinutes) || 5) * 60 - spent;
      if (el) { el.textContent = (left < 0 ? '+' : '') + P.mmss(Math.abs(left)); el.parentNode.classList.toggle('over', left < 0); }
    }, 1000);

    function steps() {
      P.$('#steps').innerHTML = P.STEP_NAMES.map(function (s, i) {
        var done = [allSaid(), D.read, D.quizDone, writeOk(), !!(D.audioSec || D.live)][i];
        return '<button class="step ' + (D.step === i ? 'on ' : '') + (done ? 'done' : '') + '" data-step="' + i + '" ' + (canGo(i) ? '' : 'disabled') + '><i>' + (done && D.step !== i ? P.icon('tick', 18) : P.icon(['words', 'read', 'check', 'pen', 'mic'][i], 18)) + '</i>' + s[1] + '</button>';
      }).join('');
      P.$$('[data-step]').forEach(function (b) { b.onclick = function () { goStep(Number(b.dataset.step)); }; });
    }
    function goStep(i) {
      if (!canGo(i)) return;
      D.stepSec[D.step] = (D.stepSec[D.step] || 0) + (Date.now() - stepT0) / 1000; stepT0 = Date.now();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      D.step = i; save(); show(); window.scrollTo(0, 0);
    }
    function nav(prevOk, nextLabel, nextOk, onNext) {
      return '<div class="bottom-bar">' + (D.step > 0 ? '<button class="btn ghost" data-prev>← Back</button>' : '<span></span>') + '<button class="btn" data-next ' + (nextOk ? '' : 'disabled') + '>' + nextLabel + '</button></div>';
    }
    function bindNav(onNext) {
      var p = P.$('[data-prev]'); if (p) p.onclick = function () { goStep(D.step - 1); };
      var n = P.$('[data-next]'); if (n) n.onclick = onNext || function () { goStep(D.step + 1); };
    }

    function show() {
      steps();
      [stepWords, stepRead, stepQuiz, stepWrite, stepSpeak][D.step]();
    }

    /* 1. Vocabulary */
    function stepWords() {
      var n = (L.vocab || []).length, c = (L.vocab || []).filter(function (v) { return D.said[v.word]; }).length;
      P.$('#stage').innerHTML = '<div class="row between"><div><div class="news-title">Words for Today</div><div class="small muted">Tap a card to see the meaning. Say each word aloud, then tap “I said it”.</div></div><span class="chip ' + esc(L.level) + '">' + c + '/' + n + ' practiced</span></div>' +
        '<div class="flash-grid" style="margin-top:12px">' + (L.vocab || []).map(function (v, i) {
          return '<div class="flash ' + (D.said[v.word] ? 'ok' : '') + '" data-i="' + i + '"><div class="in2"><div class="f"><div class="pos">' + esc(v.pos) + '</div><div class="w">' + esc(v.word) + '</div><div class="ipa">' + esc(v.ipa) + '</div><button class="btn soft sm" style="margin-top:10px" data-say="' + i + '">🔊 Listen</button><div class="tiny muted" style="margin-top:8px">tap to flip ↻</div></div>' +
            '<div class="b"><div class="pos">' + esc(v.word) + ' · meaning</div><div style="font-weight:650;margin:4px 0 8px">' + esc(v.def) + '</div><div class="small muted"><i>“' + highlight(L, v.ex) + '”</i></div><div class="said row" style="gap:6px"><button class="btn soft sm" data-sayex="' + i + '">🔊 Example</button><button class="btn sm ' + (D.said[v.word] ? 'ok' : '') + '" data-said="' + i + '">' + (D.said[v.word] ? '✓ Said it' : '🗣 I said it') + '</button></div></div></div></div>';
        }).join('') + '</div>' + nav(false, 'Next: Read the passage →', allSaid());
      P.$$('.flash').forEach(function (el) { el.onclick = function (e) { if (e.target.closest('button')) return; el.classList.toggle('flip'); }; });
      P.$$('[data-say]').forEach(function (b) { b.onclick = function () { P.speak(L.vocab[b.dataset.say].word, null, 0.8); }; });
      P.$$('[data-sayex]').forEach(function (b) { b.onclick = function () { P.speak(L.vocab[b.dataset.sayex].ex); }; });
      P.$$('[data-said]').forEach(function (b) {
        b.onclick = function () {
          var v = L.vocab[b.dataset.said]; D.said[v.word] = true; save();
          b.textContent = '✓ Said it'; b.classList.add('ok'); b.closest('.flash').classList.add('ok');
          var c2 = (L.vocab || []).filter(function (x) { return D.said[x.word]; }).length;
          var chip = P.$('#stage .chip'); if (chip) chip.textContent = c2 + '/' + (L.vocab || []).length + ' practiced';
          P.$('[data-next]').disabled = !allSaid(); steps();
          setTimeout(function () { var card = b.closest('.flash'); if (card) card.classList.remove('flip'); }, 600);
          if (allSaid()) P.toast('Great! All words practiced 🎉', 'ok');
        };
      });
      bindNav();
    }

    /* 2. Passage */
    function stepRead() {
      var t0 = Date.now(), minSec = 20;
      P.$('#stage').innerHTML = '<div class="news-title">' + esc(L.title) + '</div><div class="small muted" style="margin-bottom:10px">' + (L.author ? 'By ' + esc(L.author) + ' · ' : '') + 'Read the passage aloud. Tap a highlighted word to see its meaning.</div>' +
        '<div class="row" style="margin-bottom:10px"><button class="btn soft sm" id="listen">🔊 Listen to the passage</button><button class="btn soft sm" id="big">A+ Bigger text</button></div>' +
        '<div class="passage" id="pass">' + (L.passage || []).map(function (p, i) { return '<p data-p="' + i + '">' + highlight(L, p) + '</p>'; }).join('') + '</div>' +
        '<div class="center" style="margin:16px 0"><button class="btn ok lg" id="readDone" ' + (D.read ? '' : 'disabled') + '>' + (D.read ? '✓ I read it aloud' : '🗣 I finished reading aloud') + '</button><div class="tiny muted" id="rw"></div></div>' + nav(false, 'Next: Quiz →', D.read);
      bindVocabTaps(L);
      var speaking = false;
      P.$('#listen').onclick = function (e) {
        if (speaking) { speechSynthesis.cancel(); speaking = false; e.target.textContent = '🔊 Listen to the passage'; P.$$('#pass p').forEach(function (p) { p.classList.remove('speaking'); }); return; }
        speaking = true; e.target.textContent = '⏹ Stop';
        var i = 0, ps = L.passage || [];
        var next = function () { P.$$('#pass p').forEach(function (p) { p.classList.remove('speaking'); }); if (!speaking || i >= ps.length) { speaking = false; var b = P.$('#listen'); if (b) b.textContent = '🔊 Listen to the passage'; return; } var el = P.$('#pass p[data-p="' + i + '"]'); if (el) el.classList.add('speaking'); P.speak(ps[i++], next); };
        next();
      };
      P.$('#big').onclick = function () { P.$('#pass').classList.toggle('big'); };
      var rd = P.$('#readDone');
      if (!D.read) {
        var iv = setInterval(function () { var left = Math.ceil(minSec - (Date.now() - t0) / 1000); var w = P.$('#rw'); if (!w) return clearInterval(iv); if (left > 0) w.textContent = 'Take your time… (' + left + 's)'; else { w.textContent = ''; rd.disabled = false; clearInterval(iv); } }, 500);
      }
      rd.onclick = function () { D.read = true; save(); rd.textContent = '✓ I read it aloud'; P.$('[data-next]').disabled = false; steps(); };
      bindNav();
    }

    /* 3. Quiz */
    function stepQuiz() {
      var qs = L.questions || [];
      if (D.quizDone) return quizResult();
      var i = D.answers.length; if (i >= qs.length) { finishQuiz(); return; }
      var q = qs[i], picked = null;
      P.$('#stage').innerHTML = '<div class="row between"><div class="news-title">Comprehension Quiz</div><span class="chip ' + esc(L.level) + '">' + (i + 1) + ' / ' + qs.length + '</span></div>' +
        '<div class="bar" style="margin:8px 0 14px"><i style="width:' + P.pct(i, qs.length) + '%"></i></div>' +
        '<div class="q-card"><div class="q-num">Question ' + (i + 1) + '</div><div class="q-text">' + esc(q.q) + '</div>' +
        q.opts.map(function (o, k) { var letter = 'ABCD'.charAt(k); return '<button class="opt" data-o="' + letter + '"><b>' + letter + '</b><span>' + esc(o) + '</span></button>'; }).join('') +
        '<div id="fb" class="small" style="min-height:24px"></div><div class="row" style="justify-content:flex-end"><button class="btn" id="chk" disabled>Check answer</button></div></div>' +
        '<p class="small muted center" style="margin-top:12px">Need help? <a href="#" id="peek">Look at the passage again</a></p>';
      P.$$('.opt').forEach(function (b) { b.onclick = function () { if (b.disabled) return; P.$$('.opt').forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); picked = b.dataset.o; P.$('#chk').disabled = false; }; });
      P.$('#peek').onclick = function (e) { e.preventDefault(); P.modal('Passage', '<div class="passage">' + (L.passage || []).map(function (p) { return '<p>' + highlight(L, p) + '</p>'; }).join('') + '</div>'); };
      P.$('#chk').onclick = function () {
        var btn = P.$('#chk');
        if (btn.dataset.next) { if (D.answers.length >= qs.length) finishQuiz(); else stepQuiz(); return; }
        D.answers.push(picked); save();
        var right = picked === q.ans;
        P.$$('.opt').forEach(function (x) { x.disabled = true; if (x.dataset.o === q.ans) x.classList.add('right'); else if (x.dataset.o === picked) x.classList.add('wrong'); });
        var ex = P.Check.explain(L, i);
        P.$('#fb').innerHTML = (right ? '<b style="color:var(--ok)">✓ Correct! Great job.</b>' : '<b style="color:var(--bad)">✗ Not quite.</b> The correct answer is <b>' + esc(q.ans) + '</b>.') + whyBox(ex);
        btn.dataset.next = 1; btn.textContent = D.answers.length >= qs.length ? 'See my score →' : 'Next question →';
      };
    }
    function finishQuiz() {
      var qs = L.questions || [];
      D.score = qs.filter(function (q, i) { return D.answers[i] === q.ans; }).length; D.total = qs.length; D.quizDone = true; save();
      if (D.score === D.total) P.confetti(70);
      steps(); quizResult();
    }
    function quizResult() {
      var qs = L.questions || [], pc = P.pct(D.score, D.total), C = 2 * Math.PI * 54;
      var msg = pc === 100 ? 'Perfect score! 🌟' : pc >= 80 ? 'Excellent work! 💪' : pc >= 60 ? 'Good job! Keep going 👍' : 'Nice try! Review the passage and keep practicing 🌱';
      P.$('#stage').innerHTML = '<div class="card center"><div class="score-ring"><svg width="130" height="130"><circle cx="65" cy="65" r="54" fill="none" stroke="#F2E6EE" stroke-width="12"/><circle cx="65" cy="65" r="54" fill="none" stroke="var(--lv,#B0306F)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pc / 100)) + '"/></svg><div class="v">' + D.score + '/' + D.total + '<small>' + pc + '%</small></div></div><h3 style="margin-top:10px">' + msg + '</h3></div>' +
        '<h3 style="margin-top:16px">Review</h3>' + qs.map(function (q, i) { var ok = D.answers[i] === q.ans; return '<div class="card flat" style="margin-bottom:8px"><div class="small"><b>' + (ok ? '✅' : '❌') + ' ' + (i + 1) + '. ' + esc(q.q) + '</b></div><div class="small muted">Your answer: ' + esc(D.answers[i] || '—') + ' · Correct: <b>' + esc(q.ans) + ') ' + esc(q.opts['ABCD'.indexOf(q.ans)] || '') + '</b></div>' + whyBox(P.Check.explain(L, i)) + '</div>'; }).join('') +
        nav(false, 'Next: Write your answers →', true);
      bindNav();
    }

    /* 4. Writing */
    function stepWrite() {
      var mw = minW(), starters = STARTERS[L.level] || [];
      P.$('#stage').innerHTML = '<div class="news-title">Discussion Questions</div><div class="small muted">Write your answers. Try to use today\'s vocabulary words! You will read these aloud in the next step.</div>' +
        '<div class="card" style="margin:12px 0"><div class="small" style="font-weight:700;margin-bottom:6px">Vocabulary used <span id="vcount"></span></div><div class="vchips" id="vchips"></div></div>' +
        (L.discussion || []).map(function (q, i) {
          return '<div class="q-card" style="margin-bottom:12px"><div class="q-num">Question ' + (i + 1) + '</div><div class="q-text" style="font-size:1.02rem">' + esc(q) + '</div>' +
            (starters.length ? '<div class="row" style="gap:6px;margin-bottom:8px">' + starters.map(function (s) { return '<button class="starter" data-st="' + i + '">' + esc(s) + '…</button>'; }).join('') + '</div>' : '') +
            '<textarea class="in" data-w="' + i + '" placeholder="Write your answer here…">' + esc(D.written[i] || '') + '</textarea><div class="row between"><span class="wc" id="wc' + i + '"></span><span class="tiny muted">at least ' + mw + ' words</span></div></div>';
        }).join('') + '<div class="card coach" id="coach"><b>🧑‍🏫 Writing Coach</b><div class="small muted">Tips appear as you write. They are suggestions only.</div><ul id="tips"></ul></div>' + nav(false, 'Next: Record your voice →', writeOk());
      var coachT = null;
      var coach = function () {
        clearTimeout(coachT);
        coachT = setTimeout(function () {
          var r = P.Check.writing(L, (L.discussion || []).map(function (q, i) { return D.written[i] || ''; }), mw), el = P.$('#tips'); if (!el) return;
          var tips = r.tips.length ? r.tips : ['Looks good! Read your answers once more before recording.'];
          el.innerHTML = tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
        }, 600);
      };
      var upd = function () {
        coach();
        var all = D.written.join(' '), used = usedVocab(L, all);
        P.$('#vchips').innerHTML = (L.vocab || []).map(function (v) { return '<span class="vchip ' + (used.indexOf(v.word) >= 0 ? 'used' : '') + '">' + (used.indexOf(v.word) >= 0 ? '✓ ' : '') + esc(v.word) + '</span>'; }).join('');
        P.$('#vcount').textContent = '(' + used.length + '/' + (L.vocab || []).length + ')';
        (L.discussion || []).forEach(function (q, i) { var n = P.words(D.written[i]), el = P.$('#wc' + i); if (el) { el.textContent = n + ' words' + (n >= mw ? ' ✓' : ''); el.className = 'wc ' + (n >= mw ? 'ok' : 'no'); } });
        var nx = P.$('[data-next]'); if (nx) nx.disabled = !writeOk();
        if (used.length && used.length === (L.vocab || []).length && !pg.badges.words) { pg.badges.words = 1; P.toast('🪄 Word Wizard! You used all the vocabulary words!', 'ok'); }
        steps();
      };
      P.$$('[data-w]').forEach(function (ta) { ta.oninput = function () { D.written[ta.dataset.w] = ta.value; save(); upd(); }; });
      P.$$('[data-st]').forEach(function (b) { b.onclick = function () { var ta = P.$('[data-w="' + b.dataset.st + '"]'); ta.value = (ta.value ? ta.value.trim() + ' ' : '') + b.textContent.replace(/…$/, '') + ' '; ta.focus(); ta.oninput(); }; });
      upd(); bindNav();
    }

    /* 5. Speaking */
    function stepSpeak() {
      var tgt = Number(S().targetAudioSec) || 60, max = Number(S().maxAudioSec) || 180, R = D.reflection || (D.reflection = {});
      var rate = function (k, label) { return '<div style="margin:8px 0"><div class="small" style="font-weight:650">' + label + '</div><div class="emoji-rate" data-k="' + k + '">' + ['😟', '🙂', '🤩'].map(function (e, i) { return '<button data-v="' + (i + 1) + '" class="' + (R[k] === i + 1 ? 'on' : '') + '">' + e + '</button>'; }).join('') + '</div></div>'; };
      P.$('#stage').innerHTML = '<div class="news-title">Speak with Confidence</div><div class="small muted">Read your answers aloud and record your voice (about ' + P.mmss(tgt) + ' or longer). Speak clearly and not too fast.</div>' +
        '<div class="prompter" style="margin:12px 0">' + (L.discussion || []).map(function (q, i) { return '<div class="qq">' + (i + 1) + '. ' + esc(q) + '</div><div>' + highlight(L, D.written[i] || '') + '</div>'; }).join('') + '</div>' +
        '<div class="card rec-wrap"><button class="rec-btn" id="rec">🎙️</button><div class="rec-time" id="rt">0:00</div><div class="small muted" id="rmsg">Tap the microphone to start recording</div>' +
        '<div class="meter"><i id="lvl"></i></div><div class="target"><i id="tg"></i></div><div class="tiny muted">Goal: ' + P.mmss(tgt) + '</div><div id="play" style="margin-top:10px"></div>' +
        '<p class="small" style="margin-top:12px"><a href="#" id="live">No microphone or phone? I will read aloud to my teacher instead.</a></p></div>' +
        '<div class="card" style="margin-top:12px"><h3>Self-reflection</h3>' + rate('clear', 'I spoke clearly') + rate('smooth', 'I read smoothly, without many stops') + rate('words', 'I used the new words correctly') +
        '<textarea class="in" id="note" placeholder="What can I do better next time? (optional)" style="min-height:70px;margin-top:8px">' + esc(R.note || '') + '</textarea><div id="cmp"></div></div>' +
        '<div class="bottom-bar"><button class="btn ghost" data-prev>← Back</button><button class="btn ok" id="submit" disabled>Submit my pearl 🐚</button></div>';
      var recBtn = P.$('#rec'), recording = false;
      var canSubmit = function () { P.$('#submit').disabled = !((D.audioSec >= Math.min(20, tgt)) || D.live); };
      var showPlay = function () {
        P.blobGet(key).then(function (b) {
          if (!b) return; if (audioURL) URL.revokeObjectURL(audioURL); audioURL = URL.createObjectURL(b);
          P.$('#play').innerHTML = '<audio controls src="' + audioURL + '"></audio><div class="small">Recorded ' + P.mmss(D.audioSec) + (D.audioSec < tgt ? ' · <span style="color:var(--warn)">try to reach ' + P.mmss(tgt) + '</span>' : ' · <span style="color:var(--ok)">goal reached ✓</span>') + '</div><button class="btn soft sm" id="again" style="margin-top:6px">↺ Record again</button>';
          P.$('#again').onclick = function () { recBtn.click(); };
          P.$('#rt').textContent = P.mmss(D.audioSec); P.$('#tg').style.width = Math.min(100, D.audioSec / tgt * 100) + '%';
        });
        P.blobGet('first:' + st.lrn + ':' + L.id).then(function (f) { if (f && D.tries > 1) P.$('#cmp').innerHTML = '<div class="small" style="margin-top:10px"><b>Compare:</b> your first try today</div><audio controls src="' + URL.createObjectURL(f) + '"></audio>'; });
      };
      if (D.audioSec) showPlay();
      if (D.live) P.$('#rmsg').innerHTML = '<b>You chose to read aloud to your teacher.</b> Your teacher will check it in class.';
      canSubmit();
      recBtn.onclick = function () {
        if (!recording) {
          rec = new P.Recorder();
          rec.start(function (sec, lvl) {
            P.$('#rt').textContent = P.mmss(sec); P.$('#lvl').style.width = (lvl * 100) + '%'; P.$('#tg').style.width = Math.min(100, sec / tgt * 100) + '%';
            if (sec >= max) recBtn.click();
          }).then(function () {
            recording = true; recBtn.classList.add('on'); recBtn.textContent = '⏹'; P.$('#rmsg').textContent = 'Recording… tap to stop'; P.$('#play').innerHTML = '';
          }).catch(function (e) { P.$('#rmsg').innerHTML = '<span style="color:var(--bad)">' + esc(e.name === 'NotAllowedError' ? 'Microphone permission was blocked. Allow the microphone for this app in your browser settings, or choose to read aloud to your teacher.' : e.message) + '</span>'; rec = null; });
        } else {
          recording = false; recBtn.classList.remove('on'); recBtn.textContent = '🎙️'; P.$('#lvl').style.width = '0';
          rec.stop().then(function (r) {
            rec = null;
            if (r.sec < 3 || !r.blob.size) { P.$('#rmsg').textContent = 'That was too short. Try again.'; return; }
            D.tries = (D.tries || 0) + 1; D.audioSec = r.sec; D.mime = r.blob.type; D.live = false;
            var jobs = [P.blobSet(key, r.blob)];
            if (D.tries === 1) jobs.push(P.blobSet('first:' + st.lrn + ':' + L.id, r.blob));
            Promise.all(jobs).then(function () { save(); P.$('#rmsg').textContent = 'Listen to your recording. Happy with it? Submit below!'; showPlay(); canSubmit(); steps(); })
              .catch(function () { P.toast('Could not save the recording. Your phone storage may be full.', 'bad', 6000); });
          });
        }
      };
      P.$('#live').onclick = function (e) { e.preventDefault(); D.live = true; save(); P.$('#rmsg').innerHTML = '<b>You chose to read aloud to your teacher.</b> Your teacher will check it in class.'; canSubmit(); steps(); };
      P.$$('.emoji-rate').forEach(function (g) { g.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; R[g.dataset.k] = Number(b.dataset.v); save(); P.$$('button', g).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      P.$('#note').oninput = function (e) { R.note = e.target.value; save(); };
      P.$('[data-prev]').onclick = function () { if (recording) recBtn.click(); goStep(3); };
      P.$('#submit').onclick = function (e) { if (recording) return P.toast('Stop the recording first.'); submit(e.currentTarget); };
    }

    function submit(btn) {
      P.busy(btn, true, 'Saving');
      D.stepSec[D.step] = (D.stepSec[D.step] || 0) + (Date.now() - stepT0) / 1000;
      var written = (L.discussion || []).map(function (q, i) { return D.written[i] || ''; });
      var used = usedVocab(L, written.join(' '));
      var ac = P.Check.writing(L, written, minW()); delete ac.items;
      var now = new Date().toISOString();
      var r = { id: st.lrn + '-' + L.id + '-' + P.uid(), level: L.level, day: L.day, lessonId: L.id, title: L.title, score: D.score, total: D.total, quiz: D.answers, written: written, wordCount: P.words(written.join(' ')), vocabUsed: used, autoCheck: ac, audioStatus: D.live && !D.audioSec ? 'live' : 'recorded', audioSec: D.live ? 0 : D.audioSec, reflection: D.reflection, steps: D.stepSec.map(Math.round), leaves: D.leaves || 0, cycle: st.cycle || 0, startedAt: D.startedAt, completedAt: now, device: P.deviceId() };
      if (D.live) { r.audioStatus = 'live'; r.audioSec = 0; }
      var before = earned(stats(st, pg), pg);
      pg.lessons[L.id] = { score: r.score, total: r.total, completedAt: now, audioStatus: r.audioStatus, audioSec: r.audioSec, wordCount: r.wordCount, written: written, quiz: D.answers };
      delete pg.drafts[L.id];
      var jobs = [P.setProgress(st.lrn, pg)];
      // keep the very first submitted recording for the Voice Journey
      if (r.audioStatus === 'recorded') jobs.push(P.blobGet('voice-first:' + st.lrn).then(function (f) { if (!f) return P.blobGet(key).then(function (b) { if (b) return P.blobSet('voice-first:' + st.lrn, b); }); }));
      jobs.push(P.blobDel('first:' + st.lrn + ':' + L.id));
      Promise.all(jobs).then(function () {
        return P.queue('daily', { lrn: st.lrn, pinHash: P.state.session.pinHash, rec: r }, r.audioStatus === 'recorded' ? [{ key: key, itemId: 'main' }] : []);
      }).then(function () {
        cleanupOld(st, pg, L.id);
        var after = stats(st, pg), nb = earned(after, pg).filter(function (b) { return before.indexOf(b) < 0; });
        celebrate(L, r, after, nb);
      }).catch(function (e) { P.busy(btn, false); P.toast('Could not save: ' + e.message, 'bad', 6000); });
    }
    show();
  }

  function cleanupOld(st, pg, keepId) {
    // keep only the 5 most recent recordings on the phone to save space (they are already uploaded)
    var ids = P.sortBy(Object.keys(pg.lessons), function (id) { return pg.lessons[id].completedAt || ''; }).reverse();
    P.outboxAll().then(function (ob) {
      var waiting = {}; ob.forEach(function (o) { if (o.payload && o.payload.rec) waiting[o.payload.rec.lessonId] = 1; });
      ids.slice(5).forEach(function (id) { if (id !== keepId && !waiting[id]) P.blobDel('rec:' + st.lrn + ':' + id); });
    });
  }

  function celebrate(L, r, x, nb) {
    P.confetti(110);
    var div = document.createElement('div'); div.className = 'celebrate';
    var badgeHtml = nb.map(function (k) { var b = BADGES.find(function (z) { return z[0] === k; }); return b ? '<div class="badge got" style="display:inline-block"><div class="b">' + b[1] + '</div>' + esc(b[2]) + '</div>' : ''; }).join('');
    div.innerHTML = '<div class="box"><div class="big-pearl"></div><h2>+1 Pearl!</h2><p>Day ' + esc(L.day) + ' complete · Quiz ' + esc(r.score) + '/' + esc(r.total) + '<br>You now have <b>' + x.pearls + '</b> pearls and <b>' + x.points + '</b> points.</p>' +
      (badgeHtml ? '<p class="small" style="font-weight:700">New badge' + (nb.length > 1 ? 's' : '') + ' unlocked!</p><div>' + badgeHtml + '</div>' : '') +
      '<p class="small muted" id="upmsg">' + (navigator.onLine ? 'Uploading your work…' : 'Saved on this phone. It will upload automatically when you have internet. 📶') + '</p><button class="btn block lg" id="cont">Continue</button></div>';
    document.body.appendChild(div);
    var upd = function () { var m = P.$('#upmsg'); if (m && !P.state.pending) m.textContent = 'Uploaded to your teacher ✓'; };
    var un = P.on('uploaded', upd);
    P.$('#cont').onclick = function () { un(); div.remove(); P.go('student', {}, true); };
  }

  /* ---------------- assessments ---------------- */
  P.views.assess = function (params) {
    var st = me(); if (!st) return P.go('studentLogin', {}, true);
    var A = P.state.assessments.find(function (a) { return a.id === params.id; });
    if (!A) { P.toast('Test not found. Please sync.'); return P.go('student', {}, true); }
    loadPg(st).then(function (pg) {
      if (pg.results[A.id]) return assessDone(st, A, pg.results[A.id]);
      var D = pg.drafts['A:' + A.id] || { answers: {}, started: null, audio: {} };
      pg.drafts['A:' + A.id] = D;
      var items = P.assessmentItems(A), recs = {}, tick;
      var save = function () { P.setProgress(st.lrn, pg); };
      var typeLbl = { pre: 'Pre-Test', post: 'Post-Test', releveling: 'Releveling Exam', monthly: 'Monthly Long Quiz', exam: 'Term Exam' }[A.type] || 'Assessment';
      if (!D.started) {
        P.$('#app').innerHTML = P.topbar() + '<div class="narrow"><div class="card center"><div style="font-size:2.4rem">📝</div><span class="chip">' + typeLbl + '</span><h2 style="margin-top:8px">' + esc(A.title) + '</h2><p>' + esc(A.instructions || 'Read each item carefully and answer honestly.') + '</p>' +
          '<p class="small muted">' + items.length + ' items' + (A.timeMin ? ' · ' + A.timeMin + ' minutes' : '') + (A.type === 'releveling' ? ' · Passing: ' + (A.passPct || 75) + '%' : '') + '</p><p class="small muted">You can only take this once. Your answers are saved even without internet.</p>' +
          '<div class="row" style="justify-content:center"><button class="btn ghost" onclick="history.back()">Not now</button><button class="btn lg" id="start">Start</button></div></div></div>';
        P.$('#start').onclick = function () { D.started = new Date().toISOString(); save(); P.rerender(); };
        return;
      }
      var h = '<div class="lesson-top"><div class="row"><button class="icon-btn" onclick="history.back()">' + P.icon('back', 22) + '</button><div class="grow"><div class="small muted">' + typeLbl + '</div><b>' + esc(A.title) + '</b></div>' + (A.timeMin ? '<span class="timer" id="atm"></span>' : '') + '</div></div><div class="wrap" style="max-width:820px">';
      var n = 0;
      (A.sections || []).forEach(function (sec) {
        h += '<div class="card" style="margin-bottom:12px"><h3>' + esc(sec.title || '') + '</h3>' + (sec.passage ? '<div class="passage" style="margin-bottom:12px">' + String(sec.passage).split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' : '');
        (sec.items || []).forEach(function (it) {
          n++; var a = D.answers[it.id];
          h += '<div class="q-card" style="margin-bottom:10px"><div class="q-num">Item ' + n + ' · ' + (Number(it.pts) || 1) + ' pt' + ((Number(it.pts) || 1) > 1 ? 's' : '') + '</div><div class="q-text" style="font-size:1.02rem">' + esc(it.q) + '</div>';
          if (it.type === 'mcq') h += (it.opts || []).map(function (o, k) { var L = 'ABCD'.charAt(k); return '<button class="opt ' + (a === L ? 'sel' : '') + '" data-mcq="' + esc(it.id) + '" data-o="' + L + '"><b>' + L + '</b><span>' + esc(o) + '</span></button>'; }).join('');
          else if (it.type === 'short') h += '<input class="in" data-txt="' + esc(it.id) + '" value="' + esc(a || '') + '" placeholder="Your answer">';
          else if (it.type === 'essay') h += '<textarea class="in" data-txt="' + esc(it.id) + '" placeholder="Write your answer…">' + esc(a || '') + '</textarea>';
          else if (it.type === 'spelling') h += '<div class="row"><button class="btn soft sm" data-spell="' + esc(it.word) + '">🔊 Hear the word</button><input class="in grow" style="max-width:300px" data-txt="' + esc(it.id) + '" value="' + esc(a || '') + '" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type the word"></div>';
          else if (it.type === 'oral') h += '<div class="row"><button class="btn bad sm" data-orec="' + esc(it.id) + '">🎙️ Record</button><span class="small" id="os-' + esc(it.id) + '">' + (D.audio[it.id] ? 'Recorded ' + P.mmss(D.audio[it.id]) + ' ✓' : 'Not recorded yet') + '</span></div>';
          h += '</div>';
        });
        h += '</div>';
      });
      h += '<div class="bottom-bar"><span class="small muted" id="ans"></span><button class="btn ok" id="fin">Submit test</button></div></div>';
      P.$('#app').innerHTML = h;
      var count = function () { var c = items.filter(function (it) { return it.type === 'oral' ? D.audio[it.id] : (D.answers[it.id] || '').toString().trim(); }).length; P.$('#ans').textContent = c + ' of ' + items.length + ' answered'; };
      count();
      P.$$('[data-mcq]').forEach(function (b) { b.onclick = function () { D.answers[b.dataset.mcq] = b.dataset.o; save(); P.$$('[data-mcq="' + b.dataset.mcq + '"]').forEach(function (x) { x.classList.toggle('sel', x === b); }); count(); }; });
      P.$$('[data-txt]').forEach(function (t) { t.oninput = function () { D.answers[t.dataset.txt] = t.value; save(); count(); }; });
      P.$$('[data-spell]').forEach(function (b) { b.onclick = function () { P.speak(b.dataset.spell, null, 0.7); }; });
      P.$$('[data-orec]').forEach(function (b) {
        b.onclick = function () {
          var id = b.dataset.orec, lab = P.$('#os-' + id);
          if (recs[id]) { recs[id].stop().then(function (r) { delete recs[id]; b.textContent = '🎙️ Record again'; if (r.sec < 3) { lab.textContent = 'Too short, try again.'; return; } P.blobSet('arec:' + st.lrn + ':' + A.id + ':' + id, r.blob).then(function () { D.audio[id] = r.sec; save(); lab.textContent = 'Recorded ' + P.mmss(r.sec) + ' ✓'; count(); }); }); return; }
          var R = new P.Recorder(); R.start(function (s) { lab.textContent = '● Recording ' + P.mmss(s); }).then(function () { recs[id] = R; b.textContent = '⏹ Stop'; }).catch(function (e) { lab.textContent = e.message; });
        };
      });
      if (A.timeMin) {
        var end = new Date(D.started).getTime() + A.timeMin * 60000;
        tick = setInterval(function () { var left = (end - Date.now()) / 1000, el = P.$('#atm'); if (el) el.textContent = P.mmss(Math.max(0, left)); if (left <= 0) { clearInterval(tick); P.toast('Time is up! Submitting your test.'); finish(); } }, 1000);
      }
      var maxL = Number(S().maxLeavesTest) || 0, done = false;
      var unguard = Guard.start(st, 'Test: ' + A.title, {
        leaveNote: function (n) { return maxL ? 'You left the test ' + n + ' time' + (n > 1 ? 's' : '') + '. After ' + maxL + ', your test is submitted automatically.' : 'Leaving the test is recorded.'; },
        onLeave: function (n) { D.leaves = (D.leaves || 0) + 1; save(); if (maxL && D.leaves >= maxL && !done) { P.logEvent('test-auto-submit', A.title + ' after ' + D.leaves + ' exits'); finish(true); } }
      });
      P.cleanup = function () { unguard(); clearInterval(tick); Object.keys(recs).forEach(function (k) { recs[k].cancel(); }); };
      P.$('#fin').onclick = function () {
        var missing = items.filter(function (it) { return it.type === 'oral' ? !D.audio[it.id] : !(D.answers[it.id] || '').toString().trim(); }).length;
        P.confirm(missing ? 'You still have <b>' + missing + '</b> unanswered item(s). Submit anyway?' : 'Submit your test now? You cannot change your answers after this.', 'Submit').then(function (ok) { if (ok) finish(); });
      };
      function finish(byLeaving) {
        if (done) return; done = true;
        clearInterval(tick);
        var auto = 0, autoTotal = 0, manual = 0, detail = {};
        items.forEach(function (it) {
          var pts = Number(it.pts) || 1, a = D.answers[it.id];
          if (it.type === 'mcq') { autoTotal += pts; var ok = a === it.ans; if (ok) auto += pts; detail[it.id] = ok ? pts : 0; }
          else if (it.type === 'short' && it.accept) { autoTotal += pts; var sg = P.Check.testItem(it, a); var ok3 = !!sg.exact; if (ok3) auto += pts; detail[it.id] = ok3 ? pts : 0; }
          else if (it.type === 'spelling') { autoTotal += pts; var ok2 = String(a || '').trim().toLowerCase() === String(it.word || '').trim().toLowerCase(); if (ok2) auto += pts; detail[it.id] = ok2 ? pts : 0; }
          else manual += pts;
        });
        var now = new Date().toISOString();
        var r = { id: st.lrn + '-' + A.id + '-' + P.uid(), assessmentId: A.id, title: A.title, type: A.type, level: st.level, answers: D.answers, auto: detail, autoScore: auto, autoTotal: autoTotal, manualPending: manual, completedAt: now, startedAt: D.started, leaves: D.leaves || 0, autoSubmitted: !!byLeaving, device: P.deviceId(), cycle: st.cycle || 0 };
        var blobs = items.filter(function (it) { return it.type === 'oral' && D.audio[it.id]; }).map(function (it) { return { key: 'arec:' + st.lrn + ':' + A.id + ':' + it.id, itemId: it.id }; });
        pg.results[A.id] = { autoScore: auto, autoTotal: autoTotal, manualPending: manual, completedAt: now, type: A.type };
        delete pg.drafts['A:' + A.id];
        P.setProgress(st.lrn, pg).then(function () { return P.queue('result', { lrn: st.lrn, pinHash: P.state.session.pinHash, rec: r }, blobs); })
          .then(function () { if (!byLeaving) P.confetti(60); else P.modal('Test submitted', '<p>Your test was submitted automatically because you left the app ' + (D.leaves || 0) + ' times.</p>'); assessDone(st, A, pg.results[A.id]); });
      }
    });
  };
  function assessDone(st, A, r) {
    var pc = P.pct(r.autoScore, r.autoTotal);
    P.$('#app').innerHTML = P.topbar() + '<div class="narrow"><div class="card center"><div style="font-size:2.4rem">🎓</div><h2>Test submitted!</h2><p><b>' + esc(A.title) + '</b></p>' +
      (r.autoTotal ? '<p style="font-size:1.4rem;font-family:var(--head)">' + r.autoScore + ' / ' + r.autoTotal + ' <span class="small muted">(' + pc + '% on auto-checked items)</span></p>' : '') +
      (r.manualPending ? '<p class="small muted">Your teacher will check your written/oral answers (' + r.manualPending + ' pts).</p>' : '') +
      (r.grade ? '<div class="note info">Your teacher has checked your test. ' + esc(r.grade.comment || '') + '</div>' : '') +
      (A.type === 'releveling' ? '<p class="small">If your total score reaches <b>' + (A.passPct || 75) + '%</b>, your teacher will move you up to <b>' + esc(A.toLevel || 'the next level') + '</b>. Keep going! 💪</p>' : '') +
      '<button class="btn block" onclick="P.go(\'student\',{},true)">Back to my pearls</button></div></div>';
  }
})();
