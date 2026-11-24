/* Österreich-Atlas Migration – ohne externe Bibliotheken */
(function () {
  'use strict';
  var root = document.getElementById('atlas-migration');
  if (!root || root.getAttribute('data-ready')) return;
  root.setAttribute('data-ready', '1');
  var BASE = root.getAttribute('data-base') || '';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var $ = function (s) { return root.querySelector(s); };

  var D, G, IDS, YEARS, LAST, PATHS = {}, BLN;
  var state = { m: 'share', k: 0, sel: null, playing: null };

  var nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function pct(v) { return v == null ? '–' : nf1.format(v) + ' %'; }
  function pp(v) { return v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + nf1.format(Math.abs(v)) + ' Pp.'; }
  function int(v) { return nf0.format(v); }
  function sgn(v) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + nf0.format(Math.abs(v)); }

  /* ---------- Kennzahlen ---------- */
  function share(id, k) { var t = G[id].t[k]; return t && t[0] > 0 ? t[1] / t[0] * 100 : null; }
  var METRICS = {
    share: {
      title: 'Anteil ausländischer Staatsbürger an der Bevölkerung',
      time: true,
      val: function (id, k) { return share(id, k); },
      breaks: [5, 10, 15, 20, 25, 30, 40],
      colors: ['#eef3fb', '#d3e0f3', '#a9c3e8', '#7aa1d8', '#4b7cc3', '#2558a6', '#0a3d8f', '#062659'],
      fmt: pct,
      lab: function (b) { return b + ' %'; }
    },
    delta: {
      title: 'Veränderung des Ausländeranteils seit 2012 (Prozentpunkte)',
      time: true,
      minK: 1,
      val: function (id, k) { var a = share(id, 0), b = share(id, k); return a == null || b == null ? null : b - a; },
      breaks: [-2, 2, 5, 8, 12, 16],
      colors: ['#7aa1d8', '#e5e7eb', '#fbd3cf', '#f5a39a', '#ec6a5f', '#d3242c', '#8e1219'],
      fmt: pp,
      lab: function (b) { return (b > 0 ? '+' : '') + b; }
    },
    dritt: {
      title: 'Anteil der Drittstaatsangehörigen (außerhalb EU/EFTA/UK), 1.1.2026',
      fixed: true,
      val: function (id) { var g = G[id], p = g.t[LAST]; return p && p[0] ? g.h[6] / p[0] * 100 : null; },
      breaks: [2, 4, 6, 10, 15, 20, 30],
      colors: ['#eef3fb', '#d3e0f3', '#a9c3e8', '#7aa1d8', '#4b7cc3', '#2558a6', '#0a3d8f', '#062659'],
      fmt: pct,
      lab: function (b) { return b + ' %'; }
    },
    born: {
      title: 'Anteil der im Ausland Geborenen, 1.1.2026',
      fixed: true,
      val: function (id) { var g = G[id], p = g.t[LAST]; return p && p[0] && g.ga != null ? g.ga / p[0] * 100 : null; },
      breaks: [5, 10, 15, 20, 25, 30, 40],
      colors: ['#eef3fb', '#d3e0f3', '#a9c3e8', '#7aa1d8', '#4b7cc3', '#2558a6', '#0a3d8f', '#062659'],
      fmt: pct,
      lab: function (b) { return b + ' %'; }
    }
  };
  function color(m, v) {
    if (v == null) return null;
    var b = m.breaks, i = 0;
    while (i < b.length && v >= b[i]) i++;
    return m.colors[i];
  }

  /* ---------- TopoJSON dekodieren ---------- */
  function decode(topo) {
    var tf = topo.transform, sx = tf.scale[0], sy = tf.scale[1], tx = tf.translate[0], ty = tf.translate[1];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var arcs = topo.arcs.map(function (arc) {
      var x = 0, y = 0;
      return arc.map(function (p) {
        x += p[0]; y += p[1];
        var X = (x * sx + tx) / 100, Y = (y * sy + ty) / 100;
        if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
        return [X, Y];
      });
    });
    function ring(ids) {
      var pts = [];
      ids.forEach(function (i) {
        var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
        for (var j = pts.length ? 1 : 0; j < a.length; j++) pts.push(a[j]);
      });
      return pts;
    }
    function toPath(geom) {
      var polys = geom.type === 'Polygon' ? [geom.arcs] : geom.type === 'MultiPolygon' ? geom.arcs : [];
      var d = '';
      polys.forEach(function (poly) {
        poly.forEach(function (r) {
          var pts = ring(r);
          for (var j = 0; j < pts.length; j++) {
            d += (j ? 'L' : 'M') + Math.round(pts[j][0] * 10) / 10 + ' ' + Math.round((maxY0 - pts[j][1]) * 10) / 10;
          }
          d += 'Z';
        });
      });
      return d;
    }
    var maxY0;
    // erst Ausdehnung bestimmen (arcs sind schon berechnet)
    maxY0 = maxY;
    return {
      box: [minX, 0, maxX - minX, maxY - minY], minX: minX,
      gem: topo.objects.gem.geometries.map(function (g) { return { id: g.properties.id, d: toPath(g) }; }),
      bl: topo.objects.bl.geometries.map(function (g) { return toPath(g); })
    };
  }

  /* ---------- Karte ---------- */
  var svg = $('#am-map'), gMap, hlPath, hvPath, vb, vb0;
  function buildMap(geo) {
    vb0 = geo.box.slice(); vb0[0] = geo.minX;
    var padX = vb0[2] * 0.01, padY = vb0[3] * 0.02;
    vb0 = [vb0[0] - padX, -padY, vb0[2] + 2 * padX, vb0[3] + 2 * padY];
    vb = vb0.slice();
    svg.setAttribute('viewBox', vb.join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    var defs = document.createElementNS(SVGNS, 'defs');
    defs.innerHTML = '<pattern id="am-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#fff"/><rect width="1.6" height="4" fill="#cfd5de"/></pattern>';
    svg.appendChild(defs);
    gMap = document.createElementNS(SVGNS, 'g');
    var frag = document.createDocumentFragment();
    geo.gem.forEach(function (f) {
      if (!G[f.id]) return;
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', f.d);
      p.setAttribute('class', 'g');
      p.dataset.id = f.id;
      PATHS[f.id] = p;
      frag.appendChild(p);
    });
    gMap.appendChild(frag);
    geo.bl.forEach(function (d) {
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d); p.setAttribute('class', 'bl');
      gMap.appendChild(p);
    });
    hvPath = document.createElementNS(SVGNS, 'path'); hvPath.setAttribute('class', 'hv');
    hlPath = document.createElementNS(SVGNS, 'path'); hlPath.setAttribute('class', 'hl');
    gMap.appendChild(hvPath); gMap.appendChild(hlPath);
    svg.appendChild(gMap);
    $('#am-loading').remove();
    wireMap();
  }

  function paint() {
    var m = METRICS[state.m], k = m.fixed ? LAST : state.k;
    IDS.forEach(function (id) {
      var p = PATHS[id]; if (!p) return;
      var c = color(m, m.val(id, k));
      if (c) { p.style.fill = c; p.classList.remove('na'); } else { p.style.fill = ''; p.classList.add('na'); }
    });
    legend(m);
    var off = !!m.fixed;
    $('#am-time').classList.toggle('off', off);
    $('#am-yearbadge').textContent = off ? '2026' : String(YEARS[k]);
    $('#am-year-out').textContent = off ? '2026' : String(YEARS[k]);
  }

  function legend(m) {
    var h = '<div class="t">' + m.title + '</div>';
    m.colors.forEach(function (c, i) {
      var lo = i === 0 ? null : m.breaks[i - 1], hi = m.breaks[i];
      var txt = lo == null ? '< ' + m.lab(hi) : hi == null ? '≥ ' + m.lab(lo) : m.lab(lo);
      if (state.m === 'delta' && i === 1) txt = '±2';
      h += '<div class="k"><i style="background:' + c + '"></i><span>' + txt + '</span></div>';
    });
    h += '<div class="na"><i></i>keine Daten</div>';
    $('#am-legend').innerHTML = h;
  }

  /* Zoom & Verschieben */
  function setVB(n) {
    var minW = vb0[2] / 14;
    if (n[2] < minW) { var c = [n[0] + n[2] / 2, n[1] + n[3] / 2]; n = [c[0] - minW / 2, c[1] - minW * vb0[3] / vb0[2] / 2, minW, minW * vb0[3] / vb0[2]]; }
    if (n[2] > vb0[2]) n = vb0.slice();
    n[0] = Math.min(Math.max(n[0], vb0[0] - n[2] * 0.25), vb0[0] + vb0[2] - n[2] * 0.75);
    n[1] = Math.min(Math.max(n[1], vb0[1] - n[3] * 0.25), vb0[1] + vb0[3] - n[3] * 0.75);
    vb = n; svg.setAttribute('viewBox', vb.join(' '));
  }
  function zoomAt(f, cx, cy) {
    var w = vb[2] * f, h = vb[3] * f;
    setVB([cx - (cx - vb[0]) * f, cy - (cy - vb[1]) * f, w, h]);
  }
  function toSvg(e) {
    var r = svg.getBoundingClientRect();
    var s = Math.max(vb[2] / r.width, vb[3] / r.height);
    var ox = (r.width * s - vb[2]) / 2, oy = (r.height * s - vb[3]) / 2;
    return [vb[0] + (e.clientX - r.left) * s - ox, vb[1] + (e.clientY - r.top) * s - oy, s];
  }
  function zoomTo(id) {
    var p = PATHS[id]; if (!p) return;
    var b = p.getBBox(), size = Math.max(b.width * 6, vb0[2] / 8);
    var h = size * vb0[3] / vb0[2];
    setVB([b.x + b.width / 2 - size / 2, b.y + b.height / 2 - h / 2, size, h]);
  }

  function wireMap() {
    var ptrs = {}, start = null, moved = false, pinch = null;
    svg.addEventListener('pointerdown', function (e) {
      svg.setPointerCapture(e.pointerId);
      ptrs[e.pointerId] = [e.clientX, e.clientY];
      var ks = Object.keys(ptrs);
      if (ks.length === 1) { start = { x: e.clientX, y: e.clientY, vb: vb.slice(), p: toSvg(e) }; moved = false; }
      if (ks.length === 2) {
        var a = ptrs[ks[0]], b = ptrs[ks[1]];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: vb.slice(), c: toSvg({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }) };
        moved = true;
      }
    });
    svg.addEventListener('pointermove', function (e) {
      if (ptrs[e.pointerId]) ptrs[e.pointerId] = [e.clientX, e.clientY];
      var ks = Object.keys(ptrs);
      if (ks.length === 2 && pinch) {
        var a = ptrs[ks[0]], b = ptrs[ks[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        var f = pinch.d / d; vb = pinch.vb.slice();
        zoomAt(f, pinch.c[0], pinch.c[1]);
        return;
      }
      if (ks.length === 1 && start) {
        var dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) { moved = true; svg.classList.add('dragging'); hideTip(); }
        if (moved && start.vb[2] < vb0[2] * 0.999) {
          var s = start.p[2];
          setVB([start.vb[0] - dx * s, start.vb[1] - dy * s, start.vb[2], start.vb[3]]);
        }
        return;
      }
      if (e.pointerType === 'mouse') hover(e);
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (Object.keys(ptrs).length < 2) pinch = null;
      if (!Object.keys(ptrs).length) {
        svg.classList.remove('dragging');
        if (!moved && start) {
          var t = document.elementFromPoint(e.clientX, e.clientY);
          if (t && t.dataset && t.dataset.id) select(t.dataset.id, { scroll: true });
        }
        start = null;
      }
    }
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
    svg.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey && vb[2] >= vb0[2] * 0.999 && e.deltaY > 0) return;
      e.preventDefault();
      var p = toSvg(e); zoomAt(e.deltaY < 0 ? 0.8 : 1.25, p[0], p[1]);
    }, { passive: false });
    root.querySelectorAll('.am-zoom button').forEach(function (b) {
      b.addEventListener('click', function () {
        var z = b.dataset.z, c = [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
        if (z === 'in') zoomAt(0.6, c[0], c[1]);
        else if (z === 'out') zoomAt(1 / 0.6, c[0], c[1]);
        else setVB(vb0.slice());
      });
    });
  }

  var tip = $('#am-tip');
  function hover(e) {
    var t = e.target;
    if (!t.dataset || !t.dataset.id) { hideTip(); return; }
    var id = t.dataset.id, g = G[id], m = METRICS[state.m], k = m.fixed ? LAST : state.k;
    hvPath.setAttribute('d', t.getAttribute('d'));
    var v = m.val(id, k);
    tip.innerHTML = '<b>' + esc(g.n) + '</b><span class="v">' + m.fmt(v) + '</span><br><span class="s">' +
      (state.m === 'delta' ? '2012 → ' + YEARS[k] : (m.fixed ? '2026' : YEARS[k])) + ' · ' + int(pop(id, m.fixed ? LAST : k)) + ' Einw.</span>';
    tip.hidden = false;
    var r = $('#am-mapbox').getBoundingClientRect(), x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + 240 > r.width) x = e.clientX - r.left - 14 - tip.offsetWidth;
    if (y + tip.offsetHeight > r.height) y = e.clientY - r.top - 14 - tip.offsetHeight;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; if (hvPath) hvPath.setAttribute('d', ''); }
  function pop(id, k) { var t = G[id].t[k]; return t ? t[0] : 0; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Zeitraffer ---------- */
  var range = $('#am-year');
  function setK(k) { state.k = k; range.value = k; paint(); }
  range.addEventListener('input', function () { stop(); setK(+range.value); });
  function stop() {
    if (state.playing) { clearInterval(state.playing); state.playing = null; }
    $('#am-play-ic').setAttribute('d', 'M8 5v14l11-7z');
    $('#am-play').setAttribute('aria-label', 'Zeitraffer abspielen');
  }
  $('#am-play').addEventListener('click', function () {
    if (state.playing) { stop(); return; }
    var m = METRICS[state.m];
    if (m.fixed) return;
    var k = state.k >= LAST ? (m.minK || 0) : state.k;
    setK(k);
    $('#am-play-ic').setAttribute('d', 'M7 5h4v14H7zM13 5h4v14h-4z');
    $('#am-play').setAttribute('aria-label', 'Zeitraffer anhalten');
    state.playing = setInterval(function () {
      if (state.k >= LAST) { stop(); return; }
      setK(state.k + 1);
    }, 750);
  });

  root.querySelectorAll('.am-seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      root.querySelectorAll('.am-seg button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      stop(); state.m = b.dataset.m;
      var m = METRICS[state.m];
      if (m.minK && state.k < m.minK) state.k = LAST;
      range.min = m.minK || 0; range.value = state.k;
      paint();
    });
  });

  /* ---------- Suche ---------- */
  var q = $('#am-q'), sugg = $('#am-sugg'), hits = [], cur = -1, INDEX;
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/st\.?\s/g, 'sankt '); }
  q.addEventListener('input', function () {
    var v = norm(q.value.trim());
    if (v.length < 2) { closeSugg(); return; }
    var a = [], b = [];
    INDEX.forEach(function (it) {
      var i = it.k.indexOf(v);
      if (i === 0) a.push(it); else if (i > 0) b.push(it);
    });
    var byPop = function (x, y) { return pop(y.id, LAST) - pop(x.id, LAST); };
    hits = a.sort(byPop).concat(b.sort(byPop)).slice(0, 8);
    cur = -1;
    sugg.innerHTML = hits.length ? hits.map(function (h, i) {
      return '<li role="option" id="am-o' + i + '" data-id="' + h.id + '"><span>' + esc(G[h.id].n) + '</span><small>' + esc(G[h.id].bz || BLN[h.id[0]]) + '</small></li>';
    }).join('') : '<li aria-disabled="true"><span>Keine Gemeinde gefunden</span></li>';
    sugg.hidden = false; q.setAttribute('aria-expanded', 'true');
  });
  q.addEventListener('keydown', function (e) {
    if (sugg.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      sugg.querySelectorAll('li').forEach(function (li, i) { li.setAttribute('aria-selected', i === cur ? 'true' : 'false'); });
      q.setAttribute('aria-activedescendant', 'am-o' + cur);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var h = hits[cur < 0 ? 0 : cur]; if (h) pick(h.id);
    } else if (e.key === 'Escape') closeSugg();
  });
  sugg.addEventListener('mousedown', function (e) {
    var li = e.target.closest('li'); if (li && li.dataset.id) { e.preventDefault(); pick(li.dataset.id); }
  });
  q.addEventListener('blur', function () { setTimeout(closeSugg, 120); });
  function closeSugg() { sugg.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); }
  function pick(id) { closeSugg(); q.value = G[id].n; q.blur(); select(id, { zoom: true, scroll: true }); }

  /* ---------- Steckbrief ---------- */
  function regionSeries(key) {
    return D.sum[key].map(function (t) { return t[0] ? t[1] / t[0] * 100 : null; });
  }
  function rankIn(id, filter) {
    var v = share(id, LAST), r = 1, n = 0;
    IDS.forEach(function (x) { if (!filter(x)) return; var s = share(x, LAST); if (s == null) return; n++; if (s > v) r++; });
    return [r, n];
  }
  function select(id, opt) {
    if (!G[id]) return;
    opt = opt || {};
    state.sel = id;
    hlPath.setAttribute('d', PATHS[id] ? PATHS[id].getAttribute('d') : '');
    if (opt.zoom) zoomTo(id);
    renderCard(id);
    try { history.replaceState(null, '', '#gemeinde=' + id); } catch (e) {}
    if (opt.scroll) {
      var c = $('#am-card');
      var r = c.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.6 || r.top < 0) c.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function renderCard(id) {
    var g = G[id], bl = id[0], blName = BLN[bl];
    var s26 = share(id, LAST), s12 = share(id, 0);
    var t26 = g.t[LAST], t12 = g.t[0];
    var at = regionSeries('AT'), bls = regionSeries(bl);
    var rB = rankIn(id, function (x) { return x[0] === bl; }), rA = rankIn(id, function () { return true; });
    var popGrowth = g.p02 ? (t26[0] - g.p02) / g.p02 * 100 : null;
    var h = g.h;

    var kp = '<div class="am-kpis">' +
      kpi('hero', 'Ausländische Staatsbürger', pct(s26), int(t26[1]) + ' von ' + int(t26[0]) + ' Einw.') +
      kpi('', 'Veränderung seit 2012', s12 == null ? '–' : pp(s26 - s12), s12 == null ? 'keine Vergleichsdaten' : '2012: ' + pct(s12)) +
      kpi('', 'Drittstaatsangehörige', pct(h[6] / t26[0] * 100), int(h[6]) + ' Personen') +
      kpi('', 'Einwohner seit 2002', popGrowth == null ? '–' : (popGrowth >= 0 ? '+' : '−') + nf1.format(Math.abs(popGrowth)) + ' %', int(g.p02) + ' → ' + int(t26[0])) +
      '</div>';

    var facts = [];
    if (t12) {
      var at12 = t12[0] - t12[1], at26 = t26[0] - t26[1];
      var dA = at26 - at12, dF = t26[1] - t12[1];
      var part = function (d, w) { return '<b>' + int(Math.abs(d)) + ' ' + w + ' ' + (d >= 0 ? 'mehr' : 'weniger') + '</b>'; };
      facts.push('Seit 2012 zählt ' + esc(g.n) + ' ' + part(dA, 'österreichische Staatsbürger') + ' und ' + part(dF, 'ausländische Staatsbürger') + '.');
    }
    facts.push('Im Ausland geboren: <b>' + (g.ga != null ? pct(g.ga / t26[0] * 100) : '–') + '</b> der Einwohner (' + (g.ga != null ? int(g.ga) : '–') + ' Personen).');
    facts.push('Rang <b>' + int(rA[0]) + ' von ' + int(rA[1]) + '</b> in Österreich und <b>' + int(rB[0]) + ' von ' + int(rB[1]) + '</b> in ' + blName + ' beim Ausländeranteil. Österreich gesamt: <b>' + pct(at[LAST]) + '</b>, ' + blName + ': <b>' + pct(bls[LAST]) + '</b>.');

    var html = '<div class="am-card-top"><div><h2>' + esc(g.n) + '</h2><p class="sub">' + esc(g.bz && g.bz !== g.n ? g.bz + ', ' : '') + blName + '</p></div>' +
      '<button type="button" class="am-share" id="am-share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Teilen</button></div>' +
      kp +
      '<div class="am-cols"><div><h3>Ausländeranteil 2012–2026</h3><div class="am-chart" id="am-chart"></div>' +
      '<div class="am-keys"><span><i style="background:var(--am-red)"></i>' + esc(g.n) + '</span><span><i style="background:var(--am-blue)"></i>' + blName + '</span><span><i style="background:#9aa3af"></i>Österreich</span></div></div>' +
      '<div><h3>Woher die ausländischen Staatsbürger kommen (1.1.2026)</h3>' + bars(g) + '</div></div>' +
      '<ul class="am-facts">' + facts.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>';
    var c = $('#am-card');
    c.innerHTML = html; c.hidden = false;
    lineChart($('#am-chart'), [
      { name: g.n, color: 'var(--am-red)', v: YEARS.map(function (_, k) { return share(id, k); }) },
      { name: blName, color: 'var(--am-blue)', v: bls },
      { name: 'Österreich', color: '#9aa3af', v: at }
    ]);
    $('#am-share').addEventListener('click', function () { share_(g, s26, s12); });
  }
  function kpi(cls, l, v, c) { return '<div class="am-kpi ' + cls + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="c">' + c + '</div></div>'; }

  function bars(g) {
    var h = g.h; // eu,de,ro,hr,hu,efta,dritt,tr,rs,ba,ua,sy,afr,asi,am,eur
    var euRest = Math.max(0, h[0] - h[1] - h[2] - h[3] - h[4]) + h[5];
    var rows = [
      ['grp', 'EU, EFTA, UK'],
      ['eu', 'Deutschland', h[1]], ['eu', 'Rumänien', h[2]], ['eu', 'Kroatien', h[3]], ['eu', 'Ungarn', h[4]], ['eu', 'übrige EU/EFTA/UK', euRest],
      ['grp', 'Drittstaaten'],
      ['', 'Türkei', h[7]], ['', 'Serbien', h[8]], ['', 'Bosnien-Herz.', h[9]], ['', 'Ukraine', h[10]],
      ['', 'übriges Europa', Math.max(0, h[15] - h[7] - h[8] - h[9] - h[10])],
      ['', 'Syrien', h[11]], ['', 'übriges Asien', Math.max(0, h[13] - h[11])], ['', 'Afrika', h[12]], ['', 'Amerika', h[14]],
      ['', 'Sonstige/unbekannt', Math.max(0, h[6] - h[15] - h[13] - h[12] - h[14])]
    ];
    var max = 1;
    rows.forEach(function (r) { if (r[0] !== 'grp' && r[2] > max) max = r[2]; });
    return '<div class="am-bars">' + rows.map(function (r) {
      if (r[0] === 'grp') return '<div class="grp">' + r[1] + '</div>';
      return '<div class="am-bar ' + r[0] + '"><span class="n">' + r[1] + '</span><span class="tr"><span class="f" style="width:' + (r[2] / max * 100).toFixed(1) + '%;' + (r[2] ? '' : 'min-width:0') + '"></span></span><span class="x">' + int(r[2]) + '</span></div>';
    }).join('') + '</div>';
  }

  function lineChart(el, series) {
    var W = 520, H = 230, L = 34, R = 92, T = 12, B = 26;
    var max = 0;
    series.forEach(function (s) { s.v.forEach(function (v) { if (v != null && v > max) max = v; }); });
    var step = max > 40 ? 10 : max > 20 ? 5 : max > 8 ? 2 : 1;
    max = Math.ceil(max / step) * step || step;
    var y0 = YEARS[0], y1 = YEARS[LAST];
    var X = function (y) { return L + (y - y0) / (y1 - y0) * (W - L - R); };
    var Y = function (v) { return T + (1 - v / max) * (H - T - B); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Liniendiagramm Ausländeranteil">';
    for (var v = 0; v <= max + 1e-9; v += step) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    }
    [2012, 2015, 2018, 2021, 2024, 2026].forEach(function (y) {
      s += '<text class="ax" x="' + X(y) + '" y="' + (H - 6) + '" text-anchor="middle">' + y + '</text>';
    });
    var ends = [];
    series.slice().reverse().forEach(function (se) {
      var d = '', on = false;
      se.v.forEach(function (v, k) {
        if (v == null) { on = false; return; }
        d += (on ? 'L' : 'M') + X(YEARS[k]).toFixed(1) + ' ' + Y(v).toFixed(1); on = true;
      });
      s += '<path class="ln" d="' + d + '" style="stroke:' + se.color + '"/>';
      var lv = se.v[LAST]; if (lv != null) ends.push({ y: Y(lv), t: nf1.format(lv) + ' %', c: se.color, n: se.name });
    });
    // Endlabels entzerren
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach(function (e) {
      s += '<circle cx="' + X(y1) + '" cy="' + e.y.toFixed(1) + '" r="3.5" style="fill:' + e.c + '"/><text class="lbl" x="' + (X(y1) + 8) + '" y="' + (e.y + 4).toFixed(1) + '">' + e.t + '</text>';
    });
    s += '<line class="xh" id="am-xh" y1="' + T + '" y2="' + (H - B) + '" style="display:none"/><rect id="am-hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent"/></svg>';
    el.innerHTML = s + '<div class="am-tip" hidden></div>';
    var svgc = el.querySelector('svg'), xh = el.querySelector('#am-xh'), tp = el.querySelector('.am-tip');
    function mv(e) {
      var r = svgc.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
      var best = 0, bd = Infinity;
      YEARS.forEach(function (y, k) { var dd = Math.abs(X(y) - x); if (dd < bd) { bd = dd; best = k; } });
      var xx = X(YEARS[best]);
      xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.style.display = '';
      tp.innerHTML = '<b>' + D.stichtag[best] + '</b>' + series.map(function (se) { return '<span class="s">' + esc(se.name) + ':</span> ' + pct(se.v[best]); }).join('<br>');
      tp.hidden = false;
      var px = xx / W * r.width;
      tp.style.left = Math.min(Math.max(px - 80, 0), r.width - 170) + 'px';
      tp.style.top = (-tp.offsetHeight - 6) + 'px';
    }
    svgc.addEventListener('pointermove', mv);
    svgc.addEventListener('pointerdown', mv);
    svgc.addEventListener('pointerleave', function () { xh.style.display = 'none'; tp.hidden = true; });
  }

  function share_(g, s26, s12) {
    var url = location.href.split('#')[0] + '#gemeinde=' + state.sel;
    var text = g.n + ': ' + pct(s26) + ' ausländische Staatsbürger' + (s12 != null ? ' (2012: ' + pct(s12) + ')' : '') + '. Wie sieht es in deiner Gemeinde aus?';
    if (navigator.share) { navigator.share({ title: 'Österreich-Atlas Migration', text: text, url: url }).catch(function () {}); return; }
    var done = function () { var b = $('#am-share'); if (b) { b.lastChild.textContent = 'Link kopiert'; setTimeout(function () { if (b.isConnected) b.lastChild.textContent = 'Teilen'; }, 2000); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(done, function () {}); else prompt('Link kopieren:', url);
  }

  /* ---------- Ranglisten ---------- */
  function lists() {
    var big = IDS.filter(function (id) { return pop(id, LAST) >= 1000; });
    var top = big.slice().sort(function (a, b) { return share(b, LAST) - share(a, LAST); }).slice(0, 10);
    var rise = big.filter(function (id) { return share(id, 0) != null; })
      .sort(function (a, b) { return (share(b, LAST) - share(b, 0)) - (share(a, LAST) - share(a, 0)); }).slice(0, 10);
    var li = function (id, v) { return '<li><button type="button" data-id="' + id + '"><span>' + esc(G[id].n) + ' <small>' + esc(BLN[id[0]]) + '</small></span><span class="x">' + v + '</span></button></li>'; };
    $('#am-top').innerHTML = top.map(function (id) { return li(id, pct(share(id, LAST))); }).join('');
    $('#am-rise').innerHTML = rise.map(function (id) { return li(id, pp(share(id, LAST) - share(id, 0))); }).join('');
    var dr = function (id) { return G[id].h[6] / pop(id, LAST) * 100; };
    var drt = big.slice().sort(function (a, b) { return dr(b) - dr(a); }).slice(0, 10);
    $('#am-dritt').innerHTML = drt.map(function (id) { return li(id, pct(dr(id))); }).join('');
    root.querySelectorAll('.am-list button').forEach(function (b) {
      b.addEventListener('click', function () { select(b.dataset.id, { zoom: true, scroll: true }); });
    });
  }

  /* ---------- Start ---------- */
  function get(u) { return fetch(BASE + u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  Promise.all([get('daten.json'), get('gemeinden.topo.json')]).then(function (res) {
    D = res[0]; G = D.g; IDS = Object.keys(G); YEARS = D.jahre; LAST = YEARS.length - 1; BLN = D.bl;
    state.k = LAST;
    range.max = LAST; range.value = LAST;
    INDEX = IDS.map(function (id) { return { id: id, k: norm(G[id].n) }; });
    var at = regionSeries('AT');
    $('#am-lead').innerHTML = 'Am 1. Jänner 2026 hatten <b>' + int(D.sum.AT[LAST][1]) + '</b> Einwohner Österreichs keine österreichische Staatsbürgerschaft, das sind <b>' + pct(at[LAST]) + '</b>. Im Herbst 2012 waren es noch <b>' + pct(at[0]) + '</b>. So hat sich der Anteil in allen 2.114 Gemeinden und Wiener Bezirken entwickelt.';
    $('#am-stand').textContent = 'Datenstand: ' + D.stichtag[LAST] + '.';
    buildMap(decode(res[1]));
    paint();
    lists();
    var fromHash = function () { var m = /gemeinde=(\d{5})/.exec(location.hash); if (m && G[m[1]] && m[1] !== state.sel) select(m[1], { zoom: true }); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
  }).catch(function (e) {
    $('#am-loading').textContent = 'Die Daten konnten nicht geladen werden.';
    if (window.console) console.error(e);
  });
})();
