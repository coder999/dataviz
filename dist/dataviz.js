/*! coder999/dataviz v0.8.2 · "Full Score" ECharts builders · MIT
 * Plain script, no modules. Load echarts.min.js first, then this; exposes window.DV.
 * Colours and fonts come from the --dv-* tokens in dataviz.css, read at render time,
 * so charts follow light/dark and re-render when the scheme or data-theme changes. */
(function (root) {
  'use strict';
  const MINUS = '−';

  /* ---------- formatters (pure; covered by test/format.test.js) ---------- */
  function signOf(v, zero, o) { return zero ? (o.sign ? '±' : '') : v < 0 ? MINUS : o.sign ? '+' : ''; }

  // $2.76M, $412k, $950; {trim} drops trailing zeros ($2M, $2.5M), {full} gives $2,759,750, {sign} adds +/−
  function money(v, o) {
    o = o || {};
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v), fix = s => o.trim ? s.replace(/\.?0+$/, '') : s;
    let body;
    if (o.full) body = Math.round(a).toLocaleString('en-US');
    else if (a >= 999.5e6) body = fix((a / 1e9).toFixed(2)) + 'B';
    else if (a >= 999500) body = fix((a / 1e6).toFixed(2)) + 'M';
    else if (a >= 999.5) body = Math.round(a / 1e3) + 'k';
    else body = String(Math.round(a));
    return signOf(v, /^[0,]+$/.test(body), o) + '$' + body;
  }

  // 87%, 87.4% ({digits:1}), +2% ({sign:true})
  function pct(v, o) {
    o = o || {};
    if (v == null || !isFinite(v)) return '—';
    const body = Math.abs(v).toFixed(o.digits || 0);
    return signOf(v, +body === 0, o) + body + '%';
  }

  // 12,308 (default), 12k / 1.2k / 2.5M ({compact}), +5 / −5 / ±0 ({sign})
  function count(v, o) {
    o = o || {};
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v), one = x => x.toFixed(1).replace(/\.0$/, '');
    let body;
    if (!o.compact) body = Math.round(a).toLocaleString('en-US');
    else if (a < 999.5) body = String(Math.round(a));
    else if (a < 9999.5) body = one(a / 1e3) + 'k';
    else if (a < 999500) body = Math.round(a / 1e3) + 'k';
    else if (a < 9.9995e6) body = one(a / 1e6) + 'M';
    else body = Math.round(a / 1e6) + 'M';
    return signOf(v, body === '0', o) + body;
  }

  // 433.8 GB, 950 B. Binary steps with the familiar labels, as Google Drive and Finder's "used" do.
  function bytes(v) {
    if (v == null || !isFinite(v)) return '—';
    let a = Math.abs(v), u = 0;
    while (a >= 1023.95 && u < 4) { a /= 1024; u++; }
    return (v < 0 ? MINUS : '') + (u ? a.toFixed(1) : Math.round(a)) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][u];
  }

  // '2026-10-03' -> 'Oct 3'. Read as UTC so no viewer timezone moves it a day.
  function day(iso) {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  /* ---------- live-chart time helpers (pure; covered by test/live.test.js) ---------- */
  // Points are [tMs, value]. Keep the window plus 60 s of slack, so the line enters from the left edge.
  function trim(points, now, windowMs) { return points.filter(p => p[0] >= now - windowMs - 60e3); }
  // Carry the last value flat to `now`, so the line meets the right edge without inventing a value.
  // A series silent for longer than holdMax just ends: a host that stopped reporting must not look live.
  function held(points, now, holdMax) {
    const last = points[points.length - 1];
    return last && last[0] < now && now - last[0] <= holdMax ? points.concat([[now, last[1]]]) : points.slice();
  }
  // Tooltip heading for time v: 'now', '−3m', or '−30s' when the window is two minutes or less.
  // (The axis itself shows clock times, which slide with the data instead of changing their text.)
  function ago(v, now, windowMs) {
    const s = (now - v) / 1e3;
    if (windowMs <= 120e3) return Math.round(s) <= 0 ? 'now' : MINUS + Math.round(s) + 's';
    const m = Math.round(s / 60);
    return m <= 0 ? 'now' : MINUS + m + 'm';
  }

  const DV = { version: '0.8.2', fmt: { money, pct, count, day, bytes }, time: { trim, held, ago } };
  if (typeof module === 'object' && module.exports) module.exports = DV;
  if (typeof document === 'undefined') return; // Node: formatters only

  /* ---------- theme ---------- */
  const TOKENS = ['ground', 'plate', 'ink', 'ink-2', 'ink-3', 'rule', 'rule-soft', 'staff', 'mark-line',
    'accent', 'accent-2', 'on-accent', 'accent-wash', 'on-entity', 'status-ok', 'status-error', 'font-display', 'font-fig', 'font-ui'];
  const camel = s => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());

  function surfaceOf(el, fallback) {
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return fallback;
  }

  // Resolved tokens for `el` (default <html>): {ink, ground, accent, entity:[6], fontUi, ...}
  function theme(el) {
    el = el || document.documentElement;
    const cs = getComputedStyle(el), t = {};
    TOKENS.forEach(k => { t[camel(k)] = cs.getPropertyValue('--dv-' + k).trim(); });
    t.entity = [1, 2, 3, 4, 5, 6].map(i => cs.getPropertyValue('--dv-entity-' + i).trim());
    t.tint = [1, 2, 3, 4, 5].map(i => cs.getPropertyValue('--dv-tint-' + i).trim());
    t.line = [1, 2, 3, 4].map(i => cs.getPropertyValue('--dv-line-' + i).trim());
    t.surface = surfaceOf(el, t.ground);
    t.cssVar = name => cs.getPropertyValue(name).trim();
    t.width = el.clientWidth || 600;
    t.small = t.width < 560;
    return t;
  }
  const slotColor = (t, slot) => t.entity[((slot || 1) - 1) % 6];
  // A series is a person/entity ({slot}) or, when it is not a person, a step of the tint ramp ({tint: 1-5}).
  const seriesColor = (t, s, k) => (s.tint ? t.tint[(s.tint - 1) % 5] : slotColor(t, s.slot || k + 1));
  const keyClass = (s, k) => (s.tint ? 'dv-tint-' + s.tint : 'dv-slot-' + (s.slot || k + 1));
  const alpha = (c, a) => root.echarts.color.modifyAlpha(c, a);
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ---------- registry: every chart re-renders on theme / mark / font / size change ---------- */
  const charts = new Map(); // el -> {chart, build}
  const known = new Map();  // mark letter -> {mark, year, label}
  let queued = false;

  function draw(el, e, animate) {
    const t = theme(el), opt = e.build(t);
    opt.animation = opt.animation !== false && !!animate && !reduced(); // a builder may opt out (DV.live)
    opt.aria = { enabled: false }; // we label the container ourselves
    opt.textStyle = { fontFamily: t.fontUi, color: t.ink };
    e.chart.setOption(opt, { notMerge: true });
  }
  function redrawAll() {
    queued = false;
    charts.forEach((e, el) => {
      if (!el.isConnected) { e.chart.dispose(); charts.delete(el); return; }
      e.chart.resize();
      draw(el, e, false);
    });
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(redrawAll); } }
  const ro = root.ResizeObserver ? new ResizeObserver(queue) : null;

  function mount(el, build, label, table, renderer) {
    if (typeof el === 'string') el = document.querySelector(el);
    el.classList.add('dv-chart');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
    let e = charts.get(el);
    if (!e) {
      const chart = root.echarts.getInstanceByDom(el) || root.echarts.init(el, null, { renderer: renderer || 'svg' });
      chart.on('click', p => { if (p.componentType === 'markLine' && p.name && known.has(p.name)) marks.toggle(p.name); });
      e = { chart };
      charts.set(el, e);
      if (ro) ro.observe(el);
    }
    e.build = build;
    draw(el, e, true);
    if (table) DV.table(el, table);
    return e.chart;
  }

  /* ---------- accessible data table, visually hidden, placed right after the chart ---------- */
  const tables = new WeakMap();
  DV.table = function (el, spec) {
    if (typeof el === 'string') el = document.querySelector(el);
    let tb = tables.get(el);
    if (!tb) { // tables ignore height:1px, so the clipping lives on a wrapper
      const wrap = document.createElement('div');
      wrap.className = 'dv-sr-only';
      tb = wrap.appendChild(document.createElement('table'));
      el.insertAdjacentElement('afterend', wrap);
      tables.set(el, tb);
    }
    tb.textContent = '';
    if (spec.caption) tb.createCaption().textContent = spec.caption;
    const hr = tb.createTHead().insertRow();
    spec.columns.forEach(c => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = c; hr.appendChild(th); });
    const body = tb.createTBody();
    spec.rows.forEach(r => { const tr = body.insertRow(); r.forEach(c => { tr.insertCell().textContent = c; }); });
    return tb;
  };

  /* ---------- rehearsal marks, shared across every chart on the page ---------- */
  const marks = {
    active: null,
    set(m) {
      this.active = m || null;
      document.querySelectorAll('[data-dv-mark]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dvMark === this.active)));
      const k = known.get(this.active);
      document.dispatchEvent(new CustomEvent('dv:mark', { detail: { mark: this.active, year: k ? k.year : null, label: k ? k.label : null } }));
      queue();
    },
    toggle(m) { this.set(this.active === m ? null : m); },
  };
  DV.marks = marks;
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-dv-mark]');
    if (b) marks.toggle(b.dataset.dvMark);
  });

  // perYear (px per year): when set, letters keep to one row and marks whose boxes would collide
  // merge into one box ("D·E", or "D–F" for a run of three or more consecutive letters) on the first
  // mark's line. Every line still draws; tapping a merged box selects its first mark, and it fills when
  // any of its marks is active. Without perYear, narrow charts stagger the letters in two tiers.
  // Since 0.5.1 DV.fan, DV.stacked and DV.lines pass perYear at every width (DV.score only when narrow).
  function mergedText(g) {
    const run = g.length > 2 && g.every((m, i) => !i || m.mark.charCodeAt(0) === g[i - 1].mark.charCodeAt(0) + 1);
    return run ? g[0].mark + '–' + g[g.length - 1].mark : g.map(x => x.mark).join('·');
  }
  function markLayers(t, list, compact, pos, perYear) {
    if (!list || !list.length) return {};
    list.forEach(m => known.set(m.mark, m));
    const act = marks.active, ev = list.find(m => m.mark === act);
    let lead = null; // first mark of each merged group -> its letters
    if (perYear) {
      lead = new Map();
      // box half-width for a label: ~7px a glyph at the compact size, ~8.5px at the full size, plus padding
      const half = g => (mergedText(g).length * (compact ? 7 : 8.5) + (compact ? 8 : 12)) / 2;
      let g = null;
      list.slice().sort((a, b) => a.year - b.year).forEach(m => {
        if (g && (m.year - g[0].year) * perYear < half(g) + half([m]) + 4) g.push(m);
        else { g = [m]; lead.set(m.mark, g); }
      });
    }
    return {
      markLine: {
        symbol: 'none', animation: false, emphasis: { disabled: true },
        label: { show: true, position: pos || 'end', formatter: '{b}', fontFamily: t.fontUi, fontWeight: 700, fontSize: compact ? 10 : 12,
          borderColor: t.accent, borderWidth: 1.5, padding: compact ? [3, 4, 2, 4] : [4, 6, 3, 6] },
        data: list.map((m, j) => {
          const on = m.mark === act, g = lead && lead.get(m.mark), box = g ? g.some(x => x.mark === act) : on;
          const label = { show: !lead || !!g, distance: !perYear && t.small && j % 2 ? (compact ? 17 : 21) : 3,
            backgroundColor: box ? t.accent : t.surface, color: box ? t.onAccent : t.accent };
          if (g && g.length > 1) label.formatter = mergedText(g);
          return { name: m.mark, xAxis: m.year,
            lineStyle: { color: on ? t.accent : t.markLine, width: on ? 1.5 : 1, type: on ? 'solid' : [2, 3] }, label };
        }),
      },
      // the selected year: an ink hairline frame, never a fill, so it cannot read as one more series
      markArea: ev ? { silent: true, itemStyle: { color: 'rgba(0,0,0,0)', borderColor: t.ink, borderWidth: 1 }, data: [[{ xAxis: ev.year }, { xAxis: ev.year + 1 }]] } : { data: [] },
    };
  }
  const markRoom = (t, list, oneRow) => (list && list.length ? (t.small && !oneRow ? 46 : 30) : 10);

  /* ---------- shared axes / tooltip ---------- */
  function tip(t) {
    return { trigger: 'axis', confine: true, className: 'dv-tt', backgroundColor: t.plate, borderColor: t.rule, borderWidth: 1, padding: [8, 10],
      textStyle: { color: t.ink, fontFamily: t.fontUi, fontSize: 12 }, extraCssText: 'box-shadow:none;border-radius:2px',
      axisPointer: { type: 'line', lineStyle: { color: t.ink, width: 1 } } };
  }
  const ttRow = (cls, name, val) => `<div class="dv-tt-row"><i class="dv-tt-key ${cls}"></i>${esc(name)}<span class="dv-num">${val}</span></div>`;
  const agesAt = (ages, i) => (ages ? ages.map(a => a[i]).filter(a => a != null).join(' · ') : '');
  const ttHead = (y, ages, i) => `<b class="dv-num">${y}</b>${ages ? ' · ages <span class="dv-num">' + agesAt(ages, i) + '</span>' : ''}`;
  const yearOf = ps => Math.floor((Array.isArray(ps) ? ps[0] : ps).axisValue);

  // Year value-axis: one band per year [y, y+1), labels every 1/2/5/10/20 years, ages beneath.
  // ageSlots: entity slot per ages row (default 1, 2, ...), so each age wears its person's colour.
  function yearAxis(t, years, ages, plotW, ageSlots, minGap) {
    const y0 = years[0], y1 = years[years.length - 1];
    const perYear = (plotW || t.width) / years.length, need = minGap || (ages ? (t.small ? 44 : 54) : 40);
    const step = [1, 2, 5, 10, 20, 25, 50].find(s => s * perYear >= need) || 50;
    const ticks = [];
    for (let y = Math.ceil((y0 + 1) / step) * step; y <= y1; y += step) ticks.push(y);
    const rich = { y: { color: t.ink, fontSize: 11.5, fontWeight: 500, fontFamily: t.fontUi }, d: { color: t.ink3, fontSize: 10.5 } };
    (ages || []).forEach((_, k) => { rich['a' + k] = { color: slotColor(t, (ageSlots || [])[k] || k + 1), fontSize: 10.5, fontWeight: 600, fontFamily: t.fontUi }; });
    return { type: 'value', min: y0, max: y1 + 1, interval: step,
      axisLine: { show: true, lineStyle: { color: t.ink } }, axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: t.ruleSoft } },
      axisLabel: { customValues: ticks, margin: 8, lineHeight: 14, rich,
        formatter: y => `{y|${y}}` + (ages ? '\n' + ages.map((a, k) => `{a${k}|${a[y - y0] == null ? '' : a[y - y0]}}`).join('{d| · }') : '') } };
  }
  // grid.left 8 on containLabel charts: ECharts measures labels without tabular-nums, which renders a few px wider
  function moneyAxis(t, extra) {
    return Object.assign({ type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: t.ruleSoft } },
      axisLabel: { formatter: v => money(v, { trim: true }), color: t.ink2, fontSize: 11, fontFamily: t.fontUi } }, extra);
  }
  // [year, v] pairs plus a closing point so step:'end' draws the final year's band
  const yearData = (years, arr) => years.map((y, i) => [y, arr[i]]).concat([[years[years.length - 1] + 1, arr[arr.length - 1]]]);
  const yearCols = ages => ['Year'].concat(ages ? ['Ages'] : []);
  const yearRow = (years, ages, i) => [String(years[i])].concat(ages ? [agesAt(ages, i)] : []);
  // filled band between lo[] and hi[], one flat step per year [y, y+1)
  function stepBand(name, years, lo, hi, style, z) {
    return { name, type: 'custom', silent: true, z: z || 2, itemStyle: { color: style.fill }, data: years.map((y, i) => [y, hi[i]]), encode: { x: 0, y: 1 },
      renderItem(p, api) {
        if (p.dataIndex) return null;
        const top = [], bot = [];
        years.forEach((y, i) => { top.push(api.coord([y, hi[i]]), api.coord([y + 1, hi[i]])); bot.push(api.coord([y, lo[i]]), api.coord([y + 1, lo[i]])); });
        return { type: 'polygon', shape: { points: top.concat(bot.reverse()) }, style };
      } };
  }
  // height the legend takes once it wraps at this width (12px labels, 14px key, 16px gaps), so the
  // marks lane always starts below its last line
  function legendRoom(t, names) {
    let rows = 1, x = 0;
    names.forEach(n => { const w = 14 + 5 + String(n).length * 6.6; if (x && x + w > t.width) { rows++; x = 0; } x += w + 16; });
    return rows * 20 + 4;
  }
  const legend = (t, data) => ({ top: 0, left: 0, itemWidth: 14, itemHeight: 10, itemGap: 16, selectedMode: false, data,
    textStyle: { color: t.ink2, fontSize: 12, fontFamily: t.fontUi } });

  // "Salary $412k 2026–2035" style summary of where a series is non-zero
  function runsText(years, vals) {
    const out = [];
    let s = -1;
    for (let i = 0; i <= vals.length; i++) {
      const on = i < vals.length && vals[i] > 0;
      if (on && s < 0) s = i;
      if (!on && s >= 0) { out.push(`${money(vals[s])} ${years[s]}–${years[i - 1]}`); s = -1; }
    }
    return out.length ? out.join(', ') : 'none';
  }

  /* ---------- chart builders: (el | selector, data, {label, slot}) -> ECharts instance ---------- */

  // points: [{date:'2019-03-01', value, label?}]
  DV.history = function (el, points, o) {
    o = o || {};
    const name = p => p.label || p.date, first = points[0], last = points[points.length - 1];
    return mount(el, t => ({
      grid: { left: 8, right: 10, top: 12, bottom: 0, containLabel: true },
      tooltip: Object.assign(tip(t), { formatter: ps => `<b>${esc(name(points[ps[0].dataIndex]))}</b><br><span class="dv-num">${money(ps[0].value[1], { full: true })}</span>` }),
      xAxis: { type: 'time', minInterval: (t.small ? 2 : 1) * 365.25 * 864e5, axisLine: { lineStyle: { color: t.ink } }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { formatter: '{yyyy}', color: t.ink, fontSize: 11, hideOverlap: true } },
      yAxis: moneyAxis(t, { min: 0, splitNumber: 3 }),
      series: [{ type: 'line', data: points.map(p => [p.date, p.value]), symbol: 'none', lineStyle: { color: t.ink, width: 1.5 },
        areaStyle: { color: alpha(t.ink, 0.06) },
        markPoint: { symbol: 'circle', symbolSize: 6, silent: true, itemStyle: { color: t.ink }, label: { show: false }, data: [{ coord: [last.date, last.value] }] } }],
    }), o.label || `Net worth over time: ${money(first.value)} in ${name(first)}, ${money(last.value)} in ${name(last)}`,
    { caption: o.label || 'Net worth over time', columns: ['Date', 'Net worth'], rows: points.map(p => [name(p), money(p.value, { full: true })]) });
  };

  // {years, pct, marks, ages?}
  DV.survivalStrip = function (el, d, o) {
    o = o || {};
    const lo = Math.max(0, Math.floor((Math.min.apply(null, d.pct) - 5) / 10) * 10), y0 = d.years[0];
    return mount(el, t => ({
      grid: { left: 8, right: t.small ? 6 : 10, top: markRoom(t, d.marks), bottom: 0, containLabel: true },
      tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= d.years.length) return '';
        return `${ttHead(y, d.ages, i)}<br>Money lasts in <b class="dv-num">${pct(d.pct[i])}</b> of paths`; } }),
      xAxis: yearAxis(t, d.years, d.ages, t.width - 48, d.ageSlots),
      yAxis: { type: 'value', min: lo, max: 100, interval: (100 - lo) > 40 ? 20 : 10, axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: t.ruleSoft } }, axisLabel: { formatter: v => pct(v), color: t.ink2, fontSize: 10.5, fontFamily: t.fontUi } },
      series: [Object.assign({ type: 'line', data: yearData(d.years, d.pct), step: 'end', symbol: 'none',
        lineStyle: { color: slotColor(t, o.slot || 3), width: 2 }, areaStyle: { color: alpha(slotColor(t, o.slot || 3), 0.1), origin: 'start' } },
      markLayers(t, d.marks, true))],
    }), o.label || `Chance the money lasts, by year: ${pct(d.pct[0])} in ${y0}, ${pct(d.pct[d.pct.length - 1])} in ${d.years[d.years.length - 1]}`,
    { caption: o.label || 'Chance the money lasts, by year', columns: yearCols(d.ages).concat(['Chance money lasts']),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat([pct(d.pct[i])])) });
  };

  // Percentile fan: {years, p5, p25, p50, p75, p95, marks, ages?, ageSlots?, tint?, line?, yTicks?, yMax?}.
  // Nested bands 5th–95th and 25th–75th with the median line over them, in one colour: a person's
  // ribbon ({slot} in the third argument, default 3) or, for a series that is not a person, d.tint (1-5,
  // use an odd step so the median reads on the ground). line: {name, values} overlays one more stepped
  // line (e.g. the single deterministic path) in --dv-line-2, dashed, above the median, with a dashed
  // legend key. yMax caps the value axis: anything above it is clipped at the ceiling and the plot's
  // top-right corner says how far the 5th–95th band continues ("5th–95th continues to $39M by 2076").
  // The tooltip and the hidden data table always keep the full values.
  DV.fan = function (el, d, o) {
    o = o || {};
    const y0 = d.years[0], n = d.years.length, ln = d.line, cap = d.yMax || Infinity;
    const clip = a => a.map(v => Math.min(v, cap));
    const names = ['5th–95th percentile', '25th–75th', 'Median'];
    const top95 = d.p95.reduce((b, v, i) => (v > b.v ? { v, i } : b), { v: -Infinity, i: 0 });
    return mount(el, t => {
      const c = d.tint ? t.tint[(d.tint - 1) % 5] : slotColor(t, o.slot || 3), lc = t.line[1];
      const band = (name, lo, hi, op) => stepBand(name, d.years, clip(lo), clip(hi), { fill: alpha(c, op) });
      const dash = [6, 4];
      const items = [{ name: names[0], icon: 'rect' }, { name: names[1], icon: 'rect' }, { name: names[2], icon: 'path://M0,4h26v2h-26z' }]
        .concat(ln ? [{ name: ln.name, icon: 'path://M0,4h8v2h-8zM11,4h8v2h-8zM22,4h4v2h-4z', itemStyle: { color: lc } }] : []);
      const perYear = (t.width - 60) / n, top = legendRoom(t, items.map(x => x.name)) + markRoom(t, d.marks, true);
      const series = [band(names[0], d.p5, d.p95, 0.16), band(names[1], d.p25, d.p75, 0.3),
        Object.assign({ name: names[2], type: 'line', data: yearData(d.years, clip(d.p50)), step: 'end', symbol: 'none', z: 4,
          itemStyle: { color: c }, lineStyle: { color: c, width: 2 } }, markLayers(t, d.marks, false, null, perYear))];
      // the overlaid line rides on a 4px casing in the chart's surface colour, so its dashes stay legible where
      // it crosses the median and the bands (an engraver's white line, not a glow)
      if (ln) series.push({ type: 'line', data: yearData(d.years, clip(ln.values)), step: 'end', symbol: 'none', z: 5, silent: true,
        lineStyle: { color: t.surface, width: 5 } }, { name: ln.name, type: 'line', data: yearData(d.years, clip(ln.values)), step: 'end', symbol: 'none', z: 6,
        itemStyle: { color: lc }, lineStyle: { color: lc, width: 2, type: dash } });
      const capped = top95.v > cap;
      return {
        legend: Object.assign(legend(t, items), { itemWidth: 26 }),
        grid: { left: 8, right: t.small ? 6 : 12, top, bottom: 0, containLabel: true },
        graphic: capped ? [{ type: 'text', right: t.small ? 8 : 14, top: top + 4, silent: true, z: 10,
          style: { text: `5th–95th continues to ${money(Number(top95.v.toPrecision(2)), { trim: true })} by ${d.years[top95.i]}`, fill: t.ink2,
            font: `500 11px ${t.fontUi}`, backgroundColor: t.surface, padding: [2, 4] } }] : [],
        tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= n) return '';
          const r = (a, b) => `<span class="dv-num">${money(a)} – ${money(b)}</span>`;
          return `${ttHead(y, d.ages, i)}<br>Median <b class="dv-num">${money(d.p50[i])}</b><br>25th–75th ${r(d.p25[i], d.p75[i])}<br>5th–95th ${r(d.p5[i], d.p95[i])}` +
            (ln ? ttRow('dv-line-2', ln.name, money(ln.values[i])) : ''); } }),
        xAxis: yearAxis(t, d.years, d.ages, t.width - 60, d.ageSlots),
        yAxis: moneyAxis(t, Object.assign({ min: 0 }, isFinite(cap) ? { max: cap } : {}, d.yTicks ? { splitNumber: d.yTicks - 1 } : {})),
        series,
      };
    }, o.label || `Projected balance, 5th to 95th percentile: median ${money(d.p50[0])} in ${y0}, ${money(d.p50[n - 1])} in ${d.years[n - 1]}` +
      (ln ? `; ${ln.name} ${money(ln.values[n - 1])} in ${d.years[n - 1]}` : ''),
    { caption: o.label || 'Projected balance by percentile', columns: yearCols(d.ages).concat(['5th', '25th', 'Median', '75th', '95th'], ln ? [ln.name] : []),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat([d.p5[i], d.p25[i], d.p50[i], d.p75[i], d.p95[i]].concat(ln ? [ln.values[i]] : []).map(v => money(v)))) });
  };

  // {years, series:[{name, values, slot}], marks, ages?}
  DV.stacked = function (el, d, o) {
    o = o || {};
    const y0 = d.years[0], n = d.years.length, total = i => d.series.reduce((s, x) => s + (x.values[i] || 0), 0);
    const cum = [d.years.map(() => 0)];
    d.series.forEach((s, k) => cum.push(cum[k].map((v, i) => v + (s.values[i] || 0))));
    return mount(el, t => ({
      legend: legend(t, d.series.map(s => ({ name: s.name, icon: 'rect' }))),
      grid: { left: 8, right: t.small ? 6 : 12, top: legendRoom(t, d.series.map(s => s.name)) + markRoom(t, d.marks, true), bottom: 0, containLabel: true },
      tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= n) return '';
        return ttHead(y, d.ages, i) + d.series.map((s, k) => [s, k]).reverse().map(([s, k]) => ttRow(keyClass(s, k), s.name, money(s.values[i]))).join('') +
          `<div class="dv-tt-row">Total<span class="dv-num">${money(total(i))}</span></div>`; } }),
      xAxis: yearAxis(t, d.years, d.ages, t.width - 60, d.ageSlots),
      yAxis: moneyAxis(t, d.yTicks ? { splitNumber: d.yTicks - 1 } : {}),
      // no stroke between bands: neighbouring tints already differ >= 3:1, and a stroke drew every year's step
      series: d.series.map((s, k) => stepBand(s.name, d.years, cum[k], cum[k + 1], { fill: seriesColor(t, s, k) }))
        // invisible carrier for the axis tooltip and the rehearsal marks
        .concat([Object.assign({ type: 'line', data: yearData(d.years, cum[cum.length - 1]), showSymbol: false, lineStyle: { opacity: 0 }, z: 3 }, markLayers(t, d.marks, false, null, (t.width - 60) / n))]),
    }), o.label || `Balances by type, stacked: total ${money(total(0))} in ${y0}, ${money(total(n - 1))} in ${d.years[n - 1]}`,
    { caption: o.label || 'Balances by type', columns: yearCols(d.ages).concat(d.series.map(s => s.name), ['Total']),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat(d.series.map(s => money(s.values[i])), [money(total(i))])) });
  };

  // The income score. {years, ages:[[..],[..]], ageSlots?, staves:[{name, values, slot | tint, pending?}], marks}
  // A staff with `tint` (not a person: e.g. a tax) takes --dv-tint-N instead of a person's ribbon.
  // One staff per source; band thickness = amount; shared year axis with ages under each year.
  // Narrow (<560px): each staff's name sits above it across the full plot width, drawn with the
  // amounts above the mark lines so the lines stop short of them; colliding letters merge ("D·E").
  // pending: {from, to?, label?} marks years where the source exists but its amount is not known
  // yet; they draw as a hairline in the staff colour, labelled (default "amount pending").
  DV.score = function (el, d, o) {
    o = o || {};
    const y0 = d.years[0], y1 = d.years[d.years.length - 1], S = d.staves;
    const pend = (s, y) => s.pending && y >= s.pending.from && y <= (s.pending.to == null ? y1 : s.pending.to);
    const pendLabel = s => s.pending.label || 'amount pending';
    const cellText = (s, i) => (pend(s, d.years[i]) ? pendLabel(s) : money(s.values[i]));
    const MAX = Math.max.apply(null, S.map(s => Math.max.apply(null, s.values))) || 1;
    return mount(el, t => {
      const sm = t.small, labelW = sm ? 6 : Math.min(200, Math.round(t.width * 0.2));
      const plotW = t.width - labelW - (sm ? 6 : 12), perYear = plotW / d.years.length;
      const rich = { s: { color: t.ink, fontFamily: t.fontUi, fontSize: sm ? 11.5 : 13, lineHeight: 15, padding: [0, 0, 0, 8] } };
      const staffColor = s => (s.tint ? t.tint[(s.tint - 1) % 5] : slotColor(t, s.slot));
      S.forEach((s, i) => { rich['k' + i] = { width: 4, height: 14, backgroundColor: s.tint || s.slot ? staffColor(s) : slotColor(t, i + 1) }; });
      return {
        grid: { left: labelW, right: sm ? 6 : 12, top: markRoom(t, d.marks, sm), bottom: d.ages ? 40 : 26 },
        tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= d.years.length) return '';
          return ttHead(y, d.ages, i) + S.map((s, k) => [s, k]).filter(([s]) => s.values[i] > 0 || pend(s, y))
            .map(([s, k]) => ttRow(keyClass(s, k), s.name, s.values[i] > 0 ? money(s.values[i]) : esc(pendLabel(s)))).join(''); } }),
        xAxis: yearAxis(t, d.years, d.ages, plotW, d.ageSlots, sm ? 60 : 0),
        yAxis: { type: 'category', inverse: true, data: S.map((_, i) => String(i)), axisLine: { show: false }, axisTick: { show: false },
          splitLine: { show: true, lineStyle: { color: t.ruleSoft } },
          axisLabel: { show: !sm, align: 'left', margin: labelW - 2, rich, formatter: (v, i) => `{k${i}|}{s|${S[i].name}}` } },
        series: [
          { type: 'custom', silent: true, z: 2, data: S.map((_, i) => [y0, i]), encode: { x: 0, y: 1 },
            renderItem: (params, api) => ({ type: 'group', children: parts(params, api).kids }) },
          // narrow only: stave names and amounts drawn above the mark lines (markLine draws at z 5),
          // on a ground-coloured strip / their own backing, so the lines stop short of them
          ...(sm ? [{ type: 'custom', silent: true, z: 6, data: S.map((_, i) => [y0, i]), encode: { x: 0, y: 1 },
            renderItem: (params, api) => ({ type: 'group', children: parts(params, api).over }) }] : []),
          // invisible carrier for the axis tooltip and the rehearsal marks
          Object.assign({ type: 'line', data: d.years.map(y => [y + 0.5, 0]), showSymbol: false, lineStyle: { opacity: 0 }, z: 3 },
            markLayers(t, d.marks, sm, 'start', sm ? perYear : 0)),
        ],
      };
      // One staff's shapes: kids under the mark lines; on narrow charts its names and labels go to `over`.
      function parts(params, api) {
              const i = params.dataIndex, vals = S[i].values, col = S[i].tint || S[i].slot ? staffColor(S[i]) : slotColor(t, i + 1);
              // narrow: the name takes the top of the row, the staff sits a little lower with thinner bands
              const rowH = api.size([0, 1])[1], cy = api.coord([y0, i])[1] + (sm ? rowH * 0.16 : 0), maxH = rowH * (sm ? 0.5 : 0.8);
              const th = v => (v <= 0 ? 0 : Math.max(2, v / MAX * maxH)), x = y => api.coord([y, i])[0];
              const top = [], bot = [];
              vals.forEach((v, k) => { const h = th(v) / 2, a = x(y0 + k), b = x(y0 + k + 1); top.push([a, cy - h], [b, cy - h]); bot.push([a, cy + h], [b, cy + h]); });
              const kids = [
                { type: 'line', shape: { x1: x(y0), y1: cy, x2: x(y1 + 1), y2: cy }, style: { stroke: t.staff, lineWidth: 1 } },
                { type: 'polygon', shape: { points: top.concat(bot.reverse()) }, style: { fill: col } },
              ], over = [];
              // a label: under the marks on wide charts; above them on narrow ones, backed so lines break around it
              const lab = (style, back) => (sm ? over.push({ type: 'text', style: Object.assign(style, { backgroundColor: back, padding: [1, 2] }) })
                : kids.push({ type: 'text', style }));
              if (sm) {
                const rowTop = api.coord([y0, i])[1] - rowH / 2, ty = rowTop + 5;
                over.push({ type: 'rect', shape: { x: x(y0), y: rowTop + 1, width: x(y1 + 1) - x(y0), height: 19 }, style: { fill: t.surface } },
                  { type: 'rect', shape: { x: x(y0), y: ty, width: 3, height: 11 }, style: { fill: col } },
                  { type: 'text', style: { text: S[i].name, x: x(y0) + 8, y: ty - 1, verticalAlign: 'top', fill: t.ink, font: `500 11.5px ${t.fontUi}` } });
              }
              // label each run where the amount steps (>1% of the score's max); with labelValues the runs
              // and their labels follow those (e.g. a full-year rate) while the band shows the year's amount
              const lv = S[i].labelValues || vals;
              const starts = lv.map((v, k) => (v > 0 && (k === 0 || Math.abs(v - lv[k - 1]) > MAX * 0.01) ? k : -1)).filter(k => k >= 0);
              starts.forEach((k, j) => {
                const v = vals[k], txt = money(lv[k]), w = txt.length * 6.6 + 8, x0 = x(y0 + k);
                const room = (j + 1 < starts.length ? x(y0 + starts[j + 1]) : x(y1 + 1)) - x0;
                if (room < w) return;
                // inside only if the band itself is wide enough; a short run followed by zeros labels above it
                let e = k + 1;
                while (e < lv.length && lv[e] > 0 && starts[j + 1] !== e) e++;
                const inside = th(v) >= 15 && x(y0 + e) - x0 >= w;
                lab({ text: txt, x: x0 + 5, y: inside ? cy : cy - th(v) / 2 - 3, verticalAlign: inside ? 'middle' : 'bottom',
                  fill: inside ? t.onEntity : t.ink, font: `600 11px ${t.fontUi}` }, inside ? col : t.surface);
              });
              const p = S[i].pending;
              if (p) {
                const a = x(Math.max(y0, p.from)), b = x((p.to == null ? y1 : Math.min(y1, p.to)) + 1);
                // the label steps past any rehearsal-mark line it would cross
                const txt = pendLabel(S[i]), w = txt.length * 5.9 + 6;
                let lx = a + 5;
                (d.marks || []).map(m => x(m.year)).sort((u, v) => u - v).forEach(mx => { if (mx > lx - 3 && mx < lx + w && mx + 5 + w <= b) lx = mx + 5; });
                kids.push({ type: 'line', shape: { x1: a, y1: cy, x2: b, y2: cy }, style: { stroke: col, lineWidth: 1.5 } });
                lab({ text: txt, x: lx, y: cy - 4, verticalAlign: 'bottom', fill: t.ink2, font: `500 11px ${t.fontUi}` }, t.surface);
              }
              return { kids, over };
      }
    }, o.label || `Income score, ${y0} to ${y1}. ` + S.map(s => `${s.name}: ${runsText(d.years, s.values)}` +
      (s.pending ? `; ${pendLabel(s)} from ${s.pending.from}` : '')).join('. '),
    { caption: o.label || `Income by source, ${y0} to ${y1}`, columns: yearCols(d.ages).concat(S.map(s => s.name)),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat(S.map(s => cellText(s, i)))) });
  };

  // Several non-person series on one year axis as stepped lines (e.g. scenarios compared), not stacked.
  // {years, series:[{name, values}], marks, ages?, ageSlots?, yTicks?}. Series k takes --dv-line-k and
  // a dash pattern (solid, dashed, dotted, dash-dot), all one weight, and is named at its line end;
  // names that would collide are nudged apart. Marks ride on the first series.
  const DASH = ['solid', [7, 4], [2, 3], [9, 3, 2, 3]];
  DV.lines = function (el, d, o) {
    o = o || {};
    const y0 = d.years[0], n = d.years.length, last = s => s.values[n - 1];
    return mount(el, t => {
      const col = k => t.line[k % 4], endW = t.small ? 92 : 150;
      return {
        grid: { left: 8, right: endW, top: 6 + markRoom(t, d.marks, true), bottom: 0, containLabel: true },
        tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= n) return '';
          return ttHead(y, d.ages, i) + d.series.map((s, k) => ttRow('dv-line-' + (k % 4 + 1), s.name, money(s.values[i]))).join(''); } }),
        xAxis: yearAxis(t, d.years, d.ages, t.width - 60 - endW, d.ageSlots),
        yAxis: moneyAxis(t, Object.assign({ min: 0 }, d.yTicks ? { splitNumber: d.yTicks - 1 } : {})),
        // end labels: ECharts' label layout shifts colliding ones vertically
        labelLayout: { moveOverlap: 'shiftY' },
        series: d.series.map((s, k) => Object.assign({ name: s.name, type: 'line', step: 'end', symbol: 'none', data: yearData(d.years, s.values),
          itemStyle: { color: col(k) }, lineStyle: { color: col(k), width: 2, type: DASH[k % 4] }, z: 4 - k % 4,
          endLabel: { show: true, distance: 6,
            formatter: () => `{n|${wrapName(s.name, t.small ? 13 : 22)}}\n{v|${money(last(s))}}`,
            rich: { n: { color: t.ink, fontFamily: t.fontUi, fontSize: 11.5, lineHeight: 13 }, v: { color: t.ink2, fontFamily: t.fontFig, fontSize: 11.5, lineHeight: 13 } } } },
        k ? {} : markLayers(t, d.marks, false, null, (t.width - 60 - endW) / n))),
      };
    }, o.label || 'Lines by year: ' + d.series.map(s => `${s.name} ${money(s.values[0])} in ${y0}, ${money(last(s))} in ${d.years[n - 1]}`).join('; '),
    { caption: o.label || 'Lines by year', columns: yearCols(d.ages).concat(d.series.map(s => s.name)),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat(d.series.map(s => money(s.values[i])))) });
  };
  const wrapName = (name, n) => { const out = []; String(name).split(' ').forEach(w => { const l = out.length - 1; if (l >= 0 && (out[l] + ' ' + w).length <= n) out[l] += ' ' + w; else out.push(w); }); return out.join('}\n{n|'); };

  // Day-by-day counts (visitors, sign-ins): {dates:['2026-10-03', …], series:[{name, values}],
  // band?:{lo:[], hi:[], name?}, yTicks?, labels?}. labels replaces the 'Oct 3' axis text (e.g. monthly 'Oct ’26'). One series without a band draws as a filled area; otherwise lines
  // in --dv-line-k with DV.lines' dash patterns and a legend. band shades a normal range behind the
  // data (default name "Normal range"). Values are counts, formatted with DV.fmt.count.
  // Since 0.8.2: d.pointLabels prints each point's value above it (labels that would collide are
  // dropped); a series may take `color` (a custom property name such as '--series-3', read at draw
  // time, or a colour) and `dash` (0-3, a DASH step), for more than four lines; o.format formats
  // values in labels, tooltip and table (default count).
  DV.daily = function (el, d, o) {
    o = o || {};
    const n = d.dates.length, labels = d.labels || d.dates.map(day), solo = d.series.length === 1;
    const b = d.band, bandName = b && (b.name || 'Normal range'), fmt = o.format || count;
    return mount(el, t => {
      const col = k => { const c = d.series[k].color; return c ? (c.startsWith('--') ? t.cssVar(c) : c) : t.line[k % 4]; };
      const dash = k => DASH[d.series[k].dash != null ? d.series[k].dash % 4 : (d.series[k].color ? 0 : k % 4)];
      const series = [];
      if (b) { // stacked pair: an invisible floor at lo, then the range (hi − lo) filled on top of it
        const quiet = { type: 'line', stack: 'dv-band', silent: true, symbol: 'none', lineStyle: { opacity: 0 }, z: 1 };
        series.push(Object.assign({ name: 'dv-band-floor', data: b.lo }, quiet),
          Object.assign({ name: bandName, data: b.hi.map((h, i) => h - b.lo[i]), areaStyle: { color: alpha(t.ink3, 0.14) } }, quiet));
      }
      d.series.forEach((s, k) => series.push({ name: s.name, type: 'line', data: s.values, z: 4 - k % 4,
        symbol: d.pointLabels ? 'circle' : 'none', symbolSize: 5, showSymbol: !!d.pointLabels,
        itemStyle: { color: col(k) }, lineStyle: { color: col(k), width: 2, type: dash(k) },
        label: { show: !!d.pointLabels, position: 'top', distance: 6, formatter: p => fmt(p.value),
          color: t.ink2, fontSize: 11, fontWeight: 500, fontFamily: t.fontUi },
        labelLayout: { hideOverlap: true },
        areaStyle: solo && !b ? { color: alpha(col(k), 0.12) } : undefined }));
      return {
        grid: { left: 8, right: 12, top: (solo ? 12 : legendHeight(t, d.series.map(s => s.name)) + 8) + (d.pointLabels ? 14 : 0), bottom: 0, containLabel: true },
        legend: solo ? { show: false } : legend(t, d.series.map(s => s.name)),
        // nodes, not an HTML string: a key's colour may be arbitrary, and style="" breaks the strict CSP
        tooltip: Object.assign(tip(t), { formatter: ps => { const i = ps[0].dataIndex, box = document.createElement('div');
          box.appendChild(document.createElement('b')).textContent = labels[i];
          const row = (name, v, c, cls) => { const r = box.appendChild(document.createElement('div')); r.className = 'dv-tt-row';
            const key = r.appendChild(document.createElement('i')); key.className = 'dv-tt-key' + (cls ? ' ' + cls : ''); if (c) key.style.background = c;
            r.appendChild(document.createTextNode(name)); const nn = r.appendChild(document.createElement('span')); nn.className = 'dv-num'; nn.textContent = v; };
          d.series.forEach((s, k) => row(s.name, fmt(s.values[i]), col(k)));
          if (b) row(bandName, `${fmt(b.lo[i])}–${fmt(b.hi[i])}`, null, 'dv-band');
          return box; } }),
        // pointLabels insets the points half a step from each edge, so the first and last values are
        // neither clipped nor drawn over the value axis; otherwise the line runs edge to edge.
        xAxis: { type: 'category', boundaryGap: !!d.pointLabels, data: labels, axisLine: { lineStyle: { color: t.ink } }, axisTick: { show: false },
          // first and last labels sit inside the plot, not centred on its edges where they were clipped
          axisLabel: Object.assign({ color: t.ink, fontSize: 11, hideOverlap: true },
            d.pointLabels ? {} : { alignMinLabel: 'left', alignMaxLabel: 'right' }) },
        yAxis: Object.assign({ type: 'value', min: 0, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: t.ruleSoft } },
          axisLabel: { formatter: v => count(v, { compact: true }), color: t.ink2, fontSize: 11, fontFamily: t.fontUi } }, d.yTicks ? { splitNumber: d.yTicks - 1 } : {}),
        series,
      };
    }, o.label || 'Daily: ' + d.series.map(s => `${s.name} ${fmt(s.values[0])} on ${labels[0]}, ${fmt(s.values[n - 1])} on ${labels[n - 1]}`).join('; '),
    { caption: o.label || 'Daily', columns: ['Date'].concat(d.series.map(s => s.name), b ? [bandName] : []),
      rows: labels.map((l, i) => [l].concat(d.series.map(s => fmt(s.values[i])), b ? [`${fmt(b.lo[i])}–${fmt(b.hi[i])}`] : [])) });
  };

  /* ---------- DV.bars: bars on a category axis ---------- */
  // d = { labels: [..], series: [{ name, values, slot | tint | color }], horizontal?, stacked?, valueLabels?, yTicks?, secondary? }
  // secondary: booleans aligned to labels; those bars draw in a lighter tone with muted labels, for
  // rows that break down the bar above them (an expanded group's members).
  // labelClicks: category-axis labels emit 'click' (params.componentType 'xAxis'/'yAxis', params.value the
  // label), so a label can act like its bar. Off by default, since it gives every label a pointer cursor.
  // o = { label, format(v) (default count), category (table's first column, default 'Item') }
  // Vertical by default; `horizontal` ranks top-down in the given order, with long names truncated to fit.
  // `valueLabels` prints each bar's value past its end (not with `stacked`). A series colour is its
  // `slot` (a person), `tint` (not a person) or `color`: a custom property name such as '--series-3',
  // read at draw time so it follows the theme. With none of those, series take --dv-line-1..4.
  // Height of a wrapped legend, measured with the real font rather than legendRoom()'s
  // per-character guess, which ran short in narrow cards and let the legend sit on the plot.
  let measureCtx = null;
  function legendHeight(t, names) {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    measureCtx.font = '12px ' + t.fontUi;
    let rows = 1, x = 0;
    names.forEach(n => { const w = 14 + 5 + measureCtx.measureText(String(n)).width; if (x && x + w > t.width - 10) { rows++; x = 0; } x += w + 16; });
    return rows * 28; // a row as ECharts draws it here; the 10 is the legend's own padding
  }

  DV.bars = function (el, d, o) {
    o = o || {};
    const fmt = o.format || count, hz = !!d.horizontal, stack = !!d.stacked && d.series.length > 1;
    const total = i => d.series.reduce((a, s) => a + (s.values[i] || 0), 0);
    const showLabels = !!d.valueLabels && !stack;
    return mount(el, t => {
      const col = (s, k) => (s.slot || s.tint ? seriesColor(t, s, k) : s.color ? (s.color.startsWith('--') ? t.cssVar(s.color) : s.color) : t.line[k % 4]);
      const end = hz ? [0, 4, 4, 0] : [4, 4, 0, 0];
      const sec = i => !!(d.secondary && d.secondary[i]);
    const cat = { type: 'category', inverse: hz,
        data: d.labels.map((l, i) => (sec(i) ? { value: l, textStyle: { color: t.ink2 } } : l)), axisTick: { show: false },
        axisLine: { show: !hz, lineStyle: { color: t.ink } },
        triggerEvent: !!d.labelClicks,
        axisLabel: Object.assign({ color: t.ink, fontSize: 11, fontFamily: t.fontUi, hideOverlap: !hz },
          hz ? { width: t.small ? 110 : 260, overflow: 'truncate' } : {}) };
      const val = Object.assign({ type: 'value', min: 0, axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: t.ruleSoft } },
        axisLabel: { formatter: v => fmt(v), color: t.ink2, fontSize: 11, fontFamily: t.fontUi, hideOverlap: true } },
        d.yTicks ? { splitNumber: d.yTicks - 1 } : hz && t.width < 480 ? { splitNumber: 3 } : {});
      const multi = d.series.length > 1;
      return {
        grid: { left: 8, right: showLabels && hz ? 56 : 12, top: multi ? legendHeight(t, d.series.map(s => s.name)) + 8 : (showLabels && !hz ? 22 : 10), bottom: 0, containLabel: true },
        legend: multi ? legend(t, d.series.map(s => ({ name: s.name, icon: 'rect' }))) : { show: false },
        // Built as nodes, not an HTML string: key colours are arbitrary here, and a style="" attribute
        // would break under the strict CSP the demo is checked against (CSSOM writes are allowed).
        tooltip: Object.assign(tip(t), { axisPointer: { type: 'shadow', shadowStyle: { color: alpha(t.ink, 0.06) } }, formatter: ps => {
          const i = ps[0].dataIndex, box = document.createElement('div'), head = box.appendChild(document.createElement('b'));
          head.textContent = d.labels[i];
          const row = (name, v, c) => {
            const r = box.appendChild(document.createElement('div'));
            r.className = 'dv-tt-row';
            if (c) { const key = r.appendChild(document.createElement('i')); key.className = 'dv-tt-key'; key.style.background = c; }
            r.appendChild(document.createTextNode(name));
            const n = r.appendChild(document.createElement('span')); n.className = 'dv-num'; n.textContent = fmt(v);
          };
          d.series.forEach((s, k) => { if (!multi || s.values[i]) row(s.name, s.values[i], col(s, k)); });
          if (stack) row('Total', total(i));
          return box; } }),
        xAxis: hz ? val : cat,
        yAxis: hz ? cat : val,
        series: d.series.map((s, k) => ({ name: s.name, type: 'bar', stack: stack ? 'dv' : undefined,
          data: s.values.map((v, i) => (sec(i) ? { value: v, itemStyle: { color: alpha(col(s, k), 0.45) } } : v)),
          barMaxWidth: hz ? 18 : 48, barGap: '12%',
          // a surface-coloured edge keeps 2px between stacked segments; only unstacked bars get the rounded data end
          itemStyle: { color: col(s, k), borderRadius: stack ? 0 : end, borderColor: stack ? t.surface : undefined, borderWidth: stack ? 1 : 0 },
          emphasis: { disabled: true },
          label: { show: showLabels, position: hz ? 'right' : 'top', distance: 6, formatter: p => fmt(p.value),
            color: t.ink2, fontSize: 12, fontWeight: 500, fontFamily: t.fontUi } })),
      };
    }, o.label || 'Bars: ' + d.labels.slice(0, 3).map((l, i) => `${l} ${fmt(total(i))}`).join(', ') + (d.labels.length > 3 ? ', …' : ''),
    { caption: o.label || 'Bars', columns: [o.category || 'Item'].concat(d.series.map(s => s.name), stack ? ['Total'] : []),
      rows: d.labels.map((l, i) => [l].concat(d.series.map(s => fmt(s.values[i] || 0)), stack ? [fmt(total(i))] : [])) });
  };

  /* ---------- DV.live: a sliding time window over streaming points ---------- */
  // d = { series: [{ name, points: [[tMs, v], ...], line?: 1-4 }], window: seconds (600), max?, format?(v), holdMax?: seconds (90) }
  // o = { label, compact, fps, gutter }. gutter (px, default 64) is the value-label column on the right: a fixed
  // width, not containLabel, so charts stacked in a column end at the same x whatever their labels say.
  // Returns the ECharts instance with .push(seriesIndex, [tMs, v]) attached.
  // The window slides on one shared animation loop, only while the chart is on screen and the tab is visible.
  // Canvas, not SVG: redrawing SVG paths many times a second is what would cost a phone.
  const lives = new Map(); // el -> live state
  let looping = false;
  const io = root.IntersectionObserver ? new IntersectionObserver(es => es.forEach(e => {
    const L = lives.get(e.target); if (L) L.visible = e.isIntersecting; if (e.isIntersecting) startLoop();
  })) : null;
  function liveData(L, now) { return L.series.map(s => held(s.points, now, L.holdMax)); }
  function slide(L, now) {
    L.now = now; L.last = now;
    L.chart.setOption({ xAxis: { min: now - L.win, max: now }, series: liveData(L, now).map(data => ({ data })) }, { lazyUpdate: false, silent: true });
  }
  function startLoop() { if (!looping && !reduced()) { looping = true; requestAnimationFrame(tick); } }
  function tick() {
    const now = Date.now();
    let any = false;
    lives.forEach((L, el) => {
      if (!el.isConnected) { lives.delete(el); if (io) io.unobserve(el); return; }
      if (!L.visible) return;
      any = true;
      if (now - L.last >= 1000 / L.fps) slide(L, now);
    });
    if (any && !document.hidden && !reduced()) requestAnimationFrame(tick); else looping = false;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startLoop(); });
  function liveTable(L) {
    return { caption: L.label, columns: ['Series', 'Latest', 'Low', 'High'], rows: L.series.map(s => {
      const v = s.points.map(p => p[1]);
      return [s.name, v.length ? L.format(v[v.length - 1]) : '—', v.length ? L.format(Math.min.apply(null, v)) : '—', v.length ? L.format(Math.max.apply(null, v)) : '—'];
    }) };
  }

  DV.live = function (el, d, o) {
    o = o || {};
    if (typeof el === 'string') el = document.querySelector(el);
    const compact = !!o.compact, win = (d.window || 600) * 1e3;
    el.classList.toggle('dv-compact', compact);
    const L = lives.get(el) || { visible: !io, last: 0 };
    Object.assign(L, { win, compact, fps: o.fps || (compact ? 8 : 30), holdMax: (d.holdMax || 90) * 1e3,
      format: d.format || (v => count(v)), now: Date.now(),
      series: d.series.map(s => ({ name: s.name, line: s.line, points: trim(s.points.slice(), Date.now(), win) })) });
    L.label = o.label || 'Live: ' + L.series.map(s => s.name + ' ' + (s.points.length ? L.format(s.points[s.points.length - 1][1]) : 'no data')).join('; ');
    const chart = mount(el, t => {
      const col = (s, k) => t.line[((s.line || k + 1) - 1) % 4];
      return {
        animation: false,
        grid: compact ? { left: 0, right: 0, top: 2, bottom: 0 } : { left: 0, right: o.gutter || 64, top: 10, bottom: 22 },
        tooltip: compact ? { show: false } : Object.assign(tip(t), { formatter: ps => `<b>${ago(ps[0].axisValue, L.now, L.win)}</b>` +
          ps.map(p => ttRow('dv-line-' + (((L.series[p.seriesIndex].line || p.seriesIndex + 1) - 1) % 4 + 1), p.seriesName, L.format(p.value[1]))).join('') }),
        xAxis: { type: 'time', min: L.now - L.win, max: L.now, show: !compact, splitNumber: t.small ? 3 : 5,
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: t.ink2, fontSize: 11, fontFamily: t.fontUi, hideOverlap: true, alignMinLabel: 'left', alignMaxLabel: 'right',
            formatter: v => new Date(v).toLocaleTimeString([], L.win <= 120e3 ? { hour: 'numeric', minute: '2-digit', second: '2-digit' } : { hour: 'numeric', minute: '2-digit' }) } },
        yAxis: { type: 'value', min: 0, max: d.max, show: !compact, position: 'right', splitNumber: 2,
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: t.ruleSoft } },
          axisLabel: { color: t.ink2, fontSize: 11, fontFamily: t.fontUi, formatter: v => L.format(v) } },
        series: L.series.map((s, k) => ({ name: s.name, type: 'line', showSymbol: false, smooth: 0.25, smoothMonotone: 'x',
          data: held(s.points, L.now, L.holdMax), z: 4 - k % 4, itemStyle: { color: col(s, k) },
          lineStyle: { color: col(s, k), width: compact ? 1.5 : 2 },
          areaStyle: { color: new root.echarts.graphic.LinearGradient(0, 0, 0, 1,
            [{ offset: 0, color: alpha(col(s, k), L.series.length > 1 ? 0.18 : 0.35) }, { offset: 1, color: alpha(col(s, k), 0) }]) } })),
      };
    }, L.label, liveTable(L), 'canvas');
    L.chart = chart;
    if (!lives.has(el)) {
      lives.set(el, L);
      if (io) io.observe(el);
      chart.push = (i, p) => {
        const s = L.series[i]; if (!s) return;
        s.points.push(p);
        s.points = trim(s.points, Date.now(), L.win);
        DV.table(el, liveTable(L));
        if (reduced() || !L.visible) slide(L, Date.now()); else startLoop();
      };
    }
    startLoop();
    return chart;
  };

  // Cash flow. {nodes:[{name, slot?|tint?}], links:[{source, target, value}]}, names unique.
  // Sources (no incoming link) sit left with labels on their left, sinks right with labels on their
  // right, anything between (a hub) carries its label above. Nodes keep the given order. People take
  // their ribbon slot; everything else passes tint 1-5. Narrow charts wrap labels into the margins.
  // greedy word wrap to at most n characters a line (labels the SVG renderer cannot wrap itself)
  function wrap(text, n) {
    const out = [];
    String(text).split(' ').forEach(w => { const l = out.length - 1; if (l >= 0 && (out[l] + ' ' + w).length <= n) out[l] += ' ' + w; else out.push(w); });
    return out;
  }
  DV.sankey = function (el, d, o) {
    o = o || {};
    const into = new Set(d.links.map(l => l.target)), from = new Set(d.links.map(l => l.source));
    const side = n => (!into.has(n.name) ? 'left' : !from.has(n.name) ? 'right' : 'mid');
    const flow = n => Math.max(...['source', 'target'].map(k => d.links.filter(l => l[k] === n.name).reduce((s, l) => s + l.value, 0)));
    const total = d.links.filter(l => !into.has(l.source)).reduce((s, l) => s + l.value, 0);
    const hasMid = d.nodes.some(n => side(n) === 'mid');
    return mount(el, t => {
      const sm = t.small, marg = sm ? Math.round(t.width * 0.3) : Math.min(220, Math.round(t.width * 0.22));
      const col = n => (n.tint ? t.tint[(n.tint - 1) % 5] : n.slot ? slotColor(t, n.slot) : t.ink3);
      const rich = { n: { color: t.ink, fontFamily: t.fontUi, fontSize: sm ? 11 : 12, lineHeight: sm ? 13 : 15 },
        v: { color: t.ink2, fontFamily: t.fontFig, fontSize: sm ? 11 : 12, lineHeight: sm ? 13 : 15 } };
      return {
        tooltip: { trigger: 'item', confine: true, className: 'dv-tt', backgroundColor: t.plate, borderColor: t.rule, borderWidth: 1, padding: [8, 10],
          textStyle: { color: t.ink, fontFamily: t.fontUi, fontSize: 12 }, extraCssText: 'box-shadow:none;border-radius:2px',
          formatter: p => (p.dataType === 'edge'
            ? `${esc(p.data.source)} → ${esc(p.data.target)}<br><b class="dv-num">${money(p.data.value, { full: true })}</b>`
            : `<b>${esc(p.name)}</b><br><span class="dv-num">${money(p.value, { full: true })}</span>`) },
        series: [{
          type: 'sankey', left: marg, right: marg, top: hasMid ? 40 : 8, bottom: 34, nodeWidth: sm ? 8 : 10, nodeGap: sm ? 14 : 16,
          nodeAlign: 'justify', layoutIterations: 0, draggable: false, animation: false,
          // Small adjacent nodes put their two-line labels on top of each other. Labels arrive in data
          // order, which is top-to-bottom within a column, so each side keeps the bottom of the last
          // label it placed and nudges the next one down just enough to clear it.
          labelLayout: (() => {
            let prev = Infinity, bottom = {};
            return p => {
              if (p.dataIndex <= prev) bottom = {};
              prev = p.dataIndex;
              const n = d.nodes[p.dataIndex], s = n && side(n);
              if (!s || s === 'mid') return {};
              const r = p.labelRect, dy = Math.max(0, (bottom[s] == null ? -Infinity : bottom[s] + 3) - r.y);
              bottom[s] = r.y + dy + r.height;
              return { dy };
            };
          })(),
          emphasis: { focus: 'adjacency' }, lineStyle: { color: 'source', opacity: 0.32, curveness: 0.5 },
          data: d.nodes.map(n => {
            const s = side(n), w = marg - 10;
            return { name: n.name, itemStyle: { color: col(n), borderWidth: 0 },
              // names wrap to the margin width on their own line; the amount always gets its own line
              label: { position: s === 'mid' ? 'top' : s, distance: 6, rich, align: s === 'left' ? 'right' : s === 'right' ? 'left' : 'center',
                formatter: p => wrap(p.name, s === 'mid' ? 99 : Math.max(8, Math.floor(w / (sm ? 6 : 6.6)))).map(x => `{n|${x}}`).join('\n') + `\n{v|${money(p.value)}}` } };
          }),
          // a flow takes the colour of the source it comes from, or of the use it goes to
          links: d.links.map(l => Object.assign({ lineStyle: { color: into.has(l.source) ? 'target' : 'source' } }, l)),
        }],
      };
    }, o.label || `Cash flow: ${money(total)} in from ${d.nodes.filter(n => side(n) === 'left').length} sources. ` +
      d.nodes.filter(n => side(n) === 'right').map(n => `${n.name} ${money(flow(n))}`).join(', '),
    { caption: o.label || 'Cash flow', columns: ['From', 'To', 'Amount'], rows: d.links.map(l => [l.source, l.target, money(l.value, { full: true })]) });
  };

  // A nested { name, value, children } tree as nested boxes sized by value. Each top-level branch takes the
  // next entity colour; deeper boxes keep it. The chart shows o.depth levels at once (default 2): click a box
  // to zoom into it, the breadcrumb climbs back. Values are formatted with o.format (default DV.fmt.count).
  // A parent's value must be at least the sum of its children's; any excess is its own share.
  DV.treemap = function (el, tree, o) {
    o = o || {};
    const f = o.format || (v => count(v)), top = (tree.children || []).filter(c => c.value > 0).sort((a, b) => b.value - a.value);
    const total = tree.value != null ? tree.value : top.reduce((s, c) => s + c.value, 0);
    const pathOf = p => (p.treePathInfo || []).slice(1).map(x => x.name);
    return mount(el, t => {
      const sm = t.small, text = { color: t.onEntity, fontFamily: t.fontUi, fontSize: sm ? 10 : 11 };
      return {
        tooltip: { trigger: 'item', confine: true, className: 'dv-tt', backgroundColor: t.plate, borderColor: t.rule, borderWidth: 1, padding: [8, 10],
          textStyle: { color: t.ink, fontFamily: t.fontUi, fontSize: 12 }, extraCssText: 'box-shadow:none;border-radius:2px',
          formatter: p => {
            const path = pathOf(p), up = (p.treePathInfo || [])[path.length - 1];
            const share = up && up.value ? ` · ${pct(p.value / up.value * 100)} of ${esc(up.name)}` : '';
            return `<b>${path.map(esc).join(' / ') || esc(tree.name)}</b><br><span class="dv-num">${f(p.value)}</span>${share}`;
          } },
        series: [{
          type: 'treemap', name: tree.name, roam: false, nodeClick: 'zoomToNode', leafDepth: o.depth || 2, animation: false,
          top: 0, left: 0, right: 0, bottom: 30, visibleMin: 64, childrenVisibleMin: 900, squareRatio: 1.2,
          breadcrumb: { show: true, left: 0, bottom: 0, height: 22, emptyItemWidth: 16,
            itemStyle: { color: t.plate, borderColor: t.rule, borderWidth: 1, shadowBlur: 0, textStyle: { color: t.ink, fontFamily: t.fontUi, fontSize: 12 } },
            emphasis: { itemStyle: { color: t.accentWash, textStyle: { color: t.ink } } } },
          // names over values; ECharts drops a label that does not fit its box
          label: Object.assign({ show: true, position: 'insideTopLeft', overflow: 'truncate', ellipsis: '…',
            formatter: p => `${p.name}\n${f(p.value)}` }, text),
          upperLabel: Object.assign({ show: true, height: sm ? 18 : 20, overflow: 'truncate', ellipsis: '…',
            formatter: p => `${p.name}  ${f(p.value)}` }, text, { fontWeight: 600 }),
          // every level's header band is a shade of its own colour; a fixed border colour left levels past
          // the ones listed below with a white band and white, invisible names
          itemStyle: { borderColorSaturation: 0.5, borderWidth: 1, gapWidth: 1 },
          levels: [
            { itemStyle: { borderWidth: 0, gapWidth: 3 }, upperLabel: { show: false } },
            { itemStyle: { borderWidth: 3, gapWidth: 1, borderColorSaturation: 0.45 } },
            { itemStyle: { borderWidth: 1, gapWidth: 1, borderColorSaturation: 0.6 }, colorSaturation: [0.3, 0.55] },
          ],
          data: top.map((c, k) => Object.assign({}, c, { itemStyle: { color: slotColor(t, k + 1) } })),
        }],
      };
    }, o.label || `${tree.name}: ${f(total)} in ${top.length} parts. Largest: ` +
      top.slice(0, 3).map(c => `${c.name} ${f(c.value)}`).join(', '),
    { caption: o.label || tree.name, columns: ['Part', 'Size', 'Share'],
      rows: top.map(c => [c.name, f(c.value), total ? pct(c.value / total * 100, { digits: 1 }) : '—']) });
  };

  DV.theme = theme;
  DV.redraw = queue;

  /* ---------- follow the scheme, data-theme and late-loading fonts ---------- */
  if (root.matchMedia) {
    const mq = root.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', queue);
  }
  new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  if (document.fonts) {
    document.fonts.addEventListener('loadingdone', queue);
    ['400 12px "Public Sans"', '600 12px "Public Sans"', '600 12px "Source Serif 4"'].forEach(f => document.fonts.load(f).catch(() => {}));
  }

  root.DV = DV;
})(typeof window !== 'undefined' ? window : globalThis);
