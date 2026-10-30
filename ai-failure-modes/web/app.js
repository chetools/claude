/* App logic: case selector and inputs, Pyodide (Python in WebAssembly) running cases.py,
   result cards and sweep chart, tabs, copy buttons, breakdown plots, and the Pyodide-vs-CPython self-test. */
(function () {
  'use strict';
  var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  var META = window.META, REF = window.REF;
  var byId = {}; META.forEach(function (c) { byId[c.id] = c; });
  var $ = function (id) { return document.getElementById(id); };
  var py = null, pyEval = null, current = META[0].id, values = {}, pending = null;

  function fatal(msg) { var f = $('fatal'); f.hidden = false; f.textContent = msg; }
  window.addEventListener('error', function (e) { fatal('Error: ' + e.message); });

  function pill(state, text) { var p = $('py-pill'); p.className = 'pill ' + state; p.textContent = text; }

  function fmt(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'n/a';
    var a = Math.abs(v);
    if (a >= 1000) return v.toFixed(0);
    if (a >= 100) return v.toFixed(1);
    if (a >= 10) return v.toFixed(2);
    return v.toPrecision(3);
  }

  /* ------------------------------------------------------------ tabs */
  var plotsDrawn = false;
  function showTab(name) {
    var b = document.querySelector('.tabs button[data-tab="' + name + '"]');
    if (b) b.click();
  }

  /* In-page links: #case-<id> opens that problem on the App tab; other #ids switch to the tab holding the target. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.closest('.toc')) return;
    var id = a.getAttribute('href').slice(1), m = /^case-(.+)$/.exec(id);
    if (m && byId[m[1]]) {
      e.preventDefault();
      $('in-case').value = m[1]; current = m[1]; buildInputs(); update();
      showTab('app'); window.scrollTo(0, 0);
      return;
    }
    var t = document.getElementById(id), panel = t && t.closest('.tpanel');
    if (!panel) return;
    e.preventDefault();
    showTab(panel.id.replace('panel-', ''));
    var d = t.closest('details'); if (d) d.open = true;
    setTimeout(function () { t.scrollIntoView(); }, 0);
  });

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      document.querySelectorAll('.tpanel').forEach(function (p) { p.hidden = p.id !== 'panel-' + b.dataset.tab; });
      if (b.dataset.tab === 'code' && !plotsDrawn) { drawBreakdownPlots(); plotsDrawn = true; }
      if (b.dataset.tab === 'app') Plotly.Plots.resize('chart');
    });
  });

  /* ------------------------------------------------------------ inputs */
  function defaultsOf(id) { var d = {}; byId[id].inputs.forEach(function (i) { d[i.name] = i.value; }); return d; }

  function buildInputs() {
    var c = byId[current], box = $('inputs');
    box.innerHTML = '';
    c.inputs.forEach(function (inp) {
      var f = document.createElement('div'); f.className = 'field';
      var id = 'in-' + inp.name;
      f.innerHTML = '<label for="' + id + '"></label><input id="' + id + '" type="number">';
      f.querySelector('label').textContent = inp.label;
      var el = f.querySelector('input');
      el.step = inp.step; el.value = values[current][inp.name];
      el.addEventListener('input', function () {
        var v = parseFloat(el.value);
        if (!isFinite(v)) return;
        values[current][inp.name] = v;
        update();
      });
      box.appendChild(f);
    });
  }

  function isDefault() {
    var d = defaultsOf(current), v = values[current];
    return Object.keys(d).every(function (k) { return d[k] === v[k]; });
  }

  /* ------------------------------------------------------------ results */
  function show(res, src) {
    var c = byId[current], r = res.run;
    $('case-title').textContent = META.indexOf(c) + 1 + '. ' + c.title;
    $('res-src').textContent = src;
    $('res-src').className = 'pill' + (src.indexOf('live') === 0 ? ' ready' : '');
    var ms = c.measured;
    $('m-measured').textContent = 'Measured: ' + ms.correct + '/' + ms.graded + ' Opus 5.5 runs correct' +
      (ms.side_runs ? ', side error in ' + ms.side_runs : '');
    $('m-naive').textContent = fmt(r.naive) + ' ' + r.unit;
    $('m-correct').textContent = fmt(r.correct) + ' ' + r.unit;
    $('m-naive-sub').textContent = c.naive; $('m-naive-sub').title = c.naive;
    $('m-correct-sub').textContent = c.correct; $('m-correct-sub').title = c.correct;
    $('m-diff').textContent = (r.diff_pct === null || !isFinite(r.diff_pct)) ? 'n/a' :
      (r.diff_pct > 0 ? '+' : '') + r.diff_pct.toFixed(1) + ' %';
    var ul = $('details'); ul.innerHTML = '';
    r.details.forEach(function (d) { var li = document.createElement('li'); li.textContent = d; ul.appendChild(li); });
    drawChart(res, r);
  }

  function drawChart(res, r) {
    var c = byId[current], s = res.sweep, x0 = values[current][c.sweep];
    var traces = [
      { x: s.x, y: s.naive, name: c.naive, mode: 'lines', line: { dash: 'dash', color: '#b35c00', width: 2 } },
      { x: s.x, y: s.correct, name: c.correct, mode: 'lines', line: { color: '#1a7f37', width: 2.5 } },
      { x: [x0, x0], y: [r.naive, r.correct], name: 'current inputs', mode: 'markers',
        marker: { size: 9, color: ['#b35c00', '#1a7f37'] }, showlegend: false }];
    if (current === 'vle') traces.push({ x: [0, 1], y: [0, 100], name: 'y = x', mode: 'lines',
      line: { color: '#9aa0ac', width: 1, dash: 'dot' } });
    Plotly.react('chart', traces, {
      margin: { l: 64, r: 16, t: 30, b: 56 }, height: 360,
      xaxis: { title: { text: s.xlabel }, zeroline: false }, yaxis: { title: { text: c.quantity + ' [' + r.unit + ']' }, zeroline: false },
      legend: { orientation: 'h', y: 1.14 }, font: { family: 'Source Sans Pro, Segoe UI, sans-serif', size: 13 },
      datarevision: Date.now()
    }, { responsive: true, displaylogo: false });
    $('chart-cap').textContent = 'Both answers over ' + s.xlabel.replace(/ \[.*\]$/, '').toLowerCase() +
      ', other inputs held at their current values. Markers: the current inputs.';
  }

  function evalPy(id, inputs) {
    return JSON.parse(pyEval(id, JSON.stringify(inputs)));
  }

  function update() {
    document.querySelectorAll('.prob-md').forEach(function (d) { d.hidden = d.dataset.case !== current; });
    if (py) {
      try { show(evalPy(current, values[current]), 'live: Pyodide'); }
      catch (e) { fatal('Python error: ' + e.message); }
    } else if (isDefault()) {
      show(REF[current], 'build-time result (CPython)');
    } else {
      pending = true;
      $('res-src').textContent = 'waiting for Python to load…';
    }
  }

  /* ------------------------------------------------------------ Pyodide */
  function loadScript(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = function () { bad(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var BOOT = [
    'import json, math, sys', 'sys.path.insert(0, "/home/pyodide")', 'import cases',
    'def _clean(o):',
    '    if isinstance(o, float): return o if math.isfinite(o) else None',
    '    if isinstance(o, dict): return {k: _clean(v) for k, v in o.items()}',
    '    if isinstance(o, (list, tuple)): return [_clean(v) for v in o]',
    '    return o',
    'def page_eval(cid, inp):',
    '    inp = json.loads(inp)',
    '    return json.dumps(_clean({"run": cases.run(cid, inp), "sweep": cases.sweep(cid, inp)}))',
    'page_eval'].join('\n');

  var pyReady = loadScript(PYODIDE_URL + 'pyodide.js').then(function () {
    pill('busy', 'loading');
    return window.loadPyodide({ indexURL: PYODIDE_URL });
  }).then(function (p) {
    Object.keys(window.PY_FILES).forEach(function (f) { p.FS.writeFile('/home/pyodide/' + f, window.PY_FILES[f]); });
    pyEval = p.runPython(BOOT);
    py = p;
    pill('ready', 'Pyodide ready');
    update();
    return p;
  }).catch(function (e) {
    pill('fail', 'unavailable');
    $('res-src').textContent = 'build-time result; Python could not load (' + e.message + ')';
    throw e;
  });

  /* ------------------------------------------------------------ self-test */
  function relDiff(a, b) {
    if (a === null || b === null) return a === b ? 0 : Infinity;
    if (typeof a === 'string') return a === b ? 0 : Infinity;
    return Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  }

  function selftest() {
    $('selftest-status').textContent = 'running…';
    return pyReady.then(function () {
      var rows = [], pass = true, TOL = 1e-10;
      META.forEach(function (c) {
        var got = evalPy(c.id, defaultsOf(c.id)), ref = REF[c.id], worst = 0, n = 0;
        ['naive', 'correct', 'diff_pct'].forEach(function (k) { worst = Math.max(worst, relDiff(got.run[k], ref.run[k])); n++; });
        ['x', 'naive', 'correct'].forEach(function (k) {
          if (got.sweep[k].length !== ref.sweep[k].length) worst = Infinity;
          ref.sweep[k].forEach(function (v, i) { worst = Math.max(worst, relDiff(got.sweep[k][i], v)); n++; });
        });
        if (got.run.details.join('|') !== ref.run.details.join('|')) worst = Infinity;
        var ok = worst < TOL; pass = pass && ok;
        rows.push({ id: c.id, n: n, worst: worst, ok: ok, py: got.run.correct, cpy: ref.run.correct, unit: ref.run.unit });
      });
      var h = '<table class="data"><tr><th>Case</th><th>Corrected (CPython)</th><th>Corrected (Pyodide)</th>' +
        '<th>Values compared</th><th>Largest rel. difference</th><th>Result</th></tr>';
      rows.forEach(function (r) {
        h += '<tr><td>' + r.id + '</td><td>' + fmt(r.cpy) + ' ' + r.unit + '</td><td>' + fmt(r.py) + ' ' + r.unit +
          '</td><td>' + r.n + '</td><td>' + (isFinite(r.worst) ? r.worst.toExponential(1) : 'mismatch') +
          '</td><td class="' + (r.ok ? 'pass">pass' : 'fail">FAIL') + '</td></tr>';
      });
      $('selftest-out').innerHTML = h + '</table>';
      $('selftest-status').textContent = pass ? 'all cases agree within 1e-10' : 'FAILED';
      window.SELFTEST = { done: true, pass: pass, rows: rows };
      return window.SELFTEST;
    }).catch(function (e) {
      $('selftest-status').textContent = 'could not run: ' + e.message;
      window.SELFTEST = { done: true, pass: false, error: String(e) };
    });
  }
  $('b-selftest').addEventListener('click', selftest);

  /* ------------------------------------------------------------ breakdown plots, copy buttons */
  function drawBreakdownPlots() {
    document.querySelectorAll('[data-wt-plot]').forEach(function (d) {
      var f = window.WT_PLOTS[d.dataset.wtPlot];
      var lay = Object.assign({ height: 320, font: { size: 12 } }, f.layout);
      Plotly.newPlot(d, f.data, lay, { responsive: true, displaylogo: false });
    });
  }

  document.querySelectorAll('pre.prompt').forEach(function (pre) {
    var b = document.createElement('button'); b.className = 'btn small copy'; b.textContent = 'Copy';
    b.addEventListener('click', function () {
      var text = pre.querySelector('code').textContent;
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { b.textContent = 'Select and copy'; });
    });
    pre.appendChild(b);
  });

  /* ------------------------------------------------------------ start */
  META.forEach(function (c) { values[c.id] = defaultsOf(c.id); });
  $('in-case').addEventListener('change', function () { current = this.value; buildInputs(); update(); });
  $('b-reset').addEventListener('click', function () { values[current] = defaultsOf(current); buildInputs(); update(); });
  buildInputs();
  update();
  if (/[?&]selftest\b/.test(location.search)) selftest();
})();
