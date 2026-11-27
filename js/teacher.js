/* PEARL App — Teacher & Coordinator workspace */
(function () {
  'use strict';
  var P = window.P, esc = P.esc;
  var T = P.T = { tab: 'dash', dash: null, f: { section: '', level: '', week: 1, watchDay: 0, imp: 'prepost' } };
  var TYPE_LBL = { pre: 'Pre-Test', post: 'Post-Test', releveling: 'Releveling Exam', monthly: 'Monthly Long Quiz', exam: 'Term Exam', other: 'Other' };
  function S() { return P.state.settings; }
  function user() { return (P.state.session || {}).user || {}; }
  function isAdmin() { return user().role === 'admin'; }

  /* ---------------- data ---------------- */
  function mySections() { var s = String(user().sections || 'ALL'); return isAdmin() || /\ball\b/i.test(s) ? null : s.split(',').map(function (x) { return x.trim().toLowerCase(); }); }
  function visibleStudents() { var ms = mySections(); return P.state.students.filter(function (s) { return !ms || ms.indexOf(String(s.section).toLowerCase()) >= 0; }); }
  function filtered() { return visibleStudents().filter(function (s) { return s.active !== false && (!T.f.section || s.section === T.f.section) && (!T.f.level || s.level === T.f.level); }); }
  function toObjs(fields, rows) { return (rows || []).map(function (r) { var o = {}; fields.forEach(function (f, i) { o[f] = r[i]; }); return o; }); }
  P.loadDash = function (force) {
    var get = T.dash && !force ? Promise.resolve(T.dash) : P.kvGet('dash:' + user().username + (P.state.viewSy || '')).then(function (d) { if (d) T.dash = d; return d; });
    return get.then(function () {
      return P.api('dashboard', {}, 120000).then(function (res) {
        T.dash = { generated: res.generated, daily: toObjs(res.dailyFields, res.daily), results: toObjs(res.resultFields, res.results), levelHistory: res.levelHistory || [] };
        P.kvSet('dash:' + user().username + (P.state.viewSy || ''), T.dash); return T.dash;
      }).catch(function (e) { if (!T.dash) T.dash = { daily: [], results: [], levelHistory: [], generated: '' }; if (!e.network) P.toast(e.message, 'bad'); return T.dash; });
    });
  };
  function index(allRounds) {
    var d = T.dash || { daily: [], results: [] }, by = {}, cyc = {};
    P.state.students.forEach(function (s) { cyc[s.lrn] = Number(s.cycle) || 0; });
    d.daily.forEach(function (r) { if (!allRounds && (Number(r.cycle) || 0) !== (cyc[r.lrn] || 0)) return; (by[r.lrn] = by[r.lrn] || []).push(r); });
    return by;
  }
  function studentStats(s, recs) {
    recs = P.sortBy(recs || [], function (r) { return r.completedAt || ''; });
    var q = recs.filter(function (r) { return Number(r.total); }).map(function (r) { return r.score / r.total * 100; });
    var R = Number(S().releasedDay) || 40;
    var days = {}; recs.forEach(function (r) { if (Number(r.day) <= R) days[r.day] = 1; });
    var first5 = q.slice(0, 5), last5 = q.slice(-5), last10 = q.slice(-10);
    return {
      done: recs.length, doneDays: Object.keys(days).length, completion: P.pct(Object.keys(days).length, R),
      avg: q.length ? Math.round(P.avg(q)) : null, audio: recs.filter(function (r) { return r.audioStatus === 'recorded'; }).length,
      live: recs.filter(function (r) { return r.audioStatus === 'live'; }).length, written: recs.filter(function (r) { return r.written === 'Y'; }).length,
      last: recs.length ? recs[recs.length - 1].completedAt : '', trend: q.length >= 6 ? Math.round(P.avg(last5) - P.avg(first5)) : null,
      recent: last10.length >= 10 ? Math.round(P.avg(last10)) : null, recs: recs
    };
  }
  function prePost(lrn) {
    var rs = (T.dash.results || []).filter(function (r) { return r.lrn === lrn; });
    var get = function (type) { var r = P.sortBy(rs.filter(function (x) { return x.type === type; }), function (x) { return x.completedAt; })[0]; if (!r) return null; var A = P.state.assessments.find(function (a) { return a.id === r.assessmentId; }); return P.resultPct(r, A).pct; };
    return { pre: get('pre'), post: get('post') };
  }
  function flagTime(r) { return r.completedAt && r.syncedAt && new Date(r.completedAt) - new Date(r.syncedAt) > 5 * 60000; }

  /* ---------------- shell ---------------- */
  P.views.teacher = function (params) {
    if (!P.state.session || P.state.session.role !== 'teacher') return P.go('teacherLogin', {}, true);
    if (params && params.tab) T.tab = params.tab;
    var who = user().username;
    if (T.user !== who) { T.user = who; T.dash = null; T.tstats = null; T.tab = T.tab || 'dash'; T.f = { section: '', level: '', week: 1, watchDay: 0, imp: 'prepost' }; csel = {}; sel = {}; }
    shell();
    P.loadDash().then(function () { if (P.$('#t-body')) body(); });
  };
  var TABS = [['dash', 'chart', 'Dashboard'], ['progress', 'calendar', 'Progress Chart'], ['checking', 'check', 'Checking'], ['students', 'users', 'Learners'], ['tests', 'clipboard', 'Tests'], ['materials', 'book', 'Materials'], ['reports', 'printer', 'Reports'], ['teachers', 'award', 'Teachers'], ['security', 'shield', 'Security'], ['settings', 'settings', 'Settings']];
  var TITLES = { dash: 'Dashboard', progress: 'Progress Chart', checking: 'Checking', students: 'Learners', tests: 'Tests & Assessments', materials: 'Learning Materials', reports: 'Reports', security: 'Security & Devices', teachers: 'Teachers & Recognition', settings: 'Settings' };
  function shell() {
    var u = user();
    P.$('#app').innerHTML = P.topbar('<button class="icon-btn" data-refresh title="Refresh data">' + P.icon('refresh', 20) + '</button><button class="icon-btn" data-out title="Log out">' + P.icon('logout', 20) + '</button>') +
      '<div class="t-shell"><aside class="side">' + yearPicker() + '<div class="nav">' + TABS.map(function (t) { return '<button class="tab ' + (T.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + P.icon(t[1], 19) + '<span>' + t[2] + '</span></button>'; }).join('') + '</div>' +
      '<div class="who"><b style="color:var(--ink-2)">' + esc(u.name || u.username) + '</b><br>' + (u.role === 'admin' ? 'Program Coordinator' : 'Teacher') + '<br>Sections: ' + esc(u.sections || 'ALL') + '</div></aside>' +
      '<main class="t-main">' + (P.state.viewSy ? '<div class="arch-bar">' + P.icon('book', 18) + '<span class="grow">Viewing <b>SY ' + esc(P.state.settings.schoolYear) + '</b> (archived). You can view, print reports and finish checking, but not change records.</span><button class="btn sm" data-exit-year>Back to current year</button></div>' : '') + '<div class="wrap"><div class="page-h"><h2 id="t-title">' + esc(TITLES[T.tab] || '') + '</h2></div><div id="t-body"><div class="empty">Loading…</div></div></div>' + P.credit() + '</main></div>';
    P.$$('.side [data-tab]').forEach(function (b) { b.onclick = function () { T.tab = b.dataset.tab; P.$$('.side [data-tab]').forEach(function (x) { x.classList.toggle('on', x === b); }); P.$('#t-title').textContent = TITLES[T.tab] || ''; body(); window.scrollTo(0, 0); }; });
    P.$('[data-out]').onclick = function () { exitYear(true); P.logout(); };
    var yp = P.$('[data-year]'); if (yp) yp.onchange = function () { if (yp.value === 'current') exitYear(); else enterYear(yp.value); };
    var ex = P.$('[data-exit-year]'); if (ex) ex.onclick = function () { exitYear(); };
    P.$('[data-refresh]').onclick = function (e) { var b = e.currentTarget; b.classList.add('spin'); P.sync({ silent: true }).then(function () { return P.loadDash(true); }).then(function () { b.classList.remove('spin'); body(); P.toast('Data refreshed', 'ok'); }); };
  }
  /* ---------- school years ---------- */
  function archives() { return ((T.stash ? T.stash.settings : P.state.settings).archives || []).slice().reverse(); }
  function yearPicker() {
    var arcs = archives(); if (!arcs.length) return '';
    var curSy = (T.stash ? T.stash.settings : P.state.settings).schoolYear;
    return '<div class="year-pick"><label class="f">' + P.icon('calendar', 14) + ' School year</label><select class="in" data-year><option value="current">SY ' + esc(curSy) + ' · current</option>' + arcs.map(function (a) { return '<option value="' + esc(a.id) + '" ' + (P.state.viewSy === a.id ? 'selected' : '') + '>SY ' + esc(a.sy) + ' · archive</option>'; }).join('') + '</select></div>';
  }
  function enterYear(id) {
    var arc = archives().find(function (a) { return a.id === id; }); if (!arc) return;
    P.toast('Opening SY ' + arc.sy + '…');
    P.api('pull', { sy: id, have: {} }, 120000).then(function (r) {
      if (!T.stash) T.stash = { settings: P.state.settings, students: P.state.students, lessons: P.state.lessons, assessments: P.state.assessments, users: P.state.users, dash: T.dash, tstats: T.tstats };
      var s = P.state;
      s.settings = Object.assign({}, P.DEFAULT_SETTINGS, r.settings || {}, { schoolYear: arc.sy });
      s.students = r.students || []; s.lessons = r.lessons || []; s.assessments = r.assessments || []; s.users = r.users || T.stash.users;
      s.viewSy = id; T.dash = null; T.tstats = null; csel = {}; sel = {};
      shell(); P.loadDash(true).then(function () { body(); });
    }).catch(function (e) { P.toast(e.network ? 'Connect to the internet to open a past school year.' : e.message, 'bad'); var yp = P.$('[data-year]'); if (yp) yp.value = P.state.viewSy || 'current'; });
  }
  function exitYear(silent) {
    if (!T.stash) return;
    var s = P.state, k = T.stash;
    s.settings = k.settings; s.students = k.students; s.lessons = k.lessons; s.assessments = k.assessments; s.users = k.users; s.viewSy = null;
    T.dash = k.dash; T.tstats = k.tstats; T.stash = null; csel = {}; sel = {};
    if (silent) return;
    shell(); P.loadDash().then(function () { body(); });
  }
  P.exitYear = exitYear;
  function closeYearDialog() {
    var s = S(), cur = String(s.schoolYear || ''), m0 = cur.match(/(\d{4})\D+(\d{4})/), next = m0 ? (Number(m0[1]) + 1) + '–' + (Number(m0[2]) + 1) : '';
    var nStud = P.state.students.length, n11 = P.state.students.filter(function (x) { return /^11/.test(String(x.grade)); }).length;
    var m = P.modal('Start a new school year', '<div class="note info small"><b>What happens:</b><ol style="margin:6px 0 0;padding-left:18px"><li>A complete copy of this year\'s database (learners, daily work, tests, checking, levels, logins, lessons) is saved as <b>“PEARL Archive — SY ' + esc(cur) + '”</b> in your Google Drive. The copy is checked before anything is cleared.</li><li>The new year starts with no submissions. Lessons, tests (closed), teacher accounts and settings stay.</li><li>You can open SY ' + esc(cur) + ' anytime from the <b>School year</b> menu to view, print reports and finish checking. Recordings stay in Drive.</li></ol></div>' +
      '<div class="field" style="margin-top:12px"><label class="f">Current school year (to be archived)</label><input class="in" value="SY ' + esc(cur) + '" disabled></div>' +
      '<div class="field"><label class="f">New school year</label><input class="in" id="ny" value="' + esc(next) + '" placeholder="e.g. 2027–2028"></div>' +
      '<label class="f">Learners for the new year</label>' +
      '<label class="check" style="margin:6px 0"><input type="radio" name="keep" value="none" checked> Start with an empty list (import the new learners)</label>' +
      '<label class="check" style="margin:6px 0"><input type="radio" name="keep" value="g11"> Keep the ' + n11 + ' Grade 11 learner(s) as Grade 12 (sections cleared; re-import to set them). Grade 12 learners are removed (graduated).</label>' +
      '<label class="check" style="margin:6px 0"><input type="radio" name="keep" value="all"> Keep all ' + nStud + ' learners (only their work is cleared)</label>' +
      '<p class="small muted">Tip: finish checking and print your reports first. You can still do both later from the archive.</p>', { foot: '<button class="btn ghost" data-x>Cancel</button><button class="btn" id="cy">Archive SY ' + esc(cur) + ' and start the new year</button>' });
    m.querySelector('#cy').onclick = function (e) {
      var ny = m.querySelector('#ny').value.trim(), keep = (m.querySelector('input[name=keep]:checked') || {}).value || 'none';
      if (!ny) return P.toast('Type the new school year.');
      if (ny.replace(/\D/g, '') === cur.replace(/\D/g, '')) return P.toast('The new school year must be different.');
      P.confirm('Archive <b>SY ' + esc(cur) + '</b> and start <b>SY ' + esc(ny) + '</b>?', 'Yes, start the new year').then(function (ok) {
        if (!ok) return; P.busy(e.target, true, 'Archiving (this can take a minute)');
        P.api('closeYear', { newSy: ny, keep: keep }, 300000).then(function (r) { return P.pull(true).then(function () { return r; }); }).then(function (r) {
          m.close(); T.dash = null; T.tstats = null; P.kvDel('dash:' + user().username);
          P.modal('Welcome to SY ' + esc(ny) + '!', '<p>SY ' + esc(r.archive.sy) + ' is safely archived: <b>' + r.archive.learners + '</b> learners, <b>' + r.archive.submissions + '</b> daily submissions, <b>' + r.archive.tests + '</b> test results.</p>' + (/^https?:/.test(r.archive.url) ? '<p><a href="' + esc(r.archive.url) + '" target="_blank" rel="noopener">Open the archive in Google Sheets</a></p>' : '') + '<p class="small">' + (r.kept ? r.kept + ' learner(s) were kept. ' : '') + 'Next: import this year\'s learners in <b>Learners</b>, open the pre-test, and set <b>Released up to Day</b>.</p>');
          shell(); P.loadDash(true).then(function () { body(); });
        }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad', 7000); });
      });
    };
  }
  function yearsCard() {
    var s = S(), arcs = archives();
    return '<div class="card" style="margin-top:12px"><div class="row between"><h3 style="margin:0">' + P.icon('calendar', 18) + ' School years</h3>' + (isAdmin() ? '<button class="btn sm" data-newyear>' + P.icon('plus', 16) + ' Start a new school year</button>' : '') + '</div>' +
      '<p class="small" style="margin-top:8px">Current: <b>SY ' + esc(s.schoolYear) + '</b> · ' + P.state.students.length + ' learners</p>' +
      (arcs.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>School year</th><th class="c">Learners</th><th class="c">Daily work</th><th class="c">Tests</th><th>Archived</th><th></th></tr></thead><tbody>' + arcs.map(function (a) { return '<tr><td><b>SY ' + esc(a.sy) + '</b></td><td class="c">' + esc(a.learners) + '</td><td class="c">' + esc(a.submissions) + '</td><td class="c">' + esc(a.tests) + '</td><td class="small">' + esc(P.fmtDate(a.closedAt)) + ' · ' + esc(a.by || '') + '</td><td style="white-space:nowrap"><button class="btn xs" data-viewyear="' + esc(a.id) + '">View</button> ' + (/^https?:/.test(a.url) ? '<a class="btn xs ghost" href="' + esc(a.url) + '" target="_blank" rel="noopener">Sheet</a>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="small muted">No archived school years yet. At the end of the school year, tap <b>Start a new school year</b>. All of this year\'s records are kept in an archive you can open anytime.</p>') + '</div>';
  }

  function body() {
    if (!T.dash && ['settings', 'teachers', 'security', 'materials'].indexOf(T.tab) < 0) { var el = P.$('#t-body'); if (el) el.innerHTML = '<div class="empty">Loading…</div>'; P.loadDash(true).then(function () { if (T.dash) body(); }); return; }
    var fn = { dash: tDash, progress: tProgress, checking: tChecking, security: tSecurity, teachers: tTeachers, students: tStudents, tests: tTests, materials: tMaterials, reports: tReports, settings: tSettings }[T.tab];
    try { fn(P.$('#t-body')); } catch (e) { console.error(e); P.$('#t-body').innerHTML = '<div class="card">Error: ' + esc(e.message) + '</div>'; }
  }
  P.tBody = body;

  function filterBar(extra) {
    var secs = P.sections().filter(function (s) { var ms = mySections(); return !ms || ms.indexOf(s.toLowerCase()) >= 0; });
    return '<div class="row" style="margin-bottom:12px"><select class="in" style="max-width:220px" data-f="section"><option value="">All sections</option>' + secs.map(function (s) { return '<option ' + (T.f.section === s ? 'selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      '<select class="in" style="max-width:200px" data-f="level"><option value="">All levels</option>' + P.LEVELS.map(function (l) { return '<option ' + (T.f.level === l ? 'selected' : '') + ' value="' + l + '">' + esc(P.alias(l)) + '</option>'; }).join('') + '</select>' + (extra || '') +
      '<span class="grow"></span><span class="tiny muted">Data as of ' + esc(P.fmtDate(T.dash && T.dash.generated, true)) + '</span></div>';
  }
  function bindFilters(root) { P.$$('[data-f]', root).forEach(function (el) { el.onchange = function () { T.f[el.dataset.f] = el.dataset.f === 'week' || el.dataset.f === 'watchDay' ? Number(el.value) : el.value; body(); }; }); }

  /* ---------------- DASHBOARD ---------------- */
  function tDash(root) {
    var st = filtered(), by = index(), R = Number(S().releasedDay) || 40;
    var stats = st.map(function (s) { return { s: s, x: studentStats(s, by[s.lrn]) }; });
    var lv = P.groupBy(st, function (s) { return s.level; });
    var done = P.sum(stats.map(function (o) { return o.x.doneDays; })), possible = st.length * R;
    var avgs = stats.filter(function (o) { return o.x.avg != null; }).map(function (o) { return o.x.avg; });
    var today = P.dayKey(), todayN = stats.filter(function (o) { return o.x.recs.some(function (r) { return P.dayKey(r.completedAt) === today; }); }).length;
    var latestDay = Math.max.apply(null, [0].concat((T.dash.daily || []).map(function (r) { return Number(r.day) || 0; })));
    var wd = T.f.watchDay || latestDay || 1;
    var h = filterBar();
    h += '<div class="grid g4">' + kpi(st.length, 'Learners') + kpi(P.pct(done, possible) + '%', 'Task completion (Days 1–' + R + ')') + kpi(avgs.length ? Math.round(P.avg(avgs)) + '%' : '—', 'Average quiz score') + kpi(todayN, 'Finished a pearl today') +
      kpi(P.sum(stats.map(function (o) { return o.x.audio; })), 'Audio recordings') + kpi(P.sum(stats.map(function (o) { return o.x.written; })), 'Written tasks') + kpi((T.dash.daily || []).filter(function (r) { return !r.grade && st.some(function (s) { return s.lrn === r.lrn; }); }).length, 'Waiting to be checked') + (function () { var a = (T.dash.daily || []).filter(function (r) { return st.some(function (s) { return s.lrn === r.lrn; }); }); return kpi(a.length ? Math.round(a.filter(function (r) { return r.grade; }).length / a.length * 100) + '%' : '—', 'Work checked by teachers'); })() + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>Learners by reading level</h3><div class="lvl-bars">' + P.LEVELS.map(function (l) { var n = (lv[l] || []).length; return n ? '<i style="width:' + P.pct(n, st.length) + '%;background:var(--' + l.slice(0, 3).toLowerCase() + ')" title="' + l + ': ' + n + '"></i>' : ''; }).join('') + '</div>' +
      '<div class="row" style="margin-top:8px">' + P.LEVELS.map(function (l) { var n = (lv[l] || []).length; return '<span class="small"><span class="dot" style="background:var(--' + l.slice(0, 3).toLowerCase() + ')"></span> <b>' + esc(P.alias(l)) + '</b>: ' + n + ' (' + P.pct(n, st.length) + '%)</span>'; }).join('') + '</div></div>';
    // section table
    var secs = P.groupBy(stats, function (o) { return o.s.section || '—'; });
    h += '<div class="card" style="margin-top:12px"><h3>Completion by section</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Section</th><th class="c">Learners</th><th>Completion</th><th class="c">Avg quiz</th><th class="c">Audio</th><th class="c">Beg/Int/Adv</th><th>Last activity</th></tr></thead><tbody>' +
      Object.keys(secs).sort().map(function (k) {
        var a = secs[k], c = P.pct(P.sum(a.map(function (o) { return o.x.doneDays; })), a.length * R), av = a.filter(function (o) { return o.x.avg != null; }).map(function (o) { return o.x.avg; });
        var last = a.map(function (o) { return o.x.last; }).filter(Boolean).sort().pop();
        var cnt = P.LEVELS.map(function (l) { return a.filter(function (o) { return o.s.level === l; }).length; }).join(' / ');
        return '<tr><td><b>' + esc(k) + '</b></td><td class="c">' + a.length + '</td><td><div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ok grow"><i style="width:' + c + '%"></i></div><span class="small">' + c + '%</span></div></td><td class="c">' + (av.length ? Math.round(P.avg(av)) + '%' : '—') + '</td><td class="c">' + P.sum(a.map(function (o) { return o.x.audio; })) + '</td><td class="c small">' + cnt + '</td><td class="small">' + esc(P.fmtDate(last, true)) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    // WATCH + most improved
    var watch = (T.dash.daily || []).filter(function (r) { return Number(r.day) === wd && st.some(function (s) { return s.lrn === r.lrn; }); });
    watch = P.sortBy(watch, function (r) { return r.completedAt; }).slice(0, 10);
    var sm = {}; P.state.students.forEach(function (s) { sm[s.lrn] = s; });
    h += '<div class="grid g2" style="margin-top:12px"><div class="card"><div class="row between"><h3 style="margin:0">' + P.icon('clock', 18) + ' ' + esc(S().watchName) + ': First to Submit</h3><select class="in" style="max-width:120px" data-f="watchDay">' + Array.from({ length: Math.max(latestDay, 1) }, function (_, i) { return '<option value="' + (i + 1) + '" ' + (wd === i + 1 ? 'selected' : '') + '>Day ' + (i + 1) + '</option>'; }).join('') + '</select></div><p class="tiny muted">' + esc(S().watchFull) + '</p>' +
      (watch.length ? '<div class="board"><ol>' + watch.map(function (r, i) { var s = sm[r.lrn] || {}; return '<li><span class="rank r' + (i + 1) + '">' + (i + 1) + '</span><span class="grow"><span class="name" data-stu="' + esc(r.lrn) + '">' + esc(P.name(s)) + '</span><div class="tiny muted">' + esc(s.section) + ' · ' + esc(r.level) + '</div></span><span class="small">' + esc(P.fmtDate(r.completedAt, true)) + (flagTime(r) ? ' <span title="Device clock looks wrong (submitted time is later than upload time)">⚠️</span>' : '') + '</span></li>'; }).join('') + '</ol></div>' : '<p class="muted small">No submissions for this day yet.</p>') + '</div>';
    h += '<div class="card"><div class="row between"><h3 style="margin:0">' + P.icon('trending', 18) + ' Most Improved</h3><div class="seg"><button data-imp="prepost" class="' + (T.f.imp === 'prepost' ? 'on' : '') + '">Pre → Post</button><button data-imp="trend" class="' + (T.f.imp === 'trend' ? 'on' : '') + '">Quiz trend</button></div></div>' + improvedList(st, by, 8) + '</div></div>';
    // attention + releveling
    var idle = stats.filter(function (o) { var last = o.x.last ? new Date(o.x.last) : null; return !last || Date.now() - last > 5 * 864e5; });
    var low = stats.filter(function (o) { return o.x.avg != null && o.x.avg < 60 && o.x.done >= 3; });
    var cand = stats.filter(function (o) { return o.x.recent != null && o.x.recent >= 85 && o.s.level !== 'Advanced'; });
    h += '<div class="grid g3" style="margin-top:12px">' + listCard(P.icon('clock', 18) + ' No activity in 5+ days', idle.slice(0, 12), function (o) { return o.x.last ? 'last ' + P.fmtDate(o.x.last) : 'not started'; }, idle.length) +
      listCard(P.icon('alert', 18) + ' Needs support (avg < 60%)', low.slice(0, 12), function (o) { return o.x.avg + '%'; }, low.length) +
      listCard(P.icon('award', 18) + ' Ready for releveling? (last 10 ≥ 85%)', cand.slice(0, 12), function (o) { return o.x.recent + '%'; }, cand.length) + '</div>';
    root.innerHTML = h; bindFilters(root); bindStu(root);
    P.$$('[data-imp]', root).forEach(function (b) { b.onclick = function () { T.f.imp = b.dataset.imp; body(); }; });
  }
  function kpi(v, l) { return '<div class="card kpi"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div></div>'; }
  function listCard(title, arr, fn, total) {
    return '<div class="card"><h3>' + title + ' <span class="chip gray">' + total + '</span></h3>' + (arr.length ? arr.map(function (o) { return '<div class="row between small" style="padding:4px 0;border-bottom:1px dashed var(--line)"><span class="name" data-stu="' + esc(o.s.lrn) + '">' + esc(P.name(o.s)) + '</span><span class="muted">' + esc(o.s.section) + ' · ' + esc(fn(o)) + '</span></div>'; }).join('') : '<p class="small muted">None 🎉</p>') + '</div>';
  }
  P.improved = function (st, by, mode) {
    var out = st.map(function (s) {
      if (mode === 'trend') { var x = studentStats(s, by[s.lrn]); return x.trend == null ? null : { s: s, a: Math.round(x.recs.slice(0, 5).filter(function (r) { return r.total; }).reduce(function (t, r) { return t + r.score / r.total * 20; }, 0)), b: x.recs.length ? Math.round(x.recs.slice(-5).filter(function (r) { return r.total; }).reduce(function (t, r) { return t + r.score / r.total * 20; }, 0)) : 0, gain: x.trend }; }
      var pp = prePost(s.lrn); return pp.pre == null || pp.post == null ? null : { s: s, a: pp.pre, b: pp.post, gain: pp.post - pp.pre };
    }).filter(Boolean);
    return P.sortBy(out, function (o) { return -o.gain; });
  };
  function improvedList(st, by, n) {
    var arr = P.improved(st, by, T.f.imp).slice(0, n);
    var lbl = T.f.imp === 'trend' ? ['First 5', 'Last 5'] : ['Pre', 'Post'];
    if (!arr.length) return '<p class="small muted">' + (T.f.imp === 'trend' ? 'Needs at least 6 quiz results per learner.' : 'No learners have both a pre-test and a post-test yet.') + '</p>';
    return '<div class="board"><ol>' + arr.map(function (o, i) { return '<li><span class="rank r' + (i + 1) + '">' + (i + 1) + '</span><span class="grow"><span class="name" data-stu="' + esc(o.s.lrn) + '">' + esc(P.name(o.s)) + '</span><div class="tiny muted">' + esc(o.s.section) + ' · ' + lbl[0] + ' ' + o.a + '% → ' + lbl[1] + ' ' + o.b + '%</div></span><span class="chip ' + (o.gain > 0 ? 'ok' : 'gray') + '">' + (o.gain > 0 ? '+' : '') + o.gain + '%</span></li>'; }).join('') + '</ol></div>';
  }
  function bindStu(root) { P.$$('[data-stu]', root).forEach(function (el) { el.onclick = function () { studentModal(el.dataset.stu); }; }); }

  /* ---------------- PROGRESS CHART ---------------- */
  function tProgress(root) {
    var st = P.sortBy(filtered(), function (s) { return (s.section || '') + '|' + P.name(s); }), by = index();
    var maxW = Math.ceil((Number(S().totalDays) || 40) / 5), w = T.f.week;
    var h = filterBar('<select class="in" style="max-width:160px" data-f="week"><option value="0" ' + (w === 0 ? 'selected' : '') + '>All weeks (overview)</option>' + Array.from({ length: maxW }, function (_, i) { return '<option value="' + (i + 1) + '" ' + (w === i + 1 ? 'selected' : '') + '>Week ' + (i + 1) + '</option>'; }).join('') + '</select><button class="btn soft sm" data-print>🖨 Print chart</button>');
    h += '<p class="small muted">Each cell: quiz score · ✍ written · 🎙 audio (🗣 = read aloud live). Colors follow the level color code. Click a name to open the learner\'s work.</p>';
    if (!st.length) { root.innerHTML = h + '<div class="empty"><div class="e">👥</div>No learners match the filter.</div>'; bindFilters(root); return; }
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Learner</th><th>Level</th>';
    var days = w ? [1, 2, 3, 4, 5].map(function (i) { return (w - 1) * 5 + i; }) : Array.from({ length: Number(S().totalDays) || 40 }, function (_, i) { return i + 1; });
    h += w ? days.map(function (d) { return '<th class="c">Day ' + d + '</th>'; }).join('') : '<th>Days 1–' + days.length + '</th>';
    h += '<th class="c">Done</th><th class="c">Avg</th></tr></thead><tbody>';
    st.forEach(function (s, i) {
      var recs = by[s.lrn] || [], x = studentStats(s, recs), m = {}; recs.forEach(function (r) { if (!m[r.day] || r.level === s.level) m[r.day] = r; });
      h += '<tr class="lv-' + esc(s.level) + '"><td class="small muted">' + (i + 1) + '</td><td><span class="name" data-stu="' + esc(s.lrn) + '">' + esc(P.name(s)) + '</span><div class="tiny muted">' + esc(s.section) + '</div></td><td>' + P.lvChip(s.level) + '</td>';
      if (w) h += days.map(function (d) { var r = m[d]; if (!r) return '<td class="c"><span class="cell none">—</span></td>'; var full = r.written === 'Y' && (r.audioStatus === 'recorded' || r.audioStatus === 'live'); return '<td class="c"><span class="cell ' + (full ? 'full' : 'part') + '" title="' + esc(P.fmtDate(r.completedAt, true)) + '"><b>' + esc(r.score) + '/' + esc(r.total) + '</b><span>' + (r.written === 'Y' ? '✍' : '·') + ' ' + (r.audioStatus === 'recorded' ? '🎙' : r.audioStatus === 'live' ? '🗣' : '·') + '</span></span></td>'; }).join('');
      else h += '<td style="white-space:nowrap">' + days.map(function (d) { var r = m[d]; var c = r ? (r.written === 'Y' && r.audioStatus !== 'none' ? 'f' : 'p') : ''; return (d % 5 === 1 && d > 1 ? '&nbsp;' : '') + '<i class="mini ' + c + '" title="Day ' + d + (r ? ': ' + r.score + '/' + r.total : '') + '"></i>'; }).join('') + '</td>';
      h += '<td class="c"><b>' + x.doneDays + '</b></td><td class="c">' + (x.avg != null ? x.avg + '%' : '—') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    root.innerHTML = h; bindFilters(root); bindStu(root);
    P.$('[data-print]', root).onclick = function () { P.Reports.open('progress', { section: T.f.section, level: T.f.level, week: w }); };
  }

  /* ---------------- TEACHERS & RECOGNITION ---------------- */
  var AWARDS = [
    { key: 'productive', icon: 'award', title: 'Most Productive Checker', desc: 'Checked the most learners\' work', pick: function (ts) { return top(ts.filter(function (t) { return t.checks > 0; }), function (t) { return t.checks; }); }, val: function (t) { return t.checks + ' checked'; } },
    { key: 'fastest', icon: 'clock', title: 'Fastest Feedback', desc: 'Shortest time from submission to checking (at least 10 checks)', pick: function (ts) { return top(ts.filter(function (t) { return t.checks >= 10 && t.median != null; }), function (t) { return -t.median; }); }, val: function (t) { return fmtHrs(t.median) + ' median'; } },
    { key: 'complete', icon: 'check', title: '100% Checker', desc: 'Checked every piece of work in the assigned sections (at least 10)', pick: function (ts) { return ts.filter(function (t) { return t.assigned >= 10 && t.pct === 100; }); }, val: function (t) { return t.assignedChecked + ' of ' + t.assigned; } },
    { key: 'encouraging', icon: 'pen', title: 'Most Encouraging Teacher', desc: 'Wrote the most personal feedback comments', pick: function (ts) { return top(ts.filter(function (t) { return t.comments > 0; }), function (t) { return t.comments; }); }, val: function (t) { return t.comments + ' comments'; } },
    { key: 'engaged', icon: 'trending', title: 'Most Engaged Sections', desc: 'Highest learner completion in the assigned sections', pick: function (ts) { return top(ts.filter(function (t) { return t.learners >= 5 && t.engagement != null; }), function (t) { return t.engagement; }); }, val: function (t) { return t.engagement + '% completion'; } }
  ];
  var SPLIT_LBL = { shared: 'Shared by all', level: 'Split by level', name: 'Split by learner name', day: 'Split by day (odd/even)' };
  P.SPLIT_LBL = SPLIT_LBL;
  function top(arr, fn) { if (!arr.length) return []; var m = Math.max.apply(null, arr.map(fn)); return arr.filter(function (t) { return fn(t) === m; }); }
  function fmtHrs(h) { return h == null ? '—' : h < 1 ? Math.round(h * 60) + ' min' : h < 48 ? (Math.round(h * 10) / 10) + ' hrs' : Math.round(h / 24) + ' days'; }
  P.fmtHrs = fmtHrs; P.AWARDS = AWARDS;
  function pctBar(p) { return p == null ? '<span class="muted small">—</span>' : '<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ' + (p >= 90 ? 'ok' : '') + ' grow"><i style="width:' + p + '%"></i></div><b class="small">' + p + '%</b></div>'; }
  P.loadTeacherStats = function (days) {
    return P.api('teacherStats', { days: days }, 120000).then(function (r) { T.tstats = r; P.kvSet('tstats:' + user().username + (P.state.viewSy || ''), r); return r; }).catch(function (e) { return P.kvGet('tstats:' + user().username + (P.state.viewSy || '')).then(function (c) { if (c) { T.tstats = c; return c; } throw e; }); });
  };
  function tTeachers(root) {
    var days = T.f.tDays || 30;
    root.innerHTML = '<div class="empty">Loading teachers\' checking progress…</div>';
    P.loadTeacherStats(days).then(function (r) {
      var ts = r.teachers.filter(function (t) { return t.role; });
      var period = { 7: 'this week', 30: 'the last 30 days', 90: 'the last 90 days', 365: 'this school year' }[days] || 'the last ' + days + ' days';
      var me = ts.find(function (t) { return t.username === r.me; });
      var h = '<div class="row" style="margin-bottom:12px"><select class="in" style="max-width:190px" data-f="tDays">' + [[7, 'This week'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'This school year']].map(function (d) { return '<option value="' + d[0] + '" ' + (d[0] === days ? 'selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select><span class="grow"></span><button class="btn soft sm" data-trep>' + P.icon('printer', 16) + ' Print report</button></div>';
      if (me && me.assigned) h += '<div class="card" style="margin-bottom:14px;background:linear-gradient(135deg,#fff 0,#FFF5FA 100%)"><div class="row between"><div><b>Your checking progress</b><div class="small muted">' + esc(me.sections.join(', ')) + ' · ' + period + '</div></div><div style="min-width:220px">' + pctBar(me.pct) + '<div class="tiny muted right">' + me.assignedChecked + ' of ' + me.assigned + ' checked</div></div></div></div>';
      // awards
      h += '<h3>' + P.icon('award', 18) + ' Recognition for ' + period + '</h3><div class="grid g3">' + AWARDS.map(function (a) {
        var w = a.pick(ts);
        return '<div class="card award"><div class="aw-ic">' + P.icon(a.icon, 26) + '</div><div class="small muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em">' + esc(a.title) + '</div>' +
          (w.length ? w.slice(0, 4).map(function (t) { return '<div class="row between" style="margin-top:8px"><div><b>' + esc(t.name) + '</b><div class="tiny muted">' + esc(a.val(t)) + '</div></div><button class="btn xs soft" data-cert="' + esc(a.key) + '|' + esc(t.username) + '">' + P.icon('printer', 13) + ' Certificate</button></div>'; }).join('') : '<p class="small muted" style="margin:8px 0 0">No awardee yet.</p>') +
          '<div class="tiny muted" style="margin-top:8px">' + esc(a.desc) + '</div></div>';
      }).join('') + '</div>';
      // leaderboard
      var lb = P.sortBy(ts, function (t) { return -(t.checks * 1000 + (t.pct || 0)); });
      h += '<h3 style="margin-top:18px">' + P.icon('users', 18) + ' Teachers\' checking progress</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Teacher</th><th>Assigned sections</th><th style="min-width:170px">Assigned work checked</th><th class="c">Checked by them</th><th class="c">Personal comments</th><th class="c">Median time to check</th><th class="c">Learner completion</th><th>Last checking</th></tr></thead><tbody>' +
        lb.map(function (t, i) { var mine = t.username === r.me; return '<tr' + (mine ? ' style="background:#FFF8E1"' : '') + '><td>' + (t.checks ? '<span class="rank r' + (i + 1) + '">' + (i + 1) + '</span>' : '') + '</td><td><b>' + esc(t.name) + '</b>' + (mine ? ' <span class="chip">you</span>' : '') + '<div class="tiny muted">' + (t.role === 'admin' ? 'Coordinator' : 'Teacher') + '</div></td><td class="small">' + (t.sections.some(function (s) { return /^all$/i.test(s); }) ? '<span class="muted">All (monitor)</span>' : esc(t.sections.join(', ') || '—')) + '</td><td>' + pctBar(t.pct) + (t.assigned ? '<div class="tiny muted">' + t.assignedChecked + ' of ' + t.assigned + '</div>' : '') + '</td><td class="c"><b>' + t.checks + '</b>' + (t.autoAccepted ? '<div class="tiny muted">' + t.autoAccepted + ' quick-accepted</div>' : '') + '</td><td class="c">' + t.comments + '</td><td class="c">' + fmtHrs(t.median) + '</td><td class="c">' + (t.engagement != null ? t.engagement + '%' : '—') + '</td><td class="small">' + esc(t.last ? P.fmtDate(t.last, true) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      // assignments by section
      var secs = P.sortBy(r.sections, function (s) { return s.section; });
      var unassigned = secs.filter(function (s) { return !s.teachers.length; });
      h += '<h3 style="margin-top:18px">' + P.icon('clipboard', 18) + ' Checking assignments by section</h3>' + (unassigned.length ? '<div class="note" style="margin-bottom:10px"><b>' + unassigned.length + ' section(s) have no assigned checker:</b> ' + esc(unassigned.map(function (s) { return s.section; }).join(', ')) + '. ' + (isAdmin() ? 'Assign a teacher in <a href="#" data-gou>Settings → Teacher accounts</a>.' : 'Please tell the Program Coordinator.') + '</div>' : '') +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Section</th><th class="c">Learners</th><th>Assigned teacher(s)</th><th style="min-width:170px">Checked (' + esc(period) + ')</th><th class="c">Waiting</th><th>Oldest unchecked</th></tr></thead><tbody>' +
        secs.map(function (s) { var late = s.oldest && Date.now() - new Date(s.oldest) > 3 * 864e5; return '<tr><td><b>' + esc(s.section) + '</b></td><td class="c">' + s.learners + '</td><td>' + (s.teachers.length ? esc(s.teachers.join(', ')) + (s.teachers.length > 1 ? '<div class="tiny muted">' + esc(SPLIT_LBL[s.split] || 'Shared') + '</div>' : '') : '<span class="chip warn">Unassigned</span>') + '</td><td>' + pctBar(s.pct) + (s.teachers.length > 1 && s.per && s.per.length ? '<div class="tiny muted">' + s.per.map(function (q) { return esc(q.name) + ': ' + (q.pct != null ? q.pct + '%' : '—') + ' (' + q.checked + '/' + q.total + ')'; }).join(' · ') + '</div>' : '') + '</td><td class="c">' + (s.pending ? '<b>' + s.pending + '</b>' : '0') + '</td><td class="small">' + (s.oldest ? '<span style="color:' + (late ? 'var(--bad)' : 'inherit') + '">' + esc(P.fmtDate(s.oldest)) + (late ? ' (over 3 days)' : '') + '</span>' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="tiny muted">A teacher is assigned to the sections listed in their account. Accounts set to ALL (coordinators, ARAL facilitators) monitor all sections and are not counted as assigned checkers. Checks count when a teacher saves feedback, scores a test, or accepts suggestions.</p>';
      root.innerHTML = h; bindFilters(root);
      var gu = P.$('[data-gou]', root); if (gu) gu.onclick = function (e) { e.preventDefault(); T.tab = 'settings'; shell(); body(); };
      P.$('[data-trep]', root).onclick = function () { P.Reports.open('teachers', { stats: r, period: period }); };
      P.$$('[data-cert]', root).forEach(function (b) { b.onclick = function () { var x = b.dataset.cert.split('|'), a = AWARDS.find(function (z) { return z.key === x[0]; }), tt = ts.find(function (z) { return z.username === x[1]; }); P.Reports.open('certificate', { award: a, teacher: tt, value: a.val(tt), period: period }); }; });
    }).catch(function (e) { root.innerHTML = '<div class="empty">' + esc(e.network ? 'Connect to the internet to see teachers\' progress.' : e.message) + '</div>'; });
  }

  /* ---------------- SECURITY ---------------- */
  function tSecurity(root) {
    root.innerHTML = '<div class="empty">Loading phone & activity report…</div>';
    var days = T.f.secDays || 30;
    P.api('security', { days: days }, 120000).then(function (r) {
      var sm = {}; P.state.students.forEach(function (s) { sm[s.lrn] = s; });
      var vis = {}; filtered().forEach(function (s) { vis[s.lrn] = 1; });
      var shared = r.shared || [];
      var multi = r.devices.filter(function (d) { return d.lrns.length > 1 && d.lrns.some(function (l) { return vis[l]; }); });
      var learners = r.learners.filter(function (x) { return vis[x.lrn]; });
      var risky = P.sortBy(learners.filter(function (x) { return x.left || x.shots || x.blocked || x.other || x.devices > 1; }), function (x) { return -(x.blocked * 5 + x.shots * 4 + x.other * 3 + x.left + (x.devices > 1 ? 3 : 0)); });
      var noPhone = filtered().filter(function (s) { return !s.device; });
      var nm = function (l) { return sm[l] ? '<span class="name" data-stu="' + esc(l) + '">' + esc(P.name(sm[l])) + '</span> <span class="tiny muted">' + esc(sm[l].section) + '</span>' : esc(l); };
      var h = filterBar('<select class="in" style="max-width:150px" data-f="secDays">' + [7, 30, 90, 365].map(function (d) { return '<option value="' + d + '" ' + (d === days ? 'selected' : '') + '>Last ' + d + ' days</option>'; }).join('') + '</select>');
      h += '<div class="note info small" style="margin-bottom:12px"><b>How protection works:</b> each learner’s account is locked to the first phone they log in on, and each phone is for one learner only (both can be changed in Settings). PEARL materials show a watermark with the learner’s name and LRN, copying and printing are turned off, and leaving the app pauses the lesson and is recorded. <i>Phones and browsers do not let web apps block screenshots or screen recording, so the watermark makes leaked photos traceable.</i></div>';
      h += '<div class="grid g4">' + kpi(multi.length, 'Phones used by 2+ learners') + kpi(risky.filter(function (x) { return x.blocked; }).length, 'Learners with blocked logins') + kpi(P.sum(learners.map(function (x) { return x.left; })), 'Times learners left the app') + kpi(noPhone.length, 'Learners without a registered phone') + '</div>';
      h += '<div class="card" style="margin-top:12px"><h3>Phones used by more than one learner</h3><p class="small muted">Mark a phone as a <b>shared classroom phone</b> (e.g. the teacher’s phone used by learners without phones) so several learners may use it.</p>' + (multi.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Phone</th><th>Learners who used or tried this phone</th><th class="c">Logins</th><th>Last seen</th><th></th></tr></thead><tbody>' + multi.map(function (d) { var sh = shared.indexOf(d.device) >= 0; return '<tr><td><b>…' + esc(P.shortDev(d.device)) + '</b><div class="tiny muted">' + esc(d.info || '') + '</div></td><td class="small">' + d.lrns.map(nm).join('<br>') + '</td><td class="c">' + d.logins + '</td><td class="small">' + esc(P.fmtDate(d.last, true)) + '</td><td>' + (sh ? '<span class="chip ok">Shared phone</span> <button class="btn xs ghost" data-sh="' + esc(d.device) + '" data-v="0">Undo</button>' : '<button class="btn xs soft" data-sh="' + esc(d.device) + '" data-v="1">Mark as shared</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="small muted">None. Every phone is used by one learner.</p>') + '</div>';
      h += '<div class="card" style="margin-top:12px"><h3>Activity to look at (last ' + days + ' days)</h3>' + (risky.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Learner</th><th class="c">Logins</th><th class="c">Phones</th><th class="c">Left the app</th><th class="c">Screenshot / copy / print</th><th class="c">Blocked logins</th><th class="c">From another phone</th></tr></thead><tbody>' + risky.slice(0, 200).map(function (x) { var w = function (v) { return v ? '<b style="color:var(--bad)">' + v + '</b>' : '0'; }; return '<tr><td>' + nm(x.lrn) + '</td><td class="c">' + x.logins + '</td><td class="c">' + (x.devices > 1 ? w(x.devices) : x.devices) + '</td><td class="c">' + (x.left ? '<b style="color:var(--warn)">' + x.left + '</b>' : 0) + '</td><td class="c">' + w(x.shots) + '</td><td class="c">' + w(x.blocked) + '</td><td class="c">' + w(x.other) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="small muted">Nothing unusual.</p>') + '</div>';
      h += '<details class="card" style="margin-top:12px"><summary><b>Recent events</b> (' + r.recent.length + ')</summary><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>When</th><th>Learner</th><th>Event</th><th>Details</th><th>Phone</th></tr></thead><tbody>' + r.recent.slice().reverse().filter(function (e) { return vis[e[1]]; }).slice(0, 200).map(function (e) { return '<tr><td class="small">' + esc(P.fmtDate(e[0], true)) + '</td><td>' + nm(e[1]) + '</td><td>' + esc(EVT[e[3]] || e[3]) + '</td><td class="small">' + esc(e[4]) + '</td><td class="small">…' + esc(P.shortDev(e[2])) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
      root.innerHTML = h; bindFilters(root); bindStu(root);
      P.$$('[data-sh]', root).forEach(function (b) { b.onclick = function () { P.busy(b, true, '…'); P.api('setShared', { device: b.dataset.sh, shared: b.dataset.v === '1' }).then(function () { return P.pull(); }).then(body).catch(function (e) { P.toast(e.message, 'bad'); }); }; });
    }).catch(function (e) { root.innerHTML = '<div class="empty">' + esc(e.network ? 'Connect to the internet to see the phone & activity report.' : e.message) + '</div>'; });
  }

  /* ---------------- CHECKING QUEUE ---------------- */
  var csel = {};
  function parseAuto(s) { var m = String(s || '').match(/^(\d+)\/(\d+)\s*(.*)$/); return m ? { total: Number(m[1]), max: Number(m[2]), flags: m[3] ? m[3].split(',') : [] } : null; }
  function tChecking(root) {
    var sm = {}; filtered().forEach(function (s) { sm[s.lrn] = s; });
    var days = {}; (T.dash.daily || []).forEach(function (r) { days[r.day] = 1; });
    var cd = T.f.checkDay || 0;
    var me = user().username, onlyMine = !isAdmin() && T.f.mine !== false;
    var isMine = function (r) { return P.assignees(sm[r.lrn], r.level, r.day).indexOf(me) >= 0; };
    var list = (T.dash.daily || []).filter(function (r) { return sm[r.lrn] && !r.grade && (!cd || Number(r.day) === cd) && (!onlyMine || isMine(r)); });
    list = P.sortBy(list, function (r) { var a = parseAuto(r.auto); return (a && a.flags.length ? '0' : '1') + (sm[r.lrn].section || '') + P.name(sm[r.lrn]) + ('00' + r.day).slice(-3); });
    var tests = (T.dash.results || []).filter(function (r) { return sm[r.lrn] && Number(r.manualPending) > 0 && !r.grade && (!onlyMine || P.assignees(sm[r.lrn], r.level, 0).indexOf(me) >= 0); });
    var h = filterBar('<select class="in" style="max-width:140px" data-f="checkDay"><option value="0">All days</option>' + Object.keys(days).sort(function (a, b) { return a - b; }).map(function (d) { return '<option value="' + d + '" ' + (Number(d) === cd ? 'selected' : '') + '>Day ' + d + '</option>'; }).join('') + '</select>');
    var assignedNames = function (r) { return P.assignees(sm[r.lrn], r.level, r.day).map(P.userName); };
    var allMine = (T.dash.daily || []).filter(function (r) { return sm[r.lrn] && (isAdmin() || isMine(r)); });
    var chk = allMine.filter(function (r) { return r.grade; }).length;
    if (!isAdmin()) h += '<div class="seg" style="margin-bottom:12px"><button data-mine="1" class="' + (onlyMine ? 'on' : '') + '">Assigned to me</button><button data-mine="0" class="' + (onlyMine ? '' : 'on') + '">All my sections</button></div>';
    h += '<div class="card" style="margin-bottom:12px"><div class="row between"><div><b>' + (isAdmin() ? 'All sections' : 'Your assigned work') + ': checking progress</b><div class="small muted">' + chk + ' of ' + allMine.length + ' daily submissions checked' + (tests.length ? ' · ' + tests.length + ' test(s) waiting' : '') + '</div></div><div style="min-width:240px">' + pctBar(allMine.length ? Math.round(chk / allMine.length * 100) : null) + '</div></div></div>';
    h += '<div class="note info small" style="margin-bottom:12px">The quiz is checked automatically. For the written answers, the app suggests a score (content, vocabulary, mechanics) with reasons. <b>Review the flagged ones</b> (copied, short, blank, repeated), then accept the rest in one tap. Learners will see your comment.</div>';
    h += '<div class="row" style="margin-bottom:10px"><h3 style="margin:0">Daily work to check <span class="chip gray">' + list.length + '</span></h3><span class="grow"></span><span class="small muted" id="csc"></span><button class="btn ok sm" id="cacc">✓ Accept suggestions for selected</button></div>';
    h += list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="call"></th><th>Learner</th><th class="hide-sm">Assigned to</th><th>Day</th><th class="c">Quiz</th><th class="c">Writing (auto)</th><th>Flags</th><th class="c">Audio</th><th>Finished</th><th></th></tr></thead><tbody>' + list.slice(0, 300).map(function (r) {
      var s = sm[r.lrn], a = parseAuto(r.auto);
      return '<tr><td><input type="checkbox" data-cs="' + esc(r.id) + '" ' + (csel[r.id] ? 'checked' : '') + '></td><td><span class="name" data-stu="' + esc(r.lrn) + '">' + esc(P.name(s)) + '</span><div class="tiny muted">' + esc(s.section) + '</div></td><td class="small hide-sm">' + (function () { var a = assignedNames(r); return a.length ? esc(a.join(', ')) : '<span class="chip warn">Unassigned</span>'; })() + '</td><td>Day ' + esc(r.day) + ' ' + P.lvChip(r.level) + '</td><td class="c">' + esc(r.score) + '/' + esc(r.total) + '</td><td class="c">' + (a ? '<b>' + a.total + '/' + a.max + '</b>' : '<span class="muted small">open to check</span>') + '</td><td>' + (a ? a.flags.filter(Boolean).map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('') : '') + '</td><td class="c">' + (r.audioStatus === 'recorded' ? '🎙 ' + P.mmss(r.audioSec) : r.audioStatus === 'live' ? '🗣 live' : '—') + '</td><td class="small">' + esc(P.fmtDate(r.completedAt, true)) + '</td><td><button class="btn xs soft" data-open="' + esc(r.lrn) + '">Open</button></td></tr>';
    }).join('') + '</tbody></table></div>' + (list.length > 300 ? '<p class="small muted">Showing the first 300. Use the day filter to see more.</p>' : '') : '<div class="empty"><div class="e">🎉</div>Everything is checked!</div>';
    h += '<h3 style="margin-top:18px">Tests with written/oral items to check <span class="chip gray">' + tests.length + '</span></h3>' + (tests.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Learner</th><th>Test</th><th class="c">Auto score</th><th class="c">To check</th><th></th></tr></thead><tbody>' + tests.map(function (r) { var s = sm[r.lrn], A = P.state.assessments.find(function (a) { return a.id === r.assessmentId; }); return '<tr><td>' + esc(P.name(s)) + '<div class="tiny muted">' + esc(s.section) + '</div></td><td>' + esc(A ? A.title : r.assessmentId) + '</td><td class="c">' + esc(r.autoScore) + '/' + esc(r.autoTotal) + '</td><td class="c">' + esc(r.manualPending) + ' pts</td><td><button class="btn xs" data-tchk="' + esc(r.id) + '">Check</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="small muted">None.</p>');
    root.innerHTML = h; bindFilters(root); bindStu(root);
    P.$$('[data-mine]', root).forEach(function (b) { b.onclick = function () { T.f.mine = b.dataset.mine === '1'; csel = {}; body(); }; });
    var cnt = function () { var n = Object.keys(csel).filter(function (k) { return csel[k]; }).length; var el = P.$('#csc'); if (el) el.textContent = n ? n + ' selected' : ''; return n; };
    cnt();
    var all = P.$('#call', root); if (all) all.onchange = function (e) { list.slice(0, 300).forEach(function (r) { csel[r.id] = e.target.checked; }); P.$$('[data-cs]', root).forEach(function (c) { c.checked = e.target.checked; }); cnt(); };
    P.$$('[data-cs]', root).forEach(function (c) { c.onchange = function () { csel[c.dataset.cs] = c.checked; cnt(); }; });
    P.$$('[data-open]', root).forEach(function (b) { b.onclick = function () { studentModal(b.dataset.open); }; });
    P.$$('[data-tchk]', root).forEach(function (b) { b.onclick = function () { var r = tests.find(function (x) { return x.id === b.dataset.tchk; }); P.api('studentDetail', { lrn: r.lrn }).then(function (det) { var rr = det.results.find(function (x) { return x.id === r.id; }); gradeResult(sm[r.lrn], rr, function () { body(); }); }).catch(function (e) { P.toast(e.message, 'bad'); }); }; });
    P.$('#cacc', root).onclick = function (e) {
      var chosen = list.filter(function (r) { return csel[r.id]; });
      if (!chosen.length) return P.toast('Select the work to accept first.');
      var noAuto = chosen.filter(function (r) { return !parseAuto(r.auto); }).length;
      P.confirm('Accept the suggested scores and comments for <b>' + chosen.length + '</b> submission(s)?' + (noAuto ? '<br><span class="small">' + noAuto + ' older submission(s) have no auto-score; only the quiz-based comment will be saved for them.</span>' : '') + '<br><span class="small muted">Flagged work (copied, blank, repeated) is better checked one by one.</span>', 'Accept').then(function (ok) {
        if (!ok) return;
        var items = chosen.map(function (r) {
          var a = parseAuto(r.auto), q = Number(r.total) ? r.score / r.total : 0, w = a ? a.total / a.max : q, x = (q + w) / 2;
          var g = { auto: true, comment: x >= 0.85 ? 'Excellent work! Keep it up.' : x >= 0.7 ? 'Good job! Keep practicing.' : x >= 0.5 ? 'Nice effort. Re-read the passage and use more of the new words.' : 'Please complete all your answers in your own words.', stars: Math.max(1, Math.round(x * 5)) };
          if (a) { g.writingScore = a.total; g.writingMax = a.max; }
          if (r.audioStatus === 'live') g.liveOk = false;
          return { recId: r.id, kind: 'daily', grade: g };
        });
        P.busy(e.target, true, 'Saving');
        P.api('gradeMany', { items: items }, 120000).then(function (res) { csel = {}; P.toast(res.count + ' submission(s) checked ✓', 'ok'); return P.loadDash(true); }).then(function () { body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
      });
    };
  }

  /* ---------------- STUDENT MODAL ---------------- */
  function studentModal(lrn) {
    var s = P.state.students.find(function (x) { return x.lrn === lrn; }); if (!s) return;
    var m = P.modal(esc(P.name(s)), '<div class="empty">Loading learner\'s work…</div>', { wide: true });
    var paint = function (det, offline) {
      var by = index(), x = studentStats(s, by[s.lrn]), pp = prePost(s.lrn);
      var daily = det ? P.sortBy(det.daily, function (d) { return Number(d.day); }) : P.sortBy(by[s.lrn] || [], function (d) { return Number(d.day); });
      var h = '<div class="row" style="align-items:flex-start"><div class="grow"><div class="row">' + P.lvChip(s.level) + '<span class="chip gray">' + esc(s.section) + '</span><span class="chip gray">Grade ' + esc(s.grade) + '</span><span class="chip gray">' + esc(s.sex) + '</span></div><div class="small muted" style="margin-top:6px">LRN ' + esc(s.lrn) + (s.levelSince ? ' · level since ' + esc(P.fmtDate(s.levelSince)) : '') + '</div></div>' +
        '<div class="row"><button class="btn soft sm" data-lv>' + P.icon('trending', 16) + ' Change level</button><button class="btn soft sm" data-rs>' + P.icon('refresh', 16) + ' Restart Day 1</button><button class="btn soft sm" data-pin>' + P.icon('key', 16) + ' Reset PIN</button><button class="btn soft sm" data-ph>' + P.icon('phone', 16) + ' Reset phone</button><button class="btn soft sm" data-ed>' + P.icon('edit', 16) + ' Edit</button></div></div>' +
        '<div class="small muted" style="margin-top:6px">' + P.icon('phone', 14) + ' Phone: ' + (s.device ? esc(s.deviceInfo || 'registered') + ' · ID …' + esc(P.shortDev(s.device)) : 'not registered yet') + (Number(s.cycle) ? ' · <b>Round ' + (Number(s.cycle) + 1) + '</b> (restarted ' + esc(P.fmtDate(s.cycleAt)) + ')' : '') + '</div>' +
        (offline ? '<div class="note" style="margin-top:10px">Offline: showing summary only. Connect to see written answers and recordings.</div>' : '') +
        '<div class="grid g4" style="margin-top:12px">' + kpi(x.doneDays, 'Pearls done') + kpi(x.avg != null ? x.avg + '%' : '—', 'Avg quiz') + kpi(x.audio + (x.live ? ' + ' + x.live + ' live' : ''), 'Recordings') + kpi((pp.pre != null ? pp.pre + '%' : '—') + ' → ' + (pp.post != null ? pp.post + '%' : '—'), 'Pre → Post') + '</div>';
      h += '<h3 style="margin-top:14px">Daily work</h3>' + (daily.length ? daily.map(function (d) {
        var g = d.grade && d.grade.g ? d.grade.g : (d.grade || null);
        return '<details class="card flat" style="margin-bottom:8px"><summary class="row between" style="cursor:pointer"><span><b>Day ' + esc(d.day) + '</b> · ' + esc(d.title || (P.lessonById(d.lessonId) || {}).title || '') + ' ' + P.lvChip(d.level) + '</span><span class="small">' + esc(d.score) + '/' + esc(d.total) + ' · ' + (d.audioStatus === 'live' ? '🗣 live' : '🎙 ' + P.mmss(d.audioSec || 0)) + ' · ' + esc(P.fmtDate(d.completedAt, true)) + (g ? ' · <span class="chip ok">checked</span>' : '') + '</span></summary>' +
          (det ? dayDetail(d) : '<p class="small muted">Connect to the internet to view this work.</p>') + '</details>';
      }).join('') : '<p class="muted small">No submissions yet.</p>');
      if (det && det.results.length) h += '<h3 style="margin-top:14px">Tests</h3>' + det.results.map(function (r) {
        var A = P.state.assessments.find(function (a) { return a.id === r.assessmentId; }), rp = P.resultPct({ autoScore: r.autoScore, autoTotal: r.autoTotal, manualPending: r.manualPending, grade: r.grade && r.grade.g }, A);
        return '<div class="card flat row between" style="margin-bottom:8px"><span><b>' + esc(r.title) + '</b> <span class="chip gray">' + esc(TYPE_LBL[r.type] || r.type) + '</span><div class="small muted">' + esc(P.fmtDate(r.completedAt, true)) + '</div></span><span>' + rp.score + '/' + rp.total + ' (' + rp.pct + '%) ' + (rp.pendingManual ? '<span class="chip warn">needs checking</span>' : '') + ' <button class="btn soft sm" data-gr="' + esc(r.id) + '">Check</button></span></div>';
      }).join('');
      if (det && det.logins && det.logins.length) {
        var ev = P.groupBy(det.logins, function (x) { return x.event; });
        h += '<h3 style="margin-top:14px">Phone & activity</h3><div class="row">' + Object.keys(ev).map(function (k) { return '<span class="chip ' + (/blocked|other|screenshot|copy|print|auto-submit/.test(k) ? 'bad' : k === 'left-app' ? 'warn' : 'gray') + '">' + esc(EVT[k] || k) + ': ' + ev[k].length + '</span>'; }).join('') + '</div>';
      }
      if (det && det.history.length) h += '<h3 style="margin-top:14px">Level history</h3><div class="tbl-wrap"><table class="tbl"><tr><th>Date</th><th>From</th><th>To</th><th>Reason</th><th>By</th></tr>' + det.history.map(function (x) { return '<tr><td>' + esc(P.fmtDate(x.at)) + '</td><td>' + P.lvChip(x.from) + '</td><td>' + P.lvChip(x.to) + '</td><td>' + esc(x.reason) + '</td><td>' + esc(x.by) + '</td></tr>'; }).join('') + '</table></div>';
      m.querySelector('.mb').innerHTML = h;
      m.querySelector('[data-lv]').onclick = function () { levelDialog([s], 'Changed by teacher', function () { m.close(); body(); }); };
      m.querySelector('[data-pin]').onclick = function () { resetPinDialog([s]); };
      m.querySelector('[data-rs]').onclick = function () { restartDialog([s], function () { m.close(); body(); }); };
      m.querySelector('[data-ph]').onclick = function () { resetPhone([s], function () { m.close(); }); };
      m.querySelector('[data-ed]').onclick = function () { m.close(); editStudent(s); };
      P.$$('[data-audio]', m).forEach(function (b) { b.onclick = function () { playAudio(b); }; });
      P.$$('[data-fb]', m).forEach(function (f) { bindFeedback(f, det); });
      P.$$('[data-gr]', m).forEach(function (b) { b.onclick = function () { var r = det.results.find(function (x) { return x.id === b.dataset.gr; }); gradeResult(s, r, function () { m.close(); studentModal(lrn); }); }; });
    };
    P.api('studentDetail', { lrn: lrn }).then(function (det) { paint(det); }).catch(function () { paint(null, true); });
  }
  function dayDetail(d) {
    var L = P.lessonById(d.lessonId) || {}, data = d.data || {}, g = d.grade ? d.grade.g : null, R = data.reflection || {};
    var emo = function (v) { return ['', '😟', '🙂', '🤩'][v] || '—'; };
    return '<div style="margin-top:10px"><div class="small"><b>Quiz answers:</b> ' + (data.quiz || []).map(function (a, i) { var ok = L.questions && L.questions[i] && L.questions[i].ans === a; return (i + 1) + '-' + esc(a) + (L.questions ? (ok ? ' ✓' : ' ✗') : ''); }).join(', ') + '</div>' +
      '<div class="small"><b>Vocabulary used:</b> ' + esc(d.vocabUsed || '—') + ' · <b>Words:</b> ' + esc(d.words || 0) + '</div>' +
      (L.discussion || data.written ? '<div style="margin-top:8px">' + (data.written || []).map(function (w, i) { return '<div class="small muted" style="margin-top:6px"><b>' + esc((L.discussion || [])[i] || 'Answer ' + (i + 1)) + '</b></div><div>' + esc(w) + '</div>'; }).join('') + '</div>' : '') +
      autoCard(d, L) +
      '<div class="small" style="margin-top:8px"><b>Self-reflection:</b> clear ' + emo(R.clear) + ' · smooth ' + emo(R.smooth) + ' · used words ' + emo(R.words) + (R.note ? ' · “' + esc(R.note) + '”' : '') + '</div>' +
      '<div style="margin-top:8px">' + (d.audioId ? '<button class="btn ocean sm" data-audio="' + esc(d.audioId) + '">▶ Play recording (' + P.mmss(d.audioSec) + ')</button>' + (d.audioUrl && d.audioUrl.indexOf('http') === 0 ? ' <a class="small" href="' + esc(d.audioUrl) + '" target="_blank" rel="noopener">Open in Drive</a>' : '') : (d.audioStatus === 'live' ? '<span class="chip warn">Will read aloud live in class</span>' : '<span class="small muted">No audio file</span>')) + '</div>' +
      '<form class="card flat" data-fb="' + esc(d.id) + '" style="margin-top:10px;background:#FFFCFE"><div class="row between"><b class="small">Teacher feedback</b>' + (g ? '<span class="chip ok">saved' + (g.auto ? ' (suggestion accepted)' : '') + '</span>' : '<button type="button" class="btn ok xs" data-accept>✓ Accept suggestion</button>') + '</div>' +
      '<div class="tiny muted" style="margin-top:6px">Writing (1–4 each)</div><div class="grid g3">' + [['content', 'Content'], ['vocab', 'Vocabulary'], ['mechanics', 'Mechanics']].map(function (k) { var a = autoOf(d, L), v = g && g[k[0]] != null ? Number(g[k[0]]) : (a ? a.scores[k[0]] : ''); return '<div><label class="f">' + k[1] + '</label><select class="in" name="' + k[0] + '">' + ['', 1, 2, 3, 4].map(function (o) { return '<option value="' + o + '" ' + (String(v) === String(o) ? 'selected' : '') + '>' + (o || '—') + '</option>'; }).join('') + '</select></div>'; }).join('') + '</div>' +
      '<div class="tiny muted" style="margin-top:6px">Speaking</div><div class="grid g4">' +
      ['accuracy', 'expression', 'pace'].map(function (k) { return '<div><label class="f">' + k.charAt(0).toUpperCase() + k.slice(1) + '</label><select class="in" name="' + k + '">' + ['', '1 – Beginning', '2 – Developing', '3 – Proficient', '4 – Advanced'].map(function (o, i) { return '<option value="' + (i || '') + '" ' + (g && Number(g[k]) === i ? 'selected' : '') + '>' + (o || '—') + '</option>'; }).join('') + '</select></div>'; }).join('') +
      '<div><label class="f">Stars</label><select class="in" name="stars">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<option value="' + i + '" ' + (g && Number(g.stars) === i ? 'selected' : '') + '>' + (i ? '⭐'.repeat(i) : '—') + '</option>'; }).join('') + '</select></div></div>' +
      '<input class="in" name="comment" placeholder="Comment for the learner (they will see this)" value="' + esc(g ? g.comment || '' : suggestComment(d, L)) + '" style="margin-top:6px">' +
      (d.audioStatus === 'live' ? '<label class="check small" style="margin-top:6px"><input type="checkbox" name="liveOk" ' + (g && g.liveOk ? 'checked' : '') + '> Read aloud in class — verified</label>' : '') +
      '<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm">Save feedback</button></div></form></div>';
  }
  function minWordsFor(level) { return Number((S().minWords || {})[level]) || 8; }
  function autoOf(d, L) {
    var data = d.data || {};
    if (data.autoCheck && data.autoCheck.scores) return data.autoCheck;
    if (!data.written || !L || !L.discussion) return null;
    return P.Check.writing(L, data.written, minWordsFor(d.level));
  }
  function suggestComment(d, L) {
    var a = autoOf(d, L), q = Number(d.total) ? d.score / d.total : 0, w = a ? a.total / a.max : 0, x = (q + w) / (a ? 2 : 1);
    var tip = a && a.tips && a.tips.length ? ' Tip: ' + a.tips[0] : '';
    return (x >= 0.85 ? 'Excellent work! Keep it up.' : x >= 0.7 ? 'Good job! Keep practicing.' : x >= 0.5 ? 'Nice effort. Re-read the passage and use more of the new words.' : 'Please complete all your answers in your own words.') + tip;
  }
  P.suggestComment = suggestComment;
  function autoCard(d, L) {
    var a = autoOf(d, L); if (!a) return '';
    var sim = (d.similar || []).map(function (x) { return esc(x.name) + ' (' + esc(x.section) + ', ' + x.pct + '% same)'; });
    return '<div class="auto"><div class="row between"><b class="small">🧑‍🏫 Auto-check suggestion (writing)</b><span class="chip">' + a.total + '/' + a.max + ' · ' + a.pct + '%</span></div>' +
      '<div class="sc"><span>Content <b>' + a.scores.content + '</b>/4</span><span>Vocabulary <b>' + a.scores.vocab + '</b>/4</span><span>Mechanics <b>' + a.scores.mechanics + '</b>/4</span>' + (a.flags || []).map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('') + '</div>' +
      '<ul class="small" style="margin:4px 0 0;padding-left:18px">' + (a.reasons || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
      (sim.length ? '<div class="note" style="margin-top:8px"><b>⚠ Very similar to:</b> ' + sim.join('; ') + '. Please check for copying.</div>' : '') +
      '<div class="tiny muted" style="margin-top:6px">Suggested by the app\'s checker (not AI). Please review — you can change any score below.</div></div>';
  }
  function bindFeedback(f, det) {
    var acc = f.querySelector('[data-accept]');
    if (acc) acc.onclick = function () { f.querySelector('input[name=comment]').value = f.querySelector('input[name=comment]').value || ''; f._auto = true; f.requestSubmit ? f.requestSubmit() : f.onsubmit(new Event('submit')); };
    f.onsubmit = function (e) {
      e.preventDefault(); var fd = new FormData(f), g = {}; fd.forEach(function (v, k) { g[k] = v; }); g.liveOk = !!fd.get('liveOk');
      if (g.content || g.vocab || g.mechanics) { g.writingScore = (Number(g.content) || 0) + (Number(g.vocab) || 0) + (Number(g.mechanics) || 0); g.writingMax = 12; }
      if (f._auto) g.auto = true;
      var b = f.querySelector('button'); P.busy(b, true, 'Saving');
      P.api('grade', { recId: f.dataset.fb, kind: 'daily', grade: g }).then(function () { P.busy(b, false); P.toast('Feedback saved ✓', 'ok'); var ac = f.querySelector('[data-accept]'); if (ac) ac.outerHTML = '<span class="chip ok">saved</span>'; var r = (T.dash.daily || []).find(function (x) { return x.id === f.dataset.fb; }); if (r) r.grade = g; }).catch(function (err) { P.busy(b, false); P.toast(err.message, 'bad'); });
    };
  }
  var audioCache = {};
  function playAudio(b) {
    var id = b.dataset.audio;
    var go = function (url) { var a = document.createElement('audio'); a.controls = true; a.src = url; b.replaceWith(a); a.play().catch(function () { }); };
    if (audioCache[id]) return go(audioCache[id]);
    P.busy(b, true, 'Loading audio');
    P.api('getAudio', { fileId: id }, 120000).then(function (r) { audioCache[id] = URL.createObjectURL(P.b64ToBlob(r.b64, r.mime)); go(audioCache[id]); }).catch(function (e) { P.busy(b, false); P.toast(e.message, 'bad'); });
  }

  function gradeResult(s, r, done) {
    var A = P.state.assessments.find(function (a) { return a.id === r.assessmentId; });
    if (!A) return P.toast('This test was deleted.');
    var items = P.assessmentItems(A), ans = (r.data || {}).answers || {}, auto = (r.data || {}).auto || {}, aud = (r.data || {}).audios || {}, g = (r.grade && r.grade.g) || {}, sc = g.scores || {};
    var h = '<p class="small muted">Auto-checked items are already scored. Enter points for written/oral items.</p>' + items.map(function (it, i) {
      var pts = Number(it.pts) || 1, a = ans[it.id];
      var head = '<div class="item-edit"><div class="small muted">Item ' + (i + 1) + ' · ' + esc(it.type) + ' · ' + pts + ' pt(s)</div><div><b>' + esc(it.q) + '</b></div>';
      if (it.type === 'mcq' || it.type === 'spelling' || (it.type === 'short' && it.accept)) return head + '<div class="small">Answer: <b>' + esc(a || '—') + '</b> · Key: ' + esc(it.type === 'mcq' ? it.ans : it.type === 'short' ? it.accept : it.word) + ' · ' + (auto[it.id] ? '✅ ' + auto[it.id] : '❌ 0') + ' <span class="muted">(auto-checked)</span></div></div>';
      var sug = it.type === 'oral' ? null : P.Check.testItem(it, a);
      return head + (it.type === 'oral' ? (aud[it.id] && aud[it.id].id ? '<button class="btn ocean sm" data-audio="' + esc(aud[it.id].id) + '">▶ Play</button>' : '<span class="small muted">No recording</span>') : '<div class="note" style="white-space:pre-wrap">' + esc(a || '(no answer)') + '</div>') +
        (sug ? '<div class="auto small" style="padding:8px 10px"><b>Suggestion:</b> ' + (sug.pts != null ? '<b>' + sug.pts + '</b> / ' + pts + ' · ' : '') + esc(sug.reason) + '</div>' : '') +
        '<div class="row" style="margin-top:6px"><label class="small">Score</label><input class="in" style="max-width:90px" type="number" min="0" max="' + pts + '" step="0.5" data-sc="' + esc(it.id) + '" ' + (sug && sug.pts != null ? 'data-sug="' + sug.pts + '"' : '') + ' value="' + esc(sc[it.id] != null ? sc[it.id] : '') + '"> / ' + pts + '</div></div>';
    }).join('') + '<input class="in" id="gcom" placeholder="Comment (optional)" value="' + esc(g.comment || '') + '">';
    var m = P.modal('Check: ' + esc(A.title) + ' — ' + esc(P.name(s)), h, { wide: true, foot: '<button class="btn ghost" id="guse">Use all suggestions</button><button class="btn" id="gsave">Save scores</button>' });
    m.querySelector('#guse').onclick = function () { P.$$('[data-sug]', m).forEach(function (i) { if (i.value === '') i.value = i.dataset.sug; }); P.toast('Suggestions filled in — review, then Save.'); };
    P.$$('[data-audio]', m).forEach(function (b) { b.onclick = function () { playAudio(b); }; });
    m.querySelector('#gsave').onclick = function (e) {
      var scores = {}; P.$$('[data-sc]', m).forEach(function (i) { if (i.value !== '') scores[i.dataset.sc] = Math.min(Number(i.max), Math.max(0, Number(i.value))); });
      P.busy(e.target, true);
      P.api('grade', { recId: r.id, kind: 'result', grade: { scores: scores, comment: m.querySelector('#gcom').value } }).then(function () { m.close(); P.toast('Scores saved ✓', 'ok'); return P.loadDash(true); }).then(function () { done && done(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }

  function levelDialog(list, reason, done) {
    var m = P.modal('Change reading level', '<p>' + list.length + ' learner(s): ' + esc(list.slice(0, 5).map(P.name).join('; ')) + (list.length > 5 ? '…' : '') + '</p><div class="field"><label class="f">New level</label><select class="in" id="nl">' + P.LEVELS.map(function (l) { return '<option value="' + l + '">' + esc(P.alias(l)) + '</option>'; }).join('') + '</select></div><div class="field"><label class="f">Reason</label><input class="in" id="nr" value="' + esc(reason || '') + '" placeholder="e.g., Passed Term 1 releveling exam"></div><p class="small muted">Learners will receive materials for the new level starting with their next pearl.</p>', { foot: '<button class="btn" id="ok">Save</button>' });
    m.querySelector('#ok').onclick = function (e) {
      var lv = m.querySelector('#nl').value, rs = m.querySelector('#nr').value; P.busy(e.target, true);
      P.api('setLevels', { changes: list.map(function (s) { return { lrn: s.lrn, level: lv, reason: rs }; }) }).then(function (r) { m.close(); P.toast(r.count + ' learner(s) moved to ' + lv + ' ✓', 'ok'); return P.pull(); }).then(function () { done && done(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }
  var EVT = { login: 'Logins', 'login-offline': 'Offline logins', 'left-app': 'Left the app', 'screenshot-key': 'Screenshot key', 'copy-attempt': 'Copy attempts', 'print-attempt': 'Print attempts', 'blocked-other-phone': 'Blocked: other phone', 'blocked-phone-used': 'Blocked: phone of another learner', 'other-phone-submit': 'Work sent from another phone', 'other-phone-test': 'Test sent from another phone', 'phone-reset': 'Phone reset by teacher', 'test-auto-submit': 'Test auto-submitted' };
  P.EVT = EVT;
  function restartDialog(list, done) {
    P.confirm('Restart <b>' + list.length + '</b> learner(s) from <b>Day 1</b> in their current level? Their earlier work stays in the records (as Round 1), and the progress chart will show the new round.', 'Restart').then(function (ok) {
      if (!ok) return; P.api('setLevels', { changes: list.map(function (s) { return { lrn: s.lrn, restart: true, reason: 'Retained by teacher' }; }) }).then(function () { return P.pull(); }).then(function () { P.toast('Restarted from Day 1 ✓', 'ok'); done && done(); }).catch(function (e) { P.toast(e.message, 'bad'); });
    });
  }
  function resetPhone(list, done) {
    P.confirm('Reset the registered phone of <b>' + list.length + '</b> learner(s)? They can then log in on a new phone (the first phone they log in on becomes registered).', 'Reset phone').then(function (ok) {
      if (!ok) return; P.api('resetDevices', { lrns: list.map(function (s) { return s.lrn; }) }).then(function (r) { return P.pull().then(function () { return r; }); }).then(function (r) { P.toast('Phone reset for ' + r.count + ' learner(s) ✓', 'ok'); done && done(); }).catch(function (e) { P.toast(e.message, 'bad'); });
    });
  }
  function resetPinDialog(list) {
    var m = P.modal('Reset PIN', '<p>' + list.length + ' learner(s).</p><div class="field"><label class="f">New PIN (leave blank to use the last 4 digits of each LRN)</label><input class="in" id="np" inputmode="numeric" maxlength="8"></div>', { foot: '<button class="btn" id="ok">Reset</button>' });
    m.querySelector('#ok').onclick = function (e) {
      var pin = m.querySelector('#np').value.trim(); if (pin && !/^\d{4,8}$/.test(pin)) return P.toast('PIN must be 4–8 digits');
      P.busy(e.target, true);
      P.api('resetPins', { lrns: list.map(function (s) { return s.lrn; }), pin: pin }).then(function (r) { m.close(); P.toast('PIN reset for ' + r.count + ' learner(s) ✓', 'ok'); return P.pull(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }

  /* ---------------- LEARNERS ---------------- */
  var sel = {};
  function tStudents(root) {
    var q = (T.f.q || '').toLowerCase(), by = index();
    var st = P.sortBy(visibleStudents().filter(function (s) { return (!T.f.section || s.section === T.f.section) && (!T.f.level || s.level === T.f.level) && (!q || (P.name(s) + ' ' + s.lrn).toLowerCase().indexOf(q) >= 0); }), function (s) { return (s.section || '') + '|' + P.name(s); });
    var h = filterBar('<input class="in" style="max-width:220px" id="q" placeholder="Search name or LRN" value="' + esc(T.f.q || '') + '">');
    h += '<div class="row" style="margin-bottom:10px"><button class="btn sm" data-add>＋ Add learner</button><button class="btn soft sm" data-imp>⇪ Import list</button><button class="btn soft sm" data-cards>🪪 Print login cards</button><span class="grow"></span><span class="small muted" id="selc"></span><button class="btn ghost sm" data-bl>Set level</button><button class="btn ghost sm" data-bp>Reset PIN</button><button class="btn ghost sm" data-bph>Reset phone</button><button class="btn ghost sm" data-brs>Restart Day 1</button><button class="btn ghost sm" data-bd style="color:var(--bad);border-color:var(--bad)">Remove</button></div>';
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="all"></th><th>Learner</th><th>LRN</th><th>Sex</th><th>Grade & Section</th><th>Level</th><th class="c">Phone</th><th class="c">Pearls</th><th class="c">Avg</th><th></th></tr></thead><tbody>' +
      st.map(function (s) { var x = studentStats(s, by[s.lrn]); return '<tr><td><input type="checkbox" data-sel="' + esc(s.lrn) + '" ' + (sel[s.lrn] ? 'checked' : '') + '></td><td><span class="name" data-stu="' + esc(s.lrn) + '">' + esc(P.name(s)) + '</span>' + (s.active === false ? ' <span class="chip gray">inactive</span>' : '') + '</td><td class="small">' + esc(s.lrn) + '</td><td>' + esc(s.sex) + '</td><td>' + esc(s.section) + '</td><td>' + P.lvChip(s.level) + (Number(s.cycle) ? ' <span class="chip gray" title="Restarted">R' + (Number(s.cycle) + 1) + '</span>' : '') + '</td><td class="c">' + (s.device ? '<span title="' + esc(s.deviceInfo || '') + '" style="color:var(--ok)">' + P.icon('phone', 15) + '</span>' : '<span class="muted">—</span>') + '</td><td class="c">' + x.doneDays + '</td><td class="c">' + (x.avg != null ? x.avg + '%' : '—') + '</td><td><button class="btn xs soft" data-edit="' + esc(s.lrn) + '">Edit</button></td></tr>'; }).join('') +
      '</tbody></table></div><p class="small muted">' + st.length + ' learner(s) shown. Default PIN for new learners = last 4 digits of the LRN.</p>';
    root.innerHTML = h; bindFilters(root); bindStu(root);
    var selCount = function () { var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length; P.$('#selc').textContent = n ? n + ' selected' : ''; return n; };
    selCount();
    P.$('#q').oninput = function (e) { T.f.q = e.target.value; clearTimeout(T._qt); T._qt = setTimeout(function () { body(); var i = P.$('#q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); };
    P.$('#all').onchange = function (e) { st.forEach(function (s) { sel[s.lrn] = e.target.checked; }); P.$$('[data-sel]').forEach(function (c) { c.checked = e.target.checked; }); selCount(); };
    P.$$('[data-sel]').forEach(function (c) { c.onchange = function () { sel[c.dataset.sel] = c.checked; selCount(); }; });
    var chosen = function () { return P.state.students.filter(function (s) { return sel[s.lrn]; }); };
    P.$('[data-bl]').onclick = function () { if (!selCount()) return P.toast('Select learners first'); levelDialog(chosen(), '', function () { sel = {}; body(); }); };
    P.$('[data-bp]').onclick = function () { if (!selCount()) return P.toast('Select learners first'); resetPinDialog(chosen()); };
    P.$('[data-bph]').onclick = function () { if (!selCount()) return P.toast('Select learners first'); resetPhone(chosen(), function () { body(); }); };
    P.$('[data-brs]').onclick = function () { if (!selCount()) return P.toast('Select learners first'); restartDialog(chosen(), function () { sel = {}; body(); }); };
    P.$('[data-bd]').onclick = function () {
      if (!selCount()) return P.toast('Select learners first');
      P.confirm('Remove ' + selCount() + ' learner(s) from the program? Their submitted work stays in the database.', 'Remove', true).then(function (ok) {
        if (!ok) return; P.api('deleteStudents', { lrns: chosen().map(function (s) { return s.lrn; }) }).then(function () { sel = {}; return P.pull(); }).then(function () { P.toast('Removed ✓', 'ok'); body(); }).catch(function (e) { P.toast(e.message, 'bad'); });
      });
    };
    P.$('[data-add]').onclick = function () { editStudent(null); };
    P.$$('[data-edit]').forEach(function (b) { b.onclick = function () { editStudent(P.state.students.find(function (s) { return s.lrn === b.dataset.edit; })); }; });
    P.$('[data-imp]').onclick = importDialog;
    P.$('[data-cards]').onclick = function () { P.Reports.open('cards', { list: selCount() ? chosen() : st }); };
  }
  function editStudent(s) {
    var isNew = !s; s = s || { level: 'Beginner', section: T.f.section || '' };
    var f = function (k, l, extra) { return '<div class="field"><label class="f">' + l + '</label><input class="in" id="e_' + k + '" value="' + esc(s[k] || '') + '" ' + (extra || '') + '></div>'; };
    var m = P.modal(isNew ? 'Add learner' : 'Edit learner', f('lrn', 'LRN', isNew ? 'inputmode="numeric"' : 'disabled') + '<div class="grid g3">' + f('last', 'Last name') + f('first', 'First name') + f('middle', 'Middle name') + '</div><div class="grid g3"><div class="field"><label class="f">Sex</label><select class="in" id="e_sex"><option ' + (s.sex === 'M' ? 'selected' : '') + '>M</option><option ' + (s.sex === 'F' ? 'selected' : '') + '>F</option></select></div>' + f('grade', 'Grade') + f('section', 'Section', 'list="secs"') + '</div><datalist id="secs">' + P.sections().map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</datalist>' +
      '<div class="field"><label class="f">Reading level</label><select class="in" id="e_level">' + P.LEVELS.map(function (l) { return '<option value="' + l + '" ' + (s.level === l ? 'selected' : '') + '>' + esc(P.alias(l)) + '</option>'; }).join('') + '</select></div>' +
      (isNew ? '' : '<label class="check"><input type="checkbox" id="e_active" ' + (s.active !== false ? 'checked' : '') + '> Active in the program</label>'), { foot: '<button class="btn" id="sv">Save</button>' });
    m.querySelector('#sv').onclick = function (e) {
      var v = function (k) { var el = m.querySelector('#e_' + k); return el ? el.value.trim() : ''; };
      var o = { lrn: isNew ? v('lrn').replace(/\D/g, '') : s.lrn, last: v('last').toUpperCase(), first: v('first').toUpperCase(), middle: v('middle').toUpperCase(), sex: v('sex'), grade: v('grade'), section: v('section'), level: v('level') };
      if (!isNew) o.active = m.querySelector('#e_active').checked;
      if (!o.lrn || !o.last || !o.first) return P.toast('LRN, last name and first name are required.');
      if (isNew && P.state.students.some(function (x) { return x.lrn === o.lrn; })) return P.toast('That LRN already exists.');
      P.busy(e.target, true);
      P.api('saveStudents', { students: [o] }).then(function () { return P.pull(); }).then(function () { m.close(); P.toast('Saved ✓', 'ok'); body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }
  function importDialog() {
    var m = P.modal('Import learners', '<p class="small">Copy rows from Excel or Google Sheets and paste below. Columns in this order:</p><p class="kbd small">LRN · Last name · First name · Middle name · Sex · Grade · Section · Level</p><p class="small muted">Level can be Beginner/Intermediate/Advanced or Emerging/Developing/At Grade Level. Existing LRNs will be updated. A header row is skipped automatically.</p><textarea class="in" id="paste" style="min-height:200px" placeholder="123456789012	DELA CRUZ	JUAN	SANTOS	M	11	11-HUMSS A	Beginner"></textarea><div id="prev" class="small"></div>', { wide: true, foot: '<button class="btn ghost" id="pv">Preview</button><button class="btn" id="go" disabled>Import</button>' });
    var parsed = [];
    var parse = function () {
      var lv = function (x) { x = String(x || '').toLowerCase(); if (/adv|grade level|at grade/.test(x)) return 'Advanced'; if (/int|dev/.test(x)) return 'Intermediate'; return 'Beginner'; };
      parsed = m.querySelector('#paste').value.split(/\r?\n/).map(function (l) { return l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(function (c) { return c.replace(/^"|"$/g, '').trim(); }); })
        .filter(function (c) { return c[0] && /\d{6,}/.test(c[0].replace(/\D/g, '')); })
        .map(function (c) { return { lrn: c[0].replace(/\D/g, ''), last: (c[1] || '').toUpperCase(), first: (c[2] || '').toUpperCase(), middle: (c[3] || '').toUpperCase(), sex: /^f/i.test(c[4] || '') ? 'F' : 'M', grade: c[5] || '', section: c[6] || '', level: lv(c[7]) }; });
      m.querySelector('#prev').innerHTML = parsed.length ? '<p><b>' + parsed.length + '</b> learner(s) found. First rows:</p><div class="tbl-wrap"><table class="tbl">' + parsed.slice(0, 6).map(function (s) { return '<tr><td>' + esc(s.lrn) + '</td><td>' + esc(P.name(s)) + '</td><td>' + esc(s.sex) + '</td><td>' + esc(s.section) + '</td><td>' + P.lvChip(s.level) + '</td></tr>'; }).join('') + '</table></div>' : '<p style="color:var(--bad)">No valid rows found. Check that the first column is the LRN.</p>';
      m.querySelector('#go').disabled = !parsed.length;
    };
    m.querySelector('#pv').onclick = parse; m.querySelector('#paste').oninput = function () { clearTimeout(m._t); m._t = setTimeout(parse, 400); };
    m.querySelector('#go').onclick = function (e) {
      P.busy(e.target, true, 'Importing');
      P.api('saveStudents', { students: parsed }, 180000).then(function (r) { return P.pull().then(function () { return r; }); }).then(function (r) { m.close(); P.toast('Imported: ' + r.added + ' new, ' + r.updated + ' updated ✓', 'ok'); body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }

  /* ---------------- TESTS ---------------- */
  function tTests(root) {
    var res = T.dash.results || [], cnt = P.groupBy(res, function (r) { return r.assessmentId; });
    var list = P.state.assessments;
    var h = '<div class="row between" style="margin-bottom:12px"><div><p class="small muted" style="margin:0">Pre-test, post-test, releveling exams, monthly long quizzes and more. Learners see a test only when it is <b>Open</b>.</p></div><button class="btn" data-new>＋ New test</button></div>';
    h += list.length ? '<div class="grid g2">' + list.map(function (A) {
      var n = (cnt[A.id] || []).length, items = P.assessmentItems(A);
      return '<div class="card"><div class="row between"><span class="chip gray">' + esc(TYPE_LBL[A.type] || A.type) + '</span><label class="check small"><input type="checkbox" data-open="' + esc(A.id) + '" ' + (A.open ? 'checked' : '') + '> Open to learners</label></div><h3 style="margin:8px 0 4px">' + esc(A.title) + '</h3>' +
        '<div class="small muted">' + items.length + ' items · ' + P.sum(items.map(function (i) { return Number(i.pts) || 1; })) + ' pts · For: ' + esc((A.levels || ['ALL']).join(', ')) + (A.type === 'releveling' ? ' · ' + esc(A.fromLevel) + ' → ' + esc(A.toLevel) + ' at ' + (A.passPct || 75) + '%' : '') + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn sm" data-res="' + esc(A.id) + '">Results (' + n + ')</button><button class="btn soft sm" data-ed="' + esc(A.id) + '">Edit</button><button class="btn soft sm" data-dup="' + esc(A.id) + '">Duplicate</button><button class="btn ghost sm" data-del="' + esc(A.id) + '">Delete</button></div></div>';
    }).join('') + '</div>' : '<div class="empty"><div class="e">📝</div>No tests yet.</div>';
    root.innerHTML = h;
    var find = function (id) { return P.state.assessments.find(function (a) { return a.id === id; }); };
    P.$('[data-new]', root).onclick = function () { builder({ id: '', title: '', type: 'pre', levels: ['ALL'], open: false, passPct: S().passPct || 75, timeMin: 0, instructions: '', sections: [{ title: 'Part I', passage: '', items: [] }] }); };
    P.$$('[data-ed]', root).forEach(function (b) { b.onclick = function () { builder(JSON.parse(JSON.stringify(find(b.dataset.ed)))); }; });
    P.$$('[data-dup]', root).forEach(function (b) { b.onclick = function () { var c = JSON.parse(JSON.stringify(find(b.dataset.dup))); c.id = ''; c.title += ' (copy)'; c.open = false; if (c.type === 'pre') c.type = 'post', c.title = c.title.replace(/Pre-Test/i, 'Post-Test'); builder(c); }; });
    P.$$('[data-del]', root).forEach(function (b) { b.onclick = function () { P.confirm('Delete this test? Results already submitted stay in the database.', 'Delete', true).then(function (ok) { if (ok) P.api('deleteAssessment', { id: b.dataset.del }).then(function () { return P.pull(); }).then(body).catch(function (e) { P.toast(e.message, 'bad'); }); }); }; });
    P.$$('[data-open]', root).forEach(function (c) { c.onchange = function () { var A = find(c.dataset.open); A.open = c.checked; P.api('saveAssessment', { assessment: A }).then(function () { return P.pull(); }).then(function () { P.toast(A.open ? 'Test is now open to learners' : 'Test closed', 'ok'); }).catch(function (e) { c.checked = !c.checked; P.toast(e.message, 'bad'); }); }; });
    P.$$('[data-res]', root).forEach(function (b) { b.onclick = function () { resultsView(find(b.dataset.res)); }; });
  }

  function setPath(o, path, v) { var ks = path.split('.'), x = o; for (var i = 0; i < ks.length - 1; i++) x = x[ks[i]]; x[ks[ks.length - 1]] = v; }
  function builder(A) {
    var m = P.modal(A.id ? 'Edit test' : 'New test', '', { wide: true, sticky: true, foot: '<button class="btn ghost" data-x>Cancel</button><button class="btn" id="bsave">Save test</button>' });
    var paint = function () {
      var h = '<div class="grid g2"><div class="field"><label class="f">Title</label><input class="in" data-k="title" value="' + esc(A.title) + '"></div><div class="field"><label class="f">Type</label><select class="in" data-k="type">' + Object.keys(TYPE_LBL).map(function (k) { return '<option value="' + k + '" ' + (A.type === k ? 'selected' : '') + '>' + TYPE_LBL[k] + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="field"><label class="f">Who takes this test?</label><div class="row">' + ['ALL'].concat(P.LEVELS).map(function (l) { return '<label class="check small"><input type="checkbox" data-lvl="' + l + '" ' + ((A.levels || []).indexOf(l) >= 0 ? 'checked' : '') + '> ' + (l === 'ALL' ? 'All learners' : esc(l)) + '</label>'; }).join('') + '</div></div>' +
        '<div class="grid g3"><div class="field"><label class="f">Passing %</label><input class="in" type="number" data-k="passPct" data-num value="' + esc(A.passPct || 75) + '"></div><div class="field"><label class="f">Time limit (minutes, 0 = none)</label><input class="in" type="number" data-k="timeMin" data-num value="' + esc(A.timeMin || 0) + '"></div>' +
        (A.type === 'releveling' ? '<div class="field"><label class="f">Promote from → to</label><div class="row" style="flex-wrap:nowrap"><select class="in" data-k="fromLevel">' + P.LEVELS.map(function (l) { return '<option ' + (A.fromLevel === l ? 'selected' : '') + '>' + l + '</option>'; }).join('') + '</select><select class="in" data-k="toLevel">' + P.LEVELS.map(function (l) { return '<option ' + (A.toLevel === l ? 'selected' : '') + '>' + l + '</option>'; }).join('') + '</select></div></div>' : '') + '</div>' +
        '<div class="field"><label class="f">Instructions for learners</label><textarea class="in" data-k="instructions" style="min-height:60px">' + esc(A.instructions || '') + '</textarea></div>';
      (A.sections || []).forEach(function (sec, si) {
        h += '<div class="card flat" style="margin:12px 0;background:#FFFAFD"><div class="row"><input class="in grow" data-k="sections.' + si + '.title" value="' + esc(sec.title || '') + '" placeholder="Section title"><button class="btn ghost xs" data-delsec="' + si + '">Remove section</button></div>' +
          '<label class="f" style="margin-top:8px">Reading passage for this section (optional)</label><textarea class="in" data-k="sections.' + si + '.passage" style="min-height:70px">' + esc(sec.passage || '') + '</textarea>';
        (sec.items || []).forEach(function (it, ii) {
          var p = 'sections.' + si + '.items.' + ii + '.';
          h += '<div class="item-edit"><div class="row"><b class="small">' + (ii + 1) + '.</b><select class="in" style="max-width:170px" data-k="' + p + 'type" data-re>' + [['mcq', 'Multiple choice'], ['short', 'Short answer'], ['essay', 'Essay / paragraph'], ['spelling', 'Spelling (dictation)'], ['oral', 'Oral reading (record)']].map(function (t) { return '<option value="' + t[0] + '" ' + (it.type === t[0] ? 'selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select><label class="small">Points</label><input class="in" style="max-width:70px" type="number" data-num data-k="' + p + 'pts" value="' + esc(it.pts || 1) + '"><span class="grow"></span><button class="icon-btn" data-mv="' + si + ',' + ii + ',-1">↑</button><button class="icon-btn" data-mv="' + si + ',' + ii + ',1">↓</button><button class="icon-btn" data-delit="' + si + ',' + ii + '">🗑</button></div>' +
            '<input class="in" style="margin-top:6px" data-k="' + p + 'q" value="' + esc(it.q || '') + '" placeholder="Question / instruction">';
          if (it.type === 'mcq') h += '<div class="grid g2" style="margin-top:6px">' + [0, 1, 2, 3].map(function (k) { var L = 'ABCD'.charAt(k); return '<div class="row" style="flex-wrap:nowrap"><label class="check"><input type="radio" name="ans' + si + '_' + ii + '" data-ans="' + p + '" value="' + L + '" ' + (it.ans === L ? 'checked' : '') + '><b>' + L + '</b></label><input class="in" data-k="' + p + 'opts.' + k + '" value="' + esc((it.opts || [])[k] || '') + '"></div>'; }).join('') + '</div>';
          if (it.type === 'spelling') h += '<input class="in" style="margin-top:6px" data-k="' + p + 'word" value="' + esc(it.word || '') + '" placeholder="Word to spell (the app reads it aloud)">';
          if (it.type === 'short') h += '<input class="in" style="margin-top:6px" data-k="' + p + 'accept" value="' + esc(it.accept || '') + '" placeholder="Accepted answers, separated by commas (checked automatically)">';
          if (it.type === 'short' || it.type === 'essay') h += '<input class="in" style="margin-top:6px" data-k="' + p + 'keywords" value="' + esc(it.keywords || '') + '" placeholder="Expected ideas/keywords, separated by commas (used to suggest a score)">';
          h += '</div>';
        });
        h += '<div class="row"><button class="btn soft sm" data-addit="' + si + '">＋ Add item</button><button class="btn soft sm" data-fromlesson="' + si + '">⇣ Add items from a PEARL lesson</button></div></div>';
      });
      h += '<button class="btn ghost sm" data-addsec>＋ Add section</button>';
      m.querySelector('.mb').innerHTML = h;
      P.$$('[data-k]', m).forEach(function (el) {
        el.oninput = el.onchange = function () { var v = el.hasAttribute('data-num') ? Number(el.value) : el.value; if (/\.opts\.\d$/.test(el.dataset.k)) { var base = el.dataset.k.replace(/\.opts\.\d$/, ''); var it = base.split('.').reduce(function (o, k) { return o[k]; }, A); it.opts = it.opts || ['', '', '', '']; } setPath(A, el.dataset.k, v); if (el.hasAttribute('data-re') || el.dataset.k === 'type') paint(); };
      });
      P.$$('[data-ans]', m).forEach(function (r) { r.onchange = function () { setPath(A, r.dataset.ans + 'ans', r.value); }; });
      P.$$('[data-lvl]', m).forEach(function (c) { c.onchange = function () { A.levels = P.$$('[data-lvl]', m).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.lvl; }); }; });
      P.$$('[data-addit]', m).forEach(function (b) { b.onclick = function () { A.sections[b.dataset.addit].items.push({ id: 'q' + P.uid(), type: 'mcq', q: '', opts: ['', '', '', ''], ans: 'A', pts: 1 }); paint(); }; });
      P.$$('[data-delit]', m).forEach(function (b) { b.onclick = function () { var x = b.dataset.delit.split(','); A.sections[x[0]].items.splice(x[1], 1); paint(); }; });
      P.$$('[data-mv]', m).forEach(function (b) { b.onclick = function () { var x = b.dataset.mv.split(',').map(Number), arr = A.sections[x[0]].items, j = x[1] + x[2]; if (j < 0 || j >= arr.length) return; var t = arr[x[1]]; arr[x[1]] = arr[j]; arr[j] = t; paint(); }; });
      P.$$('[data-delsec]', m).forEach(function (b) { b.onclick = function () { A.sections.splice(b.dataset.delsec, 1); paint(); }; });
      P.$('[data-addsec]', m).onclick = function () { A.sections.push({ title: 'Part ' + (A.sections.length + 1), passage: '', items: [] }); paint(); };
      P.$$('[data-fromlesson]', m).forEach(function (b) { b.onclick = function () { pickLesson(function (L) { var sec = A.sections[b.dataset.fromlesson]; if (!sec.passage) sec.passage = (L.passage || []).join('\n\n'); (L.questions || []).forEach(function (q) { sec.items.push({ id: 'q' + P.uid(), type: 'mcq', q: q.q, opts: q.opts.slice(), ans: q.ans, pts: 1 }); }); paint(); }); }; });
    };
    paint();
    m.querySelector('#bsave').onclick = function (e) {
      if (!A.title.trim()) return P.toast('Please enter a title.');
      if (!A.levels || !A.levels.length) A.levels = ['ALL'];
      var n = 0; A.sections.forEach(function (s) { s.items.forEach(function (it) { if (!it.id) it.id = 'q' + P.uid(); n++; }); });
      if (!n) return P.toast('Add at least one item.');
      P.busy(e.target, true);
      P.api('saveAssessment', { assessment: A }).then(function () { return P.pull(); }).then(function () { m.close(); P.toast('Test saved ✓', 'ok'); body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }
  function pickLesson(cb) {
    var lv = 'Beginner';
    var m = P.modal('Choose a lesson', '', { wide: true });
    var paint = function () {
      m.querySelector('.mb').innerHTML = '<div class="seg" style="margin-bottom:10px">' + P.LEVELS.map(function (l) { return '<button data-l="' + l + '" class="' + (l === lv ? 'on' : '') + '">' + l + '</button>'; }).join('') + '</div><div class="tbl-wrap"><table class="tbl">' + P.lessonsFor(lv).map(function (L) { return '<tr><td>Day ' + esc(L.day) + '</td><td>' + esc(L.title) + '</td><td><button class="btn xs" data-pick="' + esc(L.id) + '">Use</button></td></tr>'; }).join('') + '</table></div>';
      P.$$('[data-l]', m).forEach(function (b) { b.onclick = function () { lv = b.dataset.l; paint(); }; });
      P.$$('[data-pick]', m).forEach(function (b) { b.onclick = function () { m.close(); cb(P.lessonById(b.dataset.pick)); }; });
    };
    paint();
  }

  function resultsView(A) {
    var sm = {}; P.state.students.forEach(function (s) { sm[s.lrn] = s; });
    var rows = (T.dash.results || []).filter(function (r) { return r.assessmentId === A.id && sm[r.lrn] && (!T.f.section || sm[r.lrn].section === T.f.section); });
    var pass = Number(A.passPct) || 75;
    var data = P.sortBy(rows.map(function (r) { var s = sm[r.lrn], rp = P.resultPct(r, A); return { r: r, s: s, rp: rp, passed: rp.pct >= pass }; }), function (o) { return (o.s.section || '') + P.name(o.s); });
    var vis = visibleStudents().filter(function (s) { return s.active !== false && ((A.levels || []).indexOf('ALL') >= 0 || (A.levels || []).indexOf(s.level) >= 0); });
    var notYet = vis.filter(function (s) { return !rows.some(function (r) { return r.lrn === s.lrn; }); });
    var h = '<div class="row" style="margin-bottom:10px"><span class="chip gray">' + esc(TYPE_LBL[A.type]) + '</span><span class="small">' + data.length + ' submitted · ' + notYet.length + ' not yet · passing ' + pass + '%</span><span class="grow"></span>' +
      (A.type === 'releveling' ? '<button class="btn ok sm" id="promote">⬆ Apply results: promote passers, restart others from Day 1</button>' : '') +
      (A.type === 'pre' ? '<button class="btn ok sm" id="place">🎯 Apply level placement</button>' : '') + '<button class="btn soft sm" id="prt">🖨 Print</button></div>';
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Learner</th><th>Section</th><th>Level</th><th class="c">Auto</th><th class="c">Total</th><th class="c">%</th><th class="c">Status</th><th></th></tr></thead><tbody>' +
      data.map(function (o) { return '<tr><td><span class="name" data-stu="' + esc(o.s.lrn) + '">' + esc(P.name(o.s)) + '</span></td><td>' + esc(o.s.section) + '</td><td>' + P.lvChip(o.r.level || o.s.level) + '</td><td class="c">' + esc(o.r.autoScore) + '/' + esc(o.r.autoTotal) + '</td><td class="c">' + o.rp.score + '/' + o.rp.total + '</td><td class="c"><b>' + o.rp.pct + '%</b></td><td class="c">' + (o.rp.pendingManual ? '<span class="chip warn">to check</span>' : o.passed ? '<span class="chip ok">Passed</span>' : '<span class="chip bad">Below</span>') + '</td><td><button class="btn xs soft" data-chk="' + esc(o.r.id) + '">Check</button></td></tr>'; }).join('') +
      '</tbody></table></div>' + (notYet.length ? '<details style="margin-top:10px"><summary class="small">Not yet taken (' + notYet.length + ')</summary><p class="small">' + notYet.map(function (s) { return esc(P.name(s)) + ' (' + esc(s.section) + ')'; }).join('; ') + '</p></details>' : '');
    var m = P.modal('Results: ' + esc(A.title), h, { wide: true });
    bindStu(m);
    P.$$('[data-chk]', m).forEach(function (b) {
      b.onclick = function () {
        var o = data.find(function (x) { return x.r.id === b.dataset.chk; });
        P.api('studentDetail', { lrn: o.s.lrn }).then(function (det) { var r = det.results.find(function (x) { return x.id === o.r.id; }); gradeResult(o.s, r, function () { m.close(); resultsView(A); }); }).catch(function (e) { P.toast(e.message, 'bad'); });
      };
    });
    var pr = P.$('#promote', m);
    if (pr) pr.onclick = function () {
      var inLevel = data.filter(function (o) { return o.s.level === A.fromLevel && !o.rp.pendingManual; });
      var up = inLevel.filter(function (o) { return o.passed; });
      var again = inLevel.filter(function (o) { return !o.passed && !(o.s.cycleAt && String(o.s.cycleAt) > String(o.r.completedAt)); });
      var pend = data.filter(function (o) { return o.rp.pendingManual; }).length;
      if (!up.length && !again.length) return P.toast(pend ? 'Check the written/oral items first (' + pend + ' pending).' : 'Nothing to apply.');
      P.confirm('<b>' + up.length + '</b> passed → move up to <b>' + esc(A.toLevel) + '</b>.<br><b>' + again.length + '</b> below ' + pass + '% → stay in <b>' + esc(A.fromLevel) + '</b> and <b>restart from Day 1</b>.' + (pend ? '<br><span class="small muted">' + pend + ' result(s) still need checking and are not included.</span>' : ''), 'Apply').then(function (ok) {
        if (!ok) return;
        var ch = up.map(function (o) { return { lrn: o.s.lrn, level: A.toLevel, reason: 'Passed ' + A.title + ' (' + o.rp.pct + '%)' }; })
          .concat(again.map(function (o) { return { lrn: o.s.lrn, restart: true, reason: 'Did not pass ' + A.title + ' (' + o.rp.pct + '%) — retained' }; }));
        P.api('setLevels', { changes: ch }).then(function (r) { return P.pull().then(function () { return r; }); }).then(function () { P.toast(up.length + ' promoted 🎉 · ' + again.length + ' restarting from Day 1', 'ok'); m.close(); body(); }).catch(function (e) { P.toast(e.message, 'bad'); });
      });
    };
    var pl = P.$('#place', m);
    if (pl) pl.onclick = function () {
      var b = S().placement || { Intermediate: 50, Advanced: 80 };
      var ch = data.map(function (o) { var lv = o.rp.pct >= b.Advanced ? 'Advanced' : o.rp.pct >= b.Intermediate ? 'Intermediate' : 'Beginner'; return { s: o.s, lv: lv, pct: o.rp.pct }; }).filter(function (x) { return x.lv !== x.s.level; });
      P.confirm('Placement bands: Advanced ≥ ' + b.Advanced + '%, Intermediate ≥ ' + b.Intermediate + '%, otherwise Beginner (change in Settings).<br><b>' + ch.length + '</b> learner(s) will change level. Continue?', 'Apply').then(function (ok) {
        if (!ok || !ch.length) return; P.api('setLevels', { changes: ch.map(function (x) { return { lrn: x.s.lrn, level: x.lv, reason: 'Placement from ' + A.title + ' (' + x.pct + '%)' }; }) }).then(function () { return P.pull(); }).then(function () { P.toast('Placement applied ✓', 'ok'); m.close(); body(); }).catch(function (e) { P.toast(e.message, 'bad'); });
      });
    };
    P.$('#prt', m).onclick = function () { P.Reports.open('testResults', { A: A, data: data }); };
  }

  /* ---------------- MATERIALS ---------------- */
  function tMaterials(root) {
    var lv = T.f.matLevel || 'Beginner';
    var list = P.lessonsFor(lv), extras = P.state.lessons.filter(function (l) { return l.kind === 'extra' && (l.level === lv || l.level === 'ALL'); });
    var h = '<div class="row between" style="margin-bottom:12px"><div><p class="small muted" style="margin:0">Six-part PEARL format: news title, vocabulary, definitions & examples, passage, comprehension questions, discussion questions.</p></div><div class="row"><button class="btn sm" data-new>＋ New daily lesson</button><button class="btn soft sm" data-extra>＋ Extra reading</button><button class="btn ghost sm" data-more>⋯ Import / export</button></div></div>' +
      '<div class="seg" style="margin-bottom:10px">' + P.LEVELS.map(function (l) { return '<button data-ml="' + l + '" class="' + (l === lv ? 'on' : '') + '">' + esc(l) + ' (' + P.lessonsFor(l).length + ')</button>'; }).join('') + '</div>' +
      '<div class="note info small" style="margin-bottom:10px">Released to learners: <b>Days 1–' + esc(S().releasedDay) + '</b> · Unlock mode: <b>' + (S().unlockMode === 'open' ? 'all released days open' : 'one day after another') + '</b>' + (isAdmin() ? ' · <a href="#" data-gos>change in Settings</a>' : '') + '</div>';
    h += list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Day</th><th>Week</th><th>News title</th><th class="c">Words</th><th class="c">Quiz</th><th class="c">Discussion</th><th></th></tr></thead><tbody>' + list.map(function (L) {
      return '<tr class="lv-' + esc(lv) + '"><td><b>' + esc(L.day) + '</b></td><td>' + esc(L.week) + '</td><td>' + esc(L.title) + (Number(L.day) > Number(S().releasedDay) ? ' <span class="chip gray">not yet released</span>' : '') + '</td><td class="c">' + (L.vocab || []).length + '</td><td class="c">' + (L.questions || []).length + '</td><td class="c">' + (L.discussion || []).length + '</td><td style="white-space:nowrap"><button class="btn xs soft" data-view="' + esc(L.id) + '">Preview</button> <button class="btn xs" data-edit="' + esc(L.id) + '">Edit</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty"><div class="e">📚</div>No lessons for this level yet.' + (isAdmin() ? '<br><button class="btn sm" style="margin-top:10px" data-seed>Load the 120 PEARL lessons</button>' : '') + '</div>';
    if (extras.length) h += '<h3 style="margin-top:16px">Extra readings</h3><div class="tbl-wrap"><table class="tbl">' + extras.map(function (L) { return '<tr><td>' + esc(L.title) + '</td><td>' + esc(L.level === 'ALL' ? 'All levels' : L.level) + '</td><td><button class="btn xs" data-edit="' + esc(L.id) + '">Edit</button></td></tr>'; }).join('') + '</table></div>';
    root.innerHTML = h;
    P.$$('[data-ml]', root).forEach(function (b) { b.onclick = function () { T.f.matLevel = b.dataset.ml; body(); }; });
    var gs = P.$('[data-gos]', root); if (gs) gs.onclick = function (e) { e.preventDefault(); T.tab = 'settings'; shell(); body(); };
    P.$('[data-new]', root).onclick = function () { var d = list.length ? Math.max.apply(null, list.map(function (l) { return Number(l.day) || 0; })) + 1 : 1; lessonEditor({ id: lv.charAt(0) + '-' + ('0' + d).slice(-2), level: lv, day: d, week: Math.ceil(d / 5), kind: 'daily', title: '', author: '', link: '', vocab: [{ word: '', pos: 'Noun', ipa: '', def: '', ex: '' }], passage: [''], questions: [], discussion: [''] }, true); };
    P.$('[data-extra]', root).onclick = function () { lessonEditor({ id: 'X-' + P.uid(), level: lv, kind: 'extra', title: '', author: '', link: '', vocab: [], passage: [''], questions: [], discussion: [] }, true); };
    P.$$('[data-edit]', root).forEach(function (b) { b.onclick = function () { lessonEditor(JSON.parse(JSON.stringify(P.lessonById(b.dataset.edit)))); }; });
    P.$$('[data-view]', root).forEach(function (b) { b.onclick = function () { previewLesson(P.lessonById(b.dataset.view)); }; });
    var sd = P.$('[data-seed]', root); if (sd) sd.onclick = seedDefaults;
    P.$('[data-more]', root).onclick = function () {
      var m = P.modal('Import / export materials', '<p class="small">Share materials with other schools, or keep a backup.</p><div class="stack"><button class="btn soft block" id="exp">⬇ Export all lessons (JSON)</button><label class="btn soft block">⇪ Import lessons (JSON)<input type="file" accept=".json,application/json" id="impf" class="hide"></label>' + (isAdmin() ? '<button class="btn ghost block" id="seed2">↺ Load / restore the 120 default PEARL lessons</button>' : '') + '</div>');
      m.querySelector('#exp').onclick = function () { download('pearl-lessons.json', JSON.stringify(P.state.lessons, null, 1)); };
      m.querySelector('#impf').onchange = function (e) {
        var f = e.target.files[0]; if (!f) return; var rd = new FileReader();
        rd.onload = function () { try { var arr = JSON.parse(rd.result); if (!Array.isArray(arr)) throw new Error('Not a lesson list'); P.api('saveLessons', { lessons: arr }, 180000).then(function () { return P.pull(); }).then(function () { m.close(); P.toast(arr.length + ' lesson(s) imported ✓', 'ok'); body(); }).catch(function (er) { P.toast(er.message, 'bad'); }); } catch (er) { P.toast('Invalid file: ' + er.message, 'bad'); } };
        rd.readAsText(f);
      };
      var s2 = m.querySelector('#seed2'); if (s2) s2.onclick = function () { m.close(); seedDefaults(); };
    };
  }
  function seedDefaults() {
    P.confirm('Load the 120 default PEARL lessons (Weeks 1–8, all levels)? Lessons with the same Day and level will be replaced; your other lessons are kept.', 'Load').then(function (ok) {
      if (!ok) return; P.toast('Uploading lessons… please wait');
      P.api('saveLessons', { lessons: window.PEARL_DEFAULT_LESSONS }, 180000).then(function () { return P.pull(); }).then(function () { P.toast('120 lessons loaded ✓', 'ok'); body(); }).catch(function (e) { P.toast(e.message, 'bad'); });
    });
  }
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); }
  P.download = download;
  function previewLesson(L) {
    P.modal('Preview: Day ' + esc(L.day) + ' · ' + esc(L.level), '<div class="lv-' + esc(L.level) + '"><div class="news-title">' + esc(L.title) + '</div><p class="small muted">' + esc(L.author) + '</p><h3>Vocabulary</h3>' + (L.vocab || []).map(function (v) { return '<p class="small"><b>' + esc(v.word) + '</b> <i>' + esc(v.pos) + '</i> ' + esc(v.ipa) + ' — ' + esc(v.def) + '<br><span class="muted">e.g. ' + esc(v.ex) + '</span></p>'; }).join('') + '<h3>Passage</h3><div class="passage">' + (L.passage || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div><h3 style="margin-top:12px">Questions</h3><ol>' + (L.questions || []).map(function (q) { return '<li><b>' + esc(q.q) + '</b><br>' + q.opts.map(function (o, k) { return '<span class="small' + ('ABCD'.charAt(k) === q.ans ? '" style="color:var(--ok);font-weight:700' : '') + '">' + 'ABCD'.charAt(k) + ') ' + esc(o) + '</span>'; }).join('<br>') + '</li>'; }).join('') + '</ol><h3>Discussion</h3><ol>' + (L.discussion || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ol></div>', { wide: true });
  }
  function lessonEditor(L, isNew) {
    var m = P.modal((isNew ? 'New ' : 'Edit ') + (L.kind === 'extra' ? 'extra reading' : 'daily lesson'), '', { wide: true, sticky: true, foot: (!isNew && isAdmin() ? '<button class="btn ghost" id="ldel" style="color:var(--bad);border-color:var(--bad);margin-right:auto">Delete</button>' : '') + '<button class="btn ghost" data-x>Cancel</button><button class="btn" id="lsave">Save lesson</button>' });
    var paint = function () {
      var h = '<div class="grid g4">' + (L.kind === 'extra' ? '<div class="field"><label class="f">For</label><select class="in" data-k="level"><option value="ALL">All levels</option>' + P.LEVELS.map(function (l) { return '<option ' + (L.level === l ? 'selected' : '') + '>' + l + '</option>'; }).join('') + '</select></div>' : '<div class="field"><label class="f">Level</label><input class="in" value="' + esc(L.level) + '" disabled></div><div class="field"><label class="f">Day #</label><input class="in" type="number" data-num data-k="day" value="' + esc(L.day) + '"></div><div class="field"><label class="f">Week #</label><input class="in" type="number" data-num data-k="week" value="' + esc(L.week) + '"></div>') + '</div>' +
        '<div class="field"><label class="f">1. Daily News Title</label><input class="in" data-k="title" value="' + esc(L.title) + '"></div><div class="grid g2"><div class="field"><label class="f">Author</label><input class="in" data-k="author" value="' + esc(L.author) + '"></div><div class="field"><label class="f">Source link</label><input class="in" data-k="link" value="' + esc(L.link) + '"></div></div>' +
        '<h3>2–3. Vocabulary words, definitions & examples</h3>' + (L.vocab || []).map(function (v, i) { var p = 'vocab.' + i + '.'; return '<div class="item-edit"><div class="grid g4"><input class="in" data-k="' + p + 'word" value="' + esc(v.word) + '" placeholder="Word"><input class="in" data-k="' + p + 'pos" value="' + esc(v.pos) + '" placeholder="Part of speech"><input class="in" data-k="' + p + 'ipa" value="' + esc(v.ipa) + '" placeholder="/pronunciation/"><button class="btn ghost xs" data-dv="' + i + '">Remove</button></div><input class="in" style="margin-top:6px" data-k="' + p + 'def" value="' + esc(v.def) + '" placeholder="Definition"><input class="in" style="margin-top:6px" data-k="' + p + 'ex" value="' + esc(v.ex) + '" placeholder="Example sentence"></div>'; }).join('') + '<button class="btn soft sm" data-av>＋ Add word</button>' +
        '<h3 style="margin-top:14px">4. Reading passage</h3><p class="tiny muted">Leave a blank line between paragraphs.</p><textarea class="in" id="pass" style="min-height:200px">' + esc((L.passage || []).join('\n\n')) + '</textarea>' +
        '<h3 style="margin-top:14px">5. Comprehension questions</h3><p class="tiny muted">Cover Vocabulary, Literal, Inferential and Knowledge Construction.</p>' + (L.questions || []).map(function (q, i) { var p = 'questions.' + i + '.'; return '<div class="item-edit"><div class="row"><b>' + (i + 1) + '.</b><input class="in grow" data-k="' + p + 'q" value="' + esc(q.q) + '"><button class="icon-btn" data-dq="' + i + '">🗑</button></div><div class="grid g2" style="margin-top:6px">' + [0, 1, 2, 3].map(function (k) { var Lt = 'ABCD'.charAt(k); return '<div class="row" style="flex-wrap:nowrap"><label class="check"><input type="radio" name="la' + i + '" data-qa="' + i + '" value="' + Lt + '" ' + (q.ans === Lt ? 'checked' : '') + '><b>' + Lt + '</b></label><input class="in" data-k="' + p + 'opts.' + k + '" value="' + esc((q.opts || [])[k] || '') + '"></div>'; }).join('') + '</div><input class="in" style="margin-top:6px" data-k="' + p + 'why" value="' + esc(q.why || '') + '" placeholder="Why is this the answer? (optional — leave blank to let the app explain using the passage)">' + (!q.why && q.q ? '<div class="tiny muted" style="margin-top:4px">App explanation: ' + esc((P.Check.explain(L, i) || {}).why || '') + '</div>' : '') + '</div>'; }).join('') + '<button class="btn soft sm" data-aq>＋ Add question</button>' +
        '<h3 style="margin-top:14px">6. Speaking / discussion questions</h3><p class="tiny muted">One question per line.</p><textarea class="in" id="disc" style="min-height:90px">' + esc((L.discussion || []).join('\n')) + '</textarea>';
      m.querySelector('.mb').innerHTML = h;
      P.$$('[data-k]', m).forEach(function (el) { el.oninput = el.onchange = function () { if (/\.opts\.\d$/.test(el.dataset.k)) { var q = L.questions[el.dataset.k.split('.')[1]]; q.opts = q.opts || ['', '', '', '']; } setPath(L, el.dataset.k, el.hasAttribute('data-num') ? Number(el.value) : el.value); }; });
      P.$$('[data-qa]', m).forEach(function (r) { r.onchange = function () { L.questions[r.dataset.qa].ans = r.value; }; });
      var keep = function () { L.passage = m.querySelector('#pass').value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean); L.discussion = m.querySelector('#disc').value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean); };
      m._keep = keep;
      P.$('[data-av]', m).onclick = function () { keep(); L.vocab.push({ word: '', pos: '', ipa: '', def: '', ex: '' }); paint(); };
      P.$$('[data-dv]', m).forEach(function (b) { b.onclick = function () { keep(); L.vocab.splice(b.dataset.dv, 1); paint(); }; });
      P.$('[data-aq]', m).onclick = function () { keep(); L.questions.push({ q: '', opts: ['', '', '', ''], ans: 'A' }); paint(); };
      P.$$('[data-dq]', m).forEach(function (b) { b.onclick = function () { keep(); L.questions.splice(b.dataset.dq, 1); paint(); }; });
    };
    paint();
    m.querySelector('#lsave').onclick = function (e) {
      m._keep();
      if (!L.title.trim()) return P.toast('Please enter the news title.');
      L.vocab = L.vocab.filter(function (v) { return v.word.trim(); }); L.questions = L.questions.filter(function (q) { return q.q.trim(); });
      if (L.kind !== 'extra') { if (isNew && P.lessonsFor(L.level).some(function (x) { return Number(x.day) === Number(L.day); })) return P.toast('Day ' + L.day + ' already exists for ' + L.level + '. Edit that lesson instead.'); if (isNew) L.id = L.level.charAt(0) + '-' + ('0' + L.day).slice(-2); }
      P.busy(e.target, true);
      P.api('saveLessons', { lessons: [L] }).then(function () { return P.pull(); }).then(function () { m.close(); P.toast('Lesson saved ✓', 'ok'); body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
    var del = m.querySelector('#ldel');
    if (del) del.onclick = function () { P.confirm('Delete this lesson? Learners\' submitted work stays in the database.', 'Delete', true).then(function (ok) { if (ok) P.api('deleteLessons', { ids: [L.id] }).then(function () { return P.pull(); }).then(function () { m.close(); body(); }).catch(function (e) { P.toast(e.message, 'bad'); }); }); };
  }

  /* ---------------- REPORTS ---------------- */
  function tReports(root) {
    var reps = [
      ['progress', '🗓', 'Progress Chart', 'Daily comprehension quiz & task tracker per section (wall chart), by week.'],
      ['audio', '🎙', 'Audio Recording Tracker', 'Which learners submitted their daily recording, per day.'],
      ['sections', '🏫', 'Completion Summary', 'Completion, quiz average and recordings per section — whole school.'],
      ['watch', '⏰', S().watchName + ' Report', 'First to submit each day, and the most consistent early finishers.'],
      ['improved', '🚀', 'Most Improved Learners', 'Pre-test → post-test gains, or quiz-score trend.'],
      ['points', '⭐', 'Points Summary', 'Written tasks, audio tasks and monthly assessment points per learner.'],
      ['literacy', '📋', 'Literacy Assessment Summary', 'Learners per reading level by section and sex (current, pre-test or post-test).'],
      ['releveling', '⬆', 'Releveling Report', 'Learners who moved between levels, with dates and reasons.']
    ];
    root.innerHTML = filterBar() + '<p class="small muted">Reports open with your school letterhead, ready to print or save as PDF. The section/level filters above are applied.</p><div class="grid g2">' + reps.map(function (r) { return '<div class="card"><div class="row"><div style="font-size:1.8rem">' + r[1] + '</div><div class="grow"><h3 style="margin:0">' + esc(r[2]) + '</h3><div class="small muted">' + esc(r[3]) + '</div></div><button class="btn sm" data-rep="' + r[0] + '">Open</button></div></div>'; }).join('') + '</div>';
    bindFilters(root);
    P.$$('[data-rep]', root).forEach(function (b) { b.onclick = function () { P.Reports.open(b.dataset.rep, { section: T.f.section, level: T.f.level, week: T.f.week }); }; });
  }
  P.studentStats = studentStats; P.tIndex = index; P.tFiltered = filtered; P.prePost = prePost; P.flagTime = flagTime;

  /* ---------------- SETTINGS ---------------- */
  function tSettings(root) {
    if (P.state.viewSy) { root.innerHTML = '<div class="card center"><h3 style="justify-content:center">' + P.icon('book', 18) + ' SY ' + esc(S().schoolYear) + ' is archived</h3><p class="muted">Settings belong to the current school year.</p><button class="btn" data-exit2>Back to current year</button></div>'; P.$('[data-exit2]', root).onclick = function () { exitYear(); }; return; }
    var s = S(), u = user();
    var f = function (k, l, t) { return '<div class="field"><label class="f">' + l + '</label><input class="in" data-s="' + k + '" ' + (t === 'n' ? 'type="number" data-num' : '') + ' value="' + esc(s[k]) + '" ' + (isAdmin() ? '' : 'disabled') + '></div>'; };
    var h = '';
    if (!isAdmin()) h += '<div class="note" style="margin-bottom:12px">Only the Program Coordinator (admin) can change school settings.</div>';
    h += '<div class="grid g2"><div class="card"><h3>🏫 School</h3>' + f('schoolName', 'School name') + '<div class="grid g2">' + f('schoolId', 'School ID') + f('schoolYear', 'School Year') + '</div>' + f('schoolAddress', 'Address') + '<div class="grid g2">' + f('region', 'Region') + f('division', 'Schools Division') + '</div>' +
      '<div class="grid g3">' + logoField('depedSeal', 'DepEd seal (left)') + logoField('schoolLogo', 'School logo (right)') + logoField('programLogo', 'Program logo') + '</div></div>' +
      '<div class="card"><h3>🐚 Program</h3>' + f('appName', 'App name') + f('programFull', 'Program full name') + f('tagline', 'Tagline') + '<div class="grid g2">' + f('watchName', 'Early-submission award name') + f('watchFull', 'What it stands for') + '</div>' +
      '<label class="f">Level names (shown with the level)</label><div class="grid g3">' + P.LEVELS.map(function (l) { return '<input class="in" data-alias="' + l + '" value="' + esc((s.levelAlias || {})[l] || '') + '" placeholder="' + l + '" ' + (isAdmin() ? '' : 'disabled') + '>'; }).join('') + '</div>' +
      '<div class="grid g2" style="margin-top:8px">' + f('coordinator', 'Program Coordinator (signatory)') + f('coordinatorTitle', 'Coordinator title') + f('principal', 'School Principal (signatory)') + f('principalTitle', 'Principal title') + '</div></div></div>';
    h += '<div class="card" style="margin-top:12px"><h3>📅 Daily routine & rules</h3><div class="grid g4">' + f('totalDays', 'Total program days', 'n') + f('releasedDay', 'Released up to Day', 'n') +
      '<div class="field"><label class="f">Unlock mode</label><select class="in" data-s="unlockMode" ' + (isAdmin() ? '' : 'disabled') + '><option value="sequential" ' + (s.unlockMode !== 'open' ? 'selected' : '') + '>One day after another</option><option value="open" ' + (s.unlockMode === 'open' ? 'selected' : '') + '>All released days open</option></select></div>' + f('stepMinutes', 'Minutes per step (timer)', 'n') +
      f('targetAudioSec', 'Recording goal (seconds)', 'n') + f('maxAudioSec', 'Recording limit (seconds)', 'n') + f('passPct', 'Default passing %', 'n') + '</div>' +
      '<label class="f">Minimum words per written answer</label><div class="grid g3">' + P.LEVELS.map(function (l) { return '<div><span class="tiny muted">' + l + '</span><input class="in" type="number" data-mw="' + l + '" value="' + esc((s.minWords || {})[l] || 8) + '" ' + (isAdmin() ? '' : 'disabled') + '></div>'; }).join('') + '</div>' +
      '<label class="f" style="margin-top:8px">Points (per school year)</label><div class="grid g3">' + ['written', 'audio', 'monthly'].map(function (k) { return '<div><span class="tiny muted">' + { written: 'Daily written tasks', audio: 'Daily audio tasks', monthly: 'Monthly assessments' }[k] + '</span><input class="in" type="number" data-pt="' + k + '" value="' + esc((s.points || {})[k] || 50) + '" ' + (isAdmin() ? '' : 'disabled') + '></div>'; }).join('') + '</div>' +
      '<label class="f" style="margin-top:8px">Pre-test placement bands (% needed)</label><div class="grid g3"><div><span class="tiny muted">Intermediate</span><input class="in" type="number" data-pl="Intermediate" value="' + esc((s.placement || {}).Intermediate || 50) + '" ' + (isAdmin() ? '' : 'disabled') + '></div><div><span class="tiny muted">Advanced</span><input class="in" type="number" data-pl="Advanced" value="' + esc((s.placement || {}).Advanced || 80) + '" ' + (isAdmin() ? '' : 'disabled') + '></div></div>' +
      '<label class="check" style="margin-top:10px"><input type="checkbox" data-sb="showTimer" ' + (s.showTimer ? 'checked' : '') + ' ' + (isAdmin() ? '' : 'disabled') + '> Show the 5-minute step timer to learners</label>' +
      '<h3 style="margin-top:18px">' + P.icon('shield', 18) + ' Protection against leaking</h3>' +
      [['deviceLock', 'One phone per learner (account is locked to the first phone used)'], ['onePerPhone', 'One learner per phone (except phones marked as shared)'], ['protect', 'Watermark with learner\'s name & LRN, no copying or printing of materials'], ['pauseOnLeave', 'Pause and blur the lesson when the learner leaves the app']].map(function (x) { return '<label class="check" style="margin-top:6px"><input type="checkbox" data-sb="' + x[0] + '" ' + (s[x[0]] !== false ? 'checked' : '') + ' ' + (isAdmin() ? '' : 'disabled') + '> ' + x[1] + '</label>'; }).join('') +
      '<div class="grid g3" style="margin-top:8px">' + f('maxLeavesTest', 'Auto-submit a test after leaving the app this many times (0 = never)', 'n') + '</div>' +
      (isAdmin() ? '<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="ssave">Save settings</button></div>' : '') + '</div>';
    if (isAdmin()) {
      h += '<div class="card" style="margin-top:12px"><div class="row between"><h3 style="margin:0">👩‍🏫 Teacher accounts</h3><button class="btn sm" data-nu>＋ Add teacher</button></div><p class="small muted">Teachers see only their sections. Use <b>ALL</b> for ARAL facilitators and coordinators who monitor the whole school.</p><div class="tbl-wrap"><table class="tbl"><tr><th>Username</th><th>Name</th><th>Role</th><th>Sections</th><th></th></tr>' +
        (P.state.users || []).map(function (x) { return '<tr><td>' + esc(x.username) + '</td><td>' + esc(x.name) + '</td><td>' + (x.role === 'admin' ? '<span class="chip">Coordinator</span>' : 'Teacher') + (x.active === false ? ' <span class="chip gray">inactive</span>' : '') + '</td><td class="small">' + esc(x.sections) + '</td><td><button class="btn xs soft" data-eu="' + esc(x.username) + '">Edit</button></td></tr>'; }).join('') + '</table></div></div>';
    }
    h += yearsCard();
    if (isAdmin()) h += splitCard();
    h += '<div class="grid g2" style="margin-top:12px"><div class="card"><h3>🔐 My account</h3><p class="small">' + esc(u.name) + ' (' + esc(u.username) + ') · ' + (u.role === 'admin' ? 'Program Coordinator' : 'Teacher') + ' · Sections: ' + esc(u.sections) + '</p><button class="btn soft sm" data-cp>Change my password</button></div>' +
      '<div class="card"><h3>💾 Data & device</h3><p class="small muted">Connected to: ' + esc(P.isDemo() ? 'Demo mode (this device only)' : P.apiUrl().slice(0, 60) + '…') + '<br>Last sync: ' + esc(P.fmtDate(P.state.lastSync, true)) + ' · Waiting to upload: ' + P.state.pending + '</p><div class="row"><button class="btn soft sm" data-bk>⬇ Backup (JSON)</button><button class="btn soft sm" data-share>🔗 Learner link</button><button class="btn ghost sm" data-conn>Change connection</button>' + (P.isDemo() ? '<button class="btn ghost sm" data-resetdemo>Reset demo</button>' : '') + '</div></div></div>';
    root.innerHTML = h;
    P.$$('[data-logo]', root).forEach(function (inp) {
      inp.onchange = function () { var f0 = inp.files[0]; if (!f0) return; shrinkImage(f0).then(function (url) { s[inp.dataset.logo] = url; P.$('#prev-' + inp.dataset.logo).src = url; P.toast('Logo ready — click Save settings', 'ok'); }).catch(function (e) { P.toast(e.message, 'bad'); }); };
    });
    P.$$('[data-clr]', root).forEach(function (b) { b.onclick = function () { s[b.dataset.clr] = ''; P.$('#prev-' + b.dataset.clr).src = 'icons/pearl-logo.png'; }; });
    var sv = P.$('#ssave', root);
    if (sv) sv.onclick = function (e) {
      var o = {};
      P.$$('[data-s]', root).forEach(function (el) { o[el.dataset.s] = el.hasAttribute('data-num') ? Number(el.value) : el.value; });
      o.levelAlias = {}; P.$$('[data-alias]', root).forEach(function (el) { o.levelAlias[el.dataset.alias] = el.value.trim(); });
      o.minWords = {}; P.$$('[data-mw]', root).forEach(function (el) { o.minWords[el.dataset.mw] = Number(el.value) || 1; });
      o.points = {}; P.$$('[data-pt]', root).forEach(function (el) { o.points[el.dataset.pt] = Number(el.value) || 0; });
      o.placement = {}; P.$$('[data-pl]', root).forEach(function (el) { o.placement[el.dataset.pl] = Number(el.value) || 0; });
      P.$$('[data-sb]', root).forEach(function (el) { o[el.dataset.sb] = el.checked; });
      ['depedSeal', 'schoolLogo', 'programLogo'].forEach(function (k) { o[k] = s[k] || ''; });
      P.busy(e.target, true, 'Saving');
      P.api('saveSettings', { settings: o }).then(function () { return P.pull(); }).then(function () { P.toast('Settings saved ✓', 'ok'); shell(); body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
    bindSplit(root);
    var nyb = P.$('[data-newyear]', root); if (nyb) nyb.onclick = closeYearDialog;
    P.$$('[data-viewyear]', root).forEach(function (b) { b.onclick = function () { enterYear(b.dataset.viewyear); }; });
    P.$$('[data-eu]', root).forEach(function (b) { b.onclick = function () { userDialog(P.state.users.find(function (x) { return x.username === b.dataset.eu; })); }; });
    var nu = P.$('[data-nu]', root); if (nu) nu.onclick = function () { userDialog(null); };
    P.$('[data-cp]', root).onclick = changePassword;
    P.$('[data-conn]', root).onclick = function () { P.go('connect'); };
    P.$('[data-share]', root).onclick = function () {
      var link = location.origin + location.pathname + (P.isDemo() ? '' : '?api=' + encodeURIComponent(P.apiUrl()));
      P.modal('Share with learners', '<p class="small">Send this link to learners (Messenger group chat). Opening it connects the app to your school automatically. They should then tap <b>Download / update data</b> once while online and <b>Install app</b>.</p><textarea class="in" readonly style="min-height:90px">' + esc(link) + '</textarea>');
    };
    P.$('[data-bk]', root).onclick = function () { download('pearl-backup-' + P.dayKey() + '.json', JSON.stringify({ exported: new Date().toISOString(), settings: P.state.settings, students: P.state.students.map(function (x) { var c = Object.assign({}, x); delete c.pin; return c; }), lessons: P.state.lessons, assessments: P.state.assessments, dashboard: T.dash }, null, 1)); };
    var rd = P.$('[data-resetdemo]', root); if (rd) rd.onclick = function () { P.confirm('Reset all demo data on this device?', 'Reset', true).then(function (ok) { if (!ok) return; P.Demo.reset(); localStorage.removeItem('pearl_api'); indexedDB.deleteDatabase('pearl-app'); location.reload(); }); };
  }
  /* split checking between co-assigned teachers */
  function letterRanges(n) { var L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', out = [], per = Math.ceil(26 / n); for (var i = 0; i < n; i++) { var a = L.charAt(i * per), b = L.charAt(Math.min(25, (i + 1) * per - 1)); if (a) out.push(a + '-' + b); } return out; }
  var splitDraft = null;
  function splitCard() {
    var cur = splitDraft || JSON.parse(JSON.stringify(S().checkSplit || {}));
    splitDraft = cur;
    var shared = P.sections().filter(function (sec) { return P.sectionTeachers(sec).length > 1; });
    var h = '<div class="card" style="margin-top:12px"><h3>' + P.icon('users', 18) + ' Splitting the checking (sections with 2+ teachers)</h3><p class="small muted">When two or more teachers are assigned to the same section, choose how to divide the work. Each teacher then gets their own queue and progress %. Anything the split does not cover goes to all of the section\'s teachers.</p>';
    if (!shared.length) return h + '<p class="small muted">No section has more than one assigned teacher right now. Add the same section to two teacher accounts to split it.</p></div>';
    shared.forEach(function (sec) {
      var k = sec.toLowerCase(), tl = P.sectionTeachers(sec), c = cur[k] = cur[k] || { mode: 'shared', map: {}, order: tl.slice() };
      c.map = c.map || {};
      var learners = P.state.students.filter(function (s) { return s.section === sec && s.active !== false; });
      h += '<div class="item-edit" data-sk="' + esc(k) + '"><div class="row between"><b>' + esc(sec) + '</b><span class="small muted">' + tl.map(P.userName).map(esc).join(' · ') + '</span></div>' +
        '<div class="seg" style="margin:8px 0">' + ['shared', 'level', 'name', 'day'].map(function (m) { return '<button data-mode="' + m + '" class="' + (c.mode === m ? 'on' : '') + '">' + { shared: 'Shared', level: 'By level', name: 'By learner name', day: 'By day' }[m] + '</button>'; }).join('') + '</div>';
      if (c.mode === 'level') h += '<div class="grid g2">' + tl.map(function (u) { return '<div><b class="small">' + esc(P.userName(u)) + '</b><div class="row">' + P.LEVELS.map(function (l) { return '<label class="check small"><input type="checkbox" data-lv="' + esc(u) + '|' + l + '" ' + ((c.map[u] || []).indexOf(l) >= 0 ? 'checked' : '') + '> ' + l + '</label>'; }).join('') + '</div></div>'; }).join('') + '</div>';
      if (c.mode === 'name') h += '<div class="grid g2">' + tl.map(function (u) { return '<div><label class="f">' + esc(P.userName(u)) + ' — last names from</label><input class="in" data-rg="' + esc(u) + '" value="' + esc(c.map[u] || '') + '" placeholder="e.g. A-M"></div>'; }).join('') + '</div><button class="btn xs ghost" data-auto style="margin-top:6px">Fill evenly (A–Z)</button>';
      if (c.mode === 'day') { var order = (c.order || []).filter(function (u) { return tl.indexOf(u) >= 0; }); tl.forEach(function (u) { if (order.indexOf(u) < 0) order.push(u); }); c.order = order;
        h += '<div class="small">' + order.map(function (u, i) { var ds = []; for (var d = i + 1; d <= Math.min(40, i + 1 + order.length * 4); d += order.length) ds.push(d); return '<div class="row" style="padding:4px 0"><b style="min-width:150px">' + esc(P.userName(u)) + '</b><span class="muted">Days ' + ds.join(', ') + ', …' + (order.length === 2 ? (i === 0 ? ' (odd days)' : ' (even days)') : '') + '</span></div>'; }).join('') + '</div><button class="btn xs ghost" data-rot style="margin-top:6px">' + P.icon('refresh', 13) + ' Rotate order</button><div class="tiny muted" style="margin-top:4px">Tests are shared in this mode (they have no day).</div>'; }
      // preview
      var cnt = {}; tl.forEach(function (u) { cnt[u] = 0; });
      if (c.mode === 'level' || c.mode === 'name') learners.forEach(function (s) { P.pickCheckers(c, tl, s, s.level, 0).forEach(function (u) { cnt[u]++; }); });
      if (c.mode === 'level' || c.mode === 'name') {
        var uncovered = learners.filter(function (s) { var r = P.pickCheckers(c, tl, s, s.level, 0); return r.length === tl.length && tl.length > 1 && !(c.mode === 'level' ? tl.every(function (u) { return (c.map[u] || []).indexOf(s.level) >= 0; }) : false); }).length;
        h += '<div class="tiny muted" style="margin-top:6px">Learners per teacher: ' + tl.map(function (u) { return esc(P.userName(u)) + ' ' + cnt[u]; }).join(' · ') + (uncovered ? ' · <span style="color:var(--warn)">' + uncovered + ' learner(s) not covered (shared by all)</span>' : '') + '</div>';
      }
      h += '</div>';
    });
    return h + '<div class="row" style="justify-content:flex-end"><button class="btn sm" id="splitsave">Save checking split</button></div></div>';
  }
  function bindSplit(root) {
    var cur = splitDraft; if (!cur) return;
    var rerender = function () { var el = P.$('#splitsave', root); if (!el) return; var card = el.closest('.card'); var tmp = document.createElement('div'); tmp.innerHTML = splitCard(); card.replaceWith(tmp.firstChild); bindSplit(root); };
    P.$$('[data-sk]', root).forEach(function (box) {
      var k = box.dataset.sk, c = cur[k];
      P.$$('[data-mode]', box).forEach(function (b) { b.onclick = function () { c.mode = b.dataset.mode; if (c.mode === 'name' && !Object.keys(c.map).some(function (u) { return typeof c.map[u] === 'string'; })) { var tl = P.sectionTeachers(k), rg = letterRanges(tl.length); c.map = {}; tl.forEach(function (u, i) { c.map[u] = rg[i]; }); } if (c.mode === 'level' && !Object.keys(c.map).some(function (u) { return Array.isArray(c.map[u]); })) { var tl2 = P.sectionTeachers(k); c.map = {}; tl2.forEach(function (u, i) { c.map[u] = i === 0 ? ['Beginner'] : (i === 1 ? ['Intermediate', 'Advanced'] : []); }); } rerender(); }; });
      P.$$('[data-lv]', box).forEach(function (x) { x.onchange = function () { var p2 = x.dataset.lv.split('|'), arr = Array.isArray(c.map[p2[0]]) ? c.map[p2[0]] : []; arr = arr.filter(function (l) { return l !== p2[1]; }); if (x.checked) arr.push(p2[1]); c.map[p2[0]] = arr; rerender(); }; });
      P.$$('[data-rg]', box).forEach(function (x) { x.onchange = function () { c.map[x.dataset.rg] = x.value.toUpperCase().replace(/\s/g, ''); rerender(); }; });
      var au = P.$('[data-auto]', box); if (au) au.onclick = function () { var tl = P.sectionTeachers(k), rg = letterRanges(tl.length); tl.forEach(function (u, i) { c.map[u] = rg[i]; }); rerender(); };
      var ro = P.$('[data-rot]', box); if (ro) ro.onclick = function () { c.order.push(c.order.shift()); rerender(); };
    });
    var sv = P.$('#splitsave', root);
    if (sv) sv.onclick = function (e) {
      P.busy(e.target, true, 'Saving');
      P.api('saveSettings', { settings: { checkSplit: cur } }).then(function () { return P.pull(); }).then(function () { splitDraft = null; P.toast('Checking split saved ✓', 'ok'); body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }
  function logoField(k, label) {
    var s = S();
    return '<div class="field center"><label class="f">' + label + '</label><img class="logo-prev" id="prev-' + k + '" src="' + esc(s[k] || 'icons/pearl-logo.png') + '" alt="">' + (isAdmin() ? '<div class="row" style="justify-content:center;gap:4px;margin-top:4px"><label class="btn soft xs">Upload<input type="file" accept="image/*" class="hide" data-logo="' + k + '"></label><button class="btn ghost xs" data-clr="' + k + '">Clear</button></div>' : '') + '</div>';
  }
  function shrinkImage(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var tryIt = function (size, fmt, q) {
          var c = document.createElement('canvas'), r = Math.min(1, size / Math.max(img.width, img.height)); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL(fmt, q);
        };
        var out = tryIt(220, 'image/png'); if (out.length > 45000) out = tryIt(220, 'image/webp', 0.85); if (out.length > 45000 || out.indexOf('image/webp') < 0 && out.length > 45000) out = tryIt(180, 'image/jpeg', 0.85); if (out.length > 45000) out = tryIt(140, 'image/jpeg', 0.75);
        URL.revokeObjectURL(url); if (out.length > 48000) rej(new Error('Image is too detailed. Please use a simpler/smaller logo.')); else res(out);
      };
      img.onerror = function () { rej(new Error('Could not read that image.')); }; img.src = url;
    });
  }
  function userDialog(x) {
    var isNew = !x; x = x || { role: 'teacher', sections: '' };
    var m = P.modal(isNew ? 'Add teacher' : 'Edit teacher', '<div class="field"><label class="f">Username</label><input class="in" id="uu" value="' + esc(x.username || '') + '" ' + (isNew ? '' : 'disabled') + '></div><div class="field"><label class="f">Full name</label><input class="in" id="un" value="' + esc(x.name || '') + '"></div>' +
      '<div class="grid g2"><div class="field"><label class="f">Role</label><select class="in" id="ur"><option value="teacher" ' + (x.role !== 'admin' ? 'selected' : '') + '>Teacher</option><option value="admin" ' + (x.role === 'admin' ? 'selected' : '') + '>Program Coordinator (admin)</option></select></div><div class="field"><label class="f">Sections (comma-separated, or ALL)</label><input class="in" id="us" value="' + esc(x.sections || '') + '" placeholder="e.g. 11-HUMSS A, 12-STEM"></div></div>' +
      '<p class="tiny muted">The teacher is the assigned checker for these sections (shown in Checking and Teachers). Known sections: ' + esc(P.sections().join(', ') || '—') + '</p><div class="field"><label class="f">' + (isNew ? 'Password' : 'New password (leave blank to keep)') + '</label><input class="in" type="password" id="up"></div>' + (isNew ? '' : '<label class="check"><input type="checkbox" id="ua" ' + (x.active !== false ? 'checked' : '') + '> Active</label>'),
      { foot: (!isNew ? '<button class="btn ghost" id="udel" style="color:var(--bad);border-color:var(--bad);margin-right:auto">Delete</button>' : '') + '<button class="btn" id="usv">Save</button>' });
    m.querySelector('#usv').onclick = function (e) {
      var un = m.querySelector('#uu').value.trim(), pw = m.querySelector('#up').value;
      if (!un) return P.toast('Username is required'); if (isNew && pw.length < 6) return P.toast('Password must have at least 6 characters');
      P.busy(e.target, true);
      (pw ? P.passHash(un, pw) : Promise.resolve('')).then(function (h) {
        return P.api('saveUser', { user: { username: un, name: m.querySelector('#un').value.trim(), role: m.querySelector('#ur').value, sections: m.querySelector('#us').value.trim() || 'ALL', passHash: h || undefined, active: isNew ? true : m.querySelector('#ua').checked } });
      }).then(function () { return P.pull(); }).then(function () { m.close(); P.toast('Saved ✓', 'ok'); body(); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
    var d = m.querySelector('#udel'); if (d) d.onclick = function () { P.confirm('Delete account ' + esc(x.username) + '?', 'Delete', true).then(function (ok) { if (ok) P.api('deleteUser', { username: x.username }).then(function () { return P.pull(); }).then(function () { m.close(); body(); }).catch(function (e) { P.toast(e.message, 'bad'); }); }); };
  }
  function changePassword() {
    var u = user();
    var m = P.modal('Change my password', '<div class="field"><label class="f">Current password</label><input class="in" type="password" id="o"></div><div class="field"><label class="f">New password</label><input class="in" type="password" id="n"></div>', { foot: '<button class="btn" id="ok">Change</button>' });
    m.querySelector('#ok').onclick = function (e) {
      var o = m.querySelector('#o').value, n = m.querySelector('#n').value; if (n.length < 6) return P.toast('At least 6 characters');
      P.busy(e.target, true);
      Promise.all([P.passHash(u.username, o), P.passHash(u.username, n)]).then(function (h) { return P.api('changePassword', { oldHash: h[0], newHash: h[1] }).then(function () { return P.kvSet('cred:' + String(u.username).toLowerCase(), null); }); })
        .then(function () { m.close(); P.toast('Password changed ✓', 'ok'); }).catch(function (err) { P.busy(e.target, false); P.toast(err.message, 'bad'); });
    };
  }
})();
