/* Compare — standalone app with its own dashboard. */
(function () {
  'use strict';
  var esc = UI.esc, app = document.getElementById('app');
  var RECENT = 'fv-compare-recent';
  UI.Theme.init();

  function recent() { return UI.store(RECENT) || []; }
  function remember(files, mode) {
    if (files.length < 2) return;
    var size = files.reduce(function (a, f) { return a + f.text.length; }, 0);
    var r = recent().filter(function (c) { return c.names.join('|') !== files.map(function (f) { return f.name; }).join('|'); });
    r.unshift({ mode: mode, names: files.map(function (f) { return f.name; }), files: size < 1500000 ? files.map(function (f) { return { name: f.name, text: f.text }; }) : null, t: Date.now() });
    try { UI.store(RECENT, r.slice(0, 8)); } catch (e) { }
  }

  function dashboard() {
    var r = recent();
    app.innerHTML = '<header class="top"><div class="brand">' + ICONS('compare', 'ic-lg') + '<span>Compare</span></div><span class="grow"></span>' + UI.themeSwitch() + '</header>' +
      '<main id="main" style="overflow:auto;flex:1"><div class="wrap" style="max-width:820px">' +
      '<div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:6px">' +
      '<div class="tile" data-mode="xml">' + ICONS('fileCode') + '<b>XML compare</b><span>Ignores attribute order and formatting</span></div>' +
      '<div class="tile" data-mode="json">' + ICONS('braces') + '<b>JSON compare</b><span>Ignores key order and formatting</span></div>' +
      '<div class="tile" data-mode="text">' + ICONS('compare') + '<b>Text compare</b><span>Logs, notes, anything</span></div></div>' +
      '<div class="dropzone" id="dz" style="margin-top:16px">' + ICONS('upload', 'ic-lg') + '<div style="margin-top:6px">Drop 2–5 files here, or <b>click to pick files</b></div><div class="small faint">The type is detected from the first file. You can also paste text inside the compare screen.</div></div>' +
      '<div class="sec">' + ICONS('history') + ' Recent compares</div>' +
      (r.length ? '<div class="list">' + r.map(function (c, i) {
        return '<div class="sub" data-recent="' + i + '">' + ICONS(c.mode === 'json' ? 'braces' : c.mode === 'xml' ? 'fileCode' : 'compare') + '<span class="grow ellip">' + esc(c.names.join('  vs  ')) + '</span><span class="small faint">' + c.names.length + ' files · ' + UI.ago(c.t) + '</span>' +
          (c.files ? '' : '<span class="small faint">(too large to keep)</span>') + '<button class="ghost icon" data-del="' + i + '" title="Remove">' + ICONS('x') + '</button></div>';
      }).join('') + '</div>' : '<div class="card empty">Compares you run show up here, kept only in this browser.</div>') +
      '<p class="safe small muted" style="margin-top:22px;text-align:center">' + ICONS('lock') + ' Works offline. Files are read in this browser and never uploaded.</p>' +
      '</div></main>';
    UI.Theme.apply();
    app.querySelectorAll('[data-mode]').forEach(function (t) { t.onclick = function () { open(t.getAttribute('data-mode'), []); }; });
    var dz = app.querySelector('#dz');
    dz.onclick = function () { pick(5).then(function (fs) { if (fs && fs.length) open(null, fs); }); };
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = function () { dz.classList.remove('over'); };
    dz.ondrop = async function (e) { e.preventDefault(); dz.classList.remove('over'); var fs = await readList(e.dataTransfer.files, 5); if (fs.length) open(null, fs); };
    app.querySelectorAll('[data-recent]').forEach(function (row) {
      row.onclick = function (e) {
        if (e.target.closest('[data-del]')) return;
        var c = r[+row.getAttribute('data-recent')];
        if (c.files) open(c.mode, c.files.map(function (f) { return { name: f.name, text: f.text }; }), true); else UI.toast('Those files were too large to keep. Add them again.', true);
      };
    });
    app.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var list = recent(); list.splice(+b.getAttribute('data-del'), 1); UI.store(RECENT, list); dashboard(); }; });
  }
  async function readList(list, max) { var out = []; for (var i = 0; i < list.length && out.length < max; i++) out.push({ name: list[i].name, text: await list[i].text() }); return out; }
  function pick(max) {
    return new Promise(function (res) {
      var inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
      inp.onchange = async function () { res(await readList(inp.files, max)); };
      inp.click();
    });
  }
  function open(mode, files, keepMode) {
    app.innerHTML = '<header class="top"><button class="ghost" id="back">' + ICONS('left') + 'Dashboard</button><div class="brand">' + ICONS('compare', 'ic-lg') + '<span>Compare</span></div><span class="grow"></span>' + UI.themeSwitch() + '</header>' +
      '<div style="flex:1;min-height:0;background:var(--panel)" id="cv"></div>';
    UI.Theme.apply();
    app.querySelector('#back').onclick = dashboard;
    var view = CompareView(app.querySelector('#cv'), {
      files: files, mode: mode, keepMode: keepMode,
      pickers: [{ label: 'Add file', icon: 'plus', pick: pick }],
      saveReport: function (name, md) { UI.download(name, md, 'text/markdown'); UI.toast('Report downloaded'); },
      onChange: function (fs, md) { remember(fs, md); }
    });
    if (files.length >= 2) remember(view.getFiles(), view.getMode());
  }
  dashboard();
})();
