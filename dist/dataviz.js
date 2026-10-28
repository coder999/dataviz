/*! coder999/dataviz v0.2.3 · "Full Score" ECharts builders · MIT
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

  const DV = { version: '0.2.3', fmt: { money, pct } };
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
    opt.animation = !!animate && !reduced();
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

  function mount(el, build, label, table) {
    if (typeof el === 'string') el = document.querySelector(el);
    el.classList.add('dv-chart');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
    let e = charts.get(el);
    if (!e) {
      const chart = root.echarts.getInstanceByDom(el) || root.echarts.init(el, null, { renderer: 'svg' });
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
  // merge into one box ("D·E") on the first mark's line. Every line still draws; tapping a merged
  // box selects its first mark, and it fills when any of its marks is active. Without perYear,
  // narrow charts stagger the letters in two tiers.
  function markLayers(t, list, compact, pos, perYear) {
    if (!list || !list.length) return {};
    list.forEach(m => known.set(m.mark, m));
    const act = marks.active, ev = list.find(m => m.mark === act);
    let lead = null; // first mark of each merged group -> its letters
    if (perYear) {
      lead = new Map();
      const half = n => (n * 7 + (n - 1) * 7 + 8) / 2; // box half-width for n letters at the compact size
      let g = null;
      list.slice().sort((a, b) => a.year - b.year).forEach(m => {
        if (g && (m.year - g[0].year) * perYear < half(g.length) + half(1) + 4) g.push(m);
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
          if (g && g.length > 1) label.formatter = g.map(x => x.mark).join('·');
          return { name: m.mark, xAxis: m.year,
            lineStyle: { color: on ? t.accent : t.markLine, width: on ? 1.5 : 1, type: on ? 'solid' : [2, 3] }, label };
        }),
      },
      markArea: ev ? { silent: true, itemStyle: { color: alpha(t.accent, 0.1) }, data: [[{ xAxis: ev.year }, { xAxis: ev.year + 1 }]] } : { data: [] },
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

  // {years, p5, p25, p50, p75, p95, marks, ages?}
  DV.fan = function (el, d, o) {
    o = o || {};
    const y0 = d.years[0], n = d.years.length;
    const names = ['5th–95th percentile', '25th–75th', 'Median'];
    return mount(el, t => {
      const c = slotColor(t, o.slot || 3);
      const band = (name, lo, hi, op) => stepBand(name, d.years, lo, hi, { fill: alpha(c, op) });
      return {
        legend: legend(t, [{ name: names[0], icon: 'rect' }, { name: names[1], icon: 'rect' }, { name: names[2] }]),
        grid: { left: 8, right: t.small ? 6 : 12, top: 24 + markRoom(t, d.marks), bottom: 0, containLabel: true },
        tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= n) return '';
          const r = (a, b) => `<span class="dv-num">${money(a)} – ${money(b)}</span>`;
          return `${ttHead(y, d.ages, i)}<br>Median <b class="dv-num">${money(d.p50[i])}</b><br>25th–75th ${r(d.p25[i], d.p75[i])}<br>5th–95th ${r(d.p5[i], d.p95[i])}`; } }),
        xAxis: yearAxis(t, d.years, d.ages, t.width - 60, d.ageSlots),
        yAxis: moneyAxis(t),
        series: [band(names[0], d.p5, d.p95, 0.16), band(names[1], d.p25, d.p75, 0.3),
          Object.assign({ name: names[2], type: 'line', data: yearData(d.years, d.p50), step: 'end', symbol: 'none', z: 4,
            itemStyle: { color: c }, lineStyle: { color: c, width: 2 } }, markLayers(t, d.marks, false))],
      };
    }, o.label || `Projected balance, 5th to 95th percentile: median ${money(d.p50[0])} in ${y0}, ${money(d.p50[n - 1])} in ${d.years[n - 1]}`,
    { caption: o.label || 'Projected balance by percentile', columns: yearCols(d.ages).concat(['5th', '25th', 'Median', '75th', '95th']),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat([d.p5[i], d.p25[i], d.p50[i], d.p75[i], d.p95[i]].map(v => money(v)))) });
  };

  // {years, series:[{name, values, slot}], marks, ages?}
  DV.stacked = function (el, d, o) {
    o = o || {};
    const y0 = d.years[0], n = d.years.length, total = i => d.series.reduce((s, x) => s + (x.values[i] || 0), 0);
    const cum = [d.years.map(() => 0)];
    d.series.forEach((s, k) => cum.push(cum[k].map((v, i) => v + (s.values[i] || 0))));
    return mount(el, t => ({
      legend: legend(t, d.series.map(s => ({ name: s.name, icon: 'rect' }))),
      grid: { left: 8, right: t.small ? 6 : 12, top: (t.small && d.series.length > 3 ? 44 : 24) + markRoom(t, d.marks), bottom: 0, containLabel: true },
      tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= n) return '';
        return ttHead(y, d.ages, i) + d.series.map((s, k) => [s, k]).reverse().map(([s, k]) => ttRow(keyClass(s, k), s.name, money(s.values[i]))).join('') +
          `<div class="dv-tt-row">Total<span class="dv-num">${money(total(i))}</span></div>`; } }),
      xAxis: yearAxis(t, d.years, d.ages, t.width - 60, d.ageSlots),
      yAxis: moneyAxis(t, d.yTicks ? { splitNumber: d.yTicks - 1 } : {}),
      // no stroke between bands: neighbouring tints already differ >= 3:1, and a stroke drew every year's step
      series: d.series.map((s, k) => stepBand(s.name, d.years, cum[k], cum[k + 1], { fill: seriesColor(t, s, k) }))
        // invisible carrier for the axis tooltip and the rehearsal marks
        .concat([Object.assign({ type: 'line', data: yearData(d.years, cum[cum.length - 1]), showSymbol: false, lineStyle: { opacity: 0 }, z: 3 }, markLayers(t, d.marks, false))]),
    }), o.label || `Balances by type, stacked: total ${money(total(0))} in ${y0}, ${money(total(n - 1))} in ${d.years[n - 1]}`,
    { caption: o.label || 'Balances by type', columns: yearCols(d.ages).concat(d.series.map(s => s.name), ['Total']),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat(d.series.map(s => money(s.values[i])), [money(total(i))])) });
  };

  // The income score. {years, ages:[[..],[..]], ageSlots?, staves:[{name, values, slot, pending?}], marks}
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
      S.forEach((s, i) => { rich['k' + i] = { width: 4, height: 14, backgroundColor: slotColor(t, s.slot || i + 1) }; });
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
              const i = params.dataIndex, vals = S[i].values, col = slotColor(t, S[i].slot || i + 1);
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
                const inside = th(v) >= 15;
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
        grid: { left: 8, right: endW, top: 6 + markRoom(t, d.marks), bottom: 0, containLabel: true },
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
        k ? {} : markLayers(t, d.marks, false))),
      };
    }, o.label || 'Lines by year: ' + d.series.map(s => `${s.name} ${money(s.values[0])} in ${y0}, ${money(last(s))} in ${d.years[n - 1]}`).join('; '),
    { caption: o.label || 'Lines by year', columns: yearCols(d.ages).concat(d.series.map(s => s.name)),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat(d.series.map(s => money(s.values[i])))) });
  };
  const wrapName = (name, n) => { const out = []; String(name).split(' ').forEach(w => { const l = out.length - 1; if (l >= 0 && (out[l] + ' ' + w).length <= n) out[l] += ' ' + w; else out.push(w); }); return out.join('}\n{n|'); };

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
