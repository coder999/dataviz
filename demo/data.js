// SYNTHETIC household for design mockups only. Every figure is invented.
// Demo data for coder999/dataviz. People, employer, balances and events are fictional.
window.DEMO = (() => {
  const startYear = 2026, endYear = 2076; // younger spouse (Sam, b. 1982) reaches 95 in 2076
  const people = [
    { id: 'alex', name: 'Alex', born: 1979, color: 'p1' },
    { id: 'sam', name: 'Sam', born: 1982, color: 'p2' },
  ];
  const accounts = [
    { id: 'a401a', owner: 'alex', name: 'Employer 401(a)', type: 'pretax', balance: 412300, prev: 398150 },
    { id: 'a403b', owner: 'alex', name: 'Employer 403(b)', type: 'pretax', balance: 388940, prev: 371020 },
    { id: 'a457b', owner: 'alex', name: 'Employer 457(b)', type: 'pretax', balance: 296410, prev: 281700 },
    { id: 'p401k', owner: 'sam', name: 'Sam 401(k)', type: 'pretax', balance: 341880, prev: 329400 },
    { id: 'roth', owner: 'joint', name: 'Roth IRAs', type: 'roth', balance: 188250, prev: 180960 },
    { id: 'hsa', owner: 'joint', name: 'HSA', type: 'hsa', balance: 61420, prev: 57900 },
    { id: 'brok', owner: 'joint', name: 'Brokerage', type: 'taxable', balance: 264700, prev: 259300 },
    { id: 'cash', owner: 'joint', name: 'Savings', type: 'cash', balance: 72150, prev: 80400 },
    { id: 'c529', owner: 'joint', name: '529 plans', type: '529', balance: 96300, prev: 92800 },
    { id: 'home', owner: 'joint', name: 'Home', type: 'property', balance: 1050000, prev: 1035000 },
    { id: 'mort', owner: 'joint', name: 'Mortgage', type: 'debt', balance: -412600, prev: -419200 },
  ];
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);
  const prevNetWorth = accounts.reduce((s, a) => s + a.prev, 0);
  const lastUpdate = '2026-10-01', prevUpdate = '2026-07-01';

  // Quarterly history, 2019 Q1 .. 2026 Q4 (with a 2020 dip and a 2022 drawdown)
  const history = [];
  for (let i = 0, nw = 690000; i < 32; i++) {
    const y = 2019 + Math.floor(i / 4), q = (i % 4) + 1;
    const shock = (y === 2020 && q === 1) ? -0.11 : (y === 2022 && q <= 3) ? -0.045 : 0;
    nw = nw * (1 + 0.041 + shock + Math.sin(i * 1.7) * 0.012) + 9000;
    history.push({ date: `${y}-${String(q * 3).padStart(2, '0')}-01`, label: `${y} Q${q}`, value: Math.round(i === 31 ? netWorth : nw) });
  }

  // Life events, lettered like rehearsal marks / stations / controls
  const events = [
    { mark: 'A', year: 2030, label: 'Kid 1 starts college' },
    { mark: 'B', year: 2036, label: 'Alex retires at 57 · pension starts' },
    { mark: 'C', year: 2040, label: 'Sam retires at 58' },
    { mark: 'D', year: 2042, label: 'Downsize home' },
    { mark: 'E', year: 2045, label: 'Alex claims Social Security at 66' },
    { mark: 'F', year: 2048, label: 'Sam claims Social Security at 66' },
  ];

  // Deterministic projection, real 2026 dollars
  const years = [], income = { alexSalary: [], samSalary: [], pension: [], ssAlex: [], ssSam: [], withdrawals: [] };
  const balances = { pretax: [], roth: [], taxable: [], cash: [] };
  const fan = { p5: [], p25: [], p50: [], p75: [], p95: [] };
  let pre = 1439530, roth = 188250, tax = 264700, cash = 72150;
  for (let y = startYear; y <= endYear; y++) {
    const t = y - startYear;
    years.push(y);
    const ms = y < 2036 ? 355000 : 0, ps = y < 2040 ? 142000 : 0;
    const pen = y >= 2036 ? 66400 : 0, ssm = y >= 2045 ? 14200 : 0, ssp = y >= 2048 ? 38900 : 0;
    const spend = (y < 2036 ? 228000 : 236000) + (y >= 2030 && y < 2036 ? 34000 : 0);
    const gap = Math.max(0, spend + (ms + ps) * 0.31 - ms - ps - pen - ssm - ssp);
    income.alexSalary.push(ms); income.samSalary.push(ps); income.pension.push(pen);
    income.ssAlex.push(ssm); income.ssSam.push(ssp); income.withdrawals.push(Math.round(gap));
    const g = 0.028, save = y < 2036 ? 96000 : y < 2040 ? 24000 : 0;
    pre = pre * (1 + g) + save * 0.7 - gap * 0.62;
    roth = roth * (1 + g) + save * 0.15 - gap * 0.08;
    tax = tax * (1 + g * 0.9) + save * 0.15 - gap * 0.3 + (y === 2042 ? 420000 : 0);
    cash = 72150;
    [pre, roth, tax] = [pre, roth, tax].map(v => Math.max(0, v));
    balances.pretax.push(Math.round(pre)); balances.roth.push(Math.round(roth));
    balances.taxable.push(Math.round(tax)); balances.cash.push(cash);
    const mid = pre + roth + tax + cash, spread = 0.055 * Math.sqrt(t + 1);
    fan.p50.push(Math.round(mid));
    fan.p25.push(Math.round(mid * Math.exp(-0.674 * spread * 1.6)));
    fan.p75.push(Math.round(mid * Math.exp(0.674 * spread * 1.6)));
    fan.p5.push(Math.round(Math.max(0, mid * Math.exp(-1.645 * spread * 2.3) - t * 21000)));
    fan.p95.push(Math.round(mid * Math.exp(1.645 * spread * 1.6)));
  }
  // Probability the money lasts to each age of the younger spouse (Monte Carlo survival curve)
  const survival = years.map((y, i) => ({ year: y, age: y - 1982, pct: i < 32 ? 100 : Math.round(100 - Math.pow((i - 31) / 19, 2.2) * 13) }));

  const verdict = {
    successPct: 87, se: 0.6, horizonAge: 95, horizonPerson: 'Sam', paths: 10000,
    medianEnding: 3560000, p5Ending: 0, medianDepletionAge: 89,
    changeSinceLast: +2, // points vs. last update
  };
  // Sensitivity: success % at low / base / high of each assumption
  const sensitivity = [
    { name: 'Retirement spending', low: '$150k', high: '$195k', atLow: 94, atHigh: 74 },
    { name: 'Real stock return', low: '3.0%', high: '6.0%', atLow: 71, atHigh: 96 },
    { name: 'Alex retires at', low: '56', high: '60', atLow: 79, atHigh: 93 },
    { name: 'Inflation', low: '2.0%', high: '3.5%', atLow: 90, atHigh: 81 },
    { name: 'Sam claims SS at', low: '62', high: '70', atLow: 84, atHigh: 89 },
    { name: 'Social Security cut', low: '0%', high: '23%', atLow: 87, atHigh: 82 },
  ];
  const scenarios = [
    { id: 'base', name: 'Current plan', successPct: 87 },
    { id: 'early', name: 'Alex retires at 56', successPct: 79 },
    { id: 'late', name: 'Both work 2 more years', successPct: 95 },
  ];
  return { synthetic: true, startYear, endYear, people, accounts, netWorth, prevNetWorth, lastUpdate, prevUpdate,
           history, events, years, income, balances, fan, survival, verdict, sensitivity, scenarios };
})();
