/* PEARL App — Smart Checker (no outside AI; runs offline on the device)
 * 1) Explains WHY a quiz answer is correct (vocabulary definition or the supporting sentence in the passage)
 * 2) Suggests a rubric score for written answers, with reasons for the teacher and tips for the learner
 * 3) Suggests points for test short answers / essays using the teacher's accepted answers or keywords
 * Developed by Joy P. Bacala, Samal Senior High School */
(function (G) {
  'use strict';
  var STOP = ('a an the and or but if then than so to of in on at by for with from into onto about as is are was were be been being am do does did done have has had having ' +
    'it its it\'s this that these those there here they them their theirs he she him her his hers we us our you your yours i me my mine not no yes can could will would ' +
    'should shall may might must also very more most less least much many some any each every all both either neither one two which what who whom whose when where why how ' +
    'just only even still such own same other another because while during before after over under again further once up down out off too s t don\'t doesn\'t isn\'t aren\'t ' +
    'according text article passage author following statement best describes likely main idea people thing things way make makes made get gets got').split(/\s+/);
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  function norm(s) { return String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"'); }
  function stem(w) {
    w = w.replace(/'s$/, '');
    if (w.length > 5) w = w.replace(/(ingly|edly|ment|ness|ions|ion|ings|ing|ies|ied|ers|er|est|ly|ed|es|s)$/, '');
    else if (w.length > 3) w = w.replace(/(es|s|ed)$/, '');
    return w;
  }
  function words(s) { return (norm(s).match(/[a-z0-9']+/g) || []); }
  function keys(s) { var out = []; words(s).forEach(function (w) { if (w.length > 2 && !STOPSET[w]) out.push(stem(w)); }); return out; }
  function uniq(a) { var m = {}; return a.filter(function (x) { if (m[x]) return false; m[x] = 1; return true; }); }
  function sentences(text) { return String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) || []; }

  /* ---------- 1. Why is this the answer? ---------- */
  function vocabOf(L, word) {
    var w = stem(norm(word).trim());
    return (L.vocab || []).find(function (v) { return stem(norm(v.word).trim()) === w || norm(v.word).trim() === norm(word).trim(); });
  }
  function explain(L, qi) {
    var q = (L.questions || [])[qi]; if (!q) return null;
    var k = 'ABCD'.indexOf(q.ans), opt = (q.opts || [])[k] || '';
    var res = { answer: q.ans + ') ' + opt, why: '', clue: '', source: 'auto' };
    if (q.why) { res.why = q.why; res.source = 'teacher'; return res; }
    // vocabulary item: "What does X mean?" / "the meaning of X" / "Which word means ..."
    var m = norm(q.q).match(/(?:what does|meaning of|what is meant by|the word|the term|the phrase)\s+["'“”]?([a-z][a-z' -]{1,30}?)["'“”]?\s+(?:mean|refer|most nearly|in the|as used|\?)/) || norm(q.q).match(/["“]([a-z][a-z' -]{1,30})["”]/);
    var term = m ? m[1].replace(/^(the )?(word|term|phrase|expression)\s+/, '').trim() : '';
    var v = term && vocabOf(L, term);
    if (!v && term && /mean|refer|meaning/.test(norm(q.q))) {
      var s0 = findSentence(L, keys(term).concat(keys(term)), []);
      res.why = 'In the passage, “' + term + '” means: ' + opt.replace(/\.$/, '') + '.' + (s0 ? ' See how it is used: “' + s0 + '”' : '');
      res.clue = s0; res.kind = 'vocabulary'; return res;
    }
    if (!v) { // "Which word means ...?" -> the correct option is the vocab word
      v = vocabOf(L, opt);
      if (v && !/word|term/.test(norm(q.q))) v = null;
    }
    if (v) {
      var df = String(v.def || '').replace(/\.$/, ''); if (/^[A-Z][a-z]/.test(df)) df = df.charAt(0).toLowerCase() + df.slice(1);
      res.why = '“' + v.word + '” means ' + df + '.' + (v.ex ? ' Example: “' + v.ex + '”' : '');
      res.clue = findSentence(L, keys(v.word), []);
      res.kind = 'vocabulary';
      return res;
    }
    var optKeys = uniq(keys(opt)), qKeys = uniq(keys(q.q));
    var others = [];
    (q.opts || []).forEach(function (o, i) { if (i !== k) others = others.concat(keys(o)); });
    var best = findSentence(L, optKeys.concat(optKeys).concat(qKeys), uniq(others));
    if (best) {
      res.clue = best;
      res.why = 'The passage supports this answer: “' + best.trim() + '”';
      res.kind = /infer|suggest|imply|most likely|probably|best|why|would|could|should|if /.test(norm(q.q)) ? 'inference' : 'literal';
      if (res.kind === 'inference') res.why = 'Think about this part of the passage: “' + best.trim() + '” It points to answer ' + q.ans + '.';
    } else {
      res.why = 'Answer ' + q.ans + ' fits best with the main message of the passage. Re-read the passage and compare each choice.';
      res.kind = 'knowledge';
    }
    return res;
  }
  function findSentence(L, want, avoid) {
    if (!want.length) return '';
    var counts = {}; want.forEach(function (w) { counts[w] = (counts[w] || 0) + 1; });
    var av = {}; avoid.forEach(function (w) { av[w] = 1; });
    var best = '', bestScore = 0;
    (L.passage || []).forEach(function (p) {
      sentences(p).forEach(function (s) {
        var ks = uniq(keys(s)), sc = 0;
        ks.forEach(function (w) { if (counts[w]) sc += counts[w]; if (av[w] && !counts[w]) sc -= 0.3; });
        if (s.length > 260) sc -= 1;
        if (sc > bestScore) { bestScore = sc; best = s.trim(); }
      });
    });
    return bestScore >= 2 ? best : '';
  }

  /* ---------- 2. Writing check ---------- */
  function ngrams(ws, n) { var out = {}; for (var i = 0; i + n <= ws.length; i++) out[ws.slice(i, i + n).join(' ')] = 1; return out; }
  function vocabUsedIn(L, text) {
    var t = ' ' + norm(text) + ' ', ks = {}; keys(text).forEach(function (k) { ks[k] = 1; });
    return (L.vocab || []).filter(function (v) {
      var w = norm(v.word).trim(); if (!w) return false;
      if (w.indexOf(' ') > 0) return t.indexOf(w) >= 0;
      return ks[stem(w)] || new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t);
    }).map(function (v) { return v.word; });
  }
  function writing(L, answers, minWords) {
    answers = answers || []; minWords = Number(minWords) || 8;
    var passWords = words((L.passage || []).join(' ')), pass8 = ngrams(passWords, 8);
    var passKeys = {}; keys((L.passage || []).join(' ')).forEach(function (k) { passKeys[k] = 1; });
    var items = [], tips = [], reasons = [], flags = [];
    var allText = answers.join(' ');
    (L.discussion || []).forEach(function (q, i) {
      var a = String(answers[i] || '').trim(), ws = words(a), n = ws.length;
      var it = { n: n, short: n < minWords, issues: [] };
      // relevance: shares key ideas with the question or the passage
      var qk = uniq(keys(q)), ak = uniq(keys(a));
      var onQ = ak.filter(function (w) { return qk.indexOf(w) >= 0; }).length;
      var onP = ak.filter(function (w) { return passKeys[w]; }).length;
      it.relevant = n === 0 ? false : (onQ >= 1 || onP >= 2);
      // copied from passage (8+ words in a row)
      var g = ngrams(ws, 8), copied = 0; Object.keys(g).forEach(function (k) { if (pass8[k]) copied++; });
      it.copied = copied >= 2 || (copied >= 1 && n < 20);
      // mechanics
      if (n) {
        if (/^[a-z]/.test(a)) it.issues.push('start with a capital letter');
        if (!/[.!?]["”’)]?$/.test(a)) it.issues.push('end with a period');
        if (/(^|\s)i(\s|'|’)/.test(a)) it.issues.push('write “I” as a capital letter');
        if (a.length > 20 && a === a.toUpperCase()) it.issues.push('avoid writing in ALL CAPITALS');
        if (/(.)\1{3,}/.test(a)) it.issues.push('check spelling (repeated letters)');
        if (/\b(\w+)\s+\1\b/i.test(a)) it.issues.push('remove the repeated word');
        if (n >= 35 && !/[.!?].+[.!?]/.test(a)) it.issues.push('break long answers into sentences');
      }
      // same answer pasted for different questions
      for (var j = 0; j < i; j++) if (a && norm(answers[j]).trim() === norm(a)) { it.duplicate = true; }
      items.push(it);
      var label = 'Answer ' + (i + 1);
      if (!n) { reasons.push(label + ' is blank.'); tips.push(label + ': please write your answer.'); }
      else {
        if (it.short) { reasons.push(label + ' has ' + n + ' words (minimum ' + minWords + ').'); tips.push(label + ': add ' + (minWords - n) + ' more word' + (minWords - n > 1 ? 's' : '') + ' — explain your idea or give an example.'); }
        if (!it.relevant) { reasons.push(label + ' may not answer the question (few words related to the question or passage).'); tips.push(label + ': make sure you answer the question directly.'); }
        if (it.copied) { reasons.push(label + ' copies long parts of the passage word for word.'); tips.push(label + ': use your own words instead of copying the passage.'); flags.push('copied'); }
        if (it.duplicate) { reasons.push(label + ' is the same as an earlier answer.'); tips.push(label + ': each question needs its own answer.'); flags.push('repeated'); }
        if (it.issues.length) tips.push(label + ': ' + it.issues.join(', ') + '.');
      }
    });
    var used = vocabUsedIn(L, allText), nv = (L.vocab || []).length;
    var nq = Math.max(1, (L.discussion || []).length);
    var full = items.filter(function (x) { return x.n >= minWords && x.relevant && !x.copied && !x.duplicate; }).length;
    var blank = items.filter(function (x) { return !x.n; }).length;
    var content = full === nq ? 4 : full >= nq - 1 && !blank ? 3 : (nq - blank) >= Math.ceil(nq / 2) ? 2 : 1;
    var vr = nv ? used.length / nv : 0;
    var vocab = vr >= 0.6 ? 4 : vr >= 0.4 ? 3 : used.length ? 2 : 1;
    var nIssues = P_sum(items.map(function (x) { return x.issues.length; }));
    var mech = blank === nq ? 1 : nIssues === 0 ? 4 : nIssues <= 2 ? 3 : nIssues <= 4 ? 2 : 1;
    if (!used.length) tips.push('Try to use today’s words: ' + (L.vocab || []).slice(0, 5).map(function (v) { return v.word; }).join(', ') + '.');
    else if (used.length < nv) tips.push('Great! You used ' + used.length + ' of ' + nv + ' words. Can you also use: ' + (L.vocab || []).filter(function (v) { return used.indexOf(v.word) < 0; }).slice(0, 3).map(function (v) { return v.word; }).join(', ') + '?');
    else tips.push('Excellent! You used all ' + nv + ' vocabulary words. 🪄');
    reasons.unshift('Content: ' + full + ' of ' + nq + ' answers are complete, on-topic and in the learner’s own words.');
    reasons.splice(1, 0, 'Vocabulary: used ' + used.length + ' of ' + nv + ' words' + (used.length ? ' (' + used.join(', ') + ')' : '') + '.');
    reasons.splice(2, 0, 'Mechanics: ' + (nIssues ? nIssues + ' capitalization/punctuation/spelling issue(s) found.' : 'no common errors found.'));
    var total = content + vocab + mech;
    if (blank) flags.push('blank'); if (items.some(function (x) { return x.short; })) flags.push('short');
    return { scores: { content: content, vocab: vocab, mechanics: mech }, total: total, max: 12, pct: Math.round(total / 12 * 100), used: used, reasons: reasons, tips: tips, flags: uniq(flags), items: items, version: 1 };
  }
  function P_sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }

  /* ---------- 3. Test items: short answer & essay ---------- */
  function testItem(it, answer) {
    var a = String(answer || '').trim(), pts = Number(it.pts) || 1;
    if (!a) return { pts: 0, reason: 'No answer.' };
    if (it.type === 'short' && it.accept) {
      var acc = String(it.accept).split(/[,;\n]/).map(function (x) { return norm(x).trim(); }).filter(Boolean);
      var na = norm(a).replace(/[.!?]$/, '').trim();
      if (acc.indexOf(na) >= 0) return { pts: pts, reason: 'Matches an accepted answer.', exact: true };
    }
    var kw = String(it.keywords || '').split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
    var n = words(a).length;
    if (!kw.length) {
      if (it.type === 'essay') { var lvl = n >= 60 ? 0.6 : n >= 30 ? 0.4 : 0.2; return { pts: Math.round(pts * lvl * 2) / 2, reason: n + ' words. No keywords set, so this is only a length-based guess — please read and score it.', weak: true }; }
      return { pts: null, reason: 'Set accepted answers or keywords for this item to get a suggestion.' };
    }
    var ak = {}; keys(a).forEach(function (k) { ak[k] = 1; });
    var hit = kw.filter(function (k) { var ks = keys(k); return ks.length && ks.every(function (x) { return ak[x]; }); });
    var ratio = hit.length / kw.length;
    if (it.type === 'essay' && n < 20) ratio = Math.min(ratio, 0.5);
    var p = Math.round(pts * ratio * 2) / 2;
    return { pts: p, reason: 'Found ' + hit.length + ' of ' + kw.length + ' expected ideas' + (hit.length ? ' (' + hit.join(', ') + ')' : '') + (kw.length > hit.length ? '; missing: ' + kw.filter(function (k) { return hit.indexOf(k) < 0; }).join(', ') : '') + '. ' + n + ' words.' };
  }

  /* ---------- 4. similarity between two learners' answers ---------- */
  function similarity(a, b) {
    var A = ngrams(words(a), 3), B = ngrams(words(b), 3), ka = Object.keys(A), kb = Object.keys(B);
    if (ka.length < 4 || kb.length < 4) return 0;
    var inter = ka.filter(function (k) { return B[k]; }).length;
    return inter / Math.min(ka.length, kb.length);
  }

  var Check = { explain: explain, writing: writing, testItem: testItem, similarity: similarity, vocabUsedIn: vocabUsedIn, keys: keys };
  if (G.P) G.P.Check = Check; G.PEARL_CHECK = Check;
  if (typeof module !== 'undefined') module.exports = Check;
})(typeof window !== 'undefined' ? window : globalThis);
