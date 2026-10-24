/* AI models on ChemE problems: tables, charts, tabs, self-test.
   Data: window.DATA = {models, problems, responses[{model, problem, run, score}]} (response text is only in the
   pre-rendered, escaped HTML of the Problems tab; it never goes through innerHTML here). */
(function () {
  'use strict';
  var D = window.DATA;
  var PALETTE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#444444', '#8C564B'];
  var CONFIG = { responsive: true, displaylogo: false };
  var LAYOUT = { font: { family: 'Source Sans Pro, sans-serif', size: 13, color: '#31333f' }, paper_bgcolor: '#fff',
                 plot_bgcolor: '#fff', margin: { l: 55, r: 40, t: 46, b: 70 }, height: 380 };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function fmt1(x) { return x.toFixed(1); }

  var vendors = uniq(D.models.map(function (m) { return m.vendor; }));
  function vcolor(v) { return PALETTE[vendors.indexOf(v) % PALETTE.length]; }

  /* Every model answered every problem, so all statistics cover all problems (no filters). */
  var PIDS = D.problems.map(function (p) { return p.id; });

  /* ------------------------------------------------------------ statistics */
  /* Per model, for the problems in `pids`: mean percent, and min/max over the per-run totals. */
  function stats(pids) {
    var out = {}, runs = uniq(D.responses.map(function (r) { return r.run; })).sort();
    D.models.forEach(function (m) {
      var mine = D.responses.filter(function (r) { return r.model === m.id && pids.indexOf(r.problem) >= 0; });
      if (!mine.length) { out[m.id] = null; return; }
      var totals = [];
      runs.forEach(function (k) {
        var s = mine.filter(function (r) { return r.run === k; }).map(function (r) { return r.score; });
        if (s.length) totals.push(10 * mean(s));
      });
      var cell = {};
      pids.forEach(function (p) {
        var s = mine.filter(function (r) { return r.problem === p; }).map(function (r) { return r.score; });
        if (s.length) cell[p] = mean(s);
      });
      out[m.id] = { mean: mean(totals), min: Math.min.apply(null, totals), max: Math.max.apply(null, totals),
                    n: mine.length, cell: cell };
    });
    return out;
  }

  /* ------------------------------------------------------------ display */
  function paramsText(m) {
    if (m.params == null) return 'not available';
    var s = m.params + ' B' + (m.params_active != null ? ' (' + m.params_active + ' B active)' : '');
    return m.params_official ? s : s + ' — estimate (unofficial)';
  }
  function costText(m) {
    if (m.cost_usd == null) return '—';
    var c = Number(m.cost_usd);
    return c === 0 ? '$0 (free)' : '$' + (c < 1 ? c.toPrecision(2) : c.toFixed(2));
  }
  // with a single run per problem there is no run-to-run spread to show
  var MULTI = uniq(D.responses.map(function (r) { return r.run; })).length > 1;
  function meanText(s) {
    return fmt1(s.mean) + ' %' + (MULTI ? ' (' + fmt1(s.min) + ' – ' + fmt1(s.max) + ')' : '');
  }

  var dirty = true;
  function update() {
    var pids = PIDS, st = stats(pids);
    var rows = D.models.filter(function (m) { return st[m.id]; })
      .sort(function (a, b) { return st[b.id].mean - st[a.id].mean; });
    metrics(rows, st, pids);
    table(rows, st);
    problemTable();
    if (document.getElementById('panel-results').hidden) { dirty = true; return; }
    dirty = false;
    charts(rows, st, pids);
  }

  function metrics(rows, st, pids) {
    var box = document.getElementById('metrics'); box.textContent = '';
    var graded = rows.reduce(function (a, m) { return a + st[m.id].n; }, 0);
    var cards = rows.length ? [
      ['Best model', fmt1(st[rows[0].id].mean) + ' %', rows[0].name],
      ['Weakest model', fmt1(st[rows[rows.length - 1].id].mean) + ' %', rows[rows.length - 1].name]
    ] : [['Best model', '—', ''], ['Weakest model', '—', '']];
    cards.push(['Problems', String(pids.length), 'difficulty levels 1–5']);
    cards.push(['Responses graded', String(graded), 'of ' + D.models.length * pids.length + ' (' + D.models.length +
      ' models × ' + pids.length + ' problems)']);
    cards.forEach(function (c) {
      var d = el('div', { 'class': 'metric' });
      d.appendChild(el('div', { 'class': 'm-label' }, c[0]));
      d.appendChild(el('div', { 'class': 'm-value' }, c[1]));
      var sub = el('div', { 'class': 'm-sub' }, c[2]); sub.title = c[2];
      d.appendChild(sub); box.appendChild(d);
    });
  }

  function table(rows, st) {
    var t = document.getElementById('model-table'); t.textContent = '';
    var hr = el('tr');
    ['Model', 'Vendor', 'Release', 'Cost (USD)', MULTI ? 'Mean score % (min – max of runs)' : 'Mean score %']
      .forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (m) {
      var tr = el('tr', { 'data-model': m.id });
      tr.appendChild(el('td', null, m.name));
      tr.appendChild(el('td', null, m.vendor));
      tr.appendChild(el('td', null, m.release_date));
      tr.appendChild(el('td', null, costText(m)));
      tr.appendChild(el('td', { 'class': 'mean' }, meanText(st[m.id])));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
  }

  /* One row per problem: its difficulty level (1–5) and the mean score over all models' replies. */
  function problemMeans() {
    var out = {};
    D.problems.forEach(function (p) {
      var s = D.responses.filter(function (r) { return r.problem === p.id; }).map(function (r) { return r.score; });
      out[p.id] = s.length ? 10 * mean(s) : null;
    });
    return out;
  }
  function problemTable() {
    var t = document.getElementById('problem-table'); t.textContent = '';
    var hr = el('tr'), pm = problemMeans();
    ['Problem', 'Title', 'Topic', 'Difficulty (1–5)', 'Mean score %']
      .forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    D.problems.forEach(function (p) {
      var tr = el('tr', { 'data-pid': p.id });
      tr.appendChild(el('td', null, p.id));
      tr.appendChild(el('td', null, p.title));
      tr.appendChild(el('td', null, p.topic));
      tr.appendChild(el('td', { 'class': 'level' }, String(p.level)));
      tr.appendChild(el('td', { 'class': 'pmean' }, pm[p.id] == null ? '—' : fmt1(pm[p.id]) + ' %'));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
  }

  function byVendor(rows, make) {
    return vendors.map(function (v) {
      var ms = rows.filter(function (m) { return m.vendor === v; });
      return ms.length ? make(v, ms) : null;
    }).filter(Boolean);
  }
  function lay(title, extra) {
    var l = JSON.parse(JSON.stringify(LAYOUT)); l.title = { text: title, font: { size: 15 } };
    for (var k in extra) l[k] = extra[k];
    return l;
  }
  function niceTop(v) {
    var e = Math.pow(10, Math.floor(Math.log10(v))), steps = [1, 1.5, 2, 2.5, 3, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * e >= v) return steps[i] * e;
    return 10 * e;
  }
  function charts(rows, st, pids) {
    var names = rows.map(function (m) { return m.name; });
    function err(ms) {
      if (!MULTI) return { visible: false };
      return { type: 'data', symmetric: false,
               array: ms.map(function (m) { return st[m.id].max - st[m.id].mean; }),
               arrayminus: ms.map(function (m) { return st[m.id].mean - st[m.id].min; }) };
    }
    // y axis follows the data: top = highest mean (with run max), rounded up to 1, 1.5, 2, 2.5, 3, 5 x 10^k
    var top = Math.max.apply(null, rows.map(function (m) { return st[m.id].max; }).concat([1]));
    var yax = { title: 'Mean score (%)', range: [0, Math.min(100, niceTop(top * 1.08))], gridcolor: '#eceef2' };
    // bar chart
    var barH = Math.max(320, 110 + 22 * rows.length);   // legend placed ~40 px below the plot area
    Plotly.react('plot-bar', byVendor(rows, function (v, ms) {
      // horizontal bars: one row per model, so every name stays readable
      return { type: 'bar', orientation: 'h', name: v, y: ms.map(function (m) { return m.name; }),
               x: ms.map(function (m) { return st[m.id].mean; }), error_x: err(ms),
               marker: { color: vcolor(v) }, hovertemplate: '%{y}: %{x:.1f} %<extra></extra>' };
    }), lay(MULTI ? 'Mean score, with run-to-run min–max' : 'Mean score', {
      barmode: 'overlay', height: barH,
      xaxis: { range: yax.range, gridcolor: yax.gridcolor, ticksuffix: ' %' },
      yaxis: { categoryorder: 'array', categoryarray: names, autorange: 'reversed', automargin: true,
               tickmode: 'array', tickvals: names },
      legend: { orientation: 'h', yanchor: 'top', y: -40 / (barH - 120) }, datarevision: Math.random() }), CONFIG);
    // score vs release date
    Plotly.react('plot-date', byVendor(rows, function (v, ms) {
      return { type: 'scatter', mode: 'markers', name: v, x: ms.map(function (m) { return m.release_date; }),
               y: ms.map(function (m) { return st[m.id].mean; }), error_y: err(ms),
               text: ms.map(function (m) { return m.name; }),
               marker: { color: vcolor(v), size: 10 }, hovertemplate: '%{text}<br>%{x}: %{y:.1f} %<extra></extra>' };
    }), lay('Score vs release date', { yaxis: yax, xaxis: { title: 'Release date', type: 'date', gridcolor: '#eceef2' },
      legend: { orientation: 'h', y: -0.3 }, datarevision: Math.random() }), CONFIG);
    // score vs parameters (log x); models without a parameter count are skipped
    var withP = rows.filter(function (m) { return m.params != null; });
    var skipped = rows.filter(function (m) { return m.params == null; }).map(function (m) { return m.name; });
    Plotly.react('plot-params', byVendor(withP, function (v, ms) {
      return { type: 'scatter', mode: 'markers', name: v, x: ms.map(function (m) { return m.params; }),
               y: ms.map(function (m) { return st[m.id].mean; }), error_y: err(ms),
               text: ms.map(function (m) { return m.name; }),
               marker: { color: vcolor(v), size: 10,
                         symbol: ms.map(function (m) { return m.params_official ? 'circle' : 'circle-open'; }),
                         line: { width: 2, color: vcolor(v) } },
               hovertemplate: '%{text}<br>%{x} B: %{y:.1f} %<extra></extra>' };
    }), lay('Score vs parameters', { yaxis: yax, xaxis: { title: 'Parameters (billions, log scale)', type: 'log',
      gridcolor: '#eceef2', tickvals: [1, 3, 10, 30, 100, 300, 1000], ticktext: ['1', '3', '10', '30', '100', '300', '1000'] }, legend: { orientation: 'h', y: -0.3 }, datarevision: Math.random() }), CONFIG);
    document.getElementById('params-note').textContent =
      'Hover over or tap a point to see the model. Score vs parameters: open markers are unofficial ' +
      'estimates of the parameter count; for mixture-of-experts models the total count is plotted.' +
      (skipped.length ? ' Not shown, because no parameter count is available: ' + skipped.join(', ') + '.' : '');
    // heatmap models x problems
    var pl = D.problems.filter(function (p) { return pids.indexOf(p.id) >= 0; });
    var z = rows.map(function (m) { return pl.map(function (p) { var c = st[m.id].cell[p.id]; return c == null ? null : c; }); });
    Plotly.react('plot-heat', [{ type: 'heatmap', x: pl.map(function (p) { return p.id; }), y: names, z: z,
      zmin: 0, zmax: 10, colorscale: 'YlGnBu', reversescale: false, xgap: 2, ygap: 2,
      text: z.map(function (r) { return r.map(function (v) { return v == null ? '' : v.toFixed(1); }); }),
      texttemplate: '%{text}', customdata: rows.map(function () { return pl.map(function (p) { return p.title; }); }),
      hovertemplate: '%{y}<br>%{x} %{customdata}: %{z:.2f} / 10<extra></extra>',
      colorbar: { title: { text: 'score / 10' } } }],
      lay('Mean score per problem (0–10)', { height: Math.max(320, 70 + 46 * rows.length),
        yaxis: { autorange: 'reversed', categoryorder: 'array', categoryarray: names, automargin: true }, xaxis: { type: 'category', tickangle: 0, title: 'Problem', tickvals: pl.map(function (p) { return p.id; }),
          ticktext: pl.map(function (p) { return String(+p.id.slice(1)); }) },
        datarevision: Math.random() }), CONFIG);
  }

  /* ------------------------------------------------------------ tabs */
  var tabs = document.querySelector('.tabs');
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    [].slice.call(tabs.querySelectorAll('button')).forEach(function (x) { x.classList.toggle('active', x === b); });
    [].slice.call(document.querySelectorAll('.tpanel')).forEach(function (p) { p.hidden = p.id !== b.getAttribute('data-tab'); });
    if (b.getAttribute('data-tab') === 'panel-results' && dirty) update();
    window.scrollTo(0, 0);
  });

  /* Grid cells link to a reply (or to one part's note inside it): open the reply before the browser jumps. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.ejump');
    if (!a) return;
    var t = document.getElementById(a.getAttribute('href').slice(1));
    var d = t && (t.tagName === 'DETAILS' ? t : t.closest('details'));
    if (d) d.open = true;
  });

  /* ------------------------------------------------------------ self-test */
  /* Recompute the per-model means straight from the responses (a separate, loop-only code path) and compare
     with (1) what the table shows and (2) the numbers the build computed in Python. */
  function selftest() {
    var details = [], ok = true;
    function check(name, pass, info) { details.push({ name: name, pass: pass, info: info }); if (!pass) ok = false; }
    var pids = PIDS;
    D.models.forEach(function (m) {
      var tot = {}, cnt = {}, i, r;
      for (i = 0; i < D.responses.length; i++) {
        r = D.responses[i];
        if (r.model !== m.id || pids.indexOf(r.problem) < 0) continue;
        tot[r.run] = (tot[r.run] || 0) + r.score; cnt[r.run] = (cnt[r.run] || 0) + 1;
      }
      var perRun = Object.keys(tot).map(function (k) { return 10 * tot[k] / cnt[k]; });
      var mu = perRun.reduce(function (a, b) { return a + b; }, 0) / perRun.length;
      var row = document.querySelector('#model-table tr[data-model="' + m.id + '"] td.mean');
      var shown = row ? row.textContent.match(/-?[0-9.]+/g).map(Number) : null;
      var want = MULTI ? [mu, Math.min.apply(null, perRun), Math.max.apply(null, perRun)] : [mu];
      var same = !!shown && shown.length === want.length && shown.every(function (v, j) { return Math.abs(v - want[j]) < 0.051; });
      check('table matches responses: ' + m.id, same, { shown: shown, recomputed: want });
      var ex = window.EXPECT[m.id];
      if (ex) {
        check('table matches build-time Python: ' + m.id,
          !!shown && Math.abs(shown[0] - ex.mean) < 0.051 &&
          (!MULTI || (Math.abs(shown[1] - ex.min) < 0.051 && Math.abs(shown[2] - ex.max) < 0.051)), { shown: shown, python: ex });
      }
    });
    var graded = document.querySelectorAll('#metrics .metric')[3];
    check('responses-graded card', !!graded && graded.querySelector('.m-value').textContent === String(
      D.responses.filter(function (r) { return pids.indexOf(r.problem) >= 0; }).length), null);
    /* Problem table: mean score per problem recomputed in a plain loop, and the level matches the data. */
    D.problems.forEach(function (p) {
      var s = 0, n = 0, i;
      for (i = 0; i < D.responses.length; i++) if (D.responses[i].problem === p.id) { s += D.responses[i].score; n++; }
      var tr = document.querySelector('#problem-table tr[data-pid="' + p.id + '"]');
      var shown = tr && Number(tr.querySelector('.pmean').textContent.match(/-?[0-9.]+/)[0]);
      check('problem table: ' + p.id, !!tr && Math.abs(shown - 10 * s / n) < 0.051 &&
        tr.querySelector('.level').textContent === String(p.level) && p.level >= 1 && p.level <= 5,
        { shown: shown, recomputed: 10 * s / n });
    });
    /* Where-points-were-lost grids: parts add up to the score, and every lost part has the same note in the reply. */
    var grids = document.querySelectorAll('.egrid tbody tr'), gridOk = true, gridInfo = [];
    [].forEach.call(grids, function (tr) {
      var sum = 0;
      [].forEach.call(tr.querySelectorAll('td.ecell'), function (td) {
        sum += Number(td.querySelector('.got').textContent.split('/')[0]);
        var t = td.getAttribute('data-type'), li = document.getElementById(tr.getAttribute('data-resp') + '-' + td.getAttribute('data-part'));
        var lost = !td.classList.contains('e-ok');
        if (lost !== !!li || (li && li.getAttribute('data-type') !== t)) { gridOk = false; gridInfo.push(tr.getAttribute('data-resp') + ' ' + td.getAttribute('data-part')); }
      });
      if (Math.abs(sum - Number(tr.querySelector('.tot').textContent)) > 1e-9) { gridOk = false; gridInfo.push(tr.getAttribute('data-resp') + ' sum'); }
    });
    check('error grids: parts sum to the score and match the notes in the replies (' + grids.length + ' rows)', gridOk && grids.length > 0, gridInfo.slice(0, 5));
    check('model output was not executed as HTML', window.PWNED === undefined && !document.querySelector('.prob script'), null);
    window.SELFTEST = { pass: ok, details: details };
    var pill = el('div', { 'class': ok ? 'note' : 'err', id: 'selftest-result' },
      'Self-test: ' + (ok ? 'passed' : 'FAILED') + ' (' + details.length + ' checks)');
    document.getElementById('app').insertBefore(pill, document.querySelector('.tabs'));
  }

  try {
    update();
    if (/[?&]selftest\b/.test(location.search)) selftest();
  } catch (e) {
    var b = document.getElementById('err'); b.hidden = false; b.textContent = 'Error: ' + e.message;
    window.SELFTEST = { pass: false, details: [{ name: 'render', pass: false, info: String(e) }] };
    throw e;
  }
})();
