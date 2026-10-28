/*! coder999/dataviz v0.1.1 · "Full Score" ECharts builders · MIT
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

  const DV = { version: '0.1.1', fmt: { money, pct } };
  if (typeof module === 'object' && module.exports) module.exports = DV;
  if (typeof document === 'undefined') return; // Node: formatters only

  /* ---------- theme ---------- */
  const TOKENS = ['ground', 'plate', 'ink', 'ink-2', 'ink-3', 'rule', 'rule-soft', 'staff', 'mark-line',
    'accent', 'accent-2', 'on-accent', 'accent-wash', 'on-entity', 'font-display', 'font-fig', 'font-ui'];
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
    t.surface = surfaceOf(el, t.ground);
    t.width = el.clientWidth || 600;
    t.small = t.width < 560;
    return t;
  }
  const slotColor = (t, slot) => t.entity[((slot || 1) - 1) % 6];
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

  function markLayers(t, list, compact, pos) {
    if (!list || !list.length) return {};
    list.forEach(m => known.set(m.mark, m));
    const act = marks.active, ev = list.find(m => m.mark === act);
    return {
      markLine: {
        symbol: 'none', animation: false, emphasis: { disabled: true },
        label: { show: true, position: pos || 'end', formatter: '{b}', fontFamily: t.fontUi, fontWeight: 700, fontSize: compact ? 10 : 12,
          borderColor: t.accent, borderWidth: 1.5, padding: compact ? [3, 4, 2, 4] : [4, 6, 3, 6] },
        data: list.map((m, j) => {
          const on = m.mark === act;
          return { name: m.mark, xAxis: m.year,
            lineStyle: { color: on ? t.accent : t.markLine, width: on ? 1.5 : 1, type: on ? 'solid' : [2, 3] },
            label: { distance: t.small && j % 2 ? (compact ? 17 : 21) : 3, backgroundColor: on ? t.accent : t.surface, color: on ? t.onAccent : t.accent } };
        }),
      },
      markArea: ev ? { silent: true, itemStyle: { color: alpha(t.accent, 0.1) }, data: [[{ xAxis: ev.year }, { xAxis: ev.year + 1 }]] } : { data: [] },
    };
  }
  const markRoom = (t, list) => (list && list.length ? (t.small ? 46 : 30) : 10);

  /* ---------- shared axes / tooltip ---------- */
  function tip(t) {
    return { trigger: 'axis', confine: true, className: 'dv-tt', backgroundColor: t.plate, borderColor: t.rule, borderWidth: 1, padding: [8, 10],
      textStyle: { color: t.ink, fontFamily: t.fontUi, fontSize: 12 }, extraCssText: 'box-shadow:none;border-radius:2px',
      axisPointer: { type: 'line', lineStyle: { color: t.ink, width: 1 } } };
  }
  const ttRow = (slot, name, val) => `<div class="dv-tt-row"><i class="dv-tt-key dv-slot-${slot}"></i>${esc(name)}<span class="dv-num">${val}</span></div>`;
  const agesAt = (ages, i) => (ages ? ages.map(a => a[i]).filter(a => a != null).join(' · ') : '');
  const ttHead = (y, ages, i) => `<b class="dv-num">${y}</b>${ages ? ' · ages <span class="dv-num">' + agesAt(ages, i) + '</span>' : ''}`;
  const yearOf = ps => Math.floor((Array.isArray(ps) ? ps[0] : ps).axisValue);

  // Year value-axis: one band per year [y, y+1), labels every 1/2/5/10/20 years, ages beneath
  function yearAxis(t, years, ages, plotW) {
    const y0 = years[0], y1 = years[years.length - 1];
    const perYear = (plotW || t.width) / years.length, need = ages ? (t.small ? 44 : 54) : 40;
    const step = [1, 2, 5, 10, 20, 25, 50].find(s => s * perYear >= need) || 50;
    const ticks = [];
    for (let y = Math.ceil((y0 + 1) / step) * step; y <= y1; y += step) ticks.push(y);
    const rich = { y: { color: t.ink, fontSize: 11.5, fontWeight: 500, fontFamily: t.fontUi }, d: { color: t.ink3, fontSize: 10.5 } };
    (ages || []).forEach((_, k) => { rich['a' + k] = { color: slotColor(t, k + 1), fontSize: 10.5, fontWeight: 600, fontFamily: t.fontUi }; });
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
      xAxis: yearAxis(t, d.years, d.ages, t.width - 48),
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
        xAxis: yearAxis(t, d.years, d.ages, t.width - 60),
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
        return ttHead(y, d.ages, i) + d.series.slice().reverse().map(s => ttRow(s.slot || 1, s.name, money(s.values[i]))).join('') +
          `<div class="dv-tt-row">Total<span class="dv-num">${money(total(i))}</span></div>`; } }),
      xAxis: yearAxis(t, d.years, d.ages, t.width - 60),
      yAxis: moneyAxis(t),
      series: d.series.map((s, k) => stepBand(s.name, d.years, cum[k], cum[k + 1], { fill: slotColor(t, s.slot || k + 1), stroke: t.surface, lineWidth: 1 }))
        // invisible carrier for the axis tooltip and the rehearsal marks
        .concat([Object.assign({ type: 'line', data: yearData(d.years, cum[cum.length - 1]), showSymbol: false, lineStyle: { opacity: 0 }, z: 3 }, markLayers(t, d.marks, false))]),
    }), o.label || `Balances by type, stacked: total ${money(total(0))} in ${y0}, ${money(total(n - 1))} in ${d.years[n - 1]}`,
    { caption: o.label || 'Balances by type', columns: yearCols(d.ages).concat(d.series.map(s => s.name), ['Total']),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat(d.series.map(s => money(s.values[i])), [money(total(i))])) });
  };

  // The income score. {years, ages:[[..],[..]], staves:[{name, values, slot, pending?}], marks}
  // One staff per source; band thickness = amount; shared year axis with ages under each year.
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
      const sm = t.small, labelW = sm ? 104 : Math.min(200, Math.round(t.width * 0.2));
      const rich = { s: { color: t.ink, fontFamily: t.fontUi, fontSize: sm ? 11.5 : 13, lineHeight: 15, padding: [0, 0, 0, 8] } };
      S.forEach((s, i) => { rich['k' + i] = { width: 4, height: 14, backgroundColor: slotColor(t, s.slot || i + 1) }; });
      return {
        grid: { left: labelW, right: sm ? 6 : 12, top: markRoom(t, d.marks), bottom: d.ages ? 40 : 26 },
        tooltip: Object.assign(tip(t), { formatter: ps => { const y = yearOf(ps), i = y - y0; if (i < 0 || i >= d.years.length) return '';
          return ttHead(y, d.ages, i) + S.map((s, k) => [s, k]).filter(([s]) => s.values[i] > 0 || pend(s, y))
            .map(([s, k]) => ttRow(s.slot || k + 1, s.name, s.values[i] > 0 ? money(s.values[i]) : esc(pendLabel(s)))).join(''); } }),
        xAxis: yearAxis(t, d.years, d.ages, t.width - labelW - 12),
        yAxis: { type: 'category', inverse: true, data: S.map((_, i) => String(i)), axisLine: { show: false }, axisTick: { show: false },
          splitLine: { show: true, lineStyle: { color: t.ruleSoft } },
          axisLabel: { align: 'left', margin: labelW - 2, rich, formatter: (v, i) => {
            // narrow: "Owner · Source" wraps after the owner
            const parts = sm ? S[i].name.split(' · ') : [S[i].name];
            return `{k${i}|}{s|${parts[0]}}` + (parts[1] ? `\n{s|${parts.slice(1).join(' · ')}}` : '');
          } } },
        series: [
          { type: 'custom', silent: true, z: 2, data: S.map((_, i) => [y0, i]), encode: { x: 0, y: 1 },
            renderItem(params, api) {
              const i = params.dataIndex, vals = S[i].values, col = slotColor(t, S[i].slot || i + 1);
              const cy = api.coord([y0, i])[1], maxH = api.size([0, 1])[1] * 0.8;
              const th = v => (v <= 0 ? 0 : Math.max(2, v / MAX * maxH)), x = y => api.coord([y, i])[0];
              const top = [], bot = [];
              vals.forEach((v, k) => { const h = th(v) / 2, a = x(y0 + k), b = x(y0 + k + 1); top.push([a, cy - h], [b, cy - h]); bot.push([a, cy + h], [b, cy + h]); });
              const kids = [
                { type: 'line', shape: { x1: x(y0), y1: cy, x2: x(y1 + 1), y2: cy }, style: { stroke: t.staff, lineWidth: 1 } },
                { type: 'polygon', shape: { points: top.concat(bot.reverse()) }, style: { fill: col } },
              ];
              // label each run where the amount steps (>1% of the score's max)
              const starts = vals.map((v, k) => (v > 0 && (k === 0 || Math.abs(v - vals[k - 1]) > MAX * 0.01) ? k : -1)).filter(k => k >= 0);
              starts.forEach((k, j) => {
                const v = vals[k], txt = money(v), w = txt.length * 6.6 + 8, x0 = x(y0 + k);
                const room = (j + 1 < starts.length ? x(y0 + starts[j + 1]) : x(y1 + 1)) - x0;
                if (room < w) return;
                const inside = th(v) >= 15;
                kids.push({ type: 'text', style: { text: txt, x: x0 + 5, y: inside ? cy : cy - th(v) / 2 - 3, verticalAlign: inside ? 'middle' : 'bottom',
                  fill: inside ? t.onEntity : t.ink, font: `600 11px ${t.fontUi}` } });
              });
              const p = S[i].pending;
              if (p) {
                const a = x(Math.max(y0, p.from)), b = x((p.to == null ? y1 : Math.min(y1, p.to)) + 1);
                kids.push({ type: 'line', shape: { x1: a, y1: cy, x2: b, y2: cy }, style: { stroke: col, lineWidth: 1.5 } },
                  { type: 'text', style: { text: pendLabel(S[i]), x: a + 5, y: cy - 4, verticalAlign: 'bottom', fill: t.ink2, font: `500 11px ${t.fontUi}` } });
              }
              return { type: 'group', children: kids };
            } },
          // invisible carrier for the axis tooltip and the rehearsal marks
          Object.assign({ type: 'line', data: d.years.map(y => [y + 0.5, 0]), showSymbol: false, lineStyle: { opacity: 0 }, z: 3 }, markLayers(t, d.marks, false, 'start')),
        ],
      };
    }, o.label || `Income score, ${y0} to ${y1}. ` + S.map(s => `${s.name}: ${runsText(d.years, s.values)}` +
      (s.pending ? `; ${pendLabel(s)} from ${s.pending.from}` : '')).join('. '),
    { caption: o.label || `Income by source, ${y0} to ${y1}`, columns: yearCols(d.ages).concat(S.map(s => s.name)),
      rows: d.years.map((y, i) => yearRow(d.years, d.ages, i).concat(S.map(s => cellText(s, i)))) });
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
