/* Side-by-side compare view (VS Code style). Up to 5 files; base + 2nd pane + optional switchable/closable 3rd pane. */
function CompareView(container, opts) {
  'use strict';
  var E = CompareEngine, esc = UI.esc;
  var MAX = 5;
  var st = {
    files: (opts.files || []).slice(0, MAX), mode: opts.mode || null,
    o: Object.assign({ ignoreWhitespace: true, ignoreOrder: true, ignoreArrayOrder: false, ignoreCase: false, fields: '', onlyChanges: false }, UI.store('fv-cmp-opts') || {}),
    p2: 1, p3: 2, third: true, cur: -1, sel: -1
  };
  var data = null; // last computed
  if (!st.mode) st.mode = guessMode(st.files);

  function guessMode(files) {
    var f = files[0]; if (!f) return 'xml';
    var n = (f.name || '').toLowerCase();
    if (/\.json$/.test(n)) return 'json'; if (/\.(xml|isml|svg|xsd|wsdl)$/.test(n)) return 'xml';
    var t = (f.text || '').trim();
    if (t[0] === '{' || t[0] === '[') return 'json'; if (t[0] === '<') return 'xml';
    return 'text';
  }
  function colorOf(fileIdx) { return fileIdx === 0 ? 1 : Math.min(fileIdx + 1, 5); }
  function panes() {
    var n = st.files.length;
    if (n < 2) return [0];
    if (st.p2 >= n || st.p2 === 0) st.p2 = 1;
    var list = [0, st.p2];
    if (n >= 3 && st.third) {
      if (st.p3 == null || st.p3 >= n || st.p3 === 0 || st.p3 === st.p2) { st.p3 = null; for (var i = 1; i < n; i++) if (i !== st.p2) { st.p3 = i; break; } }
      if (st.p3 != null) list.push(st.p3);
    }
    return list;
  }

  function addFiles(list) {
    list.forEach(function (f) {
      if (st.files.length >= MAX) { UI.toast('Up to ' + MAX + ' files can be compared', true); return; }
      st.files.push(f);
    });
    if (st.files.length && !opts.keepMode) st.mode = st.mode || guessMode(st.files);
    if (st.files.length >= 3) st.third = true;
    st.cur = -1; render(); changed();
  }
  function changed() { opts.onChange && opts.onChange(st.files, st.mode); }

  function compute() {
    var ps = panes(), errs = [];
    var o = {
      ignoreKeyOrder: st.o.ignoreOrder, ignoreAttrOrder: st.o.ignoreOrder, ignoreArrayOrder: st.o.ignoreArrayOrder,
      ignoreFields: st.o.fields.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    };
    var norm = ps.map(function (fi) {
      try { return E.normalize(st.mode, st.files[fi].text, o); }
      catch (e) { errs.push(st.files[fi].name + ': ' + e.message); return E.normalizeText(st.files[fi].text); }
    });
    var eq = E.makeEq(st.mode, { ignoreWhitespace: st.o.ignoreWhitespace, ignoreCase: st.o.ignoreCase });
    var rows = ps.length > 1 ? E.align(norm, eq) : norm[0].lines.map(function (_, i) { return { cells: [{ n: i, k: 'eq' }], changed: false }; });
    var hunks = [], inH = false;
    rows.forEach(function (r, i) { if (r.changed && !inH) { hunks.push(i); inH = true; } else if (!r.changed) inH = false; });
    var counts = ps.map(function () { return 0; });
    rows.forEach(function (r) { r.cells.forEach(function (c, j) { if (j && (c.k === 'chg' || c.k === 'ins' || (c.k === 'empty' && r.cells[0].k === 'del'))) counts[j]++; }); });
    data = { ps: ps, norm: norm, rows: rows, hunks: hunks, errs: errs, counts: counts };
  }

  function cellHTML(r, j) {
    var c = r.cells[j], fi = data.ps[j], nm = data.norm[j];
    if (c.n == null) return '<div class="cmp-cell empty"><span class="ln"></span><span class="tx"> </span></div>';
    var text = nm.lines[c.n], cls = '', body;
    if (c.k === 'del') cls = 'k1';
    else if (c.k === 'chg' || c.k === 'ins') cls = 'k' + colorOf(fi);
    if (c.k === 'chg') {
      body = seg(E.inline(data.norm[0].lines[r.cells[0].n], text).b);
    } else if (c.k === 'del') {
      var other = null;
      for (var k = 1; k < r.cells.length; k++) if (r.cells[k].k === 'chg') { other = data.norm[k].lines[r.cells[k].n]; break; }
      body = other != null ? seg(E.inline(text, other).a) : esc(text);
    } else body = esc(text);
    return '<div class="cmp-cell ' + cls + '"><span class="ln">' + (c.n + 1) + '</span><span class="tx">' + (body || ' ') + '</span></div>';
  }
  function seg(parts) { return parts.map(function (p) { return p.d && p.t ? '<span class="d">' + esc(p.t) + '</span>' : esc(p.t); }).join(''); }

  function render() {
    var n = st.files.length;
    var top = '<div class="cmp-top">' +
      '<div class="row" style="flex-wrap:wrap;gap:8px">' +
      '<select data-mode>' + [['xml', 'XML'], ['json', 'JSON'], ['text', 'Text']].map(function (m) { return '<option value="' + m[0] + '"' + (st.mode === m[0] ? ' selected' : '') + '>' + m[1] + ' compare</option>'; }).join('') + '</select>' +
      '<div class="cmp-files grow">' + st.files.map(function (f, i) {
        return '<span class="cmp-file" title="' + esc(f.name) + '"><span class="sw" style="background:var(--c' + colorOf(i) + ')"></span>' +
          (i === 0 ? '<span class="base">Base</span>' : '') + '<span class="ellip" data-setbase="' + i + '" style="cursor:' + (i ? 'pointer' : 'default') + '" title="' + (i ? 'Click to make this the base' : '') + '">' + (i + 1) + ' · ' + esc(f.name) + '</span>' +
          '<button class="ghost icon" data-rm="' + i + '" aria-label="Remove">' + ICONS('x') + '</button></span>';
      }).join('') +
      (n < MAX ? (opts.pickers || []).map(function (p, i) { return '<button data-pick="' + i + '">' + ICONS(p.icon || 'plus') + esc(p.label) + '</button>'; }).join('') + '<button data-paste>' + ICONS('clipboard') + 'Paste</button>' : '<span class="small faint">Max ' + MAX + ' files</span>') +
      '</div></div>' +
      '<div class="cmp-opts">' +
      '<label class="chk"><input type="checkbox" data-o="ignoreWhitespace"' + (st.o.ignoreWhitespace ? ' checked' : '') + '> Ignore whitespace</label>' +
      (st.mode !== 'text' ? '<label class="chk"><input type="checkbox" data-o="ignoreOrder"' + (st.o.ignoreOrder ? ' checked' : '') + '> Ignore ' + (st.mode === 'json' ? 'key' : 'attribute') + ' order</label>' : '') +
      (st.mode === 'json' ? '<label class="chk"><input type="checkbox" data-o="ignoreArrayOrder"' + (st.o.ignoreArrayOrder ? ' checked' : '') + '> Ignore array order</label>' : '') +
      '<label class="chk"><input type="checkbox" data-o="ignoreCase"' + (st.o.ignoreCase ? ' checked' : '') + '> Ignore case</label>' +
      '<label class="chk"><input type="checkbox" data-o="onlyChanges"' + (st.o.onlyChanges ? ' checked' : '') + '> Only changes</label>' +
      (st.mode !== 'text' ? '<input type="text" data-fields placeholder="Ignore fields: timestamp, orderId" value="' + esc(st.o.fields) + '" style="width:230px;padding:3px 8px;font-size:12px">' : '') +
      '</div></div>';
    if (n < 2) {
      container.innerHTML = '<div class="cmp">' + top + '<div class="cmp-empty">' + (n ? 'Add one more file to compare.' : 'Add 2 to 5 files to compare.') + '<br><span class="small">Pick files, drop them here, or paste text.</span></div></div>';
      bind(); return;
    }
    compute();
    var cols = 'repeat(' + data.ps.length + ',minmax(0,1fr))';
    var total = data.counts.slice(1).reduce(function (a, b) { return a + b; }, 0);
    var sum = '<div class="cmp-sum">' + data.ps.slice(1).map(function (fi, j) {
      return '<span class="chip" style="cursor:default"><span class="sw" style="width:8px;height:8px;border-radius:2px;background:var(--c' + colorOf(fi) + ')"></span>' + (fi + 1) + ' vs 1: ' + data.counts[j + 1] + ' line' + (data.counts[j + 1] === 1 ? '' : 's') + '</span>';
    }).join('') +
      '<span class="grow"></span>' +
      (data.hunks.length ? '<span class="small muted" data-hunkpos>' + (st.cur >= 0 ? 'Change ' + (st.cur + 1) + ' of ' + data.hunks.length : data.hunks.length + ' change' + (data.hunks.length === 1 ? '' : 's')) + '</span>' +
        '<button class="icon" data-prev title="Previous change (Shift+F7)">' + ICONS('up') + '</button><button class="icon" data-next title="Next change (F7)">' + ICONS('down') + '</button>' : '<span class="small" style="color:var(--ok)">' + ICONS('check') + ' No differences</span>') +
      (n >= 3 && !st.third ? '<button data-third>' + ICONS('plus') + '3rd pane</button>' : '') +
      (opts.saveReport ? '<button data-report>' + ICONS('download') + 'Save report</button>' : '') +
      '</div>';
    var head = '<div class="cmp-head" style="grid-template-columns:' + cols + '">' + data.ps.map(function (fi, j) {
      var sw = '<span class="sw" style="width:10px;height:10px;border-radius:3px;flex:none;background:var(--c' + colorOf(fi) + ')"></span>';
      if (j === 0) return '<div>' + sw + '<span class="ellip grow" title="' + esc(st.files[0].name) + '">1 · ' + esc(st.files[0].name) + '</span><span class="small faint">base</span></div>';
      var others = st.files.map(function (f, i) { return i; }).filter(function (i) { return i !== 0 && (i === fi || data.ps.indexOf(i) < 0); });
      var sel = others.length > 1 ? '<select data-switch="' + j + '" class="grow">' + others.map(function (i) { return '<option value="' + i + '"' + (i === fi ? ' selected' : '') + '>' + (i + 1) + ' · ' + esc(st.files[i].name) + '</option>'; }).join('') + '</select>'
        : '<span class="ellip grow" title="' + esc(st.files[fi].name) + '">' + (fi + 1) + ' · ' + esc(st.files[fi].name) + '</span>';
      return '<div>' + sw + sel + (j === 2 ? '<button class="ghost icon" data-close3 title="Close pane">' + ICONS('x') + '</button>' : '') + '</div>';
    }).join('') + '</div>';
    var body = [], rows = data.rows, CTX = 3;
    var show = rows.map(function () { return !st.o.onlyChanges; });
    if (st.o.onlyChanges) rows.forEach(function (r, i) { if (r.changed) for (var k = Math.max(0, i - CTX); k <= Math.min(rows.length - 1, i + CTX); k++) show[k] = true; });
    var hidden = 0;
    for (var i = 0; i < rows.length; i++) {
      if (!show[i]) { hidden++; continue; }
      if (hidden) { body.push('<div class="cmp-fold" data-unfold>' + hidden + ' unchanged line' + (hidden === 1 ? '' : 's') + ' hidden · show all</div>'); hidden = 0; }
      var r = rows[i];
      body.push('<div class="cmp-row' + (i === st.sel ? ' sel' : '') + '" data-r="' + i + '" style="grid-template-columns:' + cols + '">' + r.cells.map(function (c, j) { return cellHTML(r, j); }).join('') + '</div>');
    }
    if (hidden) body.push('<div class="cmp-fold" data-unfold>' + hidden + ' unchanged line' + (hidden === 1 ? '' : 's') + ' hidden · show all</div>');
    container.innerHTML = '<div class="cmp">' + top.replace(/<\/div>$/, sum + '</div>') +
      (data.errs.length ? '<div class="cmp-err">' + ICONS('alert') + ' ' + data.errs.map(esc).join('<br>') + '<br><span class="small">Showing these as plain text instead.</span></div>' : '') +
      '<div class="cmp-grid">' + head + body.join('') + '</div>' +
      '<div class="cmp-path"><span class="muted">Selected path</span><code data-path>' + (st.sel >= 0 ? esc(pathOf(st.sel)) : '—') + '</code><button class="ghost icon" data-copypath title="Copy path">' + ICONS('copy') + '</button>' +
      '<span class="grow"></span><span class="faint">' + total + ' changed line' + (total === 1 ? '' : 's') + ' · F7 next change</span></div></div>';
    bind();
    if (st.cur >= 0) scrollToHunk();
  }
  function pathOf(ri) {
    var r = data.rows[ri];
    for (var j = 0; j < r.cells.length; j++) if (r.cells[j].n != null) return data.norm[j].paths[r.cells[j].n];
    return '';
  }
  function scrollToHunk() {
    var ri = data.hunks[st.cur];
    var el = container.querySelector('[data-r="' + ri + '"]');
    container.querySelectorAll('.cmp-row.cur').forEach(function (e) { e.classList.remove('cur'); });
    if (el) { el.classList.add('cur'); el.scrollIntoView({ block: 'center' }); }
    st.sel = ri; var p = container.querySelector('[data-path]'); if (p) p.textContent = pathOf(ri);
    var hp = container.querySelector('[data-hunkpos]'); if (hp) hp.textContent = 'Change ' + (st.cur + 1) + ' of ' + data.hunks.length;
  }
  function go(d) {
    if (!data || !data.hunks.length) return;
    st.cur = st.cur < 0 ? (d > 0 ? 0 : data.hunks.length - 1) : (st.cur + d + data.hunks.length) % data.hunks.length;
    scrollToHunk();
  }
  function bind() {
    var q = function (s) { return container.querySelector(s); }, qa = function (s) { return container.querySelectorAll(s); };
    q('[data-mode]').onchange = function () { st.mode = this.value; st.cur = -1; st.sel = -1; render(); changed(); };
    qa('[data-o]').forEach(function (c) { c.onchange = function () { st.o[c.getAttribute('data-o')] = c.checked; UI.store('fv-cmp-opts', st.o); st.cur = -1; render(); }; });
    var fl = q('[data-fields]'); if (fl) fl.onchange = function () { st.o.fields = fl.value; UI.store('fv-cmp-opts', st.o); render(); };
    qa('[data-rm]').forEach(function (b) { b.onclick = function () { st.files.splice(+b.getAttribute('data-rm'), 1); st.cur = -1; st.sel = -1; render(); changed(); }; });
    qa('[data-setbase]').forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-setbase'); if (!i) return; var f = st.files.splice(i, 1)[0]; st.files.unshift(f); st.cur = -1; render(); changed(); }; });
    qa('[data-pick]').forEach(function (b) { b.onclick = async function () { var p = opts.pickers[+b.getAttribute('data-pick')]; var res = await p.pick(MAX - st.files.length); if (res && res.length) addFiles(res); }; });
    var ps = q('[data-paste]'); if (ps) ps.onclick = async function () {
      var v = await UI.ask({ title: 'Paste text to compare', size: 'mid', ok: 'Add', fields: [{ name: 'name', label: 'Name', value: 'Pasted ' + (st.files.length + 1) }, { name: 'text', label: 'Content', type: 'textarea', rows: 14, placeholder: '<order>...</order>  or  { "key": "value" }' }], validate: function (v) { return v.text.trim() ? '' : 'Paste some content first'; } });
      if (v) addFiles([{ name: v.name || 'Pasted', text: v.text }]);
    };
    qa('[data-switch]').forEach(function (s) { s.onchange = function () { var j = +s.getAttribute('data-switch'); if (j === 1) st.p2 = +s.value; else st.p3 = +s.value; st.cur = -1; render(); }; });
    var c3 = q('[data-close3]'); if (c3) c3.onclick = function () { st.third = false; st.cur = -1; render(); };
    var t3 = q('[data-third]'); if (t3) t3.onclick = function () { st.third = true; st.p3 = null; render(); };
    var pv = q('[data-prev]'); if (pv) pv.onclick = function () { go(-1); };
    var nx = q('[data-next]'); if (nx) nx.onclick = function () { go(1); };
    qa('[data-unfold]').forEach(function (u) { u.onclick = function () { st.o.onlyChanges = false; UI.store('fv-cmp-opts', st.o); render(); }; });
    var grid = q('.cmp-grid');
    if (grid) grid.onclick = function (e) {
      var row = e.target.closest('.cmp-row'); if (!row) return;
      container.querySelectorAll('.cmp-row.sel').forEach(function (x) { x.classList.remove('sel'); });
      row.classList.add('sel'); st.sel = +row.getAttribute('data-r');
      q('[data-path]').textContent = pathOf(st.sel) || '—';
    };
    var cp = q('[data-copypath]'); if (cp) cp.onclick = function () { var t = q('[data-path]').textContent; if (t && t !== '—') { navigator.clipboard.writeText(t).then(function () { UI.toast('Path copied'); }, function () { UI.toast('Copy not allowed here', true); }); } };
    var rp = q('[data-report]'); if (rp) rp.onclick = function () { opts.saveReport(reportName(), report()); };
    // drop files onto the view
    container.ondragover = function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) e.preventDefault(); };
    container.ondrop = async function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault();
      var list = []; for (var i = 0; i < e.dataTransfer.files.length; i++) { var f = e.dataTransfer.files[i]; list.push({ name: f.name, text: await f.text() }); }
      addFiles(list);
    };
  }
  function reportName() { return 'Compare report ' + UI.stamp() + '.md'; }
  function report() {
    var lines = ['# Compare report', '', 'Date: ' + UI.fmtDate(Date.now(), true), 'Mode: ' + st.mode.toUpperCase(), '', '## Files', ''];
    st.files.forEach(function (f, i) { lines.push((i + 1) + '. ' + f.name + (i === 0 ? ' (base)' : '')); });
    var o = { ignoreKeyOrder: st.o.ignoreOrder, ignoreAttrOrder: st.o.ignoreOrder, ignoreArrayOrder: st.o.ignoreArrayOrder, ignoreFields: st.o.fields.split(',').map(function (s) { return s.trim(); }).filter(Boolean) };
    var eq = E.makeEq(st.mode, { ignoreWhitespace: st.o.ignoreWhitespace, ignoreCase: st.o.ignoreCase });
    var nb; try { nb = E.normalize(st.mode, st.files[0].text, o); } catch (e) { nb = E.normalizeText(st.files[0].text); }
    for (var i = 1; i < st.files.length; i++) {
      var nf; try { nf = E.normalize(st.mode, st.files[i].text, o); } catch (e) { nf = E.normalizeText(st.files[i].text); }
      var rows = E.align([nb, nf], eq).filter(function (r) { return r.changed; });
      lines.push('', '## ' + (i + 1) + ' · ' + st.files[i].name + ' vs base — ' + rows.length + ' changed line' + (rows.length === 1 ? '' : 's'), '');
      if (!rows.length) { lines.push('No differences.'); continue; }
      lines.push('| Path | Base | ' + st.files[i].name.replace(/\|/g, '/') + ' |', '|---|---|---|');
      rows.slice(0, 500).forEach(function (r) {
        var a = r.cells[0].n != null ? nb.lines[r.cells[0].n].trim() : '—', b = r.cells[1].n != null ? nf.lines[r.cells[1].n].trim() : '—';
        var p = r.cells[0].n != null ? nb.paths[r.cells[0].n] : nf.paths[r.cells[1].n];
        var cell = function (s) { return '`' + s.replace(/\|/g, '\\|').replace(/`/g, "'").slice(0, 200) + '`'; };
        lines.push('| ' + cell(p) + ' | ' + cell(a) + ' | ' + cell(b) + ' |');
      });
      if (rows.length > 500) lines.push('', '…and ' + (rows.length - 500) + ' more.');
    }
    return lines.join('\n') + '\n';
  }
  function onKey(e) {
    if (!container.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'F7') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
  }
  document.addEventListener('keydown', onKey);
  render();
  return { addFiles: addFiles, getFiles: function () { return st.files; }, getMode: function () { return st.mode; }, render: render };
}
