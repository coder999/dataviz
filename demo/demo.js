// Demo wiring. Everything chart-shaped is DV; this file only maps the demo data onto it.
(function () {
  const D = window.DEMO, money = DV.fmt.money, pct = DV.fmt.pct;
  const ageA = y => y - 1979, ageS = y => y - 1982;
  const ages = [D.years.map(ageA), D.years.map(ageS)];

  // theme switch: data-theme on <html>; DV re-renders charts on its own
  const themeBtns = document.querySelectorAll('[data-theme-set]');
  function setTheme(v) {
    if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
    themeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === (v || ''))));
  }
  themeBtns.forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  setTheme(new URLSearchParams(location.search).get('theme') || '');

  // life-event buttons: data-dv-mark makes them DV.marks toggles with no extra code
  document.getElementById('events').innerHTML = D.events.map(e =>
    `<button class="ev" type="button" data-dv-mark="${e.mark}" aria-pressed="false"><span class="dv-rm">${e.mark}</span>` +
    `<span class="y dv-num">${e.year}</span><span class="ages">Alex ${ageA(e.year)} · Sam ${ageS(e.year)}</span><span class="l">${e.label}</span></button>`).join('');

  const readout = document.getElementById('readout');
  document.addEventListener('dv:mark', ev => {
    const { mark, year, label } = ev.detail;
    if (!mark) { readout.textContent = 'No mark selected. Choose A–F to read one year across every chart.'; return; }
    const i = year - D.startYear;
    readout.innerHTML = `<b>${mark} · ${year}</b> · ${label} · median balance <b class="dv-num">${money(D.fan.p50[i])}</b> · money lasts in <b class="dv-num">${pct(D.survival[i].pct)}</b> of paths`;
  });

  const nwDelta = D.netWorth - D.prevNetWorth;
  document.getElementById('nw').innerHTML = `${money(D.netWorth)} <small>${money(nwDelta, { sign: true })} since last update</small>`;

  DV.survivalStrip('#c-surv', { years: D.years, pct: D.survival.map(s => s.pct), marks: D.events, ages });
  DV.history('#c-hist', D.history);
  DV.score('#c-score', { years: D.years, ages, marks: D.events, staves: [
    { name: 'Alex · Salary', values: D.income.alexSalary, slot: 1 },
    { name: 'Sam · Salary', values: D.income.samSalary, slot: 2 },
    { name: 'Alex · Pension', values: D.income.pension, slot: 1 },
    { name: 'Alex · Social Security', values: D.income.ssAlex, slot: 1 },
    { name: 'Sam · Social Security', values: D.income.ssSam, slot: 2 },
    { name: 'Joint · Withdrawals', values: D.income.withdrawals, slot: 3 },
  ] });
  DV.fan('#c-fan', Object.assign({ years: D.years, marks: D.events, ages }, D.fan));
  DV.stacked('#c-stk', { years: D.years, marks: D.events, series: [
    { name: 'Pre-tax', values: D.balances.pretax, tint: 1 },
    { name: 'Roth', values: D.balances.roth, tint: 2 },
    { name: 'Taxable', values: D.balances.taxable, tint: 3 },
    { name: 'Cash', values: D.balances.cash, tint: 4 },
  ] });
  DV.lines('#c-lines', { years: D.years, ages, marks: D.events, yTicks: 3, series: [
    { name: 'Plan', values: D.fan.p50, tint: 1 }, { name: 'Retire two years later', values: D.fan.p75, tint: 3 }, { name: 'Spend more', values: D.fan.p25, tint: 5 }] });
  const hub = 'This year’s money';
  DV.sankey('#c-sk', { nodes: [{ name: hub, tint: 5 }, { name: 'Alex · Pension', slot: 1 }, { name: 'Sam · Salary', slot: 2 },
    { name: 'Alex · Social Security', slot: 1 }, { name: 'Pre-tax withdrawals', tint: 1 }, { name: 'Employer match', tint: 1 }, { name: '529 withdrawals', tint: 5 }, { name: 'Taxes', tint: 2 },
    { name: 'Spending', tint: 3 }, { name: 'Saved', tint: 1 }], links: [
    { source: 'Alex · Pension', target: hub, value: 52000 }, { source: 'Sam · Salary', target: hub, value: 168000 },
    { source: 'Alex · Social Security', target: hub, value: 14000 }, { source: 'Pre-tax withdrawals', target: hub, value: 40000 },
    { source: 'Employer match', target: hub, value: 9000 }, { source: '529 withdrawals', target: hub, value: 6000 },
    { source: hub, target: 'Taxes', value: 62000 }, { source: hub, target: 'Spending', value: 190000 }, { source: hub, target: 'Saved', value: 37000 }] });
  DV.marks.set('B');
})();
