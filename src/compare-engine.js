/* Compare engine: line diff (Myers), XML/JSON normalisation with paths, multi-file alignment. No dependencies. */
var CompareEngine = (function () {
  'use strict';

  function myers(A, B, eq) {
    var N = A.length, M = B.length, max = N + M, i;
    var ops = [];
    if (!N) { for (i = 0; i < M; i++) ops.push({ t: 'ins', b: i }); return ops; }
    if (!M) { for (i = 0; i < N; i++) ops.push({ t: 'del', a: i }); return ops; }
    var LIMIT = 6000; // edit-distance cap to protect the browser on huge, totally different files
    var off = max + 1, v = new Int32Array(2 * max + 3), trace = [], D = -1, d, k, x, y;
    for (d = 0; d <= max && d <= LIMIT; d++) {
      for (k = -d; k <= d; k += 2) {
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
        else x = v[off + k - 1] + 1;
        y = x - k;
        while (x < N && y < M && eq(A[x], B[y])) { x++; y++; }
        v[off + k] = x;
        if (x >= N && y >= M) { D = d; break; }
      }
      trace.push(v.slice(off - d, off + d + 1));
      if (D >= 0) break;
    }
    if (D < 0) { // too different: everything removed, everything added
      for (i = 0; i < N; i++) ops.push({ t: 'del', a: i });
      for (i = 0; i < M; i++) ops.push({ t: 'ins', b: i });
      return ops;
    }
    x = N; y = M;
    var rev = [];
    for (d = D; d > 0; d--) {
      var pv = trace[d - 1], pd = d - 1;
      var get = function (kk) { return pv[kk + pd]; };
      k = x - y;
      var down = (k === -d || (k !== d && get(k - 1) < get(k + 1)));
      var pk = down ? k + 1 : k - 1;
      var px = get(pk), py = px - pk;
      var sx = down ? px : px + 1, sy = down ? py + 1 : py;
      while (x > sx && y > sy) { rev.push({ t: 'eq', a: x - 1, b: y - 1 }); x--; y--; }
      if (down) { rev.push({ t: 'ins', b: py }); y = py; } else { rev.push({ t: 'del', a: px }); x = px; }
    }
    while (x > 0 && y > 0) { rev.push({ t: 'eq', a: x - 1, b: y - 1 }); x--; y--; }
    return rev.reverse();
  }

  function diffLines(a, b, eq) {
    eq = eq || function (p, q) { return p === q; };
    var s = 0, ea = a.length, eb = b.length, ops = [], i;
    while (s < ea && s < eb && eq(a[s], b[s])) s++;
    while (ea > s && eb > s && eq(a[ea - 1], b[eb - 1])) { ea--; eb--; }
    for (i = 0; i < s; i++) ops.push({ t: 'eq', a: i, b: i });
    var mid = myers(a.slice(s, ea), b.slice(s, eb), eq);
    for (i = 0; i < mid.length; i++) {
      var o = mid[i];
      ops.push(o.t === 'eq' ? { t: 'eq', a: o.a + s, b: o.b + s } : o.t === 'del' ? { t: 'del', a: o.a + s } : { t: 'ins', b: o.b + s });
    }
    for (i = 0; i < a.length - ea; i++) ops.push({ t: 'eq', a: ea + i, b: eb + i });
    return ops;
  }

  /* ---------- normalisers: return {lines:[], paths:[]} ---------- */
  function isIdent(k) { return /^[A-Za-z_$][\w$]*$/.test(k); }

  function normalizeJSON(text, opt) {
    opt = opt || {};
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Not valid JSON: ' + e.message); }
    var ignore = opt.ignoreFields || [];
    var lines = [], paths = [];
    function push(l, p) { lines.push(l); paths.push(p); }
    function canon(v) {
      if (Array.isArray(v)) {
        var arr = v.map(canon);
        if (opt.ignoreArrayOrder) arr.sort(function (p, q) { var s1 = JSON.stringify(p), s2 = JSON.stringify(q); return s1 < s2 ? -1 : s1 > s2 ? 1 : 0; });
        return arr;
      }
      if (v && typeof v === 'object') {
        var keys = Object.keys(v).filter(function (k) { return ignore.indexOf(k) < 0; });
        if (opt.ignoreKeyOrder !== false) keys.sort();
        var o = {}; keys.forEach(function (k) { o[k] = canon(v[k]); });
        return o;
      }
      return v;
    }
    function emit(v, path, ind, key, last) {
      var pre = new Array(ind + 1).join('  ') + (key !== null ? JSON.stringify(key) + ': ' : '');
      var c = last ? '' : ',';
      var closeInd = new Array(ind + 1).join('  ');
      if (Array.isArray(v)) {
        if (!v.length) return push(pre + '[]' + c, path);
        push(pre + '[', path);
        v.forEach(function (it, i) { emit(it, path + '[' + i + ']', ind + 1, null, i === v.length - 1); });
        push(closeInd + ']' + c, path);
      } else if (v && typeof v === 'object') {
        var ks = Object.keys(v);
        if (!ks.length) return push(pre + '{}' + c, path);
        push(pre + '{', path);
        ks.forEach(function (k, i) { emit(v[k], path + (isIdent(k) ? '.' + k : '["' + k + '"]'), ind + 1, k, i === ks.length - 1); });
        push(closeInd + '}' + c, path);
      } else push(pre + JSON.stringify(v) + c, path);
    }
    emit(canon(data), '$', 0, null, true);
    return { lines: lines, paths: paths };
  }

  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function escText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function normalizeXML(text, opt) {
    opt = opt || {};
    if (typeof DOMParser === 'undefined') throw new Error('XML compare needs a browser');
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var err = doc.getElementsByTagName('parsererror')[0];
    if (err) throw new Error('Not valid XML: ' + (err.textContent || '').split('\n').slice(0, 2).join(' ').trim());
    var ignore = opt.ignoreFields || [];
    var lines = [], paths = [];
    function push(l, p) { lines.push(l); paths.push(p); }
    function ignored(name) { return ignore.indexOf(name) >= 0 || ignore.indexOf('@' + name) >= 0; }
    function attrs(el) {
      var list = [];
      for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (!ignored(a.name)) list.push(a); }
      if (opt.ignoreAttrOrder !== false) list.sort(function (p, q) { return p.name < q.name ? -1 : p.name > q.name ? 1 : 0; });
      return list.map(function (a) { return ' ' + a.name + '="' + escAttr(a.value) + '"'; }).join('');
    }
    function emit(el, path, ind) {
      var pad = new Array(ind + 1).join('  ');
      var kids = [], i, n;
      for (i = 0; i < el.childNodes.length; i++) {
        n = el.childNodes[i];
        if (n.nodeType === 1) { if (!ignored(n.nodeName)) kids.push(n); }
        else if (n.nodeType === 3 || n.nodeType === 4) { var t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) kids.push({ text: t, cdata: n.nodeType === 4 }); }
        else if (n.nodeType === 8) { kids.push({ comment: n.nodeValue.trim() }); }
      }
      var open = '<' + el.nodeName + attrs(el);
      if (!kids.length) return push(pad + open + '/>', path);
      if (kids.length === 1 && kids[0].text !== undefined) {
        var tx = kids[0].cdata ? '<![CDATA[' + kids[0].text + ']]>' : escText(kids[0].text);
        return push(pad + open + '>' + tx + '</' + el.nodeName + '>', path);
      }
      push(pad + open + '>', path);
      var counts = {}, seen = {};
      kids.forEach(function (k) { if (k.nodeType === 1) counts[k.nodeName] = (counts[k.nodeName] || 0) + 1; });
      kids.forEach(function (k) {
        if (k.nodeType === 1) {
          seen[k.nodeName] = (seen[k.nodeName] || 0) + 1;
          emit(k, path + '/' + k.nodeName + (counts[k.nodeName] > 1 ? '[' + seen[k.nodeName] + ']' : ''), ind + 1);
        } else if (k.comment !== undefined) push(pad + '  <!-- ' + k.comment + ' -->', path);
        else push(pad + '  ' + (k.cdata ? '<![CDATA[' + k.text + ']]>' : escText(k.text)), path);
      });
      push(pad + '</' + el.nodeName + '>', path);
    }
    emit(doc.documentElement, '/' + doc.documentElement.nodeName, 0);
    return { lines: lines, paths: paths };
  }

  function normalizeText(text) {
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return { lines: lines, paths: lines.map(function (_, i) { return 'line ' + (i + 1); }) };
  }

  function normalize(mode, text, opt) {
    if (mode === 'json') return normalizeJSON(text, opt);
    if (mode === 'xml') return normalizeXML(text, opt);
    return normalizeText(text);
  }

  function makeEq(mode, opt) {
    opt = opt || {};
    var ws = opt.ignoreWhitespace !== false;
    return function (p, q) {
      if (p === q) return true;
      if (mode === 'json') { p = p.replace(/,\s*$/, ''); q = q.replace(/,\s*$/, ''); }
      if (ws) { p = p.replace(/\s+/g, ' ').trim(); q = q.replace(/\s+/g, ' ').trim(); }
      if (opt.ignoreCase) { p = p.toLowerCase(); q = q.toLowerCase(); }
      return p === q;
    };
  }

  /* Map one other file onto the base: map[i] = {k:'eq'|'chg', i:idx} | null, slots[i] = [idx...] inserted before base line i */
  function mapOnto(base, other, eq) {
    var ops = diffLines(base, other, eq);
    var map = new Array(base.length), slots = [], i;
    for (i = 0; i <= base.length; i++) slots.push([]);
    var dels = [], ins = [], pos = 0;
    function flush() {
      if (!dels.length && !ins.length) return;
      var n = Math.min(dels.length, ins.length), j;
      for (j = 0; j < n; j++) map[dels[j]] = { k: 'chg', i: ins[j] };
      for (j = n; j < dels.length; j++) map[dels[j]] = null;
      for (j = n; j < ins.length; j++) slots[pos].push(ins[j]);
      dels = []; ins = [];
    }
    ops.forEach(function (o) {
      if (o.t === 'eq') { flush(); map[o.a] = { k: 'eq', i: o.b }; pos = o.a + 1; }
      else if (o.t === 'del') { dels.push(o.a); pos = o.a + 1; }
      else ins.push(o.b);
    });
    flush();
    return { map: map, slots: slots };
  }

  /* files: [{lines, paths}] (first = base). Returns rows: [{cells:[{n:lineIdx|null, k:'eq'|'chg'|'ins'|'del'|'empty'}], changed:bool}] */
  function align(files, eq) {
    var base = files[0].lines, others = files.slice(1).map(function (f) { return mapOnto(base, f.lines, eq); });
    var rows = [], i, r;
    for (i = 0; i <= base.length; i++) {
      var gap = 0;
      others.forEach(function (o) { gap = Math.max(gap, o.slots[i].length); });
      for (r = 0; r < gap; r++) {
        var cells = [{ n: null, k: 'empty' }];
        others.forEach(function (o) { var v = o.slots[i][r]; cells.push(v === undefined ? { n: null, k: 'empty' } : { n: v, k: 'ins' }); });
        rows.push({ cells: cells, changed: true });
      }
      if (i < base.length) {
        var changed = false, cs = [null];
        others.forEach(function (o) {
          var m = o.map[i];
          if (!m) { changed = true; cs.push({ n: null, k: 'empty' }); }
          else { if (m.k !== 'eq') changed = true; cs.push({ n: m.i, k: m.k }); }
        });
        cs[0] = { n: i, k: changed ? 'del' : 'eq' };
        rows.push({ cells: cs, changed: changed });
      }
    }
    return rows;
  }

  /* character-level difference inside a changed line: [{t, d:bool}] */
  function inline(a, b) {
    var s = 0, ea = a.length, eb = b.length;
    while (s < ea && s < eb && a[s] === b[s]) s++;
    while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
    return {
      a: [{ t: a.slice(0, s), d: false }, { t: a.slice(s, ea), d: true }, { t: a.slice(ea), d: false }],
      b: [{ t: b.slice(0, s), d: false }, { t: b.slice(s, eb), d: true }, { t: b.slice(eb), d: false }]
    };
  }

  return { diffLines: diffLines, normalize: normalize, normalizeJSON: normalizeJSON, normalizeXML: normalizeXML, normalizeText: normalizeText, makeEq: makeEq, align: align, inline: inline };
})();
if (typeof module !== 'undefined') module.exports = CompareEngine;
