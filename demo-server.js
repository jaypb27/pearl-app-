/* DEMO MODE ONLY: an exact copy of Code.gs so the demo runs the same server logic in the browser. Regenerate by copying Code.gs if you change it. */
/**
 * PEARL App — Google Apps Script backend (database API)
 * Proficiency in English and Reading Literacy Program
 * Developed by Joy P. Bacala, Samal Senior High School
 *
 * The Google Sheet is STORAGE ONLY. All editing is done inside the PEARL App.
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone
 */

var APP_VERSION = '1.5.0';
var CHUNK = 45000; // safe size per cell (Sheets limit is 50,000 chars)

var SHEETS = {
  Settings: ['Key', 'Value'],
  Users: ['Username', 'Name', 'Role', 'Sections', 'PassHash', 'Active', 'Created'],
  Students: ['LRN', 'LastName', 'FirstName', 'MiddleName', 'Sex', 'Grade', 'Section', 'Level', 'PinHash', 'Active', 'LevelSince', 'Updated', 'Device', 'DeviceInfo', 'Cycle', 'CycleAt'],
  Lessons: ['ID', 'Level', 'Week', 'Day', 'Title', 'Kind', 'Updated', 'JSON1', 'JSON2', 'JSON3'],
  Assessments: ['ID', 'Title', 'Type', 'Open', 'Updated', 'JSON1', 'JSON2', 'JSON3', 'JSON4'],
  Daily: ['RecID', 'LRN', 'Name', 'Section', 'Level', 'Day', 'LessonID', 'Title', 'QuizScore', 'QuizTotal', 'Written', 'WordCount', 'VocabUsed', 'AudioStatus', 'AudioSec', 'AudioFileID', 'AudioLink', 'StartedAt', 'CompletedAt', 'SyncedAt', 'Device', 'DataJSON', 'AutoCheck', 'Cycle'],
  Results: ['RecID', 'LRN', 'Name', 'Section', 'Level', 'AssessmentID', 'Title', 'Type', 'AutoScore', 'AutoTotal', 'ManualPending', 'CompletedAt', 'SyncedAt', 'DataJSON'],
  Grades: ['RecID', 'Kind', 'By', 'At', 'JSON'],
  LevelHistory: ['At', 'LRN', 'Name', 'From', 'To', 'Reason', 'By'],
  Logins: ['At', 'LRN', 'Name', 'Device', 'Event', 'Detail', 'DeviceInfo', 'Verified']
};

/* ------------------------------------------------------------------ */
/* Entry points                                                         */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) return out_(handle_(p));
  return out_({ ok: true, app: 'PEARL App database', version: APP_VERSION, message: 'The PEARL database is running. Open the PEARL App and paste this Web App URL in the connection screen.' });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Bad request' }); }
  return out_(handle_(req));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  try {
    ensureSheets_();
    var a = req.action;
    var pub = { info: info_, setup: setup_, login: login_, pull: pull_, submitDaily: submitDaily_, submitResult: submitResult_, myProgress: myProgress_, changePin: changePin_, board: board_, bindDevice: bindDevice_, logEvents: logEvents_ };
    if (pub[a] && !req.sy) return pub[a](req);
    var user = auth_(req.token);
    if (!user) return { ok: false, error: 'Your session expired. Please log in again.', auth: false };
    if (req.sy) { // reading a past school year (read-only, except late checking)
      var arc = archiveOf_('id', req.sy);
      if (!arc) return { ok: false, error: 'That school year archive was not found.' };
      var ro = { pull: pull_, dashboard: dashboard_, studentDetail: studentDetail_, getAudio: getAudio_, teacherStats: teacherStats_, security: security_, grade: grade_, gradeMany: gradeMany_ };
      if (!ro[a]) return { ok: false, error: 'SY ' + arc.sy + ' is archived. Its records can be viewed and checked, but not changed. Switch to the current school year to make changes.' };
      return inYear_(arc, function () { var r = ro[a](req, user); if (r && a === 'pull') { r.archive = arc; r.stamps = {}; } return r; });
    }
    var t = {
      dashboard: dashboard_, studentDetail: studentDetail_, getAudio: getAudio_, grade: grade_, gradeMany: gradeMany_,
      saveSettings: saveSettings_, saveStudents: saveStudents_, deleteStudents: deleteStudents_, resetPins: resetPins_,
      setLevels: setLevels_, saveLessons: saveLessons_, deleteLessons: deleteLessons_,
      saveAssessment: saveAssessment_, deleteAssessment: deleteAssessment_,
      saveUser: saveUser_, deleteUser: deleteUser_, changePassword: changePassword_,
      resetDevices: resetDevices_, security: security_, setShared: setShared_, teacherStats: teacherStats_, closeYear: closeYear_
    };
    if (!t[a]) return { ok: false, error: 'Unknown action: ' + a };
    var admOnly = { saveSettings: 1, saveUser: 1, deleteUser: 1, deleteLessons: 1, closeYear: 1 };
    if (admOnly[a] && user.role !== 'admin') return { ok: false, error: 'Only the Program Coordinator (admin) can do this.' };
    return t[a](req, user);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

var CUR_SS = null; // set while reading an archived school year
function ss_() { return CUR_SS || SpreadsheetApp.getActiveSpreadsheet(); }
function archiveOf_(key, val) { return (settingsObj_().archives || []).filter(function (a) { return a[key] === val; })[0]; }
function inYear_(archive, fn) {
  if (!archive) return fn();
  CUR_SS = SpreadsheetApp.openById(archive.id);
  try { return fn(); } finally { CUR_SS = null; }
}
function props_() { return PropertiesService.getScriptProperties(); }
function now_() { return new Date().toISOString(); }

function ensureSheets_() {
  var p = props_();
  if (p.getProperty('SHEETS_OK') === APP_VERSION) return;
  var ss = ss_();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var head = SHEETS[name];
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@'); // keep LRNs, sections, dates as plain text
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f8d7e8');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  if (!p.getProperty('SALT')) p.setProperty('SALT', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  p.setProperty('SHEETS_OK', APP_VERSION);
}

function sheet_(name) { return ss_().getSheetByName(name); }

function rows_(name, width) {
  var sh = sheet_(name), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, width || SHEETS[name].length).getValues().map(function (r) {
    return r.map(function (v) { return v instanceof Date ? v.toISOString() : v; });
  });
}
function hasId_(name, id) {
  var sh = sheet_(name), n = sh.getLastRow();
  if (n < 2 || !id) return null;
  var start = Math.max(2, n - 3000), v = sh.getRange(start, 1, n - start + 1, 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) if (v[i][0] === id) return start + i;
  return null;
}

function writeAll_(name, rows) {
  var sh = sheet_(name), w = SHEETS[name].length, n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, w).clearContent();
  rows = rows.map(function (r) { r = r.slice(0, w); while (r.length < w) r.push(''); return r; });
  if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows);
}

function append_(name, row) {
  sheet_(name).appendRow(row);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return b.map(function (x) { var v = (x < 0 ? x + 256 : x).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function salt_() { return props_().getProperty('SALT'); }
function pinHash_(lrn, pin) { return sha_(salt_() + '|' + String(lrn) + '|' + String(pin)); }
function defaultPin_(lrn) { var s = String(lrn).replace(/\D/g, ''); return s.slice(-4) || '1234'; }

function stamp_(k) { var v = String(Date.now()); props_().setProperty('STAMP_' + k, v); return v; }
function stamps_() {
  var p = props_(), o = {};
  ['settings', 'students', 'lessons', 'assessments', 'users'].forEach(function (k) { o[k] = p.getProperty('STAMP_' + k) || '0'; });
  return o;
}

function pack_(obj, n) {
  var s = JSON.stringify(obj), out = [];
  for (var i = 0; i < n; i++) out.push(s.slice(i * CHUNK, (i + 1) * CHUNK));
  if (s.length > n * CHUNK) throw new Error('Content is too long to save. Please shorten it.');
  return out;
}
function unpack_(cells) { var s = cells.join(''); return s ? JSON.parse(s) : null; }

function settingsObj_() {
  var o = {};
  rows_('Settings').forEach(function (r) { if (r[0]) { try { o[r[0]] = JSON.parse(r[1]); } catch (e) { o[r[0]] = r[1]; } } });
  return o;
}

/* token = base64(user|role|exp).sig */
function makeToken_(u) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify({ u: u.username, r: u.role, n: u.name, s: u.sections, e: Date.now() + 30 * 864e5 }));
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, props_().getProperty('SECRET')));
  return body + '.' + sig;
}
function auth_(tok) {
  if (!tok) return null;
  var parts = String(tok).split('.');
  if (parts.length !== 2) return null;
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], props_().getProperty('SECRET')));
  if (sig !== parts[1]) return null;
  var d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (d.e < Date.now()) return null;
  var urow = rows_('Users').filter(function (r) { return String(r[0]).toLowerCase() === String(d.u).toLowerCase() && String(r[5]) !== 'false' && r[5] !== false; })[0];
  if (!urow) return null;
  return { username: urow[0], name: urow[1], role: urow[2], sections: String(urow[3] || 'ALL') };
}
function canSee_(user, section) {
  if (user.role === 'admin') return true;
  var s = user.sections.split(',').map(function (x) { return x.trim().toLowerCase(); });
  return s.indexOf('all') >= 0 || s.indexOf(String(section).trim().toLowerCase()) >= 0;
}

function stuObj_(r) {
  return { lrn: String(r[0]), last: r[1], first: r[2], middle: r[3], sex: r[4], grade: String(r[5]), section: r[6], level: r[7], pin: r[8], active: !(r[9] === false || String(r[9]) === 'false'), levelSince: r[10], device: String(r[12] || ''), deviceInfo: r[13] || '', cycle: Number(r[14]) || 0, cycleAt: r[15] || '' };
}
function studentMap_() {
  var m = {};
  rows_('Students').forEach(function (r) { if (r[0] !== '') m[String(r[0])] = stuObj_(r); });
  return m;
}
function fullName_(s) { return (s.last + ', ' + s.first + (s.middle ? ' ' + String(s.middle).charAt(0) + '.' : '')).trim(); }
function checkStudent_(lrn, hash) {
  var s = studentMap_()[String(lrn)];
  if (!s || !s.active) throw new Error('Student not found. Please ask your teacher.');
  if (s.pin !== hash) throw new Error('Wrong PIN. Please try again or ask your teacher to reset it.');
  return s;
}

/* ------------------------------------------------------------------ */
/* Public actions                                                      */
/* ------------------------------------------------------------------ */

function info_() {
  var s = settingsObj_();
  return { ok: true, version: APP_VERSION, salt: salt_(), needsSetup: rows_('Users').length === 0, settings: s, stamps: stamps_() };
}

function setup_(req) {
  return withLock_(function () {
    if (rows_('Users').length) return { ok: false, error: 'This database is already set up. Please log in.' };
    var a = req.admin || {};
    if (!a.username || !a.passHash) return { ok: false, error: 'Missing username or password.' };
    append_('Users', [String(a.username).trim(), a.name || a.username, 'admin', 'ALL', a.passHash, true, now_()]);
    var st = req.settings || {};
    writeAll_('Settings', Object.keys(st).map(function (k) { return [k, JSON.stringify(st[k])]; }));
    stamp_('settings'); stamp_('users');
    var u = { username: String(a.username).trim(), name: a.name || a.username, role: 'admin', sections: 'ALL' };
    return { ok: true, token: makeToken_(u), user: u };
  });
}

function login_(req) {
  var r = rows_('Users').filter(function (r) { return String(r[0]).toLowerCase() === String(req.username || '').trim().toLowerCase(); })[0];
  if (!r || r[5] === false || String(r[5]) === 'false') return { ok: false, error: 'Account not found.' };
  if (r[4] !== req.passHash) return { ok: false, error: 'Wrong password.' };
  var u = { username: r[0], name: r[1], role: r[2], sections: String(r[3] || 'ALL') };
  return { ok: true, token: makeToken_(u), user: u };
}

/* Download data for offline use. have = {lessons: stamp, ...} -> only changed collections are sent. */
function pull_(req) {
  var have = req.have || {}, st = stamps_(), res = { ok: true, stamps: st, salt: salt_(), version: APP_VERSION };
  var user = req.token ? auth_(req.token) : null;
  if (have.settings !== st.settings) res.settings = settingsObj_();
  if (have.students !== st.students) {
    res.students = rows_('Students').filter(function (r) { return r[0] !== ''; }).map(stuObj_);
  }
  if (have.lessons !== st.lessons) {
    res.lessons = rows_('Lessons').filter(function (r) { return r[0]; }).map(function (r) { return unpack_([r[7], r[8], r[9]]); });
  }
  if (have.assessments !== st.assessments) {
    res.assessments = rows_('Assessments').filter(function (r) { return r[0]; }).map(function (r) { var a = unpack_([r[5], r[6], r[7], r[8]]); a.open = r[3] === true || String(r[3]) === 'true'; return a; });
  }
  if (user && have.users !== st.users) {
    res.users = rows_('Users').map(function (r) { return { username: r[0], name: r[1], role: r[2], sections: String(r[3]), active: !(r[5] === false || String(r[5]) === 'false') }; });
  }
  if (user) res.user = user;
  return res;
}

function saveAudio_(audio, s, label) {
  if (!audio || !audio.b64) return { id: '', url: '' };
  var p = props_(), fid = p.getProperty('AUDIO_FOLDER'), root;
  try { root = fid ? DriveApp.getFolderById(fid) : null; } catch (e) { root = null; }
  if (!root) { root = DriveApp.createFolder('PEARL App Audio Recordings'); p.setProperty('AUDIO_FOLDER', root.getId()); }
  var syName = 'SY ' + String(settingsObj_().schoolYear || 'current').replace(/[\/\\]/g, '-');
  var yit = root.getFoldersByName(syName), yr = yit.hasNext() ? yit.next() : root.createFolder(syName);
  var sub, it = yr.getFoldersByName(s.level || 'Unassigned');
  sub = it.hasNext() ? it.next() : yr.createFolder(s.level || 'Unassigned');
  var ext = /mp4|m4a|aac/.test(audio.mime || '') ? 'm4a' : (/ogg/.test(audio.mime || '') ? 'ogg' : 'webm');
  var name = label + '_' + String(s.last).replace(/\s+/g, '') + '_' + String(s.first).replace(/\s+/g, '') + '_' + s.lrn + '.' + ext;
  var f = sub.createFile(Utilities.newBlob(Utilities.base64Decode(audio.b64), audio.mime || 'audio/webm', name));
  return { id: f.getId(), url: f.getUrl() };
}

/* work done offline last school year but uploaded after the new year started goes into that year's archive */
function yearOfRec_(rec) {
  var cur = settingsObj_();
  if (!rec || rec.syId == null || String(rec.syId) === String(cur.syId || '')) return null;
  return archiveOf_('syId', String(rec.syId)) || null;
}
function submitDaily_(req) {
  var arc = yearOfRec_(req.rec);
  if (arc) return inYear_(arc, function () { return submitDailyIn_(req, true); });
  return submitDailyIn_(req, false);
}
function submitResult_(req) {
  var arc = yearOfRec_(req.rec);
  if (arc) return inYear_(arc, function () { return submitResultIn_(req, true); });
  return submitResultIn_(req, false);
}
function submitDailyIn_(req, late) {
  var s = checkStudent_(req.lrn, req.pinHash);
  var r = req.rec || {};
  if (!late) deviceSeen_(s, r.device, 'submit');
  if (hasId_('Daily', r.id)) return { ok: true, id: r.id, duplicate: true };
  var label = (r.level || s.level) + '_Day' + ('0' + r.day).slice(-2);
  var au = saveAudio_(req.audio, s, label);
  var syncedAt = now_();
  var data = { quiz: r.quiz, written: r.written, reflection: r.reflection, vocabUsed: r.vocabUsed, steps: r.steps, mime: req.audio && req.audio.mime, autoCheck: r.autoCheck || null };
  var ac = r.autoCheck ? r.autoCheck.total + '/' + r.autoCheck.max + ((r.autoCheck.flags || []).length ? ' ' + r.autoCheck.flags.join(',') : '') : '';
  withLock_(function () {
    append_('Daily', [r.id, s.lrn, fullName_(s), s.section, r.level || s.level, r.day, r.lessonId, r.title, r.score, r.total,
      (r.written || []).join('').trim() ? 'Y' : 'N', r.wordCount || 0, (r.vocabUsed || []).join(', '), r.audioStatus || (au.id ? 'recorded' : 'none'),
      r.audioSec || 0, au.id, au.url, r.startedAt || '', r.completedAt || syncedAt, syncedAt, r.device || '', JSON.stringify(data), ac, r.cycle != null ? Number(r.cycle) : s.cycle]);
  });
  return { ok: true, id: r.id, syncedAt: syncedAt };
}

function submitResultIn_(req, late) {
  var s = checkStudent_(req.lrn, req.pinHash);
  var r = req.rec || {};
  if (!late) deviceSeen_(s, r.device, 'test');
  if (hasId_('Results', r.id)) return { ok: true, id: r.id, duplicate: true };
  var audios = {};
  (req.audios || []).forEach(function (a) { var x = saveAudio_(a, s, 'Assessment_' + r.assessmentId + '_' + a.itemId); audios[a.itemId] = x; });
  var syncedAt = now_();
  var data = { answers: r.answers, auto: r.auto, audios: audios, levelAtTest: r.level, leaves: r.leaves || 0, autoSubmitted: !!r.autoSubmitted, device: r.device || '' };
  withLock_(function () {
    append_('Results', [r.id, s.lrn, fullName_(s), s.section, r.level || s.level, r.assessmentId, r.title, r.type, r.autoScore, r.autoTotal, r.manualPending || 0, r.completedAt || syncedAt, syncedAt, JSON.stringify(data)]);
  });
  return { ok: true, id: r.id, syncedAt: syncedAt };
}

function changePin_(req) {
  var s = checkStudent_(req.lrn, req.pinHash);
  if (!req.newHash) return { ok: false, error: 'Missing new PIN' };
  return withLock_(function () {
    var rows = rows_('Students');
    rows.forEach(function (r) { if (String(r[0]) === s.lrn) { r[8] = req.newHash; r[11] = now_(); } });
    writeAll_('Students', rows); stamp_('students');
    return { ok: true };
  });
}

function gradesMap_() {
  var m = {};
  rows_('Grades').forEach(function (r) {
    try {
      var g = JSON.parse(r[4]), prev = m[r[0]];
      m[r[0]] = { by: r[2], at: r[3], u: g._u || '', g: g, firstAt: prev ? prev.firstAt : r[3], firstBy: prev ? prev.firstBy : (g._u || r[2]) };
    } catch (e) { }
  });
  return m;
}

/* Daily records summary (deduped: first submission per student per lesson) */
function dailySummary_(filterFn) {
  var seen = {}, out = [], g = gradesMap_();
  var sh = sheet_('Daily'), n = sh.getLastRow();
  var auto = n > 1 ? sh.getRange(2, 23, n - 1, 2).getValues() : [];
  rows_('Daily', 21).forEach(function (r, ri) {
    if (!r[0] || seen['id' + r[0]]) return;
    seen['id' + r[0]] = 1;
    var cyc = auto[ri] ? Number(auto[ri][1]) || 0 : 0;
    var k = r[1] + '|' + r[6] + '|' + cyc;
    if (seen[k]) return; seen[k] = 1;
    if (filterFn && !filterFn(r)) return;
    var gr = g[r[0]];
    out.push([r[0], String(r[1]), r[4], r[5], r[6], r[8], r[9], r[10], r[11], r[13], r[14], r[18], r[19], r[3], gr ? gr.g : null, r[15] ? 1 : 0, r[12], auto[ri] ? String(auto[ri][0] || '') : '', cyc, gr ? gr.firstBy : '', gr ? gr.firstAt : '']);
  });
  return out;
}
var DAILY_FIELDS = ['id', 'lrn', 'level', 'day', 'lessonId', 'score', 'total', 'written', 'words', 'audioStatus', 'audioSec', 'completedAt', 'syncedAt', 'section', 'grade', 'hasAudio', 'vocabUsed', 'auto', 'cycle', 'gradedBy', 'gradedAt'];

function resultsSummary_(filterFn) {
  var seen = {}, out = [], g = gradesMap_();
  rows_('Results', 13).forEach(function (r) {
    if (!r[0] || seen[r[0]]) return; seen[r[0]] = 1;
    if (filterFn && !filterFn(r)) return;
    var gr = g[r[0]];
    out.push([r[0], String(r[1]), r[4], r[5], r[7], r[8], r[9], r[10], r[11], r[3], gr ? gr.g : null, gr ? gr.firstBy : '', gr ? gr.firstAt : '']);
  });
  return out;
}
var RESULT_FIELDS = ['id', 'lrn', 'level', 'assessmentId', 'type', 'autoScore', 'autoTotal', 'manualPending', 'completedAt', 'section', 'grade', 'gradedBy', 'gradedAt'];

/* WATCH board + my progress for students (no auth needed for the board: names + times only) */
function board_(req) {
  var sm = studentMap_(), rows = dailySummary_(function (r) { return !req.lessonId || r[6] === req.lessonId; });
  var lessonId = req.lessonId;
  var list = rows.filter(function (r) { return r[4] === lessonId; }).sort(function (a, b) { return String(a[11]).localeCompare(String(b[11])); }).slice(0, 50)
    .map(function (r) { var s = sm[r[1]] || {}; return { name: s.first ? (s.first + ' ' + String(s.last).charAt(0) + '.') : 'Learner', section: r[13], level: r[2], at: r[11], me: r[1] === String(req.lrn || '') }; });
  return { ok: true, list: list };
}

function myProgress_(req) {
  var s = checkStudent_(req.lrn, req.pinHash);
  var g = gradesMap_(), seen = {};
  var daily = rows_('Daily').filter(function (r) { return String(r[1]) === s.lrn && (Number(r[23]) || 0) === s.cycle; }).filter(function (r) { var k = r[6]; if (seen[k]) return false; seen[k] = 1; return true; })
    .map(function (r) { var d = {}; try { d = JSON.parse(r[21]); } catch (e) { } return { id: r[0], lessonId: r[6], level: r[4], day: r[5], score: r[8], total: r[9], audioStatus: r[13], audioSec: r[14], completedAt: r[18], syncedAt: r[19], written: d.written, quiz: d.quiz, feedback: g[r[0]] ? g[r[0]].g : null }; });
  var res = rows_('Results').filter(function (r) { return String(r[1]) === s.lrn; })
    .map(function (r) { return { id: r[0], assessmentId: r[5], autoScore: r[8], autoTotal: r[9], manualPending: r[10], completedAt: r[11], grade: g[r[0]] ? g[r[0]].g : null }; });
  return { ok: true, daily: daily, results: res, student: { level: s.level, section: s.section, cycle: s.cycle } };
}

/* ------------------------------------------------------------------ */
/* School years: close the year into a verified archive copy, start fresh */
/* ------------------------------------------------------------------ */
function closeYear_(req, user) {
  var newSy = String(req.newSy || '').trim();
  if (!newSy) return { ok: false, error: 'Please type the new school year, e.g. 2027–2028.' };
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), cur = settingsObj_(), oldSy = String(cur.schoolYear || 'previous');
    if ((cur.archives || []).some(function (a) { return a.sy === oldSy; }) && !req.force) return { ok: false, error: 'SY ' + oldSy + ' was already archived. Change the current school year name first.' };
    // 1) full copy of the database
    var copy = ss.copy('PEARL Archive — SY ' + oldSy + ' — ' + (cur.schoolName || 'School'));
    var file = DriveApp.getFileById(copy.getId());
    try {
      var p = props_(), fid = p.getProperty('ARCHIVE_FOLDER'), folder = null;
      try { folder = fid ? DriveApp.getFolderById(fid) : null; } catch (e) { folder = null; }
      if (!folder) { folder = DriveApp.createFolder('PEARL App School Year Archives'); p.setProperty('ARCHIVE_FOLDER', folder.getId()); }
      file.moveTo(folder);
    } catch (e) { }
    // 2) verify the copy before clearing anything
    var keep = ['Students', 'Daily', 'Results', 'Grades', 'LevelHistory', 'Logins', 'Lessons', 'Assessments', 'Users', 'Settings'];
    keep.forEach(function (n) {
      var a = ss.getSheetByName(n), b = copy.getSheetByName(n);
      if (a && (!b || b.getLastRow() !== a.getLastRow())) throw new Error('Archive check failed for "' + n + '". Nothing was cleared. Please try again.');
    });
    var learners = Math.max(0, ss.getSheetByName('Students').getLastRow() - 1), subs = Math.max(0, ss.getSheetByName('Daily').getLastRow() - 1);
    var arc = { sy: oldSy, syId: String(cur.syId || ''), id: copy.getId(), url: copy.getUrl(), closedAt: now_(), by: user.name, learners: learners, submissions: subs, tests: Math.max(0, ss.getSheetByName('Results').getLastRow() - 1) };
    // 3) start the new year
    ['Daily', 'Results', 'Grades', 'LevelHistory', 'Logins'].forEach(function (n) { writeAll_(n, []); });
    var studs = rows_('Students').filter(function (r) { return r[0] !== ''; }), kept = 0;
    if (req.keep === 'g11') {
      studs = studs.filter(function (r) { return /^11/.test(String(r[5])); }).map(function (r) { r[5] = '12'; r[6] = ''; r[10] = now_(); r[11] = now_(); r[14] = 0; r[15] = ''; return r; });
      kept = studs.length;
    } else if (req.keep === 'all') { studs.forEach(function (r) { r[14] = 0; r[15] = ''; }); kept = studs.length; }
    else studs = [];
    writeAll_('Students', studs);
    var as = rows_('Assessments').filter(function (r) { return r[0]; }); as.forEach(function (r) { r[3] = false; }); writeAll_('Assessments', as);
    var st = settingsObj_();
    st.archives = (st.archives || []).concat([arc]);
    st.schoolYear = newSy; st.syId = Utilities.getUuid().slice(0, 8); st.releasedDay = 1; st.sharedDevices = st.sharedDevices || [];
    writeAll_('Settings', Object.keys(st).map(function (k) { return [k, JSON.stringify(st[k])]; }));
    ['settings', 'students', 'assessments'].forEach(stamp_);
    return { ok: true, archive: arc, kept: kept, syId: st.syId };
  });
}

/* ------------------------------------------------------------------ */
/* Device lock (one phone per learner, one learner per phone)          */
/* ------------------------------------------------------------------ */

function secSettings_() {
  var st = settingsObj_();
  return { lock: st.deviceLock !== false, onePerPhone: st.onePerPhone !== false, shared: st.sharedDevices || [] };
}
function logRow_(lrn, name, device, event, detail, info, verified) {
  append_('Logins', [now_(), String(lrn || ''), name || '', device || '', event, detail || '', info || '', verified ? 'Y' : 'N']);
}
/* remember the phone the first time; flag work that arrives from another phone */
function deviceSeen_(s, device, what) {
  if (!device) return;
  if (!s.device) { setStudentDevice_(s.lrn, device, ''); return; }
  if (s.device !== device) withLock_(function () { logRow_(s.lrn, fullName_(s), device, 'other-phone-' + what, 'Registered phone: ' + s.device, '', true); });
}
function setStudentDevice_(lrn, device, info) {
  withLock_(function () {
    var rows = rows_('Students');
    rows.forEach(function (r) { if (String(r[0]) === String(lrn)) { r[12] = device; r[13] = info || r[13] || ''; r[11] = now_(); } });
    writeAll_('Students', rows); stamp_('students');
  });
}
function bindDevice_(req) {
  var s = checkStudent_(req.lrn, req.pinHash), sec = secSettings_(), dev = String(req.device || ''), name = fullName_(s);
  if (!dev) return { ok: false, error: 'Missing device id' };
  if (sec.lock && s.device && s.device !== dev) {
    withLock_(function () { logRow_(s.lrn, name, dev, 'blocked-other-phone', 'Registered phone: ' + s.device, req.info, true); });
    return { ok: false, code: 'DEVICE', error: 'This account is registered to another phone. Ask your teacher to reset your phone.' };
  }
  if (sec.onePerPhone && sec.shared.indexOf(dev) < 0) {
    var other = rows_('Students').filter(function (r) { return String(r[12]) === dev && String(r[0]) !== s.lrn && !(r[9] === false || String(r[9]) === 'false'); })[0];
    if (other) {
      withLock_(function () { logRow_(s.lrn, name, dev, 'blocked-phone-used', 'Phone belongs to ' + other[2] + ' ' + other[1] + ' (' + other[0] + ')', req.info, true); });
      return { ok: false, code: 'PHONE', error: 'This phone is already registered to another learner (' + other[2] + ' ' + String(other[1]).charAt(0) + '.). One account per phone only.' };
    }
  }
  if (!s.device) setStudentDevice_(s.lrn, dev, req.info);
  withLock_(function () { logRow_(s.lrn, name, dev, 'login', '', req.info, true); });
  return { ok: true, device: dev };
}
/* events recorded on the phone (also offline): login, left-app, screenshot key, blocked attempts */
function logEvents_(req) {
  var sm = studentMap_(), rows = [];
  (req.events || []).slice(0, 500).forEach(function (e) {
    var s = sm[String(e.lrn)], ok = !!(s && e.pinHash && s.pin === e.pinHash);
    rows.push([e.at || now_(), String(e.lrn || ''), s ? fullName_(s) : '', e.device || '', String(e.event || '').slice(0, 40), String(e.detail || '').slice(0, 300), String(e.info || '').slice(0, 120), ok ? 'Y' : 'N']);
  });
  if (rows.length) withLock_(function () { var sh = sheet_('Logins'); sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); });
  return { ok: true, count: rows.length };
}
function resetDevices_(req, user) {
  var set = {}; (req.lrns || []).forEach(function (l) { set[String(l)] = 1; });
  var n = 0;
  withLock_(function () {
    var rows = rows_('Students');
    rows.forEach(function (r) { if (set[String(r[0])] && canSee_(user, r[6])) { logRow_(r[0], r[2] + ' ' + r[1], r[12], 'phone-reset', 'by ' + user.name, '', true); r[12] = ''; r[13] = ''; r[11] = now_(); n++; } });
    writeAll_('Students', rows);
  });
  return { ok: true, count: n, stamp: stamp_('students') };
}
function setShared_(req, user) {
  var cur = settingsObj_(), list = cur.sharedDevices || [];
  list = list.filter(function (d) { return d !== req.device; });
  if (req.shared) list.push(req.device);
  return saveSettings_({ settings: { sharedDevices: list } }, user);
}
/* who logs in on which phone, devices shared by several learners, leaving the app, blocked attempts */
function security_(req, user) {
  var sm = studentMap_(), days = Number(req.days) || 30, since = new Date(Date.now() - days * 864e5).toISOString();
  var vis = function (lrn) { var s = sm[String(lrn)]; return s ? canSee_(user, s.section) : user.role === 'admin'; };
  var dev = {}, per = {}, recent = [];
  rows_('Logins').forEach(function (r) {
    if (!r[1] || !vis(r[1])) return;
    var d = String(r[3] || ''), l = String(r[1]), ev = String(r[4]);
    if (d) { var x = dev[d] = dev[d] || { device: d, lrns: {}, logins: 0, last: '', info: '' }; x.lrns[l] = (x.lrns[l] || 0) + 1; if (ev === 'login') x.logins++; if (r[0] > x.last) x.last = r[0]; if (r[6]) x.info = r[6]; }
    if (String(r[0]) < since) return;
    var p = per[l] = per[l] || { lrn: l, logins: 0, left: 0, shots: 0, blocked: 0, other: 0, devices: {} };
    if (ev === 'login') p.logins++; else if (ev === 'left-app') p.left++; else if (ev === 'screenshot-key' || ev === 'print-attempt' || ev === 'copy-attempt') p.shots++; else if (ev.indexOf('blocked') === 0) p.blocked++; else if (ev.indexOf('other-phone') === 0) p.other++;
    if (d) p.devices[d] = 1;
    if (ev !== 'login') recent.push([r[0], l, d, ev, r[5]]);
  });
  var devices = Object.keys(dev).map(function (k) { var x = dev[k]; return { device: k, lrns: Object.keys(x.lrns), logins: x.logins, last: x.last, info: x.info }; });
  return { ok: true, devices: devices, learners: Object.keys(per).map(function (k) { var p = per[k]; p.devices = Object.keys(p.devices).length; return p; }), recent: recent.slice(-300), shared: secSettings_().shared };
}

/* ------------------------------------------------------------------ */
/* Teacher actions                                                     */
/* ------------------------------------------------------------------ */

function dashboard_(req, user) {
  var sm = studentMap_();
  var vis = function (lrn) { var s = sm[String(lrn)]; return s ? canSee_(user, s.section) : user.role === 'admin'; };
  var hist = rows_('LevelHistory').map(function (r) { return [r[0], String(r[1]), r[3], r[4], r[5], r[6]]; }).filter(function (r) { return vis(r[1]); });
  return {
    ok: true, generated: now_(),
    dailyFields: DAILY_FIELDS, daily: dailySummary_(function (r) { return vis(r[1]); }),
    resultFields: RESULT_FIELDS, results: resultsSummary_(function (r) { return vis(r[1]); }),
    levelHistory: hist
  };
}

function studentDetail_(req, user) {
  var s = studentMap_()[String(req.lrn)];
  if (!s) return { ok: false, error: 'Student not found' };
  if (!canSee_(user, s.section)) return { ok: false, error: 'This student is not in your sections.' };
  var g = gradesMap_(), seen = {}, all = rows_('Daily'), sm = studentMap_();
  var daily = all.filter(function (r) { return String(r[1]) === s.lrn; }).filter(function (r) { var k = r[6] + '|' + (Number(r[23]) || 0); if (seen[k]) return false; seen[k] = 1; return true; })
    .map(function (r) {
      var d = {}; try { d = JSON.parse(r[21]); } catch (e) { }
      var mine = (d.written || []).join(' '), similar = [];
      if (mine.split(/\s+/).length >= 12) all.forEach(function (o) {
        if (o[6] !== r[6] || String(o[1]) === s.lrn) return;
        var od = {}; try { od = JSON.parse(o[21]); } catch (e) { }
        var sim = similarity_(mine, (od.written || []).join(' '));
        if (sim >= 0.7) { var os = sm[String(o[1])]; similar.push({ name: os ? fullName_(os) : String(o[1]), section: os ? os.section : '', pct: Math.round(sim * 100), at: o[18] }); }
      });
      return { id: r[0], lessonId: r[6], level: r[4], day: r[5], title: r[7], score: r[8], total: r[9], words: r[11], vocabUsed: r[12], audioStatus: r[13], audioSec: r[14], audioId: r[15], audioUrl: r[16], completedAt: r[18], syncedAt: r[19], data: d, grade: g[r[0]] || null, similar: similar, cycle: Number(r[23]) || 0 };
    });
  var results = rows_('Results').filter(function (r) { return String(r[1]) === s.lrn; })
    .map(function (r) { var d = {}; try { d = JSON.parse(r[13]); } catch (e) { } return { id: r[0], assessmentId: r[5], title: r[6], type: r[7], level: r[4], autoScore: r[8], autoTotal: r[9], manualPending: r[10], completedAt: r[11], data: d, grade: g[r[0]] || null }; });
  var hist = rows_('LevelHistory').filter(function (r) { return String(r[1]) === s.lrn; }).map(function (r) { return { at: r[0], from: r[3], to: r[4], reason: r[5], by: r[6] }; });
  delete s.pin;
  var logins = rows_('Logins').filter(function (r) { return String(r[1]) === s.lrn; }).slice(-60).map(function (r) { return { at: r[0], device: r[3], event: r[4], detail: r[5], info: r[6] }; });
  return { ok: true, student: s, daily: daily, results: results, history: hist, logins: logins };
}

/* share of 3-word sequences two answers have in common (0..1) */
function similarity_(a, b) {
  var common = {}; ('i you we they he she it is are am was were be the a an and or but to of in on for with that this my our your think believe because important opinion example agree disagree can will should would do not it\'s so very also more people') .split(' ').forEach(function (w) { common[w] = 1; });
  var tri = function (t) { var w = String(t || '').toLowerCase().match(/[a-z0-9']+/g) || [], o = {}; for (var i = 0; i + 3 <= w.length; i++) { var g = w.slice(i, i + 3); if (g.every(function (x) { return common[x]; })) continue; o[g.join(' ')] = 1; } return o; };
  var A = tri(a), B = tri(b), ka = Object.keys(A), kb = Object.keys(B);
  if (ka.length < 4 || kb.length < 4) return 0;
  return ka.filter(function (k) { return B[k]; }).length / Math.min(ka.length, kb.length);
}

/* When 2+ teachers share a section, the coordinator can split the checking:
 * shared (both), by level, by learner's last name (letter ranges), or by day (teacher 1 odd days, teacher 2 even days, ...) */
function pickCheckers_(cfg, tlist, learner, level, day) {
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
  return out.length ? out : tlist; // anything not covered by the split goes to all assigned teachers
}

/* Checking accountability: who is assigned to check each section, how much is checked, and who checks the most.
 * A teacher is assigned to the sections listed in their account (accounts with ALL are coordinators/monitors). */
function teacherStats_(req, user) {
  var days = Number(req.days) || 30, since = new Date(Date.now() - days * 864e5).toISOString();
  var sm = studentMap_(), st = settingsObj_(), released = Number(st.releasedDay) || 40;
  var users = rows_('Users').filter(function (r) { return r[0] && !(r[5] === false || String(r[5]) === 'false'); })
    .map(function (r) { return { username: String(r[0]), name: r[1], role: r[2], sections: String(r[3] || 'ALL').split(',').map(function (x) { return x.trim(); }).filter(Boolean) }; });
  var byName = {}; users.forEach(function (u) { byName[String(u.name).toLowerCase()] = u.username; byName[u.username.toLowerCase()] = u.username; });
  var who = function (x) { return x ? (byName[String(x).toLowerCase()] || String(x)) : ''; };
  var secT = {}; // section -> assigned usernames
  users.forEach(function (u) { if (u.sections.some(function (s) { return /^all$/i.test(s); })) return; u.sections.forEach(function (s) { (secT[s.toLowerCase()] = secT[s.toLowerCase()] || []).push(u.username); }); });
  Object.keys(secT).forEach(function (k) { secT[k].sort(); });
  var split = st.checkSplit || {};
  var assignees = function (s, level, day) { var k = String(s.section).toLowerCase(); return pickCheckers_(split[k], secT[k] || [], s, level, day); };
  var items = [];
  dailySummary_().forEach(function (r) { items.push({ id: r[0], lrn: r[1], kind: 'daily', level: r[2], day: r[3], at: r[11], by: who(r[19]), gat: r[20], checked: !!r[14], comment: r[14] && r[14].comment && !r[14].auto ? 1 : 0, auto: r[14] && r[14].auto ? 1 : 0 }); });
  resultsSummary_().forEach(function (r) { if (Number(r[7]) > 0) items.push({ id: r[0], lrn: r[1], kind: 'test', level: r[2], day: 0, at: r[8], by: who(r[11]), gat: r[12], checked: !!r[10], comment: r[10] && r[10].comment ? 1 : 0 }); });
  var sec = {}, T = {};
  users.forEach(function (u) { T[u.username] = { username: u.username, name: u.name, role: u.role, sections: u.sections, assigned: 0, assignedChecked: 0, checks: 0, comments: 0, autoAccepted: 0, hours: [], last: '', learners: 0, doneDays: 0 }; });
  items.forEach(function (it) {
    var s = sm[it.lrn]; if (!s) return;
    var key = String(s.section).toLowerCase(), inP = String(it.at) >= since;
    var S = sec[key] = sec[key] || { section: s.section, total: 0, checked: 0, pending: 0, oldest: '', per: {} };
    var mine = assignees(s, it.level || s.level, it.day);
    if (inP) { S.total++; if (it.checked) S.checked++; mine.forEach(function (u) { var q = S.per[u] = S.per[u] || { total: 0, checked: 0 }; q.total++; if (it.checked) q.checked++; }); }
    if (!it.checked) { S.pending++; if (!S.oldest || it.at < S.oldest) S.oldest = it.at; }
    mine.forEach(function (u) { var t = T[u]; if (t && inP) { t.assigned++; if (it.checked) t.assignedChecked++; } });
    if (it.checked && it.by && String(it.gat) >= since) {
      var t = T[it.by] || (T[it.by] = { username: it.by, name: it.by, role: '', sections: [], assigned: 0, assignedChecked: 0, checks: 0, comments: 0, autoAccepted: 0, hours: [], last: '', learners: 0, doneDays: 0 });
      t.checks++; t.comments += it.comment; t.autoAccepted += it.auto || 0;
      var h = (new Date(it.gat) - new Date(it.at)) / 36e5; if (h >= 0 && h < 24 * 60) t.hours.push(h);
      if (String(it.gat) > t.last) t.last = it.gat;
    }
  });
  // learner engagement in each teacher's sections (pearls done in the current round)
  var done = {}; dailySummary_().forEach(function (r) { var s = sm[r[1]]; if (s && (Number(r[18]) || 0) === s.cycle) done[r[1]] = (done[r[1]] || 0) + 1; });
  Object.keys(sm).forEach(function (l) { var s = sm[l]; if (!s.active) return; assignees(s, s.level, 0).forEach(function (u) { var t = T[u]; if (t) { t.learners++; t.doneDays += Math.min(released, done[l] || 0); } }); });
  var teachers = Object.keys(T).map(function (k) {
    var t = T[k], hs = t.hours.sort(function (a, b) { return a - b; });
    t.median = hs.length ? Math.round(hs[Math.floor(hs.length / 2)] * 10) / 10 : null; delete t.hours;
    t.pct = t.assigned ? Math.round(t.assignedChecked / t.assigned * 100) : null;
    t.engagement = t.learners ? Math.round(t.doneDays / (t.learners * released) * 100) : null;
    return t;
  });
  var sections = {}; Object.keys(sm).forEach(function (l) { var s = sm[l]; if (!s.active) return; var k = String(s.section).toLowerCase(); sections[k] = sections[k] || { section: s.section, learners: 0 }; sections[k].learners++; });
  var secList = Object.keys(sections).map(function (k) { var x = sec[k] || { total: 0, checked: 0, pending: 0, oldest: '' }; return { section: sections[k].section, learners: sections[k].learners, teachers: (secT[k] || []).map(function (u) { return T[u] ? T[u].name : u; }), split: (split[k] && (secT[k] || []).length > 1) ? split[k].mode : 'shared', per: Object.keys(x.per || {}).map(function (u) { var q = x.per[u]; return { name: T[u] ? T[u].name : u, total: q.total, checked: q.checked, pct: q.total ? Math.round(q.checked / q.total * 100) : null }; }), total: x.total, checked: x.checked, pending: x.pending, oldest: x.oldest, pct: x.total ? Math.round(x.checked / x.total * 100) : null }; });
  return { ok: true, days: days, teachers: teachers, sections: secList, me: user.username };
}

/* accept many suggested grades at once: [{recId, kind, grade}] */
function gradeMany_(req, user) {
  var list = req.items || [];
  withLock_(function () {
    var sh = sheet_('Grades'), at = now_();
    var rows = list.map(function (x) { var g = x.grade || {}; g._u = user.username; return [x.recId, x.kind || 'daily', user.name || user.username, at, JSON.stringify(g)]; });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  });
  return { ok: true, count: list.length };
}

function getAudio_(req, user) {
  var f = DriveApp.getFileById(req.fileId);
  var b = f.getBlob();
  return { ok: true, b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() || 'audio/webm' };
}

/* Teacher feedback on daily task, or manual scores for assessment items */
function grade_(req, user) {
  var g = req.grade || {}; g._u = user.username;
  withLock_(function () { append_('Grades', [req.recId, req.kind || 'daily', user.name || user.username, now_(), JSON.stringify(g)]); });
  return { ok: true };
}

function saveSettings_(req, user) {
  return withLock_(function () {
    var cur = settingsObj_(), st = req.settings || {};
    Object.keys(st).forEach(function (k) { cur[k] = st[k]; });
    var rows = Object.keys(cur).map(function (k) { var v = JSON.stringify(cur[k]); if (v.length > 49000) throw new Error('The value for "' + k + '" is too large. Use a smaller image.'); return [k, v]; });
    writeAll_('Settings', rows);
    return { ok: true, stamp: stamp_('settings'), settings: cur };
  });
}

function saveStudents_(req, user) {
  return withLock_(function () {
    var rows = rows_('Students').filter(function (r) { return r[0] !== ''; }), idx = {};
    rows.forEach(function (r, i) { idx[String(r[0])] = i; });
    var added = 0, updated = 0;
    (req.students || []).forEach(function (s) {
      var lrn = String(s.lrn || '').trim();
      if (!lrn) return;
      if (!canSee_(user, s.section)) return;
      var i = idx[lrn];
      if (i === undefined) {
        var pin = s.newPin ? pinHash_(lrn, s.newPin) : pinHash_(lrn, defaultPin_(lrn));
        rows.push([lrn, s.last || '', s.first || '', s.middle || '', s.sex || '', s.grade || '', s.section || '', s.level || 'Beginner', pin, s.active !== false, now_(), now_()]);
        idx[lrn] = rows.length - 1; added++;
      } else {
        var r = rows[i];
        if (s.level && r[7] !== s.level) { append_('LevelHistory', [now_(), lrn, fullName_({ last: s.last || r[1], first: s.first || r[2], middle: s.middle || r[3] }), r[7], s.level, s.reason || 'Edited by teacher', user.name]); r[10] = now_(); }
        r[1] = s.last != null ? s.last : r[1]; r[2] = s.first != null ? s.first : r[2]; r[3] = s.middle != null ? s.middle : r[3];
        r[4] = s.sex != null ? s.sex : r[4]; r[5] = s.grade != null ? s.grade : r[5]; r[6] = s.section != null ? s.section : r[6];
        r[7] = s.level || r[7]; if (s.active != null) r[9] = s.active; if (s.newPin) r[8] = pinHash_(lrn, s.newPin); r[11] = now_();
        updated++;
      }
    });
    writeAll_('Students', rows);
    return { ok: true, added: added, updated: updated, stamp: stamp_('students') };
  });
}

function deleteStudents_(req, user) {
  return withLock_(function () {
    var del = {}; (req.lrns || []).forEach(function (l) { del[String(l)] = 1; });
    var rows = rows_('Students').filter(function (r) { return r[0] !== '' && !(del[String(r[0])] && canSee_(user, r[6])); });
    writeAll_('Students', rows);
    return { ok: true, stamp: stamp_('students') };
  });
}

function resetPins_(req, user) {
  return withLock_(function () {
    var set = {}; (req.lrns || []).forEach(function (l) { set[String(l)] = 1; });
    var rows = rows_('Students'), n = 0;
    rows.forEach(function (r) { if (set[String(r[0])] && canSee_(user, r[6])) { r[8] = pinHash_(r[0], req.pin || defaultPin_(r[0])); r[11] = now_(); n++; } });
    writeAll_('Students', rows);
    return { ok: true, count: n, stamp: stamp_('students') };
  });
}

/* Releveling / placement: [{lrn, level, reason}] */
function setLevels_(req, user) {
  return withLock_(function () {
    var ch = {}; (req.changes || []).forEach(function (c) { ch[String(c.lrn)] = c; });
    var rows = rows_('Students'), n = 0;
    rows.forEach(function (r) {
      var c = ch[String(r[0])];
      if (!c || !canSee_(user, r[6])) return;
      if (c.restart) {
        append_('LevelHistory', [now_(), String(r[0]), fullName_({ last: r[1], first: r[2], middle: r[3] }), r[7], c.level || r[7], (c.reason || 'Retained') + ' — restart from Day 1', user.name]);
        if (c.level) r[7] = c.level;
        r[14] = (Number(r[14]) || 0) + 1; r[15] = now_(); r[10] = now_(); r[11] = now_(); n++;
      } else if (c.level && r[7] !== c.level) {
        append_('LevelHistory', [now_(), String(r[0]), fullName_({ last: r[1], first: r[2], middle: r[3] }), r[7], c.level, c.reason || '', user.name]);
        r[7] = c.level; r[10] = now_(); r[11] = now_(); n++;
      }
    });
    writeAll_('Students', rows);
    return { ok: true, count: n, stamp: stamp_('students') };
  });
}

function saveLessons_(req, user) {
  return withLock_(function () {
    var rows = rows_('Lessons').filter(function (r) { return r[0]; }), idx = {};
    if (req.replaceAll) rows = [];
    rows.forEach(function (r, i) { idx[r[0]] = i; });
    (req.lessons || []).forEach(function (L) {
      if (!L.id) L.id = (L.level || 'X').charAt(0) + '-' + Utilities.getUuid().slice(0, 8);
      var c = pack_(L, 3);
      var row = [L.id, L.level || '', L.week || '', L.day || '', L.title || '', L.kind || 'daily', now_(), c[0], c[1], c[2]];
      if (idx[L.id] === undefined) { rows.push(row); idx[L.id] = rows.length - 1; } else rows[idx[L.id]] = row;
    });
    rows.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])) || (Number(a[3]) || 999) - (Number(b[3]) || 999); });
    writeAll_('Lessons', rows);
    return { ok: true, count: rows.length, stamp: stamp_('lessons') };
  });
}

function deleteLessons_(req, user) {
  return withLock_(function () {
    var del = {}; (req.ids || []).forEach(function (i) { del[i] = 1; });
    writeAll_('Lessons', rows_('Lessons').filter(function (r) { return r[0] && !del[r[0]]; }));
    return { ok: true, stamp: stamp_('lessons') };
  });
}

function saveAssessment_(req, user) {
  return withLock_(function () {
    var list = req.assessments || [req.assessment];
    var rows = rows_('Assessments').filter(function (r) { return r[0]; }), idx = {};
    rows.forEach(function (r, i) { idx[r[0]] = i; });
    list.forEach(function (A) {
      if (!A.id) A.id = 'A-' + Utilities.getUuid().slice(0, 8);
      A.updated = now_(); A.by = user.name;
      var c = pack_(A, 4);
      var row = [A.id, A.title, A.type, !!A.open, A.updated, c[0], c[1], c[2], c[3]];
      if (idx[A.id] === undefined) rows.push(row); else rows[idx[A.id]] = row;
    });
    writeAll_('Assessments', rows);
    return { ok: true, id: list[0].id, stamp: stamp_('assessments') };
  });
}

function deleteAssessment_(req, user) {
  return withLock_(function () {
    writeAll_('Assessments', rows_('Assessments').filter(function (r) { return r[0] && r[0] !== req.id; }));
    return { ok: true, stamp: stamp_('assessments') };
  });
}

function saveUser_(req, user) {
  return withLock_(function () {
    var u = req.user || {}, rows = rows_('Users').filter(function (r) { return r[0]; });
    var i = -1; rows.forEach(function (r, j) { if (String(r[0]).toLowerCase() === String(u.username).toLowerCase()) i = j; });
    if (i < 0) {
      if (!u.passHash) return { ok: false, error: 'Password is required for a new account.' };
      rows.push([String(u.username).trim(), u.name || u.username, u.role || 'teacher', u.sections || 'ALL', u.passHash, u.active !== false, now_()]);
    } else {
      var r = rows[i]; r[1] = u.name || r[1]; r[2] = u.role || r[2]; r[3] = u.sections != null ? u.sections : r[3];
      if (u.passHash) r[4] = u.passHash; if (u.active != null) r[5] = u.active;
    }
    writeAll_('Users', rows);
    return { ok: true, stamp: stamp_('users') };
  });
}

function deleteUser_(req, user) {
  if (String(req.username).toLowerCase() === String(user.username).toLowerCase()) return { ok: false, error: 'You cannot delete your own account.' };
  return withLock_(function () {
    writeAll_('Users', rows_('Users').filter(function (r) { return r[0] && String(r[0]).toLowerCase() !== String(req.username).toLowerCase(); }));
    return { ok: true, stamp: stamp_('users') };
  });
}

function changePassword_(req, user) {
  return withLock_(function () {
    var rows = rows_('Users');
    var r = rows.filter(function (r) { return String(r[0]).toLowerCase() === String(user.username).toLowerCase(); })[0];
    if (!r || r[4] !== req.oldHash) return { ok: false, error: 'Current password is wrong.' };
    r[4] = req.newHash; writeAll_('Users', rows);
    return { ok: true };
  });
}

/** Run this once from the editor if you want to authorize Drive and create the sheets before deploying. */
function initialize() {
  ensureSheets_();
  saveAudio_(null, {}, '');
  var p = props_();
  if (!p.getProperty('AUDIO_FOLDER')) { var f = DriveApp.createFolder('PEARL App Audio Recordings'); p.setProperty('AUDIO_FOLDER', f.getId()); }
  Logger.log('PEARL database is ready. Salt: ' + salt_());
}
